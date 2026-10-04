const H = require('./helpers');
const { chromium } = H;
const { spawn, execSync } = require('child_process');
const ROOT = H.ROOT, B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };
(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const J = { 'content-type': 'application/json' };
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const A = { ...J, Authorization: 'Bearer ' + login.token };
  const XSS = '<img src=x onerror="window.__xss=1">Quiet after 10pm';
  await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ house_rules: XSS }) });
  const badImg = await fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify({ main_image_url: 'javascript:window.__xss=2' }) });
  check('server rejects javascript: image URL (400)', badImg.status === 400);
  await fetch(B + '/company/demo-rentals/properties/seaside-villa/amenities/1', { method: 'PUT', headers: A, body: JSON.stringify({ description: '<script>window.__xss=3</script><b>bold?</b>' }) });
  const pc = await (await fetch(B + '/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();

  const browser = await H.launch();
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
  const errors = [], cspViolations = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/Content Security Policy|Refused to frame/i.test(m.text())) cspViolations.push(m.text()); });

  await page.goto(B + '/tablet');
  await page.fill('#pairing-code', pc.code);
  await page.click('#pairingForm button[type=submit]');
  await page.waitForSelector('#content', { state: 'visible', timeout: 10000 });
  await sleep(1000);

  check('XSS payloads did not execute', await page.evaluate(() => window.__xss === undefined));
  check('house rules shown as literal text', (await page.textContent('#property-info')).includes('<img src=x'));
  check('amenity HTML shown as text', (await page.textContent('#amenities-section')).includes('<b>bold?</b>'));
  // Client-side defense in depth: render content containing a javascript: image URL
  await page.evaluate(() => { const d = JSON.parse(JSON.stringify(loadedContent)); d.property.main_image_url = 'javascript:window.__xss=2'; displayPropertyContent(d); });
  check('javascript: main image URL dropped by page', (await page.locator('#main-image img').count()) === 0 && (await page.evaluate(() => window.__xss === undefined)));
  await page.evaluate(() => displayPropertyContent(loadedContent));
  const recs = await page.textContent('#recommendations-section');
  check('restaurant names shown (no "undefined")', recs.includes('Coastal Bistro') && !recs.includes('undefined'));
  check('local attractions shown alongside restaurants', recs.includes('Beach City Pier'));
  const ann = await page.textContent('#announcements-section');
  check('announcement shown', ann.includes('Weekly Pool Cleaning') && (await page.locator('.announcement-info').count()) === 1);

  const embeds = await page.evaluate(() => [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://vimeo.com/76979871', '/uploads/videos/howto.mp4', 'https://example.com/x', 'javascript:alert(1)'
  ].map(u => { const r = getVideoEmbed(u); return r ? r.src : null; }));
  check('youtube watch → nocookie embed', embeds[0] === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1');
  check('youtu.be + shorts parsed', embeds[1] && embeds[2] && embeds[1] === embeds[2]);
  check('vimeo → player embed', embeds[3] === 'https://player.vimeo.com/video/76979871?autoplay=1');
  check('uploaded mp4 → <video>', embeds[4] === '/uploads/videos/howto.mp4');
  check('unknown + javascript: URLs rejected', embeds[5] === null && embeds[6] === null);

  // Mock video has a fake id ("demo1") -> friendly message, no navigation
  await page.click('.tile[data-sheet="videos"]'); // home is icon-only: open the sheet first
  await page.click('#videos-section .video-link');
  await page.waitForSelector('#videoModal', { state: 'visible' });
  check('invalid video shows message in modal', (await page.textContent('#video-player')).includes("can’t be played"));
  check('still on /tablet', new URL(page.url()).pathname === '/tablet');
  await page.click('#videoModal .close');

  // Real YouTube URL: iframe created and allowed by CSP
  await page.evaluate(() => { loadedContent.videos[0].video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; openVideoModal(0); });
  await sleep(2500);
  check('youtube iframe rendered in modal', await page.locator('#video-player iframe[src*="youtube-nocookie.com/embed/"]').count() === 1);
  check('no CSP violations for the embed', cspViolations.length === 0, cspViolations.join(' | '));
  await page.screenshot({ path: H.OUT + '/5-video-modal.png' });
  await page.click('#videoModal .close');
  check('closing modal removes player (stops playback)', (await page.locator('#video-player iframe').count()) === 0);

  await page.click('#sheet-videos .sheet-close');
  // Report form: no guest identity fields, submit works
  await page.click('.report-card .report-button');
  check('no name/room/phone fields', (await page.locator('#guest_name, #guest_room, #guest_phone').count()) === 0);
  await page.selectOption('#category', 'amenities');
  await page.selectOption('#amenity_id', { index: 1 });
  await page.fill('#title', 'Hot tub cold');
  await page.fill('#description', 'Not heating');
  await page.click('#reportForm button[type=submit]');
  await page.waitForSelector('#reportSuccess', { state: 'visible', timeout: 10000 });
  check('amenity report submitted', true);
  await page.screenshot({ path: H.OUT + '/6-report-ok.png' });

  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0); // 2026-10-03 22:42, fail the run on any FAIL
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
