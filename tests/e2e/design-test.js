const H = require('./helpers');
const { chromium } = H;
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const GRADS = require(H.ROOT + '/public/js/tablet-backgrounds.js').TABLET_BACKGROUNDS;
const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const ROOT = H.ROOT, B = H.B;
const BG = H.FIXTURES + '/bg-test.jpg';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

// contrast scanner, runs in the page
const SCAN = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat([1]);
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { const chain = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) chain.push(c); if (c[3] === 1) break; } let base = [255, 255, 255, 1]; if (!chain.length || chain[chain.length - 1][3] < 1) base = rgba(getComputedStyle(document.documentElement).backgroundColor); if (base[3] === 0) base = rgba(getComputedStyle(document.body).backgroundColor); if (base[3] === 0) base = [255, 255, 255, 1]; let r = base; for (let i = chain.length - 1; i >= 0; i--) r = over(chain[i], r); return r; };
  const bad = []; let n = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[disabled],script,style,.sg-theme-toggle button:not([aria-pressed="true"])')) continue;
    if (el.closest('[style*="display: none"],[hidden],.modal[style*="none"]')) continue;
    const fg = rgba(cs.color); const bg = bgOf(el); const f = fg[3] < 1 ? over(fg, bg) : fg;
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const cr = ratio(f, bg); n++;
    if (cr < (large ? 3 : 4.5)) bad.push(`${el.tagName.toLowerCase()}.${(el.className + '').split(' ')[0]} "${t.textContent.trim().slice(0, 24)}" ${cr.toFixed(2)}`);
  }
  return { n, bad };
};

