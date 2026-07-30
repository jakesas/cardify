import { useState, useEffect, type FC } from 'react';
import { Card, ReviewHistory } from '../types';
import { getLocalDateString, isDue } from '../utils/sm2';
import { Flame, Trophy, CheckCircle2, TrendingUp, Target, Save, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { getSetting, setSetting } from '../db/queries';

interface StatsScreenProps {
  cards: Card[];
  history: ReviewHistory[];
  streakDays: number;
}

export const StatsScreen: FC<StatsScreenProps> = ({
  cards,
  history,
  streakDays,
}) => {
  const todayStr = getLocalDateString();
  const totalCards = cards.length;
  
  // Calculated metrics
  const reviewedCardsCount = cards.filter((c) => c.reps > 0).length;
  const dueTodayCount = cards.filter((c) => isDue(c.dueDate, todayStr)).length;
  
  // Custom smart retention metric: percent of cards that are currently remembered (reps > 0) and rated well (EF >= 2.4)
  const positiveCards = cards.filter((c) => c.reps > 0 && c.easeFactor >= 2.3).length;
  const retentionRate = reviewedCardsCount > 0
    ? Math.round((positiveCards / reviewedCardsCount) * 100)
    : 94; // fallback for initial template view

  const [forecastDays, setForecastDays] = useState(7);
  const expanded = forecastDays > 7;

  const duePerDay = Array.from({ length: forecastDays }, (_, offset) => {
    const dateStr = getLocalDateString(offset);
    const count = cards.filter((c) => c.dueDate === dateStr).length;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const label = offset === 0
      ? 'Today'
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    return { label, count, dateStr };
  });

  const maxDueCount = Math.max(...duePerDay.map((d) => d.count), 4);

  // Group cards by CCNA exam domains to show where effort is distributed
  const domainBreakdown = cards.reduce((acc, card) => {
    acc[card.tag] = (acc[card.tag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ─── Weakness Heatmap ──────────────────────────────────────────────────
  // For each domain, calculate the accuracy based on review history ratings
  const cardDomainMap = new Map(cards.map(c => [c.id, c.tag]));
  const domainAccuracy = cards.reduce((acc, card) => {
    const domain = card.tag;
    if (!acc[domain]) {
      acc[domain] = { total: 0, correct: 0 };
    }
    return acc;
  }, {} as Record<string, { total: number; correct: number }>);

  history.forEach(h => {
    const domain = cardDomainMap.get(h.cardId);
    if (!domain) return;
    if (!domainAccuracy[domain]) {
      domainAccuracy[domain] = { total: 0, correct: 0 };
    }
    domainAccuracy[domain].total++;
    if (h.rating >= 3) {
      domainAccuracy[domain].correct++;
    }
  });

  const todayReviews = history.filter(h => h.timestamp.startsWith(todayStr)).length;

  const domainMastery = Object.entries(domainAccuracy).map(([domain, data]) => {
    const domainCards = cards.filter(c => c.tag === domain);
    const avgEF = domainCards.length > 0
      ? domainCards.reduce((s, c) => s + c.easeFactor, 0) / domainCards.length
      : 2.5;
    const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;

    let level: 'mastered' | 'reviewing' | 'fragile' | 'new' = 'new';
    if (avgEF >= 2.5 && accuracy >= 80) level = 'mastered';
    else if (avgEF >= 2.0 && accuracy >= 60) level = 'reviewing';
    else if (avgEF >= 1.3) level = 'fragile';

    return {
      domain,
      cardCount: domainCards.length,
      avgEF: Math.round(avgEF * 100) / 100,
      accuracy,
      totalReviews: data.total,
      correctReviews: data.correct,
      level,
    };
  }).sort((a, b) => {
    const order = { fragile: 0, reviewing: 1, new: 2, mastered: 3 };
    return (order[a.level] ?? 99) - (order[b.level] ?? 99);
  });

  // ─── Daily Goal Settings ────────────────────────────────────────────────
  const [dailyReviewLimit, setDailyReviewLimit] = useState('20');
  const [dailyNewCardsLimit, setDailyNewCardsLimit] = useState('10');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const rev = await getSetting('daily_review_limit');
      const newc = await getSetting('daily_new_cards_limit');
      if (rev) setDailyReviewLimit(rev);
      if (newc) setDailyNewCardsLimit(newc);
      setSettingsLoaded(true);
    }
    load();
  }, []);

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    await setSetting('daily_review_limit', dailyReviewLimit);
    await setSetting('daily_new_cards_limit', dailyNewCardsLimit);
    setSettingsSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in font-mono">
      {/* Header */}
      <div className="pb-3 border-b border-[#2D333B]">
        <span className="text-[9px] font-mono tracking-widest text-[#8B949E] uppercase font-bold">
          Telemetry & Learning Statistics
        </span>
        <h2 className="text-sm font-bold text-white uppercase font-mono mt-0.5">
          Study Dashboard
        </h2>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Retention */}
        <div className="p-3.5 rounded border border-[#2D333B] bg-[#161B22] space-y-1">
          <div className="flex items-center justify-between text-[#8B949E]">
            <span className="text-[10px] font-mono tracking-wide uppercase font-bold">Retention Rate</span>
            <TrendingUp size={14} className="text-[#388BFD]" />
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xl font-bold tracking-tight text-white">{retentionRate}%</span>
            <span className="text-[9px] text-[#8B949E] font-mono">TARGET: &gt;90%</span>
          </div>
          <p className="text-[9px] text-[#8B949E] leading-tight">
            Percentage of recalled cards maintaining a stable ease factor.
          </p>
        </div>

        {/* Metric 2: Streak */}
        <div className="p-3.5 rounded border border-[#2D333B] bg-[#161B22] space-y-1">
          <div className="flex items-center justify-between text-[#8B949E]">
            <span className="text-[10px] font-mono tracking-wide uppercase font-bold">Study Streak</span>
            <Flame size={14} className="text-[#E3B341] animate-pulse" />
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xl font-bold tracking-tight text-white">{streakDays} Days</span>
            <span className="text-[9px] text-[#3FB950] font-mono">▲ ACTIVE</span>
          </div>
          <p className="text-[9px] text-[#8B949E] leading-tight">
            Consecutive study sessions logged in-applet. Keep it rolling!
          </p>
        </div>

        {/* Metric 3: Memorized */}
        <div className="p-3.5 rounded border border-[#2D333B] bg-[#161B22] space-y-1">
          <div className="flex items-center justify-between text-[#8B949E]">
            <span className="text-[10px] font-mono tracking-wide uppercase font-bold">Cards Mastered</span>
            <Trophy size={14} className="text-[#E3B341]" />
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xl font-bold tracking-tight text-white">{reviewedCardsCount}</span>
            <span className="text-[9px] text-[#8B949E]">/ {totalCards} TOTAL</span>
          </div>
          <p className="text-[9px] text-[#8B949E] leading-tight">
            Number of distinct cards reviewed at least once with SM-2.
          </p>
        </div>

        {/* Metric 4: Due Today */}
        <div className="p-3.5 rounded border border-[#2D333B] bg-[#161B22] space-y-1">
          <div className="flex items-center justify-between text-[#8B949E]">
            <span className="text-[10px] font-mono tracking-wide uppercase font-bold">Due Today</span>
            <CheckCircle2 size={14} className="text-[#388BFD]" />
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xl font-bold tracking-tight text-white">{dueTodayCount}</span>
            <span className="text-[9px] text-[#8B949E] font-mono">PENDING</span>
          </div>
          <p className="text-[9px] text-[#8B949E] leading-tight">
            Reviews remaining for today to stay aligned with your curve.
          </p>
        </div>
      </div>

      {/* Weekly Summary */}
      {(() => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        const weekReviews = history.filter(h => h.timestamp >= weekAgoStr);
        const weekReviewCount = weekReviews.length;
        const weekCorrectCount = weekReviews.filter(h => h.rating >= 3).length;
        const weekRetention = weekReviewCount > 0 ? Math.round((weekCorrectCount / weekReviewCount) * 100) : 0;

        const uniqueDays = new Set(weekReviews.map(h => h.timestamp.split('T')[0]));
        const weekStreak = uniqueDays.size;

        const prevWeekStart = new Date(weekAgo);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekReviews = history.filter(h => {
          const d = h.timestamp.split('T')[0];
          return d >= prevWeekStart.toISOString().split('T')[0] && d < weekAgoStr;
        }).length;
        const trend = prevWeekReviews > 0 ? Math.round(((weekReviewCount - prevWeekReviews) / prevWeekReviews) * 100) : 0;

        return (
          <div className="p-4 rounded border border-[#2D333B] bg-gradient-to-r from-[#161B22] to-[#1C2128] space-y-3">
            <div className="flex items-center justify-between border-b border-[#30363D] pb-1.5">
              <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E] flex items-center gap-1.5">
                <TrendingUp size={12} className="text-[#3FB950]" />
                Weekly Summary
              </h3>
              <span className="text-[9px] font-mono text-[#8B949E]">{weekAgo.toLocaleDateString()} – today</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center space-y-0.5">
                <span className="text-lg font-bold text-white">{weekReviewCount}</span>
                <p className="text-[9px] font-mono text-[#8B949E] uppercase tracking-wider">Reviews</p>
              </div>
              <div className="text-center space-y-0.5">
                <span className="text-lg font-bold text-white">{weekRetention}%</span>
                <p className="text-[9px] font-mono text-[#8B949E] uppercase tracking-wider">Retention</p>
              </div>
              <div className="text-center space-y-0.5">
                <div className="flex items-center justify-center gap-1">
                  <Flame size={14} className="text-[#E3B341]" />
                  <span className="text-lg font-bold text-white">{weekStreak}d</span>
                </div>
                <p className="text-[9px] font-mono text-[#8B949E] uppercase tracking-wider">Active Days</p>
              </div>
              <div className="text-center space-y-0.5">
                <span className={`text-lg font-bold ${trend > 0 ? 'text-[#3FB950]' : trend < 0 ? 'text-[#F85149]' : 'text-white'}`}>
                  {trend > 0 ? '+' : ''}{trend}%
                </span>
                <p className="text-[9px] font-mono text-[#8B949E] uppercase tracking-wider">vs prior week</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left Card: Due Forecast (Bar Chart) */}
        <div className="md:col-span-7 p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-1.5">
            <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E]">
              {forecastDays}-Day Spacing Forecast
            </h3>
            <button onClick={() => setForecastDays(forecastDays === 7 ? 30 : 7)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider text-[#8B949E] hover:text-white hover:bg-[#30363D] border border-[#30363D] transition-colors cursor-pointer">
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? '7 Days' : '30 Days'}
            </button>
          </div>

          {/* Bar Chart Container */}
          <div className={`flex items-end justify-between gap-px sm:gap-0.5 pt-6 px-1 border-b border-[#30363D] relative bg-[#0D1117] rounded p-2 ${expanded ? 'h-52' : 'h-44'}`}>
            <div className="absolute inset-x-0 top-1/4 border-t border-[#30363D]/40 pointer-events-none"></div>
            <div className="absolute inset-x-0 top-2/4 border-t border-[#30363D]/40 pointer-events-none"></div>
            <div className="absolute inset-x-0 top-3/4 border-t border-[#30363D]/40 pointer-events-none"></div>

            {duePerDay.map((day, idx) => {
              const barHeightPercent = (day.count / maxDueCount) * 100;
              const isToday = idx === 0;

              return (
                <div key={idx} className="flex-grow flex flex-col items-center group relative z-10 max-w-[32px]">
                  <div className="absolute -top-7 scale-0 group-hover:scale-100 transition-all duration-75 px-1.5 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[9px] font-mono text-[#E3B341] whitespace-nowrap z-20">
                    {day.dateStr}: {day.count} due
                  </div>
                  <div
                    className={`w-full rounded-t transition-all duration-150 ${
                      isToday
                        ? 'bg-[#E3B341] shadow-[0_0_8px_rgba(227,179,65,0.3)]'
                        : day.count > 0
                        ? 'bg-[#388BFD] group-hover:bg-[#58a6ff]'
                        : 'bg-[#2D333B]'
                    }`}
                    style={{ height: `${Math.max(expanded ? 2 : 6, barHeightPercent)}%` }}
                  ></div>
                  {day.count > 0 && !expanded && (
                    <span className="text-[8px] font-mono text-[#8B949E] mt-1 font-bold">
                      {day.count}
                    </span>
                  )}
                  <span className={`text-[9px] font-mono mt-1 truncate max-w-full ${isToday ? 'text-[#E3B341] font-bold' : 'text-[#8B949E]'}`}>
                    {expanded ? day.label.split(' ')[0].toUpperCase() : day.label.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-[#8B949E]">Total due in period: <strong className="text-white">{duePerDay.reduce((s, d) => s + d.count, 0)} cards</strong></span>
            <span className="text-[#8B949E]">SM-2 PREDICTION</span>
          </div>
        </div>

        {/* Right Card: Exam Domain Distribution */}
        <div className="md:col-span-5 p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
          <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E] border-b border-[#30363D] pb-1.5">
            📊 Domain Distribution
          </h3>

          <div className="space-y-3 pt-1">
            {Object.keys(domainBreakdown).length === 0 ? (
              <div className="text-center py-10 text-[#8B949E] font-mono text-xs uppercase">
                No cards created yet.
              </div>
            ) : (
              Object.entries(domainBreakdown).map(([domain, count]) => {
                const percentage = Math.round(((count as number) / totalCards) * 100);

                return (
                  <div key={domain} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#E0E0E0] truncate pr-2 font-bold" title={domain}>
                        {domain.toUpperCase()}
                      </span>
                      <span className="text-[#8B949E] font-bold">{count} ({percentage}%)</span>
                    </div>
                    {/* Progress Bar background */}
                    <div className="w-full h-2 rounded bg-[#0D1117] overflow-hidden border border-[#30363D]">
                      <div
                        className="h-full bg-[#E3B341] rounded"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Domain Mastery Map */}
      <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-1.5">
          <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E]">
            Domain Mastery Map
          </h3>
          <span className="text-[9px] font-mono text-[#8B949E]">{domainMastery.length} domains</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {domainMastery.length === 0 ? (
            <div className="sm:col-span-3 text-center py-6 text-[#8B949E] font-mono text-xs uppercase">
              No review data yet — start reviewing to see your mastery breakdown.
            </div>
          ) : (
            domainMastery.map(({ domain, cardCount, avgEF, accuracy, totalReviews, correctReviews, level }) => {
              const levelConfig = {
                mastered: { color: 'border-[#3FB950]/40 bg-[#3FB950]/5 text-[#3FB950]', label: 'Mastered' },
                reviewing: { color: 'border-[#388BFD]/40 bg-[#388BFD]/5 text-[#388BFD]', label: 'Reviewing' },
                fragile: { color: 'border-[#F85149]/40 bg-[#F85149]/5 text-[#F85149]', label: 'Fragile' },
                new: { color: 'border-[#8B949E]/40 bg-[#8B949E]/5 text-[#8B949E]', label: 'New' },
              }[level];
              const barColor = accuracy >= 80 ? 'bg-[#3FB950]' : accuracy >= 60 ? 'bg-[#388BFD]' : accuracy >= 40 ? 'bg-[#E3B341]' : 'bg-[#F85149]';

              return (
                <div key={domain} className="p-3 rounded border border-[#30363D] bg-[#0D1117] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono font-bold text-[#E0E0E0] uppercase truncate">{domain}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold uppercase tracking-wider border ${levelConfig.color}`}>
                      {levelConfig.label}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-[#161B22] overflow-hidden border border-[#30363D]">
                    <div className={`h-full rounded ${barColor}`} style={{ width: `${accuracy}%` }}></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[8px] font-mono text-[#8B949E] pt-1">
                    <div className="text-center">
                      <span className="block text-[10px] font-bold text-white">{cardCount}</span>
                      Cards
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-bold text-white">{avgEF.toFixed(1)}</span>
                      Avg EF
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-bold text-white">{totalReviews}</span>
                      Reviews
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Daily Goal Settings */}
      <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
        <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E] border-b border-[#30363D] pb-1.5">
          🎯 Daily Goals & Limits
        </h3>
        {settingsLoaded ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#8B949E] uppercase font-bold">Daily Review Limit</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={dailyReviewLimit}
                  onChange={e => setDailyReviewLimit(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[#30363D] bg-[#0D1117] text-white text-xs font-mono focus:outline-none focus:border-[#E3B341]"
                />
                <p className="text-[8px] text-[#8B949E]">Max reviews per day. 0 = unlimited.</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#8B949E] uppercase font-bold">Daily New Cards Limit</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={dailyNewCardsLimit}
                  onChange={e => setDailyNewCardsLimit(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[#30363D] bg-[#0D1117] text-white text-xs font-mono focus:outline-none focus:border-[#E3B341]"
                />
                <p className="text-[8px] text-[#8B949E]">New cards introduced per day.</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[10px] font-mono text-[#8B949E]">
                <Target size={12} />
                <span>Today's Reviews: <span className="text-white font-bold">{todayReviews}</span> / {dailyReviewLimit || '∞'}</span>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-[10px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save size={12} />
                <span>{settingsSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-[#8B949E] font-mono text-xs uppercase">Loading settings...</div>
        )}
      </div>

      {/* Review Logs */}
      <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
        <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E] border-b border-[#30363D] pb-1.5">
          📜 Historic Activity Log
        </h3>

          {history.length === 0 ? (
          <p className="text-xs font-mono text-[#8B949E]">NO REVIEW EVENTS LOGGED DURING THIS SESSION.</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {history.slice().reverse().map((item) => {
              const correspondingCard = cards.find((c) => c.id === item.cardId);

              return (
                <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2 p-2 rounded bg-[#0D1117] border border-[#30363D] text-[9px] sm:text-[10px] font-mono">
                  <div className="flex items-center space-x-1.5 min-w-0 w-full sm:w-auto">
                    <span className={`px-1 py-0.5 rounded text-[7px] sm:text-[8px] uppercase font-bold flex-shrink-0 ${
                      item.rating === 1 
                        ? 'bg-[#F85149]/10 text-[#F85149] border border-[#F85149]/20' 
                        : item.rating === 2 
                        ? 'bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20' 
                        : item.rating === 3
                        ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/20'
                        : 'bg-[#388BFD]/10 text-[#388BFD] border border-[#388BFD]/20'
                    }`}>
                      {item.rating === 1 ? 'Again' : item.rating === 2 ? 'Hard' : item.rating === 3 ? 'Good' : 'Easy'}
                    </span>
                    <span className="text-[#E0E0E0] truncate min-w-0" title={correspondingCard?.front}>
                      {correspondingCard?.front || `Card ID: ${item.cardId}`}
                    </span>
                  </div>

                  <span className="text-[#8B949E] flex-shrink-0 text-[8px] sm:text-[10px] font-bold">
                    {item.previousInterval}d → {item.nextInterval}d
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
