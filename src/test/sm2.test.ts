import { describe, it, expect } from 'vitest';
import { calculateSM2, getLocalDateString, isDue } from '../utils/sm2';

describe('calculateSM2', () => {
  // ── First review ───────────────────────────────────────
  it('rating 1 (Again) on first review: resets reps to 0, interval to 1, decreases EF', () => {
    const result = calculateSM2(1, 0, 0, 2.5);
    expect(result).toEqual({ reps: 0, interval: 1, easeFactor: 2.3 });
  });

  it('rating 2 (Hard) on first review: reps=1, interval=1, EF 2.35', () => {
    const result = calculateSM2(2, 0, 0, 2.5);
    expect(result).toEqual({ reps: 1, interval: 1, easeFactor: 2.35 });
  });

  it('rating 3 (Good) on first review: reps=1, interval=1, EF 2.55', () => {
    const result = calculateSM2(3, 0, 0, 2.5);
    expect(result).toEqual({ reps: 1, interval: 1, easeFactor: 2.55 });
  });

  it('rating 4 (Easy) on first review: reps=1, interval=2, EF 2.65', () => {
    const result = calculateSM2(4, 0, 0, 2.5);
    expect(result).toEqual({ reps: 1, interval: 2, easeFactor: 2.65 });
  });

  // ── Second review ──────────────────────────────────────
  it('rating 3 (Good) on second review: interval=4, EF=2.6', () => {
    const result = calculateSM2(3, 1, 1, 2.55);
    expect(result).toEqual({ reps: 2, interval: 4, easeFactor: 2.6 });
  });

  it('rating 2 (Hard) on second review: interval=2, EF=2.4', () => {
    const result = calculateSM2(2, 1, 1, 2.55);
    expect(result).toEqual({ reps: 2, interval: 2, easeFactor: 2.4 });
  });

  it('rating 4 (Easy) on second review: interval=6, EF=2.7', () => {
    const result = calculateSM2(4, 1, 1, 2.55);
    expect(result).toEqual({ reps: 2, interval: 6, easeFactor: 2.7 });
  });

  // ── Mature reviews (3+) ────────────────────────────────
  it('rating 3 (Good) on mature card: multiplies interval by EF', () => {
    const result = calculateSM2(3, 3, 10, 2.5);
    expect(result).toEqual({ reps: 4, interval: 25, easeFactor: 2.55 });
  });

  it('rating 4 (Easy) on mature card: multiplies interval by EF * 1.35', () => {
    const result = calculateSM2(4, 5, 30, 2.5);
    expect(result).toEqual({ reps: 6, interval: Math.ceil(30 * 2.5 * 1.35), easeFactor: 2.65 });
  });

  it('rating 2 (Hard) on mature card: multiplies interval by 1.2, decreases EF', () => {
    const result = calculateSM2(2, 4, 20, 2.5);
    expect(result).toEqual({ reps: 5, interval: 24, easeFactor: 2.35 });
  });

  // ── Edge cases ─────────────────────────────────────────
  it('rating 1 (Again) resets to 0 even after many correct reps', () => {
    const result = calculateSM2(1, 10, 60, 2.5);
    expect(result).toEqual({ reps: 0, interval: 1, easeFactor: 2.3 });
  });

  it('ease factor never goes below 1.3', () => {
    const result = calculateSM2(1, 0, 0, 1.3);
    expect(result.easeFactor).toBe(1.3);
  });

  it('interval never exceeds 365 days', () => {
    const result = calculateSM2(3, 20, 300, 2.5);
    expect(result.interval).toBe(365);
  });

  it('interval never goes below 1', () => {
    const result = calculateSM2(1, 0, 0, 2.5);
    expect(result.interval).toBe(1);
  });

  it('ease factor is rounded to 2 decimal places', () => {
    const result = calculateSM2(1, 0, 0, 2.55);
    expect(result.easeFactor).toBe(2.35);
  });
});

describe('getLocalDateString', () => {
  it('returns YYYY-MM-DD format with offset 0', () => {
    const result = getLocalDateString(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a different date for offset 1', () => {
    const today = getLocalDateString(0);
    const tomorrow = getLocalDateString(1);
    expect(tomorrow).not.toBe(today);
  });

  it('returns a past date for offset -1', () => {
    const today = getLocalDateString(0);
    const yesterday = getLocalDateString(-1);
    expect(yesterday).not.toBe(today);
  });
});

describe('isDue', () => {
  it('returns true when due date is before today', () => {
    expect(isDue('2024-01-01', '2024-06-15')).toBe(true);
  });

  it('returns true when due date is today', () => {
    expect(isDue('2024-06-15', '2024-06-15')).toBe(true);
  });

  it('returns false when due date is in the future', () => {
    expect(isDue('2024-07-01', '2024-06-15')).toBe(false);
  });
});
