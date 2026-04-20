/**
 * BĐS Survey App – Theme Toggle (Dark / Light)
 * Inject early in <head> to avoid FOUC.
 * The DOMContentLoaded handler injects the toggle button into .top-nav.
 */

(function () {
  // ── 1. Apply saved theme ASAP (before paint) ──────────────────
  var saved = localStorage.getItem('bds_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  // ── 2. Toggle logic ───────────────────────────────────────────
  function toggle() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('bds_theme', next);
    _updateBtn();
  }

  function _updateBtn() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? '☀️' : '🌙';
    btn.title    = isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối';
    btn.setAttribute('aria-pressed', String(!isDark));
  }

  // ── 3. Inject button when DOM is ready ────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.top-nav');
    if (!nav || document.getElementById('themeToggleBtn')) return;

    var btn = document.createElement('button');
    btn.id        = 'themeToggleBtn';
    btn.className = 'theme-toggle-btn';
    btn.addEventListener('click', toggle);
    nav.appendChild(btn);
    _updateBtn();
  });

  // Expose globally so other scripts can call if needed
  window.toggleTheme = toggle;
})();
