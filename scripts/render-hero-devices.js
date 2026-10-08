// 2026-10-06 15:10, renders the landing hero device mockup (tablet + phone) to public/img/hero-devices-stayguide.{png,webp}.
// Captures the REAL guest screens from a throwaway mock-mode server (paired tablet at 1280x800, phone guide link at 390x844),
// then draws the device frames in HTML/CSS and screenshots them with a transparent background. Regenerate when the screens change:
//   npm run build && PLAYWRIGHT_CHROMIUM_PATH=<chromium> node scripts/render-hero-devices.js
// No third-party device art: the frames are plain CSS.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.HERO_PORT || '3919';
const B = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, 'public/img');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sg-hero-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const launch = () => chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});

// Canvas is ~2x the 520px display width of the hero column. All sizes below are CSS px at DSF 1.
const FRAME_HTML = (tabletImg, phoneImg) => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  .stage { position: relative; width: 1040px; height: 860px; }
  .tablet { position: absolute; left: 10px; top: 40px; width: 770px; height: 502px; box-sizing: border-box; padding: 28px; border-radius: 46px;
    background: linear-gradient(145deg, #2a2a2e 0%, #0b0b0d 38%, #050506 100%);
    box-shadow: inset 0 0 0 2px #3b3b40, inset 0 0 0 4px #000, 0 50px 70px -20px rgba(0,0,0,.55), 0 18px 30px -12px rgba(0,0,0,.4); }
  .tablet img { display: block; width: 714px; height: 446px; border-radius: 10px; }
  .tablet i { position: absolute; left: 11px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: #1b1d24; box-shadow: inset 0 0 0 1.5px #2f323b; }
  .phone { position: absolute; left: 700px; top: 270px; width: 262px; height: 540px; box-sizing: border-box; padding: 11px; border-radius: 52px;
    background: linear-gradient(150deg, #5b5d63 0%, #1a1b1e 22%, #0a0a0b 60%, #2b2c31 100%);
    box-shadow: inset 0 0 0 1.5px #7a7d85, inset 0 0 0 4px #000, 0 60px 60px -10px rgba(0,0,0,.55), 0 22px 28px -10px rgba(0,0,0,.45); }
  .phone img { display: block; width: 240px; height: 518px; object-fit: cover; object-position: top; border-radius: 41px; }
  .phone i { position: absolute; left: 50%; top: 22px; width: 76px; height: 22px; margin-left: -38px; border-radius: 12px; background: #000; }
  .phone b { position: absolute; width: 3px; border-radius: 2px; background: #3a3b40; left: -2px; }
  .phone b.a { top: 120px; height: 28px; } .phone b.b { top: 170px; height: 52px; } .phone b.c { top: 236px; height: 52px; }
  .phone b.p { left: auto; right: -2px; top: 190px; height: 76px; }
</style><div class="stage">
  <div class="tablet"><img src="${tabletImg}" alt=""><i></i></div>
  <div class="phone"><img src="${phoneImg}" alt=""><i></i><b class="a"></b><b class="b"></b><b class="c"></b><b class="p"></b></div>
</div>`;

(async () => {
  // Weather stub so the screens show a stable, plausible reading without network access
  const stub = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(req.url.startsWith('/v1/forecast') ? JSON.stringify({ current: { temperature_2m: 71.6, weather_code: 2 } }) : '{}'); }).listen(3920);
  const server = spawn('node', ['dist/index.js'], { cwd: ROOT, env: { ...process.env, PORT, MOCK_DATABASE: 'true', OPEN_METEO_BASE_URL: 'http://localhost:3920', OPEN_METEO_GEOCODE_URL: 'http://localhost:3920' }, stdio: 'ignore' });
  const browser = await launch();
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
    const J = { 'content-type': 'application/json' };
    const login = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
    const A = { ...J, Authorization: 'Bearer ' + login.token };
    const P = B + '/company/demo-rentals/properties/seaside-villa';

    // A gradient background (not the default solid black) so the screens read against the black bezels
    await fetch(P, { method: 'PUT', headers: A, body: JSON.stringify({ tablet_background: 'erie-charcoal' }) });

    // Tablet home: pair a fresh device, dark theme
    const pc = await (await fetch(P + '/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const tp = await tctx.newPage();
    await tp.goto(B + '/tablet');
    await tp.fill('#pairing-code', pc.code); await tp.click('#pairingForm button[type=submit]');
    await tp.waitForSelector('#content', { state: 'visible', timeout: 10000 }); await sleep(2500);
    await tp.screenshot({ path: path.join(TMP, 'tablet.png') });

    // Phone guide: the guest link page
    const link = await (await fetch(P + '/guest-link', { headers: A })).json();
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const pp = await pctx.newPage();
    await pp.goto(link.url.replace(/^https?:\/\/[^/]+/, B));
    await pp.waitForSelector('#content', { state: 'visible', timeout: 10000 }); await sleep(2500);
    await pp.addStyleTag({ content: 'body { padding-top: 30px !important; }' }); // room for the drawn notch (the real page has no safe-area inset in a desktop browser)
    await sleep(300);
    await pp.screenshot({ path: path.join(TMP, 'phone.png') });

    // Frames, rendered transparent
    const ctx = await browser.newContext({ viewport: { width: 1040, height: 860 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const file = path.join(TMP, 'frames.html');
    fs.writeFileSync(file, FRAME_HTML('tablet.png', 'phone.png'));
    await page.goto('file://' + file); await sleep(300);
    const png = path.join(OUT, 'hero-devices-stayguide.png');
    await page.screenshot({ path: png, omitBackground: true });
    await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, 'hero-devices-stayguide.webp'));
    await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(png + '.tmp'); fs.renameSync(png + '.tmp', png);
    console.log('wrote', png);
  } finally { await browser.close(); server.kill(); stub.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
