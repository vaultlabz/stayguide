// 2026-10-08 13:20, G7 Ops stage 9: Ops add-on billing (Stripe subscription item, quantity sync, webhooks, gating, billing page)
const H = require('./helpers');
const http = require('http');
const Stripe = require('stripe');
const { spawn, execSync } = require('child_process');
const B = H.B;
const FAKE_PORT = Number(process.env.FAKE_STRIPE_PORT_S9 || 3929);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const killPort = p => { try { execSync(`lsof -ti tcp:${p} -sTCP:LISTEN | xargs kill 2>/dev/null`); } catch {} };
const WEBHOOK_SECRET = 'whsec_test_secret';

// ---------- fake Stripe (subscriptions with several items) ----------
const calls = [], subs = {};
let seq = 0;
const nid = p => `${p}_${++seq}`;
const now = () => Math.floor(Date.now() / 1000);
const parseForm = body => Object.fromEntries(body.split('&').filter(Boolean).map(part => { const [k, v = ''] = part.split('='); return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))]; }));
const item = (price, quantity) => ({ id: nid('si'), object: 'subscription_item', quantity, price: { id: price, recurring: { interval: 'month' } }, current_period_end: now() + 30 * 86400 });
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    // the SDK sends DELETE parameters in the query string
    const form = parseForm(req.method === 'DELETE' ? (req.url.split('?')[1] || '') : body);
    const url = req.url.split('?')[0];
    calls.push({ method: req.method, path: url, form });
    const send = (obj, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'POST' && url === '/v1/customers') return send({ id: nid('cus'), object: 'customer' });
    if (req.method === 'POST' && url === '/v1/checkout/sessions') return send({ id: nid('cs'), object: 'checkout.session', url: `http://localhost:${FAKE_PORT}/pay` });
    let m = url.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (m && req.method === 'GET') return subs[m[1]] ? send(subs[m[1]]) : send({ error: { message: 'No such subscription' } }, 404);
    if (req.method === 'POST' && url === '/v1/subscription_items') {
      const s = subs[form.subscription];
      if (!s) return send({ error: { message: 'No such subscription' } }, 404);
      const it = item(form.price, Number(form.quantity));
      s.items.data.push(it);
      return send(it);
    }
    m = url.match(/^\/v1\/subscription_items\/([^/]+)$/);
    if (m && req.method === 'POST') {
      for (const s of Object.values(subs)) for (const it of s.items.data) if (it.id === m[1]) { it.quantity = Number(form.quantity); return send(it); }
      return send({ error: { message: 'No such item' } }, 404);
    }
    if (m && req.method === 'DELETE') {
      for (const s of Object.values(subs)) { const i = s.items.data.findIndex(it => it.id === m[1]); if (i >= 0) { s.items.data.splice(i, 1); return send({ id: m[1], object: 'subscription_item', deleted: true }); } }
      return send({ error: { message: 'No such item' } }, 404);
    }
    send({ error: { message: `fake stripe: unhandled ${req.method} ${url}` } }, 404);
  });
});
const signer = new Stripe('sk_test_fake');
let ev = 0;
async function webhook(type, object) {
  const payload = JSON.stringify({ id: `evt_s9_${++ev}`, object: 'event', type, data: { object } });
  const r = await fetch(B + '/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) }, body: payload });
  return r.status;
}

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  killPort(FAKE_PORT);
  await new Promise(r => fake.listen(FAKE_PORT, r));
  const env = { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', OPS_SCHEDULER: 'off', APP_BASE_URL: '', STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_API_HOST: 'localhost', STRIPE_API_PORT: String(FAKE_PORT), STRIPE_API_PROTOCOL: 'http', STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m', STRIPE_PRICE_OPS_MONTHLY: 'price_ops_m', OPS_PRICE_MONTHLY: '5' };
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const J = { 'content-type': 'application/json' };
  const call = async (p, token, method = 'GET', body) => { const r = await fetch(B + p, { method, headers: { ...J, Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

  // ---- a self-serve Pro customer
  const su = await (await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'Harbor Homes', first_name: 'Lee', last_name: 'Park', email: 'lee@harbor.test', password: 'harbor-pass-1' }) })).json();
  const T = su.token, C = `/company/${su.company.slug}`;
  await call(`${C}/properties`, T, 'POST', { name: 'Dock House', slug: 'dock-house' });
  let st = (await call(`${C}/billing/status`, T)).data;
  check('free plan: Ops shown for sale but not addable', st.ops.for_sale === true && st.ops.can_add === false && st.ops.price_per_property === 5);
  check('free plan: add refused', (await call(`${C}/billing/ops`, T, 'POST', { enable: true })).status === 409);
  await call(`${C}/billing/checkout`, T, 'POST', { plan: 'pro', interval: 'month' });
  const customer = calls.filter(c => c.path === '/v1/checkout/sessions').pop().form.customer;
  const sub = { id: nid('sub'), object: 'subscription', customer, status: 'active', cancel_at_period_end: false, metadata: { company_id: String(su.company.id), plan: 'pro', interval: 'month' }, items: { object: 'list', data: [item('price_pro_m', 1)] } };
  subs[sub.id] = sub;
  await webhook('checkout.session.completed', { id: 'cs_s9', object: 'checkout.session', mode: 'subscription', customer, subscription: sub.id, client_reference_id: String(su.company.id), payment_status: 'paid', metadata: { company_id: String(su.company.id), plan: 'pro', interval: 'month' } });
  st = (await call(`${C}/billing/status`, T)).data;
  check('Pro monthly: Ops can be added ($5 × 1)', st.plan === 'pro' && st.ops.can_add === true && st.ops.monthly_cost === 5 && st.ops.enabled === false, JSON.stringify(st.ops));
  check('Ops pages locked before buying (402)', (await call(`${C}/ops/team`, T)).status === 402);

  // ---- add
  const add = await call(`${C}/billing/ops`, T, 'POST', { enable: true });
  const created = calls.filter(c => c.method === 'POST' && c.path === '/v1/subscription_items').pop();
  check('add Ops → Stripe item (price, qty 1, prorated)', add.status === 200 && created?.form.price === 'price_ops_m' && created.form.quantity === '1' && created.form.proration_behavior === 'create_prorations' && created.form.subscription === sub.id);
  check('Ops unlocked', (await call(`${C}/ops/team`, T)).status === 200 && (await call(`${C}/billing/status`, T)).data.ops.enabled === true);
  check('adding twice does not duplicate the item', (await call(`${C}/billing/ops`, T, 'POST', { enable: true })).status === 200 && sub.items.data.filter(i => i.price.id === 'price_ops_m').length === 1);

  // ---- a new property updates both items separately
  await call(`${C}/properties`, T, 'POST', { name: 'Pier Loft', slug: 'pier-loft' });
  // the sync runs after the response (mock database adds delays): wait for it
  for (let i = 0; i < 50 && !sub.items.data.every(it => it.quantity === 2); i++) await sleep(100);
  const qty = Object.fromEntries(sub.items.data.map(i => [i.price.id, i.quantity]));
  check('property added → Pro qty 2 and Ops qty 2', qty.price_pro_m === 2 && qty.price_ops_m === 2, JSON.stringify(qty));

  // ---- removed in the Stripe Portal → webhook turns Ops off
  const opsIt = sub.items.data.find(i => i.price.id === 'price_ops_m');
  sub.items.data = sub.items.data.filter(i => i !== opsIt);
  check('subscription.updated without the Ops item accepted', (await webhook('customer.subscription.updated', sub)) === 200);
  check('→ Ops off', (await call(`${C}/ops/team`, T)).status === 402 && (await call(`${C}/billing/status`, T)).data.ops.on_record === false);
  check('plan item still read correctly (interval month)', (await call(`${C}/billing/status`, T)).data.interval === 'month');

  // ---- add again, then remove from the billing page API
  await call(`${C}/billing/ops`, T, 'POST', { enable: true });
  check('re-added', (await call(`${C}/ops/team`, T)).status === 200);
  const rm = await call(`${C}/billing/ops`, T, 'POST', { enable: false });
  check('remove → Stripe item deleted with proration credit', rm.status === 200 && calls.some(c => c.method === 'DELETE' && c.path.startsWith('/v1/subscription_items/') && c.form.proration_behavior === 'create_prorations'));
  check('→ Ops off after removing', (await call(`${C}/ops/team`, T)).status === 402);

  // ---- subscription canceled → Ops off even if it was on
  await call(`${C}/billing/ops`, T, 'POST', { enable: true });
  check('subscription deleted accepted', (await webhook('customer.subscription.deleted', sub)) === 200);
  check('canceled plan → Ops off', (await call(`${C}/ops/team`, T)).status === 402);

  // ---- invoiced (legacy) accounts and validation
  const D = (await (await fetch(B + '/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json()).token;
  const dst = (await call('/company/demo-rentals/billing/status', D)).data.ops;
  check('invoiced account: on, managed by StayGuide', dst.enabled === true && dst.invoiced === true && dst.can_add === false);
  check('invoiced account: self-serve remove refused', (await call('/company/demo-rentals/billing/ops', D, 'POST', { enable: false })).status === 409);
  check('bad body → 400', (await call(`${C}/billing/ops`, T, 'POST', {})).status === 400);
  check('other company → 403', (await call('/company/demo-rentals/billing/ops', T, 'POST', { enable: true })).status === 403);
  const AT = (await (await fetch(B + '/admin/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@stayguide.com', password: 'admin123' }) })).json()).token;
  check('admin metrics show the price', (await call('/admin/ops/metrics', AT)).data.price_per_property === 5);

  // ---- billing page UI
  const sub2 = { ...sub, id: nid('sub'), status: 'active', items: { object: 'list', data: [item('price_pro_m', 2)] } };
  subs[sub2.id] = sub2;
  await webhook('checkout.session.completed', { id: 'cs_s9b', object: 'checkout.session', mode: 'subscription', customer, subscription: sub2.id, client_reference_id: String(su.company.id), payment_status: 'paid', metadata: { company_id: String(su.company.id), plan: 'pro', interval: 'month' } });
  const browser = await H.launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${B}${C}/login`);
  await page.evaluate(t => localStorage.setItem('stayguide_token', t), T);
  await page.goto(`${B}${C}/billing`);
  await page.waitForSelector('#ops-add');
  check('UI: Ops card shows price and Add', (await page.textContent('#ops-card')).includes('$5 per property / month'));
  await page.click('#ops-add');
  await page.waitForSelector('#ops-remove');
  check('UI: Add → On with Remove', (await page.textContent('#ops-card')).includes('On') && (await call(`${C}/ops/team`, T)).status === 200);
  await page.screenshot({ path: H.OUT + '/ops-billing.png', fullPage: true });
  await page.click('#ops-remove');
  await page.waitForSelector('#ops-add');
  check('UI: Remove → Add again', (await call(`${C}/ops/team`, T)).status === 402);

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  killPort(H.PORT); fake.close(); killPort(FAKE_PORT);
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s9 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); killPort(H.PORT); killPort(FAKE_PORT); process.exit(1); });
