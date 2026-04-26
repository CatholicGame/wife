/**
 * BĐS Survey App – Theme Toggle (Dark / Light)
 * Inject early in <head> to avoid FOUC.
 * Auto-injects toggle button into .top-nav, or as floating FAB if nav absent.
 */

(function () {
  // ── 1. Apply saved theme ASAP (before paint) ──────────────────
  var saved = localStorage.getItem('bds_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  _updateMetaThemeColor(saved);

  // ── 2. Theme color utilities ───────────────────────────────────
  function _updateMetaThemeColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#f0f4f8' : '#0d1117');
    }
  }

  // ── 3. Toggle logic ───────────────────────────────────────────
  function toggle() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('bds_theme', next);
    _updateMetaThemeColor(next);
    _updateBtn();
  }

  function _updateBtn() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML  = isDark ? '☀️' : '🌙';
    btn.title      = isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(!isDark));
  }

  // ── 4. Create button element ───────────────────────────────────
  function _createBtn() {
    var btn = document.createElement('button');
    btn.id        = 'themeToggleBtn';
    btn.className = 'theme-toggle-btn';
    btn.type      = 'button';
    btn.addEventListener('click', toggle);
    return btn;
  }

  // ── 5. Inject button when DOM is ready ────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // Don't inject twice
    if (document.getElementById('themeToggleBtn')) {
      _updateBtn();
      return;
    }

    var btn = _createBtn();
    var nav = document.querySelector('.top-nav');

    if (nav) {
      // Insert as the last child of nav (flex item)
      nav.appendChild(btn);
    } else {
      // Fallback: floating button for pages without top-nav (e.g. detail.html hero)
      btn.style.cssText = [
        'position:fixed',
        'top:' + (12) + 'px',
        'right:12px',
        'z-index:500',
        'box-shadow:0 2px 12px rgba(0,0,0,0.3)',
      ].join(';');
      document.body.appendChild(btn);
    }

    _updateBtn();
  });

  // Expose globally so other scripts can call if needed
  window.toggleTheme = toggle;
})();
