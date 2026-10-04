// 2026-10-04 00:12, G5: server-rendered pricing for the marketing page, generated from src/config/plans.ts
// (single source of truth shared with billing; static HTML so prices are crawlable and work without JS).
import fs from 'fs';
import path from 'path';
import { PLANS, HARDWARE, SIGNATURE } from '../config/plans';

const money = (n: number) => '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function renderPricingSection(): string {
  const pro = PLANS.pro, portfolio = PLANS.portfolio;
  const annualMonthlyEquivalent = pro.price.year! / 12;
  const savingPct = Math.round((1 - annualMonthlyEquivalent / pro.price.month) * 100);

  const plans = `
    <article class="price-card">
      <h3>Free</h3>
      <p class="price-line"><span class="price">$0</span><span class="per">1 property</span></p>
      <p class="price-note">For trying StayGuide with a single home.</p>
      <ul>
        <li>Phone &amp; web guide link for guests</li>
        <li>Wi-Fi, house info, local guide, how-to videos</li>
        <li>Guest issue reports</li>
        <li>"Powered by StayGuide" footer</li>
      </ul>
      <a class="btn btn-secondary" href="/signup">Start free</a>
    </article>
    <article class="price-card featured">
      <h3>Pro <span class="badge">Most popular</span></h3>
      <p class="price-line">
        <span class="price" data-monthly>${money(pro.price.month)}</span><span class="per" data-monthly>per property / month</span>
        <span class="price" data-annual>${money(pro.price.year!)}</span><span class="per" data-annual>per property / year</span>
      </p>
      <p class="price-note"><span data-monthly>Or ${money(pro.price.year!)}/year per property, save ${savingPct}%.</span><span data-annual>About ${money(Math.round(annualMonthlyEquivalent * 100) / 100)}/month per property.</span></p>
      <ul>
        <li>Everything in Free</li>
        <li>In-home tablet kiosk, works offline</li>
        <li>Luxury themes &amp; custom backgrounds</li>
        <li>Announcements on the home screen</li>
        <li>Book-direct &amp; review QR codes</li>
        <li>Section analytics, no StayGuide branding</li>
      </ul>
      <a class="btn btn-primary" href="/signup?plan=pro">Start with Pro</a>
    </article>
    <article class="price-card">
      <h3>Portfolio</h3>
      <p class="price-line"><span class="price">${money(portfolio.price.month)}</span><span class="per">per month, per 5 properties</span></p>
      <p class="price-note">About ${money(Math.round((portfolio.price.month / 5) * 100) / 100)} per property. Properties 6–10 add a second block.</p>
      <ul>
        <li>Pro on every property in the block</li>
        <li>One subscription for your whole portfolio</li>
        <li>Monthly billing</li>
      </ul>
      <a class="btn btn-secondary" href="/signup?plan=portfolio">Start with Portfolio</a>
    </article>`;

  const kit = (k: typeof HARDWARE.desk, href: string) => `
    <article class="kit-card">
      <h3>${k.name}</h3>
      <p>${k.description}</p>
      <p class="kit-price"><strong>${money(k.bundleMonthly)}/mo</strong> with Pro included <span>or ${money(k.purchase)} to own</span></p>
      <a class="text-link" href="${href}">Get started &rarr;</a>
    </article>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'StayGuide',
    description: 'Digital guest guide and in-home tablet kiosk for short-term rentals.',
    brand: { '@type': 'Brand', name: 'StayGuide' },
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Pro (monthly, per property)', price: pro.price.month.toFixed(2), priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Pro (annual, per property)', price: pro.price.year!.toFixed(2), priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Portfolio (monthly, per 5 properties)', price: portfolio.price.month.toFixed(2), priceCurrency: 'USD' }
    ]
  };

  return `
    <section class="pricing" id="pricing" data-period="monthly" aria-labelledby="pricing-heading">
      <div class="section-head">
        <div class="eyebrow">Pricing</div>
        <h2 id="pricing-heading">Priced like a guidebook. Works like a concierge.</h2>
        <p>Start free with a phone guide link. Add the in-home tablet when you're ready. Cancel anytime.</p>
        <div class="billing-toggle" role="group" aria-label="Billing period">
          <button type="button" data-period="monthly" aria-pressed="true">Monthly</button>
          <button type="button" data-period="annual" aria-pressed="false">Annual <span>save ${savingPct}%</span></button>
        </div>
      </div>
      <div class="price-grid">${plans}</div>

      <div class="kits">
        <div class="kits-head">
          <h3>Tablet kits</h3>
          <p>Use your own Android tablet, or let us ship one that's set up and locked to your guide.</p>
        </div>
        ${kit(HARDWARE.desk, '/signup?plan=pro')}
        ${kit(HARDWARE.wall, '/signup?plan=pro')}
        <article class="kit-card">
          <h3>${SIGNATURE.name}</h3>
          <p>A flush, custom-installed living-room display with hidden wiring.</p>
          <p class="kit-price"><strong>from ${money(SIGNATURE.fromMonthly)}/mo</strong> managed <span>or an installed quote</span></p>
          <a class="text-link" href="/signup?plan=pro">Start with Pro, then ask for a quote &rarr;</a>
        </article>
      </div>

      <p class="fine-print">Prices in USD, billed per active property. Pay by card, US bank account (ACH) or bank transfer. Adding a property is prorated; removing one stops its billing at the end of the cycle. No setup fees.</p>
    </section>

    <section class="faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Questions</h2>
      <details><summary>Do I need a tablet?</summary><p>No. Every plan includes a phone and web guide link you can send in booking messages. Pro adds the in-home tablet kiosk, on your own Android tablet or one of our kits.</p></details>
      <details><summary>What if the rental's Wi-Fi goes down?</summary><p>Paired tablets keep a saved copy of the guide, including Wi-Fi details and house info, and show it offline until the connection returns.</p></details>
      <details><summary>Can I change or cancel my plan?</summary><p>Yes, anytime from your billing page. Cancelling keeps Pro until the end of the paid period, then your account moves to Free.</p></details>
      <details><summary>How do I pay?</summary><p>By card, US bank account (ACH), or bank-transfer invoice for annual plans and hardware. Invoices are always available to account owners.</p></details>
    </section>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

let cached: string | null = null;

/** landing.html with the <!-- PRICING --> placeholder filled in. Cached in production. */
export function renderLanding(viewsDir: string): string {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  const html = fs.readFileSync(path.join(viewsDir, 'landing.html'), 'utf8').replace('<!-- PRICING -->', renderPricingSection());
  cached = html;
  return html;
}
