import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import { Card, Deck } from '../types';
import { Clock, CheckCircle2, XCircle, Trophy, Flag, ArrowLeft } from 'lucide-react';

interface ExamScreenProps {
  deck: Deck;
  cards: Card[];
  onGoBack: () => void;
}

interface ExamQuestion {
  cardId: string;
  question: string;
  correctAnswer: string;
  options: string[];
  tag: string;
  domain: string;
}

const DURATIONS = [15, 30, 45, 60];
const PASS_THRESHOLD = 0.7;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(deckCards: Card[]): ExamQuestion[] {
  return shuffle(deckCards).map(card => {
    const sameTag = deckCards.filter(c => c.tag === card.tag && c.back !== card.back);
    const other = deckCards.filter(c => c.tag !== card.tag && c.back !== card.back);
    const shuffledSame = shuffle(sameTag);
    const shuffledOther = shuffle(other);

    const wrongOptions: string[] = [];
    for (const pool of [shuffledSame, shuffledOther]) {
      for (const c of pool) {
        if (wrongOptions.length >= 3) break;
        if (!wrongOptions.includes(c.back)) {
          wrongOptions.push(c.back);
        }
      }
      if (wrongOptions.length >= 3) break;
    }

    const filler = ['Not enough information provided', 'Configurations are all correct as given'];
    while (wrongOptions.length < 3 && filler.length > 0) {
      wrongOptions.push(filler.shift()!);
    }

    const options = shuffle([card.back, ...wrongOptions.slice(0, 3)]);

    return {
      cardId: card.id,
      question: card.front,
      correctAnswer: card.back,
      options,
      tag: card.tag,
      domain: card.tag,
    };
  });
}

