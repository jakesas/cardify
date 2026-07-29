import { useState, useEffect, type FC } from 'react';
import { Loader2, AlertCircle, Check, BookOpen, Download, X, Tag, User, Layers } from 'lucide-react';
import { getSharedDeck, incrementDownload, type SharedDeck } from '../lib/community';

interface ImportLinkScreenProps {
  deckShareId: string;
  onImportDeck: (title: string, description: string, cards: { front: string; back: string; tag: string }[]) => Promise<string | null>;
  onDismiss: () => void;
}

export const ImportLinkScreen: FC<ImportLinkScreenProps> = ({
  deckShareId,
  onImportDeck,
  onDismiss,
}) => {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [deck, setDeck] = useState<SharedDeck | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const result = await getSharedDeck(deckShareId);
        if (!result.success || !result.data) {
          setError(result.error || 'Could not find the shared deck. The link may be invalid or expired.');
          return;
        }
        setDeck(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared deck.');
      } finally {
        setLoading(false);
      }
    })();
  }, [deckShareId]);

  const handleImport = async () => {
    if (!deck) return;
    setImporting(true);
    try {
      const newDeckId = await onImportDeck(
        deck.title,
        deck.description,
        deck.cards.map(c => ({
          front: c.front,
          back: c.back,
          tag: c.tag || 'General',
        }))
      );
      if (newDeckId) {
        setDone(true);
        incrementDownload(deckShareId);
      } else {
        setError('Failed to create deck. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg rounded border border-[#2D333B] bg-[#161B22] shadow-2xl overflow-hidden">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 size={28} className="text-[#E3B341] animate-spin" />
            <p className="text-xs font-mono text-[#8B949E]">Loading shared deck...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-5 space-y-4">
            <div className="flex items-center space-x-2 px-3 py-2 bg-[#F85149]/10 border border-[#F85149]/20 rounded">
              <AlertCircle size={14} className="text-[#F85149] shrink-0" />
              <p className="text-[11px] text-[#F85149] font-mono">{error}</p>
            </div>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs font-semibold text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Import success */}
        {done && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
              <div className="flex items-center space-x-2">
                <Check size={14} className="text-[#3FB950]" />
                <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
                  Import Successful
                </h3>
              </div>
              <button onClick={onDismiss} className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col items-center py-6 space-y-2">
              <Check size={36} className="text-[#3FB950]" />
              <p className="text-sm font-bold text-white font-mono">Deck imported!</p>
              <p className="text-[11px] text-[#8B949E] font-mono text-center">
                "{deck?.title}" has been added to your library.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors"
              >
                Start Studying
              </button>
            </div>
          </div>
        )}

        {/* Deck preview */}
        {!loading && !error && !done && deck && (
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
              <div className="flex items-center space-x-2">
                <BookOpen size={14} className="text-[#E3B341]" />
                <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
                  Import Shared Deck
                </h3>
              </div>
              <button
                onClick={onDismiss}
                className="text-[#8B949E] hover:text-white p-1 hover:bg-[#21262D] rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Deck metadata */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-white font-mono">{deck.title}</h2>
                <p className="text-[11px] text-[#8B949E] mt-1 leading-relaxed">
                  {deck.description || 'No description provided.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[#8B949E]">
                <div className="flex items-center space-x-1">
                  <User size={11} />
                  <span>{deck.authorName}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Layers size={11} />
                  <span>{deck.cards.length} cards</span>
                </div>
                {deck.tags && deck.tags.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Tag size={11} />
                    <span>{deck.tags.join(', ')}</span>
                  </div>
                )}
              </div>

              {deck.tags && deck.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {deck.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 text-[9px] font-mono bg-[#21262D] text-[#8B949E] border border-[#30363D] rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Card preview (first 5) */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-mono tracking-wider text-[#8B949E] uppercase">
                Card Preview ({Math.min(deck.cards.length, 5)} of {deck.cards.length})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {deck.cards.slice(0, 5).map((card, i) => (
                  <div
                    key={i}
                    className="px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[11px] font-mono"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-[#E0E0E0] truncate flex-1">{card.front}</span>
                      <span className="text-[#8B949E] ml-2 shrink-0 text-[9px]">{card.tag || 'General'}</span>
                    </div>
                    <div className="text-[#8B949E] truncate mt-0.5">{card.back}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end space-x-2 pt-2 border-t border-[#2D333B]">
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Download size={12} />
                    <span>Import Deck</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
