import { useState, useEffect, useCallback, type FC } from 'react';
import { Card, Deck } from '../types';
import { Clock, CheckCircle2, XCircle, Trophy, Zap } from 'lucide-react';

interface QuizScreenProps {
  deck: Deck;
  cards: Card[];
  onGoBack: () => void;
}

interface QuizQuestion {
  cardId: string;
  question: string;
  correctAnswer: string;
  options: string[];
  tag: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(deckCards: Card[]): QuizQuestion[] {
  const allBacks = deckCards.map(c => c.back).filter(Boolean);

  return shuffle(deckCards).map(card => {
    const wrongPool = allBacks.filter(b => b !== card.back);
    let wrongOptions: string[] = [];
    if (wrongPool.length >= 3) {
      wrongOptions = shuffle(wrongPool).slice(0, 3);
    } else {
      const filler = ['None of the above', 'All of the above', 'This is a distractor'];
      wrongOptions = [...wrongPool, ...filler].slice(0, 3);
    }
    const options = shuffle([card.back, ...wrongOptions]);
    return {
      cardId: card.id,
      question: card.front,
      correctAnswer: card.back,
      options,
      tag: card.tag,
    };
  });
}

export const QuizScreen: FC<QuizScreenProps> = ({ deck, cards, onGoBack }) => {
  const deckCards = cards.filter(c => c.deckId === deck.id);
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => buildQuestions(deckCards));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);

  const currentQ = questions[currentIdx];

  const startQuiz = useCallback(() => {
    setQuestions(buildQuestions(deckCards));
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setScore(0);
    setCompleted(false);
    setTimeLeft(questions.length * 30);
    setQuizStarted(true);
  }, [deckCards, questions.length]);

  useEffect(() => {
    if (!quizStarted || completed) return;
    if (timeLeft <= 0) {
      setCompleted(true);
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [quizStarted, completed, timeLeft]);

  const handleSelect = (option: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(option);
    const correct = option === currentQ.correctAnswer;
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (currentIdx + 1 >= questions.length) {
      setCompleted(true);
    } else {
      setCurrentIdx(i => i + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (!quizStarted) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4 text-center space-y-5 animate-fade-in">
        <div className="inline-flex p-3 bg-[#161B22] rounded border border-[#2D333B] text-[#E3B341]">
          <Zap size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase font-mono">Quiz Mode</h2>
          <p className="text-xs text-[#8B949E] font-mono max-w-md mx-auto">
            Multiple-choice questions generated from your <span className="text-[#E3B341] font-bold">{deck.name}</span> cards.
            {deckCards.length} questions available. You have {deckCards.length * 30} seconds total.
          </p>
        </div>
        <button
          onClick={startQuiz}
          className="px-6 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
        >
          Start Quiz
        </button>
        <button
          onClick={onGoBack}
          className="block mx-auto text-[10px] font-mono text-[#8B949E] hover:text-white transition-colors cursor-pointer"
        >
          ← Back to Decks
        </button>
      </div>
    );
  }

  if (completed) {
    const pct = Math.round((score / questions.length) * 100);
    const grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    return (
      <div className="max-w-xl mx-auto py-10 px-4 text-center space-y-5 animate-fade-in">
        <Trophy size={48} className="mx-auto text-[#E3B341]" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white uppercase font-mono">Quiz Complete</h2>
          <p className="text-3xl font-bold text-[#E3B341] font-mono">{score} / {questions.length}</p>
          <p className="text-sm font-mono text-[#8B949E]">Grade: <span className="text-white font-bold">{grade}</span> ({pct}%)</p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={startQuiz}
            className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={onGoBack}
            className="px-4 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
          >
            Back to Decks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#2D333B]">
        <div className="flex items-center space-x-1.5 min-w-0">
          <button onClick={onGoBack} className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#8B949E] hover:text-white transition-colors cursor-pointer flex-shrink-0">
            ← Back
          </button>
          <span className="text-[#484F58] font-mono hidden xs:inline">/</span>
          <span className="text-[9px] sm:text-[10px] font-mono text-[#8B949E] truncate hidden xs:inline">{deck.name.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-mono text-[#8B949E]">
            <Clock size={11} className={timeLeft < 30 ? 'text-[#F85149]' : 'text-[#E3B341]'} />
            <span className={`${timeLeft < 30 ? 'text-[#F85149] font-bold' : ''}`}>{formatTime(timeLeft)}</span>
          </div>
          <div className="text-[9px] sm:text-[10px] font-mono text-[#8B949E] whitespace-nowrap">
            <span className="text-white font-bold">{currentIdx + 1}</span> / {questions.length}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded bg-[#161B22] border border-[#30363D] overflow-hidden">
        <div className="h-full bg-[#E3B341] transition-all" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Question card */}
      <div className="rounded border border-[#2D333B] bg-[#161B22] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
            {currentQ.tag}
          </span>
          <span className="text-[9px] font-mono text-[#8B949E]">
            Score: <span className="text-white font-bold">{score}</span>
          </span>
        </div>

        <h3 className="text-sm font-bold text-white leading-relaxed font-mono">
          {currentQ.question}
        </h3>

        <div className="space-y-2 pt-2">
          {currentQ.options.map((opt, i) => {
            let style = 'border-[#30363D] hover:border-[#E3B341] bg-[#0D1117] hover:bg-[#161B22]';
            let icon = null;
            if (selectedAnswer !== null) {
              if (opt === currentQ.correctAnswer) {
                style = 'border-[#3FB950] bg-[#3FB950]/10 text-[#3FB950]';
                icon = <CheckCircle2 size={14} className="text-[#3FB950]" />;
              } else if (opt === selectedAnswer && !isCorrect) {
                style = 'border-[#F85149] bg-[#F85149]/10 text-[#F85149]';
                icon = <XCircle size={14} className="text-[#F85149]" />;
              } else {
                style = 'border-[#30363D] bg-[#0D1117] text-[#8B949E] opacity-50';
              }
            }
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={selectedAnswer !== null}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border text-xs font-mono text-left transition-all cursor-pointer disabled:cursor-default ${style}`}
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-full border border-current text-[10px] font-bold shrink-0">
                  {icon ? icon : String.fromCharCode(65 + i)}
                </span>
                <span className="flex-grow">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next button */}
      {selectedAnswer !== null && (
        <button
          onClick={handleNext}
          className="w-full py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
        >
          {currentIdx + 1 >= questions.length ? 'See Results' : 'Next Question'}
        </button>
      )}
    </div>
  );
};
