const H = require('./helpers');
const { chromium } = H;
const { spawn, execSync } = require('child_process');
const ROOT = H.ROOT, B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };
const ymd = d => d.toLocaleDateString('en-CA');
(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', APP_BASE_URL: '' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const J = { 'content-type': 'application/json' };
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const A = { ...J, Authorization: 'Bearer ' + login.token };

  // API validation
  let r = await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ direct_booking_url: 'javascript:alert(1)' }) });
  check('javascript: booking URL rejected (400)', r.status === 400);
  r = await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ guest_checkout_date: 'tomorrow' }) });
  check('bad checkout date rejected (400)', r.status === 400);
  await fetch(B + '/company/demo-rentals/properties/mountain-cabin', { method: 'PUT', headers: A, body: JSON.stringify({ direct_booking_url: 'https://demorentals.example/stay/mountain-cabin' }) });

  const browser = await H.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];

  // Dashboard UI: fill the new fields and save
  const dash = await ctx.newPage();
  dash.on('pageerror', e => errors.push('dash: ' + e.message));
  await dash.goto(B + '/company/demo-rentals/login');
  await dash.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
  await dash.goto(B + '/company/demo-rentals/dashboard');
  await sleep(1500);
  await dash.evaluate(() => editProperty('seaside-villa'));
  await dash.waitForSelector('#propertyPanel.open', { timeout: 10000 });
  await sleep(800);
  await dash.fill('#direct-booking-url', 'https://demorentals.example/stay/seaside-villa?ref=site');
  await dash.fill('#return-guest-offer', '10% off with code WELCOMEBACK10 <b>');
  await dash.fill('#review-url', 'https://g.page/r/demo/review');
  await dash.fill('#guest-checkout-date', ymd(new Date()));
  await dash.click('#property-submit-btn');
  await dash.waitForSelector('#panel-success', { state: 'visible', timeout: 10000 });
  check('dashboard saved link fields', true);
  const saved = (await (await fetch(B + '/company/demo-rentals/properties/seaside-villa', { headers: A })).json()).property;
  check('fields persisted', saved.direct_booking_url.includes('seaside-villa') && saved.review_url && saved.guest_checkout_date === ymd(new Date()), JSON.stringify({ d: saved.guest_checkout_date }));

  // Tablet
  const pc = await (await fetch(B + '/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
  const tab = await ctx.newPage();
  tab.on('pageerror', e => errors.push('tablet: ' + e.message));
  await tab.goto(B + '/tablet');
  await tab.fill('#pairing-code', pc.code);
  await tab.click('#pairingForm button[type=submit]');
  await tab.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  const links = await tab.textContent('#guest-links-section');
  check('book-direct card shown', links.includes('Book your next stay direct'));
  check('offer shown escaped', links.includes('WELCOMEBACK10 <b>'));
  check('review card shown on checkout day', links.includes('Thanks for staying'));
  check('showcase lists Mountain Cabin', links.includes('Mountain Cabin'));
  check('QR codes rendered as SVG', (await tab.locator('#guest-links-section .qr-box svg').count()) === 3, String(await tab.locator('#guest-links-section .qr-box svg').count()));
  await tab.screenshot({ path: H.OUT + '/7-guest-links.png', fullPage: false });

  const content = await (await fetch(B + '/company/demo-rentals/property/seaside-villa/api/content', { headers: A })).json();
  const gl = content.guest_links;
  check('scan URLs point at /r/', gl.book.scan_url === `${B}/r/1/book` && gl.review.scan_url === `${B}/r/1/review` && gl.showcase[0].scan_url === `${B}/r/1/showcase/2`, gl.book.scan_url);

  // Redirects
  const loc = async p => { const x = await fetch(B + p, { redirect: 'manual' }); return [x.status, x.headers.get('location')]; };
  let [st, l] = await loc('/r/1/book');
  const u = l ? new URL(l) : null;
  check('book → 302 to owner site with UTM + sg_click', st === 302 && u.pathname === '/stay/seaside-villa' && u.searchParams.get('ref') === 'site' && u.searchParams.get('utm_source') === 'stayguide' && u.searchParams.get('utm_medium') === 'qr' && u.searchParams.get('utm_campaign') === 'return_guest' && u.searchParams.get('utm_content') === 'seaside-villa' && /^[0-9a-f]{16}$/.test(u.searchParams.get('sg_click')), l);
  [st, l] = await loc('/r/1/review');
  check('review → 302 without sg_click', st === 302 && l.startsWith('https://g.page/r/demo/review') && !l.includes('sg_click'), l);
  [st, l] = await loc('/r/1/showcase/2');
  check('showcase → other property booking URL', st === 302 && l.startsWith('https://demorentals.example/stay/mountain-cabin'), l);
  check('showcase to unknown property → 404', (await loc('/r/1/showcase/999'))[0] === 404);
  check('review on property without review URL → 404', (await loc('/r/2/review'))[0] === 404);
  check('non-numeric property → 404', (await loc('/r/abc/book'))[0] === 404);

  const stats = (await (await fetch(B + '/company/demo-rentals/properties/seaside-villa/link-stats', { headers: A })).json()).stats;
  check('stats count scans', stats.book === 1 && stats.review === 1 && stats.showcase === 1, JSON.stringify(stats));
  check('other company cannot read stats (403)', (await fetch(B + '/company/ocean-view/properties/seaside-villa/link-stats', { headers: A })).status === 403);

  // Dashboard shows stats + reloads saved values
  await dash.evaluate(() => editProperty('seaside-villa'));
  await sleep(1500);
  check('dashboard shows scan counts', (await dash.textContent('#link-stats')).includes('1 booking scans'), await dash.textContent('#link-stats'));
  check('dashboard reloads checkout date', (await dash.inputValue('#guest-checkout-date')) === ymd(new Date()));

  // Not checkout day -> no review prompt
  const tomorrow = new Date(Date.now() + 86400000);
  await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ guest_checkout_date: ymd(tomorrow) }) });
  await tab.evaluate(() => loadPropertyContent());
  await sleep(1500);
  check('no review prompt when not checkout day', !(await tab.textContent('#guest-links-section')).includes('Thanks for staying'));

  // Clearing the booking URL hides the card
  await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ direct_booking_url: '' }) });
  await tab.evaluate(() => loadPropertyContent());
  await sleep(1500);
  check('cleared booking URL hides card', !(await tab.textContent('#guest-links-section')).includes('Book your next stay'));
  check('book link 404 after clearing', (await loc('/r/1/book'))[0] === 404);

  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0); // 2026-10-03 22:42, fail the run on any FAIL
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
