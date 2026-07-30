import { useState, useEffect, type FC } from 'react';
import { listSharedDecks, getSharedDeck, uploadSharedDeck, incrementDownload, deleteSharedDeck, type SharedDeckMeta, type SharedDeck } from '../lib/community';
import { DEMO_DECKS_META, DEMO_DECKS_CARDS } from '../data/demoDecks';
import { Search, Download, Upload, ArrowLeft, Users, BookOpen, Tag, Clock, AlertCircle, Check, Globe, Trash2 } from 'lucide-react';

interface CommunityGalleryScreenProps {
  userId?: string;
  onImportDeck: (title: string, description: string, cards: { front: string; back: string; tag: string }[]) => Promise<string | null>;
}

export const CommunityGalleryScreen: FC<CommunityGalleryScreenProps> = ({ userId, onImportDeck }) => {
  const [firestoreDecks, setFirestoreDecks] = useState<SharedDeckMeta[]>([]);
  const [useFirestore, setUseFirestore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeck, setSelectedDeck] = useState<SharedDeck | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const result = await listSharedDecks();
      if (result.success && result.data) {
        setFirestoreDecks(result.data);
        setUseFirestore(true);
      } else {
        setUseFirestore(false);
      }
      setLoading(false);
    })();
  }, [refreshKey]);

  const allDecks: SharedDeckMeta[] = useFirestore ? firestoreDecks : DEMO_DECKS_META;

  const filtered = allDecks.filter(d =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleViewDeck = async (id: string) => {
    if (useFirestore) {
      const result = await getSharedDeck(id);
      if (result.success && result.data) {
        setSelectedDeck(result.data);
        return;
      }
    }
    const cards = DEMO_DECKS_CARDS[id];
    if (cards) {
      const meta = DEMO_DECKS_META.find(m => m.id === id)!;
      setSelectedDeck({ ...meta, cards });
    } else {
      setError('Could not load deck details');
    }
  };

  const handleDelete = async (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this shared deck permanently?')) return;
    const result = await deleteSharedDeck(deckId);
    if (result.success) {
      setFirestoreDecks(prev => prev.filter(d => d.id !== deckId));
    } else {
      setError(result.error || 'Failed to delete deck');
    }
  };

  const handleImport = async (deck: SharedDeck) => {
    setImporting(true);
    setError('');
    try {
      const result = await onImportDeck(deck.title, deck.description, deck.cards.map(c => ({ front: c.front, back: c.back, tag: c.tag })));
      if (result) {
        setImportDone(result);
        if (useFirestore) await incrementDownload(deck.id);
      } else {
        setError('Failed to import deck');
      }
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts?.seconds) return 'recently';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString();
  };

  if (selectedDeck) {
    const deck = selectedDeck;
    return (
      <div className="space-y-4 animate-fade-in font-mono max-w-3xl mx-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
          <button onClick={() => { setSelectedDeck(null); setImportDone(null); }}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8B949E] hover:text-white transition-colors cursor-pointer">
            <ArrowLeft size={12} /> Back to Gallery
          </button>
        </div>

        <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h2 className="text-sm font-bold text-white uppercase">{deck.title}</h2>
              <p className="text-[10px] text-[#8B949E] leading-relaxed">{deck.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[9px] font-mono text-[#8B949E]">
            <span className="flex items-center gap-1"><BookOpen size={11} /> {deck.cardCount} cards</span>
            <span className="flex items-center gap-1"><Download size={11} /> {deck.downloads} downloads</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(deck.createdAt)}</span>
            <span className="flex items-center gap-1"><Users size={11} /> {deck.authorName}</span>
          </div>

          {deck.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {deck.tags.map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E]">{t}</span>
              ))}
            </div>
          )}

          {importDone && (
            <div className="flex items-center gap-2 p-2 rounded border border-[#3FB950]/30 bg-[#3FB950]/5">
              <Check size={14} className="text-[#3FB950]" />
              <span className="text-[10px] font-mono text-[#3FB950]">Imported successfully! Deck added to your library.</span>
            </div>
          )}

          {!importDone && (
            <button onClick={() => handleImport(deck)} disabled={importing}
              className="w-full py-2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] transition-colors cursor-pointer disabled:opacity-40">
              {importing ? 'Importing...' : `Import ${deck.cardCount} Cards`}
            </button>
          )}

          {error && (
            <div className="flex items-center gap-1.5 p-2 rounded border border-[#F85149]/20 bg-[#F85149]/5 text-[10px] font-mono text-[#F85149]">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <div className="space-y-1 max-h-60 overflow-y-auto border border-[#30363D] rounded p-2 bg-[#0D1117]">
            {deck.cards.slice(0, 10).map((card, i) => (
              <div key={i} className="flex items-start gap-2 p-1.5 border-b border-[#30363D]/50 last:border-0 text-[10px] font-mono">
                <span className="text-[#484F58] w-4 flex-shrink-0">{i + 1}.</span>
                <span className="text-[#E0E0E0] min-w-0 flex-1 truncate">{card.front}</span>
                <span className="text-[#484F58] flex-shrink-0">→</span>
                <span className="text-[#8B949E] min-w-0 flex-1 truncate">{card.back}</span>
              </div>
            ))}
            {deck.cards.length > 10 && (
              <p className="text-[9px] text-[#8B949E] text-center pt-1">+{deck.cards.length - 10} more cards</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in font-mono">
      <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
        <div>
          <span className="text-[9px] tracking-widest text-[#8B949E] uppercase font-bold">Community Gallery</span>
          <h2 className="text-sm font-bold text-white uppercase mt-0.5">Shared Decks</h2>
        </div>
        {userId && (
          <button onClick={() => { setShowUpload(!showUpload); setError(''); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border border-[#30363D] bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white transition-colors cursor-pointer">
            <Upload size={12} /> Share a Deck
          </button>
        )}
      </div>

      {/* Upload dialog */}
      {showUpload && (
        <UploadDialog userId={userId} onClose={() => { setShowUpload(false); setRefreshKey(k => k + 1); }} />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8B949E]" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search decks by name, description, or tag..."
          className="w-full pl-9 pr-3 py-2 rounded border border-[#30363D] bg-[#161B22] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
      </div>

      {useFirestore && !loading && (
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#388BFD] px-1">
          <Globe size={11} /> Live community — decks shared by all users
        </div>
      )}
      {!useFirestore && !loading && (
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#E3B341] px-1">
          <BookOpen size={11} /> Demo mode — showing curated sample decks
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-5 h-5 border-2 border-[#30363D] border-t-[#E3B341] rounded-full animate-spin" />
          <p className="text-[10px] font-mono text-[#8B949E] mt-2">Loading community decks...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#2D333B] bg-[#161B22]/10 rounded space-y-2">
          <BookOpen size={24} className="text-[#30363D] mx-auto" />
          <p className="text-xs text-[#8B949E] font-bold uppercase tracking-wider">No decks found</p>
          <p className="text-[10px] text-[#8B949E]">Try a different search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(meta => (
            <div key={meta.id}
              className="p-3.5 rounded border border-[#2D333B] hover:border-[#30363D] bg-[#161B22] hover:bg-[#1C2128] transition-all cursor-pointer group"
              onClick={() => handleViewDeck(meta.id)}>
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-bold text-white uppercase leading-tight truncate">{meta.title}</h3>
                  {userId && meta.authorId === userId && (
                    <button onClick={e => handleDelete(e, meta.id)} className="opacity-0 group-hover:opacity-100 text-[#8B949E] hover:text-[#F85149] p-1 rounded hover:bg-[#F85149]/10 transition-all shrink-0" title="Delete your deck">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-[#8B949E] line-clamp-2 leading-relaxed">{meta.description}</p>

                <div className="flex flex-wrap items-center gap-2 text-[8px] font-mono text-[#8B949E]">
                  <span className="flex items-center gap-0.5"><BookOpen size={10} /> {meta.cardCount}</span>
                  <span className="flex items-center gap-0.5"><Download size={10} /> {meta.downloads}</span>
                  <span className="flex items-center gap-0.5"><Clock size={10} /> {formatDate(meta.createdAt)}</span>
                </div>

                {meta.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {meta.tags.slice(0, 3).map(t => (
                      <span key={t} className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
                        <Tag size={8} className="inline mr-0.5" />{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 p-2 rounded border border-[#F85149]/20 bg-[#F85149]/5 text-[10px] font-mono text-[#F85149]">
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  );
};

/* ─── Upload Dialog ───────────────────────────────────────────────── */
function UploadDialog({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!userId) { setError('You must be logged in'); return; }
    setUploading(true);
    setError('');

    const { exportDeckToJson, importDeckFromJson, listDecks, getAllCards } = await import('../db/queries');
    const decks = await listDecks();

    const selectedDeck = decks.find(d => d.name.toLowerCase() === title.trim().toLowerCase());
    if (!selectedDeck) { setError(`No deck named "${title.trim()}" found. Create it first, then share.`); setUploading(false); return; }

    const allCards = await getAllCards();
    const deckCards = allCards.filter(c => c.deckId === selectedDeck.id);
    const cards = deckCards.map(c => ({ front: c.front, back: c.back, tag: c.tag, cardType: c.cardType }));
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);

    const result = await uploadSharedDeck(title.trim(), description.trim(), tags.length > 0 ? tags : [deckCards[0]?.tag || 'General'].filter(Boolean), cards);
    if (result.success) {
      setDone(true);
    } else {
      setError(result.error || 'Upload failed');
    }
    setUploading(false);
  };

  if (done) {
    return (
      <div className="p-3 rounded border border-[#3FB950]/30 bg-[#3FB950]/5 space-y-2">
        <div className="flex items-center gap-2">
          <Check size={14} className="text-[#3FB950]" />
          <span className="text-[10px] font-mono font-bold text-[#3FB950]">Deck shared to community!</span>
        </div>
        <button onClick={onClose}
          className="text-[9px] font-mono text-[#8B949E] hover:text-white transition-colors cursor-pointer">Close</button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded border border-[#E3B341]/30 bg-[#E3B341]/5 space-y-2.5 animate-fade-in">
      <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-[#E3B341]">Share a Deck</h4>
      <p className="text-[9px] font-mono text-[#8B949E]">Enter the exact name of one of your decks to share it with the community.</p>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Deck name (must match existing deck exactly)"
        className="w-full px-2 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
      <input type="text" value={description} onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-2 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
      <input type="text" value={tagsText} onChange={e => setTagsText(e.target.value)}
        placeholder="Tags: comma-separated (e.g. OSPF, Routing)"
        className="w-full px-2 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" />
      {error && <p className="text-[9px] font-mono text-[#F85149]">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={handleUpload} disabled={uploading || !title.trim()}
          className="px-3 py-1.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] transition-colors cursor-pointer disabled:opacity-40">
          {uploading ? 'Uploading...' : 'Share'}
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 rounded text-[9px] font-mono text-[#8B949E] hover:text-white border border-[#30363D] hover:bg-[#30363D] transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}
