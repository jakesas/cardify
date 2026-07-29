import { useState, type FC } from 'react';
import { X, Users, AlertCircle, Loader2, Check, Link as LinkIcon } from 'lucide-react';
import { createGroup } from '../lib/groups';

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export const CreateGroupDialog: FC<CreateGroupDialogProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [group, setGroup] = useState<{ id: string; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Group name is required'); return; }

    setCreating(true);
    setError('');
    const result = await createGroup(name.trim(), description.trim());
    setCreating(false);

    if (result.success && result.data) {
      setGroup({ id: result.data.id, inviteCode: result.data.inviteCode });
    } else {
      setError(result.error || 'Failed to create group');
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/?join=${group!.inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.getElementById('invite-link-input') as HTMLInputElement;
      if (input) { input.select(); document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">

        <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
          <div className="flex items-center space-x-2">
            <Users size={14} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
              {group ? 'Group Created' : 'Create Study Group'}
            </h3>
          </div>
          <button onClick={onClose} className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"><X size={14} /></button>
        </div>

        {!group ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Group Name *</label>
              <input type="text" placeholder="e.g., Section A - CCNA 200-301" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" maxLength={60} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Description</label>
              <textarea placeholder="Who is this group for?" value={description} onChange={e => setDescription(e.target.value)} className="w-full h-20 px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none" maxLength={200} />
            </div>
            {error && <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>}
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors">Cancel</button>
              <button type="submit" disabled={creating} className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors disabled:opacity-50">
                {creating ? <><Loader2 size={12} className="animate-spin" /><span>Creating...</span></> : <span>Create Group</span>}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 px-3 py-2 bg-[#3FB950]/10 border border-[#3FB950]/20 rounded">
              <Check size={14} className="text-[#3FB950] shrink-0" />
              <p className="text-[11px] text-[#3FB950] font-mono">Group created! Share this invite link with your classmates.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase">Invite Link</label>
              <div className="flex items-center space-x-2">
                <input id="invite-link-input" type="text" value={`${window.location.origin}/?join=${group.inviteCode}`} readOnly className="flex-1 px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[11px] font-mono text-[#E0E0E0] truncate outline-none" onClick={e => (e.target as HTMLInputElement).select()} />
                <button onClick={handleCopyLink} className={`flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-[10px] font-bold tracking-wider transition-all cursor-pointer ${copied ? 'bg-[#3FB950] text-white' : 'bg-[#21262D] text-[#8B949E] hover:text-white hover:bg-[#30363D] border border-[#30363D]'}`} title="Copy link">{copied ? <Check size={14} /> : <LinkIcon size={14} />}</button>
              </div>
            </div>

            <p className="text-[9px] font-mono text-[#8B949E] leading-relaxed">
              Share this link with your classmates. When they open it, you'll receive a join request that you can approve or reject from the group detail screen.
            </p>

            <div className="flex justify-end pt-2 border-t border-[#2D333B]">
              <button onClick={() => { onClose(); onCreated(); }} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
