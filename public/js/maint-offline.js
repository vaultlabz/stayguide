// 2026-10-08 06:00, G7 Ops stage 5: offline queue, web push and install prompt for the worker app (/maint).
// Every update goes through SGOffline.send(). Online it is sent right away; without a connection it is saved in
// IndexedDB (photos included) and replayed in order when the phone is back online. Each update carries a UUID
// (X-Client-Op-Id) so a resend is never applied twice, and the phone time (X-Client-Created-At) for the job history.
(function () {
  'use strict';
  const DB_NAME = 'stayguide-maint';
  const STORE = 'outbox';
  const FAIL_KEY = 'stayguide_outbox_failures';
  let getToken = () => null, getUserId = () => null;
  let flushing = false;
  let installPrompt = null;

  // ---- IndexedDB ----
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
    });
  }
  const all = () => tx('readonly', s => s.getAll());
  const add = op => tx('readwrite', s => s.add(op));
  const remove = seq => tx('readwrite', s => s.delete(seq));

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));
  const emit = () => window.dispatchEvent(new CustomEvent('sg-outbox'));

  async function mine() {
    const uid = getUserId();
    return (await all().catch(() => [])).filter(op => op.userId === uid);
  }

  function build(op) {
    const headers = { Authorization: `Bearer ${getToken()}`, 'X-Client-Op-Id': op.opId, 'X-Client-Created-At': op.createdAt };
    let body;
    if (op.form) {
      body = new FormData();
      for (const [k, v] of op.form) body.append(k, v);
    } else if (op.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(op.json);
    }
    return fetch(op.path, { method: op.method, headers, body });
  }

  /**
   * Sends an update, or queues it when offline. Returns { ok, status, data } when sent, { queued: true } when saved.
   * `form` is an array of [name, value] pairs (File/Blob values allowed); `json` is a plain object.
   */
  async function send(path, { method = 'POST', json, form, label = 'Update', jobId = null } = {}) {
    const op = { opId: uuid(), createdAt: new Date().toISOString(), path, method, json, form, label, jobId, userId: getUserId() };
    // anything already waiting goes first, so updates keep their order
    if (navigator.onLine && (await mine()).length) await flush();
    if (!navigator.onLine || (await mine()).length) { await add(op); emit(); return { queued: true }; }
    try {
      const res = await build(op);
      const data = await res.json().catch(() => ({}));
      if (res.status >= 500 && res.status !== 503) throw new Error('server');
      if (res.status === 503 && res.headers.get('X-SG-Offline')) throw new Error('offline');
      return { ok: res.ok, status: res.status, data };
    } catch {
      await add(op); emit();
      return { queued: true };
    }
  }

  /** Replays this user's queued updates in order. Stops at the first network/server problem and tries again later. */
  async function flush() {
    if (flushing || !navigator.onLine || !getToken()) return;
    flushing = true;
    try {
      for (const op of await mine()) {
        let res;
        try { res = await build(op); } catch { break; }
        if (res.status >= 500 || (res.status === 409 && (await res.clone().json().catch(() => ({}))).retry)) break;
        if (res.status === 401 || res.status === 403) break; // signed out: keep it for after sign-in
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const failures = JSON.parse(localStorage.getItem(FAIL_KEY) || '[]');
          failures.push({ label: op.label, jobId: op.jobId, error: data.error || `Error ${res.status}`, at: op.createdAt });
          try { localStorage.setItem(FAIL_KEY, JSON.stringify(failures.slice(-20))); } catch {}
        }
        await remove(op.seq);
        emit();
      }
    } finally {
      flushing = false;
      emit();
    }
  }

  async function pending(jobId) {
    const ops = await mine();
    return jobId == null ? ops : ops.filter(op => op.jobId === jobId);
  }
  function failures() { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '[]'); } catch { return []; } }
  function clearFailures() { try { localStorage.removeItem(FAIL_KEY); } catch {} emit(); }
  async function discardMine() { for (const op of await mine()) await remove(op.seq); emit(); }

  // ---- service worker, cached data ----
  async function register() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('/maint-sw.js', { scope: '/maint' }); } catch (e) { console.error('Service worker registration failed:', e); return null; }
  }
  async function clearCachedData() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/maint');
      reg?.active?.postMessage({ type: 'clear-data' });
      if (window.caches) for (const k of await caches.keys()) if (k.startsWith('sgm-data-')) await caches.delete(k);
    } catch {}
  }

  // ---- web push ----
  const b64ToBytes = b64 => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  /** 'unsupported' | 'needs-install' (iPhone outside the home-screen app) | 'blocked' | 'on' | 'off' | 'server-off' */
  async function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !standalone() ? 'needs-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    const info = await fetch('/maint/api/push', { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).catch(() => null);
    if (!info?.enabled) return 'server-off';
    const reg = await navigator.serviceWorker.getRegistration('/maint');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  }

  async function enablePush() {
    const info = await fetch('/maint/api/push', { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
    if (!info.enabled) throw new Error('Notifications are not set up on this server yet.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the browser settings.');
    const reg = (await navigator.serviceWorker.getRegistration('/maint')) || (await register());
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(info.public_key) });
    const res = await fetch('/maint/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not turn on notifications');
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker?.getRegistration('/maint');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/maint/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }

  // ---- install ----
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; emit(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; emit(); });
  /** 'installed' | 'prompt' (Android/desktop Chrome) | 'ios' (Share → Add to Home Screen) | 'none' */
  function installState() {
    if (standalone()) return 'installed';
    if (installPrompt) return 'prompt';
    if (isIos()) return 'ios';
    return 'none';
  }
  async function install() {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    emit();
    return choice?.outcome === 'accepted';
  }

  function init(opts) {
    getToken = opts.token;
    getUserId = opts.userId;
    register();
    window.addEventListener('online', () => { emit(); flush(); });
    window.addEventListener('offline', emit);
    setInterval(() => { if (navigator.onLine) flush(); }, 30000);
  }

  window.SGOffline = { init, send, flush, pending, failures, clearFailures, discardMine, clearCachedData, pushState, enablePush, disablePush, installState, install };
})();
