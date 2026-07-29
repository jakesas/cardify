import { useState, useMemo, type FC } from 'react';
import { Card, Deck } from '../types';
import { Search, ExternalLink, FileText, Tags } from 'lucide-react';

interface SearchScreenProps {
  cards: Card[];
  decks: Deck[];
  onNavigateToDeck: (deckId: string) => void;
}

export const SearchScreen: FC<SearchScreenProps> = ({ cards, decks, onNavigateToDeck }) => {
  const [query, setQuery] = useState('');

  const deckMap = useMemo(() => {
    const m = new Map<string, Deck>();
    decks.forEach(d => m.set(d.id, d));
    return m;
  }, [decks]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return cards.filter(c =>
      c.front.toLowerCase().includes(q) ||
      c.back.toLowerCase().includes(q) ||
      c.tag.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }, [cards, query]);

  const totalCards = cards.length;

  return (
    <div className="space-y-4 animate-fade-in font-mono">
      {/* Header */}
      <div className="pb-3 border-b border-[#2D333B]">
        <span className="text-[9px] tracking-widest text-[#8B949E] uppercase font-bold">
          Full-Text Search
        </span>
        <h2 className="text-sm font-bold text-white uppercase mt-0.5">
          Search across {totalCards} cards in {decks.length} decks
        </h2>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B949E]" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search any card front, back, or tag..."
          className="w-full pl-10 pr-4 py-2.5 rounded border border-[#30363D] bg-[#161B22] text-[#E0E0E0] text-sm font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600"
          autoFocus
        />
        {query.trim() && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#8B949E]">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Results */}
      <div className="space-y-1.5">
        {query.trim() === '' ? (
          <div className="text-center py-20 border border-dashed border-[#2D333B] bg-[#161B22]/10 rounded space-y-3">
            <Search size={28} className="text-[#30363D] mx-auto" />
            <p className="text-xs text-[#8B949E] font-bold uppercase tracking-wider">
              Type to search across all decks
            </p>
            <p className="text-[10px] text-[#8B949E] max-w-xs mx-auto">
              Matches card front, back, tag, and ID. Results update as you type.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#2D333B] bg-[#161B22]/10 rounded space-y-2">
            <FileText size={24} className="text-[#30363D] mx-auto" />
            <p className="text-xs text-[#8B949E] font-bold uppercase tracking-wider">No matches found</p>
            <p className="text-[10px] text-[#8B949E]">Try a different search term.</p>
          </div>
        ) : (
          results.map(card => {
            const deckName = deckMap.get(card.deckId)?.name || 'Unknown Deck';
            return (
              <div key={card.id}
                className="p-3 rounded border border-[#2D333B] hover:border-[#30363D] bg-[#161B22] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-grow">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E] font-bold uppercase flex-shrink-0">
                        <Tags size={9} className="inline mr-0.5" />
                        {card.tag}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[#1C2128] border border-[#30363D] text-[#58a6ff] flex-shrink-0">
                        {deckName}
                      </span>
                      <span className="text-[8px] font-mono text-[#8B949E]">
                        EF: {card.easeFactor} R:{card.reps} I:{card.interval}d
                      </span>
                      {card.cardType === 'cloze' && (
                        <span className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#388BFD]/15 text-[#388BFD] border border-[#388BFD]/20">CLZ</span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-white font-mono leading-relaxed">
                      {highlightMatch(card.front, query)}
                    </h4>

                    <p className="text-[11px] text-[#8B949E] line-clamp-2 leading-relaxed whitespace-pre-line font-mono border-t border-[#2D333B] pt-1">
                      {highlightMatch(card.back, query)}
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigateToDeck(card.deckId)}
                    className="flex-shrink-0 p-1.5 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-[#58a6ff] transition-colors border border-[#30363D] cursor-pointer"
                    title="Go to deck"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#E3B341]/25 text-[#E3B341] rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
