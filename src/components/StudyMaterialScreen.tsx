import { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, type FC } from 'react';
import { Deck, Card } from '../types';
import {
  ArrowLeft, Edit3, BookOpen, Play, ChevronLeft, ChevronRight,
  Pause, RotateCcw, Clock,
  Bold, Italic, Code, Minus, List, Quote, Heading1, Heading2, Heading3, Sparkles,
  Wand2, Loader2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateStudyMaterialFromCards } from '../utils/generateStudyMaterial';
import { createGroqClient, getAiConfig, structureStudyMaterial } from '../utils/groq';

export interface StudyMaterialScreenHandle {
  save: () => void;
}

interface StudyMaterialScreenProps {
  deck: Deck;
  cards: Card[];
  onGoBack: () => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onUpdateDeck: (deckId: string, studyMaterial: string) => Promise<void>;
}

/** Split markdown content into pages at heading (## or ### or ####) boundaries.
 *  Falls back to splitting by line count for content without headings. */
function splitIntoPages(material: string): string[] {
  if (!material.trim()) return [];

  const headingRegex = /^#{2,4}\s+.+$/gm;
  const matches = Array.from(material.matchAll(headingRegex));

  if (matches.length <= 1) {
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

  const pages: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index!;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : material.length;
    const chunk = material.slice(startIdx, endIdx).trim();
    if (chunk) pages.push(chunk);
  }
  return pages;
}

/** Estimate reading time in minutes from word count */
function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** Reusable toolbar button for the markdown editor */
const ToolbarBtn: FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-semibold text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-all cursor-pointer select-none"
  >
    {children}
  </button>
);

