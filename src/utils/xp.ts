export const XP_PER_CARD_AGAIN_HARD = 5;
export const XP_PER_CARD_GOOD_EASY = 10;
export const XP_SESSION_BONUS = 25;

export interface LevelInfo {
  name: string;
  badge: string;
  minXp: number;
  nextLevelXp: number | null;
}

const LEVELS: Omit<LevelInfo, 'nextLevelXp'>[] = [
  { name: 'Seedling', badge: '🌱', minXp: 0 },
  { name: 'Student', badge: '📖', minXp: 100 },
  { name: 'Scholar', badge: '🎓', minXp: 300 },
  { name: 'Expert', badge: '🔥', minXp: 700 },
  { name: 'Master', badge: '⚡', minXp: 1500 },
];

export function getLevelForXP(xp: number): LevelInfo {
  let currentLevel = LEVELS[0];
  let nextLevelXp: number | null = LEVELS[1].minXp;

  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) {
      currentLevel = LEVELS[i];
      nextLevelXp = i + 1 < LEVELS.length ? LEVELS[i + 1].minXp : null;
    } else {
      break;
    }
  }

  return {
    ...currentLevel,
    nextLevelXp,
  };
}
