// 2026-10-04 00:51, G6 /tablet/diagnostics: runs on-device checks and produces a pass/warn/fail report
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const browser = await H.launch();
  const errors = [];
  // Tab A11+-like: 1280x800 CSS at 1.5x = 1920x1200, Android Chrome UA
  const modernUa = 'Mozilla/5.0 (Linux; Android 16; SM-X230) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: modernUa, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(B + '/tablet/diagnostics');
  await page.waitForFunction(() => window.__diagnostics, null, { timeout: 30000 });
  const d = await page.evaluate(() => window.__diagnostics);
  const get = name => d.results.find(r => r.name === name) || {};
  check('all groups reported', ['Browser', 'Screen', 'Features', 'Device', 'Smoothness'].every(g => d.results.some(r => r.group === g)));
  check('Chrome 140 / Android 16 pass', get('Chrome / WebView version').status === 'pass' && get('Android version').status === 'pass');
  check('1920×1200 resolution pass', get('Physical resolution').status === 'pass', get('Physical resolution').detail);
  check('service worker + cache + storage pass', ['Offline mode (Service Worker)', 'Cache storage', 'Local storage (pairing token)'].every(n => get(n).status === 'pass'));
  check('WebP + modern CSS pass', get('WebP images (gradient backgrounds)').status === 'pass' && get('Modern CSS (aspect-ratio, inset, :focus-visible)').status === 'pass');
  check('fps measured for both transitions', /\d+ fps/.test(get('Sheet transition').detail) && /\d+ fps/.test(get('Sheet transition with blur').detail), get('Sheet transition with blur').detail);
  check('verdict shown', ['pass', 'warn'].includes(d.verdict) && (await page.textContent('#verdict-title')).length > 5, d.verdict);
  check('plain-text report', d.report.includes('StayGuide tablet diagnostics') && d.report.split('\n').length > 15);
  await page.click('#copy');
  await sleep(300);
  check('copy report → clipboard', (await page.evaluate(() => navigator.clipboard.readText())).startsWith('StayGuide tablet diagnostics'));
  await page.screenshot({ path: H.OUT + '/g6-diagnostics.png', fullPage: true });

  // Old WebView: must fail
  const old = await browser.newContext({ viewport: { width: 1024, height: 600 }, userAgent: 'Mozilla/5.0 (Linux; Android 9; AIO-RK) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Safari/537.36' });
  const op = await old.newPage();
  await op.goto(B + '/tablet/diagnostics');
  await op.waitForFunction(() => window.__diagnostics, null, { timeout: 30000 });
  const od = await op.evaluate(() => window.__diagnostics);
  check('Chrome 90 / Android 9 / 1024×600 → not suitable', od.verdict === 'fail' && od.results.find(r => r.name === 'Chrome / WebView version').status === 'fail' && od.results.find(r => r.name === 'Physical resolution').status === 'fail');
  check('no JS errors', errors.length === 0, errors.join(' | '));

  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} diagnostics checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
