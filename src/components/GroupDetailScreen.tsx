import { useState, useEffect, type FC } from 'react';
import { ArrowLeft, Users, Upload, Check, X as XIcon, AlertCircle, Loader2, Download, BookOpen, Globe, Lock, UserCheck, UserPlus, Trash2 } from 'lucide-react';
import { getGroup, listMembers, getPendingApprovals, approveMember, rejectMember, removeMember, listGroupDecks, incrementGroupDeckDownload, deleteGroupDeck, type Group, type GroupMember, type GroupDeck } from '../lib/groups';
import type { SharedDeckCard } from '../lib/community';

interface GroupDetailScreenProps {
  groupId: string;
  userId: string | undefined;
  onGoBack: () => void;
  onImportDeck: (title: string, description: string, cards: { front: string; back: string; tag: string }[]) => Promise<string | null>;
  onShowUpload: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

export const GroupDetailScreen: FC<GroupDetailScreenProps> = ({ groupId, userId, onGoBack, onImportDeck, onShowUpload, onDeleteGroup }) => {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pending, setPending] = useState<GroupMember[]>([]);
  const [decks, setDecks] = useState<GroupDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  const isAdmin = members.find(m => m.userId === userId)?.role === 'admin';
  const isApproved = members.some(m => m.userId === userId && m.status === 'approved');

  useEffect(() => {
    void (async () => {
      const [gRes, mRes, pRes, dRes] = await Promise.all([
        getGroup(groupId),
        listMembers(groupId),
        getPendingApprovals(groupId),
        listGroupDecks(groupId),
      ]);
      if (gRes.success && gRes.data) setGroup(gRes.data);
      if (mRes.success && mRes.data) setMembers(mRes.data);
      if (pRes.success && pRes.data) setPending(pRes.data);
      if (dRes.success && dRes.data) setDecks(dRes.data);
      setLoading(false);
    })();
  }, [groupId]);

