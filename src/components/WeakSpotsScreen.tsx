import { useState, useMemo, type FC } from 'react';
import { Card, Deck, ReviewHistory } from '../types';
import { calculateSM2, getLocalDateString, isDue } from '../utils/sm2';
import { RotateCcw, Lightbulb, AlertTriangle, ArrowLeft } from 'lucide-react';

interface WeakSpotsScreenProps {
  decks: Deck[];
  cards: Card[];
  history: ReviewHistory[];
  onReviewCard: (cardId: string, rating: 1 | 2 | 3 | 4) => void;
  onGoBack: () => void;
}

function getRecentFailCount(cardId: string, history: ReviewHistory[]): number {
  return history.filter(h => h.cardId === cardId && h.rating <= 2).length;
}

export const WeakSpotsScreen: FC<WeakSpotsScreenProps> = ({ decks, cards, history, onReviewCard, onGoBack }) => {
  const weakCards = useMemo(() => {
    return cards.filter(c => {
      const efLow = c.easeFactor < 2.0;
      const failedRepeatedly = getRecentFailCount(c.id, history) >= 3;
      const stalled = c.reps >= 3 && c.interval >= 14 && c.easeFactor < 2.2;
      return efLow || failedRepeatedly || stalled;
    }).sort((a, b) => a.easeFactor - b.easeFactor);
  }, [cards, history]);

  const deckMap = useMemo(() => {
    const m = new Map<string, Deck>();
    decks.forEach(d => m.set(d.id, d));
    return m;
  }, [decks]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const activeCard = weakCards[currentIdx];

  const handleRate = (rating: 1 | 2 | 3 | 4) => {
    if (!activeCard) return;
    setIsTransitioning(true);
    setTimeout(() => {
      onReviewCard(activeCard.id, rating);
      setIsRevealed(false);
      setIsTransitioning(false);
      if (currentIdx + 1 >= weakCards.length) {
        setCompleted(true);
      } else {
        setCurrentIdx(prev => prev + 1);
      }
    }, 120);
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setIsRevealed(false);
    setCompleted(false);
  };

  if (weakCards.length === 0 || completed) {
    return (
      <div className="max-w-xl mx-auto py-10 px-4 text-center space-y-5 animate-fade-in">
        <div className={`inline-flex p-3 rounded border border-[#30363D] ${completed ? 'text-[#3FB950] bg-[#1F2937]/50' : 'text-[#E3B341] bg-[#1F2937]/50'}`}>
          {completed ? <RotateCcw size={24} className="animate-spin-slow" /> : <AlertTriangle size={24} />}
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white tracking-tight uppercase font-mono">
            {completed ? 'Weak Spots Reviewed!' : 'No Weak Spots'}
          </h2>
          <p className="text-xs text-[#8B949E] max-w-md mx-auto leading-relaxed">
            {completed
              ? 'You have reviewed all struggling cards. Keep up the daily reviews to strengthen these areas.'
              : 'All cards have a healthy ease factor above 2.0 with no repeated failures. Great job!'}
          </p>
        </div>
        <div className="p-3 bg-[#161B22] border border-[#2D333B] rounded max-w-sm mx-auto text-left space-y-1 font-mono text-xs">
          <div className="flex justify-between text-[#8B949E]">
            <span>Weak cards found:</span>
            <span className="text-white font-bold">{completed ? 0 : weakCards.length}</span>
          </div>
          <div className="flex justify-between text-[#8B949E]">
            <span>Average EF:</span>
            <span className="text-white font-bold">
              {cards.length > 0 ? (cards.reduce((s, c) => s + c.easeFactor, 0) / cards.length).toFixed(2) : '-'}
            </span>
          </div>
        </div>
        <button onClick={completed ? handleRestart : onGoBack}
          className="px-4 py-2 bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold uppercase tracking-wider rounded border border-[#30363D] transition-colors cursor-pointer">
          {completed ? 'Review Again' : 'Back'}
        </button>
      </div>
    );
  }

  if (!activeCard) {
    return (
      <div className="max-w-xl mx-auto py-10 text-center text-[#8B949E] font-mono text-xs">
        No cards to review.
      </div>
    );
  }

  const deckName = deckMap.get(activeCard.deckId)?.name || 'Unknown Deck';
  const failCount = getRecentFailCount(activeCard.id, history);

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2D333B]">
        <div className="flex items-center space-x-2">
          <button onClick={onGoBack} className="text-[10px] font-bold uppercase tracking-wider text-[#8B949E] hover:text-white transition-colors cursor-pointer">
            ← Back
          </button>
          <span className="text-[#484F58] font-mono">/</span>
          <span className="text-[10px] font-mono text-[#E3B341] font-bold">Weak Spots</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#8B949E]">
          <span>Card {currentIdx + 1} of {weakCards.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded bg-[#161B22] border border-[#30363D] overflow-hidden">
        <div className="h-full bg-[#E3B341] transition-all duration-150" style={{ width: `${((currentIdx + 1) / weakCards.length) * 100}%` }} />
      </div>

      {/* Card */}
      <div className={`relative rounded border border-[#2D333B] bg-[#161B22] p-5 md:p-6 shadow-xl min-h-[250px] flex flex-col justify-between transition-all duration-120 ${isTransitioning ? 'opacity-30 scale-[0.99]' : 'opacity-100 scale-100'}`}>
        <div className="space-y-4 flex-grow">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
                {activeCard.tag}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#F85149]/10 text-[#F85149] border border-[#F85149]/20">
                EF: {activeCard.easeFactor}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#8B949E]">
              <span>{deckName}</span>
              {failCount > 0 && (
                <span className="text-[#F85149]">({failCount} fails)</span>
              )}
            </div>
          </div>

          <h3 className="text-base md:text-lg font-bold text-white leading-relaxed tracking-tight font-mono">
            {activeCard.front}
          </h3>
        </div>

        {isRevealed ? (
          <div className="mt-6 pt-5 border-t border-[#2D333B] space-y-3 animate-fade-in">
            <div className="flex items-center space-x-1.5 text-[#E3B341]">
              <Lightbulb size={12} />
              <span className="text-[9px] font-mono tracking-widest uppercase font-bold">Answer</span>
            </div>
            <p className="text-xs text-[#E0E0E0] leading-relaxed whitespace-pre-line font-mono">
              {activeCard.back}
            </p>
          </div>
        ) : (
          <div className="mt-8 flex justify-center">
            <button onClick={() => setIsRevealed(true)}
              className="px-6 py-2 bg-[#21262D] hover:bg-[#30363D] text-[#E3B341] hover:text-white text-xs font-bold tracking-widest uppercase rounded border border-[#30363D] transition-all cursor-pointer shadow-lg active:scale-95 font-mono">
              Reveal Answer
            </button>
          </div>
        )}
      </div>

      {/* Rating */}
      {isRevealed && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 animate-slide-up">
          <button onClick={() => handleRate(1)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#F85149]/30 hover:border-[#F85149] bg-[#161B22] hover:bg-[#F85149]/5 group transition-colors cursor-pointer">
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#F85149]">Again [1]</span>
            <span className="text-xs font-bold text-[#F85149] mt-0.5">Failed</span>
            <span className="text-[9px] font-mono text-[#8B949E]">1d</span>
          </button>
          <button onClick={() => handleRate(2)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#E3B341]/30 hover:border-[#E3B341] bg-[#161B22] hover:bg-[#E3B341]/5 group transition-colors cursor-pointer">
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#E3B341]">Hard [2]</span>
            <span className="text-xs font-bold text-[#E3B341] mt-0.5">Hesitant</span>
            <span className="text-[9px] font-mono text-[#8B949E]">1-2d</span>
          </button>
          <button onClick={() => handleRate(3)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#3FB950]/30 hover:border-[#3FB950] bg-[#161B22] hover:bg-[#3FB950]/5 group transition-colors cursor-pointer">
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#3FB950]">Good [3]</span>
            <span className="text-xs font-bold text-[#3FB950] mt-0.5">Recalled</span>
            <span className="text-[9px] font-mono text-[#8B949E]">~{activeCard.interval}d</span>
          </button>
          <button onClick={() => handleRate(4)}
            className="flex flex-col items-center justify-center p-2 rounded border border-[#388BFD]/30 hover:border-[#388BFD] bg-[#161B22] hover:bg-[#388BFD]/5 group transition-colors cursor-pointer">
            <span className="text-[9px] font-mono tracking-widest uppercase text-[#8B949E] group-hover:text-[#388BFD]">Easy [4]</span>
            <span className="text-xs font-bold text-[#388BFD] mt-0.5">Instant</span>
            <span className="text-[9px] font-mono text-[#8B949E]">~{Math.ceil(activeCard.interval * 1.5)}d</span>
          </button>
        </div>
      )}
    </div>
  );
};
