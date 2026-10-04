// 2026-10-03 23:06, G3: single source of truth for plans, prices and hardware (locked by Tony 2026-10-03, PRD §10).
// Stripe price IDs come from env vars so test/live keys can be swapped without code changes.

export type PlanId = 'free' | 'pro' | 'portfolio';
export type BillingInterval = 'month' | 'year';

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Display price in USD (per property for Pro; per 5-property block for Portfolio). */
  price: { month: number; year?: number };
  unit: 'account' | 'property' | 'block_of_5';
  maxProperties: number | null;     // null = unlimited (billed by quantity)
  features: { tablet: boolean; themes: boolean; announcements: boolean; analytics: boolean; branding_removed: boolean };
  summary: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free', name: 'Free', price: { month: 0 }, unit: 'account', maxProperties: 1,
    features: { tablet: false, themes: false, announcements: false, analytics: false, branding_removed: false },
    summary: '1 property · phone/web guide link'
  },
  pro: {
    id: 'pro', name: 'Pro', price: { month: 9.99, year: 89 }, unit: 'property', maxProperties: null,
    features: { tablet: true, themes: true, announcements: true, analytics: true, branding_removed: true },
    summary: 'Full tablet kiosk, themes, announcements, analytics'
  },
  portfolio: {
    id: 'portfolio', name: 'Portfolio', price: { month: 32 }, unit: 'block_of_5', maxProperties: null,
    features: { tablet: true, themes: true, announcements: true, analytics: true, branding_removed: true },
    summary: 'Pro for every property, $32/mo per block of 5 properties'
  }
};

export type HardwareKit = 'desk' | 'wall';

export const HARDWARE: Record<HardwareKit, { name: string; purchase: number; bundleMonthly: number; description: string }> = {
  desk: { name: 'StayGuide Desk', purchase: 399, bundleMonthly: 39, description: 'Counter tablet (10–14") on a stand, plus Pro' },
  wall: { name: 'StayGuide Wall', purchase: 699, bundleMonthly: 49, description: '15.6" wall display, VESA/surface mount, plus Pro' }
};

/** Signature (flush custom install) is quote-only. */
export const SIGNATURE = { name: 'StayGuide Signature', fromMonthly: 99, note: 'Flush custom managed display — installed quote' };

/** Stripe price env var per purchasable item. */
export const PRICE_ENV = {
  pro_month: 'STRIPE_PRICE_PRO_MONTHLY',
  pro_year: 'STRIPE_PRICE_PRO_ANNUAL',
  portfolio_month: 'STRIPE_PRICE_PORTFOLIO_MONTHLY',
  bundle_desk: 'STRIPE_PRICE_BUNDLE_DESK',
  bundle_wall: 'STRIPE_PRICE_BUNDLE_WALL',
  kit_desk: 'STRIPE_PRICE_KIT_DESK',
  kit_wall: 'STRIPE_PRICE_KIT_WALL'
} as const;

export type PriceKey = keyof typeof PRICE_ENV;

export const priceId = (key: PriceKey): string | undefined => process.env[PRICE_ENV[key]] || undefined;

/** Billed subscription quantity for a plan given the number of active properties. */
export function billedQuantity(plan: PlanId, activeProperties: number): number {
  const n = Math.max(1, activeProperties);
  if (plan === 'portfolio') return Math.ceil(n / 5);
  if (plan === 'pro') return n;
  return 0;
}
