#!/usr/bin/env node
// 2026-10-03 23:48, G3: create StayGuide's Products/Prices in a Stripe **test-mode** (sandbox) account.
// Idempotent: prices are found by lookup_key, so re-running never duplicates them.
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-sandbox-setup.js   (or put the key in .env first)
// Prints the STRIPE_PRICE_* lines to paste into .env (price IDs are not secret).
require('dotenv').config();
const Stripe = require('stripe');

const key = process.env.STRIPE_SECRET_KEY || '';
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('Refusing to run: STRIPE_SECRET_KEY must be a TEST-mode key (sk_test_… or rk_test_…).');
  process.exit(1);
}
const stripe = new Stripe(key);

// Mirrors src/config/plans.ts (PRD §10 locked pricing)
const ITEMS = [
  { env: 'STRIPE_PRICE_PRO_MONTHLY', lookup: 'stayguide_pro_monthly', product: 'StayGuide Pro', amount: 999, recurring: { interval: 'month' } },
  { env: 'STRIPE_PRICE_PRO_ANNUAL', lookup: 'stayguide_pro_annual', product: 'StayGuide Pro', amount: 8900, recurring: { interval: 'year' } },
  { env: 'STRIPE_PRICE_PORTFOLIO_MONTHLY', lookup: 'stayguide_portfolio_monthly', product: 'StayGuide Portfolio (per 5 properties)', amount: 3200, recurring: { interval: 'month' } },
  { env: 'STRIPE_PRICE_BUNDLE_DESK', lookup: 'stayguide_bundle_desk', product: 'StayGuide Desk bundle (tablet + Pro)', amount: 3900, recurring: { interval: 'month' } },
  { env: 'STRIPE_PRICE_BUNDLE_WALL', lookup: 'stayguide_bundle_wall', product: 'StayGuide Wall bundle (display + Pro)', amount: 4900, recurring: { interval: 'month' } },
  { env: 'STRIPE_PRICE_KIT_DESK', lookup: 'stayguide_kit_desk', product: 'StayGuide Desk kit', amount: 39900 },
  { env: 'STRIPE_PRICE_KIT_WALL', lookup: 'stayguide_kit_wall', product: 'StayGuide Wall kit', amount: 69900 }
];

(async () => {
  const account = await stripe.accounts.retrieve();
  const name = account.settings?.dashboard?.display_name || account.business_profile?.name || account.id;
  console.log(`Stripe sandbox account: ${name} (${account.id})\n`);

  const existing = await stripe.prices.list({ lookup_keys: ITEMS.map(i => i.lookup), limit: 100, expand: ['data.product'] });
  const byLookup = new Map(existing.data.map(p => [p.lookup_key, p]));
  const products = new Map();
  for (const p of existing.data) if (p.product && typeof p.product === 'object') products.set(p.product.name, p.product.id);

  const lines = [];
  for (const item of ITEMS) {
    let price = byLookup.get(item.lookup);
    if (!price) {
      let productId = products.get(item.product);
      if (!productId) {
        const product = await stripe.products.create({ name: item.product, metadata: { app: 'stayguide' } });
        productId = product.id;
        products.set(item.product, productId);
      }
      price = await stripe.prices.create({
        product: productId,
        currency: 'usd',
        unit_amount: item.amount,
        lookup_key: item.lookup,
        ...(item.recurring ? { recurring: item.recurring } : {}),
        metadata: { app: 'stayguide' }
      });
      console.log(`created  ${item.lookup.padEnd(30)} ${price.id}`);
    } else {
      console.log(`exists   ${item.lookup.padEnd(30)} ${price.id}`);
    }
    lines.push(`${item.env}=${price.id}`);
  }

  console.log('\nAdd these to .env (not secret):\n');
  console.log(lines.join('\n'));
  console.log('\nNext: enable Cards, ACH Direct Debit and Bank transfers (Settings → Payment methods), set up the Customer Portal,');
  console.log('and run `stripe listen --forward-to localhost:3000/billing/webhook` for local webhooks (see docs/BILLING_SETUP.md).');
})().catch(error => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});