  const handleApprove = async (memberId: string) => {
    await approveMember(memberId);
    setPending(prev => prev.filter(m => m.id !== memberId));
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'approved' } : m));
  };

  const handleReject = async (memberId: string) => {
    await rejectMember(memberId);
    setPending(prev => prev.filter(m => m.id !== memberId));
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    await removeMember(memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleImport = async (deck: GroupDeck) => {
    setImportingId(deck.id);
    const newId = await onImportDeck(
      deck.title,
      deck.description,
      deck.cards.map(c => ({ front: c.front, back: c.back, tag: c.tag || 'General' })),
    );
    if (newId) incrementGroupDeckDownload(deck.id);
    setImportingId(null);
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck from the group? This cannot be undone.')) return;
    await deleteGroupDeck(deckId);
    setDecks(prev => prev.filter(d => d.id !== deckId));
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Delete this entire group? All members, decks, and data will be permanently removed. This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? This action cannot be reversed.')) return;
    onDeleteGroup?.(groupId);
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this group? You will need a new invite to rejoin.')) return;
    const myMember = members.find(m => m.userId === userId);
    if (!myMember) return;
    await removeMember(myMember.id);
    onGoBack();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 animate-fade-in"><Loader2 size={24} className="text-[#E3B341] animate-spin" /></div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={onGoBack} className="flex items-center space-x-1 text-[11px] font-mono text-[#8B949E] hover:text-white transition-colors"><ArrowLeft size={14} /><span>Back</span></button>
        <div className="flex flex-col items-center py-12 border border-dashed border-[#2D333B] rounded"><AlertCircle size={24} className="text-[#F85149]" /><p className="text-xs font-mono text-[#8B949E] mt-2">Group not found</p></div>
      </div>
    );
  }

  const approvedMembers = members.filter(m => m.status === 'approved');

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={onGoBack} className="flex items-center space-x-1 text-[11px] font-mono text-[#8B949E] hover:text-white transition-colors"><ArrowLeft size={14} /><span>Back</span></button>

      {/* Group header */}
      <div className="rounded border border-[#2D333B] bg-[#161B22] p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white font-mono">{group.name}</h2>
            <p className="text-[11px] text-[#8B949E]">{group.description}</p>
          </div>
          {isAdmin && (
            <span className="px-1.5 py-0.5 text-[8px] font-mono bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20 rounded uppercase tracking-wider">Admin</span>
          )}
          {isAdmin && (
            <button onClick={handleDeleteGroup} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono text-[#F85149]/60 hover:text-[#F85149] hover:bg-[#F85149]/10 transition-colors cursor-pointer" title="Delete group">
              <Trash2 size={11} /> Delete group
            </button>
          )}
        </div>
        <div className="flex items-center space-x-3 text-[10px] font-mono text-[#8B949E]">
          <span className="flex items-center space-x-1 px-2 py-0.5 bg-[#3FB950]/10 border border-[#3FB950]/20 rounded text-[#3FB950] font-bold">
            <Users size={11} /><span>{approvedMembers.length} active</span>
          </span>
          <span>Code: {group.inviteCode}</span>
        </div>
      </div>

      {/* Pending approvals (admin only) */}
      {isAdmin && pending.length > 0 && (
        <div className="rounded border border-[#E3B341]/30 bg-[#E3B341]/5 p-3 space-y-2">
          <h3 className="text-[10px] font-bold tracking-widest text-[#E3B341] font-mono uppercase">Pending Requests ({pending.length})</h3>
          <div className="space-y-1.5">
            {pending.map(m => (
              <div key={m.id} className="flex items-center justify-between px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded">
                <div>
                  <p className="text-xs font-mono text-white">{m.displayName}</p>
                  <p className="text-[9px] font-mono text-[#8B949E]">{m.email}</p>
                </div>
                <div className="flex items-center space-x-1">
                  <button onClick={() => handleApprove(m.id)} className="flex items-center justify-center min-w-[32px] min-h-[32px] rounded text-[#3FB950] hover:bg-[#3FB950]/10 transition-colors" title="Approve"><Check size={14} /></button>
                  <button onClick={() => handleReject(m.id)} className="flex items-center justify-center min-w-[32px] min-h-[32px] rounded text-[#F85149] hover:bg-[#F85149]/10 transition-colors" title="Reject"><XIcon size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share deck button */}
      {isApproved && (
        <button onClick={() => onShowUpload(groupId)} className="flex items-center justify-center space-x-1.5 w-full px-3 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold tracking-wider rounded transition-colors">
          <Upload size={12} /><span>Share a Deck to this Group</span>
        </button>
      )}

      {/* Group decks */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold tracking-widest text-[#8B949E] font-mono uppercase border-b border-[#2D333B] pb-1">Group Decks ({decks.length})</h3>

        {decks.length === 0 ? (
          <p className="text-[11px] font-mono text-[#8B949E] py-4 text-center">No decks shared yet</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {decks.map(d => (
              <div key={d.id} className="p-3 rounded border border-[#2D333B] bg-[#161B22] space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <h4 className="text-xs font-bold text-white font-mono truncate">{d.title}</h4>
                      {d.visibility === 'public' ? <Globe size={10} className="text-[#58A6FF] shrink-0" /> : <Lock size={10} className="text-[#8B949E] shrink-0" />}
                    </div>
                    <p className="text-[10px] text-[#8B949E] truncate">{d.description}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleDeleteDeck(d.id)} className="text-[#8B949E] hover:text-[#F85149] p-1 rounded hover:bg-[#F85149]/10 transition-colors shrink-0 ml-1"><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-[9px] font-mono text-[#8B949E]">
                    <span className="flex items-center space-x-0.5"><BookOpen size={9} /><span>{d.cards.length} cards</span></span>
                    <span className="flex items-center space-x-0.5"><Download size={9} /><span>{d.downloads} imports</span></span>
                    <span>by {d.authorName}</span>
                  </div>
                  <button onClick={() => handleImport(d)} disabled={importingId === d.id} className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-[#21262D] hover:bg-[#30363D] text-white border border-[#30363D] transition-colors disabled:opacity-50">
                    {importingId === d.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                    <span>Import</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold tracking-widest text-[#8B949E] font-mono uppercase border-b border-[#2D333B] pb-1">Members ({approvedMembers.length})</h3>
        <div className="space-y-1">
          {approvedMembers.map(m => (
            <div key={m.id} className="flex items-center justify-between px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded">
              <div className="flex items-center space-x-2">
                <span className="relative flex-shrink-0">
                  <span className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#8B949E]">{m.displayName.charAt(0).toUpperCase()}</span>
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#3FB950] rounded-full border-2 border-[#0D1117]" />
                </span>
                <div>
                  <p className="text-xs font-mono text-white">{m.displayName}</p>
                  <p className="text-[9px] font-mono text-[#8B949E]">{m.role === 'admin' ? 'Admin' : 'Member'}</p>
                </div>
              </div>
              {isAdmin && m.userId !== userId && m.role !== 'admin' && (
                <button onClick={() => handleRemove(m.id)} className="text-[#8B949E] hover:text-[#F85149] p-1 rounded hover:bg-[#F85149]/10 transition-colors" title="Remove member"><XIcon size={12} /></button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leave group */}
      {!isAdmin && isApproved && (
        <button onClick={handleLeaveGroup} className="flex items-center justify-center space-x-1.5 w-full px-3 py-2 rounded border border-[#F85149]/30 text-[#F85149]/80 hover:bg-[#F85149]/10 hover:text-[#F85149] text-[11px] font-mono transition-colors cursor-pointer">
          <Trash2 size={12} /><span>Leave group</span>
        </button>
      )}

      {error && <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>}
    </div>
  );
};
