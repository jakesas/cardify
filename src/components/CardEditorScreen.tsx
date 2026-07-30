import { useState, type FC } from 'react';
import { Card, Deck, NetworkTopology } from '../types';
import { Trash2, Edit3, ArrowLeft, Search, AlertCircle, FileText, Code, Upload, Star } from 'lucide-react';
import { CsvImportDialog, type CsvRow } from './CsvImportDialog';

interface CardEditorScreenProps {
  deck: Deck;
  decks?: Deck[];
  cards: Card[];
  onAddCard: (card: Omit<Card, 'id' | 'reps' | 'interval' | 'easeFactor' | 'dueDate'>) => void;
  onEditCard: (cardId: string, updated: Partial<Card>) => void;
  onDeleteCard: (cardId: string) => void;
  onBatchDeleteCards?: (ids: string[]) => void;
  onBatchUpdateCards?: (ids: string[], fields: Partial<Card>) => void;
  onGoBack: () => void;
}

// Preset Topology Layouts that users can easily attach to mock professional CCNA labs!
const TOPOLOGY_PRESETS: { name: string; value: string; topology: NetworkTopology }[] = [
  {
    name: 'None (Plain text or config only)',
    value: 'none',
    topology: { nodes: [], links: [] },
  },
  {
    name: 'Hub-and-Spoke WAN (1 Router, 2 Branches)',
    value: 'hub_spoke',
    topology: {
      nodes: [
        { id: 'hq', label: 'HQ-Router\n10.255.0.1', type: 'router', x: 200, y: 50 },
        { id: 'branch1', label: 'Branch-1\n10.255.0.2', type: 'router', x: 100, y: 180 },
        { id: 'branch2', label: 'Branch-2\n10.255.0.3', type: 'router', x: 300, y: 180 },
      ],
      links: [
        { from: 'hq', to: 'branch1', label: 'Se0/1/0 (OSPF)', type: 'serial' },
        { from: 'hq', to: 'branch2', label: 'Se0/1/1 (OSPF)', type: 'serial' },
      ],
    },
  },
  {
    name: 'Redundant Access Layer (Spanning Tree Lab)',
    value: 'redundant_stp',
    topology: {
      nodes: [
        { id: 'sw1', label: 'SW-Core-1\nBridge Pri: 8192', type: 'switch', x: 130, y: 60 },
        { id: 'sw2', label: 'SW-Core-2\nBridge Pri: 32768', type: 'switch', x: 270, y: 60 },
        { id: 'sw3', label: 'SW-Access\nBridge Pri: 32768', type: 'switch', x: 200, y: 190 },
      ],
      links: [
        { from: 'sw1', to: 'sw2', label: 'Trunk EtherChannel', type: 'trunk' },
        { from: 'sw1', to: 'sw3', label: 'Active Link' },
        { from: 'sw2', to: 'sw3', label: 'STP Blocked Port', type: 'trunk' },
      ],
    },
  },
  {
    name: 'Basic Router-to-Switch Access Lan',
    value: 'basic_lan',
    topology: {
      nodes: [
        { id: 'r1', label: 'R-Core\nGi0/1: 192.168.1.1', type: 'router', x: 200, y: 50 },
        { id: 's1', label: 'SW-1\nVLAN 10', type: 'switch', x: 200, y: 150 },
        { id: 'pc1', label: 'Host-PC\nDHCP Client', type: 'host', x: 200, y: 250 },
      ],
      links: [
        { from: 'r1', to: 's1', label: 'Gi0/1' },
        { from: 's1', to: 'pc1', label: 'Fa0/24' },
      ],
    },
  }
];

