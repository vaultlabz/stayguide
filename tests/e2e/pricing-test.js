// 2026-10-04 00:12, G5 marketing page pricing (server-rendered from src/config/plans.ts)
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  // Server HTML (no JS)
  const html = await (await fetch(B + '/')).text();
  check('pricing rendered server-side', html.includes('id="pricing"') && !html.includes('<!-- PRICING -->'));
  check('locked prices in HTML', ['$9.99', '$89', '$32', '$399', '$699', '$39/mo', '$49/mo', 'from $99/mo'].every(p => html.includes(p)));
  check('no stale claims (connection fees / helpdesk)', !/connection fee/i.test(html) && !/helpdesk/i.test(html));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  check('JSON-LD offers match plans', ld.offers.map(o => o.price).join(',') === '0,9.99,89.00,32.00', ld.offers.map(o => o.price).join(','));
  check('meta description present', /<meta name="description" content="[^"]{60,}/.test(html));

  const browser = await H.launch();
  const errors = [];
  for (const [w, h, scheme] of [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 844, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(B + '/');
    const tag = `${w}-${scheme}`;
    if (w === 1280 && scheme === 'light') {
      check('monthly shown by default', await page.isVisible('.price-card.featured .price[data-monthly]') && !(await page.isVisible('.price-card.featured .price[data-annual]')));
      await page.click('.billing-toggle button[data-period="annual"]');
      check('annual toggle shows $89 / year', (await page.textContent('.price-card.featured .price[data-annual]')) === '$89' && await page.isVisible('.price-card.featured .price[data-annual]'));
      check('toggle aria-pressed updated', (await page.getAttribute('.billing-toggle button[data-period="annual"]', 'aria-pressed')) === 'true');
      await page.click('.billing-toggle button[data-period="monthly"]');
      const hrefs = await page.$$eval('.price-card a', as => as.map(a => a.getAttribute('href')));
      check('plan CTAs go to signup with plan', hrefs.join(',') === '/signup,/signup?plan=pro,/signup?plan=portfolio', hrefs.join(','));
      check('hero + nav Start free → /signup', (await page.getAttribute('.hero .btn-primary', 'href')) === '/signup' && (await page.getAttribute('header .btn-primary', 'href')) === '/signup');
      await page.click('.faq summary >> nth=1');
      check('FAQ expands', await page.isVisible('.faq details:nth-of-type(2) p'));
      await Promise.all([page.waitForURL(/\/signup\?plan=pro/), page.click('.price-card.featured .btn')]);
      check('Pro CTA opens signup with plan note', (await page.textContent('#plan-note')).includes('Pro'));
      await page.goto(B + '/#pricing');
    }
    check(`no horizontal scroll (${tag})`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator('#pricing').screenshot({ path: H.OUT + `/g5-pricing-${tag}.png` });
    await ctx.close();
  }
  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} pricing checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