export const ExamScreen: FC<ExamScreenProps> = ({ deck, cards, onGoBack }) => {
  const [phase, setPhase] = useState<'setup' | 'exam' | 'results'>('setup');
  const [duration, setDuration] = useState(30);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, { selected: string; correct: boolean; flagged: boolean }>>(new Map());
  const [timeLeft, setTimeLeft] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startExam = () => {
    const qs = buildQuestions(cards.filter(c => c.deckId === deck.id));
    if (qs.length === 0) return;
    setQuestions(qs);
    setTimeLeft(duration * 60);
    setPhase('exam');
    setAnswers(new Map());
    setFlagged(new Set());
    setCurrentIdx(0);
    setSelectedAnswer(null);
  };

  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase('results');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const handleAnswer = (option: string) => {
    if (!questions[currentIdx] || selectedAnswer) return;
    setSelectedAnswer(option);
    const q = questions[currentIdx];
    setAnswers(prev => {
      const next = new Map(prev);
      next.set(q.cardId, { selected: option, correct: option === q.correctAnswer, flagged: flagged.has(q.cardId) });
      return next;
    });
  };

  const nextQuestion = () => {
    setSelectedAnswer(null);
    if (currentIdx + 1 >= questions.length) {
      setPhase('results');
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      setCurrentIdx(prev => prev + 1);
    }
  };

  const toggleFlag = () => {
    const q = questions[currentIdx];
    if (!q) return;
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(q.cardId)) next.delete(q.cardId);
      else next.add(q.cardId);
      return next;
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (phase === 'setup') {
    const deckCards = cards.filter(c => c.deckId === deck.id);
    const questionCount = Math.min(deckCards.length, 50);

    return (
      <div className="max-w-lg mx-auto py-10 space-y-6 animate-fade-in">
        <div className="flex items-center space-x-2 pb-3 border-b border-[#2D333B]">
          <button onClick={onGoBack} className="p-1 hover:bg-[#21262D] rounded text-[#8B949E] hover:text-white transition-colors cursor-pointer border border-[#30363D]">
            <ArrowLeft size={14} />
          </button>
          <span className="text-[9px] font-mono tracking-widest text-[#8B949E] uppercase font-bold">Exam Setup</span>
        </div>

        <div className="p-5 rounded border border-[#2D333B] bg-[#161B22] space-y-5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white font-mono uppercase">{deck.name}</h2>
            <p className="text-[10px] font-mono text-[#8B949E]">{questionCount} questions available</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase block font-bold">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`px-4 py-2 rounded text-sm font-mono font-bold transition-colors cursor-pointer ${duration === d ? 'bg-[#E3B341] text-[#0F1115]' : 'bg-[#0D1117] text-[#8B949E] hover:text-white border border-[#30363D]'}`}>
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded bg-[#0D1117] border border-[#30363D] space-y-1 text-[10px] font-mono text-[#8B949E]">
            <p>• {questionCount} multiple-choice questions</p>
            <p>• {duration} minute timer</p>
            <p>• Pass threshold: {Math.round(PASS_THRESHOLD * 100)}%</p>
            <p>• Domain breakdown in results</p>
          </div>

          <button onClick={startExam} disabled={questionCount === 0}
            className="w-full py-2.5 bg-[#E3B341] hover:bg-[#F0C24F] disabled:bg-[#2D333B] disabled:text-[#484F58] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
            {questionCount === 0 ? 'Not enough cards' : 'Start Exam'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    const correctCount = Array.from(answers.values()).filter(a => a.correct).length;
    const total = questions.length;
    const score = total > 0 ? correctCount / total : 0;
    const passed = score >= PASS_THRESHOLD;
    const domainMap = new Map<string, { correct: number; total: number }>();
    questions.forEach(q => {
      const entry = domainMap.get(q.domain) || { correct: 0, total: 0 };
      entry.total++;
      const ans = answers.get(q.cardId);
      if (ans?.correct) entry.correct++;
      domainMap.set(q.domain, entry);
    });

    return (
      <div className="max-w-lg mx-auto py-10 space-y-5 animate-fade-in">
        <div className="text-center space-y-3">
          <div className={`inline-flex p-3 rounded-full ${passed ? 'bg-[#3FB950]/10 text-[#3FB950]' : 'bg-[#F85149]/10 text-[#F85149]'}`}>
            {passed ? <Trophy size={28} /> : <XCircle size={28} />}
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white font-mono uppercase">{passed ? 'Passed!' : 'Not Passed'}</h2>
            <p className="text-[11px] font-mono text-[#8B949E]">{correctCount}/{total} correct ({Math.round(score * 100)}%) — threshold {Math.round(PASS_THRESHOLD * 100)}%</p>
          </div>
        </div>

        {flagged.size > 0 && (
          <div className="p-3 rounded border border-[#E3B341]/30 bg-[#E3B341]/10 text-[10px] font-mono text-[#E3B341]">
            {flagged.size} question{flagged.size > 1 ? 's' : ''} flagged for review
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-[10px] font-mono tracking-wider text-[#8B949E] uppercase font-bold">Domain Breakdown</h3>
          <div className="space-y-1.5">
            {Array.from(domainMap.entries()).sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total)).map(([domain, stats]) => (
              <div key={domain} className="flex items-center justify-between p-2 rounded bg-[#0D1117] border border-[#30363D]">
                <span className="text-[10px] font-mono text-[#8B949E] truncate mr-2">{domain}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-24 h-1.5 rounded bg-[#1C2128] overflow-hidden">
                    <div className={`h-full rounded ${stats.correct / stats.total >= 0.7 ? 'bg-[#3FB950]' : stats.correct / stats.total >= 0.5 ? 'bg-[#E3B341]' : 'bg-[#F85149]'}`}
                      style={{ width: `${(stats.correct / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-[#8B949E] min-w-[60px] text-right">
                    {stats.correct}/{stats.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onGoBack} className="flex-1 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer">
            Back to Decks
          </button>
          <button onClick={() => setPhase('setup')} className="flex-1 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  if (!currentQ) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center text-[#8B949E] font-mono text-xs">
        No questions available.
      </div>
    );
  }

  const currentAnswer = answers.get(currentQ.cardId);

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header: progress + timer */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
        <div className="flex items-center space-x-2">
          <button onClick={onGoBack} className="text-[10px] font-bold uppercase tracking-wider text-[#8B949E] hover:text-white transition-colors cursor-pointer">
            ← Exit Exam
          </button>
          <span className="text-[#484F58] font-mono">/</span>
          <span className="text-[10px] font-mono text-[#8B949E] truncate max-w-xs">{deck.name}</span>
        </div>
        <div className={`flex items-center gap-2 font-mono text-xs font-bold ${timeLeft <= 60 ? 'text-[#F85149]' : 'text-white'}`}>
          <Clock size={14} />
          <span>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded bg-[#161B22] border border-[#30363D] overflow-hidden">
        <div className="h-full bg-[#388BFD] transition-all duration-200" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="text-[9px] font-mono text-[#8B949E] text-right">
        Question {currentIdx + 1} of {questions.length}
      </div>

      {/* Question card */}
      <div className="p-5 rounded border border-[#2D333B] bg-[#161B22] space-y-4 min-h-[200px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
              {currentQ.domain}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
              #{currentIdx + 1}
            </span>
          </div>
          <button onClick={toggleFlag}
            className={`p-1 rounded transition-colors cursor-pointer ${flagged.has(currentQ.cardId) ? 'text-[#E3B341] bg-[#E3B341]/10' : 'text-[#8B949E] hover:text-white'}`}
            title="Flag for review">
            <Flag size={14} />
          </button>
        </div>

        <p className="text-sm font-bold text-white leading-relaxed font-mono">{currentQ.question}</p>

        <div className="space-y-1.5">
          {currentQ.options.map((opt, idx) => {
            let btnStyle = 'border-[#30363D] hover:border-[#388BFD] hover:bg-[#388BFD]/5 text-white';
            if (selectedAnswer) {
              if (opt === currentQ.correctAnswer) {
                btnStyle = 'border-[#3FB950] bg-[#3FB950]/10 text-[#3FB950]';
              } else if (opt === selectedAnswer && opt !== currentQ.correctAnswer) {
                btnStyle = 'border-[#F85149] bg-[#F85149]/10 text-[#F85149]';
              } else {
                btnStyle = 'border-[#30363D] text-[#484F58]';
              }
            }
            return (
              <button key={idx} onClick={() => handleAnswer(opt)} disabled={!!selectedAnswer}
                className={`w-full text-left px-3 py-2.5 rounded border text-xs font-mono leading-relaxed transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}>
                <span className="text-[#8B949E] mr-2">{String.fromCharCode(65 + idx)}.</span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Next / finish */}
      {selectedAnswer && (
        <button onClick={nextQuestion}
          className="w-full py-2.5 bg-[#388BFD] hover:bg-[#4A9BFD] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer">
          {currentIdx + 1 >= questions.length ? 'View Results' : 'Next Question'}
        </button>
      )}

      {flagged.size > 0 && (
        <div className="text-[9px] font-mono text-[#E3B341] text-center">{flagged.size} flagged</div>
      )}
    </div>
  );
};
