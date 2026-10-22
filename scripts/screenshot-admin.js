// 2026-10-06 15:55, screenshots admin screens (light/dark x 1440/390) to docs/screenshots/admin-*.png. Usage: PORT=3100 node scripts/screenshot-admin.js
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = `http://localhost:${process.env.PORT || 3100}`;
const EXE = process.env.PLAYWRIGHT_CHROMIUM_PATH || path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell');
const OUT = path.join(__dirname, '../docs/screenshots');
const SCREENS = [
  { name: 'company-login', url: '/company/demo-rentals/login' },
  { name: 'admin-login', url: '/admin/login' },
  { name: 'company-dashboard', login: 'company', url: '/company/demo-rentals/dashboard' },
  { name: 'company-billing', login: 'company', url: '/company/demo-rentals/billing' },
  { name: 'platform-dashboard', login: 'admin', url: '/admin/dashboard' },
  { name: 'platform-billing', login: 'admin', url: '/admin/billing' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const only = process.argv[2];
  for (const s of SCREENS) {
    if (only && !s.name.includes(only)) continue;
    for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript(t => { try { localStorage.setItem('stayguide_theme', t); } catch (e) {} }, theme);
      if (s.login) {
        const isAdmin = s.login === 'admin';
        const r = await page.request.post(BASE + (isAdmin ? '/admin/login' : '/company/demo-rentals/login'), { data: isAdmin ? { email: 'admin@stayguide.com', password: 'admin123' } : { email: 'admin@demorentals.com', password: 'demo123' } });
        const j = await r.json();
        // 2026-10-07 17:55, admin pages use their own storage key
        await page.addInitScript(([tk, key]) => { try { localStorage.setItem(key, tk); } catch (e) {} }, [j.token, isAdmin ? 'stayguide_admin_token' : 'stayguide_token']);
      }
      await page.goto(BASE + s.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/admin-${s.name}-${theme}-${w}.png`, fullPage: w < 600 ? false : false });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(s.name, theme, w, 'overflowX', sw);
      await ctx.close();
    }
  }
  await browser.close();
})();
