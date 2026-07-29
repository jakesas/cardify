import { useState, useEffect } from 'react';
import { Deck, Card, ReviewHistory, ExamDomain } from './types';

import { DeckListScreen } from './components/DeckListScreen';
import { StudyMaterialScreen } from './components/StudyMaterialScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { CardEditorScreen } from './components/CardEditorScreen';
import { StatsScreen } from './components/StatsScreen';
import { ExamScreen } from './components/ExamScreen';
import { WeakSpotsScreen } from './components/WeakSpotsScreen';
import { SearchScreen } from './components/SearchScreen';
import { CommunityGalleryScreen } from './components/CommunityGalleryScreen';
import { ShareDeckDialog } from './components/ShareDeckDialog';
import { ImportLinkScreen } from './components/ImportLinkScreen';
import { GroupListScreen } from './components/GroupListScreen';
import { GroupDetailScreen } from './components/GroupDetailScreen';
import { PublicDeckScreen } from './components/PublicDeckScreen';
import { CreateGroupDialog } from './components/CreateGroupDialog';
import { JoinGroupDialog } from './components/JoinGroupDialog';
import { GroupDeckUploadDialog } from './components/GroupDeckUploadDialog';
import { GroupPickerDialog } from './components/GroupPickerDialog';
import { AIGeneratorScreen } from './components/AIGeneratorScreen';
import logoSrc from '/logo.png';
import { Database, Activity, LayoutGrid, Sparkles, X, Wand2, Zap, LogOut, CreditCard, AlertTriangle, Search, Globe, Users, BookOpen } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { PaymentScreen } from './components/PaymentScreen';
import { listDecks, createDeck, deleteDeck, getAllCards, createCard, updateCard, updateCards, deleteCard, deleteCards, submitReview, getAllReviews, getSetting, setSetting } from './db/queries';
import { getDb, setDbUser } from './db/client';
import { getPremiumState, activatePremium, type PremiumState } from './utils/premium';
import { listUserGroups } from './lib/groups';

