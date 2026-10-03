// 2026-10-03 15:31, shared theme switcher: light / auto / dark, persisted in localStorage. Loaded synchronously in <head> so
// data-theme is set before first paint (no flash). Renders into [data-theme-toggle] or a floating control.
(function () {
  var KEY = 'stayguide_theme';
  var root = document.documentElement;
  function read() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } }
  function apply(mode) { if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode); }
  function save(mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} }
  apply(read());

  var ICONS = {
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  var LABELS = { light: 'Light', auto: 'Auto', dark: 'Dark' };

  function build() {
    var host = document.querySelector('[data-theme-toggle]');
    var wrap = document.createElement('div');
    wrap.className = 'sg-theme-toggle' + (host ? '' : ' sg-theme-floating');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Color theme');
    ['light', 'auto', 'dark'].forEach(function (mode) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = mode;
      b.title = LABELS[mode] + ' theme';
      b.setAttribute('aria-label', LABELS[mode] + ' theme');
      b.innerHTML = ICONS[mode] + '<span class="sg-label">' + LABELS[mode] + '</span>';
      b.addEventListener('click', function () { apply(mode); save(mode); mark(); });
      wrap.appendChild(b);
    });
    function mark() {
      var cur = read();
      Array.prototype.forEach.call(wrap.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === cur)); });
    }
    mark();
    (host || document.body).appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
