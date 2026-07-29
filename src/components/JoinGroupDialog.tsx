import { useState, useEffect, type FC } from 'react';
import { X, Users, AlertCircle, Loader2, Check, LogIn } from 'lucide-react';
import { getGroupByInviteCode, requestJoinGroup, type Group } from '../lib/groups';

interface JoinGroupDialogProps {
  inviteCode: string;
  onDismiss: () => void;
  onJoined: () => void;
}

export const JoinGroupDialog: FC<JoinGroupDialogProps> = ({ inviteCode, onDismiss, onJoined }) => {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await getGroupByInviteCode(inviteCode);
      if (result.success && result.data) {
        setGroup(result.data);
      } else {
        setError(result.error || 'Invalid invite code');
      }
      setLoading(false);
    })();
  }, [inviteCode]);

  const handleRequestJoin = async () => {
    if (!group) return;
    setRequesting(true);
    const result = await requestJoinGroup(group.id);
    setRequesting(false);
    if (result.success) {
      setDone(true);
      onJoined();
    } else {
      setError(result.error || 'Failed to send request');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">

        <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
          <div className="flex items-center space-x-2">
            <Users size={14} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
              Join Study Group
            </h3>
          </div>
          <button onClick={onDismiss} className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"><X size={14} /></button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 size={28} className="text-[#E3B341] animate-spin" />
            <p className="text-xs font-mono text-[#8B949E]">Looking up group...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center space-y-3 py-4">
            <div className="flex items-center space-x-2 px-3 py-2 bg-[#F85149]/10 border border-[#F85149]/20 rounded w-full">
              <AlertCircle size={14} className="text-[#F85149] shrink-0" />
              <p className="text-[11px] text-[#F85149] font-mono">{error}</p>
            </div>
            <button onClick={onDismiss} className="px-3 py-1.5 text-xs font-semibold text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors">Close</button>
          </div>
        )}

        {!loading && !error && done && (
          <div className="flex flex-col items-center py-6 space-y-3">
            <Check size={36} className="text-[#3FB950]" />
            <p className="text-sm font-bold text-white font-mono">Request Sent!</p>
            <p className="text-[11px] text-[#8B949E] font-mono text-center">
              Your request to join <span className="text-white">{group?.name}</span> has been sent. Wait for the group admin to approve your membership.
            </p>
            <button onClick={onDismiss} className="mt-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors">Done</button>
          </div>
        )}

        {!loading && !error && !done && group && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-white font-mono">{group.name}</h2>
              <p className="text-[11px] text-[#8B949E] leading-relaxed">{group.description}</p>
              <div className="flex items-center space-x-1.5 text-[10px] font-mono text-[#8B949E]">
                <Users size={11} />
                <span>You've been invited to join this study group</span>
              </div>
            </div>

            {error && <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>}

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#2D333B]">
              <button onClick={onDismiss} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors">Cancel</button>
              <button onClick={handleRequestJoin} disabled={requesting} className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors disabled:opacity-50">
                {requesting ? <><Loader2 size={12} className="animate-spin" /><span>Sending...</span></> : <><LogIn size={12} /><span>Request to Join</span></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
