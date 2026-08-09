import { useState, useEffect, type FC } from 'react';
import { Deck, Card } from '../types';
import { BookOpen, AlertCircle, Plus, Trash2, Edit3, ArrowRight, Zap, Share2, Users, Download, Printer, Flame, MoreHorizontal } from 'lucide-react';
import { isDue, getLocalDateString } from '../utils/sm2';
import { ManageDataMenu, type SyncStatus } from './ManageDataMenu';

interface DeckListScreenProps {
  decks: Deck[];
  cards: Card[];
  streakDays: number;
  syncStatus: SyncStatus;
  onBackupNow: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
  onSelectDeck: (deckId: string, tab: 'study' | 'review' | 'editor' | 'quiz') => void;
  onCreateDeck: (name: string, description: string) => void;
  onDeleteDeck: (deckId: string) => void;
  onRenameDeck: (deckId: string, name: string) => void;
  onResetToDefaults: () => void;
  onShareDeck: (deckId: string) => void;
  onShareToGroup: (deckId: string) => void;
}

export const DeckListScreen: FC<DeckListScreenProps> = ({
  decks,
  cards,
  streakDays,
  syncStatus,
  onBackupNow,
  onRestoreBackup,
  onSelectDeck,
  onCreateDeck,
  onDeleteDeck,
  onRenameDeck,
  onResetToDefaults,
  onShareDeck,
  onShareToGroup,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [overflowMenuDeckId, setOverflowMenuDeckId] = useState<string | null>(null);
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const todayStr = getLocalDateString();

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const sendStudyReminder = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const dueCount = decks.reduce((sum, d) => sum + getDeckStats(d.id).due, 0);
      new Notification('Cardify Study Reminder', {
        body: dueCount > 0
          ? `You have ${dueCount} card${dueCount > 1 ? 's' : ''} due for review!`
          : 'All caught up! Add new cards or review ahead.',
        icon: '/logo.png',
      });
    }
  };

  // Helper to compute stats for each deck
  const getDeckStats = (deckId: string) => {
    const deckCards = cards.filter((c) => c.deckId === deckId);
    const dueCount = deckCards.filter((c) => isDue(c.dueDate, todayStr)).length;
    return {
      total: deckCards.length,
      due: dueCount,
    };
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim()) return;
    if (renameDeckId) onRenameDeck(renameDeckId, renameValue.trim());
    setRenameDeckId(null);
    setRenameValue('');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) {
      setErrorMsg('Deck name is required');
      return;
    }
    onCreateDeck(newDeckName.trim(), newDeckDesc.trim());
    setNewDeckName('');
    setNewDeckDesc('');
    setErrorMsg('');
    setShowCreateModal(false);
  };

  // Find if any deck has cards due to recommend studying
  const recommendedDeck = decks.find((d) => getDeckStats(d.id).due > 0);

  const handleExportCsv = (deckId: string, deckName: string) => {
    const deckCards = cards.filter((c) => c.deckId === deckId);
    if (deckCards.length === 0) return;
    const header = 'Front,Back,Tag,CardType,Bookmarked';
    const rows = deckCards.map(c => {
      const front = `"${c.front.replace(/"/g, '""')}"`;
      const back = `"${c.back.replace(/"/g, '""')}"`;
      return `${front},${back},${c.tag},${c.cardType},${c.bookmarked ? 'Yes' : 'No'}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName.replace(/[^a-zA-Z0-9]/g, '_')}_cards.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = (deckId: string, deckName: string) => {
    const deckCards = cards.filter((c) => c.deckId === deckId);
    if (deckCards.length === 0) return;
    const cardRows = deckCards.map((c, i) => `
      <div style="page-break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">Card ${i + 1} · ${c.tag}${c.bookmarked ? ' · ⭐' : ''}</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:6px;">${c.front}</div>
        <div style="font-size:13px;color:#333;border-top:1px dashed #ddd;padding-top:6px;">${c.back}</div>
      </div>
    `).join('');
    const html = `<html><head><title>${deckName}</title></head><body style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;">
      <h1 style="font-size:18px;margin-bottom:4px;">${deckName}</h1>
      <p style="font-size:12px;color:#888;margin-bottom:20px;">${deckCards.length} cards · Generated by Cardify</p>
      ${cardRows}
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      {/* Deck card animation styles */}
      <style>{`
        @keyframes deck-card-in { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .deck-card-enter { animation: deck-card-in 0.5s cubic-bezier(.22,.68,0,1.2) backwards; }
        @media (prefers-reduced-motion: reduce) { .deck-card-enter { animation: none; } }
      `}</style>
      <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner / Overview */}
      <div className="relative z-40 rounded border border-[#2D333B] bg-[#161B22] p-5 md:p-6">
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="px-2 py-0.5 text-[9px] font-mono tracking-widest bg-[#0D1117] text-[#E3B341] rounded border border-[#30363D] uppercase font-bold">
                Sm-2 engine active
              </span>
              <span className="text-[10px] font-mono text-[#8B949E] hidden sm:inline">Latency: 0ms (local state)</span>
              {streakDays > 0 && (
                <button
                  onClick={sendStudyReminder}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20 hover:bg-[#E3B341]/20 transition-colors cursor-pointer"
                  title="Send test notification"
                >
                  <Flame size={11} />
                  <span>{streakDays} day streak</span>
                </button>
              )}
            </div>
            <ManageDataMenu
              syncStatus={syncStatus}
              onBackupNow={onBackupNow}
              onRestoreBackup={onRestoreBackup}
              onResetToDefaults={onResetToDefaults}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white font-mono">
              Flashcard study instrument
            </h1>
          </div>
          
          <div className="flex flex-col gap-2 pt-3">
            <div className="flex flex-row items-center gap-2 w-full overflow-hidden">
              {decks.length > 0 && (
                <button
                  onClick={() => onSelectDeck((recommendedDeck ?? decks[0]).id, 'study')}
                  className="flex-1 inline-flex items-center justify-center gap-1 sm:gap-2 h-10 px-2 sm:px-5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] sm:text-sm font-bold tracking-wide rounded-lg shadow-[0_0_24px_rgba(227,179,65,0.25)] transition-all cursor-pointer min-w-0"
                >
                  <span className="truncate">Study recommended deck</span>
                  <ArrowRight size={16} className="flex-shrink-0 hidden sm:block" />
                </button>
              )}
              {!recommendedDeck && decks.length > 0 && (
                <div className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-3 text-[#3FB950] text-[11px] font-mono rounded-lg border border-[#30363D] whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse flex-shrink-0"></span>
                  <span className="truncate">All cards up to date</span>
                </div>
              )}

              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 h-10 bg-[#21262D] hover:bg-[#30363D] text-white text-[11px] font-semibold tracking-wider rounded-lg border border-[#30363D] transition-colors cursor-pointer flex-shrink-0"
              >
                <Plus size={12} />
                <span className="hidden sm:inline">Create deck</span>
                <span className="inline sm:hidden">Create</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Decks Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#2D333B] pb-1.5">
          <h2 className="text-xs font-bold tracking-widest text-[#8B949E] font-mono">
            Subjects & active decks
          </h2>
          <span className="text-[10px] font-mono text-[#8B949E]">
            {decks.length} {decks.length === 1 ? 'deck' : 'decks'} available
          </span>
        </div>

        {decks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[#2D333B] rounded bg-[#161B22]/20 space-y-3">
            <BookOpen size={32} className="text-[#8B949E]" />
            <div className="text-center space-y-1">
              <p className="text-white text-xs font-semibold uppercase font-mono">No decks found</p>
              <p className="text-[11px] text-[#8B949E] max-w-sm">
                Create a custom deck or load the pre-populated sample study cards to start reviewing.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[11px] font-semibold tracking-wider uppercase rounded transition-colors"
              >
                Create New Deck
              </button>
              <button
                onClick={onResetToDefaults}
                className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-white text-[11px] font-semibold tracking-wider uppercase rounded border border-[#30363D] transition-colors"
              >
                Load Default Sample Cards
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {decks.map((deck, index) => {
              const { total, due } = getDeckStats(deck.id);
              const showOverflow = overflowMenuDeckId === deck.id;

              return (
                <div
                  key={deck.id}
                  id={`deck-card-${deck.id}`}
                  className={`deck-card-enter group relative flex flex-col justify-between rounded overflow-hidden transition-all duration-300 ${
                    due > 0
                      ? 'border border-[#E3B341]/40 hover:border-[#E3B341]/70 hover:shadow-[0_0_28px_rgba(227,179,65,0.15)]'
                      : 'border border-[#2D333B] hover:border-[#58A6FF]/50 hover:shadow-[0_8px_32px_rgba(0,0,0,0.45)]'
                  } hover:-translate-y-0.5 bg-[#161B22] bg-gradient-to-b from-[#1A2029] to-[#14181F]`}
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  {/* Ambient corner glow */}
                  <div className={`pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100 ${
                    due > 0 ? 'bg-[#E3B341]/15' : 'bg-[#58A6FF]/10'
                  }`} />

                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
                    <div className="absolute -inset-y-full -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[350%]" />
                  </div>
                  <div
                    className={`relative h-[3px] w-full transition-all duration-300 ${
                      due > 0
                        ? 'bg-gradient-to-r from-[#E3B341] via-[#F0C24F] to-[#E3B341] shadow-[0_0_12px_rgba(227,179,65,0.5)]'
                        : 'bg-gradient-to-r from-[#E3B341]/20 via-[#E3B341]/40 to-transparent group-hover:from-[#E3B341]/50 group-hover:via-[#E3B341]/80'
                    }`}
                  />
                  <div className="space-y-1.5 p-3.5 pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="relative flex w-1.5 h-1.5 flex-shrink-0 mt-0.5">
                          {due > 0 && <span className="absolute inline-flex h-full w-full rounded-full bg-[#E3B341] opacity-60 animate-ping"></span>}
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${due > 0 ? 'bg-[#E3B341]' : 'bg-[#8B949E]'}`}></span>
                        </span>
                        <span className="text-[7px] font-mono text-[#484F58] font-bold tracking-wider flex-shrink-0">
                          #{deck.id}
                        </span>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#E3B341] transition-colors font-mono truncate">
                          {deck.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-mono text-[#484F58] whitespace-nowrap">
                          <span className="text-white font-bold">{total}</span>
                        </span>
                        {due > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/25 shadow-[0_0_8px_rgba(227,179,65,0.08)]">
                            {due} due
                          </span>
                        ) : total > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/20">
                            Up to date
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {deck.description && (
                      <p className="text-[11px] text-[#8B949E] leading-relaxed line-clamp-2">
                        {deck.description}
                      </p>
                    )}

                    {total > 0 && (
                      <div className="pt-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[8px] font-mono text-[#484F58] font-bold tracking-wider uppercase">Mastery</span>
                          <span className={`text-[9px] font-mono font-bold ${due > 0 ? 'text-[#E3B341]' : 'text-[#3FB950]'}`}>
                            {Math.round(((total - due) / total) * 100)}%
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-[#0D1117] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              due > 0
                                ? 'bg-gradient-to-r from-[#E3B341]/60 to-[#E3B341] shadow-[0_0_8px_rgba(227,179,65,0.5)]'
                                : 'bg-gradient-to-r from-[#3FB950]/60 to-[#3FB950]'
                            }`}
                            style={{ width: `${((total - due) / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-1 pt-2.5 border-t border-[#2D333B]/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelectDeck(deck.id, 'editor')}
                        className="flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-colors cursor-pointer"
                        title="Manage cards"
                      >
                        <Edit3 size={13} />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Delete "${deck.name}" and all ${total} cards?`)) {
                            onDeleteDeck(deck.id);
                          }
                        }}
                        className="flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-[#F85149]/60 hover:text-[#F85149] hover:bg-[#F85149]/10 transition-colors cursor-pointer"
                        title="Delete deck"
                      >
                        <Trash2 size={13} />
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setOverflowMenuDeckId(showOverflow ? null : deck.id)}
                          className="flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-colors cursor-pointer"
                          title="More actions"
                        >
                          <MoreHorizontal size={13} />
                        </button>

                        {showOverflow && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOverflowMenuDeckId(null)} />
                            <div className="absolute left-0 bottom-full mb-1 z-50 w-44 rounded border border-[#2D333B] bg-[#161B22] shadow-2xl overflow-hidden">
                              <button
                                onClick={() => { onSelectDeck(deck.id, 'quiz'); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Zap size={13} className="text-[#E3B341]" />
                                <span>Quiz</span>
                              </button>
                              <button
                                onClick={() => { setRenameValue(deck.name); setRenameDeckId(deck.id); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Edit3 size={13} className="text-[#58A6FF]" />
                                <span>Rename</span>
                              </button>
                              <button
                                onClick={() => { onShareDeck(deck.id); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Share2 size={13} className="text-[#58A6FF]" />
                                <span>Share link</span>
                              </button>
                              <button
                                onClick={() => { onShareToGroup(deck.id); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Users size={13} className="text-[#58A6FF]" />
                                <span>Share to group</span>
                              </button>
                              <button
                                onClick={() => { handleExportCsv(deck.id, deck.name); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Download size={13} className="text-[#3FB950]" />
                                <span>Export CSV</span>
                              </button>
                              <button
                                onClick={() => { handleExportPdf(deck.id, deck.name); setOverflowMenuDeckId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] font-mono text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
                              >
                                <Printer size={13} className="text-[#58A6FF]" />
                                <span>Print study sheet</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Main Study CTA */}
                    <button
                      onClick={() => onSelectDeck(deck.id, due > 0 ? 'study' : 'editor')}
                      className={`inline-flex items-center gap-1.5 px-3 h-[36px] rounded text-[10px] font-bold tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                        due > 0
                          ? 'bg-gradient-to-b from-[#F0C24F] to-[#E3B341] text-[#0F1115] hover:from-[#F7D270] hover:to-[#F0C24F] shadow-[0_2px_12px_rgba(227,179,65,0.35)] hover:shadow-[0_4px_20px_rgba(227,179,65,0.5)] hover:-translate-y-px'
                          : total === 0
                            ? 'bg-transparent text-[#8B949E] hover:text-white border border-dashed border-[#30363D] hover:border-[#484F58]'
                            : 'bg-[#21262D] text-white hover:bg-[#30363D] border border-[#30363D] hover:border-[#484F58]'
                      }`}
                    >
                      {total === 0 ? (
                        <>Add cards</>
                      ) : due > 0 ? (
                        <>Study <ArrowRight size={10} /></>
                      ) : (
                        <>Manage <ArrowRight size={10} /></>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rename Deck Dialog */}
      {renameDeckId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
              <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">Rename Deck</h3>
              <button onClick={() => setRenameDeckId(null)} className="text-[#8B949E] hover:text-white text-[10px] font-mono p-1 hover:bg-[#21262D] rounded">CLOSE</button>
            </div>
            <form onSubmit={handleRename} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Deck Name *</label>
                <input type="text" placeholder="Enter deck name" value={renameValue} onChange={e => setRenameValue(e.target.value)} className="w-full px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600" maxLength={50} autoFocus />
              </div>
              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setRenameDeckId(null)} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors cursor-pointer">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors cursor-pointer">Rename</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Form for Creating a Deck */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded border border-[#2D333B] bg-[#161B22] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D333B] pb-2">
              <h3 className="text-xs font-bold text-[#8B949E] font-mono uppercase tracking-wider">
                Create New Study Deck
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setErrorMsg('');
                }}
                className="text-[#8B949E] hover:text-white text-[10px] font-mono p-1 hover:bg-[#21262D] rounded"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">
                  Deck Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., OSPF Protocols & Subnetting Labs"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600"
                  maxLength={50}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">
                  Description
                </label>
                <textarea
                  placeholder="Summarize the core topics in this deck..."
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  className="w-full h-20 px-3 py-1.5 rounded border border-[#30363D] bg-[#0D1117] text-[#E0E0E0] text-xs font-mono focus:outline-none focus:border-[#E3B341] placeholder-slate-600 resize-none"
                  maxLength={160}
                />
              </div>

              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20">
                  <AlertCircle size={12} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setErrorMsg('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] hover:text-white rounded hover:bg-[#21262D] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#E3B341] text-[#0F1115] hover:bg-[#F0C24F] rounded transition-colors cursor-pointer"
                >
                  Create Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </>
  );
};