/** Circular SVG ring for the Pomodoro timer */
const PomodoroRing: FC<{ seconds: number; total: number; phase: 'focus' | 'break'; active: boolean }> = ({
  seconds, total, phase, active,
}) => {
  const R = 13;
  const C = 2 * Math.PI * R;
  const progress = seconds / total;
  const dash = C * progress;
  const focusColor = '#E3B341';
  const breakColor = '#3FB950';
  const color = phase === 'focus' ? focusColor : breakColor;

  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="drop-shadow">
      {/* Background track */}
      <circle cx="17" cy="17" r={R} fill="none" stroke="#2D333B" strokeWidth="3" />
      {/* Progress arc */}
      <circle
        cx="17" cy="17" r={R} fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${C}`}
        strokeDashoffset={0}
        transform="rotate(-90 17 17)"
        style={{ transition: 'stroke-dasharray 1s linear', filter: active ? `drop-shadow(0 0 4px ${color})` : 'none' }}
      />
      {/* Glow dot at progress tip */}
      {active && (
        <circle
          cx={17 + R * Math.cos((progress * 2 * Math.PI) - Math.PI / 2)}
          cy={17 + R * Math.sin((progress * 2 * Math.PI) - Math.PI / 2)}
          r="2.5"
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      )}
    </svg>
  );
};

export const StudyMaterialScreen = forwardRef<StudyMaterialScreenHandle, StudyMaterialScreenProps>(function StudyMaterialScreen({
  deck,
  cards,
  onGoBack,
  editing,
  onEditingChange,
  onUpdateDeck,
}, ref) {
  const [material, setMaterial] = useState(deck.studyMaterial || '');
  const savingRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDir, setPageDir] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);

  // AI reconstruction of messy study material
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [aiError, setAiError] = useState('');

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const estimatedMinutes = useMemo(() => readingTime(material), [material]);
  const wordCount = useMemo(() => material.trim() ? material.trim().split(/\s+/).length : 0, [material]);

  /** Insert markdown syntax at cursor position or wrap selection */
  const insertMarkdown = useCallback((syntax: string, wrap?: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = material.slice(start, end);
    let newText: string;
    let cursorPos: number;

    if (wrap) {
      // Wrapping syntax e.g. **text**
      newText = material.slice(0, start) + wrap + (selected || 'text') + wrap + material.slice(end);
      cursorPos = selected ? end + wrap.length * 2 : start + wrap.length + 4;
    } else {
      // Prefix syntax e.g. ## or - or >
      const lineStart = material.lastIndexOf('\n', start - 1) + 1;
      newText = material.slice(0, lineStart) + syntax + material.slice(lineStart);
      cursorPos = start + syntax.length;
    }

    setMaterial(newText);
    // Restore focus & cursor after React re-render
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [material]);

  /** Animated page navigation */
  const navigatePage = useCallback((dir: 'next' | 'prev') => {
    if (isAnimating) return;
    const nextIdx = dir === 'next'
      ? Math.min(totalPages - 1, currentPage + 1)
      : Math.max(0, currentPage - 1);
    if (nextIdx === currentPage) return;
    setPageDir(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentPage(nextIdx);
      setIsAnimating(false);
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  }, [isAnimating, currentPage, totalPages]);

  const goToPrevPage = () => navigatePage('prev');
  const goToNextPage = () => navigatePage('next');

  /** Keyboard ← → navigation */
  useEffect(() => {
    if (editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goToNextPage();
      if (e.key === 'ArrowLeft') goToPrevPage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, currentPage, totalPages, isAnimating]);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await onUpdateDeck(deck.id, material);
      onEditingChange(false);
      setCurrentPage(0);
    } catch (err) {
      console.error('Failed to save study material', err);
      alert('Failed to save study material.');
    } finally {
      savingRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
  }));

  const handleReconstruct = async () => {
    const original = material;
    if (!original.trim()) return;

    const aiConfig = getAiConfig();
    if (!aiConfig) {
      setAiError('AI reconstruction unavailable — API key not configured');
      return;
    }

    const confirmed = window.confirm(
      'Send your current notes to the AI and replace them with a clean, structured version?'
    );
    if (!confirmed) return;

    setIsReconstructing(true);
    setAiError('');
    try {
      const client = createGroqClient(aiConfig.apiKey, aiConfig.baseUrl);
      const rebuilt = await structureStudyMaterial(client, original, deck.name, (chunk) => {
        setMaterial(chunk);
      });
      if (rebuilt.trim()) setMaterial(rebuilt);
    } catch (err: any) {
      setMaterial(original);
      setAiError(err instanceof Error ? err.message : 'AI reconstruction failed');
    } finally {
      setIsReconstructing(false);
    }
  };

  const pomodoroTotal = pomodoroPhase === 'focus' ? POMODORO_FOCUS : POMODORO_BREAK;
  const progressPct = totalPages > 1 ? ((currentPage) / (totalPages - 1)) * 100 : 100;

  return (
    <>
      {/* Inline animation styles */}
      <style>{`
        @keyframes sms-slide-in-right { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes sms-slide-in-left  { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes sms-fade-out-left  { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-32px); } }
        @keyframes sms-fade-out-right { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(32px); } }
        @keyframes sms-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes sms-pulse-ring { 0%,100%{opacity:.6} 50%{opacity:1} }
        .sms-slide-next { animation: sms-slide-in-right 0.25s cubic-bezier(.22,.68,0,1.2) both; }
        .sms-slide-prev { animation: sms-slide-in-left  0.25s cubic-bezier(.22,.68,0,1.2) both; }
        .sms-out-left  { animation: sms-fade-out-left   0.2s ease both; }
        .sms-out-right { animation: sms-fade-out-right  0.2s ease both; }
        .sms-float     { animation: sms-float 3.5s ease-in-out infinite; }
        .sms-pom-active { animation: sms-pulse-ring 2s ease-in-out infinite; }
        .prose-study h1,.prose-study h2,.prose-study h3,.prose-study h4 {
          color: #E3B341;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-top: 1.4em;
          margin-bottom: 0.6em;
          border-bottom: 1px solid rgba(227,179,65,.15);
          padding-bottom: 0.3em;
        }
        .prose-study h1 { font-size: 1.6rem; }
        .prose-study h2 { font-size: 1.35rem; }
        .prose-study h3 { font-size: 1.15rem; color: #F0C24F; }
        .prose-study p {
          color: #E0E6ED;
          line-height: 1.85;
          font-size: 1.05rem;
          margin-bottom: 1em;
        }
        .prose-study strong { color: #F0C24F; font-weight: 700; }
        .prose-study em { color: #93C5FD; font-style: italic; }
        .prose-study code {
          background: rgba(56,139,253,.13);
          color: #93C5FD;
          font-size: 0.82em;
          padding: 0.15em 0.45em;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
        }
        .prose-study pre {
          background: #0D1117;
          border: 1px solid #30363D;
          border-radius: 8px;
          padding: 1rem;
          overflow-x: auto;
        }
        .prose-study pre code { background: none; padding: 0; color: #E0E0E0; }
        .prose-study ul, .prose-study ol {
          color: #D1D5DB;
          line-height: 1.8;
          padding-left: 1.4em;
          margin-bottom: 1em;
        }
        .prose-study li { margin-bottom: 0.3em; }
        .prose-study li::marker { color: #E3B341; }
        .prose-study blockquote {
          border-left: 3px solid #E3B341;
          background: rgba(227,179,65,.06);
          padding: 0.6rem 1rem;
          border-radius: 0 6px 6px 0;
          color: #C9A227;
          font-style: italic;
          margin: 1em 0;
        }
        .prose-study hr { border-color: #2D333B; margin: 1.5em 0; }
        .prose-study table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        .prose-study th {
          background: rgba(227,179,65,.1);
          color: #E3B341;
          padding: 0.5em 0.75em;
          text-align: left;
          border: 1px solid #30363D;
          font-weight: 600;
        }
        .prose-study td {
          color: #D1D5DB;
          padding: 0.45em 0.75em;
          border: 1px solid #2D333B;
        }
        .prose-study tr:nth-child(even) td { background: rgba(255,255,255,.02); }
        .dot-nav-btn {
          transition: all 0.25s ease;
        }
        .dot-nav-btn.active {
          background: #E3B341;
          box-shadow: 0 0 8px rgba(227,179,65,.6);
        }
        .dot-nav-btn:not(.active) {
          background: #30363D;
        }
        .dot-nav-btn:not(.active):hover {
          background: #484F58;
        }
      `}</style>

      <div className="animate-fade-in max-w-3xl w-full mx-auto flex flex-col space-y-3 h-[calc(100dvh-170px)] md:h-[calc(100vh-130px)]" ref={contentRef}>
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onGoBack}
              className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-lg transition-all cursor-pointer flex-shrink-0"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono tracking-widest text-[#E3B341] uppercase font-bold">
                  Study Material
                </span>
                <span className="flex items-center gap-1 text-[9px] font-mono text-[#8B949E]">
                  <Clock size={9} />
                  ~{estimatedMinutes} min read
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate leading-tight">{deck.name}</h2>
            </div>
          </div>

          </div>

        {/* ── Progress bar (reading progress) ── */}
        {!editing && totalPages > 1 && (
          <div className="relative h-1 bg-[#2D333B] rounded-full overflow-hidden flex-shrink-0">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #E3B341, #F0C24F)',
                boxShadow: '0 0 8px rgba(227,179,65,.5)',
              }}
            />
          </div>
        )}

        {/* ── Pomodoro Timer (Slim Header Bar) ── */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border flex-shrink-0 overflow-hidden w-full"
          style={{
            background: 'linear-gradient(135deg, #161B22 0%, #12161C 100%)',
            borderColor: pomodoroActive
              ? (pomodoroPhase === 'focus' ? 'rgba(227,179,65,.4)' : 'rgba(63,185,80,.4)')
              : '#2D333B',
            boxShadow: pomodoroActive
              ? (pomodoroPhase === 'focus' ? '0 0 12px rgba(227,179,65,.08)' : '0 0 12px rgba(63,185,80,.08)')
              : 'none',
            transition: 'all 0.4s ease',
          }}
        >
          {/* Ring */}
          <div className={`flex-shrink-0 ${pomodoroActive ? 'sms-pom-active' : ''}`}>
            <PomodoroRing
              seconds={pomodoroSeconds}
              total={pomodoroTotal}
              phase={pomodoroPhase}
              active={pomodoroActive}
            />
          </div>

          {/* Time & phase */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2">
            <span
              className="text-base sm:text-lg font-mono font-bold tracking-wider flex-shrink-0"
              style={{ color: pomodoroPhase === 'focus' ? '#E3B341' : '#3FB950' }}
            >
              {formatTime(pomodoroSeconds)}
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase px-1.5 sm:px-2 py-0.5 rounded bg-[#0D1117] border border-[#2D333B] truncate"
              style={{ color: pomodoroPhase === 'focus' ? '#C9A227' : '#2EA043' }}
            >
              {pomodoroPhase === 'focus' ? '🎯 Focus' : '☕ Break'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={togglePomodoro}
              title={pomodoroActive ? 'Pause' : 'Start'}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer flex-shrink-0"
              style={{
                background: pomodoroActive ? 'rgba(248,81,73,.12)' : 'rgba(63,185,80,.12)',
                color: pomodoroActive ? '#F85149' : '#3FB950',
                border: `1px solid ${pomodoroActive ? 'rgba(248,81,73,.25)' : 'rgba(63,185,80,.25)'}`,
              }}
            >
              {pomodoroActive ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              onClick={resetPomodoro}
              title="Reset"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white border border-[#30363D] transition-all cursor-pointer flex-shrink-0"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {/* ── Main Content Card ── */}
        <div
          className="rounded-2xl border overflow-hidden flex flex-col flex-1 min-h-0"
          style={{
            background: 'linear-gradient(160deg, #161B22 0%, #12161C 100%)',
            borderColor: '#2D333B',
            boxShadow: '0 4px 32px rgba(0,0,0,.4)',
          }}
        >
          {editing ? (
            /* ── Editor Mode ── */
            <div className="flex-grow flex flex-col">

              {/* Markdown Toolbar */}
              <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-[#2D333B] bg-[#0D1117]/60">

                {/* Generate from Cards — shown only when cards exist */}
                {cards.length > 0 && (
                  <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#2D333B]">
                    <button
                      type="button"
                      title={`Auto-build structured notes from your ${cards.length} flashcard${cards.length !== 1 ? 's' : ''}`}
                      onClick={() => {
                        const confirmed = !material.trim() ||
                          window.confirm('This will replace your existing notes with auto-generated structured notes from your flashcards. Continue?');
                        if (!confirmed) return;
                        setMaterial(generateStudyMaterialFromCards(cards));
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer select-none transition-all"
                      style={{
                        background: 'linear-gradient(135deg, rgba(227,179,65,.15), rgba(240,194,79,.1))',
                        border: '1px solid rgba(227,179,65,.35)',
                        color: '#E3B341',
                        boxShadow: '0 0 8px rgba(227,179,65,.12)',
                      }}
                    >
                      <Sparkles size={11} />
                      <span>Generate from {cards.length} Cards</span>
                    </button>
                  </div>
                )}

                {/* AI Reconstruct — rewrite messy material into a clean, structured draft */}
                <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#2D333B]">
                  <button
                    type="button"
                    disabled={isReconstructing || !material.trim()}
                    title="Send your notes to the AI and get back a clean, structured version"
                    onClick={handleReconstruct}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer select-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isReconstructing
                        ? 'linear-gradient(135deg, rgba(99,179,237,.2), rgba(88,166,255,.12))'
                        : 'linear-gradient(135deg, rgba(99,179,237,.15), rgba(88,166,255,.08))',
                      border: isReconstructing ? '1px solid rgba(99,179,237,.6)' : '1px solid rgba(99,179,237,.35)',
                      color: isReconstructing ? '#79C0FF' : '#58A6FF',
                      boxShadow: isReconstructing ? '0 0 12px rgba(99,179,237,.25)' : '0 0 8px rgba(99,179,237,.12)',
                    }}
                  >
                    {isReconstructing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                    <span>{isReconstructing ? 'Reconstructing…' : 'Reconstruct with AI'}</span>
                  </button>
                </div>

                {/* Headings group */}
                <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#2D333B]">
                  <ToolbarBtn title="Page Section (##)" onClick={() => insertMarkdown('## ')}>
                    <Heading1 size={13} />
                    <span>Section</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Sub-topic (###)" onClick={() => insertMarkdown('### ')}>
                    <Heading2 size={13} />
                    <span>Sub-topic</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Detail heading (####)" onClick={() => insertMarkdown('#### ')}>
                    <Heading3 size={13} />
                    <span>Detail</span>
                  </ToolbarBtn>
                </div>

                {/* Inline format group */}
                <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#2D333B]">
                  <ToolbarBtn title="Bold (**text**)" onClick={() => insertMarkdown('', '**')}>
                    <Bold size={13} />
                    <span>Bold</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Italic (*text*)" onClick={() => insertMarkdown('', '*')}>
                    <Italic size={13} />
                    <span>Italic</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Inline code (`code`)" onClick={() => insertMarkdown('', '`')}>
                    <Code size={13} />
                    <span>Code</span>
                  </ToolbarBtn>
                </div>

                {/* Block format group */}
                <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[#2D333B]">
                  <ToolbarBtn title="Bullet list (- item)" onClick={() => insertMarkdown('- ')}>
                    <List size={13} />
                    <span>List</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Blockquote / tip (> text)" onClick={() => insertMarkdown('> ')}>
                    <Quote size={13} />
                    <span>Quote</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="Divider (---)" onClick={() => insertMarkdown('---\n')}>
                    <Minus size={13} />
                    <span>Divider</span>
                  </ToolbarBtn>
                </div>

                {/* Word count */}
                <div className="ml-auto flex items-center gap-1 text-[9px] font-mono text-[#484F58]">
                  <span>{wordCount.toLocaleString()} words</span>
                  <span className="text-[#2D333B]">·</span>
                  <span>~{estimatedMinutes} min read</span>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder={`## CCNA-1 — History of the Internet\n\n### 1. ARPANET (1969)\n\n- Created by **ARPA** (US research agency)\n- Used **NCP** (Network Control Program)\n\n---\n\n### 2. TCP/IP (1970s)\n\n> 💡 **TCP** = Safe delivery 📦  |  **IP** = Finds the address 📍`}
                className="flex-grow w-full bg-[#0D1117] p-5 text-[#E0E0E0] text-sm font-mono focus:outline-none resize-none leading-relaxed"
                style={{ minHeight: '50vh', borderTop: 'none' }}
              />

              {aiError && (
                <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#F85149]/10 border-t border-[#F85149]/30">
                  <p className="text-[10px] font-mono text-[#F85149]">{aiError}</p>
                  <button
                    onClick={() => setAiError('')}
                    className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#F85149] hover:bg-[#F85149]/10 rounded cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ) : material.trim() ? (
            /* ── Read Mode ── */
            <>
              {/* Page content */}
              <div className="flex-1 px-8 pt-8 pb-6 overflow-y-auto">
                <div
                  key={currentPage}
                  className={`prose-study ${isAnimating
                    ? (pageDir === 'next' ? 'sms-out-left' : 'sms-out-right')
                    : (pageDir === 'next' ? 'sms-slide-next' : 'sms-slide-prev')
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {pages[currentPage] || material}
                  </ReactMarkdown>
                </div>
              </div>

              {/* ── Pagination footer ── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-4 border-t"
                  style={{ borderColor: '#1C2128', background: 'rgba(13,17,23,.6)' }}>
                  {/* Prev */}
                  <button
                    onClick={goToPrevPage}
                    disabled={currentPage === 0}
                    title="Previous page (←)"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                    style={{
                      background: '#21262D',
                      border: '1px solid #30363D',
                      color: '#C9D1D9',
                    }}
                  >
                    <ChevronLeft size={13} />
                    <span>Previous</span>
                  </button>

                  {/* Dot indicators */}
                  <div className="flex items-center gap-1.5">
                    {totalPages <= 10
                      ? pages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setPageDir(i > currentPage ? 'next' : 'prev');
                            setCurrentPage(i);
                          }}
                          className={`dot-nav-btn w-2 h-2 rounded-full cursor-pointer ${i === currentPage ? 'active' : ''}`}
                          title={`Page ${i + 1}`}
                        />
                      ))
                      : (
                        <span className="text-[11px] font-mono text-[#8B949E]">
                          Page <span className="text-white font-bold">{currentPage + 1}</span>
                          {' '}/ {totalPages}
                        </span>
                      )
                    }
                  </div>

                  {/* Next */}
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage >= totalPages - 1}
                    title="Next page (→)"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                    style={{
                      background: currentPage < totalPages - 1
                        ? 'linear-gradient(135deg, #E3B341, #F0C24F)'
                        : '#21262D',
                      border: '1px solid transparent',
                      color: currentPage < totalPages - 1 ? '#0F1115' : '#C9D1D9',
                      boxShadow: currentPage < totalPages - 1 ? '0 0 10px rgba(227,179,65,.3)' : 'none',
                    }}
                  >
                    <span>Next</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ── Empty State ── */
            <div className="flex-grow flex flex-col items-center justify-center p-10 gap-5 text-center">
              <div className="sms-float opacity-60">
                <BookOpen size={52} className="text-[#E3B341]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white tracking-tight">No Study Notes Yet</h3>
                <p className="text-sm text-[#8B949E] max-w-sm leading-relaxed">
                  Paste your textbook notes, documentation, or study guides here.<br />
                  Markdown formatting is fully supported.
                </p>
              </div>
              <button
                onClick={() => onEditingChange(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #E3B341, #F0C24F)',
                  color: '#0F1115',
                  boxShadow: '0 0 16px rgba(227,179,65,.3)',
                }}
              >
                <Edit3 size={13} />
                Add Study Notes
              </button>
            </div>
          )}
        </div>

        {/* ── Keyboard hint ── */}
        {!editing && totalPages > 1 && (
          <p className="text-center text-[9px] font-mono text-[#484F58] tracking-wider">
            Use <kbd className="px-1 py-0.5 bg-[#21262D] border border-[#30363D] rounded text-[8px]">←</kbd> / <kbd className="px-1 py-0.5 bg-[#21262D] border border-[#30363D] rounded text-[8px]">→</kbd> arrow keys to navigate pages
          </p>
        )}
      </div>
    </>
  );
});
