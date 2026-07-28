import { useState, type FC } from 'react';
import { Card, Deck, NetworkTopology } from '../types';
import { Trash2, Edit3, ArrowLeft, Search, AlertCircle, FileText, Code } from 'lucide-react';

interface CardEditorScreenProps {
  deck: Deck;
  cards: Card[];
  onAddCard: (card: Omit<Card, 'id' | 'reps' | 'interval' | 'easeFactor' | 'dueDate'>) => void;
  onEditCard: (cardId: string, updated: Partial<Card>) => void;
  onDeleteCard: (cardId: string) => void;
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
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onGoBack,
}) => {
  const deckCards = cards.filter((c) => c.deckId === deck.id);

  // Form states
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [frontText, setFrontText] = useState('');
  const [backText, setBackText] = useState('');
  const [selectedTag, setSelectedTag] = useState('General');
  const [selectedPreset, setSelectedPreset] = useState('none');
  const [codeSnippetText, setCodeSnippetText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const handleEditInit = (card: Card) => {
    setEditingCardId(card.id);
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
    if (!frontText.trim() || !backText.trim()) {
      setErrorMsg('Both Front and Back fields are required.');
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
        cardType: 'basic',
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

  // Filter cards based on search query
  const filteredCards = deckCards.filter(
    (c) =>
      c.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              {/* Front Text */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  Front / Question Content *
                </label>
                <textarea
                  placeholder="e.g., What command displays the configuration of active subinterfaces on Router-1?"
                  value={frontText}
                  onChange={(e) => setFrontText(e.target.value)}
                  className="w-full h-16 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={300}
                />
              </div>

              {/* Back Text */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  Back / Answer & Explanation *
                </label>
                <textarea
                  placeholder="Provide a detailed explanation. Code snippets can be placed here with Markdown ``` formatting."
                  value={backText}
                  onChange={(e) => setBackText(e.target.value)}
                  className="w-full h-24 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={1000}
                />
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

              {/* Optional Code Snippet Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block flex items-center space-x-1 font-bold">
                  <Code size={11} className="text-[#8B949E]" />
                  <span>Optional IOS CLI Command Snippet</span>
                </label>
                <textarea
                  placeholder="Switch# show interfaces trunk"
                  value={codeSnippetText}
                  onChange={(e) => setCodeSnippetText(e.target.value)}
                  className="w-full h-12 px-2.5 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#388BFD] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={150}
                />
              </div>

              {/* Optional Topology Preset */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">
                  Embed Topology Diagram Preset
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
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
            {filteredCards.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-[#2D333B] bg-[#161B22]/10 rounded space-y-2">
                <FileText size={20} className="text-[#8B949E] mx-auto" />
                <p className="text-[#8B949E] font-mono text-xs uppercase font-bold">No matching cards found.</p>
                <p className="text-[10px] text-[#8B949E]">Try adjusting your filter or add a fresh new card.</p>
              </div>
            ) : (
              filteredCards.map((card) => {
                const isEditingThis = card.id === editingCardId;

                return (
                  <div
                    key={card.id}
                    className={`p-3 rounded border transition-colors duration-100 ${
                      isEditingThis
                        ? 'border-[#E3B341] bg-[#161B22]'
                        : 'border-[#2D333B] hover:border-[#30363D] bg-[#161B22]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="space-y-1.5 min-w-0 flex-grow">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <span className="px-1 py-0.5 rounded text-[7px] sm:text-[8px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E] font-bold uppercase flex-shrink-0">
                            {card.tag}
                          </span>
                          <span className="text-[8px] sm:text-[9px] font-mono text-[#8B949E] truncate min-w-0">
                            R:{card.reps} I:{card.interval}d D:{card.dueDate}
                          </span>
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
    </div>
  );
};
