import React from 'react';
import { getLevelForXP } from '../utils/xp';

interface XPBarProps {
  xp: number;
  streakDays: number;
}

export const XPBar: React.FC<XPBarProps> = ({ xp, streakDays }) => {
  const levelInfo = getLevelForXP(xp);
  
  let progressPercent = 100;
  if (levelInfo.nextLevelXp !== null) {
    const range = levelInfo.nextLevelXp - levelInfo.minXp;
    const current = xp - levelInfo.minXp;
    progressPercent = Math.max(0, Math.min(100, (current / range) * 100));
  }

  return (
    <div className="flex items-center gap-3">
      {streakDays > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#E3B341]/10 text-[#E3B341] border border-[#E3B341]/20">
          <span className="text-sm">🔥</span>
          <span className="text-xs font-bold font-mono">{streakDays}</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#161B22] border border-[#2D333B]">
        <div className="flex items-center justify-center w-6 h-6 rounded bg-[#21262D] text-sm">
          {levelInfo.badge}
        </div>
        
        <div className="flex flex-col w-24">
          <div className="flex justify-between items-baseline mb-0.5">
            <span className="text-[9px] font-bold text-white uppercase tracking-widest truncate">{levelInfo.name}</span>
            <span className="text-[9px] font-mono text-[#8B949E]">{xp} XP</span>
          </div>
          
          <div className="h-1.5 w-full bg-[#0D1117] rounded-full overflow-hidden border border-[#30363D]">
            <div 
              className="h-full bg-[#E3B341] transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