export const CardEditorScreen: FC<CardEditorScreenProps> = ({
  deck,
  decks = [],
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onBatchDeleteCards,
  onBatchUpdateCards,
  onGoBack,
}) => {
  const deckCards = cards.filter((c) => c.deckId === deck.id);

  // Form states
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardType, setCardType] = useState<'basic' | 'cloze'>('basic');
  const [frontText, setFrontText] = useState('');
  const [backText, setBackText] = useState('');
  const [selectedTag, setSelectedTag] = useState('General');
  const [selectedPreset, setSelectedPreset] = useState('none');
  const [codeSnippetText, setCodeSnippetText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [selectedFilterTags, setSelectedFilterTags] = useState<Set<string>>(new Set());

  const allTags = Array.from(new Set(deckCards.map(c => c.tag))).sort();

  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchTargetDeckId, setBatchTargetDeckId] = useState('');
  const [batchMode, setBatchMode] = useState<'idle' | 'tag' | 'deck'>('idle');

  const otherDecks = decks.filter(d => d.id !== deck.id);

  const [showCsvImport, setShowCsvImport] = useState(false);

  const filteredCards = deckCards.filter(
    (c) =>
      (c.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tag.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!showBookmarkedOnly || c.bookmarked) &&
      (selectedFilterTags.size === 0 || selectedFilterTags.has(c.tag))
  );

  const bookmarkedCount = deckCards.filter(c => c.bookmarked).length;

  const allFilteredSelected = filteredCards.length > 0 && filteredCards.every(c => selectedIds.has(c.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredCards.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredCards.forEach(c => next.add(c.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCsvImport = async (rows: CsvRow[]): Promise<number> => {
    let count = 0;
    for (const row of rows) {
      try {
        await onAddCard({
          deckId: deck.id,
          front: row.front,
          back: row.back,
          tag: row.tag || selectedTag,
          cardType: 'basic',
        });
        count++;
      } catch {}
    }
    return count;
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected cards? This will reset all spacing statistics.`)) return;
    onBatchDeleteCards?.(ids);
    clearSelection();
  };

  const handleBatchTag = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !batchTagInput.trim()) return;
    onBatchUpdateCards?.(ids, { tag: batchTagInput.trim() as any });
    setBatchTagInput('');
    setBatchMode('idle');
    clearSelection();
  };

  const handleBatchMove = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !batchTargetDeckId) return;
    onBatchUpdateCards?.(ids, { deckId: batchTargetDeckId });
    setBatchTargetDeckId('');
    setBatchMode('idle');
    clearSelection();
  };

  const handleEditInit = (card: Card) => {
    setEditingCardId(card.id);
    setCardType(card.cardType || 'basic');
    setFrontText(card.front);
    setBackText(card.back);
    setSelectedTag(card.tag);
    setCodeSnippetText(card.codeSnippet?.code || '');
    
    // Attempt to match active topology preset, else default to none
    setSelectedPreset('none');
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingCardId(null);
    setFrontText('');
    setBackText('');
    setSelectedTag('General');
    setSelectedPreset('none');
    setCodeSnippetText('');
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!frontText.trim()) {
      setErrorMsg('Front / text field is required.');
      return;
    }
    if (cardType === 'basic' && !backText.trim()) {
      setErrorMsg('Back / Answer field is required for basic cards.');
      return;
    }
    if (cardType === 'cloze' && !/\{\{c\d+::/.test(frontText)) {
      setErrorMsg('Cloze cards need at least one {{c1::answer}} marker in the text.');
      return;
    }

    // Resolve topology if preset selected
    let topology: NetworkTopology | undefined = undefined;
    const matchedPreset = TOPOLOGY_PRESETS.find((p) => p.value === selectedPreset);
    if (matchedPreset && matchedPreset.value !== 'none') {
      topology = matchedPreset.topology;
    }

    // Resolve code snippet
    const codeSnippet = codeSnippetText.trim()
      ? { code: codeSnippetText.trim(), language: 'ios' }
      : undefined;

    if (editingCardId) {
      // Edit
      onEditCard(editingCardId, {
        cardType,
        front: frontText.trim(),
        back: backText.trim(),
        tag: selectedTag,
        topology,
        codeSnippet,
      });
      setEditingCardId(null);
      setSearchQuery(''); // Clear search so the edited card doesn't disappear from the list
    } else {
      // Add
      onAddCard({
        deckId: deck.id,
        cardType,
        front: frontText.trim(),
        back: backText.trim(),
        tag: selectedTag,
        topology,
        codeSnippet,
      });
    }

    // Reset fields
    setFrontText('');
    setBackText('');
    setSelectedTag('General');
    setSelectedPreset('none');
    setCodeSnippetText('');
    setErrorMsg('');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Back button and Deck name */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
        <div className="flex items-center space-x-2">
          <button
            onClick={onGoBack}
            className="p-1 hover:bg-[#21262D] rounded text-[#8B949E] hover:text-white transition-colors cursor-pointer border border-[#30363D]"
            title="Go back to Deck list"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="space-y-0.5">
            <span className="text-[9px] font-mono tracking-widest text-[#8B949E] uppercase font-bold">
              MANAGING DECK CARDS
            </span>
            <h2 className="text-sm font-bold text-white truncate max-w-md font-mono">
              {deck.name.toUpperCase()}
            </h2>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#8B949E]">
          TOTAL IN DECK: <span className="text-white font-bold">{deckCards.length} CARDS</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Creation/Editing Form */}
        <div className="lg:col-span-5 space-y-3">
          <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
            <div className="flex items-center justify-between border-b border-[#30363D] pb-1.5">
              <h3 className="text-xs font-bold text-white tracking-widest uppercase font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]"></span>
                {editingCardId ? 'EDIT CARD' : 'ADD CARD'}
              </h3>
              {editingCardId && (
                <button
                  onClick={handleCancelEdit}
                  className="text-[10px] text-[#8B949E] hover:text-white cursor-pointer font-mono hover:underline"
                >
                  CANCEL EDIT
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Card Type Toggle */}
              <div className="flex items-center gap-2 p-1 rounded-lg bg-[#0D1117] border border-[#30363D] w-fit">
                <button type="button" onClick={() => setCardType('basic')}
                  className={`px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors cursor-pointer ${cardType === 'basic' ? 'bg-[#E3B341] text-[#0F1115]' : 'text-[#8B949E] hover:text-white'}`}>
                  Basic
                </button>
                <button type="button" onClick={() => setCardType('cloze')}
                  className={`px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors cursor-pointer ${cardType === 'cloze' ? 'bg-[#388BFD] text-white' : 'text-[#8B949E] hover:text-white'}`}>
                  Cloze
                </button>
              </div>

              {/* Front Text */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  {cardType === 'cloze' ? 'Text with Cloze Deletions *' : 'Front / Question Content *'}
                </label>
                <textarea
                  placeholder={cardType === 'cloze' ? "The capital of {{c1::Japan}} is {{c2::Tokyo}}." : "e.g., What is the formula for calculating velocity?"}
                  value={frontText}
                  onChange={(e) => setFrontText(e.target.value)}
                  className="w-full h-16 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={300}
                />
                {cardType === 'cloze' && (
                  <p className="text-[9px] font-mono text-[#388BFD]">
                    Use {'{{c1::answer}}'} to mark hidden parts. Multiple clozes supported: {'{{c1::..}}{{c2::..}}'}
                  </p>
                )}
              </div>

              {/* Back Text */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  Back / {cardType === 'cloze' ? 'Extra (optional)' : 'Answer & Explanation *'}
                </label>
                <textarea
                  placeholder={cardType === 'cloze' ? "Add extra notes or context (optional for cloze cards)" : "Write the full answer here. You can use Markdown to format text, add code snippets, or bullet points."}
                  value={backText}
                  onChange={(e) => setBackText(e.target.value)}
                  className="w-full h-24 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={1000}
                />
                {cardType === 'cloze' && (
                  <p className="text-[9px] font-mono text-[#8B949E]">
                    Back field is optional for cloze — the revealed answer comes from the front text.
                  </p>
                )}
              </div>

              {/* Tag Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  Topic Tag
                </label>
                <input
                  type="text"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  placeholder="e.g., Purposive Communication, Network Fundamentals, Biology..."
                  className="w-full px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600"
                />
              </div>

              {/* More Options Toggle */}
              <button
                type="button"
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                className="flex items-center space-x-1.5 w-full px-2.5 py-1.5 rounded border border-dashed border-[#30363D] bg-transparent text-[9px] font-mono text-[#8B949E] hover:text-white hover:border-[#E3B341]/50 transition-colors cursor-pointer"
              >
                <span className="text-[11px]">{showMoreOptions ? '▾' : '▸'}</span>
                <span>{showMoreOptions ? 'Hide advanced options' : 'Advanced: code snippet & diagram (optional)'}</span>
              </button>

              {showMoreOptions && (
                <div className="space-y-3 pl-2 border-l-2 border-[#2D333B]">
                  {/* Optional Code Snippet Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block flex items-center space-x-1 font-bold">
                      <Code size={11} className="text-[#8B949E]" />
                      <span>Optional Code Snippet</span>
                    </label>
                    <textarea
                      placeholder="e.g., print('hello') or E = mc² or show ip route"
                      value={codeSnippetText}
                      onChange={(e) => setCodeSnippetText(e.target.value)}
                      className="w-full h-12 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#388BFD] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                      maxLength={150}
                    />
                  </div>

                  {/* Optional Topology Preset */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                      Embed Topology Diagram
                    </label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] cursor-pointer"
                    >
                      {TOPOLOGY_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20">
                  <AlertCircle size={12} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold tracking-wider uppercase rounded transition-colors cursor-pointer"
              >
                {editingCardId ? 'Save Changes' : 'Add Card to Deck'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: List of existing cards with quick edit/delete */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-[#8B949E]" />
              <input
                type="text"
                placeholder="Search card front, back, or exam tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded border border-[#30363D] bg-[#161B22] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600"
              />
            </div>
            <button onClick={() => setShowCsvImport(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border border-[#30363D] bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white transition-colors cursor-pointer whitespace-nowrap">
              <Upload size={12} />
              Import CSV
            </button>
            <button
              onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                showBookmarkedOnly
                  ? 'bg-[#E3B341]/10 border-[#E3B341]/40 text-[#E3B341]'
                  : 'border-[#30363D] bg-[#21262D] text-[#8B949E] hover:text-white hover:bg-[#30363D]'
              }`}
            >
              <Star size={12} fill={showBookmarkedOnly ? 'currentColor' : 'none'} />
              {bookmarkedCount > 0 ? `${bookmarkedCount} bookmarked` : 'Bookmarked'}
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-mono text-[#8B949E] uppercase tracking-wider font-bold mr-0.5">Tags:</span>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleFilterTag(tag)}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                    selectedFilterTags.has(tag)
                      ? 'bg-[#E3B341]/15 border-[#E3B341]/40 text-[#E3B341]'
                      : 'bg-[#0D1117] border-[#30363D] text-[#8B949E] hover:text-white hover:border-[#484F58]'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {selectedFilterTags.size > 0 && (
                <button
                  onClick={() => setSelectedFilterTags(new Set())}
                  className="px-1.5 py-0.5 rounded text-[8px] font-mono text-[#F85149] hover:text-white hover:bg-[#F85149]/10 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded border border-[#E3B341]/40 bg-[#E3B341]/5 animate-fade-in">
              <span className="text-[10px] font-mono font-bold text-[#E3B341] whitespace-nowrap mr-1">
                {selectedIds.size} selected
              </span>
              <button onClick={handleBatchDelete}
                className="px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider text-[#F85149] hover:bg-[#F85149]/10 border border-[#F85149]/30 transition-colors cursor-pointer">
                Delete
              </button>
              <button onClick={() => setBatchMode(batchMode === 'tag' ? 'idle' : 'tag')}
                className="px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider text-[#388BFD] hover:bg-[#388BFD]/10 border border-[#388BFD]/30 transition-colors cursor-pointer">
                Tag
              </button>
              {otherDecks.length > 0 && (
                <button onClick={() => setBatchMode(batchMode === 'deck' ? 'idle' : 'deck')}
                  className="px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider text-[#3FB950] hover:bg-[#3FB950]/10 border border-[#3FB950]/30 transition-colors cursor-pointer">
                  Move
                </button>
              )}
              <button onClick={clearSelection}
                className="px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider text-[#8B949E] hover:bg-[#30363D] border border-[#30363D] transition-colors cursor-pointer ml-auto">
                Clear
              </button>
            </div>
          )}

          {batchMode === 'tag' && (
            <div className="flex items-center gap-2 p-2 rounded border border-[#388BFD]/30 bg-[#161B22] animate-slide-up">
              <input type="text" value={batchTagInput} onChange={e => setBatchTagInput(e.target.value)}
                placeholder="New tag for selected cards..."
                className="flex-grow px-2 py-1 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-[11px] font-mono focus:outline-none focus:border-[#388BFD] placeholder-slate-600" />
              <button onClick={handleBatchTag}
                className="px-3 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-[#388BFD] text-white hover:bg-[#388BFD]/80 transition-colors cursor-pointer disabled:opacity-30"
                disabled={!batchTagInput.trim()}>
                Apply
              </button>
            </div>
          )}

          {batchMode === 'deck' && (
            <div className="flex items-center gap-2 p-2 rounded border border-[#3FB950]/30 bg-[#161B22] animate-slide-up">
              <select value={batchTargetDeckId} onChange={e => setBatchTargetDeckId(e.target.value)}
                className="flex-grow px-2 py-1 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-[11px] font-mono focus:outline-none focus:border-[#3FB950] cursor-pointer">
                <option value="">Select target deck...</option>
                {otherDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={handleBatchMove}
                className="px-3 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-[#3FB950] text-white hover:bg-[#3FB950]/80 transition-colors cursor-pointer disabled:opacity-30"
                disabled={!batchTargetDeckId}>
                Move
              </button>
            </div>
          )}

          <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
            {filteredCards.length > 0 && (
              <label className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-[#161B22] rounded border border-transparent hover:border-[#2D333B] transition-colors select-none">
                <input type="checkbox" checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-[#30363D] bg-[#0D1117] text-[#E3B341] focus:ring-0 accent-[#E3B341] cursor-pointer" />
                <span className="text-[9px] font-mono text-[#8B949E] uppercase tracking-wider">
                  {allFilteredSelected ? 'Deselect All' : 'Select All'} ({filteredCards.length} visible)
                </span>
              </label>
            )}

            {filteredCards.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-[#2D333B] bg-[#161B22]/10 rounded space-y-2">
                <FileText size={20} className="text-[#8B949E] mx-auto" />
                <p className="text-[#8B949E] font-mono text-xs uppercase font-bold">No matching cards found.</p>
                <p className="text-[10px] text-[#8B949E]">Try adjusting your filter or add a fresh new card.</p>
              </div>
            ) : (
              filteredCards.map((card) => {
                const isEditingThis = card.id === editingCardId;
                const isSelected = selectedIds.has(card.id);

                return (
                  <div
                    key={card.id}
                    className={`p-3 rounded border transition-colors duration-100 ${
                      isEditingThis
                        ? 'border-[#E3B341] bg-[#161B22]'
                        : isSelected
                          ? 'border-[#E3B341]/50 bg-[#E3B341]/5'
                          : 'border-[#2D333B] hover:border-[#30363D] bg-[#161B22]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-1">
                      <label className="flex-shrink-0 pt-1 cursor-pointer select-none">
                        <input type="checkbox" checked={isSelected}
                          onChange={() => toggleSelect(card.id)}
                          className="w-3.5 h-3.5 rounded border-[#30363D] bg-[#0D1117] text-[#E3B341] focus:ring-0 accent-[#E3B341] cursor-pointer" />
                      </label>

                      <div className="space-y-1.5 min-w-0 flex-grow">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <span className="px-1 py-0.5 rounded text-[7px] sm:text-[8px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E] font-bold uppercase flex-shrink-0">
                            {card.tag}
                          </span>
                          <span className="text-[8px] sm:text-[9px] font-mono text-[#8B949E] truncate min-w-0">
                            R:{card.reps} I:{card.interval}d D:{card.dueDate}
                          </span>
                          {card.cardType === 'cloze' && (
                            <span className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#388BFD]/15 text-[#388BFD] border border-[#388BFD]/20 flex-shrink-0">
                              CLZ
                            </span>
                          )}
                          {card.topology && (
                            <span className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#388BFD]/10 text-[#388BFD] border border-[#388BFD]/20 flex-shrink-0">
                              DG
                            </span>
                          )}
                          {card.codeSnippet && (
                            <span className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/20 flex-shrink-0">
                              CFG
                            </span>
                          )}
                          {card.bookmarked && (
                            <span className="text-[#E3B341] flex-shrink-0">
                              <Star size={10} fill="currentColor" />
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-white font-mono leading-relaxed">
                          {card.front}
                        </h4>

                        <p className="text-[11px] text-[#8B949E] line-clamp-2 leading-relaxed whitespace-pre-line font-mono border-t border-[#2D333B] pt-1">
                          {card.back}
                        </p>
                      </div>

                      {/* Card Row Operations */}
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button
                          onClick={() => handleEditInit(card)}
                          className="p-1 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-white transition-colors cursor-pointer border border-[#30363D]"
                          title="Edit Card"
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this flashcard? This will reset all spacing statistics.')) {
                              onDeleteCard(card.id);
                              if (editingCardId === card.id) {
                                handleCancelEdit();
                              }
                            }
                          }}
                          className="p-1 hover:bg-[#F85149]/10 rounded text-[#8B949E] hover:text-[#F85149] transition-colors cursor-pointer border border-[#30363D]"
                          title="Delete Card"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showCsvImport && (
        <CsvImportDialog
          deckId={deck.id}
          defaultTag={selectedTag}
          onImport={handleCsvImport}
          onClose={() => setShowCsvImport(false)}
        />
      )}
    </div>
  );
};
