// 2026-10-04 00:26, G4 section analytics: tablet + phone guide events → dashboard
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
  const summary = async () => (await fetch(P + '/analytics?days=30', { headers: A })).json();

  // ---- API
  const pc = await (await fetch(P + '/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
  const dev = await (await fetch(B + '/device/pair', { method: 'POST', headers: J, body: JSON.stringify({ code: pc.code }) })).json();
  const D = { ...J, Authorization: 'Device ' + dev.token };
  check('events need a device token', (await fetch(B + '/device/events', { method: 'POST', headers: J, body: '{"events":[]}' })).status === 401);
  let r = await fetch(B + '/device/events', { method: 'POST', headers: D, body: JSON.stringify({ events: [{ section: 'home', action: 'visit' }, { section: 'wifi', action: 'open' }, { section: 'hacker', action: 'drop' }, { section: 'wifi', action: 'delete' }, { foo: 1 }] }) });
  let body = await r.json();
  check('unknown sections/actions dropped', r.status === 202 && body.accepted === 2 && body.stored === 2, JSON.stringify(body));
  const big = Array.from({ length: 80 }, () => ({ section: 'guide', action: 'open' }));
  body = await (await fetch(B + '/device/events', { method: 'POST', headers: D, body: JSON.stringify({ events: big }) })).json();
  check('batch capped at 50', body.accepted === 50);
  const link = await (await fetch(P + '/guest-link', { headers: A })).json();
  const G = link.url.replace(/^https?:\/\/[^/]+/, B);
  body = await (await fetch(G + '/events', { method: 'POST', headers: J, body: JSON.stringify({ events: [{ section: 'home', action: 'visit' }, { section: 'book', action: 'tap' }] }) })).json();
  check('phone guide events accepted', body.stored === 2);
  let s = await summary();
  check('summary: visits split tablet/phone', s.visits.total === 2 && s.visits.tablet === 1 && s.visits.guest_link === 1, JSON.stringify(s.visits));
  const guide = s.sections.find(x => x.section === 'guide' && x.action === 'open');
  check('summary: sections sorted, counts correct', s.sections[0].section === 'guide' && guide.tablet === 50 && guide.total === 50);
  check('summary: 30 daily buckets, today has visits', s.daily.length === 30 && s.daily[29].visits === 2);
  check('other company → 403', (await fetch(B + '/company/ocean-view/properties/seaside-villa/analytics', { headers: A })).status === 403);
  const cs = await (await fetch(B + '/company/demo-rentals/analytics/summary', { headers: A })).json();
  check('company summary for stat card', cs.available === true && cs.visits.total === 2);

  // Free account: events dropped, summary 402, card shows "Pro"
  const su = await (await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'Free Host', first_name: 'F', last_name: 'H', email: 'free@host.test', password: 'free-host-1' }) })).json();
  const FA = { ...J, Authorization: 'Bearer ' + su.token };
  await fetch(B + `/company/${su.company.slug}/properties`, { method: 'POST', headers: FA, body: JSON.stringify({ name: 'Cabin', slug: 'cabin' }) });
  const fl = await (await fetch(B + `/company/${su.company.slug}/properties/cabin/guest-link`, { headers: FA })).json();
  body = await (await fetch(fl.url.replace(/^https?:\/\/[^/]+/, B) + '/events', { method: 'POST', headers: J, body: JSON.stringify({ events: [{ section: 'home', action: 'visit' }] }) })).json();
  check('Free: events acknowledged but not stored', body.accepted === 1 && body.stored === 0);
  check('Free: analytics → 402', (await fetch(B + `/company/${su.company.slug}/properties/cabin/analytics`, { headers: FA })).status === 402);

  // ---- Browser: the tablet sends real events
  const browser = await H.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', e => errors.push('tablet: ' + e.message));
  const pc2 = await (await fetch(P + '/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
  await tab.goto(B + '/tablet');
  await tab.fill('#pairing-code', pc2.code);
  await tab.click('#pairingForm button[type=submit]');
  await tab.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  await sleep(800);
  await tab.click('.tile[data-sheet="amenities"]'); await sleep(400);
  await tab.keyboard.press('Escape'); await sleep(400);
  await tab.click('.tile[data-sheet="wifi"]'); await sleep(400);
  await tab.keyboard.press('Escape'); await sleep(300);
  await tab.evaluate(() => flushEvents());
  await sleep(800);
  s = await summary();
  const opened = k => (s.sections.find(x => x.section === k && x.action === 'open') || {}).tablet || 0;
  check('tablet: tap started a visit', s.visits.tablet === 2, JSON.stringify(s.visits));
  check('tablet: sheet opens recorded', opened('amenities') === 1 && opened('wifi') === 2);

  // Phone guide in a browser
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  phone.on('pageerror', e => errors.push('phone: ' + e.message));
  await phone.goto(G);
  await phone.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  await phone.click('.tile[data-sheet="guide"]'); await sleep(300);
  await phone.evaluate(() => flushEvents()); await sleep(800);
  s = await summary();
  check('phone: visit + guide open recorded', s.visits.guest_link === 2 && (s.sections.find(x => x.section === 'guide').guest_link === 1));

  // Admin preview must not track
  const before = (await summary()).visits.total;
  const prev = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await prev.goto(B + '/company/demo-rentals/login');
  await prev.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
  await prev.goto(B + '/company/demo-rentals/property/seaside-villa');
  await prev.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  await prev.click('.tile[data-sheet="wifi"]'); await sleep(300);
  check('admin preview does not track', await prev.evaluate(() => typeof trackingEnabled !== 'undefined' && trackingEnabled === false) && (await summary()).visits.total === before);

  // ---- Dashboard
  const dash = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  dash.on('pageerror', e => errors.push('dash: ' + e.message));
  await dash.goto(B + '/company/demo-rentals/login');
  await dash.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
  await dash.goto(B + '/company/demo-rentals/dashboard');
  await dash.waitForFunction(() => /^\d+$/.test(document.getElementById('tablet-views').textContent), null, { timeout: 10000 });
  check('stat card shows visit count', Number(await dash.textContent('#tablet-views')) >= 4);
  await dash.evaluate(() => editProperty('seaside-villa'));
  await dash.waitForSelector('.activity-table', { timeout: 10000 });
  check('activity section: KPIs, chart, table', (await dash.locator('.activity-kpi').count()) === 3 && (await dash.locator('.activity-chart polyline').count()) === 1 && (await dash.textContent('.activity-table')).includes('Local guide opened'));
  await dash.locator('#activity-section').screenshot({ path: H.OUT + '/g4-activity.png' });
  const fd = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  fd.on('dialog', d => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await fd.goto(B + `/company/${su.company.slug}/login`);
  await fd.evaluate(t => localStorage.setItem('stayguide_token', t), su.token);
  await fd.goto(B + `/company/${su.company.slug}/dashboard`);
  await fd.waitForFunction(() => document.getElementById('tablet-views').textContent === 'Pro', null, { timeout: 10000 });
  await fd.evaluate(() => editProperty('cabin'));
  await fd.waitForSelector('#activity-body a[href$="/billing"]', { timeout: 10000 });
  check('Free: upgrade note, no dialog', true);

  check('no page JS errors / dialogs', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} analytics checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
