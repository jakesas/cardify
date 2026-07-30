import { useState, useMemo, useRef, useEffect, type FC } from 'react';
import { Deck } from '../types';
import { ArrowLeft, Edit3, Save, BookOpen, Play, ChevronLeft, ChevronRight, Timer, Pause, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StudyMaterialScreenProps {
  deck: Deck;
  onGoBack: () => void;
  onProceedToReview: () => void;
  onUpdateDeck: (deckId: string, studyMaterial: string) => Promise<void>;
}

/** Split markdown content into pages at heading (## or ### or ####) boundaries.
 *  Falls back to splitting by line count for content without headings. */
function splitIntoPages(material: string): string[] {
  if (!material.trim()) return [];

  const headingRegex = /^#{2,4}\s+.+$/gm;
  const matches = Array.from(material.matchAll(headingRegex));

  if (matches.length <= 1) {
    // No clear sections — split by line groups (~8 lines per page)
    const lines = material.split('\n');
    const totalLines = lines.length;
    const pageCount = Math.max(2, Math.min(6, Math.ceil(totalLines / 8)));
    const pageSize = Math.ceil(totalLines / pageCount);
    const pages: string[] = [];
    for (let i = 0; i < totalLines; i += pageSize) {
      const chunk = lines.slice(i, i + pageSize).join('\n').trim();
      if (chunk) pages.push(chunk);
    }
    return pages;
  }

  // Split at heading boundaries — each heading starts a new page
  const pages: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index!;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : material.length;
    const chunk = material.slice(startIdx, endIdx).trim();
    if (chunk) pages.push(chunk);
  }
  return pages;
}

