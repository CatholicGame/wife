/**
 * WorkspaceSwitcher – UI Panel
 * ============================
 * Panel chọn / switch / thêm / xóa workspace (Google Sheet).
 * Được gọi từ nút workspace trong top nav.
 */

const WorkspaceSwitcher = (() => {

  let _onSwitch = null; // callback sau khi switch

  // ── Render Panel ──────────────────────────────────────────────────────────────

  function open(onSwitchCallback) {
    _onSwitch = onSwitchCallback || null;
    document.getElementById('wsSwitcherPanel')?.remove();

    const workspaces = WorkspaceManager.getAll();
    const active     = WorkspaceManager.getActive();

    const panel = document.createElement('div');
    panel.id = 'wsSwitcherPanel';
    panel.innerHTML = `
      <div class="ws-panel-header">
        <span>🗂️ Danh sách Sheet</span>
        <button id="wsPanelClose" class="ws-panel-close">✕</button>
      </div>
      <div class="ws-panel-body" id="wsPanelBody">
        ${workspaces.length === 0 ? `
          <div class="ws-empty">Chưa có sheet nào. Hãy import sheet đầu tiên!</div>
        ` : workspaces.map(ws => _renderItem(ws, active)).join('')}
      </div>
      </div>
      <div class="ws-panel-footer" style="display:flex;gap:8px">
        <button class="ws-add-btn" id="wsBtnImport" style="flex:1;justify-content:center">
          <span>➕</span>
          <span>Import mới</span>
        </button>
        <button class="ws-add-btn" id="wsBtnRefresh" style="flex:1;justify-content:center;background:var(--bg-surface-elevated);border-color:var(--border);">
          <span>🔄</span>
          <span>Làm mới</span>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    _positionPanel(panel);
    _bindEvents(panel, workspaces, active);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('mousedown', function outside(e) {
        const trigger = document.getElementById('btnWorkspace');
        if (!panel.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
          panel.remove();
          document.removeEventListener('mousedown', outside);
        }
      });
    }, 50);
  }

  function _renderItem(ws, active) {
    const isActive = active && active.id === ws.id;
    const ago      = _timeAgo(ws.lastAccessed);
    return `
      <div class="ws-item${isActive ? ' ws-item-active' : ''}" data-ws-id="${ws.id}">
        <div class="ws-item-icon" style="background:${ws.color}20;border-color:${ws.color}40;">
          ${ws.icon}
        </div>
        <div class="ws-item-info">
          <div class="ws-item-name">${_esc(ws.name)}</div>
          <div class="ws-item-meta">${_esc(ws.sheetName)} · ${ago}</div>
        </div>
        <div class="ws-item-actions">
          ${isActive ? '<span class="ws-active-dot">✓</span>' : ''}
          <button class="ws-item-edit" data-ws-edit="${ws.id}" title="Đổi tên/icon">✏️</button>
          <button class="ws-item-del" data-ws-del="${ws.id}" title="Xóa workspace">🗑️</button>
        </div>
      </div>
    `;
  }

  function _positionPanel(panel) {
    const trigger = document.getElementById('btnWorkspace');
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      panel.style.top  = (rect.bottom + 6) + 'px';
      panel.style.left = rect.left + 'px';
    } else {
      panel.style.top  = '60px';
      panel.style.left = '12px';
    }
    // Clamp right edge
    const panelW = 320;
    const maxLeft = window.innerWidth - panelW - 12;
    if (parseFloat(panel.style.left) > maxLeft) {
      panel.style.left = maxLeft + 'px';
    }
  }

  function _bindEvents(panel, workspaces, active) {
    panel.querySelector('#wsPanelClose')?.addEventListener('click', () => panel.remove());

    // Click workspace item → switch
    panel.querySelector('#wsPanelBody')?.addEventListener('click', async (e) => {
      // Edit
      const editId = e.target.closest('[data-ws-edit]')?.dataset.wsEdit;
      if (editId) { e.stopPropagation(); _openEditModal(editId, panel); return; }

      // Delete
      const delId = e.target.closest('[data-ws-del]')?.dataset.wsDel;
      if (delId) { e.stopPropagation(); _confirmDelete(delId, panel); return; }

      // Switch
      const item = e.target.closest('[data-ws-id]');
      if (!item) return;
      const wsId = item.dataset.wsId;
      if (active && wsId === active.id) { panel.remove(); return; }

      panel.remove();
      WorkspaceManager.switchTo(wsId);
      if (_onSwitch) await _onSwitch(wsId);
    });

    // Import new sheet
    panel.querySelector('#wsBtnImport')?.addEventListener('click', async () => {
      panel.remove();
      if (_onSwitch) await _onSwitch(null, 'import');
    });

    // Refresh data
    panel.querySelector('#wsBtnRefresh')?.addEventListener('click', async () => {
      panel.remove();
      if (window.loadData) await window.loadData(true);
    });
  }

  // ── Edit Modal ────────────────────────────────────────────────────────────────

  function _openEditModal(wsId, parentPanel) {
    const ws = WorkspaceManager.getAll().find(w => w.id === wsId);
    if (!ws) return;

    const icons = WorkspaceManager.DEFAULT_ICONS;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'wsEditModal';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:360px">
        <div class="modal-handle"></div>
        <h3 style="margin-bottom:var(--space-4)">✏️ Đổi tên Workspace</h3>
        <div class="form-group" style="margin-bottom:var(--space-3)">
          <label class="form-label">Tên hiển thị</label>
          <input type="text" class="form-control" id="wsEditName" value="${_esc(ws.name)}" placeholder="Tên workspace…">
        </div>
        <div class="form-group" style="margin-bottom:var(--space-4)">
          <label class="form-label">Icon</label>
          <div id="wsIconPicker" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
            ${icons.map(ic => `
              <button type="button" class="ws-icon-btn${ic === ws.icon ? ' selected' : ''}" data-icon="${ic}"
                style="width:36px;height:36px;font-size:1.3rem;border-radius:8px;border:2px solid ${ic === ws.icon ? ws.color : 'var(--border)'};background:${ic === ws.icon ? ws.color+'20' : 'var(--bg-surface)'};cursor:pointer;transition:all 0.15s">
                ${ic}
              </button>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-ghost btn-full" id="wsEditCancel">Hủy</button>
          <button class="btn btn-primary btn-full" id="wsEditSave">Lưu</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let selectedIcon = ws.icon;
    modal.querySelectorAll('.ws-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedIcon = btn.dataset.icon;
        modal.querySelectorAll('.ws-icon-btn').forEach(b => {
          b.classList.toggle('selected', b.dataset.icon === selectedIcon);
          b.style.border = b.dataset.icon === selectedIcon ? `2px solid ${ws.color}` : '2px solid var(--border)';
          b.style.background = b.dataset.icon === selectedIcon ? ws.color + '20' : 'var(--bg-surface)';
        });
      });
    });

    modal.querySelector('#wsEditCancel')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#wsEditSave')?.addEventListener('click', () => {
      const newName = modal.querySelector('#wsEditName').value.trim();
      if (!newName) return;
      WorkspaceManager.update(wsId, { name: newName, icon: selectedIcon });
      modal.remove();
      // Refresh panel
      parentPanel?.remove();
      open(_onSwitch);
      // Update nav badge
      _updateNavBadge();
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  // ── Delete Confirm ────────────────────────────────────────────────────────────

  function _confirmDelete(wsId, parentPanel) {
    const all = WorkspaceManager.getAll();
    const ws = all.find(w => w.id === wsId);
    if (!ws) return;

    if (!confirm(`Xóa workspace "${ws.name}"?\nChỉ xóa khỏi danh sách — Google Sheet vẫn được giữ nguyên.`)) return;

    const active = WorkspaceManager.getActive();
    const wasActive = active && active.id === wsId;

    WorkspaceManager.remove(wsId);
    parentPanel?.remove();
    
    // Check if what's left
    const remaining = WorkspaceManager.getAll();
    if (remaining.length === 0) {
      // Clear data fully
      if (window.State) {
        window.State.rows = [];
        window.State.allRows = [];
        window.State.filtered = [];
        window.State.headers = [];
        window.State.colMap = {};
      }
      if (window.renderList) window.renderList();
      if (window.showConnectBanner) window.showConnectBanner();
      _updateNavBadge();
    } else {
      if (wasActive && _onSwitch) {
        // The active workspace was deleted, WorkspaceManager auto-switched to remaining[0].
        // We must trigger _onSwitch to reload data.
        _onSwitch(remaining[0].id).then(() => {
          open(_onSwitch);
          _updateNavBadge();
        });
      } else {
        open(_onSwitch);
        _updateNavBadge();
      }
    }
  }

  // ── Nav Badge ─────────────────────────────────────────────────────────────────

  function _updateNavBadge() {
    const ws = WorkspaceManager.getActive();
    const iconEl = document.getElementById('wsNavIcon');
    const nameEl = document.getElementById('wsNavName');
    if (iconEl) iconEl.textContent = ws?.icon || '📋';
    if (nameEl) nameEl.textContent = ws ? _truncate(ws.name, 14) : 'Sheet';
  }

  // ── Utils ─────────────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  function _timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 2) return 'Vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} ngày trước`;
    return new Date(ts).toLocaleDateString('vi-VN');
  }

  return { open, updateNavBadge: _updateNavBadge };
})();

window.WorkspaceSwitcher = WorkspaceSwitcher;
