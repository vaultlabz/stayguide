// 2026-10-08 01:50, G7 Ops stage 3: access codes (encrypted, time-boxed, audited), QR stickers + check-in/out, private photos
const H = require('./helpers');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

const api = async (p, { token, method = 'GET', body, device } = {}) => {
  const auth = device ? { Authorization: `Device ${device}` } : token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...auth }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
};
const upload = async (token, jobId, file, kind = 'after', caption = '', type) => {
  const form = new FormData();
  form.append('kind', kind); form.append('caption', caption);
  form.append('photo', new Blob([fs.readFileSync(file)], { type: type || (file.endsWith('.jpg') ? 'image/jpeg' : 'text/plain') }), path.basename(file));
  const res = await fetch(`${B}/maint/api/jobs/${jobId}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const iso = ms => new Date(Date.now() + ms).toISOString();
const MIN = 60000, HOUR = 3600000;

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const STORE = path.join(H.OUT, 'ops-storage');
  fs.rmSync(STORE, { recursive: true, force: true });
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock', OPS_STORAGE_DIR: STORE }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const img = path.join(H.OUT, 'ops-s3-photo.jpg');
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#2a6' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'test' } } }).toFile(img);
  const txt = path.join(H.OUT, 'ops-s3-not-image.txt'); fs.writeFileSync(txt, 'hello');

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });
  const wkr = (p, body, method) => api('/maint/api/jobs' + p, { token: WT, method: method || (body ? 'POST' : 'GET'), body });

  // ---- access codes: storage + no leaks
  check('set property access', (await mgr('/access/1', { code: '4821#', notes: 'Lockbox left of the door' }, 'PUT')).data.has_code === true);
  check('manager reads it back (no-store)', (await mgr('/access/1')).data.code === '4821#' && (await mgr('/access/1')).headers.get('cache-control')?.includes('no-store'));
  check('other company cannot read it', (await api('/company/ocean-view/ops/access/1', { token: AT })).status === 402 || (await api('/company/ocean-view/ops/access/1', { token: AT })).status === 404);
  const propsText = (await api('/company/demo-rentals/properties', { token: CT })).text + (await api('/company/demo-rentals/properties/seaside-villa', { token: CT })).text;
  check('property APIs never include the code', !propsText.includes('4821') && !propsText.includes('access_code'));
  const pc = (await api('/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { token: CT, method: 'POST', body: {} })).data;
  const dev = (await api('/device/pair', { method: 'POST', body: { code: pc.code } })).data.token;
  const tablet = await api('/device/content', { device: dev });
  check('tablet content never includes the code', tablet.status === 200 && !tablet.text.includes('4821') && !tablet.text.includes('access_code'));
  const link = (await api('/company/demo-rentals/properties/seaside-villa/guest-link', { token: CT })).data.url;
  const guestPage = await (await fetch(link)).text();
  const guestApi = await api(`/g/${link.split('/g/')[1]}/content`);
  check('guest link never includes the code', !guestPage.includes('4821') && !guestApi.text.includes('4821'));

  // ---- the access window
  const mk = async (body) => (await mgr('/work-orders', { property_id: 1, title: 'S3 job', assignee_user_id: 3, ...body })).data.work_order.id;
  const future = await mk({ title: 'Future window', window_start: iso(3 * HOUR), window_end: iso(5 * HOUR) });
  const fa = (await wkr(`/${future}`)).data.access;
  check('future window: code hidden, opens 30 min early', fa.available === false && Math.abs(new Date(fa.opens_at) - (Date.now() + 3 * HOUR - 30 * MIN)) < 5 * MIN);
  check('future window: reveal refused', (await wkr(`/${future}/access`, {})).status === 403);
  const past = await mk({ title: 'Past window', window_start: iso(-6 * HOUR), window_end: iso(-4 * HOUR) });
  check('past window: refused with reason', (await wkr(`/${past}/access`, {})).status === 403);
  const nowJob = await mk({ title: 'Now window', window_start: iso(-10 * MIN), window_end: iso(2 * HOUR) });
  const rev = await wkr(`/${nowJob}/access`, {});
  check('inside window: code revealed + no-store', rev.data.code === '4821#' && rev.data.notes === 'Lockbox left of the door' && rev.headers.get('cache-control')?.includes('no-store'));
  check('reveal is recorded in the history', (await mgr(`/work-orders/${nowJob}`)).data.events.some(e => e.action === 'access_viewed'));
  check('job detail never contains the code itself', !(await wkr(`/${nowJob}`)).text.includes('4821'));
  const noWin = await mk({ title: 'No window' });
  check('no window: hidden until started', (await wkr(`/${noWin}/access`, {})).status === 403);
  await mgr(`/work-orders/${nowJob}/access`, { code: '7777' }, 'PUT');
  check('per-job code overrides the property code', (await wkr(`/${nowJob}/access`, {})).data.code === '7777');
  check('work order API returns no ciphertext', !(await mgr(`/work-orders/${nowJob}`)).text.includes('v1:') && (await mgr(`/work-orders/${nowJob}`)).data.work_order.has_access_override === true);

  // ---- QR stickers + check-in/out
  const qr1 = (await mgr('/access/1/qr')).data;
  check('QR sticker: url + svg', /\/maint\/scan\/[A-Za-z0-9_-]{32}$/.test(qr1.url) && qr1.svg.includes('<svg'));
  check('QR is stable until replaced', (await mgr('/access/1/qr')).data.url === qr1.url);
  const t1 = qr1.url.split('/').pop();
  const scanIn = await api(`/maint/api/scan/${t1}`, { token: WT, method: 'POST', body: { job_id: nowJob } });
  check('scan in (job in window) → checked in + started', scanIn.data.checked === 'in' && (await wkr(`/${nowJob}`)).data.job.status === 'in_progress');
  check('one check-in at a time', (await wkr(`/${noWin}/start`, {})).status === 409);
  const scanOut = await api(`/maint/api/scan/${t1}`, { token: WT, method: 'POST' });
  check('scan again → checked out (open job picked)', scanOut.data.checked === 'out' && scanOut.data.job.id === nowJob);
  check('scan with several jobs → asks which (300)', (await api(`/maint/api/scan/${t1}`, { token: WT, method: 'POST' })).status === 300);
  check('QR outside the window refused', (await api(`/maint/api/scan/${t1}`, { token: WT, method: 'POST', body: { job_id: future } })).status === 409);
  const qr2 = (await mgr('/access/2/qr')).data;
  check('sticker of a property with no job for me → 404', (await api(`/maint/api/scan/${qr2.url.split('/').pop()}`, { token: WT, method: 'POST' })).status === 404);
  const rotated = (await mgr('/access/1/qr', {})).data;
  check('replace sticker: old stops working', rotated.url !== qr1.url && (await api(`/maint/api/scan/${t1}`, { token: WT, method: 'POST' })).status === 404);
  check('scan needs a worker sign-in', (await api(`/maint/api/scan/${rotated.url.split('/').pop()}`, { token: CT, method: 'POST' })).status === 403);
  await wkr(`/${nowJob}/check-in`, {});
  await mgr(`/work-orders/${nowJob}/cancel`, { reason: 'Owner canceled' });
  const t = (await mgr(`/work-orders/${nowJob}`)).data.time;
  check('cancel closes the open check-in', t.on_site === false && t.entries.length === 2 && t.entries[1].method_out === 'system');

  // ---- photos
  const startNoWin = await wkr(`/${noWin}/start`, {});
  check('button start checks in', startNoWin.data.job?.status === 'in_progress' && (await wkr(`/${noWin}`)).data.on_site !== null);
  check('no window + started: code visible', (await wkr(`/${noWin}/access`, {})).data.code === '4821#');
  const up = await upload(WT, noWin, img, 'before', 'Panel');
  check('photo upload', up.status === 201 && up.data.photo.url.startsWith('/ops-photo/'));
  const got = await fetch(B + up.data.photo.url);
  const buf = Buffer.from(await got.arrayBuffer());
  const meta = await sharp(buf).metadata();
  check('served privately as WebP ≤1600 px, metadata stripped', got.status === 200 && got.headers.get('content-type') === 'image/webp' && meta.width === 1600 && !meta.exif, `${meta.width}x${meta.height} exif:${!!meta.exif}`);
  check('photo file is outside public/', !fs.existsSync(path.join(H.ROOT, 'public', 'uploads', 'ops')) && fs.existsSync(path.join(STORE, '1', String(noWin))));
  check('tampered photo URL refused', (await fetch(B + up.data.photo.url.replace(/s=./, 's=X'))).status === 403);
  check('expired photo URL refused', (await fetch(B + up.data.photo.url.replace(/e=\d+/, 'e=1000'))).status === 403);
  check('non-image refused (by type)', (await upload(WT, noWin, txt)).status === 400);
  check('non-image refused (octet-stream, by decoder)', (await upload(WT, noWin, txt, 'after', '', 'application/octet-stream')).status === 400);
  check('manager sees the photo on the order', (await mgr(`/work-orders/${noWin}`)).data.photos.length === 1);
  const up2 = await upload(WT, noWin, img, 'after');
  check('worker can remove own photo before submit', (await wkr(`/${noWin}/photos/${up2.data.photo.id}`, null, 'DELETE')).status === 200);
  await wkr(`/${noWin}/submit`, { notes: 'Done' });
  check('submit checks out', (await mgr(`/work-orders/${noWin}`)).data.time.on_site === false);
  check('photos locked after submit', (await wkr(`/${noWin}/photos/${up.data.photo.id}`, null, 'DELETE')).status === 409 && (await upload(WT, noWin, img)).status === 409);
  check('code hidden after submit', (await wkr(`/${noWin}/access`, {})).status === 403);

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };
  const board = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(board);
  await board.goto(B + '/company/demo-rentals/login');
  await board.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await board.goto(B + '/company/demo-rentals/ops');
  await board.waitForSelector('#access-rows tr');
  check('UI board: access table shows Seaside Villa code set', (await board.textContent('#access-rows')).includes('set'));
  await board.click('#access-rows tr:nth-child(2) button');
  await board.fill('#a-code', 'GATE 1290');
  await board.click('#access-form button[type=submit]');
  await board.waitForSelector('.notice.success');
  check('UI board: add code for Mountain Cabin', (await mgr('/access/2')).data.code === 'GATE 1290');
  await board.locator('.wo', { hasText: 'No window' }).first().click();
  await board.waitForSelector('#detail[open] .photos img');
  check('UI board: photos + time on site in the job dialog', (await board.locator('#detail .photos img').count()) === 1 && (await board.textContent('#detail')).includes('On site'));
  await board.keyboard.press('Escape');
  const sticker = await board.context().newPage(); watch(sticker);
  await sticker.goto(`${B}/company/demo-rentals/ops/qr/1`);
  await sticker.waitForSelector('#sticker:not([hidden]) svg');
  check('UI sticker page renders the QR + property', (await sticker.textContent('#prop')) === 'Seaside Villa' && (await sticker.textContent('#brand')).includes('Demo Rentals'));
  await sticker.emulateMedia({ media: 'print' });
  await sticker.screenshot({ path: H.OUT + '/ops-qr-sticker.png' });
  check('UI sticker print hides the buttons + theme switch', !(await sticker.isVisible('.bar')) && !(await sticker.isVisible('.sg-theme-toggle')));

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); watch(phone);
  const live = await mk({ title: 'Phone job', window_start: iso(-5 * MIN), window_end: iso(HOUR) });
  // scan before sign-in → sign in → continues the scan
  const stickerUrl = (await mgr('/access/1/qr')).data.url.replace(/^https?:\/\/[^/]+/, '');
  await phone.goto(B + stickerUrl);
  await phone.waitForURL(B + '/maint');
  await phone.fill('#email', 'tech@demorentals.com');
  await phone.fill('#password', 'tech1234');
  await phone.click('#email-form button[value=password]');
  await phone.waitForURL(u => u.pathname.startsWith('/maint/scan/'));
  await phone.waitForSelector('#result h1');
  const heading = await phone.textContent('#result h1');
  if (heading.includes('Which job')) await phone.locator('#result button', { hasText: 'Phone job' }).click();
  await phone.waitForFunction(() => /Checked in/.test(document.querySelector('#result h1')?.textContent || ''));
  check('UI scan: sign-in then check-in continues', true);
  await phone.click('a:has-text("Open the job")');
  await phone.waitForSelector('#v-job:not([hidden])');
  await phone.click('button:has-text("Show access code")');
  await phone.waitForFunction(() => document.querySelector('#code-box')?.textContent.includes('4821#'));
  check('UI worker: reveal access code', true);
  await phone.setInputFiles('#ph-file', img);
  await phone.click('#photo-form button[type=submit]');
  await phone.waitForSelector('.notice.success');
  check('UI worker: photo upload shows thumbnail', (await phone.locator('#job img').count()) >= 1);
  await phone.click('button:has-text("Check out")');
  await phone.waitForFunction(() => document.querySelector('.notice.success')?.textContent.includes('Checked out'));
  check('UI worker: check out button', (await mgr(`/work-orders/${live}`)).data.time.on_site === false);
  await phone.screenshot({ path: H.OUT + '/ops-worker-onsite.png', fullPage: true });
  const sw = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('UI worker: no horizontal scroll at 390px', sw <= 0, String(sw));

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  fs.rmSync(STORE, { recursive: true, force: true });
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s3 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
