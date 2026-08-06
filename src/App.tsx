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
import { CreateGroupDialog } from './components/CreateGroupDialog';
import { JoinGroupDialog } from './components/JoinGroupDialog';
import { GroupDeckUploadDialog } from './components/GroupDeckUploadDialog';
import { GroupPickerDialog } from './components/GroupPickerDialog';
import { AIGeneratorScreen } from './components/AIGeneratorScreen';
import { LibraryScreen } from './components/LibraryScreen';
import logoSrc from '/logo.png';
import { Database, Activity, LayoutGrid, Sparkles, X, Wand2, Zap, LogOut, AlertTriangle, Search, Globe, Users, BookOpen } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { listDecks, createDeck, deleteDeck, getAllCards, createCard, updateCard, updateCards, deleteCard, deleteCards, submitReview, getAllReviews, getSetting, setSetting } from './db/queries';
import { getDb, setDbUser } from './db/client';
import { listUserGroups } from './lib/groups';
import { XP_PER_CARD_AGAIN_HARD, XP_PER_CARD_GOOD_EASY } from './utils/xp';

function AppInner() {
  const { user, loading: authLoading, logout } = useAuth();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [userXp, setUserXp] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'decks' | 'study' | 'review' | 'editor' | 'stats' | 'ai' | 'quiz' | 'weak' | 'search' | 'community' | 'library' | 'groups' | 'group-detail'>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [shareDeckId, setShareDeckId] = useState<string | null>(null);
  const [importDeckShareId, setImportDeckShareId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [joinGroupCode, setJoinGroupCode] = useState<string | null>(null);
  const [pendingShareDeckId, setPendingShareDeckId] = useState<string | null>(null);
  const [groupUploadGroupId, setGroupUploadGroupId] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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

        const xpStr = await getSetting('user_xp');
        if (xpStr) setUserXp(parseInt(xpStr, 10));

        await loadAllData();
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

  // Close mobile overflow menu on navigation
  useEffect(() => {
    setShowMobileMenu(false);
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const parts = hash.split('/');
    const tab = parts[0];
    const validTabs: readonly string[] = ['decks', 'study', 'review', 'editor', 'stats', 'ai', 'quiz', 'weak', 'search', 'community', 'groups', 'group-detail'];
    if (!validTabs.includes(tab)) return;
    setActiveTab(tab as typeof activeTab);
    if (tab === 'group-detail' && parts[1]) {
      setSelectedGroupId(parts[1]);
    } else if (['study', 'review', 'editor', 'quiz'].includes(tab) && parts[1]) {
      setSelectedDeckId(parts[1]);
    }
  }, [user]);

  useEffect(() => {
    let hash = activeTab;
    if (activeTab === 'group-detail' && selectedGroupId) {
      hash += `/${selectedGroupId}`;
    } else if (['study', 'review', 'editor', 'quiz'].includes(activeTab) && selectedDeckId) {
      hash += `/${selectedDeckId}`;
    }
    window.location.hash = hash;
  }, [activeTab, selectedDeckId, selectedGroupId]);

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

      // Award XP
      const gainedXp = rating >= 3 ? XP_PER_CARD_GOOD_EASY : XP_PER_CARD_AGAIN_HARD;
      setUserXp(prev => {
        const nextXp = prev + gainedXp;
        setSetting('user_xp', nextXp.toString());
        return nextXp;
      });
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

  const handleRenameDeck = async (deckId: string, name: string) => {
    try {
      const { updateDeckName } = await import('./db/queries');
      const updated = await updateDeckName(deckId, name);
      setDecks(prev => prev.map(d => d.id === deckId ? updated : d));
    } catch (err) {
      console.error('Failed to rename deck:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename deck');
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

  const handleDeleteGroup = async (groupId: string) => {
    const { deleteGroup } = await import('./lib/groups');
    const result = await deleteGroup(groupId);
    if (result.success) {
      setSelectedGroupId(null);
      setActiveTab('groups');
    } else {
      setError(result.error || 'Failed to delete group');
    }
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

      <div className="relative z-10 max-w-6xl mx-auto px-3 md:px-6 lg:px-8 py-2 md:py-3 flex flex-col min-h-screen pb-20 md:pb-3">
        <header className="pb-2 mb-3 border-b border-[#2D333B]">
          {/* Three-zone layout: left (brand+timer) | center (nav) | right (actions) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0">
            {/* Zone Left: Logo + brand + mobile actions */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => { setActiveTab('decks'); setSelectedDeckId(null); }}>
                  <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#E3B341] overflow-hidden flex-shrink-0">
                    <img src={logoSrc} alt="CardifyA.I" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-bold text-white tracking-tight">CardifyA.I</span>
                  </div>
                </div>

                <span className="w-px h-4 bg-[#2D333B] flex-shrink-0 hidden md:block"></span>
              </div>

              {/* Mobile: avatar + logout inline in top row */}
              <div className="flex md:hidden items-center gap-3">
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
            <nav className="hidden md:flex items-center justify-center flex-1 overflow-x-auto scrollbar-none">
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
                  { key: 'library', icon: BookOpen, label: 'Library', onClick: () => setActiveTab('library') },
                  { key: 'community', icon: Globe, label: 'Community', onClick: () => setActiveTab('community') },
                  { key: 'groups', icon: Users, label: 'Groups', onClick: () => setActiveTab('groups') },
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
            <div className="hidden md:flex items-center justify-end gap-4">
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
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0F1115] border-t border-[#2D333B] flex items-center justify-around px-2 py-1.5 safe-area-bottom">
          {[
            { key: 'decks', icon: LayoutGrid, label: 'Decks', onClick: () => { setActiveTab('decks'); setSelectedDeckId(null); } },
            { key: 'community', icon: Globe, label: 'Community', onClick: () => setActiveTab('community') },
            { key: 'ai', icon: Wand2, label: 'AI', centered: true, onClick: () => setActiveTab('ai') },
            ...(activeDeck ? [
              { key: 'quiz', icon: Zap, label: 'Quiz', onClick: () => setActiveTab('quiz') },
            ] : []),
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
                <div className={`flex items-center justify-center rounded-lg p-1 transition-colors ${
                  isActive
                    ? 'bg-[#E3B341]/15'
                    : ''
                }`}>
                  <Icon size={18} />
                </div>
                <span className={`text-[9px] font-medium font-mono ${
                  isActive ? 'font-bold' : ''
                }`}>
                  {item.label}
                </span>
                {isActive && <span className="w-4 h-0.5 rounded-full bg-[#E3B341] mt-0.5" />}
              </button>
            );
          })}
          {/* More button */}
          <div className="relative">
            <button
              onClick={() => setShowMobileMenu(prev => !prev)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 transition-colors cursor-pointer ${
                showMobileMenu ? 'text-[#E3B341]' : 'text-[#8B949E] hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
              <span className={`text-[9px] font-medium font-mono ${showMobileMenu ? 'font-bold' : ''}`}>More</span>
              {showMobileMenu && <span className="w-4 h-0.5 rounded-full bg-[#E3B341] mt-0.5" />}
            </button>

            {showMobileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 z-50 w-48 rounded border border-[#2D333B] bg-[#161B22] shadow-2xl overflow-hidden">
                  {[
                    ...(activeDeck ? [
                      { key: 'weak', icon: AlertTriangle, label: 'Weak', onClick: () => { setActiveTab('weak'); setShowMobileMenu(false); } },
                    ] : []),
                    { key: 'groups', icon: Users, label: 'Groups', onClick: () => { setActiveTab('groups'); setShowMobileMenu(false); } },
                    { key: 'library', icon: BookOpen, label: 'Library', onClick: () => { setActiveTab('library'); setShowMobileMenu(false); } },
                    { key: 'stats', icon: Sparkles, label: 'Stats', onClick: () => { setActiveTab('stats'); setShowMobileMenu(false); } },
                    { key: 'search', icon: Search, label: 'Search', onClick: () => { setActiveTab('search'); setShowMobileMenu(false); } },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={item.onClick}
                        className={`flex items-center space-x-2 w-full px-3 py-2 text-left text-[11px] font-mono transition-colors cursor-pointer ${
                          isActive
                            ? 'text-[#E3B341] bg-[#E3B341]/10'
                            : 'text-[#8B949E] hover:text-white hover:bg-[#21262D]'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#E3B341]" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </nav>

        <main className="flex-grow pt-2">
           {activeTab === 'decks' && (
            <DeckListScreen
              decks={decks}
              cards={cards}
              streakDays={streakDays}
              xp={userXp}
              onSelectDeck={handleSelectDeck}
              onCreateDeck={handleCreateDeck}
              onDeleteDeck={handleDeleteDeck}
              onRenameDeck={handleRenameDeck}
              onResetToDefaults={handleResetToDefaults}
              onShareDeck={handleShareDeck}
              onShareToGroup={handleShareToGroup}
            />
          )}

          {activeTab === 'study' && activeDeck && (
            <StudyMaterialScreen
              deck={activeDeck}
              cards={cards.filter(c => c.deckId === activeDeck.id)}
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
              onToggleBookmark={async (cardId, bookmarked) => {
                await updateCard(cardId, { bookmarked });
                setCards(prev => prev.map(c => c.id === cardId ? { ...c, bookmarked } : c));
              }}
              onGoBack={() => setActiveTab('study')}
              onSessionComplete={() => {
                // Add Session Bonus XP
                const bonus = 25; // XP_SESSION_BONUS
                setUserXp(prev => {
                  const nextXp = prev + bonus;
                  setSetting('user_xp', nextXp.toString());
                  return nextXp;
                });
              }}
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

          {activeTab === 'library' && (
            <LibraryScreen
              decks={decks}
              userId={user?.uid}
              userName={user?.displayName || user?.email || undefined}
              onImportToDeck={async (deckId, material) => {
                const { updateDeckStudyMaterial } = await import('./db/queries');
                await updateDeckStudyMaterial(deckId, material);
                setDecks(decks.map(d => d.id === deckId ? { ...d, studyMaterial: material } : d));
              }}
              onOpenAiGeneratorWithText={() => {
                setActiveTab('ai');
              }}
            />
          )}

          {activeTab === 'groups' && (
            <GroupListScreen
              userId={user?.uid}
              onCreateGroup={() => setShowCreateGroup(true)}
              onSelectGroup={(gid, gname) => { setSelectedGroupId(gid); setSelectedGroupName(gname || ''); setActiveTab('group-detail'); }}
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
              onDeleteGroup={handleDeleteGroup}
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
            groupName={selectedGroupName}
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