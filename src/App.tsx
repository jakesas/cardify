import { useState, useEffect } from 'react';
import { Deck, Card, ReviewHistory, ExamDomain } from './types';
import { INITIAL_DECKS, INITIAL_CARDS } from './data/sampleData';
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
import { Sun, Moon, Database, Activity, LayoutGrid, Sparkles, RefreshCcw, X, Wand2, Zap, LogOut, CreditCard } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { PaymentScreen } from './components/PaymentScreen';
import { listDecks, createDeck, deleteDeck, getAllCards, createCard, updateCard, deleteCard, submitReview, getAllReviews, getSetting, setSetting } from './db/queries';
import { getDb, setDbUser } from './db/client';
import { getPremiumState, activatePremium, type PremiumState } from './utils/premium';

function AppInner() {
  const { user, loading: authLoading, logout } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ccna_theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

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
        const db = await getDb();

        // Check if we need to seed data
        const hasSeeded = await getSetting('has_seeded');
        if (hasSeeded !== 'true') {
          await seedInitialData(db);
          await setSetting('has_seeded', 'true');
        }
        
        await loadAllData();
        const ps = await getPremiumState();
        setPremiumState(ps);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize database');
      } finally {
      }
    }
    init();
  }, [user?.uid]);

  async function seedInitialData(_db: any) {
    // Use createDeck/createCard so SQLite auto-generates IDs
    const createdDecks: { oldId: string; newId: string }[] = [];

    for (const deck of INITIAL_DECKS) {
      try {
        const created = await createDeck(deck.name, deck.description);
        createdDecks.push({ oldId: deck.id, newId: String(created.id) });
      } catch (e) {
        console.error('Failed to seed deck:', deck.name, e);
      }
    }

    // Map old string IDs to new auto-generated IDs
    const deckIdMap = new Map(createdDecks.map(d => [d.oldId, d.newId]));

    for (const card of INITIAL_CARDS) {
      const newDeckId = deckIdMap.get(card.deckId);
      if (!newDeckId) continue;
      try {
        await createCard({
          deckId: newDeckId,
          cardType: 'basic',
          front: card.front,
          back: card.back,
          tag: card.tag,
          codeSnippet: card.codeSnippet,
        });
      } catch (e) {
        console.error('Failed to seed card:', card.front?.slice(0, 30), e);
      }
    }
  }

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

  // Theme persistence
  useEffect(() => {
    localStorage.setItem('ccna_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
    if (confirm('Are you sure you want to reset all data back to the original sample decks? Your custom progress will be overwritten.')) {
      try {
        const db = await getDb();
        await db.execute('DELETE FROM reviews');
        await db.execute('DELETE FROM cards');
        await db.execute('DELETE FROM decks');
        await seedInitialData(db);
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
    <div className={`min-h-screen font-sans transition-colors duration-200 ${
      theme === 'dark' 
        ? 'bg-[#0F1115] text-[#E0E0E0] selection:bg-[#E3B341]/30 selection:text-white' 
        : 'bg-slate-50 text-slate-900 selection:bg-cyan-500/20 selection:text-cyan-900'
    }`}>
      {theme === 'dark' && (
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.02] pointer-events-none z-0"></div>
      )}

      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-2 bg-[#F85149]/10 border border-[#F85149]/30 rounded text-xs font-mono text-[#F85149] shadow-lg animate-fade-in max-w-sm">
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-[#F85149] hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 flex flex-col min-h-screen">
        <header className="flex flex-col sm:grid sm:grid-cols-3 sm:items-center gap-1 pb-1 sm:pb-2 mb-2 sm:mb-3 border-b border-[#2D333B]">
          {/* Col 1: Logo (left) + mobile badges (right) */}
          <div className="flex items-center justify-between w-full sm:justify-start">
              <div className="flex items-center space-x-1.5 cursor-pointer flex-shrink-0 min-w-0" onClick={() => { setActiveTab('decks'); setSelectedDeckId(null); }}>
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#E3B341] flex-shrink-0 shadow-md shadow-[#E3B341]/10 overflow-hidden">
                <img src={logoSrc} alt="CardifyA.I" className="w-full h-full object-cover" />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1">
                  <h1 className="text-[10px] sm:text-sm font-bold text-white">CardifyA.I</h1>
                  {premiumState?.status === 'active' && (
                    <span className="px-1 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] text-[7px] sm:text-[8px] font-bold font-mono uppercase tracking-wider leading-none">Premium</span>
                  )}
                  {premiumState?.status === 'trial' && (
                    <span className="px-1 py-0.5 rounded bg-[#E3B341]/20 text-[#E3B341] text-[7px] sm:text-[8px] font-bold font-mono uppercase tracking-wider leading-none">Trial</span>
                  )}
                </div>

              </div>
            </div>

            {/* Mobile: timer + due badge + theme toggle (right side) */}
            <div className="flex sm:hidden items-center space-x-1">
              <HeaderTimer />
              {totalDueTodayCount > 0 && (
                <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded border border-[#30363D] bg-[#161B22] text-[#E3B341] font-mono text-[8px] font-bold" title="Reviews due today">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]"></span>
                  <span>{totalDueTodayCount}</span>
                </div>
              )}
              {premiumState?.status === 'trial' && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="p-1.5 bg-[#E3B341]/10 hover:bg-[#E3B341]/20 rounded border border-[#E3B341]/30 text-[#E3B341] hover:text-[#F0C24F] transition-colors cursor-pointer"
                  aria-label="Upgrade to Premium"
                  title="Upgrade to Premium"
                >
                  <CreditCard size={13} />
                </button>
              )}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-1.5 bg-[#161B22] hover:bg-[#21262D] rounded border border-[#30363D] text-[#8B949E] hover:text-white transition-colors cursor-pointer"
                aria-label="Toggle Theme Mode"
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              </button>
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-6 h-6 rounded-full border border-[#30363D] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center text-[9px] font-bold text-[#8B949E]">
                  {(user?.email?.[0] || '?').toUpperCase()}
                </div>
              )}
              <button
                onClick={logout}
                className="p-1.5 bg-[#161B22] hover:bg-[#F85149]/20 rounded border border-[#30363D] text-[#8B949E] hover:text-[#F85149] transition-colors cursor-pointer"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>

          {/* Col 2: Nav (scrollable on mobile, centered on desktop) */}
          <div className="flex justify-center w-full min-w-0">
            <nav className="flex items-center sm:justify-center overflow-x-auto flex-nowrap sm:flex-wrap gap-0.5 p-0.5 sm:p-1 rounded bg-[#161B22] border border-[#30363D] max-w-full scrollbar-none">
              <button
                onClick={() => { setActiveTab('decks'); setSelectedDeckId(null); }}
                className={`flex items-center space-x-1 px-2 sm:px-3 py-0.5 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                  activeTab === 'decks'
                    ? 'bg-[#E3B341] text-[#0F1115] shadow'
                    : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                }`}
              >
                <LayoutGrid size={12} />
                <span>Decks</span>
              </button>

              {activeDeck && (
                <>
                  <button
                    onClick={() => setActiveTab('review')}
                    className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                      activeTab === 'review'
                        ? 'bg-[#E3B341] text-[#0F1115] shadow'
                        : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                    }`}
                  >
                    <Activity size={12} />
                    <span className="hidden sm:inline">Review</span>
                    <span className="sm:hidden">Rev</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                      activeTab === 'editor'
                        ? 'bg-[#E3B341] text-[#0F1115] shadow'
                        : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                    }`}
                  >
                    <Database size={12} />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('quiz')}
                    className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                      activeTab === 'quiz'
                        ? 'bg-[#E3B341] text-[#0F1115] shadow'
                        : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                    }`}
                  >
                    <Zap size={12} />
                    <span>Quiz</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setActiveTab('stats')}
                className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                  activeTab === 'stats'
                    ? 'bg-[#E3B341] text-[#0F1115] shadow'
                    : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                }`}
              >
              <Sparkles size={12} />
              <span>Stats</span>
              </button>

              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-xs font-semibold tracking-wide uppercase transition-all cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-[#E3B341] text-[#0F1115] shadow'
                    : 'text-[#8B949E] hover:text-white hover:bg-[#1C2128]'
                }`}
              >
                <Wand2 size={12} />
                <span>AI</span>
              </button>
            </nav>
          </div>

          {/* Col 3: Timer + due badge + theme toggle (desktop only) */}
          <div className="hidden sm:flex items-center justify-end space-x-1.5 sm:space-x-2">
            <HeaderTimer />

            {totalDueTodayCount > 0 && (
              <div className="flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded border border-[#30363D] bg-[#161B22] text-[#E3B341] font-mono text-[8px] sm:text-[10px] font-bold" title="Reviews due today">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]"></span>
                <span className="hidden sm:inline">{totalDueTodayCount} DUE</span>
                <span className="sm:hidden">{totalDueTodayCount}</span>
              </div>
            )}

            {premiumState?.status === 'trial' && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="px-2 py-1 bg-[#E3B341]/10 hover:bg-[#E3B341]/20 rounded border border-[#E3B341]/30 text-[#E3B341] hover:text-[#F0C24F] text-[10px] font-bold font-mono uppercase tracking-wider transition-colors flex items-center space-x-1 cursor-pointer"
                title="Upgrade to Premium"
              >
                <CreditCard size={12} />
                <span className="hidden sm:inline">Upgrade</span>
              </button>
            )}

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 bg-[#161B22] hover:bg-[#21262D] rounded border border-[#30363D] text-[#8B949E] hover:text-white transition-colors cursor-pointer"
              aria-label="Toggle Theme Mode"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                className="w-6 h-6 rounded-full border border-[#30363D] object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center text-[9px] font-bold text-[#8B949E]">
                {(user?.email?.[0] || '?').toUpperCase()}
              </div>
            )}
            <button
              onClick={logout}
              className="p-1.5 bg-[#161B22] hover:bg-[#F85149]/20 rounded border border-[#30363D] text-[#8B949E] hover:text-[#F85149] transition-colors cursor-pointer"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={13} />
            </button>
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