(async () => {
  const stubHits = [];
  const stub = require('http').createServer((req, res) => { stubHits.push(req.url); res.setHeader('content-type', 'application/json'); if (req.url.startsWith('/v1/forecast')) return res.end(JSON.stringify({ current: { temperature_2m: req.url.includes('celsius') ? 22.1 : 71.6, weather_code: 2 } })); if (req.url.startsWith('/v1/search')) return res.end(JSON.stringify({ results: [{ name: 'Beverly Hills', admin1: 'California', country_code: 'US', latitude: 34.0901, longitude: -118.4065 }] })); res.statusCode = 404; res.end('{}'); }).listen(3918);
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  kill();
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', OPEN_METEO_BASE_URL: 'http://localhost:3918', OPEN_METEO_GEOCODE_URL: 'http://localhost:3918' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const J = { 'content-type': 'application/json' };
  const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const alogin = await (await fetch(B + '/admin/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@stayguide.com', password: 'admin123' }) })).json();
  const A = { ...J, Authorization: 'Bearer ' + login.token };
  const put = body => fetch(B + '/company/demo-rentals/properties/seaside-villa', { method: 'PUT', headers: A, body: JSON.stringify(body) });

  // API validation of new fields
  check('bad tablet_theme rejected', (await put({ tablet_theme: 'neon' })).status === 400);
  check('bad tablet_background rejected', (await put({ tablet_background: 'neon' })).status === 400);
  check('javascript: background rejected', (await put({ background_image_url: 'javascript:alert(1)' })).status === 400);
  check('http: background rejected-or-https only path traversal rejected', (await put({ background_image_url: '/uploads/../.env' })).status === 400);
  check('relative non-upload path rejected', (await put({ background_image_url: '/etc/passwd' })).status === 400);
  const fd = new FormData(); fd.append('property_image', new Blob([fs.readFileSync(BG)], { type: 'image/jpeg' }), 'bg.jpg');
  const up = await (await fetch(B + '/company/demo-rentals/upload/property-image', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token }, body: fd })).json();
  const ok = await put({ tablet_theme: 'dark', background_image_url: up.imageUrl });
  const saved = (await (await fetch(B + '/company/demo-rentals/properties/seaside-villa', { headers: A })).json()).property;
  check('theme + uploaded background saved', ok.ok && saved.tablet_theme === 'dark' && saved.background_image_url === up.imageUrl, JSON.stringify([saved.tablet_theme, saved.background_image_url]));
  check('https background accepted', (await put({ background_image_url: 'https://images.example.com/bg.jpg' })).ok);
  await put({ background_image_url: up.imageUrl });

  const browser = await H.launch();
  const errors = [];
  const watch = (p, tag) => { p.on('pageerror', e => errors.push(tag + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(tag + ' console: ' + m.text()); }); p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI))); };
  const bodyBg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // ---- Theme toggle on login / dashboards
  for (const [name, url, token] of [['company login', '/company/demo-rentals/login', null], ['admin login', '/admin/login', null], ['landing', '/', null], ['company dashboard', '/company/demo-rentals/dashboard', login.token], ['admin dashboard', '/admin/dashboard', alogin.token]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
    if (token) await ctx.addInitScript(t => { try { localStorage.setItem('stayguide_token', t); } catch {} }, token);
    const p = await ctx.newPage(); watch(p, name);
    await p.goto(B + url); await sleep(1200);
    const light = await bodyBg(p);
    await p.click('.sg-theme-toggle button[data-mode=dark]');
    const dark = await bodyBg(p);
    check(`${name}: toggle switches to dark`, (await p.getAttribute('html', 'data-theme')) === 'dark' && dark !== light, `${light} -> ${dark}`);
    await p.reload({ waitUntil: 'domcontentloaded' });
    check(`${name}: dark persists across reload (set before paint)`, (await p.getAttribute('html', 'data-theme')) === 'dark' && (await p.evaluate(() => localStorage.getItem('stayguide_theme'))) === 'dark');
    await sleep(1000);
    const sc = await p.evaluate(SCAN); check(`${name}: dark contrast AA (${sc.n} text nodes)`, sc.bad.length === 0, sc.bad.slice(0, 6).join(' | '));
    await p.click('.sg-theme-toggle button[data-mode=auto]');
    check(`${name}: auto follows OS (light)`, !(await p.getAttribute('html', 'data-theme')) && (await bodyBg(p)) === light);
    await sleep(500); const sl = await p.evaluate(SCAN); check(`${name}: light contrast AA (${sl.n} text nodes)`, sl.bad.length === 0, sl.bad.slice(0, 6).join(' | '));
    await ctx.close();
  }
  { // auto in dark OS
    const ctx = await browser.newContext({ colorScheme: 'dark' }); const p = await ctx.newPage(); watch(p, 'osdark');
    await p.goto(B + '/company/demo-rentals/login');
    const bg = await bodyBg(p);
    check('auto + dark OS renders dark', bg !== 'rgb(246, 244, 238)' && bg.startsWith('rgb(17'), bg);
    await ctx.close();
  }
  { // storage blocked: no crash
    const ctx = await browser.newContext(); await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage(); watch(p, 'nostorage'); await p.goto(B + '/'); await p.click('.sg-theme-toggle button[data-mode=dark]');
    check('toggle works with localStorage blocked', (await p.getAttribute('html', 'data-theme')) === 'dark'); await ctx.close();
  }

  // ---- Dashboard panel: tablet appearance
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); watch(p, 'panel');
    await put({ tablet_background: 'image', tablet_theme: 'dark', background_image_url: up.imageUrl });
    await p.goto(B + '/company/demo-rentals/login'); await p.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
    await p.goto(B + '/company/demo-rentals/dashboard'); await sleep(1200);
    await p.evaluate(() => editProperty('seaside-villa')); await p.waitForSelector('#propertyPanel.open'); await sleep(700);
    check('panel loads saved background style + theme + image', (await p.inputValue('#tablet-background')) === 'image' && (await p.inputValue('#tablet-theme')) === 'dark' && (await p.inputValue('#background-image-url')) === up.imageUrl);
    check('picker shows 10 swatches (Solid, Image, 4 light, 4 dark) grouped, image fields visible for image', (await p.locator('.bg-option').count()) === 10 && (await p.locator('.bg-group-title').allTextContents()).join('|') === 'Basics|Light gradients|Dark gradients' && await p.isVisible('#tablet-image-group'));
    check('every gradient swatch shows its real webp thumbnail', await p.evaluate(() => [...document.querySelectorAll('.bg-swatch-thumb')].length === 8 && [...document.querySelectorAll('.bg-swatch-thumb')].every(e => /\/img\/gradients\/.+\.webp/.test(e.style.backgroundImage))));
    await p.click('.bg-option[data-bg="baltic-rose"]');
    check('choosing Baltic Rose hides image + theme controls and marks radio', !(await p.isVisible('#tablet-image-group')) && !(await p.isVisible('#tablet-theme-group')) && (await p.getAttribute('.bg-option[data-bg="baltic-rose"]', 'aria-checked')) === 'true' && (await p.inputValue('#tablet-background')) === 'baltic-rose');
    await p.click('.bg-option[data-bg="image"]'); await p.selectOption('#tablet-theme', 'light');
    await p.setInputFiles('#background-image-file', BG); await sleep(2000);
    const newBg = await p.inputValue('#background-image-url');
    check('panel upload fills background URL + swatch', newBg.startsWith('/uploads/properties/') && newBg !== up.imageUrl && (await p.evaluate(() => document.getElementById('bg-swatch-image').style.backgroundImage)).includes('/uploads/'), newBg);
    await p.click('#property-submit-btn'); await p.waitForSelector('#panel-success', { state: 'visible', timeout: 10000 });
    const s2 = (await (await fetch(B + '/company/demo-rentals/properties/seaside-villa', { headers: A })).json()).property;
    check('panel saved tablet_background + theme + image', s2.tablet_background === 'image' && s2.tablet_theme === 'light' && s2.background_image_url === newBg);
    await ctx.close(); }

  // ---- Tablet: every background x theme
  const lookup = async () => (await (await fetch(B + '/company/demo-rentals/properties/seaside-villa', { headers: A })).json()).property;
  const bgUrl = (await lookup()).background_image_url;
  let deviceToken = null;
  async function pairedTablet(ctxOpts, tag) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts });
    const p = await ctx.newPage(); watch(p, tag);
    if (deviceToken) { await ctx.addInitScript(t => { try { localStorage.setItem('stayguide_device_token', t); } catch {} }, deviceToken); await p.goto(B + '/tablet'); }
    else {
      const pc = await (await fetch(B + '/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
      await p.goto(B + '/tablet');
      const firstBg = await p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
      check('pairing screen defaults to solid black', firstBg === 'rgb(0, 0, 0)', firstBg);
      await p.fill('#pairing-code', pc.code); await p.click('#pairingForm button[type=submit]');
      await p.waitForSelector('#content', { state: 'visible', timeout: 10000 });
      deviceToken = await p.evaluate(() => localStorage.getItem('stayguide_device_token'));
    }
    await p.waitForSelector('#content', { state: 'visible', timeout: 10000 }); await sleep(1200);
    return { ctx, p };
  }
  // worst-case text contrast given what can sit behind the glass: lightest gradient pixel, or pure white/black for photos
  const WORST = () => (async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat([1]);
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const root = document.documentElement, kind = root.dataset.bg, dark = root.dataset.theme === 'dark';
    let backs = [];
    if (kind === 'solid') backs = [rgba(getComputedStyle(root).backgroundColor)];
    else if (kind === 'image') backs = [[255, 255, 255, 1], [0, 0, 0, 1]];
    else {
      const url = getComputedStyle(document.getElementById('bg-layer')).backgroundImage.match(/url\("?([^")]+)"?\)/)[1];
      const img = new Image(); img.src = url; await img.decode();
      const c2 = document.createElement('canvas'); c2.width = 96; c2.height = 60; const x2 = c2.getContext('2d'); x2.drawImage(img, 0, 0, 96, 60);
      const d = x2.getImageData(0, 0, 96, 60).data; let best = null, bl = -1, worst = null, wl = 2;
      for (let i = 0; i < d.length; i += 4) { const l = lum([d[i], d[i + 1], d[i + 2]]); if (l > bl) { bl = l; best = [d[i], d[i + 1], d[i + 2], 1]; } if (l < wl) { wl = l; worst = [d[i], d[i + 1], d[i + 2], 1]; } }
      backs = [best, worst];
    }
    const scrim = rgba(getComputedStyle(document.getElementById('bg-layer'), '::after').backgroundColor);
    const glass = rgba(getComputedStyle(document.querySelector('.tile')).backgroundColor);
    const sels = ['.clock-time', '.clock-ampm', '.clock-date', '.company-logo', '.property-name', '.welcome-message p', '.announcement-message', '.announcement-title', '.tile-label', '.weather-temp'];
    let min = 99, who = '';
    for (const bk of backs) for (const withGlass of [false, true]) {
      let bg = over(scrim, bk); if (withGlass) bg = over(glass, bg);
      for (const s of sels) { const el = document.querySelector(s); if (!el) continue; const fg = over(rgba(getComputedStyle(el).color), bg); const r = ratio(fg, bg); if (r < min) { min = r; who = s; } }
    }
    return { min, who, kind };
  })();
  const CASES = [
    ['solid light', { tablet_background: 'solid', tablet_theme: 'light' }, 'light', 'rgb(255, 255, 255)'],
    ['solid dark', { tablet_background: 'solid', tablet_theme: 'dark' }, 'dark', 'rgb(0, 0, 0)'],
    ['solid auto (OS dark)', { tablet_background: 'solid', tablet_theme: 'auto' }, 'dark', 'rgb(0, 0, 0)', { colorScheme: 'dark' }],
    ['solid auto (OS light)', { tablet_background: 'solid', tablet_theme: 'auto' }, 'light', 'rgb(255, 255, 255)', { colorScheme: 'light' }],
    ...GRADS.map(g => [g.name, { tablet_background: g.slug, tablet_theme: g.group === 'light' ? 'dark' : 'light' }, g.group, null]), // theme set to the OPPOSITE: gradients must force their own mode
    ['image dark', { tablet_background: 'image', tablet_theme: 'dark', background_image_url: bgUrl }, 'dark', null],
    ['image light', { tablet_background: 'image', tablet_theme: 'light', background_image_url: bgUrl }, 'light', null],
  ];
  await put({ guest_checkout_date: new Date().toLocaleDateString('en-CA'), direct_booking_url: 'https://demorentals.example/stay', review_url: 'https://g.page/r/demo', background_image_url: bgUrl });
  for (const [name, body, wantTheme, wantBg, ctxOpts] of CASES) {
    await put(body);
    const g = GRADS.find(x => x.slug === body.tablet_background);
    const t = await pairedTablet({ colorScheme: 'light', ...(ctxOpts || {}) }, 'tablet ' + name);
    const st = await t.p.evaluate(() => ({ th: document.documentElement.dataset.theme, bg: document.documentElement.dataset.bg, gr: document.documentElement.dataset.gradient || null, html: getComputedStyle(document.documentElement).backgroundColor, layer: getComputedStyle(document.getElementById('bg-layer')).backgroundImage }));
    check(`[${name}] forced mode ${wantTheme}${wantBg ? ', page is exactly ' + wantBg : g ? ', gradient layer ' + g.file : ', image layer'}`, st.th === wantTheme && (wantBg ? st.html === wantBg && st.layer === 'none' : g ? st.bg === 'gradient' && st.gr === g.slug && st.layer.includes('/img/gradients/' + g.file) : st.bg === 'image' && st.layer.includes('/uploads/properties/')), JSON.stringify(st));
    if (g) {
      const ok = await t.p.evaluate(u => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = u; }), `/img/gradients/${g.file}`);
      check(`[${name}] gradient webp loads (1920 wide)`, ok === 1920, String(ok));
      const fg = await t.p.evaluate(() => ({ t: getComputedStyle(document.querySelector('.clock-time')).color, l: getComputedStyle(document.querySelector('.tile-label')).color }));
      const wantText = g.group === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
      check(`[${name}] ${g.group} gradient => ${g.group === 'light' ? 'dark' : 'light'} text`, fg.t === wantText && fg.l === wantText, JSON.stringify(fg));
      const cached = await t.p.evaluate(async (file) => { await navigator.serviceWorker.ready; const names = (await caches.keys()).filter(k => k.startsWith('sg-images-')); for (const n of names) { if (await (await caches.open(n)).match('/img/gradients/' + file)) return true; } return false; }, g.file);
      check(`[${name}] gradient cached by the service worker on first use (sg-images-*)`, cached);
    }
    const home = await t.p.evaluate(() => { const tiles = [...document.querySelectorAll('.tile')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { l: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) }; }); return { tiles, scrollH: document.documentElement.scrollHeight }; });
    check(`[${name}] icon-only home: 7 tiles, each >= 120px, all inside the first 1280x800 screen`, home.tiles.length === 7 && home.tiles.every(x => x.w >= 120 && x.h >= 120 && x.b <= 800), JSON.stringify(home.tiles.map(x => [x.l, x.w, x.h, x.b])) + ' scrollH ' + home.scrollH);
    const sc = await t.p.evaluate(SCAN); check(`[${name}] AA scan of rendered text (${sc.n} nodes)`, sc.bad.length === 0, sc.bad.slice(0, 5).join(' | '));
    const w = await t.p.evaluate(WORST); check(`[${name}] AA worst-case backdrop (${w.kind}) min ${w.min.toFixed(2)} @ ${w.who}`, w.min >= 4.5);
    for (const sh of ['wifi', 'house', 'amenities', 'videos', 'guide', 'book']) { await t.p.click(`.tile[data-sheet="${sh}"]`); await sleep(450); const ss = await t.p.evaluate(SCAN); const ws = await t.p.evaluate(WORST); check(`[${name}] ${sh} sheet AA (${ss.n} nodes, worst-case ${ws.min.toFixed(2)})`, ss.bad.length === 0 && ws.min >= 4.5, ss.bad.slice(0, 4).join(' | ')); await t.p.click(`#sheet-${sh} .sheet-close`); await sleep(300); }
    const glassCard = await t.p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.tile')); return { bf: cs.backdropFilter || cs.webkitBackdropFilter, sh: cs.boxShadow, bw: cs.borderTopWidth }; });
    check(`[${name}] glass: hairline, no shadow, blur only over gradient/image`, glassCard.sh === 'none' && glassCard.bw === '1px' && (body.tablet_background === 'solid' ? (glassCard.bf === 'none' || !glassCard.bf) : glassCard.bf.includes('blur')), JSON.stringify(glassCard));
    const qr = await t.p.evaluate(() => { const b = document.querySelector('.qr-box'); const cs = getComputedStyle(b); return { bg: cs.backgroundColor, pad: cs.paddingLeft, ink: [...b.querySelectorAll('svg path')].map(p => p.getAttribute('fill') || p.getAttribute('stroke')) }; });
    check(`[${name}] QR black-on-white with quiet zone`, qr.bg === 'rgb(255, 255, 255)' && parseInt(qr.pad) >= 8 && qr.ink.some(c => /^#0{3,6}$/i.test(c)), JSON.stringify(qr));
    if (g) {
      await t.p.click('.tile[data-sheet="videos"]'); await sleep(450);
      const bt = await t.p.evaluate(() => { const cs = getComputedStyle(document.querySelector('#videos-section .video-link')); return { img: cs.backgroundImage, c: cs.color, bd: cs.borderTopColor }; });
      const [a1, a2] = g.linear.map(hex2rgb); const rgbStr = c => c.join(', ');
      const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const txt = g.group === 'light' ? [0, 0, 0] : [255, 255, 255];
      const cr = c => { const x = L(txt), y = L(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      check(`[${name}] primary button = its Figma Linear (${g.linear.join(' to ')}), hairline, text >= 4.5:1 on both stops`, bt.img.includes('linear-gradient') && bt.img.includes(rgbStr(a1)) && bt.img.includes(rgbStr(a2)) && bt.c === `rgb(${rgbStr(txt)})` && /0\.1[0-9]*\)/.test(bt.bd) && cr(a1) >= 4.5 && cr(a2) >= 4.5, JSON.stringify(bt) + ' cr ' + cr(a1).toFixed(1) + '/' + cr(a2).toFixed(1));
      if (['Rich Bistre', 'Silver Cloud'].includes(name)) { await t.p.evaluate(() => openVideoModal(0)); await sleep(450); const vm = await t.p.evaluate(SCAN); check(`[${name}] video modal AA (${vm.n} nodes)`, vm.bad.length === 0, vm.bad.slice(0, 5).join(' | ')); await t.p.evaluate(() => closeVideoModal()); await sleep(300); }
      await t.p.click('#sheet-videos .sheet-close'); await sleep(300);
    }
    if (['Baltic Rose', 'solid dark', 'image light'].includes(name)) {
      await t.p.click('.tile[data-sheet="videos"]'); await sleep(450);
      const sizes = await t.p.evaluate(() => ['.report-button', '#videos-section .video-link', '#sheet-videos .sheet-close'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
      await t.p.click('#sheet-videos .sheet-close'); await sleep(300);
      await t.p.click('.report-card .report-button'); await sleep(450);
      const msizes = await t.p.evaluate(() => ['#reportModal .close', '#reportModal .btn-submit', '#reportModal .btn-cancel', '#category', '#title'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
      check(`[${name}] touch targets >= 48px`, [...sizes, ...msizes].every(h => h >= 48), JSON.stringify([...sizes, ...msizes]));
      const sm = await t.p.evaluate(SCAN); check(`[${name}] report modal AA (${sm.n} nodes)`, sm.bad.length === 0, sm.bad.slice(0, 5).join(' | '));
      await t.p.click('#reportModal .btn-cancel'); await sleep(300);
    }
    if (name === 'image dark') {
      check('tablet has no theme toggle for guests', (await t.p.locator('.sg-theme-toggle').count()) === 0);
      await t.p.keyboard.press('Tab'); const focusVis = await t.p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return e && e !== document.body && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
      check('keyboard focus ring visible', focusVis);
      await t.p.reload({ waitUntil: 'domcontentloaded' });
      check('cached look applied before content loads (no flash)', await t.p.evaluate(() => document.documentElement.dataset.bg === 'image' && document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.documentElement).getPropertyValue('--tablet-bg').includes('/uploads/')));
    }
    await t.ctx.close();
  }
  await put({ tablet_background: 'solid', tablet_theme: 'auto', background_image_url: '' });

  // ---- Home screen behaviour: sheets, ESC/backdrop/focus trap, idle return, clock, weather, Wi-Fi QR
  await put({ tablet_background: 'solid', tablet_theme: 'dark', latitude: 34.0195, longitude: -118.4912, temperature_unit: 'F', clock_format: '12h', direct_booking_url: 'https://demorentals.example/stay' });
  {
    const content = await (await fetch(B + '/device/content', { headers: { Authorization: 'Device ' + deviceToken } })).json();
    check('content payload carries wifi_qr_svg + coordinates', typeof content.wifi_qr_svg === 'string' && content.wifi_qr_svg.startsWith('<svg') && Number(content.property.latitude) === 34.0195, String(content.wifi_qr_svg).slice(0, 20));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem('stayguide_device_token', t); } catch {} window.SG_IDLE_MS = 2500; }, [deviceToken]);
    const p = await ctx.newPage(); watch(p, 'home');
    await p.goto(B + '/tablet'); await p.waitForSelector('#content', { state: 'visible' }); await sleep(1200);
    const labels = await p.evaluate(() => [...document.querySelectorAll('.tile')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim()));
    check('tile order: Wi-Fi, House Info, Amenities, How-to Videos, Local Guide, Book Again, Report an Issue', JSON.stringify(labels) === JSON.stringify(['Wi-Fi', 'House Info', 'Amenities', 'How-to Videos', 'Local Guide', 'Book Again', 'Report an Issue']), JSON.stringify(labels));
    const SHEETS = { wifi: '#wifi-info', house: '#property-info', amenities: '#amenities-section', videos: '#videos-section', guide: '#recommendations-section', book: '#guest-links-section' };
    for (const [sh, inner] of Object.entries(SHEETS)) {
      const tile = `.tile[data-sheet="${sh}"]`;
      await p.focus(tile); await p.click(tile); await sleep(450);
      const st = await p.evaluate(([sh, inner]) => { const el = document.getElementById('sheet-' + sh); return { shown: getComputedStyle(el).display !== 'none', innerVisible: !!document.querySelector(inner).offsetParent, focusOnClose: document.activeElement === el.querySelector('.sheet-close'), modal: el.getAttribute('aria-modal') }; }, [sh, inner]);
      check(`sheet ${sh}: opens, content visible, focus on close, aria-modal`, st.shown && st.innerVisible && st.focusOnClose && st.modal === 'true', JSON.stringify(st));
      let trapped = true; for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); trapped = trapped && await p.evaluate(sh => document.getElementById('sheet-' + sh).contains(document.activeElement), sh); }
      await p.keyboard.press('Escape'); await sleep(450);
      const afterEsc = await p.evaluate(([sh, tile]) => ({ closed: getComputedStyle(document.getElementById('sheet-' + sh)).display === 'none', focusBack: document.activeElement === document.querySelector(tile) }), [sh, tile]);
      check(`sheet ${sh}: Tab stays trapped inside, ESC closes and returns focus to its tile`, trapped && afterEsc.closed && afterEsc.focusBack, JSON.stringify({ trapped, ...afterEsc }));
    }
    // backdrop + close button
    await p.click('.tile[data-sheet="amenities"]'); await sleep(450);
    await p.mouse.click(5, 5); await sleep(450);
    check('backdrop click closes the sheet', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-amenities')).display === 'none'));
    await p.click('.tile[data-sheet="guide"]'); await p.click('#sheet-guide .sheet-close'); await sleep(450);
    check('close button closes the sheet', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-guide')).display === 'none'));
    // report tile opens the modal directly; ESC closes
    await p.click('.report-card .report-button'); await sleep(450);
    const rep = await p.evaluate(() => ({ open: getComputedStyle(document.getElementById('reportModal')).display !== 'none', sheets: [...document.querySelectorAll('.sheet')].every(s => getComputedStyle(s).display === 'none') }));
    check('Report tile opens #reportModal directly (no sheet)', rep.open && rep.sheets);
    await p.keyboard.press('Escape'); await sleep(450);
    check('ESC closes the report modal', await p.evaluate(() => getComputedStyle(document.getElementById('reportModal')).display === 'none'));
    // review banner opens the book sheet
    await p.click('#review-banner'); await sleep(450);
    check('review banner (checkout day) opens the Book sheet', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-book')).display !== 'none' && document.getElementById('guest-links-section').textContent.includes('Thanks for staying')));
    await p.keyboard.press('Escape');
    // Wi-Fi sheet
    await p.click('.tile[data-sheet="wifi"]'); await sleep(450);
    const wf = await p.evaluate(() => ({ qr: document.querySelectorAll('#wifi-qr .qr-box svg').length, fs: parseFloat(getComputedStyle(document.querySelector('.wifi-value')).fontSize), bg: getComputedStyle(document.querySelector('#wifi-qr .qr-box')).backgroundColor }));
    check('Wi-Fi sheet: join QR (white tile) + very large network/password text', wf.qr === 1 && wf.fs >= 32 && wf.bg === 'rgb(255, 255, 255)', JSON.stringify(wf));
    // idle auto-close (SG_IDLE_MS = 2.5 s): sheet, then report modal
    await sleep(3000);
    check('idle: open sheet auto-closes back to the home icons', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-wifi')).display === 'none'));
    await p.click('.report-card .report-button'); await sleep(3000);
    check('idle: open report modal auto-closes too', await p.evaluate(() => getComputedStyle(document.getElementById('reportModal')).display === 'none'));
    await p.click('.tile[data-sheet="house"]'); await sleep(1500); await p.mouse.move(300, 300); await p.mouse.down(); await p.mouse.up(); await sleep(1500);
    check('idle timer resets on interaction', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-house')).display !== 'none'));
    await p.keyboard.press('Escape');

    // empty sections hide their tiles (Book Again needs a booking URL)
    await put({ direct_booking_url: '' }); await p.reload(); await p.waitForSelector('#content', { state: 'visible' }); await sleep(800);
    check('Book Again tile hidden when there is no booking link; Wi-Fi + Report always shown', await p.evaluate(() => getComputedStyle(document.querySelector('.tile[data-sheet="book"]')).display === 'none' && !!document.querySelector('.tile[data-sheet="wifi"]').offsetParent && !!document.querySelector('.report-card .report-button').offsetParent));
    await put({ direct_booking_url: 'https://demorentals.example/stay' });

    // weather: stub returns 71.6 F, code 2
    const wx = await p.evaluate(() => ({ t: document.getElementById('weather-temp').textContent, label: document.getElementById('weather').getAttribute('aria-label'), svg: !!document.querySelector('#weather-icon svg'), shown: document.getElementById('weather').offsetParent !== null, stale: document.getElementById('weather').classList.contains('is-stale') }));
    check('weather shows 72°F with partly-cloudy icon (stubbed Open-Meteo)', wx.t === '72°F' && /partly cloudy/.test(wx.label) && wx.svg && wx.shown && !wx.stale, JSON.stringify(wx));
    const hitsBefore = stubHits.filter(u => u.startsWith('/v1/forecast')).length;
    await fetch(B + '/device/weather', { headers: { Authorization: 'Device ' + deviceToken } }); await fetch(B + '/device/weather', { headers: { Authorization: 'Device ' + deviceToken } });
    check('server caches weather (30 min): repeat calls make no new upstream request', stubHits.filter(u => u.startsWith('/v1/forecast')).length === hitsBefore);
    check('upstream request uses fahrenheit + coordinates', stubHits.some(u => u.includes('temperature_unit=fahrenheit') && u.includes('latitude=34.0195') && u.includes('current=temperature_2m%2Cweather_code')), stubHits[stubHits.length - 1]);
    // offline: last value stays, dimmed
    await ctx.setOffline(true); await p.evaluate(() => loadWeather()); await sleep(300);
    const off = await p.evaluate(() => ({ t: document.getElementById('weather-temp').textContent, stale: document.getElementById('weather').classList.contains('is-stale'), op: getComputedStyle(document.getElementById('weather')).opacity }));
    check('offline: cached temperature stays visible, dimmed (no extra text)', off.t === '72°F' && off.stale && parseFloat(off.op) < 1, JSON.stringify(off));
    await ctx.setOffline(false);
    const swCaches = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { for (const r of await (await caches.open(k)).keys()) out.push(r.url); } return out.filter(u => u.includes('/device/weather')); });
    check('service worker never caches /device/weather', swCaches.length === 0, JSON.stringify(swCaches));
    await ctx.close();

    // celsius, 24h clock, no coordinates
    await put({ temperature_unit: 'C', clock_format: '24h' });
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx2.addInitScript(([t]) => { try { localStorage.setItem('stayguide_device_token', t); } catch {} }, [deviceToken]);
    const p2 = await ctx2.newPage(); watch(p2, 'home24');
    await p2.clock.install({ time: new Date('2026-10-03T10:59:50') });
    await p2.goto(B + '/tablet'); await p2.waitForSelector('#content', { state: 'visible' }); await sleep(1000);
    const c1 = await p2.evaluate(() => [document.getElementById('clock-time').textContent, document.getElementById('clock-ampm').textContent, document.getElementById('clock-date').textContent, document.getElementById('weather-temp').textContent]);
    check('24h clock, date line, Celsius temperature', c1[0] === '10:59' && c1[1] === '' && /^Saturday, Oct 3$/.test(c1[2]) && c1[3] === '22°C', JSON.stringify(c1));
    await p2.clock.runFor(15000); await sleep(100);
    check('clock ticks on the minute boundary (10:59:50 + 15 s -> 11:00)', (await p2.textContent('#clock-time')) === '11:00', await p2.textContent('#clock-time'));
    check('minute text crossfades (tick animation class added when the minute changes)', (await p2.locator('#clock-time.tick').count()) === 1);
    check('upstream request used celsius', stubHits.some(u => u.includes('temperature_unit=celsius')));
    await ctx2.close();
    await put({ latitude: '', longitude: '' });
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx3.addInitScript(([t]) => { try { localStorage.setItem('stayguide_device_token', t); localStorage.removeItem('stayguide_tablet_weather'); } catch {} }, [deviceToken]);
    const p3 = await ctx3.newPage(); watch(p3, 'nowx'); await p3.goto(B + '/tablet'); await p3.waitForSelector('#content', { state: 'visible' }); await sleep(800);
    check('no coordinates: temperature hidden gracefully, clock still shown', !(await p3.isVisible('#weather')) && (await p3.isVisible('#clock-time')));
    check('device weather endpoint 404 without a location', (await fetch(B + '/device/weather', { headers: { Authorization: 'Device ' + deviceToken } })).status === 404);
    await ctx3.close();
    await put({ latitude: 34.0195, longitude: -118.4912, temperature_unit: 'F', clock_format: '12h' });
  }
  // ---- Motion, blur overlay, crossfade, reduced motion
  for (const g of GRADS) check(`API accepts tablet_background=${g.slug}`, (await put({ tablet_background: g.slug })).ok);
  check('API accepts solid + image', (await put({ tablet_background: 'solid' })).ok && (await put({ tablet_background: 'image' })).ok);
  check('API rejects unknown background slug', (await put({ tablet_background: 'neon-pink' })).status === 400);
  await put({ tablet_background: 'baltic-rose', tablet_theme: 'auto' });
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem('stayguide_device_token', t); } catch {} }, [deviceToken]);
    const p = await ctx.newPage(); watch(p, 'motion');
    await p.goto(B + '/tablet'); await p.waitForSelector('#content', { state: 'visible' });
    const early = await p.evaluate(() => ({ content: getComputedStyle(document.getElementById('content')).animationName, d1: getComputedStyle(document.querySelectorAll('.tile')[0]).animationDelay, d7: getComputedStyle(document.querySelectorAll('.tile')[6]).animationDelay, tileAnim: getComputedStyle(document.querySelector('.tile')).animationName }));
    check('home enters with a fade-up; tiles stagger 40 ms apart', early.content === 'sg-enter' && early.tileAnim === 'sg-rise' && early.d1 === '0.12s' && early.d7 === '0.36s', JSON.stringify(early));
    await sleep(1200);
    const tileHover = await p.evaluate(() => getComputedStyle(document.querySelector('.tile')).transitionProperty);
    check('tiles have a press transition (transform) and nothing animates layout properties', /transform/.test(tileHover) && !/(width|height|top|left|margin|padding)/.test(tileHover), tileHover);
    // timing curves
    const closed = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('sheet-wifi')); return { dur: s.transitionDuration, fn: s.transitionTimingFunction }; });
    check('exit: 200 ms ease-in while closed', closed.dur === '0.2s' && closed.fn === 'ease-in', JSON.stringify(closed));
    // open: transition completes (transitionend), blur overlay on, per-card blurs dropped, focus inside
    const opened = await p.evaluate(() => new Promise(resolve => {
      const el = document.getElementById('sheet-wifi'); const t0 = performance.now();
      el.addEventListener('transitionend', e => { if (e.propertyName !== 'opacity') return; const s = getComputedStyle(el); resolve({ ms: Math.round(performance.now() - t0), opacity: s.opacity, dur: s.transitionDuration, fn: s.transitionTimingFunction, bf: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor, cls: document.documentElement.classList.contains('layer-open'), tileBf: getComputedStyle(document.querySelector('.tile')).backdropFilter, inner: getComputedStyle(el.querySelector('.sheet-inner')).transform, focus: el.contains(document.activeElement) }); }, { once: true });
      openSheet('wifi'); setTimeout(() => resolve({ timeout: true }), 2000);
    }));
    check('open: transitionend fires, 320 ms ease-out curve, ends fully visible', !opened.timeout && opened.opacity === '1' && opened.dur === '0.32s' && /cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(opened.fn) && opened.ms >= 250 && opened.ms < 900 && opened.inner === 'none', JSON.stringify(opened));
    check('open: ONE blur layer (24px + saturate) with dim; html.layer-open; per-card blurs dropped', /blur\(24px\)/.test(opened.bf) && /saturate/.test(opened.bf) && opened.bg === 'rgba(0, 0, 0, 0.35)' && opened.cls && (opened.tileBf === 'none'), JSON.stringify(opened));
    check('open: focus moved into the sheet', opened.focus);
    const closing = await p.evaluate(() => new Promise(resolve => {
      const el = document.getElementById('sheet-wifi'); const t0 = performance.now();
      el.addEventListener('transitionend', e => { if (e.propertyName !== 'opacity') return; resolve({ ms: Math.round(performance.now() - t0), display: getComputedStyle(el).display, cls: document.documentElement.classList.contains('layer-open'), tileBf: getComputedStyle(document.querySelector('.tile')).backdropFilter }); }, { once: true });
      closeSheet(); setTimeout(() => resolve({ timeout: true }), 2000);
    }));
    await sleep(100);
    check('close: faster exit (about 200 ms), blur layer removed, per-card blur restored, sheet hidden', !closing.timeout && closing.ms >= 120 && closing.ms < 400 && !closing.cls && /blur/.test(closing.tileBf) && (await p.evaluate(() => getComputedStyle(document.getElementById('sheet-wifi')).display)) === 'none', JSON.stringify(closing));
    // report modal also uses the blur layer
    await p.click('.report-card .report-button'); await sleep(500);
    check('report modal: same blur layer + dim, content settled', await p.evaluate(() => { const m = document.getElementById('reportModal'); const s = getComputedStyle(m); return /blur\(24px\)/.test(s.backdropFilter) && s.opacity === '1' && getComputedStyle(m.querySelector('.modal-content')).transform === 'none' && document.documentElement.classList.contains('layer-open'); }));
    await p.keyboard.press('Escape'); await sleep(450);
    check('report modal closes (layer-open cleared)', await p.evaluate(() => !document.documentElement.classList.contains('layer-open') && getComputedStyle(document.getElementById('reportModal')).display === 'none'));
    // background crossfade
    const fade = await p.evaluate(() => new Promise(resolve => { const before = !!document.querySelector('.bg-fade'); applyTabletLook('dark', '', 'silver-cloud'); const mid = !!document.querySelector('.bg-fade'); setTimeout(() => resolve({ before, mid, after: !!document.querySelector('.bg-fade'), g: document.documentElement.dataset.gradient, th: document.documentElement.dataset.theme }), 1400); }));
    check('background crossfades when the look changes (old layer fades out, then is removed)', !fade.before && fade.mid && !fade.after && fade.g === 'silver-cloud' && fade.th === 'light', JSON.stringify(fade));
    await ctx.close();
  }
  { // reduced motion: no motion at all
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem('stayguide_device_token', t); } catch {} }, [deviceToken]);
    const p = await ctx.newPage(); watch(p, 'reduced'); await p.goto(B + '/tablet'); await p.waitForSelector('#content', { state: 'visible' }); await sleep(600);
    const r = await p.evaluate(() => { const t = document.querySelector('.tile'); const sh = document.getElementById('sheet-wifi'); const num = v => Math.max(...v.split(',').map(x => parseFloat(x))); return { tileAnim: num(getComputedStyle(t).animationDuration), contentAnim: num(getComputedStyle(document.getElementById('content')).animationDuration), sheet: num(getComputedStyle(sh).transitionDuration), inner: num(getComputedStyle(sh.querySelector('.sheet-inner')).transitionDuration) }; });
    check('prefers-reduced-motion: tile/page animations and sheet transitions are effectively instant', Object.values(r).every(v => v <= 0.001), JSON.stringify(r));
    await p.click('.tile[data-sheet="wifi"]'); await sleep(60);
    check('reduced motion: sheet is fully open within 60 ms', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-wifi')).opacity === '1'));
    await p.keyboard.press('Escape'); await sleep(100);
    check('reduced motion: sheet closes immediately', await p.evaluate(() => getComputedStyle(document.getElementById('sheet-wifi')).display === 'none'));
    await ctx.close();
  }
  // API: auth + validation + geocode
  check('/device/weather needs a device token', (await fetch(B + '/device/weather')).status === 401);
  check('admin preview weather works with company JWT', (await fetch(B + '/company/demo-rentals/property/seaside-villa/api/weather', { headers: A })).ok);
  check('latitude out of range rejected', (await put({ latitude: 100 })).status === 400);
  check('longitude NaN rejected', (await put({ longitude: 'abc' })).status === 400);
  check('temperature_unit K rejected', (await put({ temperature_unit: 'K' })).status === 400);
  check('clock_format 25h rejected', (await put({ clock_format: '25h' })).status === 400);
  { const r = await put({ latitude: '34.0195', longitude: -118.4912, temperature_unit: 'C', clock_format: '24h' }); const pr = await lookup(); check('weather/clock fields persisted', r.ok && Number(pr.latitude) === 34.0195 && pr.temperature_unit === 'C' && pr.clock_format === '24h'); await put({ temperature_unit: 'F', clock_format: '12h' }); }
  { const g = await fetch(B + '/company/demo-rentals/geocode?q=' + encodeURIComponent('456 Ocean Drive, Beach City, CA 90210'), { headers: A }); const gj = await g.json();
    check('geocode endpoint returns coordinates (ZIP first)', g.ok && gj.latitude === 34.0901 && stubHits.some(u => u.startsWith('/v1/search') && u.includes('name=90210')), JSON.stringify(gj));
    check('geocode needs company-admin auth', (await fetch(B + '/company/demo-rentals/geocode?q=90210')).status === 401);
    check('geocode rejects empty query', (await fetch(B + '/company/demo-rentals/geocode?q=a', { headers: A })).status === 400); }
  { // dashboard control
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); watch(p, 'dash-loc');
    await p.goto(B + '/company/demo-rentals/login'); await p.evaluate(t => localStorage.setItem('stayguide_token', t), login.token);
    await p.goto(B + '/company/demo-rentals/dashboard'); await sleep(1200);
    await p.evaluate(() => editProperty('seaside-villa')); await p.waitForSelector('#propertyPanel.open'); await sleep(700);
    check('dashboard loads saved coordinates, unit, clock', (await p.inputValue('#latitude')) === '34.0195' && (await p.inputValue('#temperature-unit')) === 'F' && (await p.inputValue('#clock-format')) === '12h');
    await p.fill('#latitude', ''); await p.fill('#longitude', ''); await p.click('#geocode-btn'); await sleep(800);
    check('"Find from address" fills lat/lon from the address field', (await p.inputValue('#latitude')) === '34.0901' && (await p.inputValue('#longitude')) === '-118.4065' && /Beverly Hills/.test(await p.textContent('#geocode-status')), await p.textContent('#geocode-status'));
    await p.selectOption('#temperature-unit', 'C'); await p.selectOption('#clock-format', '24h');
    await p.click('#property-submit-btn'); await p.waitForSelector('#panel-success', { state: 'visible', timeout: 10000 });
    const pr = await lookup(); check('dashboard saved location + unit + clock', Number(pr.latitude) === 34.0901 && pr.temperature_unit === 'C' && pr.clock_format === '24h');
    await ctx.close();
    await put({ latitude: 34.0195, longitude: -118.4912, temperature_unit: 'F', clock_format: '12h' });
  }
  await put({ tablet_background: 'solid', tablet_theme: 'auto', background_image_url: '' });

  { const ctx = await browser.newContext({ reducedMotion: 'reduce' }); const p = await ctx.newPage(); await p.goto(B + '/company/demo-rentals/login');
    const d = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.btn')).transitionDuration)); check('prefers-reduced-motion kills transitions', d <= 0.001, String(d)); await ctx.close(); }
  { const ctx = await browser.newContext({ colorScheme: 'dark' }); const p = await ctx.newPage(); watch(p, 'pairing'); await p.goto(B + '/tablet'); await sleep(500);
    const s = await p.evaluate(SCAN); check(`pairing screen dark contrast AA (${s.n})`, s.bad.length === 0, s.bad.join('|')); await ctx.close(); }

  check('no console/page errors or CSP violations', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); kill(); stub.close();
  console.log(out.join('\n')); console.log(`\n${out.filter(l => l.startsWith('PASS')).length}/${out.length} passed`);
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0); // 2026-10-03 22:42, fail the run on any FAIL
})().catch(e => { console.error(e); kill(); process.exit(1); });
