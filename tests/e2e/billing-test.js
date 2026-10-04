// 2026-10-03 23:06, G3 plans, entitlements, signup and Stripe Billing, against a local fake Stripe API.
// The real stripe SDK is pointed at the fake via STRIPE_API_HOST/PORT/PROTOCOL; webhooks are signed with the SDK's test helper.
const H = require('./helpers');
const http = require('http');
const Stripe = require('stripe');
const { spawn, execSync } = require('child_process');
const B = H.B;
const FAKE_PORT = Number(process.env.FAKE_STRIPE_PORT || 3919);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const killPort = p => { try { execSync(`lsof -ti tcp:${p} -sTCP:LISTEN | xargs kill 2>/dev/null`); } catch {} };
const WEBHOOK_SECRET = 'whsec_test_secret';
const PRICES = {
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m', STRIPE_PRICE_PRO_ANNUAL: 'price_pro_y', STRIPE_PRICE_PORTFOLIO_MONTHLY: 'price_port_m',
  STRIPE_PRICE_BUNDLE_DESK: 'price_bundle_desk', STRIPE_PRICE_BUNDLE_WALL: 'price_bundle_wall', STRIPE_PRICE_KIT_DESK: 'price_kit_desk', STRIPE_PRICE_KIT_WALL: 'price_kit_wall'
};

// ---------- fake Stripe ----------
const calls = [];
const subs = {};
let seq = 0;
const id = p => `${p}_${++seq}`;
const now = () => Math.floor(Date.now() / 1000);
function parseForm(body) {
  const out = {};
  for (const part of body.split('&').filter(Boolean)) {
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}
const makeSub = (customer, price, quantity, metadata, extra = {}) => {
  const sub = {
    id: id('sub'), object: 'subscription', customer, status: 'active', cancel_at_period_end: false, metadata,
    items: { object: 'list', data: [{ id: id('si'), quantity, price: { id: price, recurring: { interval: price === 'price_pro_y' ? 'year' : 'month' } }, current_period_end: now() + 30 * 86400 }] },
    ...extra
  };
  subs[sub.id] = sub;
  return sub;
};
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const form = parseForm(body);
    calls.push({ method: req.method, path: req.url, form });
    const send = (obj, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const meta = prefix => Object.fromEntries(Object.entries(form).filter(([k]) => k.startsWith(prefix + '[')).map(([k, v]) => [k.slice(prefix.length + 1, -1), v]));
    const url = req.url.split('?')[0];
    if (req.method === 'POST' && url === '/v1/customers') return send({ id: id('cus'), object: 'customer', email: form.email, metadata: meta('metadata') });
    if (req.method === 'POST' && url === '/v1/checkout/sessions') {
      const sid = id('cs');
      return send({ id: sid, object: 'checkout.session', mode: form.mode, url: `http://localhost:${FAKE_PORT}/pay/${sid}`, metadata: meta('metadata') });
    }
    if (req.method === 'POST' && url === '/v1/billing_portal/sessions') return send({ id: id('bps'), url: `http://localhost:${FAKE_PORT}/portal` });
    if (req.method === 'POST' && url === '/v1/subscriptions') {
      const sub = makeSub(form.customer, form['items[0][price]'], Number(form['items[0][quantity]']), meta('metadata'), { collection_method: form.collection_method });
      return send({ ...sub, latest_invoice: { id: id('in'), hosted_invoice_url: `http://localhost:${FAKE_PORT}/invoice/${sub.id}` } });
    }
    let m = url.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (m && req.method === 'GET') return subs[m[1]] ? send(subs[m[1]]) : send({ error: { message: 'No such subscription' } }, 404);
    m = url.match(/^\/v1\/subscription_items\/([^/]+)$/);
    if (m && req.method === 'POST') {
      for (const s of Object.values(subs)) for (const it of s.items.data) if (it.id === m[1]) { it.quantity = Number(form.quantity); return send(it); }
      return send({ error: { message: 'No such item' } }, 404);
    }
    if (url.startsWith('/pay/') || url === '/portal' || url.startsWith('/invoice/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<h1>Fake Stripe page</h1>'); }
    send({ error: { message: `fake stripe: unhandled ${req.method} ${url}` } }, 404);
  });
});

