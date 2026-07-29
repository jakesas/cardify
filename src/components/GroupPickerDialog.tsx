import { useState, useEffect, type FC } from 'react';
import { X, Users, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { listUserGroups } from '../lib/groups';

interface GroupPickerDialogProps {
  userId: string | undefined;
  onSelect: (groupId: string) => void;
  onClose: () => void;
}

export const GroupPickerDialog: FC<GroupPickerDialogProps> = ({ userId, onSelect, onClose }) => {
  const [groups, setGroups] = useState<({ id: string; name: string; memberCount: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) { setLoading(false); setError('You must be signed in'); return; }
    void (async () => {
      const result = await listUserGroups(userId);
      if (result.success && result.data) {
        setGroups(result.data.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount })));
      } else {
        setError(result.error || 'Failed to load groups');
      }
      setLoading(false);
    })();
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-sm rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
          <div className="flex items-center space-x-2">
            <Users size={14} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">Share to Group</h3>
          </div>
          <button onClick={onClose} className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"><X size={14} /></button>
        </div>

        <p className="text-[10px] font-mono text-[#8B949E]">Select a study group to share this deck with.</p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={18} className="text-[#E3B341] animate-spin" /></div>
        ) : error ? (
          <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded"><AlertCircle size={12} /><span>{error}</span></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs font-mono text-[#8B949E]">You haven't joined any groups yet.</p>
            <p className="text-[9px] font-mono text-[#8B949E] mt-1">Create or join a group first.</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {groups.map(g => (
              <button key={g.id} onClick={() => onSelect(g.id)} className="flex items-center justify-between w-full px-3 py-2 rounded border border-[#2D333B] bg-[#0D1117] hover:border-[#30363D] transition-colors text-left cursor-pointer">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-white truncate">{g.name}</p>
                  <p className="text-[9px] font-mono text-[#8B949E]">{g.memberCount} members</p>
                </div>
                <ChevronRight size={12} className="text-[#8B949E] shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
