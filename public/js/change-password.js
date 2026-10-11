// 2026-10-09 12:20, #56 "Change password" for the admin and company dashboards. Usage:
//   <button type="button" data-change-password="stayguide_admin_token">Password</button>
//   <script src="/js/change-password.js"></script>
// The attribute names the localStorage key holding this dashboard's session. On success the fresh token replaces it and
// the page reloads (the server signs out every older session, including the one this page started with).
(function () {
  const css = `
    .sg-pw-dialog { margin: auto; border: 0; border-radius: var(--radius-lg, 12px); padding: 1.5rem; width: min(380px, calc(100vw - 32px));
      background: var(--surface, #fff); color: var(--text, #111); box-shadow: var(--shadow-lg, 0 20px 40px rgba(0,0,0,.2)); }
    .sg-pw-dialog::backdrop { background: rgba(0,0,0,.45); }
    .sg-pw-dialog h3 { margin: 0 0 1rem; font-size: 1.125rem; }
    .sg-pw-dialog label { display: block; margin: 0 0 .35rem; font-weight: 500; font-size: .875rem; }
    .sg-pw-dialog input { width: 100%; box-sizing: border-box; padding: .6rem; margin: 0 0 .9rem; border: 1px solid var(--border-strong, #ccc);
      border-radius: var(--radius-sm, 6px); font: inherit; background: var(--surface, #fff); color: inherit; }
    .sg-pw-dialog .sg-pw-msg { padding: .6rem; border-radius: var(--radius-sm, 6px); margin: 0 0 .9rem; font-size: .875rem; }
    .sg-pw-dialog .sg-pw-msg.err { background: var(--danger-bg, #fde8e8); color: var(--danger-text, #9b1c1c); }
    .sg-pw-dialog .sg-pw-msg.ok { background: var(--success-bg, #e7f6ec); color: var(--success-text, #1e6b3a); }
    .sg-pw-dialog .sg-pw-actions { display: flex; gap: .5rem; justify-content: flex-end; }`;

  function open(tokenKey) {
    let dialog = document.getElementById('sg-pw-dialog');
    if (!dialog) {
      const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
      dialog = document.createElement('dialog');
      dialog.id = 'sg-pw-dialog'; dialog.className = 'sg-pw-dialog'; dialog.setAttribute('aria-labelledby', 'sg-pw-title');
      dialog.innerHTML = `
        <form id="sg-pw-form">
          <h3 id="sg-pw-title">Change password</h3>
          <div class="sg-pw-msg" id="sg-pw-msg" role="alert" hidden></div>
          <div id="sg-pw-fields">
            <label for="sg-pw-current">Current password</label>
            <input type="password" id="sg-pw-current" autocomplete="current-password" required>
            <label for="sg-pw-new">New password (8+ characters)</label>
            <input type="password" id="sg-pw-new" autocomplete="new-password" minlength="8" maxlength="128" required>
            <label for="sg-pw-confirm">Confirm new password</label>
            <input type="password" id="sg-pw-confirm" autocomplete="new-password" minlength="8" maxlength="128" required>
          </div>
          <div class="sg-pw-actions">
            <button type="button" class="btn btn-secondary" id="sg-pw-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="sg-pw-save">Change password</button>
          </div>
        </form>`;
      document.body.appendChild(dialog);
      dialog.querySelector('#sg-pw-cancel').addEventListener('click', () => dialog.close());
    }
    const form = dialog.querySelector('#sg-pw-form');
    const msg = dialog.querySelector('#sg-pw-msg');
    const save = dialog.querySelector('#sg-pw-save');
    const say = (text, ok) => { msg.textContent = text; msg.className = 'sg-pw-msg ' + (ok ? 'ok' : 'err'); msg.hidden = false; };
    form.reset(); msg.hidden = true; save.disabled = false;
    dialog.querySelector('#sg-pw-fields').hidden = false;
    save.hidden = false;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const next = dialog.querySelector('#sg-pw-new').value;
      if (next !== dialog.querySelector('#sg-pw-confirm').value) return say('The two new passwords do not match.');
      save.disabled = true;
      try {
        const res = await fetch('/account/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem(tokenKey) || '') },
          body: JSON.stringify({ current_password: dialog.querySelector('#sg-pw-current').value, new_password: next })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not change the password.');
        try { localStorage.setItem(tokenKey, data.token); } catch {}
        say(data.message, true);
        dialog.querySelector('#sg-pw-fields').hidden = true;
        save.hidden = true;
        dialog.querySelector('#sg-pw-cancel').textContent = 'Done';
        dialog.addEventListener('close', () => location.reload(), { once: true });
      } catch (err) {
        say(err.message);
        save.disabled = false;
      }
    };
    dialog.querySelector('#sg-pw-cancel').textContent = 'Cancel';
    dialog.showModal();
    dialog.querySelector('#sg-pw-current').focus();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-change-password]');
    if (btn) open(btn.getAttribute('data-change-password'));
  });
})();
