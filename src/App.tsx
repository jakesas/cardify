import { useState, useEffect } from 'react';
import { Deck, Card, ReviewHistory, ExamDomain } from './types';
import { getLocalDateString, isDue } from './utils/sm2';
import { DeckListScreen } from './components/DeckListScreen';
import { StudyMaterialScreen } from './components/StudyMaterialScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { CardEditorScreen } from './components/CardEditorScreen';
import { StatsScreen } from './components/StatsScreen';
import { QuizScreen } from './components/QuizScreen';
import { AIGeneratorScreen } from './components/AIGeneratorScreen';
import { HeaderTimer } from './components/HeaderTimer';
import logoSrc from '/logo.png';
import { Database, Activity, LayoutGrid, Sparkles, RefreshCcw, X, Wand2, Zap, LogOut, CreditCard } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { PaymentScreen } from './components/PaymentScreen';
import { listDecks, createDeck, deleteDeck, getAllCards, createCard, updateCard, deleteCard, submitReview, getAllReviews, getSetting, setSetting } from './db/queries';
import { getDb, setDbUser } from './db/client';
import { getPremiumState, activatePremium, type PremiumState } from './utils/premium';

function AppInner() {
  const { user, loading: authLoading, logout } = useAuth();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [premiumState, setPremiumState] = useState<PremiumState | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'decks' | 'study' | 'review' | 'editor' | 'stats' | 'ai' | 'quiz'>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

  // Initialize database and load data — scoped per user
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    async function init() {
      try {
        setDbUser(uid);

        // One-time migration: wipe old seed data for existing users
        const schema = await getSetting('db_schema');
        if (schema !== '2') {
          const db = await getDb();
          await db.execute('DELETE FROM reviews');
          await db.execute('DELETE FROM cards');
          await db.execute('DELETE FROM decks');
          await setSetting('db_schema', '2');
        }

        await loadAllData();
        const ps = await getPremiumState();
        setPremiumState(ps);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize database');
      }
    }
    init();
  }, [user?.uid]);

  async function loadAllData() {
    const [loadedDecks, loadedCards, loadedHistory] = await Promise.all([
      listDecks(),
      getAllCards(),
      getAllReviews(),
    ]);
    setDecks(loadedDecks);
    setCards(loadedCards);
    setHistory(loadedHistory);
    
    // Calculate streak
    const streak = calculateStreak(loadedHistory);
    setStreakDays(streak);
  }

  function calculateStreak(history: ReviewHistory[]): number {
    if (history.length === 0) return 0;
    const uniqueDays = new Set(
      history.map(r => new Date(r.timestamp).toISOString().split('T')[0])
    );
    const sortedDays = [...uniqueDays].sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    const checkDate = new Date(today);
    for (const day of sortedDays) {
      const expected = new Date(checkDate);
      expected.setDate(expected.getDate() - streak);
      const expectedStr = expected.toISOString().split('T')[0];
      if (day === expectedStr) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // Auto-dismiss errors after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleReviewCard = async (cardId: string, rating: 1 | 2 | 3 | 4) => {
    try {
      const updatedCard = await submitReview(cardId, rating);
      setCards(prev => prev.map(c => c.id === cardId ? updatedCard : c));
      const newLog: ReviewHistory = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        cardId,
        rating,
        timestamp: new Date().toISOString(),
        previousInterval: updatedCard.interval,
        nextInterval: updatedCard.interval,
        previousEaseFactor: updatedCard.easeFactor,
        nextEaseFactor: updatedCard.easeFactor,
      };
      setHistory(prev => [...prev, newLog]);
    } catch (err) {
      console.error('Failed to submit review:', err);
      setError(err instanceof Error ? err.message : 'Failed to save review');
    }
  };

  const handleCreateDeck = async (name: string, description: string) => {
    try {
      const newDeck = await createDeck(name, description);
      setDecks(prev => [...prev, newDeck]);
    } catch (err) {
      console.error('Failed to create deck:', err);
      setError(err instanceof Error ? err.message : 'Failed to create deck');
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    try {
      await deleteDeck(deckId);
      setDecks(prev => prev.filter(d => d.id !== deckId));
      setCards(prev => prev.filter(c => c.deckId !== deckId));
      if (selectedDeckId === deckId) {
        setSelectedDeckId(null);
        setActiveTab('decks');
      }
    } catch (err) {
      console.error('Failed to delete deck:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete deck');
    }
  };

  const handleAddCard = async (cardData: { deckId: string; cardType?: 'basic' | 'cloze'; front: string; back: string; tag: ExamDomain; imagePath?: string; codeSnippet?: { code: string; language: string }; topology?: any }) => {
    try {
      const newCard = await createCard(cardData);
      setCards(prev => [...prev, newCard]);
    } catch (err) {
      console.error('Failed to add card:', err);
      setError(err instanceof Error ? err.message : 'Failed to add card');
    }
  };

  const handleEditCard = async (cardId: string, updatedFields: Partial<Card>) => {
    try {
      const updatedCard = await updateCard(cardId, updatedFields);
      setCards(prev => prev.map(c => c.id === cardId ? updatedCard : c));
    } catch (err) {
      console.error('Failed to update card:', err);
      setError(err instanceof Error ? err.message : 'Failed to update card');
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await deleteCard(cardId);
      setCards(prev => prev.filter(c => c.id !== cardId));
    } catch (err) {
      console.error('Failed to delete card:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete card');
    }
  };

  const handleResetToDefaults = async () => {
    if (confirm('Are you sure you want to delete ALL data? This cannot be undone.')) {
      try {
        const db = await getDb();
        await db.execute('DELETE FROM reviews');
        await db.execute('DELETE FROM cards');
        await db.execute('DELETE FROM decks');
        await loadAllData();
        setSelectedDeckId(null);
        setActiveTab('decks');
      } catch (err) {
        console.error('Failed to reset data:', err);
        setError(err instanceof Error ? err.message : 'Failed to reset data');
      }
    }
  };

  const handleSelectDeck = (deckId: string, tab: 'study' | 'review' | 'editor' | 'quiz') => {
    setSelectedDeckId(deckId);
    setActiveTab(tab);
  };

  const activeDeck = decks.find(d => d.id === selectedDeckId);
  const todayStr = getLocalDateString();
  const totalDueTodayCount = cards.filter(c => isDue(c.dueDate, todayStr)).length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1115]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E3B341] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B949E]">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (premiumState?.status === 'expired') {
    return (
      <PaymentScreen
        onPaid={async (plan) => {
          await activatePremium(plan);
          setPremiumState({ status: 'active', trialDaysRemaining: 0, plan, premiumUntil: plan === 'lifetime' ? 'lifetime' : null });
        }}
        onSkip={() => {
          setPremiumState(prev => prev ? { ...prev, status: 'expired' as const } : prev!);
        }}
      />
    );
  }

  if (showUpgrade) {
    return (
      <PaymentScreen
        isUpgrade
        onPaid={async (plan) => {
          await activatePremium(plan);
          setPremiumState({ status: 'active', trialDaysRemaining: 0, plan, premiumUntil: plan === 'lifetime' ? 'lifetime' : null });
          setShowUpgrade(false);
        }}
        onSkip={() => {
          setShowUpgrade(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen font-sans transition-colors duration-200 bg-[#0F1115] text-[#E0E0E0] selection:bg-[#E3B341]/30 selection:text-white">
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.02] pointer-events-none z-0"></div>

      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-2 bg-[#F85149]/10 border border-[#F85149]/30 rounded text-xs font-mono text-[#F85149] shadow-lg animate-fade-in max-w-sm">
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-[#F85149] hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 flex flex-col min-h-screen">
        <header className="pb-2 mb-3 border-b border-[#2D333B]">
          {/* Three-zone layout: left (brand+timer) | center (nav) | right (actions) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
            {/* Zone Left: Logo + brand + divider + timer + due */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => { setActiveTab('decks'); setSelectedDeckId(null); }}>
                <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#E3B341] overflow-hidden flex-shrink-0">
                  <img src={logoSrc} alt="CardifyA.I" className="w-full h-full object-cover" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-white tracking-tight">CardifyA.I</span>
                  {premiumState?.status === 'active' && (
                    <span className="px-1 py-0.5 rounded bg-[#3FB950]/15 text-[#3FB950] text-[7px] font-bold font-mono uppercase tracking-wider leading-none">Premium</span>
                  )}
                  {premiumState?.status === 'trial' && (
                    <span className="px-1 py-0.5 rounded bg-[#E3B341]/15 text-[#E3B341] text-[7px] font-bold font-mono uppercase tracking-wider leading-none">Trial</span>
                  )}
                </div>
              </div>

              <span className="w-px h-4 bg-[#2D333B] flex-shrink-0 hidden sm:block"></span>

              <HeaderTimer />

              {totalDueTodayCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3B341]/10 text-[#E3B341] font-mono text-[10px] font-bold" title="Reviews due today">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]"></span>
                  <span>{totalDueTodayCount}</span>
                </div>
              )}
            </div>

            {/* Zone Center: Nav as segmented control */}
            <nav className="flex items-center justify-center sm:justify-center flex-1 overflow-x-auto scrollbar-none">
              <div className="flex items-center bg-[#161B22] rounded-lg p-0.5 border border-[#2D333B] gap-0.5">
                {[
                  { key: 'decks', icon: LayoutGrid, label: 'Decks', onClick: () => { setActiveTab('decks'); setSelectedDeckId(null); } },
                  ...(activeDeck ? [
                    { key: 'review', icon: Activity, label: 'Review', onClick: () => setActiveTab('review') },
                    { key: 'editor', icon: Database, label: 'Edit', onClick: () => setActiveTab('editor') },
                    { key: 'quiz', icon: Zap, label: 'Quiz', onClick: () => setActiveTab('quiz') },
                  ] : []),
                  { key: 'stats', icon: Sparkles, label: 'Stats', onClick: () => setActiveTab('stats') },
                  { key: 'ai', icon: Wand2, label: 'AI', onClick: () => setActiveTab('ai') },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={item.onClick}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'text-white bg-[#0F1115] shadow-sm'
                          : 'text-[#8B949E] hover:text-white'
                      }`}
                    >
                      <Icon size={13} className={isActive ? 'text-[#E3B341]' : ''} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Zone Right: Actions with consistent 16px gaps */}
            <div className="flex items-center justify-end gap-4">
              {premiumState?.status === 'trial' && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="px-2.5 py-1 rounded text-[#E3B341] hover:bg-[#E3B341]/10 text-[10px] font-bold font-mono uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                  title="Upgrade to Premium"
                >
                  <CreditCard size={12} />
                  <span className="hidden sm:inline">Upgrade</span>
                </button>
              )}
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-8 h-8 rounded-full border border-[#2D333B] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#1C2128] flex items-center justify-center text-[10px] font-bold text-[#8B949E]">
                  {(user?.email?.[0] || '?').toUpperCase()}
                </div>
              )}
              <button
                onClick={logout}
                className="flex items-center justify-center w-8 h-8 rounded text-[#8B949E] hover:text-[#F85149] hover:bg-[#F85149]/10 transition-colors cursor-pointer"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* Trial countdown banner */}
        {premiumState?.status === 'trial' && premiumState.trialDaysRemaining <= 1 && (
          <div className="mb-3 px-3 py-1.5 rounded border border-[#E3B341]/30 bg-[#E3B341]/10 text-[10px] font-mono text-[#E3B341] text-center">
            Your free trial ends in <span className="font-bold">{premiumState.trialDaysRemaining} day{premiumState.trialDaysRemaining !== 1 ? 's' : ''}</span> —{' '}
            <span className="font-bold">₱199 lifetime</span> to keep AI features after trial.
          </div>
        )}

        <main className="flex-grow pt-2">
          {activeTab === 'decks' && (
            <DeckListScreen
              decks={decks}
              cards={cards}
              onSelectDeck={handleSelectDeck}
              onCreateDeck={handleCreateDeck}
              onDeleteDeck={handleDeleteDeck}
              onResetToDefaults={handleResetToDefaults}
            />
          )}

          {activeTab === 'study' && activeDeck && (
            <StudyMaterialScreen
              deck={activeDeck}
              onGoBack={() => setActiveTab('decks')}
              onProceedToReview={() => setActiveTab('review')}
              onUpdateDeck={async (id, material) => {
                const { updateDeckStudyMaterial } = await import('./db/queries');
                await updateDeckStudyMaterial(id, material);
                setDecks(decks.map(d => d.id === id ? { ...d, studyMaterial: material } : d));
              }}
            />
          )}

          {activeTab === 'review' && activeDeck && (
            <ReviewScreen
              deck={activeDeck}
              cards={cards}
              reviewHistory={history}
              onReviewCard={handleReviewCard}
              onGoBack={() => setActiveTab('study')}
            />
          )}

          {activeTab === 'quiz' && activeDeck && (
            <QuizScreen
              deck={activeDeck}
              cards={cards}
              onGoBack={() => { setActiveTab('decks'); setSelectedDeckId(null); }}
            />
          )}

          {activeTab === 'editor' && activeDeck && (
            <CardEditorScreen
              deck={activeDeck}
              cards={cards}
              onAddCard={handleAddCard}
              onEditCard={handleEditCard}
              onDeleteCard={handleDeleteCard}
              onGoBack={() => setActiveTab('decks')}
            />
          )}

          {activeTab === 'stats' && (
            <StatsScreen
              cards={cards}
              history={history}
              streakDays={streakDays}
            />
          )}

          {activeTab === 'ai' && (
            <AIGeneratorScreen
              decks={decks}
              onAddCard={handleAddCard}
              onUpdateDeck={async (id, material) => {
                const { updateDeckStudyMaterial } = await import('./db/queries');
                await updateDeckStudyMaterial(id, material);
                setDecks(decks.map(d => d.id === id ? { ...d, studyMaterial: material } : d));
              }}
            />
          )}
        </main>

        <footer className="mt-8 sm:mt-12 pt-4 border-t border-[#2D333B] flex flex-col sm:flex-row items-center justify-between text-[9px] sm:text-[10px] font-mono text-[#8B949E] gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>CORE SYSTEM: SECURE</span>
            <span className="hidden xs:inline">•</span>
            <span>SM-2 ACTIVE</span>
            <span className="hidden xs:inline">•</span>
            <button
              onClick={handleResetToDefaults}
              className="text-[#E3B341] hover:underline transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCcw size={9} />
              <span>Full Flush DB</span>
            </button>
          </div>
          <div className="text-center sm:text-right text-[8px] sm:text-[10px]">
            <span>Offline-first high-density flashcard interface • SM-2 spaced repetition active</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}