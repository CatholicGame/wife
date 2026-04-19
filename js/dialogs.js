/**
 * Custom Dialog Utility – thay thế prompt() và confirm() native
 * Dùng: await showPrompt(title, placeholder)   → string | null
 *       await showConfirm(title, message)       → true | false
 */

(function () {
  const STYLES = `
    .app-dialog-backdrop {
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      backdrop-filter: blur(4px);
      animation: dlg-fade-in 0.15s ease;
    }
    @keyframes dlg-fade-in { from { opacity:0 } to { opacity:1 } }

    .app-dialog {
      background: var(--bg-card, #161b22);
      border: 1px solid var(--border, #30363d);
      border-radius: 16px;
      padding: 28px 24px 20px;
      width: 100%; max-width: 360px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
      animation: dlg-slide-up 0.18s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes dlg-slide-up { from { transform:translateY(20px); opacity:0 } to { transform:none; opacity:1 } }

    .app-dialog-icon {
      font-size: 2rem; text-align: center; margin-bottom: 8px;
    }
    .app-dialog-title {
      font-size: 1.05rem; font-weight: 700; color: var(--text-primary, #e6edf3);
      text-align: center; margin-bottom: 6px;
    }
    .app-dialog-msg {
      font-size: 0.85rem; color: var(--text-secondary, #8b949e);
      text-align: center; margin-bottom: 20px; line-height: 1.5;
    }
    .app-dialog-input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input, #0d1117);
      border: 1.5px solid var(--border, #30363d);
      border-radius: 10px;
      color: var(--text-primary, #e6edf3);
      font-size: 0.95rem; padding: 10px 14px;
      outline: none; margin-bottom: 20px;
      transition: border-color .15s;
    }
    .app-dialog-input:focus { border-color: var(--accent, #00e5cc); }

    .app-dialog-actions {
      display: flex; gap: 10px;
    }
    .app-dialog-btn {
      flex: 1; padding: 10px 0;
      border: none; border-radius: 10px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer;
      transition: opacity .15s, transform .1s;
    }
    .app-dialog-btn:active { transform: scale(0.97); }
    .app-dialog-btn.cancel {
      background: var(--bg-surface, #21262d);
      color: var(--text-secondary, #8b949e);
    }
    .app-dialog-btn.cancel:hover { opacity: 0.8; }
    .app-dialog-btn.confirm {
      background: var(--accent, #00e5cc);
      color: #0d1117;
    }
    .app-dialog-btn.confirm:hover { opacity: 0.88; }
    .app-dialog-btn.danger {
      background: #da3633;
      color: #fff;
    }
    .app-dialog-btn.danger:hover { opacity: 0.88; }
  `;

  // Inject styles once
  if (!document.getElementById('app-dialog-styles')) {
    const s = document.createElement('style');
    s.id = 'app-dialog-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  /**
   * showPrompt(title, placeholder?, defaultValue?) → Promise<string|null>
   */
  window.showPrompt = function (title, placeholder = '', defaultValue = '') {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'app-dialog-backdrop';
      backdrop.innerHTML = `
        <div class="app-dialog" role="dialog" aria-modal="true">
          <div class="app-dialog-title">${title}</div>
          <input class="app-dialog-input" type="text"
            placeholder="${placeholder}" value="${defaultValue}" autocomplete="off">
          <div class="app-dialog-actions">
            <button class="app-dialog-btn cancel" id="_dlgCancel">Hủy</button>
            <button class="app-dialog-btn confirm" id="_dlgOk">Xác nhận</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const input = backdrop.querySelector('.app-dialog-input');
      const okBtn = backdrop.querySelector('#_dlgOk');
      const cancelBtn = backdrop.querySelector('#_dlgCancel');

      setTimeout(() => input.focus(), 80);

      function finish(value) {
        backdrop.style.opacity = '0';
        backdrop.style.transition = 'opacity .12s';
        setTimeout(() => backdrop.remove(), 130);
        resolve(value);
      }

      okBtn.addEventListener('click', () => finish(input.value.trim() || null));
      cancelBtn.addEventListener('click', () => finish(null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value.trim() || null);
        if (e.key === 'Escape') finish(null);
      });
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
    });
  };

  /**
   * showConfirm(title, message?, danger?) → Promise<boolean>
   *   danger=true → confirm button màu đỏ
   */
  window.showConfirm = function (title, message = '', danger = false) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'app-dialog-backdrop';
      backdrop.innerHTML = `
        <div class="app-dialog" role="dialog" aria-modal="true">
          <div class="app-dialog-icon">${danger ? '⚠️' : '❓'}</div>
          <div class="app-dialog-title">${title}</div>
          ${message ? `<div class="app-dialog-msg">${message}</div>` : ''}
          <div class="app-dialog-actions">
            <button class="app-dialog-btn cancel" id="_dlgCancel">Hủy</button>
            <button class="app-dialog-btn ${danger ? 'danger' : 'confirm'}" id="_dlgOk">
              ${danger ? '🗑️ Xóa' : 'Xác nhận'}
            </button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      function finish(val) {
        backdrop.style.opacity = '0';
        backdrop.style.transition = 'opacity .12s';
        setTimeout(() => backdrop.remove(), 130);
        resolve(val);
      }

      backdrop.querySelector('#_dlgOk').addEventListener('click', () => finish(true));
      backdrop.querySelector('#_dlgCancel').addEventListener('click', () => finish(false));
      backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(false); });
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
      backdrop.querySelector('#_dlgOk').focus();
    });
  };
})();