export const StudyMaterialScreen: FC<StudyMaterialScreenProps> = ({
  deck,
  onGoBack,
  onProceedToReview,
  onUpdateDeck,
}) => {
  const [isEditing, setIsEditing] = useState(!deck.studyMaterial);
  const [material, setMaterial] = useState(deck.studyMaterial || '');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Pomodoro timer
  const POMODORO_FOCUS = 25 * 60;
  const POMODORO_BREAK = 5 * 60;
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(POMODORO_FOCUS);
  const [pomodoroPhase, setPomodoroPhase] = useState<'focus' | 'break'>('focus');
  const pomodoroStartRef = useRef<number | null>(null);
  const pomodoroElapsedRef = useRef(0);

  useEffect(() => {
    if (!pomodoroActive) return;
    pomodoroStartRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pomodoroStartRef.current!) / 1000) + pomodoroElapsedRef.current;
      const total = pomodoroPhase === 'focus' ? POMODORO_FOCUS : POMODORO_BREAK;
      const remaining = Math.max(0, total - elapsed);
      setPomodoroSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        if (pomodoroPhase === 'focus') {
          setPomodoroPhase('break');
          setPomodoroSeconds(POMODORO_BREAK);
          pomodoroElapsedRef.current = 0;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Focus session complete!', { body: 'Time for a 5-minute break.' });
          }
        } else {
          setPomodoroPhase('focus');
          setPomodoroSeconds(POMODORO_FOCUS);
          pomodoroElapsedRef.current = 0;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Break over!', { body: 'Back to studying.' });
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pomodoroActive, pomodoroPhase]);

  const togglePomodoro = () => {
    if (pomodoroActive) {
      pomodoroElapsedRef.current += Math.floor((Date.now() - pomodoroStartRef.current!) / 1000);
      setPomodoroActive(false);
    } else {
      setPomodoroActive(true);
      pomodoroStartRef.current = Date.now();
    }
  };

  const resetPomodoro = () => {
    setPomodoroActive(false);
    pomodoroElapsedRef.current = 0;
    setPomodoroSeconds(POMODORO_FOCUS);
    setPomodoroPhase('focus');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const pages = useMemo(() => splitIntoPages(material), [material]);
  const totalPages = pages.length;
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  // Reset to first page when material changes externally
  // (the editor saves → material updates → pages recompute)
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateDeck(deck.id, material);
      setIsEditing(false);
      setCurrentPage(0);
    } catch (err) {
      console.error('Failed to save study material', err);
      alert('Failed to save study material.');
    } finally {
      setIsSaving(false);
    }
  };

  const goToPrevPage = () => setCurrentPage(p => Math.max(0, p - 1));
  const goToNextPage = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 border-b border-[#2D333B] pb-4">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={onGoBack}
            className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded transition-colors cursor-pointer flex-shrink-0"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-[9px] sm:text-[10px] font-mono tracking-widest text-[#E3B341] uppercase font-bold">
                Study Material
              </span>
            </div>
            <h2 className="text-sm sm:text-lg font-bold text-white font-mono truncate">{deck.name}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-white text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase rounded border border-[#30363D] transition-colors cursor-pointer"
            >
              <Edit3 size={12} />
              <span className="hidden xs:inline">Edit Notes</span>
              <span className="xs:hidden">Edit</span>
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#3FB950] hover:bg-[#4ade80] text-[#0F1115] disabled:opacity-50 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase rounded transition-colors cursor-pointer"
            >
              <Save size={12} />
              <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          )}

          <button
            onClick={onProceedToReview}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[10px] sm:text-[11px] font-bold tracking-wider uppercase rounded transition-colors cursor-pointer"
          >
            <Play size={12} />
            <span className="hidden xs:inline">Start Flashcards</span>
            <span className="xs:hidden">Study</span>
          </button>
        </div>
      </div>

      {/* Pomodoro Timer */}
      <div className="flex items-center justify-between px-3 py-2 rounded border border-[#2D333B] bg-[#161B22]">
        <div className="flex items-center gap-2">
          <Timer size={13} className="text-[#388BFD]" />
          <span className="text-[11px] font-mono font-bold text-white tracking-wider">{formatTime(pomodoroSeconds)}</span>
          <span className="text-[8px] font-mono text-[#8B949E] tracking-wider">{pomodoroPhase === 'focus' ? 'Focus' : 'Break'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePomodoro}
            className={`p-1 rounded transition-colors cursor-pointer ${pomodoroActive ? 'text-[#F85149] hover:bg-[#F85149]/10' : 'text-[#3FB950] hover:bg-[#3FB950]/10'}`}
            title={pomodoroActive ? 'Pause' : 'Start'}
          >
            {pomodoroActive ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={resetPomodoro}
            className="p-1 rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-colors cursor-pointer"
            title="Reset"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={contentRef} className="bg-[#161B22] border border-[#30363D] rounded-lg overflow-y-auto min-h-[60vh] flex flex-col">
        {isEditing ? (
          <div className="flex-grow flex flex-col p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#8B949E] text-xs font-mono">
              <BookOpen size={14} />
              <span>Write your study notes here. Markdown is supported (e.g. **bold**, *italic*, `code`, # headings)</span>
            </div>
            <textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder={`# Introduction to VLANs\n\nA VLAN is a logical broadcast domain that can span multiple physical LAN segments...`}
              className="flex-grow w-full bg-[#0D1117] border border-[#30363D] rounded p-4 text-[#E0E0E0] text-sm font-mono focus:outline-none focus:border-[#E3B341] resize-none"
            />
          </div>
        ) : material.trim() ? (
          <>
            <div className="p-6 prose prose-invert prose-sm md:prose-base max-w-none font-sans text-[#E0E0E0] flex-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {pages[currentPage] || material}
              </ReactMarkdown>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#2D333B] bg-[#0D1117]/50">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 0}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-semibold tracking-wider uppercase rounded border border-[#30363D] transition-colors cursor-pointer"
                >
                  <ChevronLeft size={12} />
                  <span>Previous</span>
                </button>

                <span className="text-[10px] font-mono text-[#8B949E]">
                  Page <span className="text-white font-bold">{currentPage + 1}</span> / {totalPages}
                </span>

                <button
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages - 1}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-semibold tracking-wider uppercase rounded border border-[#30363D] transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-8 space-y-4 text-center">
            <BookOpen size={48} className="text-[#8B949E] opacity-50" />
            <h3 className="text-lg font-bold text-white font-mono uppercase">No Study Material Added</h3>
            <p className="text-sm text-[#8B949E] max-w-md">
              You can paste your CCNA textbook notes, documentation, or study guides here so you can review them before doing your flashcards.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-semibold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer"
            >
              Add Study Notes Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
