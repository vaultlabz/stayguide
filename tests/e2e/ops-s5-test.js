// 2026-10-08 06:30, G7 Ops stage 5: idempotent replay + device time, web push (to a local fake push service), offline worker app
const H = require('./helpers');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

const api = async (p, { token, method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})), headers: res.headers };
};

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);

  // fake push service: records deliveries; endpoints ending in /gone answer 410 like a dead subscription
  const pushes = [];
  // web-push only speaks HTTPS: throwaway self-signed certificate for the fake service (the app server trusts it via NODE_TLS_REJECT_UNAUTHORIZED in this test only)
  const certDir = path.join(H.OUT, 'ops-s5-cert');
  fs.mkdirSync(certDir, { recursive: true });
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -days 1 -keyout "${certDir}/key.pem" -out "${certDir}/cert.pem"`, { stdio: 'ignore' });
  const pushServer = https.createServer({ key: fs.readFileSync(`${certDir}/key.pem`), cert: fs.readFileSync(`${certDir}/cert.pem`) }, (req, res) => {
    let size = 0;
    req.on('data', c => { size += c.length; });
    req.on('end', () => {
      pushes.push({ path: req.url, size, encoding: req.headers['content-encoding'] });
      res.writeHead(req.url.endsWith('/gone') ? 410 : 201); res.end();
    });
  }).listen(0);
  const pushBase = `https://127.0.0.1:${pushServer.address().port}`;
  const fakeSub = name => {
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    return { endpoint: `${pushBase}/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  };

  const STORE = path.join(H.OUT, 'ops-storage-s5');
  fs.rmSync(STORE, { recursive: true, force: true });
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock', OPS_STORAGE_DIR: STORE, PUSH_ALLOW_ANY_ENDPOINT: 'true', NODE_ENV: 'development', NODE_TLS_REJECT_UNAUTHORIZED: '0' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const img = path.join(H.OUT, 'ops-s5-photo.jpg');
  await sharp({ create: { width: 900, height: 700, channels: 3, background: '#c84' } }).jpeg().toFile(img);

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });

  // ---- idempotent replay + device time
  const job = (await mgr('/work-orders', { property_id: 2, title: 'Replay job', assignee_user_id: 3 })).data.work_order;
  const op = crypto.randomUUID();
  const twentyMinAgo = new Date(Date.now() - 20 * 60000).toISOString();
  const first = await api(`/maint/api/jobs/${job.id}/start`, { token: WT, method: 'POST', body: {}, headers: { 'X-Client-Op-Id': op, 'X-Client-Created-At': twentyMinAgo } });
  const again = await api(`/maint/api/jobs/${job.id}/start`, { token: WT, method: 'POST', body: {}, headers: { 'X-Client-Op-Id': op, 'X-Client-Created-At': twentyMinAgo } });
  check('first send applies', first.status === 200 && first.data.job.status === 'in_progress');
  check('resend returns the stored result (replayed)', again.status === 200 && again.headers.get('x-client-op-replayed') === '1' && again.data.job.status === 'in_progress');
  const d = (await mgr(`/work-orders/${job.id}`)).data;
  check('applied once (one started event, one check-in)', d.events.filter(e => e.action === 'started').length === 1 && d.time.entries.length === 1);
  check('check-in uses the phone time', Math.abs(new Date(d.time.entries[0].clock_in) - new Date(twentyMinAgo)) < 2000);
  check('event keeps the phone time', Math.abs(new Date(d.events.find(e => e.action === 'started').client_created_at) - new Date(twentyMinAgo)) < 2000);
  const future = await api(`/maint/api/jobs/${job.id}/comment`, { token: WT, method: 'POST', body: { note: 'future clock' }, headers: { 'X-Client-Op-Id': crypto.randomUUID(), 'X-Client-Created-At': new Date(Date.now() + 3600e3).toISOString() } });
  check('a future phone time is ignored', future.status === 200 && (await mgr(`/work-orders/${job.id}`)).data.events.find(e => e.note === 'future clock').client_created_at == null);
  check('invalid op id → 400', (await api(`/maint/api/jobs/${job.id}/comment`, { token: WT, method: 'POST', body: { note: 'x' }, headers: { 'X-Client-Op-Id': 'nope' } })).status === 400);
  const badOp = crypto.randomUUID();
  const bad1 = await api(`/maint/api/jobs/${job.id}/verify`, { token: WT, method: 'POST', body: {}, headers: { 'X-Client-Op-Id': badOp } });
  check('4xx results are stored too (no retry storm)', bad1.status === 404 && (await api(`/maint/api/jobs/${job.id}/verify`, { token: WT, method: 'POST', body: {}, headers: { 'X-Client-Op-Id': badOp } })).headers.get('x-client-op-replayed') === '1');
  const otherWorkerOp = await api(`/maint/api/jobs/${job.id}/comment`, { token: WT, method: 'POST', body: { note: 'scoped' }, headers: { 'X-Client-Op-Id': op } });
  check('an op id reused on another request is refused', otherWorkerOp.status === 400);

  // ---- web push
  const key = (await api('/maint/api/push', { token: WT })).data;
  check('push key available (dev keys)', key.enabled === true && typeof key.public_key === 'string' && key.public_key.length > 80);
  check('subscribe validation', (await api('/maint/api/push/subscribe', { token: WT, method: 'POST', body: { subscription: { endpoint: 'ftp://x', keys: {} } } })).status === 400);
  check('managers cannot subscribe here', (await api('/maint/api/push/subscribe', { token: CT, method: 'POST', body: { subscription: fakeSub('mgr') } })).status === 403);
  check('subscribe', (await api('/maint/api/push/subscribe', { token: WT, method: 'POST', body: { subscription: fakeSub('phone1') } })).status === 201);
  await api('/maint/api/push/subscribe', { token: WT, method: 'POST', body: { subscription: fakeSub('gone') } });
  check('two devices', (await api('/maint/api/push', { token: WT })).data.subscriptions === 2);
  const before = pushes.length;
  await mgr('/work-orders', { property_id: 1, title: 'Push me', assignee_user_id: 3 });
  for (let i = 0; i < 30 && pushes.length < before + 2; i++) await sleep(100);
  const sent = pushes.slice(before);
  check('assignment pushes to every device, encrypted', sent.length === 2 && sent.every(p => p.encoding === 'aes128gcm' && p.size > 100), JSON.stringify(sent));
  await sleep(200);
  check('dead subscription (410) removed', (await api('/maint/api/push', { token: WT })).data.subscriptions === 1);
  const b2 = pushes.length;
  await mgr(`/work-orders/${job.id}/comment`, { note: 'Bring the ladder' });
  for (let i = 0; i < 30 && pushes.length < b2 + 1; i++) await sleep(100);
  check('manager comment pushes to the worker', pushes.length === b2 + 1);
  await api('/maint/api/push/unsubscribe', { token: WT, method: 'POST', body: { endpoint: `${pushBase}/phone1` } });
  check('unsubscribe', (await api('/maint/api/push', { token: WT })).data.subscriptions === 0);

  // leave the replay job's site, otherwise "one check-in at a time" refuses the next start (correctly)
  await api(`/maint/api/jobs/${job.id}/check-out`, { token: WT, method: 'POST', body: {} });

  // ---- offline worker app
  const browser = await H.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  phone.on('pageerror', e => errors.push(e.message));
  phone.on('dialog', d => d.accept());
  const turn = (await mgr('/work-orders', { property_id: 1, title: 'Offline turnover', type: 'cleaning', assignee_user_id: 3, checklist_template_id: 2 })).data.work_order;
  await phone.goto(B + '/maint');
  await phone.evaluate(t => localStorage.setItem('stayguide_maint_token', t), WT);
  await phone.goto(B + '/maint');
  await phone.waitForSelector('#v-home:not([hidden])');
  await phone.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || false, null, { timeout: 15000 }).catch(() => {});
  await phone.reload(); // now controlled by the service worker, which caches /maint/api/*
  await phone.waitForSelector('#v-home:not([hidden])');
  check('service worker controls /maint', await phone.evaluate(() => !!navigator.serviceWorker.controller));
  check('manifest linked + phone card', (await phone.getAttribute('link[rel=manifest]', 'href')) === '/maint-manifest.json' && (await phone.textContent('#phone-card')).includes('This phone'));
  await phone.locator('#jobs button', { hasText: 'Offline turnover' }).click();
  await phone.waitForSelector('#v-job:not([hidden])');

  await ctx.setOffline(true);
  await phone.click('button:has-text("Start job")');
  await phone.waitForFunction(() => document.querySelector('#notices').textContent.includes('Saved on this phone'));
  check('offline: start is queued', (await phone.textContent('#net')).includes('1 update'));
  await phone.fill('#job-note', 'No signal in the basement');
  await phone.click('form:has(#job-note) button[type=submit]');
  await phone.waitForFunction(() => /2 updates/.test(document.querySelector('#net').textContent));
  await phone.setInputFiles('#ph-file', img).catch(() => {});
  const photoForm = await phone.$('#photo-form');
  if (photoForm) { await phone.click('#photo-form button[type=submit]'); await phone.waitForFunction(() => /3 updates/.test(document.querySelector('#net').textContent)); }
  check('offline: banner + waiting list on the job', (await phone.textContent('#net')).includes("You're offline") && (await phone.textContent('#job')).includes('Waiting to send'));
  check('nothing reached the server yet', (await mgr(`/work-orders/${turn.id}`)).data.work_order.status === 'assigned');
  await phone.reload();
  await phone.waitForSelector('#v-job:not([hidden]), #v-home:not([hidden])');
  check('offline reload: app and job load from the phone', (await phone.textContent('main')).includes('Offline turnover'));

  await ctx.setOffline(false);
  await phone.evaluate(() => window.dispatchEvent(new Event('online')));
  for (let i = 0; i < 60; i++) { if ((await mgr(`/work-orders/${turn.id}`)).data.events.some(e => e.action === 'photo_added')) break; await sleep(250); }
  const after = (await mgr(`/work-orders/${turn.id}`)).data;
  const acts = after.events.map(e => e.action).filter(a => ['started', 'commented', 'photo_added'].includes(a));
  check('back online: sent in order, once each', acts.join() === 'started,commented,photo_added', acts.join());
  check('device times kept on replayed events', after.events.filter(e => ['started', 'commented', 'photo_added'].includes(e.action)).every(e => e.client_created_at));
  check('photo arrived', after.photos.length === 1);
  await phone.waitForFunction(() => !/waiting to send/.test(document.querySelector('#net').textContent), null, { timeout: 10000 });
  check('banner clears after sending', !(await phone.textContent('#net')).includes('waiting'));

  // offline access code is refused locally (never cached)
  await ctx.setOffline(true);
  const reveal = await phone.$('button:has-text("Show access code")');
  if (reveal) { await reveal.click(); await phone.waitForFunction(() => document.querySelector('#notices').textContent.includes('need a connection')); }
  check('offline: access code needs a connection', !reveal || (await phone.textContent('#notices')).includes('need a connection'));
  await ctx.setOffline(false);

  // sign-out with nothing pending clears cached data
  await phone.click('#signout');
  await phone.waitForSelector('#v-email:not([hidden])');
  const cached = await phone.evaluate(async () => { const keys = await caches.keys(); let n = 0; for (const k of keys.filter(k => k.startsWith('sgm-data-'))) n += (await (await caches.open(k)).keys()).length; return n; });
  check('sign-out clears saved job data', cached === 0, String(cached));
  await phone.screenshot({ path: H.OUT + '/ops-offline.png', fullPage: true });

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  pushServer.close();
  fs.rmSync(certDir, { recursive: true, force: true });
  try { process.kill(-server.pid); } catch {}
  kill();
  fs.rmSync(STORE, { recursive: true, force: true });
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s5 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
