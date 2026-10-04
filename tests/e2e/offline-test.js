// Phase 2 offline verification: pair -> online content -> server down -> cached content + banner -> report error -> server back (mock reset) -> pairing screen
const H = require('./helpers');
const { chromium } = H;
const { spawn, execSync } = require('child_process');

const ROOT = H.ROOT;
const B = H.B;
const SHOTS = H.OUT;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const p = spawn('npx', ['ts-node', 'src/index.ts'], {
    cwd: ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true' }, stdio: 'ignore', detached: true
  });
  return p;
}
async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(B + '/api/health'); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('server did not start');
}
function stopServer(p) { try { process.kill(-p.pid); } catch {} try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} }

(async () => {
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

  let server = startServer(); await waitUp();
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  // Upload the fixture image (uploads/ is git-ignored, so tests bring their own)
  const fd = new FormData();
  fd.append('property_image', new Blob([require('fs').readFileSync(H.FIXTURES + '/property.jpg')], { type: 'image/jpeg' }), 'property.jpg');
  const up = await (await fetch(B + '/company/demo-rentals/upload/property-image', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token }, body: fd })).json();
  await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify({ main_image_url: up.imageUrl }) });
  const pc = await (await fetch(B + '/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token }, body: '{"name":"Test tablet"}' })).json();

  const browser = await H.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));

  await page.goto(B + '/tablet');
  check('pairing screen shown when unpaired', await page.isVisible('#pairing'));
  await page.fill('#pairing-code', pc.code);
  await page.click('#pairingForm button[type=submit]');
  await page.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  check('content after pairing', (await page.textContent('#property-name')).includes('Seaside'));

  // Make sure the service worker controls the page and has cached content
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  check('service worker controlling', await page.evaluate(() => !!navigator.serviceWorker.controller));
  check('no offline banner while online', !(await page.isVisible('#offline-banner')));
  const imgOk = sel => page.evaluate(s => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 0; }, sel);
  await page.waitForTimeout(1500);
  check('uploaded main image loads online', await imgOk('#main-image img'));
  check('external (unsplash) amenity image loads online', await page.evaluate(() => [...document.querySelectorAll('#amenities-section img')].some(i => i.complete && i.naturalWidth > 0)));
  await page.screenshot({ path: SHOTS + '/1-online.png' });

  // Cut the network to the server
  stopServer(server); await sleep(1000);
  await page.reload();
  await page.waitForSelector('#content', { state: 'visible', timeout: 15000 });
  check('content shown with server down', (await page.textContent('#property-name')).includes('Seaside'));
  check('offline banner visible', await page.isVisible('#offline-banner'), await page.textContent('#offline-banner'));
  check('wifi details still available offline', (await page.textContent('#wifi-info')).length > 20);
  check('single main image after reload', (await page.locator('#main-image img').count()) <= 1);
  await page.waitForTimeout(1000);
  check('uploaded main image loads offline (from cache)', await imgOk('#main-image img'));
  await page.screenshot({ path: SHOTS + '/2-offline.png' });

  // Report while offline
  await page.click('.report-card .report-button');
  await page.selectOption('#category', 'maintenance');
  await page.fill('#title', 'Leak');
  await page.fill('#description', 'Sink leaking');
  await page.click('#reportForm button[type=submit]');
  await page.waitForSelector('#report-error', { state: 'visible', timeout: 10000 });
  check('offline report message', /no internet/i.test(await page.textContent('#report-error')), await page.textContent('#report-error'));
  await page.screenshot({ path: SHOTS + '/3-offline-report.png' });
  await page.click('.btn-cancel');

  // Server back: mock data resets, so the token is unknown -> 401 -> pairing screen + cache cleared
  server = startServer(); await waitUp();
  await page.reload();
  await page.waitForSelector('#pairing', { state: 'visible', timeout: 15000 });
  check('unknown/revoked token returns to pairing', true);
  const cachedContent = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const k of keys) { if (await (await caches.open(k)).match('/device/content')) return true; }
    return false;
  });
  check('cached content deleted after 401', !cachedContent);
  await page.screenshot({ path: SHOTS + '/4-repair.png' });

  check('no page JS errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();
  stopServer(server);
  console.log(results.join('\n'));
  process.exit(results.some(l => l.startsWith('FAIL')) ? 1 : 0); // 2026-10-03 22:42, fail the run on any FAIL
})().catch(e => { console.error('TEST CRASHED:', e); try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} process.exit(1); });
