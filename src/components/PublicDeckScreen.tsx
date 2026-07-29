import { useState, useEffect, type FC } from 'react';
import { Globe, Loader2, AlertCircle, Download, BookOpen, ArrowLeft, User, Search } from 'lucide-react';
import { listPublicDecks, incrementGroupDeckDownload, type GroupDeck } from '../lib/groups';

interface PublicDeckScreenProps {
  onGoBack: () => void;
  onImportDeck: (title: string, description: string, cards: { front: string; back: string; tag: string }[]) => Promise<string | null>;
}

export const PublicDeckScreen: FC<PublicDeckScreenProps> = ({ onGoBack, onImportDeck }) => {
  const [decks, setDecks] = useState<GroupDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await listPublicDecks();
      if (result.success && result.data) {
        setDecks(result.data);
      } else {
        setError(result.error || 'Failed to load public decks');
      }
      setLoading(false);
    })();
  }, []);

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

  const filtered = search.trim()
    ? decks.filter(d =>
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.description.toLowerCase().includes(search.toLowerCase()) ||
        d.authorName.toLowerCase().includes(search.toLowerCase())
      )
    : decks;

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={onGoBack} className="flex items-center space-x-1 text-[11px] font-mono text-[#8B949E] hover:text-white transition-colors"><ArrowLeft size={14} /><span>Back</span></button>

      <div className="rounded border border-[#2D333B] bg-[#161B22] p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Globe size={16} className="text-[#58A6FF]" />
          <h2 className="text-base font-bold text-white font-mono">Public Library</h2>
        </div>
        <p className="text-[11px] text-[#8B949E]">Browse public flashcards shared across all study groups. Anyone can import these decks.</p>

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B949E]" />
          <input type="text" placeholder="Search public decks..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-7 pr-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#58A6FF] placeholder-slate-600" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="text-[#E3B341] animate-spin" /></div>
      ) : error ? (
        <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20"><AlertCircle size={12} /><span>{error}</span></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[#2D333B] rounded bg-[#161B22]/20 space-y-2">
          <Globe size={32} className="text-[#8B949E]" />
          <p className="text-xs font-mono text-[#8B949E]">{search ? 'No matches found' : 'No public decks yet'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map(d => (
            <div key={d.id} className="p-3 rounded border border-[#2D333B] bg-[#161B22] space-y-2 hover:border-[#30363D] transition-colors">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-white font-mono">{d.title}</h4>
                <p className="text-[10px] text-[#8B949E] line-clamp-2">{d.description}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-[9px] font-mono text-[#8B949E]">
                  <span className="flex items-center space-x-0.5"><BookOpen size={9} /><span>{d.cards.length} cards</span></span>
                  <span className="flex items-center space-x-0.5"><User size={9} /><span>{d.authorName}</span></span>
                  <span className="flex items-center space-x-0.5"><Download size={9} /><span>{d.downloads}</span></span>
                </div>
                <button onClick={() => handleImport(d)} disabled={importingId === d.id} className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] transition-colors disabled:opacity-50">
                  {importingId === d.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                  <span>Import</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
