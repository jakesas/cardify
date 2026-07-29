import { useState, useEffect, type FC } from 'react';
import { Users, Plus, AlertCircle, Loader2, UserCheck, ChevronRight, ArrowLeft } from 'lucide-react';
import { listUserGroups } from '../lib/groups';

interface GroupListScreenProps {
  userId: string | undefined;
  onCreateGroup: () => void;
  onSelectGroup: (groupId: string, groupName: string) => void;
  onGoBack: () => void;
}

export const GroupListScreen: FC<GroupListScreenProps> = ({ userId, onCreateGroup, onSelectGroup, onGoBack }) => {
  const [groups, setGroups] = useState<({ id: string; name: string; description: string; role: string; memberCount: number; inviteCode: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    void (async () => {
      const result = await listUserGroups(userId);
      if (result.success && result.data) {
        setGroups(result.data);
      } else {
        setError(result.error || 'Failed to load groups');
      }
      setLoading(false);
    })();
  }, [userId]);

  if (!userId) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={onGoBack} className="flex items-center space-x-1 text-[11px] font-mono text-[#8B949E] hover:text-white transition-colors"><ArrowLeft size={14} /><span>Back</span></button>
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[#2D333B] rounded bg-[#161B22]/20 space-y-2">
          <Users size={32} className="text-[#8B949E]" />
          <p className="text-xs font-mono text-[#8B949E]">Sign in to create or join study groups</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <button onClick={onGoBack} className="flex items-center space-x-1 text-[11px] font-mono text-[#8B949E] hover:text-white transition-colors"><ArrowLeft size={14} /><span>Back</span></button>
        <button onClick={onCreateGroup} className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-bold tracking-wider rounded transition-colors"><Plus size={12} /><span>Create Group</span></button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#2D333B] pb-1.5">
          <h2 className="text-xs font-bold tracking-widest text-[#8B949E] font-mono">My Study Groups</h2>
          <span className="text-[10px] font-mono text-[#8B949E]">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="text-[#E3B341] animate-spin" /></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[#2D333B] rounded bg-[#161B22]/20 space-y-2">
            <Users size={32} className="text-[#8B949E]" />
            <p className="text-xs font-mono text-[#8B949E]">No groups yet</p>
            <p className="text-[10px] text-[#8B949E] font-mono">Create a group or join one via an invite link</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {groups.map(g => (
              <button key={g.id} onClick={() => onSelectGroup(g.id, g.name)} className="flex items-center justify-between p-3 rounded border border-[#2D333B] bg-[#161B22] hover:border-[#30363D] transition-colors text-left w-full cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white font-mono truncate">{g.name}</span>
                    {g.role === 'admin' && <span className="px-1.5 py-0.5 text-[8px] font-mono bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20 rounded uppercase tracking-wider">Admin</span>}
                  </div>
                  <p className="text-[10px] text-[#8B949E] font-mono mt-0.5 truncate">{g.description}</p>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="flex items-center space-x-0.5 text-[9px] font-mono text-[#8B949E]"><UserCheck size={10} /><span>{g.memberCount} members</span></span>
                    <span className="text-[9px] font-mono text-[#8B949E]">Code: {g.inviteCode}</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[#8B949E] shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}

        {error && <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>}
      </div>
    </div>
  );
};
