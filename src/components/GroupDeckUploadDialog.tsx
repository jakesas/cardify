import { useState, type FC } from 'react';
import { X, Upload, AlertCircle, Loader2, Check, Globe, Lock } from 'lucide-react';
import { uploadGroupDeck } from '../lib/groups';
import type { Card } from '../types';

interface GroupDeckUploadDialogProps {
  groupId: string;
  groupName: string;
  decks: { id: string; name: string }[];
  cards: Card[];
  onClose: () => void;
  onUploaded: () => void;
}

export const GroupDeckUploadDialog: FC<GroupDeckUploadDialogProps> = ({
  groupId, groupName, decks, cards, onClose, onUploaded,
}) => {
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'group' | 'public'>('group');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const deckTitle = title.trim() || (selectedDeckId ? decks.find(d => d.id === selectedDeckId)?.name || 'Untitled Deck' : 'Untitled Deck');
    if (!deckTitle) { setError('Deck title is required'); return; }

    const deckCards = cards.filter(c => !selectedDeckId || c.deckId === selectedDeckId);
    if (deckCards.length === 0) { setError('No cards found to upload'); return; }

    setUploading(true);
    setError('');

    const result = await uploadGroupDeck(
      groupId,
      deckTitle,
      description.trim(),
      deckCards.map(c => ({
        front: c.front,
        back: c.back,
        tag: c.tag,
        cardType: c.cardType,
        codeSnippet: c.codeSnippet,
        topology: c.topology,
      })),
      visibility,
    );

    setUploading(false);
    if (result.success) {
      setDone(true);
      onUploaded();
    } else {
      setError(result.error || 'Failed to upload deck');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">

        <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
          <div className="flex items-center space-x-2">
            <Upload size={14} className="text-[#E3B341]" />
            <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
              {done ? 'Uploaded' : `Share Deck to ${groupName}`}
            </h3>
          </div>
          <button onClick={onClose} className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"><X size={14} /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-6 space-y-3">
            <Check size={36} className="text-[#3FB950]" />
            <p className="text-sm font-bold text-white font-mono">Deck shared to group!</p>
            <button onClick={() => { onClose(); onUploaded(); }} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors">Done</button>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Select Deck</label>
              <select value={selectedDeckId} onChange={e => setSelectedDeckId(e.target.value)} className="w-full px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341]">
                <option value="">-- All cards (combined) --</option>
                {decks.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({cards.filter(c => c.deckId === d.id).length} cards)</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Deck Title</label>
              <input type="text" placeholder="Leave blank to use deck name" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Description</label>
              <textarea placeholder="What topics does this deck cover?" value={description} onChange={e => setDescription(e.target.value)} className="w-full h-16 px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none" maxLength={200} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Visibility</label>
              <div className="flex space-x-3">
                <label className="flex items-center space-x-1.5 px-3 py-2 rounded border cursor-pointer transition-colors bg-[#0D1117] text-[#E0E0E0] hover:border-[#E3B341] text-xs font-mono border-[#30363D]">
                  <input type="radio" name="visibility" checked={visibility === 'group'} onChange={() => setVisibility('group')} className="accent-[#E3B341]" />
                  <Lock size={11} />
                  <span>Group only</span>
                </label>
                <label className="flex items-center space-x-1.5 px-3 py-2 rounded border cursor-pointer transition-colors bg-[#0D1117] text-[#E0E0E0] hover:border-[#E3B341] text-xs font-mono border-[#30363D]">
                  <input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} className="accent-[#E3B341]" />
                  <Globe size={11} />
                  <span>Public</span>
                </label>
              </div>
              <p className="text-[9px] text-[#8B949E] font-mono">
                {visibility === 'group' ? 'Only approved group members can see this deck.' : 'Anyone can see and import this deck.'}
              </p>
            </div>

            {error && <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>}

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#2D333B]">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors">Cancel</button>
              <button type="submit" disabled={uploading} className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors disabled:opacity-50">
                {uploading ? <><Loader2 size={12} className="animate-spin" /><span>Uploading...</span></> : <><Upload size={12} /><span>Share to Group</span></>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
