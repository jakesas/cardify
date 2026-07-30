import { useState, useEffect, useRef, useMemo, type FC } from 'react';
import { Card, Deck, ReviewHistory } from '../types';
import { calculateSM2, getLocalDateString, isDue } from '../utils/sm2';
import { NetworkTopologyRenderer } from './NetworkTopologyRenderer';
import { RotateCcw, Keyboard, Lightbulb, Brain, Loader2, Volume2, Star, Timer, Play, Pause, RotateCcw as ResetIcon } from 'lucide-react';
import { explainConcept, createGroqClient, getAiConfig } from '../utils/groq';
import { getSetting } from '../db/queries';
import { isFeatureAvailable } from '../utils/premium';

/** Parse {{c1::answer}} cloze markers, returning parts: text before, hidden answer, text after */
function parseCloze(text: string): { before: string; cloze: string; after: string }[] {
  const parts: { before: string; cloze: string; after: string }[] = [];
  const regex = /\{\{c\d+::([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    parts.push({ before, cloze: match[1], after: '' });
    lastIndex = match.index + match[0].length;
  }
  if (parts.length > 0) {
    parts[parts.length - 1].after = text.slice(lastIndex);
  }
  return parts;
}

interface ReviewScreenProps {
  deck: Deck;
  cards: Card[];
  reviewHistory: ReviewHistory[];
  onReviewCard: (cardId: string, rating: 1 | 2 | 3 | 4) => void;
  onToggleBookmark: (cardId: string, bookmarked: boolean) => void;
  onGoBack: () => void;
}

export const ReviewScreen: FC<ReviewScreenProps> = ({
  deck,
  cards,
  reviewHistory,
  onReviewCard,
  onToggleBookmark,
  onGoBack,
}) => {
  const todayStr = getLocalDateString();

  // Daily review limit
  const [dailyReviewLimit, setDailyReviewLimit] = useState(0);
  const todayReviews = reviewHistory.filter(h => h.timestamp.startsWith(todayStr)).length;
  const limitReached = dailyReviewLimit > 0 && todayReviews >= dailyReviewLimit;

  useEffect(() => {
    getSetting('daily_review_limit').then(val => {
      if (val) setDailyReviewLimit(parseInt(val, 10));
    });
  }, []);

  // Filter cards due today
  const [isCramMode, setIsCramMode] = useState(false);
  const dueCards = cards.filter((c) => c.deckId === deck.id && (isCramMode || isDue(c.dueDate, todayStr)));
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [aiError, setAiError] = useState('');

  // Transition states for rapid responsive feel
  const [isTransitioning, setIsTransitioning] = useState(false);

  const activeCard: Card | undefined = dueCards[currentIndex];

  // Ref for keyboard visual tip timeout
  const [showShortcutTip, setShowShortcutTip] = useState(true);

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

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside a modal or editing
      if (completed || !activeCard) return;

      const key = e.key;

      if (!isRevealed) {
        // Space or Enter reveals the card
        if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          setIsRevealed(true);
        }
      } else {
        // 1, 2, 3, 4 rates the card
        if (key === '1') {
          e.preventDefault();
          handleRate(1);
        } else if (key === '2') {
          e.preventDefault();
          handleRate(2);
        } else if (key === '3') {
          e.preventDefault();
          handleRate(3);
        } else if (key === '4') {
          e.preventDefault();
          handleRate(4);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRevealed, currentIndex, dueCards, completed, activeCard]);

  // Handle rating a card
  const handleRate = (rating: 1 | 2 | 3 | 4) => {
    if (!activeCard) return;

    // Flash a quick transition
    setIsTransitioning(true);

    setTimeout(() => {
      onReviewCard(activeCard.id, rating);
      setIsRevealed(false);
      setIsTransitioning(false);
      setExplanation('');
      setAiError('');

      if (currentIndex + 1 >= dueCards.length) {
        setCompleted(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    }, 120); // Quick 120ms snap transition for extremely fast volume reviews
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setCompleted(false);
    setIsCramMode(false);
    setExplanation('');
    setAiError('');
  };

  const handleCramAll = () => {
    setIsCramMode(true);
    setCurrentIndex(0);
    setIsRevealed(false);
    setCompleted(false);
    setExplanation('');
    setAiError('');
  };

  if (dueCards.length === 0 || completed || !activeCard || limitReached) {
    // Deck Complete Empty State
    const allDeckCards = cards.filter((c) => c.deckId === deck.id);
    const futureDueCount = allDeckCards.filter((c) => !isDue(c.dueDate, todayStr)).length;

    return (
      <div className="max-w-xl mx-auto py-10 px-4 text-center space-y-5 animate-fade-in">
        <div className="inline-flex p-3 bg-[#1F2937]/50 text-[#3FB950] rounded border border-[#30363D]">
          <RotateCcw size={24} className="animate-spin-slow" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white tracking-tight uppercase font-mono">
            {limitReached
              ? 'Daily Review Limit Reached'
              : isCramMode
              ? 'Cram Session Finished!'
              : 'Daily Reviews Completed'
            }
          </h2>
          <p className="text-xs text-[#8B949E] max-w-md mx-auto leading-relaxed">
            {limitReached
              ? `You've hit your daily target of ${dailyReviewLimit} reviews. Great work! You can increase this limit in Stats → Daily Goals & Limits.`
              : `You have reviewed all due cards in ${deck.name}. Spaced-repetition scheduling is protecting your active memory capacity.`
            }
          </p>
        </div>

        <div className="p-3 bg-[#161B22] border border-[#2D333B] rounded max-w-sm mx-auto text-left space-y-1 font-mono text-xs">
          <div className="flex justify-between text-[#8B949E]">
            <span>Total Cards in Deck:</span>
            <span className="text-white font-bold">{allDeckCards.length}</span>
          </div>
          <div className="flex justify-between text-[#8B949E]">
            <span>Scheduled for Later:</span>
            <span className="text-white font-bold">{futureDueCount} cards</span>
          </div>
          <div className="flex justify-between text-[#8B949E]">
            <span>Status:</span>
            <span className="text-[#3FB950] font-bold flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]"></span>
              <span>Fully Scheduled</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <button
            onClick={onGoBack}
            className="w-full sm:w-auto px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer"
          >
            Back to Decks
          </button>

          {futureDueCount > 0 && (
            <button
              onClick={handleCramAll}
              className="w-full sm:w-auto px-4 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
            >
              Cram Ahead ({futureDueCount} remaining)
            </button>
          )}

          <button
            onClick={handleRestart}
            className="w-full sm:w-auto px-4 py-2 text-[#8B949E] hover:text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  // Pre-calculate the exact next intervals for each SM-2 choice so the student makes informed decisions
  const getIntervalPreview = (rating: 1 | 2 | 3 | 4) => {
    const nextState = calculateSM2(
      rating,
      activeCard.reps,
      activeCard.interval,
      activeCard.easeFactor
    );
    if (nextState.interval === 1) return '1d';
    return `${nextState.interval}d`;
  };

  const handleExplain = async () => {
    if (!activeCard) return;

    const premiumAvailable = await isFeatureAvailable();
    if (!premiumAvailable) { setAiError('AI explanation is a premium feature — upgrade to use it'); setIsExplaining(false); return; }

    setIsExplaining(true);
    setExplanation('');
    setAiError('');
    try {
      const aiConfig = getAiConfig();
      if (!aiConfig) { setAiError('AI explanation unavailable — API key not configured'); setIsExplaining(false); return; }
      const client = createGroqClient(aiConfig.apiKey, aiConfig.baseUrl);
      await explainConcept(client, activeCard.front, activeCard.back, (chunk) => {
        setExplanation(chunk);
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI Explanation failed');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleBookmark = () => {
    if (!activeCard) return;
    onToggleBookmark(activeCard.id, !activeCard.bookmarked);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Review Header Navigation */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
        <div className="flex items-center space-x-2">
          <button
            onClick={onGoBack}
            className="text-[10px] font-bold uppercase tracking-wider text-[#8B949E] hover:text-white transition-colors cursor-pointer"
          >
            ← Leave Session
          </button>
          <span className="text-[#484F58] font-mono">/</span>
          <span className="text-[10px] font-mono text-[#8B949E] truncate max-w-xs" title={deck.name}>
            {deck.name.toUpperCase()}
          </span>
          {isCramMode && (
            <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20 rounded uppercase">
              Cram Mode
            </span>
          )}
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center space-x-2">
          <div className="text-[10px] font-mono text-[#8B949E]">
            REVIEW <span className="text-white font-bold">{currentIndex + 1}</span> OF{' '}
            <span className="text-[#8B949E] font-bold">{dueCards.length}</span>
          </div>
          <div className="w-16 h-1.5 rounded bg-[#161B22] border border-[#30363D] overflow-hidden">
            <div
              className="h-full bg-[#E3B341] transition-all duration-150"
              style={{ width: `${((currentIndex + 1) / dueCards.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Card Content Stage with Spacing and Clean Shadows */}
      <div
        className={`relative rounded border border-[#2D333B] bg-[#161B22] p-5 md:p-6 shadow-xl min-h-[300px] flex flex-col justify-between transition-all duration-120 ${
          isTransitioning ? 'opacity-30 scale-[0.99]' : 'opacity-100 scale-100'
        }`}
      >
        {/* Card Front Content */}
        <div className="space-y-4 flex-grow">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
                {activeCard.tag}
              </span>
              <button
                onClick={handleToggleBookmark}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  activeCard.bookmarked
                    ? 'text-[#E3B341] hover:text-[#F0C24F]'
                    : 'text-[#484F58] hover:text-[#8B949E]'
                }`}
                title={activeCard.bookmarked ? 'Remove bookmark' : 'Bookmark this card'}
              >
                <Star size={12} fill={activeCard.bookmarked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => handleSpeak(activeCard.front)}
                className="p-1 rounded text-[#484F58] hover:text-[#58A6FF] transition-colors cursor-pointer"
                title="Read aloud"
              >
                <Volume2 size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#8B949E]">
              <span>INT: {activeCard.interval}D</span>
              <span>EF: {activeCard.easeFactor}</span>
            </div>
          </div>

          <div className="space-y-3">
            {activeCard.cardType === 'cloze' ? (
              /* Cloze: render hidden parts as [...] before reveal, full text after */
              (() => {
                const parts = parseCloze(activeCard.front);
                if (parts.length === 0) {
                  return <h3 className="text-base md:text-lg font-bold text-white leading-relaxed tracking-tight font-mono">{activeCard.front}</h3>;
                }
                return (
                  <h3 className="text-base md:text-lg font-bold text-white leading-relaxed tracking-tight font-mono">
                    {parts.map((p, i) => (
                      <span key={i}>
                        {p.before}
                        {isRevealed ? (
                          <span className="text-[#388BFD] bg-[#388BFD]/10 px-1 rounded">{p.cloze}</span>
                        ) : (
                          <span className="text-[#E3B341] bg-[#E3B341]/10 px-2 rounded select-none">[...]</span>
                        )}
                        {i === parts.length - 1 && p.after}
                      </span>
                    ))}
                  </h3>
                );
              })()
            ) : (
              <h3 className="text-base md:text-lg font-bold text-white leading-relaxed tracking-tight font-mono">
                {activeCard.front}
              </h3>
            )}

            {/* Topology renderer if provided */}
            {activeCard.topology && (
              <div className="pt-1 border border-[#30363D] rounded bg-[#0D1117] p-2">
                <NetworkTopologyRenderer topology={activeCard.topology} />
              </div>
            )}

            {/* Code Snippet if provided (Front has it sometimes or only back) */}
            {activeCard.codeSnippet && !isRevealed && (
              <div className="rounded border border-[#30363D] bg-[#0D1117] p-3 font-mono text-[11px] text-[#E0E0E0] overflow-x-auto">
                <pre>{activeCard.codeSnippet.code}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Revealed Answer Box */}
        {isRevealed ? (
          <div className="mt-6 pt-5 border-t border-[#2D333B] space-y-3 animate-fade-in flex-grow">
            {activeCard.cardType === 'cloze' ? (
              activeCard.back.trim() ? (
                <>
                  <div className="flex items-center space-x-1.5 text-[#8B949E]">
                    <Lightbulb size={12} />
                    <span className="text-[9px] font-mono tracking-widest uppercase font-bold">Extra Notes</span>
                  </div>
                  <div className="text-xs text-[#8B949E] leading-relaxed whitespace-pre-line font-mono">
                    {activeCard.back}
                  </div>
                </>
              ) : null
            ) : (
              <>
              <div className="flex items-center space-x-1.5 text-[#E3B341]">
                <Lightbulb size={12} />
                <span className="text-[9px] font-mono tracking-widest uppercase font-bold">Verified Answer Solution</span>
                <button
                  onClick={() => handleSpeak(activeCard.back)}
                  className="ml-1 p-0.5 rounded text-[#484F58] hover:text-[#58A6FF] transition-colors cursor-pointer"
                  title="Read answer aloud"
                >
                  <Volume2 size={10} />
                </button>
              </div>

              <div className="text-xs text-[#E0E0E0] leading-relaxed space-y-2 whitespace-pre-line font-mono">
                {/* Render answer details. If they have a config snippet, render code box */}
                {activeCard.back.split('\n\n```').map((block, i) => {
                  if (i > 0 && block.includes('\n')) {
                    const parts = block.split('```');
                    const codeContent = parts[0];
                    const remainingText = parts[1] || '';

                    // Strip language identifier e.g., "ios" or "json" from first line
                    const lines = codeContent.split('\n');
                    const hasLang = ['ios', 'json', 'bash', 'yaml'].includes(lines[0].trim());
                    const finalCode = hasLang ? lines.slice(1).join('\n') : codeContent;

                    return (
                      <div key={i} className="space-y-2">
                        <div className="rounded border border-[#30363D] bg-[#0D1117] p-3 font-mono text-[11px] text-[#388BFD] overflow-x-auto">
                          <pre>{finalCode.trim()}</pre>
                        </div>
                        {remainingText && <p>{remainingText.trim()}</p>}
                      </div>
                    );
                  }
                  return <p key={i}>{block}</p>;
                })}
              </div>
              </>
            )}

            {/* AI Tutor Explanation Section */}
            <div className="mt-4 pt-4 border-t border-[#2D333B]/50">
              {!explanation && !isExplaining && (
                <button
                  onClick={handleExplain}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded border border-[#30363D] transition-colors cursor-pointer text-[10px] font-mono uppercase font-bold"
                >
                  <Brain size={14} className="text-[#388BFD]" />
                  <span>Ask AI Tutor to Explain This</span>
                  <span className="px-1 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] text-[7px] font-bold font-mono uppercase tracking-wider leading-none">Premium</span>
                </button>
              )}
              {(isExplaining || explanation || aiError) && (
                <div className="p-3 bg-[#0D1117] border border-[#30363D] rounded space-y-2 mt-2">
                  <div className="flex items-center space-x-2 text-[#388BFD]">
                    {isExplaining ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                    <span className="text-[9px] font-mono tracking-widest uppercase font-bold">
                      {isExplaining ? 'AI Tutor is thinking...' : 'AI Tutor Explanation'}
                    </span>
                  </div>
                  {aiError ? (
                    <p className="text-xs text-[#F85149] font-mono">{aiError}</p>
                  ) : (
                    <p className="text-[11px] text-[#E0E0E0] font-mono whitespace-pre-line leading-relaxed">
                      {explanation}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        ) : (
          /* Reveal CTA Section */
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setIsRevealed(true)}
              className="px-6 py-2 bg-[#21262D] hover:bg-[#30363D] text-[#388BFD] hover:text-white text-xs font-bold tracking-widest uppercase rounded border border-[#30363D] transition-all cursor-pointer shadow-lg active:scale-95 font-mono"
            >
              Reveal Answer <span className="ml-1 text-[#8B949E] text-[10px] font-normal">[SPACE]</span>
            </button>
          </div>
        )}
      </div>

      {/* Keyboard Hint Overlay Tip */}
      {showShortcutTip && (
        <div className="flex items-start sm:items-center justify-between gap-2 p-2 sm:p-2.5 rounded border border-[#2D333B] bg-[#161B22] text-[#8B949E] text-[9px] sm:text-[10px] font-mono">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Keyboard size={12} className="text-[#E3B341] flex-shrink-0" />
            <span>KEYBOARD SHORTCUTS:</span>
            <span className="text-white bg-[#0D1117] px-1 py-0.5 rounded border border-[#30363D] font-bold text-[8px] sm:text-[9px]">Space</span>
            <span>Reveal,</span>
            <span className="text-white bg-[#0D1117] px-1 py-0.5 rounded border border-[#30363D] font-bold text-[8px] sm:text-[9px]">1-4</span>
            <span>Rate</span>
          </div>
          <button
            onClick={() => setShowShortcutTip(false)}
            className="text-[8px] sm:text-[9px] text-[#8B949E] hover:text-white cursor-pointer hover:underline flex-shrink-0"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Pomodoro Timer */}
      <div className="flex items-center justify-between p-2 sm:p-2.5 rounded border border-[#2D333B] bg-[#161B22]">
        <div className="flex items-center gap-2">
          <Timer size={12} className="text-[#388BFD]" />
          <span className="text-[10px] font-mono font-bold text-white tracking-wider">{formatTime(pomodoroSeconds)}</span>
          <span className="text-[8px] font-mono text-[#8B949E] uppercase tracking-wider">{pomodoroPhase === 'focus' ? 'Focus' : 'Break'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePomodoro}
            className={`p-1 rounded transition-colors cursor-pointer ${pomodoroActive ? 'text-[#F85149] hover:bg-[#F85149]/10' : 'text-[#3FB950] hover:bg-[#3FB950]/10'}`}
            title={pomodoroActive ? 'Pause' : 'Start'}
          >
            {pomodoroActive ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            onClick={resetPomodoro}
            className="p-1 rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-colors cursor-pointer"
            title="Reset"
          >
            <ResetIcon size={12} />
          </button>
        </div>
      </div>

      {/* Rating Control Actions Grid (Shown only after answer is revealed) */}
      {isRevealed && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 animate-slide-up">
          {/* Rating Option 1: Again */}
          <button
            onClick={() => handleRate(1)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#F85149]/30 hover:border-[#F85149] bg-[#161B22] hover:bg-[#F85149]/5 group transition-colors cursor-pointer"
          >
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#F85149] transition-colors">
              Again <span className="text-[9px] text-[#8B949E] font-normal">[1]</span>
            </span>
            <span className="text-xs font-bold text-[#F85149] mt-0.5">Failed</span>
            <span className="text-[9px] font-mono text-[#8B949E]">({getIntervalPreview(1)})</span>
          </button>

          {/* Rating Option 2: Hard */}
          <button
            onClick={() => handleRate(2)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#E3B341]/30 hover:border-[#E3B341] bg-[#161B22] hover:bg-[#E3B341]/5 group transition-colors cursor-pointer"
          >
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#E3B341] transition-colors">
              Hard <span className="text-[9px] text-[#8B949E] font-normal">[2]</span>
            </span>
            <span className="text-xs font-bold text-[#E3B341] mt-0.5">Hesitant</span>
            <span className="text-[9px] font-mono text-[#8B949E]">({getIntervalPreview(2)})</span>
          </button>

          {/* Rating Option 3: Good */}
          <button
            onClick={() => handleRate(3)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#3FB950]/30 hover:border-[#3FB950] bg-[#161B22] hover:bg-[#3FB950]/5 group transition-colors cursor-pointer"
          >
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#3FB950] transition-colors">
              Good <span className="text-[9px] text-[#8B949E] font-normal">[3]</span>
            </span>
            <span className="text-xs font-bold text-[#3FB950] mt-0.5">Recalled</span>
            <span className="text-[9px] font-mono text-[#8B949E]">({getIntervalPreview(3)})</span>
          </button>

          {/* Rating Option 4: Easy */}
          <button
            onClick={() => handleRate(4)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#388BFD]/30 hover:border-[#388BFD] bg-[#161B22] hover:bg-[#388BFD]/5 group transition-colors cursor-pointer"
          >
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#388BFD] transition-colors">
              Easy <span className="text-[9px] text-[#8B949E] font-normal">[4]</span>
            </span>
            <span className="text-xs font-bold text-[#388BFD] mt-0.5">Instant</span>
            <span className="text-[9px] font-mono text-[#8B949E]">({getIntervalPreview(4)})</span>
          </button>
        </div>
      )}
    </div>
  );
};
