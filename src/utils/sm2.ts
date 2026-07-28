/**
 * SM-2 Spaced-Repetition Algorithm Tailored for CCNA Study Tool
 * Inputs:
 * - rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
 * - reps: Current consecutive successful reviews
 * - interval: Current interval in days
 * - easeFactor: Current ease factor (starts at 2.5)
 */
export function calculateSM2(
  rating: 1 | 2 | 3 | 4,
  reps: number,
  interval: number,
  easeFactor: number
): { reps: number; interval: number; easeFactor: number } {
  let nextReps = reps;
  let nextInterval = interval;
  let nextEaseFactor = easeFactor;

  if (rating === 1) {
    // Incorrect / try again soon
    nextReps = 0;
    nextInterval = 1; // repeat tomorrow
    nextEaseFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    // Correct responses
    nextReps = reps + 1;

    if (nextReps === 1) {
      nextInterval = rating === 2 ? 1 : rating === 3 ? 1 : 2; // Hard: 1d, Good: 1d, Easy: 2d
    } else if (nextReps === 2) {
      nextInterval = rating === 2 ? 2 : rating === 3 ? 4 : 6; // Hard: 2d, Good: 4d, Easy: 6d
    } else {
      const multiplier = rating === 2 ? 1.2 : rating === 3 ? easeFactor : easeFactor * 1.35;
      nextInterval = Math.ceil(interval * multiplier);
    }

    // Adjust EF: Hard decreases, Good increases slightly, Easy increases more
    const efAdjustment = rating === 2 ? -0.15 : rating === 3 ? 0.05 : 0.15;
    nextEaseFactor = Math.max(1.3, easeFactor + efAdjustment);
  }

  // Prevent intervals from becoming abnormally large too quickly if someone hits Good repeatedly on a fresh card,
  // but keep SM-2 properties intact. Limit max interval to 365 days.
  nextInterval = Math.min(365, Math.max(1, nextInterval));

  return {
    reps: nextReps,
    interval: nextInterval,
    easeFactor: Math.round(nextEaseFactor * 100) / 100,
  };
}

/**
 * Returns today's date formatted as YYYY-MM-DD in the local timezone
 */
export function getLocalDateString(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a dueDate string (YYYY-MM-DD) is due today or past due
 */
export function isDue(dueDateStr: string, todayStr: string): boolean {
  return dueDateStr <= todayStr;
}
