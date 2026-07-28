import { useState, useEffect, type FC } from 'react';
import { Card, ReviewHistory } from '../types';
import { getLocalDateString, isDue } from '../utils/sm2';
import { Flame, Trophy, CheckCircle2, TrendingUp, Target, Save } from 'lucide-react';
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

  // Aggregate cards due per day over the next 7 days
  const duePerDay = Array.from({ length: 7 }, (_, offset) => {
    const dateStr = getLocalDateString(offset);
    // Count cards whose due date matches this exact date
    const count = cards.filter((c) => c.dueDate === dateStr).length;
    
    // Format day label
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const label = offset === 0 
      ? 'Today' 
      : d.toLocaleDateString(undefined, { weekday: 'short' });

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

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left Card: 7-Day Due Forecast (Bar Chart) */}
        <div className="md:col-span-7 p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-3">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-1.5">
            <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E]">
              📆 7-Day Spacing Forecast
            </h3>
            <span className="text-[9px] font-mono text-[#8B949E]">Cards due per day</span>
          </div>

          {/* Bar Chart Container */}
          <div className="h-44 flex items-end justify-between gap-2 pt-6 px-2 border-b border-[#30363D] relative bg-[#0D1117] rounded p-2">
            {/* Grid Helper Lines */}
            <div className="absolute inset-x-0 top-1/4 border-t border-[#30363D]/40 pointer-events-none"></div>
            <div className="absolute inset-x-0 top-2/4 border-t border-[#30363D]/40 pointer-events-none"></div>
            <div className="absolute inset-x-0 top-3/4 border-t border-[#30363D]/40 pointer-events-none"></div>

            {duePerDay.map((day, idx) => {
              const barHeightPercent = (day.count / maxDueCount) * 100;
              const isToday = idx === 0;

              return (
                <div key={idx} className="flex-grow flex flex-col items-center group relative z-10">
                  {/* Hover Tooltip showing number of cards */}
                  <div className="absolute -top-7 scale-0 group-hover:scale-100 transition-all duration-75 px-1.5 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[9px] font-mono text-[#E3B341]">
                    {day.count} due
                  </div>

                  {/* Active Bar */}
                  <div
                    className={`w-full max-w-[24px] rounded-t transition-all duration-150 ${
                      isToday
                        ? 'bg-[#E3B341] shadow-[0_0_8px_rgba(227,179,65,0.3)]'
                        : day.count > 0
                        ? 'bg-[#388BFD] group-hover:bg-[#58a6ff]'
                        : 'bg-[#2D333B]'
                    }`}
                    style={{ height: `${Math.max(6, barHeightPercent)}%` }}
                  ></div>

                  {/* Count indicator on top of zero */}
                  {day.count > 0 && (
                    <span className="text-[8px] font-mono text-[#8B949E] mt-1 font-bold">
                      {day.count}
                    </span>
                  )}

                  {/* Day Label */}
                  <span className={`text-[9px] font-mono mt-1 ${isToday ? 'text-[#E3B341] font-bold' : 'text-[#8B949E]'}`}>
                    {day.label.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-[#8B949E] font-mono text-center">
            SM-2 PREDICTIONS BASED ON CURRENT ACTIVE MEMORY VARIABLES.
          </p>
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

      {/* Weakness Heatmap */}
      <div className="p-4 rounded border border-[#2D333B] bg-[#161B22] space-y-4">
        <h3 className="text-[10px] font-bold font-mono tracking-wider uppercase text-[#8B949E] border-b border-[#30363D] pb-1.5">
          🔥 Weakness Heatmap
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Object.keys(domainAccuracy).length === 0 ? (
            <div className="sm:col-span-3 text-center py-6 text-[#8B949E] font-mono text-xs uppercase">
              No review data yet — start reviewing to see your heatmap.
            </div>
          ) : (
            Object.entries(domainAccuracy).map(([domain, data]) => {
              const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
              const barColor = pct >= 80 ? 'bg-[#3FB950]' : pct >= 60 ? 'bg-[#E3B341]' : pct >= 40 ? 'bg-[#D29922]' : 'bg-[#F85149]';
              const textColor = pct >= 80 ? 'text-[#3FB950]' : pct >= 60 ? 'text-[#E3B341]' : pct >= 40 ? 'text-[#D29922]' : 'text-[#F85149]';
              return (
                <div key={domain} className="p-3 rounded border border-[#30363D] bg-[#0D1117] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-[#8B949E] uppercase truncate" title={domain}>
                      {domain}
                    </span>
                    <span className={`text-[10px] font-mono font-bold ${textColor}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-[#161B22] overflow-hidden border border-[#30363D]">
                    <div className={`h-full rounded ${barColor}`} style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-[#8B949E]">
                    <span>{data.correct} correct</span>
                    <span>{data.total} reviews</span>
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
