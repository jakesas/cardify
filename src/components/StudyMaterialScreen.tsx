import { useState, useMemo, useRef, useEffect, useCallback, type FC } from 'react';
import { Deck } from '../types';
import {
  ArrowLeft, Edit3, Save, BookOpen, Play, ChevronLeft, ChevronRight,
  Timer, Pause, RotateCcw, Clock, Zap,
} from 'lucide-react';
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

/** Circular SVG ring for the Pomodoro timer */
const PomodoroRing: FC<{ seconds: number; total: number; phase: 'focus' | 'break'; active: boolean }> = ({
  seconds, total, phase, active,
}) => {
  const R = 28;
  const C = 2 * Math.PI * R;
  const progress = seconds / total;
  const dash = C * progress;
  const focusColor = '#E3B341';
  const breakColor = '#3FB950';
  const color = phase === 'focus' ? focusColor : breakColor;

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="drop-shadow-lg">
      {/* Background track */}
      <circle cx="36" cy="36" r={R} fill="none" stroke="#2D333B" strokeWidth="4" />
      {/* Progress arc */}
      <circle
        cx="36" cy="36" r={R} fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${C}`}
        strokeDashoffset={0}
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dasharray 1s linear', filter: active ? `drop-shadow(0 0 6px ${color})` : 'none' }}
      />
      {/* Glow dot at progress tip */}
      {active && (
        <circle
          cx={36 + R * Math.cos((progress * 2 * Math.PI) - Math.PI / 2)}
          cy={36 + R * Math.sin((progress * 2 * Math.PI) - Math.PI / 2)}
          r="3"
          fill={color}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
    </svg>
  );
};

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
  const [pageDir, setPageDir] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);

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
  const estimatedMinutes = useMemo(() => readingTime(material), [material]);

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
    if (isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goToNextPage();
      if (e.key === 'ArrowLeft') goToPrevPage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, currentPage, totalPages, isAnimating]);

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
        .prose-study h1 { font-size: 1.45rem; }
        .prose-study h2 { font-size: 1.2rem; }
        .prose-study h3 { font-size: 1.05rem; color: #F0C24F; }
        .prose-study p {
          color: #D1D5DB;
          line-height: 1.85;
          font-size: 0.97rem;
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

      <div className="animate-fade-in max-w-3xl mx-auto space-y-4" ref={contentRef}>
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-white text-[10px] font-semibold tracking-wider uppercase rounded-lg border border-[#30363D] transition-all cursor-pointer"
              >
                <Edit3 size={11} />
                <span>Edit</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3FB950] hover:bg-[#4ade80] text-[#0F1115] disabled:opacity-50 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all cursor-pointer"
              >
                <Save size={11} />
                <span>{isSaving ? 'Saving…' : 'Save'}</span>
              </button>
            )}

            <button
              onClick={onProceedToReview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer text-[#0F1115]"
              style={{
                background: 'linear-gradient(135deg, #E3B341 0%, #F0C24F 100%)',
                boxShadow: '0 0 12px rgba(227,179,65,.35)',
              }}
            >
              <Zap size={11} />
              <span>Start Flashcards</span>
            </button>
          </div>
        </div>

        {/* ── Progress bar (reading progress) ── */}
        {!isEditing && totalPages > 1 && (
          <div className="relative h-1 bg-[#2D333B] rounded-full overflow-hidden">
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

        {/* ── Pomodoro Timer ── */}
        <div
          className="flex items-center gap-4 px-4 py-3 rounded-xl border"
          style={{
            background: 'linear-gradient(135deg, #161B22 0%, #12161C 100%)',
            borderColor: pomodoroActive
              ? (pomodoroPhase === 'focus' ? 'rgba(227,179,65,.4)' : 'rgba(63,185,80,.4)')
              : '#2D333B',
            boxShadow: pomodoroActive
              ? (pomodoroPhase === 'focus' ? '0 0 16px rgba(227,179,65,.08)' : '0 0 16px rgba(63,185,80,.08)')
              : 'none',
            transition: 'all 0.4s ease',
          }}
        >
          {/* Ring */}
          <div className={pomodoroActive ? 'sms-pom-active' : ''}>
            <PomodoroRing
              seconds={pomodoroSeconds}
              total={pomodoroTotal}
              phase={pomodoroPhase}
              active={pomodoroActive}
            />
          </div>

          {/* Time & phase */}
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="text-2xl font-mono font-bold tracking-wider"
                style={{ color: pomodoroPhase === 'focus' ? '#E3B341' : '#3FB950' }}
              >
                {formatTime(pomodoroSeconds)}
              </span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase"
                style={{ color: pomodoroPhase === 'focus' ? '#C9A227' : '#2EA043' }}
              >
                {pomodoroPhase === 'focus' ? '🎯 Focus' : '☕ Break'}
              </span>
            </div>
            <p className="text-[9px] font-mono text-[#484F58] tracking-wide mt-0.5">
              {pomodoroPhase === 'focus' ? 'Stay focused — you\'ve got this!' : 'Rest up, you earned it.'}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={togglePomodoro}
              title={pomodoroActive ? 'Pause' : 'Start'}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer"
              style={{
                background: pomodoroActive ? 'rgba(248,81,73,.12)' : 'rgba(63,185,80,.12)',
                color: pomodoroActive ? '#F85149' : '#3FB950',
                border: `1px solid ${pomodoroActive ? 'rgba(248,81,73,.25)' : 'rgba(63,185,80,.25)'}`,
              }}
            >
              {pomodoroActive ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={resetPomodoro}
              title="Reset"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white border border-[#30363D] transition-all cursor-pointer"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* ── Main Content Card ── */}
        <div
          className="rounded-2xl border overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(160deg, #161B22 0%, #12161C 100%)',
            borderColor: '#2D333B',
            boxShadow: '0 4px 32px rgba(0,0,0,.4)',
            minHeight: '58vh',
          }}
        >
          {isEditing ? (
            /* ── Editor Mode ── */
            <div className="flex-grow flex flex-col p-5 gap-3">
              <div className="flex items-center gap-2 text-[#8B949E] text-xs font-mono pb-2 border-b border-[#2D333B]">
                <BookOpen size={13} />
                <span>Markdown supported · <strong className="text-[#E3B341]">**bold**</strong>, <em className="text-[#93C5FD] not-italic">*italic*</em>, <code className="bg-[#0D1117] px-1 rounded text-[#93C5FD]">`code`</code>, ## Heading</span>
              </div>
              <textarea
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder={`## Introduction\n\nSubnet Mask – Defines the network and host portions...\n\n## Key Concepts\n\n- **VLAN** – A logical broadcast domain\n- **DHCP** – Automatically assigns IP addresses`}
                className="flex-grow w-full bg-[#0D1117] border border-[#30363D] rounded-xl p-4 text-[#E0E0E0] text-sm font-mono focus:outline-none focus:border-[#E3B341] resize-none leading-relaxed"
                style={{ minHeight: '52vh', transition: 'border-color 0.2s ease' }}
              />
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
                onClick={() => setIsEditing(true)}
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
        {!isEditing && totalPages > 1 && (
          <p className="text-center text-[9px] font-mono text-[#484F58] tracking-wider">
            Use <kbd className="px-1 py-0.5 bg-[#21262D] border border-[#30363D] rounded text-[8px]">←</kbd> / <kbd className="px-1 py-0.5 bg-[#21262D] border border-[#30363D] rounded text-[8px]">→</kbd> arrow keys to navigate pages
          </p>
        )}
      </div>
    </>
  );
};