function AppInner() {
  const { user, loading: authLoading, logout } = useAuth();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [premiumState, setPremiumState] = useState<PremiumState | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'decks' | 'study' | 'review' | 'editor' | 'stats' | 'ai' | 'quiz' | 'weak' | 'search' | 'community' | 'groups' | 'group-detail' | 'public'>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [shareDeckId, setShareDeckId] = useState<string | null>(null);
  const [importDeckShareId, setImportDeckShareId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [joinGroupCode, setJoinGroupCode] = useState<string | null>(null);
  const [pendingShareDeckId, setPendingShareDeckId] = useState<string | null>(null);
  const [groupUploadGroupId, setGroupUploadGroupId] = useState<string | null>(null);

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

  // Detect ?import= parameter from shared deck links
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const importId = params.get('import');
    if (importId) {
      setImportDeckShareId(importId);
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [user]);

  // Detect ?join= parameter from group invite links
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      setJoinGroupCode(joinCode.toUpperCase());
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [user]);

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

  const handleBatchDeleteCards = async (ids: string[]) => {
    try {
      await deleteCards(ids);
      setCards(prev => prev.filter(c => !ids.includes(c.id)));
    } catch (err) {
      console.error('Failed to delete cards:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete cards');
    }
  };

  const handleBatchUpdateCards = async (ids: string[], fields: Partial<Card>) => {
    try {
      const updated = await updateCards(ids, fields);
      const map = new Map(updated.map(c => [c.id, c]));
      setCards(prev => prev.map(c => map.get(c.id) ?? c));
    } catch (err) {
      console.error('Failed to update cards:', err);
      setError(err instanceof Error ? err.message : 'Failed to update cards');
    }
  };

  const handleNavigateToDeck = (deckId: string) => {
    setSelectedDeckId(deckId);
    setActiveTab('editor');
  };

  const handleImportCommunityDeck = async (title: string, description: string, cards: { front: string; back: string; tag: string }[]): Promise<string | null> => {
    try {
      const newDeck = await createDeck(title, description);
      for (const card of cards) {
        await createCard({
          deckId: newDeck.id,
          front: card.front,
          back: card.back,
          tag: card.tag,
          cardType: 'basic',
        });
      }
      setDecks(prev => [...prev, newDeck]);
      const allCards = await getAllCards();
      setCards(allCards);
      return newDeck.id;
    } catch (err) {
      console.error('Failed to import deck:', err);
      setError(err instanceof Error ? err.message : 'Failed to import deck');
      return null;
    }
  };

  const handleShareDeck = (deckId: string) => {
    setShareDeckId(deckId);
  };

  const handleShareToGroup = (deckId: string) => {
    setPendingShareDeckId(deckId);
  };

  const handleGroupCreated = () => {
    setShowCreateGroup(false);
    setActiveTab('groups');
  };

  const handleGroupDeckUploaded = () => {
    setGroupUploadGroupId(null);
    setPendingShareDeckId(null);
    // Refresh via re-render if on group detail tab
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

      <div className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 flex flex-col min-h-screen pb-20 sm:pb-3">
        <header className="pb-2 mb-3 border-b border-[#2D333B]">
          {/* Three-zone layout: left (brand+timer) | center (nav) | right (actions) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
            {/* Zone Left: Logo + brand + mobile actions */}
            <div className="flex items-center justify-between w-full sm:w-auto">
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
              </div>

              {/* Mobile: avatar + logout inline in top row */}
              <div className="flex sm:hidden items-center gap-3">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-7 h-7 rounded-full border border-[#2D333B] object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#1C2128] flex items-center justify-center text-[10px] font-bold text-[#8B949E]">
                    {(user?.email?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <button
                  onClick={logout}
                  className="flex items-center justify-center w-7 h-7 rounded text-[#8B949E] hover:text-[#F85149] hover:bg-[#F85149]/10 transition-colors cursor-pointer"
                  aria-label="Log out"
                  title="Log out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>

            {/* Zone Center: Nav as segmented control (desktop only) */}
            <nav className="hidden sm:flex items-center justify-center flex-1 overflow-x-auto scrollbar-none">
              <div className="flex items-center bg-[#161B22] rounded-lg p-0.5 border border-[#2D333B] gap-0.5">
                {[
                  { key: 'decks', icon: LayoutGrid, label: 'Decks', onClick: () => { setActiveTab('decks'); setSelectedDeckId(null); } },
                  ...(activeDeck ? [
                    { key: 'review', icon: Activity, label: 'Review', onClick: () => setActiveTab('review') },
                    { key: 'editor', icon: Database, label: 'Edit', onClick: () => setActiveTab('editor') },
                    { key: 'quiz', icon: Zap, label: 'Quiz', onClick: () => setActiveTab('quiz') },
                    { key: 'weak', icon: AlertTriangle, label: 'Weak', onClick: () => setActiveTab('weak') },
                  ] : []),
                  { key: 'search', icon: Search, label: 'Search', onClick: () => setActiveTab('search') },
                  { key: 'community', icon: Globe, label: 'Community', onClick: () => setActiveTab('community') },
                  { key: 'groups', icon: Users, label: 'Groups', onClick: () => setActiveTab('groups') },
                  { key: 'public', icon: BookOpen, label: 'Public', onClick: () => setActiveTab('public') },
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

            {/* Zone Right: desktop actions */}
            <div className="hidden sm:flex items-center justify-end gap-4">
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

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-[#0F1115] border-t border-[#2D333B] flex items-center justify-around px-2 py-1.5 safe-area-bottom">
          {[
            { key: 'decks', icon: LayoutGrid, label: 'Decks', onClick: () => { setActiveTab('decks'); setSelectedDeckId(null); } },
            ...(activeDeck ? [
              { key: 'quiz', icon: Zap, label: 'Quiz', onClick: () => setActiveTab('quiz') },
            ] : []),
            { key: 'weak', icon: AlertTriangle, label: 'Weak', onClick: () => setActiveTab('weak') },
            { key: 'search', icon: Search, label: 'Search', onClick: () => setActiveTab('search') },
            { key: 'community', icon: Globe, label: 'Community', onClick: () => setActiveTab('community') },
            { key: 'groups', icon: Users, label: 'Groups', onClick: () => setActiveTab('groups') },
            { key: 'public', icon: BookOpen, label: 'Public', onClick: () => setActiveTab('public') },
            { key: 'stats', icon: Sparkles, label: 'Stats', onClick: () => setActiveTab('stats') },
            { key: 'ai', icon: Wand2, label: 'AI', onClick: () => setActiveTab('ai') },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={item.onClick}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 min-w-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#E3B341]'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className={`text-[9px] font-medium font-mono ${
                  isActive ? 'font-bold' : ''
                }`}>
                  {item.label}
                </span>
                {isActive && <span className="w-4 h-0.5 rounded-full bg-[#E3B341] mt-0.5" />}
              </button>
            );
          })}
        </nav>

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
              onShareDeck={handleShareDeck}
              onShareToGroup={handleShareToGroup}
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
            <ExamScreen
              deck={activeDeck}
              cards={cards}
              onGoBack={() => setActiveTab('decks')}
            />
          )}

          {activeTab === 'weak' && (
            <WeakSpotsScreen
              decks={decks}
              cards={cards}
              history={history}
              onReviewCard={handleReviewCard}
              onGoBack={() => setActiveTab('decks')}
            />
          )}

          {activeTab === 'editor' && activeDeck && (
            <CardEditorScreen
              deck={activeDeck}
              decks={decks}
              cards={cards}
              onAddCard={handleAddCard}
              onEditCard={handleEditCard}
              onDeleteCard={handleDeleteCard}
              onBatchDeleteCards={handleBatchDeleteCards}
              onBatchUpdateCards={handleBatchUpdateCards}
              onGoBack={() => setActiveTab('decks')}
            />
          )}

          {activeTab === 'search' && (
            <SearchScreen
              cards={cards}
              decks={decks}
              onNavigateToDeck={handleNavigateToDeck}
            />
          )}

          {activeTab === 'community' && (
            <CommunityGalleryScreen
              userId={user?.uid}
              onImportDeck={handleImportCommunityDeck}
            />
          )}

          {activeTab === 'groups' && (
            <GroupListScreen
              userId={user?.uid}
              onCreateGroup={() => setShowCreateGroup(true)}
              onSelectGroup={(gid) => { setSelectedGroupId(gid); setActiveTab('group-detail'); }}
              onGoBack={() => setActiveTab('decks')}
            />
          )}

          {activeTab === 'group-detail' && selectedGroupId && (
            <GroupDetailScreen
              groupId={selectedGroupId}
              userId={user?.uid}
              onGoBack={() => setActiveTab('groups')}
              onImportDeck={handleImportCommunityDeck}
              onShowUpload={(gid) => setGroupUploadGroupId(gid)}
            />
          )}

          {activeTab === 'public' && (
            <PublicDeckScreen
              onGoBack={() => setActiveTab('decks')}
              onImportDeck={handleImportCommunityDeck}
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
              premiumState={premiumState ?? { status: 'expired', trialDaysRemaining: 0, plan: null, premiumUntil: null }}
              onShowUpgrade={() => setShowUpgrade(true)}
            />
          )}
        </main>

        {shareDeckId && (
          <ShareDeckDialog
            deckId={shareDeckId}
            deckName={decks.find(d => d.id === shareDeckId)?.name || 'Unknown Deck'}
            deckDescription={decks.find(d => d.id === shareDeckId)?.description || ''}
            cards={cards}
            userId={user?.uid}
            onClose={() => setShareDeckId(null)}
          />
        )}

        {importDeckShareId && (
          <ImportLinkScreen
            deckShareId={importDeckShareId}
            onImportDeck={handleImportCommunityDeck}
            onDismiss={() => setImportDeckShareId(null)}
          />
        )}

        {showCreateGroup && (
          <CreateGroupDialog
            onClose={() => setShowCreateGroup(false)}
            onCreated={handleGroupCreated}
          />
        )}

        {joinGroupCode && (
          <JoinGroupDialog
            inviteCode={joinGroupCode}
            onDismiss={() => setJoinGroupCode(null)}
            onJoined={() => setJoinGroupCode(null)}
          />
        )}

        {pendingShareDeckId && !groupUploadGroupId && (
          <GroupPickerDialog
            userId={user?.uid}
            onSelect={(gid) => setGroupUploadGroupId(gid)}
            onClose={() => setPendingShareDeckId(null)}
          />
        )}

        {groupUploadGroupId && (
          <GroupDeckUploadDialog
            groupId={groupUploadGroupId}
            groupName={''}
            decks={decks}
            cards={cards}
            onClose={() => { setGroupUploadGroupId(null); setPendingShareDeckId(null); }}
            onUploaded={handleGroupDeckUploaded}
          />
        )}

        <footer className="mt-8 sm:mt-12 pt-4 border-t border-[#2D333B] text-center">
          <p className="text-[11px] font-mono text-[#8B949E]">
            Sm-2 spaced repetition engine &mdash; all data stored locally in your browser
          </p>
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