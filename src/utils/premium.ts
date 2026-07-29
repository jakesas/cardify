import { getSetting, setSetting } from '../db/queries';

export type PremiumStatus = 'trial' | 'active' | 'expired';
export type PremiumPlan = 'monthly' | 'yearly' | 'lifetime';

export interface PremiumState {
  status: PremiumStatus;
  trialDaysRemaining: number;
  plan: PremiumPlan | null;
  premiumUntil: string | null; // ISO date, or 'lifetime'
}

export interface PlanConfig {
  id: PremiumPlan;
  label: string;
  price: number;
  priceLabel: string;
  durationLabel: string;
  durationDays: number | null; // null = lifetime
  badge?: string;
}

export const PLANS: PlanConfig[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: 99,
    priceLabel: '₱99',
    durationLabel: 'per month',
    durationDays: 30,
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: 599,
    priceLabel: '₱599',
    durationLabel: 'per year',
    durationDays: 365,
    badge: 'Save 50%',
  },
  {
    id: 'lifetime',
    label: 'Lifetime',
    price: 1499,
    priceLabel: '₱1,499',
    durationLabel: 'one-time',
    durationDays: null,
    badge: 'Best value',
  },
];

const SETTING_TRIAL = 'premium_trial_started';
const SETTING_STATUS = 'premium_status';
const SETTING_PLAN = 'premium_plan';
const SETTING_UNTIL = 'premium_until';

const TRIAL_DAYS = 2;

/** Load premium state from the local DB. Auto-starts trial for new users. */
export async function getPremiumState(): Promise<PremiumState> {
  const [trialStarted, status, plan, until] = await Promise.all([
    getSetting(SETTING_TRIAL),
    getSetting(SETTING_STATUS),
    getSetting(SETTING_PLAN),
    getSetting(SETTING_UNTIL),
  ]);

  const now = Date.now();

  if (status === 'active') {
    if (until === 'lifetime') {
      return { status: 'active', trialDaysRemaining: 0, plan: (plan as PremiumPlan) ?? 'lifetime', premiumUntil: 'lifetime' };
    }
    if (until) {
      const expiryMs = new Date(until).getTime();
      if (now >= expiryMs) {
        return { status: 'expired', trialDaysRemaining: 0, plan: null, premiumUntil: null };
      }
    }
    return { status: 'active', trialDaysRemaining: 0, plan: (plan as PremiumPlan) ?? 'lifetime', premiumUntil: until };
  }

  if (trialStarted) {
    const startMs = new Date(trialStarted).getTime();
    const elapsedDays = (now - startMs) / (1000 * 60 * 60 * 24);
    const remaining = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
    if (remaining > 0) {
      return { status: 'trial', trialDaysRemaining: remaining, plan: null, premiumUntil: null };
    }
    return { status: 'expired', trialDaysRemaining: 0, plan: null, premiumUntil: null };
  }

  const today = new Date().toISOString();
  await setSetting(SETTING_TRIAL, today);
  return { status: 'trial', trialDaysRemaining: TRIAL_DAYS, plan: null, premiumUntil: null };
}

/** Activate premium after payment — stores plan + expiry. */
export async function activatePremium(plan: PremiumPlan): Promise<void> {
  const config = PLANS.find(p => p.id === plan);
  await setSetting(SETTING_STATUS, 'active');
  await setSetting(SETTING_PLAN, plan);

  if (config?.durationDays === null) {
    await setSetting(SETTING_UNTIL, 'lifetime');
  } else {
    const until = new Date(Date.now() + (config!.durationDays! * 24 * 60 * 60 * 1000)).toISOString();
    await setSetting(SETTING_UNTIL, until);
  }
}

/** Check whether a premium-gated feature is available (paid only, no trial). */
export async function isFeatureAvailable(): Promise<boolean> {
  const state = await getPremiumState();
  return state.status === 'active';
}

export function isPremiumActive(state: PremiumState): boolean {
  return state.status === 'active';
}

/** Human-readable label for the current access state. */
export function formatAccessLabel(state: PremiumState): string {
  switch (state.status) {
    case 'active':
      return state.plan ? `Premium · ${PLANS.find(p => p.id === state.plan)?.label ?? state.plan}` : 'Premium';
    case 'trial':
      return `${state.trialDaysRemaining} day${state.trialDaysRemaining !== 1 ? 's' : ''} trial remaining`;
    case 'expired':
      return 'Trial expired';
  }
}

/** Format the next billing / expiry date for display. */
export function formatExpiry(state: PremiumState): string | null {
  if (state.status !== 'active' || !state.premiumUntil) return null;
  if (state.premiumUntil === 'lifetime') return 'Lifetime';
  const d = new Date(state.premiumUntil);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
