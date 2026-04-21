/**
 * WorkspaceManager – Multi-Sheet Generic System
 * ================================================
 * Quản lý danh sách các Google Sheet đã import.
 * Mỗi workspace lưu config riêng (columns, hidden, colMapper, sortBy).
 * Hỗ trợ tự động migrate từ hệ thống cũ (bds_spreadsheet_id).
 */

const WorkspaceManager = (() => {
  const STORAGE_KEY   = 'bds_workspaces';
  const ACTIVE_KEY    = 'bds_active_workspace';
  const MIGRATED_KEY  = 'bds_ws_migrated_v1';

  // ── Emoji icons pool cho workspace ──────────────────────────────────────────
  const DEFAULT_ICONS  = ['📊','📋','📁','🗂️','📂','📌','🗃️','📑','🧾','📝'];
  const DEFAULT_COLORS = ['#00d4aa','#5b8af5','#f5a623','#b464ff','#e74c3c','#27ae60'];

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _save(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function _genId() {
    return 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function _randomIcon(existingIcons = []) {
    const pool = DEFAULT_ICONS.filter(i => !existingIcons.includes(i));
    return (pool.length ? pool : DEFAULT_ICONS)[Math.floor(Math.random() * (pool.length || DEFAULT_ICONS.length))];
  }

  function _randomColor(existingColors = []) {
    const pool = DEFAULT_COLORS.filter(c => !existingColors.includes(c));
    return (pool.length ? pool : DEFAULT_COLORS)[Math.floor(Math.random() * (pool.length || DEFAULT_COLORS.length))];
  }

  // ── Per-workspace storage key ────────────────────────────────────────────────

  /**
   * Trả về localStorage key riêng cho workspace hiện tại.
   * @param {string} suffix  Ví dụ: 'v2_columns', 'hidden_cols', 'col_mapper'
   */
  function storageKey(suffix) {
    const ws = getActive();
    const ns = ws ? ws.id : 'default';
    return `bds_${ns}_${suffix}`;
  }

  // ── Migration từ hệ thống cũ ─────────────────────────────────────────────────

  function migrate() {
    if (localStorage.getItem(MIGRATED_KEY)) return; // already migrated

    const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
    const sheetName     = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
    const spreadsheetNm = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME) || 'Sheet';

    if (spreadsheetId && sheetName) {
      const existing = _load();
      if (existing.length === 0) {
        // Tạo workspace đầu tiên từ data cũ
        const ws = {
          id:              _genId(),
          name:            spreadsheetNm,
          spreadsheetId,
          sheetName,
          icon:            '📊',
          color:           '#00d4aa',
          createdAt:       Date.now(),
          lastAccessed:    Date.now(),
        };
        _save([ws]);
        localStorage.setItem(ACTIVE_KEY, ws.id);

        // Migrate per-workspace keys từ global keys cũ
        _migrateGlobalKeys(ws.id);

        console.log('[WorkspaceManager] Migrated legacy sheet to workspace:', ws.id);
      }
    }

    localStorage.setItem(MIGRATED_KEY, '1');
  }

  /**
   * Copy các global keys cũ (bds_v2_columns, bds_v2_hidden_cols...) sang key mới của workspace
   */
  function _migrateGlobalKeys(wsId) {
    const MAP = {
      'bds_v2_columns':   `bds_${wsId}_v2_columns`,
      'bds_v2_hidden_cols': `bds_${wsId}_hidden_cols`,
      // ColMapper keys
      'bds_col_mapper':   `bds_${wsId}_col_mapper`,
      'bds_view_mode':    `bds_${wsId}_view_mode`,
      'bds_sort_by':      `bds_${wsId}_sort_by`,
    };
    Object.entries(MAP).forEach(([oldKey, newKey]) => {
      const val = localStorage.getItem(oldKey);
      if (val && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, val);
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Lấy toàn bộ danh sách workspace */
  function getAll() {
    return _load();
  }

  /** Lấy workspace đang active */
  function getActive() {
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (!activeId) return null;
    return _load().find(ws => ws.id === activeId) || null;
  }

  /**
   * Thêm workspace mới
   * @param {string} spreadsheetId
   * @param {string} sheetName
   * @param {string} displayName
   * @returns {object} workspace mới tạo
   */
  function add(spreadsheetId, sheetName, displayName) {
    const list = _load();
    // Check duplicate
    const dup = list.find(ws => ws.spreadsheetId === spreadsheetId && ws.sheetName === sheetName);
    if (dup) return dup;

    const ws = {
      id:           _genId(),
      name:         displayName || sheetName,
      spreadsheetId,
      sheetName,
      icon:         _randomIcon(list.map(w => w.icon)),
      color:        _randomColor(list.map(w => w.color)),
      createdAt:    Date.now(),
      lastAccessed: Date.now(),
    };
    list.push(ws);
    _save(list);
    return ws;
  }

  /**
   * Switch active workspace (không load data — caller phải tự gọi loadData)
   * @param {string} id
   */
  function switchTo(id) {
    const list = _load();
    const ws = list.find(w => w.id === id);
    if (!ws) return false;

    // Cập nhật lastAccessed
    ws.lastAccessed = Date.now();
    _save(list);

    localStorage.setItem(ACTIVE_KEY, id);

    // Sync các STORAGE legacy keys → để các phần code cũ vẫn đọc được
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_ID, ws.spreadsheetId);
    localStorage.setItem(APP_CONFIG.STORAGE.SHEET_NAME, ws.sheetName);
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME, ws.name);

    return true;
  }

  /**
   * Xóa workspace (KHÔNG xóa dữ liệu trên Google Sheet)
   * @param {string} id
   */
  function remove(id) {
    let list = _load();
    const idx = list.findIndex(ws => ws.id === id);
    if (idx < 0) return false;

    list.splice(idx, 1);
    _save(list);

    // Nếu xóa workspace đang active → switch sang cái khác
    if (localStorage.getItem(ACTIVE_KEY) === id) {
      if (list.length > 0) {
        switchTo(list[0].id);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
        localStorage.removeItem(APP_CONFIG.STORAGE.SHEET_NAME);
      }
    }
    return true;
  }

  /**
   * Đổi tên / icon / color của workspace
   * @param {string} id
   * @param {object} updates {name, icon, color}
   */
  function update(id, updates) {
    const list = _load();
    const ws = list.find(w => w.id === id);
    if (!ws) return false;
    if (updates.name)  ws.name  = updates.name;
    if (updates.icon)  ws.icon  = updates.icon;
    if (updates.color) ws.color = updates.color;
    _save(list);
    return true;
  }

  /**
   * Detect xem sheet có phải là "BĐS mode" hay generic
   * Dựa vào colMap (output của buildColMap)
   */
  function isBDSMode(colMap) {
    const BDS_KEYS = ['ADDRESS', 'PRICE', 'DISTRICT', 'AREA', 'OWNER', 'PHONE'];
    const matched = BDS_KEYS.filter(k => colMap && colMap[k]);
    return matched.length >= 2;
  }

  return {
    migrate,
    storageKey,
    getAll,
    getActive,
    add,
    switchTo,
    remove,
    update,
    isBDSMode,
    DEFAULT_ICONS,
    DEFAULT_COLORS,
  };
})();

window.WorkspaceManager = WorkspaceManager;
