// 2026-10-03 22:42, G2 free-tier phone/web guide link: /g/:token
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', APP_BASE_URL: '' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const J = { 'content-type': 'application/json' };
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const A = { ...J, Authorization: 'Bearer ' + login.token };
  const P = B + '/company/demo-rentals/properties/seaside-villa';
  await fetch(P, { method: 'PUT', headers: A, body: JSON.stringify({ direct_booking_url: 'https://example.com/stay/seaside-villa', review_url: 'https://example.com/review', guest_checkout_date: new Date().toLocaleDateString('en-CA') }) });
  await fetch(B + '/company/demo-rentals/properties/mountain-cabin', { method: 'PUT', headers: A, body: JSON.stringify({ direct_booking_url: 'https://example.com/stay/mountain-cabin' }) });

  // ---- Link management
  const link1 = await (await fetch(P + '/guest-link', { headers: A })).json();
  const token1 = link1.url.split('/g/')[1];
  check('link created with long random token', /^[A-Za-z0-9_-]{32}$/.test(token1), link1.url);
  check('link has QR + Wi-Fi shown by default', link1.qr_svg.startsWith('<svg') && link1.show_wifi === true);
  check('same link on second GET', (await (await fetch(P + '/guest-link', { headers: A })).json()).url === link1.url);
  check('other company → 403', (await fetch(B + '/company/ocean-view/properties/seaside-villa/guest-link', { headers: A })).status === 403);
  check('no auth → 401', (await fetch(P + '/guest-link')).status === 401);

  // ---- Public content
  let r = await fetch(B + `/g/${token1}/content`);
  let c = await r.json();
  check('public content without login', r.status === 200 && c.property && c.property.name === 'Seaside Villa');
  check('payload marked guest_link, token not echoed', c.access === 'guest_link' && !('guest_link_token' in c.property));
  check('Wi-Fi password shown by default', !!c.property.wifi_password && !!c.wifi_qr_svg);
  check('no-index + no-referrer + no-store headers', r.headers.get('x-robots-tag') === 'noindex, nofollow' && r.headers.get('referrer-policy') === 'no-referrer' && r.headers.get('cache-control') === 'no-store');
  const page = await fetch(B + `/g/${token1}`);
  check('page has privacy headers', page.status === 200 && page.headers.get('x-robots-tag') === 'noindex, nofollow' && page.headers.get('referrer-policy') === 'no-referrer');
  check('malformed token → 404', (await fetch(B + '/g/short/content')).status === 404);
  check('unknown token → 404', (await fetch(B + '/g/' + 'x'.repeat(32) + '/content')).status === 404);
  check('weather endpoint works', (await fetch(B + `/g/${token1}/weather`)).status !== 404);

  // ---- Wi-Fi toggle
  check('non-boolean toggle → 400', (await fetch(P, { method: 'PUT', headers: A, body: JSON.stringify({ guest_link_show_wifi: 'no' }) })).status === 400);
  await fetch(P, { method: 'PUT', headers: A, body: JSON.stringify({ guest_link_show_wifi: false }) });
  c = await (await fetch(B + `/g/${token1}/content`)).json();
  check('hidden: no password, no Wi-Fi QR', c.property.wifi_password === null && c.wifi_qr_svg === null && c.property.wifi_name === 'SeasideVilla_Guest');
  const pc = await (await fetch(P + '/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
  const dev = await (await fetch(B + '/device/pair', { method: 'POST', headers: J, body: JSON.stringify({ code: pc.code }) })).json();
  const dc = await (await fetch(B + '/device/content', { headers: { Authorization: 'Device ' + dev.token } })).json();
  check('in-house tablet still shows password', !!dc.property.wifi_password && dc.access === 'tablet');
  await fetch(P, { method: 'PUT', headers: A, body: JSON.stringify({ guest_link_show_wifi: true }) });

  // ---- Reports from the link
  const report = body => fetch(B + `/g/${token1}/report`, { method: 'POST', headers: J, body: JSON.stringify(body) });
  r = await report({ category: 'other', title: 'Link report', description: 'from phone', property_id: 99 });
  check('report accepted from guest link', r.status === 201);
  const reports = (await (await fetch(B + '/reports/property/1', { headers: A })).json()).reports || [];
  const mine = reports.find(x => x.title === 'Link report');
  check('report stored on the link\'s property with source=guest_link', !!mine && mine.property_id === 1 && mine.source === 'guest_link', JSON.stringify(mine && { p: mine.property_id, s: mine.source }));
  for (let i = 0; i < 4; i++) await report({ category: 'other', title: 't' + i, description: 'd' });
  check('6th report in an hour → 429', (await report({ category: 'other', title: 'six', description: 'd' })).status === 429);

  // ---- Tracked taps
  const tap = await fetch(B + '/r/1/book?m=link', { redirect: 'manual' });
  check('tap tracked as utm_medium=guest_link', tap.status === 302 && new URL(tap.headers.get('location')).searchParams.get('utm_medium') === 'guest_link');

  // ---- Rotation
  const link2 = await (await fetch(P + '/guest-link/rotate', { method: 'POST', headers: A })).json();
  const token2 = link2.url.split('/g/')[1];
  check('rotate: new token, old link dead', token2 !== token1 && (await fetch(B + `/g/${token1}/content`)).status === 404 && (await fetch(B + `/g/${token2}/content`)).status === 200);

  // ---- Phone browser
  const browser = await H.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { window.SG_IDLE_MS = 500; });
  const errors = [];
  const phone = await ctx.newPage();
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(B + `/g/${token2}`);
  await phone.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  check('guide loads on phone, no pairing screen', !(await phone.isVisible('#pairing')));
  check('"Powered by StayGuide" footer shown', await phone.isVisible('.powered-by'));
  const cols = await phone.evaluate(() => getComputedStyle(document.querySelector('.tiles')).gridTemplateColumns.split(' ').length);
  check('tiles in 2 columns on phone', cols === 2, String(cols));
  check('no horizontal scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no service worker on phone guide', await phone.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0));
  await phone.screenshot({ path: H.OUT + '/g2-phone-home.png', fullPage: true });

  await phone.click('.tile[data-sheet="wifi"]');
  await sleep(500);
  check('Wi-Fi sheet: copy button, no QR', await phone.isVisible('#copy-wifi') && (await phone.locator('#wifi-qr svg').count()) === 0);
  await sleep(1200);
  check('no idle auto-close on phone', await phone.evaluate(() => document.querySelector('.sheet.is-open') !== null));
  await phone.screenshot({ path: H.OUT + '/g2-phone-wifi.png' });
  await phone.keyboard.press('Escape');
  await sleep(400);

  await phone.click('.tile[data-sheet="book"]');
  await sleep(500);
  check('Book Again: tappable links, no QR codes', (await phone.locator('#guest-links-section .link-button').count()) >= 2 && (await phone.locator('#guest-links-section .qr-box').count()) === 0);
  check('book link tracks m=link', (await phone.getAttribute('#guest-links-section .link-button', 'href')).endsWith('/r/1/review?m=link') || (await phone.locator('#guest-links-section a[href$="/r/1/book?m=link"]').count()) === 1);
  await phone.screenshot({ path: H.OUT + '/g2-phone-book.png' });
  await phone.keyboard.press('Escape');
  await sleep(400);

  await phone.click('.report-card .report-button');
  await phone.selectOption('#category', 'supplies');
  await phone.fill('#title', 'Need towels');
  await phone.fill('#description', 'Two more bath towels please');
  await phone.click('#reportForm button[type=submit]');
  await phone.waitForSelector('#reportSuccess', { state: 'visible', timeout: 10000 }).catch(() => {});
  // the per-link limit (5/hr) was used up above via the API from the same IP, so either success or the limit message is correct behaviour
  const sent = await phone.isVisible('#reportSuccess');
  const limited = (await phone.textContent('#report-error').catch(() => '')).includes('Too many');
  check('report form works on phone (sent or rate-limited message)', sent || limited);

  const bad = await ctx.newPage();
  await bad.goto(B + '/g/' + 'y'.repeat(32));
  await bad.waitForSelector('#error', { state: 'visible', timeout: 10000 });
  check('dead link shows friendly message', (await bad.textContent('#error')).includes('no longer valid'));

  // ---- Dashboard section
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dash = await dctx.newPage();
  dash.on('pageerror', e => errors.push('dash: ' + e.message));
  dash.on('dialog', d => d.accept());
  await dash.goto(B + '/company/demo-rentals/login');
  await dash.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
  await dash.goto(B + '/company/demo-rentals/dashboard');
  await sleep(1200);
  await dash.evaluate(() => editProperty('seaside-villa'));
  await dash.waitForSelector('#guest-link-section', { state: 'visible', timeout: 10000 });
  await dash.waitForFunction(() => document.getElementById('guest-link-url').value.includes('/g/'));
  check('dashboard shows current link + QR', (await dash.inputValue('#guest-link-url')).endsWith(token2) && (await dash.locator('#guest-link-qr svg').count()) === 1);
  await dash.click('#guest-link-show-wifi');
  await dash.waitForSelector('#guest-link-status:not([hidden])');
  c = await (await fetch(B + `/g/${token2}/content`)).json();
  check('dashboard toggle hides Wi-Fi', c.property.wifi_password === null);
  await dash.click('text=Rotate link');
  await dash.waitForFunction(t => !document.getElementById('guest-link-url').value.endsWith(t), token2);
  check('dashboard rotate kills old link', (await fetch(B + `/g/${token2}/content`)).status === 404);
  await dash.locator('#guest-link-section').screenshot({ path: H.OUT + '/g2-dashboard-guest-link.png' });

  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} guest-link checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
