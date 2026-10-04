// 2026-10-03 22:25, G1 content management: dashboard editor → API → tablet
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const J = { 'content-type': 'application/json' };
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const A = { ...J, Authorization: 'Bearer ' + login.token };
  const P = B + '/company/demo-rentals/properties/seaside-villa';
  const api = (path, opts = {}) => fetch(P + path, { headers: A, ...opts });

  // ---- API rules
  check('unknown content type → 404', (await api('/content/bogus', { method: 'POST', body: '{}' })).status === 404);
  check('other company → 403', (await fetch(B + '/company/ocean-view/properties/seaside-villa/content', { headers: A })).status === 403);
  check('missing required → 400', (await api('/content/restaurants', { method: 'POST', body: '{}' })).status === 400);
  check('bad enum → 400', (await api('/content/local-info', { method: 'POST', body: JSON.stringify({ title: 'x', category: 'casino' }) })).status === 400);
  check('javascript: URL → 400', (await api('/content/restaurants', { method: 'POST', body: JSON.stringify({ name: 'x', google_maps_url: 'javascript:alert(1)' }) })).status === 400);
  check('unplayable video URL → 400', (await api('/content/videos', { method: 'POST', body: JSON.stringify({ title: 'x', video_url: 'https://example.com/v.mp4' }) })).status === 400);
  check('schedule end before start → 400', (await api('/content/announcements', { method: 'POST', body: JSON.stringify({ title: 'a', message: 'b', scheduled_start: '2030-01-02T00:00:00Z', scheduled_end: '2030-01-01T00:00:00Z' }) })).status === 400);
  check('cross-property edit → 404', (await fetch(B + '/company/demo-rentals/properties/mountain-cabin/content/restaurants/1', { method: 'PUT', headers: A, body: JSON.stringify({ name: 'hacked' }) })).status === 404);
  check('reorder must list all ids → 400', (await api('/content/restaurants/order', { method: 'PUT', body: JSON.stringify({ ids: [1] }) })).status === 400);
  check('no token → 401', (await fetch(P + '/content')).status === 401);

  const browser = await H.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const dash = await ctx.newPage();
  dash.on('pageerror', e => errors.push('dash: ' + e.message));
  dash.on('dialog', d => d.accept());
  await dash.goto(B + '/company/demo-rentals/login');
  await dash.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
  await dash.goto(B + '/company/demo-rentals/dashboard');
  await sleep(1200);
  await dash.evaluate(() => editProperty('seaside-villa'));
  await dash.waitForSelector('#guide-content-section', { state: 'visible', timeout: 10000 });
  await dash.waitForSelector('#welcome-message');
  check('guide content section visible when editing', true);

  // Welcome
  await dash.fill('#welcome-message', 'Hello from the content editor');
  await dash.click('text=Save welcome message');
  await dash.waitForSelector('#content-error:not([hidden])');
  check('welcome saved', (await dash.textContent('#content-error')).includes('Saved'));

  // Restaurants: add via form
  await dash.click('.content-tab[data-tab="restaurants"]');
  await dash.click('#content-add-btn');
  await dash.fill('#content-field-name', 'Taco Shack');
  await dash.fill('#content-field-description', 'Fish tacos on the boardwalk');
  await dash.selectOption('#content-field-category', 'lunch');
  await dash.fill('#content-field-distance', '0.3 miles');
  // Enter inside a content input must not submit the property form
  await dash.press('#content-field-distance', 'Enter');
  await sleep(500);
  check('Enter in content field does not submit property', !(await dash.isVisible('#panel-success')));
  await dash.click('.content-form-actions .btn-primary');
  await dash.waitForSelector('.content-item-title:has-text("Taco Shack")');
  const titles = async () => dash.$$eval('#content-panel .content-item-title', els => els.map(e => e.childNodes[0].textContent.trim()));
  check('restaurant added at end', (await titles()).slice(-1)[0] === 'Taco Shack', (await titles()).join(','));

  // Validation error surfaces in the form
  await dash.click('#content-add-btn');
  await dash.fill('#content-field-name', 'Bad link');
  await dash.fill('#content-field-google_maps_url', 'ftp://nope');
  await dash.click('.content-form-actions .btn-primary');
  await dash.waitForSelector('#content-error:not([hidden])');
  check('server validation shown in form', (await dash.textContent('#content-error')).includes('google_maps_url'));
  await dash.click('.content-form-actions .btn-secondary');

  // Move Taco Shack to the top
  for (let i = 0; i < 5; i++) {
    const t = await titles(); const idx = t.indexOf('Taco Shack'); if (idx <= 0) break;
    await dash.locator('.content-item').nth(idx).locator('button[aria-label="Move up"]').click();
    await dash.waitForFunction(n => [...document.querySelectorAll('#content-panel .content-item-title')].findIndex(e => e.childNodes[0].textContent.trim() === 'Taco Shack') === n - 1, idx);
  }
  check('reordered to first', (await titles())[0] === 'Taco Shack', (await titles()).join(','));

  // Edit: hide Coastal Bistro
  const bistroIdx = (await titles()).indexOf('Coastal Bistro');
  await dash.locator('.content-item').nth(bistroIdx).locator('text=Edit').click();
  await dash.selectOption('#content-field-status', 'inactive');
  await dash.click('.content-form-actions .btn-primary');
  await dash.waitForSelector('.content-item:has-text("Coastal Bistro") .content-pill:has-text("inactive")');
  check('edited status shown', true);

  // Local info: delete Beach City Pier, add pharmacy
  await dash.click('.content-tab[data-tab="local-info"]');
  await dash.locator('.content-item:has-text("Beach City Pier")').locator('text=Delete').click();
  await dash.waitForSelector('.content-item:has-text("Beach City Pier")', { state: 'detached' });
  await dash.click('#content-add-btn');
  await dash.fill('#content-field-title', 'Seaside Pharmacy');
  await dash.selectOption('#content-field-category', 'pharmacy');
  await dash.fill('#content-field-phone', '(555) 222-1111');
  await dash.click('.content-form-actions .btn-primary');
  await dash.waitForSelector('.content-item-title:has-text("Seaside Pharmacy")');
  check('local info delete + add', true);

  // Videos: add YouTube
  await dash.click('.content-tab[data-tab="videos"]');
  await dash.click('#content-add-btn');
  await dash.fill('#content-field-title', 'Hot tub controls');
  await dash.fill('#content-field-video_url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await dash.click('.content-form-actions .btn-primary');
  await dash.waitForSelector('.content-item-title:has-text("Hot tub controls")');
  check('video added', true);

  // Announcements: one live, one scheduled in the future
  await dash.click('.content-tab[data-tab="announcements"]');
  for (const [title, start] of [['Fireworks tonight', ''], ['Future notice', '2030-06-01T10:00']]) {
    await dash.click('#content-add-btn');
    await dash.fill('#content-field-title', title);
    await dash.fill('#content-field-message', title + ' message');
    if (start) await dash.fill('#content-field-scheduled_start', start);
    await dash.click('.content-form-actions .btn-primary');
    await dash.waitForSelector(`.content-item-title:has-text("${title}")`);
  }
  check('announcements added', true);
  check('future announcement labelled scheduled', (await dash.textContent('.content-item:has-text("Future notice") .content-pill')).trim() === 'scheduled');
  check('current announcement labelled live', (await dash.textContent('.content-item:has-text("Fireworks tonight") .content-pill')).trim() === 'live');
  await dash.screenshot({ path: H.OUT + '/g1-dashboard-content.png' });

  // ---- Tablet reflects it
  const pc = await (await api('/devices/pairing-code', { method: 'POST', body: '{}' })).json();
  const tab = await ctx.newPage();
  tab.on('pageerror', e => errors.push('tablet: ' + e.message));
  await tab.goto(B + '/tablet');
  await tab.fill('#pairing-code', pc.code);
  await tab.click('#pairingForm button[type=submit]');
  await tab.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  await sleep(800);
  const data = await tab.evaluate(() => loadedContent);
  check('tablet restaurants: new first, hidden excluded', data.restaurants.map(r => r.name).join(',') === 'Taco Shack,Ocean Breeze Café', data.restaurants.map(r => r.name).join(','));
  check('tablet local info updated', data.local_info.map(r => r.title).join(',') === 'Seaside Pharmacy');
  check('tablet videos include new one', data.videos.some(v => v.title === 'Hot tub controls'));
  check('tablet announcements: live shown, future hidden', data.announcements.some(a => a.title === 'Fireworks tonight') && !data.announcements.some(a => a.title === 'Future notice'));
  check('tablet welcome message', data.content.welcome_message === 'Hello from the content editor');
  check('welcome visible on home', (await tab.textContent('#welcome-section')).includes('Hello from the content editor'));
  await tab.click('.tile[data-sheet="guide"]');
  await sleep(600);
  const guide = await tab.textContent('#recommendations-section');
  check('Local Guide sheet shows new content', guide.includes('Taco Shack') && guide.includes('Seaside Pharmacy') && !guide.includes('Coastal Bistro'));
  await tab.screenshot({ path: H.OUT + '/g1-tablet-guide.png' });

  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} content checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