const signer = new Stripe('sk_test_fake');
let eventSeq = 0;
async function webhook(type, object, opts = {}) {
  const payload = JSON.stringify({ id: opts.id || `evt_${++eventSeq}`, object: 'event', type, data: { object } });
  const signature = opts.badSignature ? 't=1,v1=deadbeef' : signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(B + '/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
  return { status: r.status, body: await r.json() };
}

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  killPort(FAKE_PORT);
  await new Promise(r => fake.listen(FAKE_PORT, r));
  const env = { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', APP_BASE_URL: '', STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_HOST: 'localhost', STRIPE_API_PORT: String(FAKE_PORT), STRIPE_API_PROTOCOL: 'http', ...PRICES };
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const J = { 'content-type': 'application/json' };

  // ---- Signup
  const bad = await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'X', first_name: 'A', last_name: 'B', email: 'nope', password: 'short' }) });
  check('signup validation → 400', bad.status === 400);
  const dupe = await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'X', first_name: 'A', last_name: 'B', email: 'admin@demorentals.com', password: 'longenough1' }) });
  check('duplicate email → 409', dupe.status === 409);
  const su = await (await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'Sunset Stays!', first_name: 'Maya', last_name: 'Lopez', email: 'maya@sunset.test', password: 'sunset-pass-1' }) })).json();
  check('signup creates Free account + token', su.company && su.company.slug === 'sunset-stays' && su.company.plan === 'free' && !!su.token, JSON.stringify(su.company));
  const login = await (await fetch(B + `/company/${su.company.slug}/login`, { method: 'POST', headers: J, body: JSON.stringify({ email: 'maya@sunset.test', password: 'sunset-pass-1' }) })).json();
  check('new account can log in', !!login.token);
  const A = { ...J, Authorization: 'Bearer ' + su.token };
  const C = B + `/company/${su.company.slug}`;
  const su2 = await (await fetch(B + '/api/signup', { method: 'POST', headers: J, body: JSON.stringify({ company_name: 'Sunset Stays', first_name: 'Ana', last_name: 'Diaz', email: 'ana@sunset2.test', password: 'sunset-pass-2' }) })).json();
  check('slug collision gets a unique suffix', /^sunset-stays-[0-9a-f]{6}$/.test(su2.company.slug), su2.company.slug);

  // ---- Free plan gating
  let r = await fetch(C + '/properties', { method: 'POST', headers: A, body: JSON.stringify({ name: 'Beach Hut', slug: 'beach-hut', wifi_name: 'Hut', wifi_password: 'hutpass1' }) });
  check('Free: first property allowed', r.status === 201);
  r = await fetch(C + '/properties', { method: 'POST', headers: A, body: JSON.stringify({ name: 'Second', slug: 'second' }) });
  const limit = await r.json();
  check('Free: second property → 402 upgrade_required', r.status === 402 && limit.code === 'upgrade_required' && limit.feature === 'properties');
  r = await fetch(C + '/properties/beach-hut/devices/pairing-code', { method: 'POST', headers: A, body: '{}' });
  check('Free: tablet pairing → 402', r.status === 402);
  r = await fetch(C + '/properties/beach-hut/content/announcements', { method: 'POST', headers: A, body: JSON.stringify({ title: 'a', message: 'b' }) });
  check('Free: announcements → 402', r.status === 402);
  check('Free: restaurants allowed', (await fetch(C + '/properties/beach-hut/content/restaurants', { method: 'POST', headers: A, body: JSON.stringify({ name: 'Taco' }) })).status === 201);
  r = await fetch(C + '/properties/beach-hut', { method: 'PUT', headers: A, body: JSON.stringify({ tablet_background: 'baltic-rose' }) });
  check('Free: custom theme → 402', r.status === 402);
  r = await fetch(C + '/properties/beach-hut', { method: 'PUT', headers: A, body: JSON.stringify({ tablet_background: 'solid', tablet_theme: 'auto', description: 'cozy' }) });
  check('Free: default theme values still save', r.status === 200);
  const link = await (await fetch(C + '/properties/beach-hut/guest-link', { headers: A })).json();
  let gc = await (await fetch(link.url.replace(/^https?:\/\/[^/]+/, B) + '/content')).json();
  check('Free guide link: branding on', gc.show_branding === true);

  let st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('billing status: free, configured, 1 property', st.plan === 'free' && st.billing_configured === true && st.properties === 1 && st.billed_quantity === 0);
  check('other company cannot read billing → 403', (await fetch(B + '/company/demo-rentals/billing/status', { headers: A })).status === 403);

  // ---- Checkout
  check('bad plan → 400', (await fetch(C + '/billing/checkout', { method: 'POST', headers: A, body: JSON.stringify({ plan: 'gold' }) })).status === 400);
  check('portfolio annual → 400', (await fetch(C + '/billing/checkout', { method: 'POST', headers: A, body: JSON.stringify({ plan: 'portfolio', interval: 'year' }) })).status === 400);
  r = await fetch(C + '/billing/checkout', { method: 'POST', headers: A, body: JSON.stringify({ plan: 'pro', interval: 'month' }) });
  const co = await r.json();
  check('checkout returns Stripe URL', r.status === 200 && co.url.includes(`localhost:${FAKE_PORT}/pay/`), JSON.stringify(co));
  const sessCall = calls.filter(c => c.path === '/v1/checkout/sessions').pop();
  const f = sessCall.form;
  check('session: subscription, Pro monthly price, qty 1', f.mode === 'subscription' && f['line_items[0][price]'] === 'price_pro_m' && f['line_items[0][quantity]'] === '1');
  check('session: cards + ACH bank debit', f['allowed_payment_method_types[0]'] === 'card' && f['allowed_payment_method_types[1]'] === 'us_bank_account' && f['payment_method_options[us_bank_account][verification_method]'] === 'automatic');
  check('session: metadata + return URLs', f['metadata[company_id]'] === String(su.company.id) && f['subscription_data[metadata][plan]'] === 'pro' && f.success_url.endsWith('/billing?checkout=success'));
  check('customer created once and reused', calls.filter(c => c.path === '/v1/customers').length === 1);
  const customer = f.customer;

  // ---- Webhooks
  check('bad signature → 400', (await webhook('checkout.session.completed', {}, { badSignature: true })).status === 400);
  const sub = makeSub(customer, 'price_pro_m', 1, { company_id: String(su.company.id), kind: 'plan', plan: 'pro', interval: 'month' });
  const sessionObj = { id: 'cs_done', object: 'checkout.session', mode: 'subscription', customer, client_reference_id: String(su.company.id), subscription: sub.id, payment_status: 'paid', metadata: { company_id: String(su.company.id), kind: 'plan', plan: 'pro', interval: 'month' } };
  let wh = await webhook('checkout.session.completed', sessionObj, { id: 'evt_checkout_1' });
  check('checkout.session.completed accepted', wh.status === 200 && wh.body.duplicate === false);
  wh = await webhook('checkout.session.completed', sessionObj, { id: 'evt_checkout_1' });
  check('same event again → duplicate, ignored', wh.status === 200 && wh.body.duplicate === true);
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('company now Pro, active, renews', st.plan === 'pro' && st.status === 'active' && st.interval === 'month' && !!st.current_period_end && st.has_billing_account);
  check('second checkout blocked while subscribed → 409', (await fetch(C + '/billing/checkout', { method: 'POST', headers: A, body: JSON.stringify({ plan: 'pro' }) })).status === 409);

  // ---- Pro unlocks + quantity sync
  check('Pro: pairing allowed', (await fetch(C + '/properties/beach-hut/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).status === 201);
  check('Pro: custom theme allowed', (await fetch(C + '/properties/beach-hut', { method: 'PUT', headers: A, body: JSON.stringify({ tablet_background: 'rich-bistre' }) })).status === 200);
  gc = await (await fetch(link.url.replace(/^https?:\/\/[^/]+/, B) + '/content')).json();
  check('Pro guide link: branding off, theme kept', gc.show_branding === false && gc.property.tablet_background === 'rich-bistre');
  check('Pro: second property allowed', (await fetch(C + '/properties', { method: 'POST', headers: A, body: JSON.stringify({ name: 'Cliff House', slug: 'cliff-house' }) })).status === 201);
  await sleep(800);
  let upd = calls.filter(c => c.path.startsWith('/v1/subscription_items/')).pop();
  check('adding property → quantity 2 with proration', !!upd && upd.form.quantity === '2' && upd.form.proration_behavior === 'create_prorations', JSON.stringify(upd && upd.form));
  check('Pro: delete property', (await fetch(C + '/properties/cliff-house', { method: 'DELETE', headers: A })).status === 200);
  await sleep(800);
  upd = calls.filter(c => c.path.startsWith('/v1/subscription_items/')).pop();
  check('removing property → quantity 1, no refund mid-cycle', upd.form.quantity === '1' && upd.form.proration_behavior === 'none');

  // ---- Tablet works on Pro, past_due grace, then cancellation
  const pc = await (await fetch(C + '/properties/beach-hut/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).json();
  const dev = await (await fetch(B + '/device/pair', { method: 'POST', headers: J, body: JSON.stringify({ code: pc.code }) })).json();
  const devContent = () => fetch(B + '/device/content', { headers: { Authorization: 'Device ' + dev.token } });
  check('Pro tablet gets content', (await devContent()).status === 200);
  await webhook('customer.subscription.updated', { ...sub, status: 'past_due' });
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('past_due keeps Pro (grace)', st.plan === 'pro' && st.status === 'past_due' && (await devContent()).status === 200);
  await webhook('customer.subscription.updated', { ...sub, id: 'sub_someone_else', status: 'canceled' });
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('events for another subscription are ignored', st.status === 'past_due');
  await webhook('customer.subscription.deleted', { ...sub, status: 'canceled' });
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('cancelled → effective plan Free', st.plan === 'free' && st.subscribed_plan === 'pro' && st.status === 'canceled');
  r = await devContent();
  check('cancelled: tablet gets 402 subscription_required', r.status === 402 && (await r.json()).code === 'subscription_required');
  check('cancelled: pairing blocked again', (await fetch(C + '/properties/beach-hut/devices/pairing-code', { method: 'POST', headers: A, body: '{}' })).status === 402);
  gc = await (await fetch(link.url.replace(/^https?:\/\/[^/]+/, B) + '/content')).json();
  check('cancelled: guide link falls back to plain look', gc.property.tablet_background === 'solid' && gc.show_branding === true);

  // ---- Portal
  r = await fetch(C + '/billing/portal', { method: 'POST', headers: A });
  check('portal session URL', r.status === 200 && (await r.json()).url.endsWith('/portal'));

  // ---- Pay by invoice (bank transfer)
  r = await fetch(C + '/billing/invoice', { method: 'POST', headers: A, body: JSON.stringify({ plan: 'pro', interval: 'year' }) });
  const inv = await r.json();
  const subCall = calls.filter(c => c.path === '/v1/subscriptions' && c.method === 'POST').pop();
  check('invoice subscription: send_invoice, 14 days, bank transfer', r.status === 200 && subCall.form.collection_method === 'send_invoice' && subCall.form.days_until_due === '14' && subCall.form['payment_settings[payment_method_types][0]'] === 'customer_balance' && subCall.form['items[0][price]'] === 'price_pro_y');
  check('invoice URL returned + Pro active annual', inv.hosted_invoice_url && (await (await fetch(C + '/billing/status', { headers: A })).json()).interval === 'year');

  // ---- Hardware
  r = await fetch(C + '/billing/hardware', { method: 'POST', headers: A, body: JSON.stringify({ kit: 'desk', mode: 'purchase' }) });
  check('hardware purchase checkout', r.status === 200);
  const hw = calls.filter(c => c.path === '/v1/checkout/sessions').pop().form;
  check('hardware: payment mode, kit price, bank transfer + shipping', hw.mode === 'payment' && hw['line_items[0][price]'] === 'price_kit_desk' && hw['allowed_payment_method_types[2]'] === 'customer_balance' && hw['shipping_address_collection[allowed_countries][0]'] === 'US');
  check('bundle blocked while subscribed → 409', (await fetch(C + '/billing/hardware', { method: 'POST', headers: A, body: JSON.stringify({ kit: 'wall', mode: 'bundle' }) })).status === 409);
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  const order = st.hardware_orders[0];
  check('order recorded as pending', order && order.status === 'pending' && order.kit === 'desk');
  await webhook('checkout.session.completed', { id: order.stripe_checkout_session_id, object: 'checkout.session', mode: 'payment', customer, payment_status: 'paid', amount_total: 39900, metadata: { company_id: String(su.company.id), kind: 'hardware', kit: 'desk', mode: 'purchase' }, shipping_details: { name: 'Maya Lopez', address: { city: 'Santa Monica' } } });
  st = await (await fetch(C + '/billing/status', { headers: A })).json();
  check('paid webhook → order paid with amount', st.hardware_orders[0].status === 'paid' && Number(st.hardware_orders[0].amount_total) === 399);
  const sa = await (await fetch(B + '/admin/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@stayguide.com', password: 'admin123' }) })).json();
  const SA = { ...J, Authorization: 'Bearer ' + sa.token };
  const orders = await (await fetch(B + '/admin/hardware-orders', { headers: SA })).json();
  check('admin sees orders', orders.orders.length >= 1);
  check('admin marks shipped', (await fetch(B + `/admin/hardware-orders/${order.id}`, { method: 'PUT', headers: SA, body: JSON.stringify({ status: 'shipped' }) })).status === 200);
  check('company admin cannot list all orders → 403', (await fetch(B + '/admin/hardware-orders', { headers: A })).status === 403);

  // ---- Legacy grandfathering
  const demo = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  const ds = await (await fetch(B + '/company/demo-rentals/billing/status', { headers: { Authorization: 'Bearer ' + demo.token } })).json();
  check('existing company grandfathered as Pro (legacy)', ds.plan === 'pro' && ds.status === 'legacy');

  // ---- Browser: billing page + signup page
  const browser = await H.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(B + '/signup?plan=pro');
  check('signup page mentions chosen plan', (await page.textContent('#plan-note')).includes('Pro'));
  await page.fill('#company_name', 'Harbor Homes');
  await page.fill('#first_name', 'Lee'); await page.fill('#last_name', 'Park');
  await page.fill('#email', 'lee@harbor.test'); await page.fill('#password', 'harbor-pass-1');
  await page.click('#signupBtn');
  await page.waitForURL(/\/company\/harbor-homes\/billing\?upgrade=pro/, { timeout: 10000 });
  await page.waitForSelector('[data-checkout="pro"]');
  check('signup → billing page with welcome notice', (await page.textContent('#notices')).includes('Welcome'));
  check('billing page shows Free as current', (await page.textContent('#current-plan')) === 'Free');
  await page.click('.interval button[data-interval="year"]');
  check('annual toggle shows $89 / property / year', (await page.textContent('.plan[aria-label="Pro plan"] .price')).includes('$89'));
  await page.screenshot({ path: H.OUT + '/g3-billing-free.png', fullPage: true });
  await Promise.all([page.waitForURL(new RegExp(`localhost:${FAKE_PORT}/pay/`), { timeout: 10000 }), page.click('[data-checkout="pro"]')]);
  const annualCall = calls.filter(c => c.path === '/v1/checkout/sessions').pop().form;
  check('browser Choose Pro (annual) → redirected to Stripe checkout', annualCall['line_items[0][price]'] === 'price_pro_y');
  await page.goto(B + '/company/harbor-homes/dashboard');
  await page.waitForFunction(() => document.getElementById('monthly-cost').textContent.startsWith('$'), null, { timeout: 10000 });
  check('dashboard monthly cost no longer NaN', (await page.textContent('#monthly-cost')) === '$0.00');
  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  killPort(H.PORT);

  // ---- Billing not configured → 503 (separate server without keys)
  const env2 = { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', STRIPE_SECRET_KEY: '' };
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: env2, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const dl = await (await fetch(B + '/company/demo-rentals/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@demorentals.com', password: 'demo123' }) })).json();
  r = await fetch(B + '/company/demo-rentals/billing/checkout', { method: 'POST', headers: { ...J, Authorization: 'Bearer ' + dl.token }, body: JSON.stringify({ plan: 'pro' }) });
  check('no Stripe key → 503 billing not configured', r.status === 503);
  const s2 = await (await fetch(B + '/company/demo-rentals/billing/status', { headers: { Authorization: 'Bearer ' + dl.token } })).json();
  check('status reports billing_configured=false', s2.billing_configured === false);

  killPort(H.PORT); fake.close();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} billing checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); killPort(H.PORT); killPort(FAKE_PORT); process.exit(1); });
