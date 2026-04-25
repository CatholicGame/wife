/**
 * BĐS Survey App – List Page Logic
 * ===================================
 * Danh sách, search, filter, sort
 */

// ─── Toast Helper ─────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; toast.style.transition = 'all 0.2s'; setTimeout(() => toast.remove(), 200); }, duration);
}
window.showToast = showToast;

// ─── Headers Debug Panel ──────────────────────────────────────────────────────
function showHeadersDebugPanel(headers) {
  // Xóa panel cũ nếu có
  document.getElementById('headersDebugPanel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'headersDebugPanel';
  panel.style.cssText = `
    position:fixed; bottom:calc(var(--bottom-nav-height) + 80px); left:50%; transform:translateX(-50%);
    background:var(--bg-card); border:1px solid var(--accent); border-radius:12px;
    padding:16px; z-index:150; max-width:calc(100vw - 32px); width:500px;
    box-shadow:0 8px 40px rgba(0,0,0,0.5); font-size:0.82rem;
  `;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <strong style="color:var(--accent)">⚠️ Không nhận được cột địa chỉ</strong>
      <button onclick="document.getElementById('headersDebugPanel').remove()" style="background:none;border:none;color:var(--text-secondary);font-size:1rem;cursor:pointer">✕</button>
    </div>
    <p style="color:var(--text-secondary);margin-bottom:8px">Các cột trong Sheet của bạn:</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${headers.map((h, i) => `<span style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:0.75rem"><b>${i+1}.</b> ${h}</span>`).join('')}
    </div>
    <p style="color:var(--text-secondary);font-size:0.75rem">
      📌 Tên cột địa chỉ trong Sheet: <b style="color:var(--accent)">"${headers[1] || headers[0] || '?'}"</b> — hãy paste tên chính xác vào chat để tôi cập nhật.
    </p>
  `;
  document.body.appendChild(panel);

  // Auto-copy headers to clipboard
  navigator.clipboard?.writeText(JSON.stringify(headers)).catch(() => {});
}

// ─── State ────────────────────────────────────────────────────────────────────
const State = {
  allRows: [],
  headers: [],
  filtered: [],
  colMap: {},
  searchQuery: '',
  activeFilter: 'all',
  activeStatus: null,
  sortBy: 'date-desc',
  isLoading: false,
  viewMode: 'refactor', // Only V2 table
  columnFilters: {},    // { colId: Set<selectedValues> } — Google Sheets-style per-column filters
};

// ─── Column Mapping ───────────────────────────────────────────────────────────
function buildColMap(headers) {
  const map = {};
  const keys = Object.keys(APP_CONFIG.KNOWN_COLUMNS);
  keys.forEach((key) => {
    const idx = findColumnIndex(headers, key);
    if (idx >= 0) map[key] = { index: idx, name: headers[idx] };
  });
  // Ưu tiên dùng saved mapping của ColMapper
  return ColMapper.buildColMap(headers, map);
}

function colVal(row, key) {
  const col = State.colMap[key];
  if (!col) return '';
  return row[col.name] || '';
}

// ─── Score Color ──────────────────────────────────────────────────────────────
function getScoreClass(score) {
  const n = parseFloat(score);
  if (isNaN(n)) return '';
  if (n >= 7) return 'score-high';
  if (n >= 5) return 'score-med';
  return 'score-low';
}

// ─── Price Formatters ────────────────────────────────────────────────────────
function formatPrice(val) {
  const n = parseFloat(String(val).replace(/,/g, '.').replace(/[^0-9.\-]/g, ''));
  if (isNaN(n) || n === 0) return '—';
  if (n >= 1) return n.toFixed(n % 1 === 0 ? 0 : 2) + ' tỷ';
  return (n * 1000).toFixed(0) + ' tr';
}

// Giá/m² — sheet thường lưu theo đơn vị triệu/m²
function formatPriceM2(val) {
  const n = parseFloat(String(val).replace(/,/g, '.').replace(/[^0-9.\-]/g, ''));
  if (isNaN(n) || n === 0) return '';
  // Nếu > 5 → coi là triệu/m²; nếu <= 5 → coi là tỷ/m²
  if (n > 5) return Math.round(n) + ' tr/m²';
  return n.toFixed(2) + ' tỷ/m²';
}

// ─── Render Card ──────────────────────────────────────────────────────────────
function renderCard(row) {
  // Địa chỉ: dùng cột ADDRESS hoặc fallback lấy cột text đầu tiên có giá trị
  let address = colVal(row, 'ADDRESS');
  if (!address && row._values) {
    // Tìm giá trị text đầu tiên không phải số
    address = row._values.find((v) => v && isNaN(parseFloat(v)) && String(v).length > 3) || '';
  }
  address = address || `(Hàng ${row._row})`;

  const district = colVal(row, 'DISTRICT');
  const type = colVal(row, 'TYPE');
  const price = formatPrice(colVal(row, 'PRICE'));
  const area = colVal(row, 'AREA');
  const priceM2 = colVal(row, 'PRICE_M2');
  const owner = colVal(row, 'OWNER');
  const score = colVal(row, 'SCORE');
  const status = colVal(row, 'STATUS');
  const date = colVal(row, 'DATE');
  const folderId = colVal(row, 'DRIVE_FOLDER');
  const photoCount = colVal(row, 'PHOTO_COUNT');

  const scoreNum = parseFloat(score);
  const scoreClass = getScoreClass(score);
  const thumbUrl = folderId ? DriveAPI.getThumbnailUrl(folderId.split(',')[0], 200) : '';

  const statusBadgeMap = {
    'Tiềm năng': 'badge-yellow',
    'Đã chốt': 'badge-green',
    'Đang xem xét': 'badge-blue',
    'Bỏ qua': 'badge-red',
    'Đã khảo sát': 'badge-accent',
  };
  const statusBadge = statusBadgeMap[status] || 'badge-accent';

  return `
    <a href="detail.html?row=${row._row}" class="card prop-card animate-fade-up">
      <div class="prop-thumb">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '🏠'}
        ${photoCount > 0 ? `<span class="photo-count-badge">📷 ${photoCount}</span>` : ''}
      </div>
      <div class="prop-body">
        <div class="prop-type-date">
          ${type ? `<span class="badge badge-accent text-xs">${type}</span>` : '<span></span>'}
          <span class="text-xs text-muted">${date || ''}</span>
        </div>
        <div class="prop-address">${address}</div>
        ${district ? `<div class="prop-district">📍 ${district}</div>` : ''}
        ${owner ? `<div class="prop-owner">👤 ${owner}</div>` : ''}
        <div class="prop-price-row">
          <div>
            <div class="prop-price">${price}</div>
            ${area ? `<div class="prop-area">${area} m² ${priceM2 ? `• ${formatPriceM2(priceM2)}` : ''}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            ${!isNaN(scoreNum) && scoreNum > 0 ? `<div class="score-badge ${scoreClass}">${scoreNum.toFixed(1)}</div>` : ''}
            ${status ? `<span class="badge ${statusBadge}" style="font-size:0.6rem">${status}</span>` : ''}
          </div>
        </div>
      </div>
    </a>
  `;
}

// ─── Filter & Sort ────────────────────────────────────────────────────────────

function updateFilterUI(isBDS) {
  const btnAdvancedFilter = document.getElementById('btnAdvancedFilter');
  if (btnAdvancedFilter) {
    btnAdvancedFilter.style.display = isBDS ? '' : 'none';
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.placeholder = isBDS ? 'Tìm địa chỉ, quận, đầu chủ...' : 'Nhập từ khóa tìm kiếm...';
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    if (!isBDS) {
      // Hide non-generic options
      Array.from(sortSelect.querySelectorAll('optgroup')).forEach(grp => {
        if (grp.label !== 'Ngày') grp.style.display = 'none';
        else grp.style.display = '';
      });
      const validForGeneric = ['date-asc', 'date-desc'];
      if (!validForGeneric.includes(sortSelect.value)) {
        sortSelect.value = 'date-desc';
        State.sortBy = 'date-desc';
      }
    } else {
      // Show all
      Array.from(sortSelect.querySelectorAll('optgroup')).forEach(grp => grp.style.display = '');
    }
  }
}

function applyFiltersAndSort() {
  let rows = [...State.allRows];
  const isBDS = WorkspaceManager.isBDSMode(State.colMap);

  // Search
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    rows = rows.filter((r) => {
      if (isBDS) {
        return ['ADDRESS', 'DISTRICT', 'OWNER', 'NOTES'].some((key) => {
          const v = colVal(r, key).toLowerCase();
          return v.includes(q);
        });
      } else {
        // Generic search across all headers
        return (State.headers || []).some((h) => {
          const v = (r[h] || '').toString().toLowerCase();
          return v.includes(q);
        });
      }
    });
  }

  // Type & Status & Price filters
  if (isBDS) {
    const af = State.advancedFilter || { type: 'all', price: 'all', status: 'all' };

    if (af.type && af.type !== 'all') {
      rows = rows.filter((r) => colVal(r, 'TYPE') === af.type);
    }
    if (af.status && af.status !== 'all') {
      rows = rows.filter((r) => colVal(r, 'STATUS') === af.status);
    }
    if (af.price && af.price !== 'all') {
      rows = rows.filter((r) => {
        const p = parseFloat(colVal(r, 'PRICE'));
        if (isNaN(p)) return false; // Ignore item if no price but price filter active

        if (af.price === '0-3') return p < 3;
        if (af.price === '3-5') return p >= 3 && p <= 5;
        if (af.price === '5-10') return p > 5 && p <= 10;
        if (af.price === '10-999') return p > 10;
        return true;
      });
    }
  }

  // ── Google Sheets-style column filters ──
  if (Object.keys(State.columnFilters).length > 0) {
    const allCols = getV2Columns();
    rows = rows.filter(row => {
      for (const [colId, allowedSet] of Object.entries(State.columnFilters)) {
        if (!allowedSet || allowedSet.size === 0) continue;
        const col = allCols.find(c => c.id === colId);
        if (!col) continue;
        let val = '';
        if (col.knownKey) {
          val = colVal(row, col.knownKey);
        } else if (col.headerName) {
          val = row[col.headerName];
          if (val === undefined) {
            const lowerHeader = col.headerName.toLowerCase().trim();
            const actualKey = Object.keys(row).find(k => k.toLowerCase().trim() === lowerHeader);
            if (actualKey) val = row[actualKey];
          }
          val = val || '';
        }
        val = String(val).trim();
        if (val === '') val = '(Trống)';
        if (!allowedSet.has(val)) return false;
      }
      return true;
    });
  }

  // Sort
  rows.sort((a, b) => {
    switch (State.sortBy) {
      // ── Ngày ──
      case 'date-asc':  return a._row - b._row;
      // ── Điểm ──
      case 'score-desc': return isBDS ? (parseFloat(colVal(b, 'SCORE')) || 0) - (parseFloat(colVal(a, 'SCORE')) || 0) : b._row - a._row;
      case 'score-asc':  return isBDS ? (parseFloat(colVal(a, 'SCORE')) || 0) - (parseFloat(colVal(b, 'SCORE')) || 0) : a._row - b._row;
      // ── Giá ──
      case 'price-asc':     return isBDS ? (parseFloat(colVal(a, 'PRICE')) || 0) - (parseFloat(colVal(b, 'PRICE')) || 0) : a._row - b._row;
      case 'price-desc':    return isBDS ? (parseFloat(colVal(b, 'PRICE')) || 0) - (parseFloat(colVal(a, 'PRICE')) || 0) : b._row - a._row;
      case 'price-m2-asc':  return isBDS ? (parseFloat(colVal(a, 'PRICE_M2')) || 0) - (parseFloat(colVal(b, 'PRICE_M2')) || 0) : a._row - b._row;
      case 'price-m2-desc': return isBDS ? (parseFloat(colVal(b, 'PRICE_M2')) || 0) - (parseFloat(colVal(a, 'PRICE_M2')) || 0) : b._row - a._row;
      // ── Diện tích ──
      case 'area-desc': return isBDS ? (parseFloat(colVal(b, 'AREA')) || 0) - (parseFloat(colVal(a, 'AREA')) || 0) : b._row - a._row;
      case 'area-asc':  return isBDS ? (parseFloat(colVal(a, 'AREA')) || 0) - (parseFloat(colVal(b, 'AREA')) || 0) : a._row - b._row;
      // ── Khu vực ──
      case 'district-az': return isBDS ? (colVal(a, 'DISTRICT') || '').localeCompare(colVal(b, 'DISTRICT') || '', 'vi') : a._row - b._row;
      case 'district-za': return isBDS ? (colVal(b, 'DISTRICT') || '').localeCompare(colVal(a, 'DISTRICT') || '', 'vi') : b._row - a._row;
      // ── Mặc định: mới nhất ──
      default: return row_desc(a, b);
    }
  });

  State.filtered = rows;
}

function row_desc(a, b) {
  // Sort by row index descending (newer rows = larger index = newer)
  return b._row - a._row;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderList() {
  const countEl = document.getElementById('listCount');
  if (countEl) {
    const isBDS = (typeof WorkspaceManager !== 'undefined' && State.colMap) 
      ? WorkspaceManager.isBDSMode(State.colMap) 
      : true;
    const itemLabel = isBDS ? 'bất động sản' : 'dòng';
    countEl.textContent = State.filtered.length === 0
      ? '0 kết quả'
      : `${State.filtered.length} ${itemLabel}`;
  }

  const container = document.getElementById('refactorView');
  if (!container) return;

  if (State.filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Không tìm thấy</h3>
        <p>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
      </div>`;
    return;
  }

  renderV2Table();
}

function renderCards() {
  const container = document.getElementById('propertiesList');
  if (!container) return;
  container.innerHTML = State.filtered.map(renderCard).join('');
  // Bắt sự kiện click trên card thay vì dùng href trực tiếp
  container.querySelectorAll('a.prop-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const rowNum = parseInt(card.dataset.row);
      const rowObj = State.filtered.find(r => r._row === rowNum);
      if (!rowObj) return;
      localStorage.setItem('_rowData', JSON.stringify(rowObj));
      localStorage.setItem('_rowHeaders', JSON.stringify(State.headers));
      window.location.href = 'form.html';
    });
  });
}

// ─── Table View ──────────────────────────────────────────────────────────────
function renderTable() {
  const container = document.getElementById('tableView');
  if (!container) return;

  // Labels đặc biệt và css class cho các known columns
  const SPECIAL_LABELS = { ID:'STT', DATE:'Ngày', TYPE:'Loại', ADDRESS:'Địa chỉ', DISTRICT:'Quận/Huyện', AREA:'DT (m²)', FRONT:'MT (m)', PRICE:'Giá (tỷ)', PRICE_M2:'Giá/m²', LEGAL:'Pháp lý', FLOORS:'Tầng', BEDROOMS:'PN', DIR:'Hướng', ROAD:'Đường', OWNER:'Đầu chủ', PHONE:'SĐT', PROS:'Ưu điểm', CONS:'Nhược điểm', SCORE:'Điểm', MAPS_LINK:'🗺 Map', LAT:'Lat', LNG:'Lng' };
  const SPECIAL_CLS = { ADDRESS:'col-addr', PRICE:'col-price', SCORE:'col-score' };
  // Cột ẩn (không cần hiển thị trong bảng)
  const HIDDEN_KEYS = new Set(['LAT','LNG','ID','NOTES','TITLE_INFO']);

  // Reverse map: headerName → knownKey (để tra ngược)
  const headerToKey = {};
  Object.keys(State.colMap).forEach(k => { headerToKey[State.colMap[k].name] = k; });

  // Xây activeCols từ TẤT CẢ headers trong sheet theo đúng thứ tự
  const activeCols = (State.headers || [])
    .map((headerName, idx) => {
      const knownKey = headerToKey[headerName]; // có thể undefined nếu không map được
      return { headerName, knownKey, idx };
    })
    .filter(c => {
      if (!c.headerName || c.headerName.startsWith('_')) return false;
      if (c.knownKey && HIDDEN_KEYS.has(c.knownKey)) return false;
      return true;
    })
    .map(c => ({
      key: c.knownKey || null,      // null nếu không map được
      headerName: c.headerName,
      label: c.knownKey ? (SPECIAL_LABELS[c.knownKey] || c.headerName) : c.headerName,
      cls: c.knownKey ? (SPECIAL_CLS[c.knownKey] || '') : '',
      idx: c.idx,
    }));


  // Header: luôn có cột # (thứ tự) đầu tiên
  const thead = `<th class="col-stt">#</th>` + activeCols.map(c =>
    `<th class="${c.cls}">${c.label}</th>`
  ).join('');

  // Build a global map: rowNum → row object (để onclick dùng an toàn)
  window._rowMap = {};
  State.filtered.forEach(row => { window._rowMap[row._row] = row; });

  const tbody = State.filtered.map((row, idx) => {
    const numCell = `<td class="col-stt">${idx + 1}</td>`;
    const cells = activeCols.map(c => {
      // Lấy giá trị: nếu có key → dùng colVal, nếu không → đọc thẳng bằng headerName
      let val = c.key ? colVal(row, c.key) : (row[c.headerName] || '');

      if (c.key === 'PRICE' && val) val = formatPrice(val);
      if (c.key === 'PRICE_M2' && val) val = formatPriceM2(val);
      if (c.key === 'SCORE' && val) {
        const n = parseFloat(val);
        val = (!isNaN(n) && n > 0) ? `<span class="score-badge ${getScoreClass(val)}" style="font-size:0.75rem;padding:2px 8px">${n.toFixed(1)}</span>` : '';
      }
      if (c.key === 'TYPE' && val) val = `<span class="badge badge-accent" style="font-size:0.68rem">${val}</span>`;

      // Cột địa chỉ → clickable để xem chi tiết
      if (c.key === 'ADDRESS') {
        return `<td class="${c.cls}"><span class="row-link" data-rownum="${row._row}" style="color:var(--accent);font-weight:700;cursor:pointer">${val || '(xem)'}</span></td>`;
      }
      // Cột Maps → link có icon + text ngắn
      if ((c.key === 'MAPS_LINK' || (!c.key && val && (val.includes('maps.app.goo.gl') || val.includes('google.com/maps')))) && val) {
        const short = val.length > 30 ? val.substring(0, 30) + '…' : val;
        return `<td class="${c.cls}"><a href="${val}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:0.75rem;white-space:nowrap" title="${val}">🗺️ ${short}</a></td>`;
      }
      return `<td class="${c.cls}">${val || ''}</td>`;
    }).join('');
    const actionCell = `<td><button class="row-link" data-rownum="${row._row}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.78rem">✏️ Xem</button></td>`;
    return `<tr class="row-link" data-rownum="${row._row}" style="cursor:pointer">${numCell}${cells}${actionCell}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `;

  // Row click → save vào localStorage và mở form.html
  container.querySelector('table').addEventListener('click', e => {
    const target = e.target.closest('[data-rownum]');
    console.log('[TableClick] target:', target, '| e.target.tagName:', e.target.tagName);
    if (!target) { console.log('[TableClick] no data-rownum target'); return; }
    const rowNum = parseInt(target.dataset.rownum);
    const rowObj = window._rowMap[rowNum];
    console.log('[TableClick] rowNum:', rowNum, '| rowObj found:', !!rowObj);
    if (!rowObj) { console.error('[TableClick] rowObj not found in _rowMap'); return; }
    localStorage.setItem('_rowData', JSON.stringify(rowObj));
    localStorage.setItem('_rowHeaders', JSON.stringify(State.headers));
    const isBDS = WorkspaceManager.isBDSMode(State.colMap);
    const targetUrl = isBDS ? 'form.html' : 'form-generic.html';
    console.log('[TableClick] navigating to with row', rowNum, targetUrl);
    window.location.href = targetUrl;
  });
}

// ─── V2 Table (Refactor View) ─────────────────────────────────────────────────
// Keys are now per-workspace (scoped via WorkspaceManager.storageKey)
const V2_COLS_KEY        = 'v2_columns';   // suffix only
const V2_HIDDEN_COLS_KEY = 'hidden_cols';  // suffix only

function _wsKey(suffix) {
  // WorkspaceManager may not be available in tests → fallback to legacy key
  return (typeof WorkspaceManager !== 'undefined')
    ? WorkspaceManager.storageKey(suffix)
    : 'bds_' + suffix;
}

function getHiddenCols() {
  try {
    const saved = localStorage.getItem(_wsKey(V2_HIDDEN_COLS_KEY));
    if (saved) return new Set(JSON.parse(saved));
  } catch (e) {}
  return new Set();
}

function saveHiddenCols(hiddenSet) {
  localStorage.setItem(_wsKey(V2_HIDDEN_COLS_KEY), JSON.stringify([...hiddenSet]));
}

function openColSettingsPanel() {
  document.getElementById('colSettingsPanel')?.remove();

  const allCols = getV2Columns();
  const hidden  = getHiddenCols();

  // Dot color per group
  const GROUP_DOT = {
    default: 'var(--bg-surface)',
    green:   'rgba(0,212,170,0.6)',
    orange:  'rgba(245,166,35,0.6)',
    purple:  'rgba(180,100,255,0.6)',
    red:     'rgba(231,76,60,0.6)',
  };

  const TYPE_ICONS = { text:'📔', number:'🔢', date:'📅', datetime:'🕰️', textarea:'📝', select:'🏷️', checkbox:'☑️' };

  // Build flat list HTML
  const itemsHtml = allCols.map((col) => {
    const isHidden = hidden.has(col.id);
    const isSystem = col.system;
    const dot = GROUP_DOT[col.group] || GROUP_DOT.default;
    const typeIcon = col.fieldType && TYPE_ICONS[col.fieldType] ? ` <span style="font-size:0.8rem;opacity:0.7" title="${col.fieldType}">${TYPE_ICONS[col.fieldType]}</span>` : '';
    return `
      <div class="col-toggle-item${isSystem ? ' col-toggle-system' : ''}"
           data-col-id="${col.id}"
           draggable="${isSystem ? 'false' : 'true'}">
        <span class="col-drag-handle" title="${isSystem ? 'Cột hệ thống' : 'Kéo để sắp xếp'}">⠿</span>
        <input type="checkbox" class="col-toggle-cb" data-col-id="${col.id}"
               ${!isHidden ? 'checked' : ''} ${isSystem ? 'disabled' : ''}>
        <span class="col-toggle-dot" style="background:${dot}"></span>
        <span style="flex:1">${col.label}${typeIcon}</span>
      </div>`;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'colSettingsPanel';
  panel.innerHTML = `
    <div class="col-settings-header">
      <span>⚙️ Cột &amp; Thứ tự</span>
      <div style="display:flex;gap:6px">
        <button id="colSettingsShowAll" class="col-settings-action-btn">Tất cả</button>
        <button id="colSettingsHideAll" class="col-settings-action-btn">Ẩn hết</button>
        <button id="colSettingsClose" class="col-settings-close">✕</button>
      </div>
    </div>
    <div class="col-settings-hint">⠿ Kéo để thay đổi thứ tự cột</div>
    <div class="col-settings-body" id="colSettingsBody">${itemsHtml}</div>
  `;
  document.body.appendChild(panel);

  // Position below the ⚙️ Cột button
  const triggerBtn = document.getElementById('btnColSettings');
  if (triggerBtn) {
    const rect = triggerBtn.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 6) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    // Clamp so it doesn't go off-screen bottom
    const maxH = window.innerHeight - rect.bottom - 16;
    panel.style.maxHeight = Math.min(parseInt(panel.style.maxHeight || 9999), maxH) + 'px';
  }

  const body = panel.querySelector('#colSettingsBody');
  let dragSrc = null;

  // ── Drag & Drop ──
  function addDragListeners(item) {
    if (item.dataset.colId && !item.classList.contains('col-toggle-system')) {
      item.addEventListener('dragstart', onDragStart);
      item.addEventListener('dragend',   onDragEnd);
    }
    item.addEventListener('dragover',  onDragOver);
    item.addEventListener('dragleave', onDragLeave);
    item.addEventListener('drop',      onDrop);
  }

  function clearDropIndicators() {
    body.querySelectorAll('.col-drag-over-top, .col-drag-over-bottom').forEach(el => {
      el.classList.remove('col-drag-over-top', 'col-drag-over-bottom');
    });
  }

  function onDragStart(e) {
    dragSrc = this;
    this.classList.add('col-drag-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.colId);
  }

  function onDragEnd() {
    this.classList.remove('col-drag-dragging');
    clearDropIndicators();
    _saveDragOrder();
  }

  function onDragOver(e) {
    if (!dragSrc || dragSrc === this) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropIndicators();
    const rect = this.getBoundingClientRect();
    const isBefore = e.clientY < rect.top + rect.height / 2;
    this.classList.add(isBefore ? 'col-drag-over-top' : 'col-drag-over-bottom');
  }

  function onDragLeave() {
    this.classList.remove('col-drag-over-top', 'col-drag-over-bottom');
  }

  function onDrop(e) {
    e.preventDefault();
    clearDropIndicators();
    if (!dragSrc || dragSrc === this) return;
    const rect = this.getBoundingClientRect();
    const isBefore = e.clientY < rect.top + rect.height / 2;
    if (isBefore) {
      body.insertBefore(dragSrc, this);
    } else {
      body.insertBefore(dragSrc, this.nextSibling);
    }
  }

  body.querySelectorAll('.col-toggle-item').forEach(addDragListeners);

  function _saveDragOrder() {
    const newOrder = [...body.querySelectorAll('[data-col-id]')].map(el => el.dataset.colId);
    // Gọi getV2Columns() chỉ 1 lần để tránh duplicate
    const currentCols = getV2Columns();
    const colById = {};
    currentCols.forEach(c => { colById[c.id] = c; });
    const newCols = newOrder.map(id => colById[id]).filter(Boolean);
    // Safety: append orphaned cols (có trong storage nhưng không có trong DOM)
    const seenIds = new Set(newOrder);
    currentCols.forEach(c => { if (!seenIds.has(c.id)) newCols.push(c); });
    // Deduplicate theo id để loại bỏ duplicate tích lũy
    const seen2 = new Set();
    const dedupedCols = newCols.filter(c => { if (seen2.has(c.id)) return false; seen2.add(c.id); return true; });
    saveV2Columns(dedupedCols);
    renderV2Table();
  }

  // ── Visibility checkboxes ──
  function applyVisibility() {
    const newHidden = new Set();
    panel.querySelectorAll('.col-toggle-cb').forEach(cb => {
      if (!cb.checked) newHidden.add(cb.dataset.colId);
    });
    saveHiddenCols(newHidden);
    renderV2Table();
  }

  panel.querySelectorAll('.col-toggle-cb').forEach(cb => {
    cb.addEventListener('change', applyVisibility);
  });

  panel.querySelector('#colSettingsShowAll')?.addEventListener('click', () => {
    panel.querySelectorAll('.col-toggle-cb:not([disabled])').forEach(cb => cb.checked = true);
    applyVisibility();
  });

  panel.querySelector('#colSettingsHideAll')?.addEventListener('click', () => {
    panel.querySelectorAll('.col-toggle-cb:not([disabled])').forEach(cb => cb.checked = false);
    applyVisibility();
  });

  panel.querySelector('#colSettingsClose')?.addEventListener('click', () => panel.remove());

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', function outsideClick(e) {
      if (!panel.contains(e.target) && e.target.id !== 'btnColSettings') {
        panel.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);
}


// Default V2 columns blueprint
const V2_DEFAULT_COLS = [
  { id: 'stt',       label: 'STT',            group: 'default',  system: true },
  { id: 'date',      label: 'Ngày khảo sát',  group: 'default',  knownKey: 'DATE' },
  { id: 'notes',     label: 'Tiêu đề',        group: 'default',  knownKey: 'NOTES' },
  { id: 'status',    label: 'Tình trạng',     group: 'default',  knownKey: 'STATUS' },
  { id: 'type',      label: 'Loại BĐS',      group: 'default',  knownKey: 'TYPE' },
  { id: 'map',       label: 'Link Map',       group: 'green',    knownKey: 'MAPS_LINK' },
  { id: 'address',   label: 'Địa chỉ',       group: 'green',    knownKey: 'ADDRESS' },
  { id: 'district',  label: 'Quận/Huyện',     group: 'green',    knownKey: 'DISTRICT' },
  { id: 'owner',     label: 'Đầu chủ',       group: 'red',      knownKey: 'OWNER' },
  { id: 'phone',     label: 'SĐT',            group: 'red',      knownKey: 'PHONE' },
  { id: 'price',     label: 'Giá (Tỷ)',      group: 'orange',   knownKey: 'PRICE' },
  { id: 'price_m2',  label: 'Giá/m²',        group: 'orange',   knownKey: 'PRICE_M2' },
  { id: 'area',      label: 'DT (m²)',        group: 'orange',   knownKey: 'AREA' },
  { id: 'front',     label: 'Mặt tiền (m)',   group: 'orange',   knownKey: 'FRONT' },
  { id: 'road',      label: 'Đường (m)',      group: 'orange',   knownKey: 'ROAD' },
  { id: 'floors',    label: 'Số tầng',        group: 'orange',   knownKey: 'FLOORS' },
  { id: 'bedrooms',  label: 'PN',             group: 'orange',   knownKey: 'BEDROOMS' },
  { id: 'dir',       label: 'Hướng',          group: 'orange',   knownKey: 'DIR' },
  { id: 'legal',     label: 'Pháp lý',       group: 'orange',   knownKey: 'LEGAL' },
  { id: 'pros',      label: 'Ưu điểm',       group: 'purple',   knownKey: 'PROS' },
  { id: 'cons',      label: 'Nhược điểm',    group: 'purple',   knownKey: 'CONS' },
  { id: 'score',     label: 'Tổng điểm',     group: 'purple',   knownKey: 'SCORE' },
  { id: 'photos',    label: 'Ảnh',            group: 'default',  knownKey: 'PHOTOS' },
];

const V2_GROUP_BG = {
  default: 'var(--bg-surface)',
  green:   'rgba(0,212,170,0.1)',
  orange:  'rgba(245,166,35,0.1)',
  purple:  'rgba(180,100,255,0.1)',
  red:     'rgba(231,76,60,0.1)',
};

function buildGenericCols() {
  if (!State.headers) return [];
  const cols = State.headers.map((h, i) => ({
    id: 'gen_col_' + i,
    label: h,
    group: 'default',
    system: false,
    headerName: h,
    cls: 'col-generic'
  }));
  cols.unshift({ id: 'stt', label: 'STT', group: 'default', system: true });
  return cols;
}

function getV2Columns() {
  const wsKey = _wsKey(V2_COLS_KEY);
  const isBDS = (typeof WorkspaceManager !== 'undefined' && State.colMap) 
    ? WorkspaceManager.isBDSMode(State.colMap) 
    : true; // fallback

  try {
    // Version flag is per-workspace
    const verKey = wsKey + '_v6';
    const ver = localStorage.getItem(verKey);
    if (!ver) {
      localStorage.setItem(verKey, '1');
      localStorage.removeItem(wsKey); // wipe old layout → apply new defaults
      return isBDS ? [...V2_DEFAULT_COLS] : buildGenericCols();
    }
    const saved = localStorage.getItem(wsKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Auto-heal: loại bỏ duplicate theo id
      const seenIds = new Set();
      const deduped = parsed.filter(c => {
        if (!c || !c.id || seenIds.has(c.id)) return false;
        seenIds.add(c.id);
        return true;
      });
      if (deduped.length !== parsed.length) {
        localStorage.setItem(wsKey, JSON.stringify(deduped));
      }
      
      // Nếu là sheet mới tinh vừa import nhưng lại load ra rỗng (vì State.headers chưa có khi getV2Columns chạy lần đầu?)
      // Nếu deduped rỗng mà là generic, thử build lại
      if (deduped.length === 0 && !isBDS) return buildGenericCols();
      
      return deduped;
    }
  } catch (e) {}
  
  return isBDS ? [...V2_DEFAULT_COLS] : buildGenericCols();
}

function saveV2Columns(cols) {
  localStorage.setItem(_wsKey(V2_COLS_KEY), JSON.stringify(cols));
}

function renderV2Table() {
  const container = document.getElementById('refactorView');
  if (!container) return;

  const allCols = getV2Columns();
  const hidden = getHiddenCols();
  // Filter out hidden columns
  const cols = allCols.filter(col => !hidden.has(col.id));
  const rows = State.filtered;

  // Build row map for click navigation
  if (!window._rowMap) window._rowMap = {};
  rows.forEach(row => { window._rowMap[row._row] = row; });

  // Wire settings button (re-attach each render)
  const settingsBtn = document.getElementById('btnColSettings');
  if (settingsBtn) {
    settingsBtn.innerHTML = '⚙️ Cột';
    const fresh = settingsBtn.cloneNode(true);
    settingsBtn.parentNode.replaceChild(fresh, settingsBtn);
    fresh.addEventListener('click', (e) => {
      e.stopPropagation();
      openColSettingsPanel();

    });
  }

  const TYPE_ICONS = { text:'📔', number:'🔢', date:'📅', datetime:'🕰️', textarea:'📝', select:'🏷️', checkbox:'☑️' };

  // Build header — with Google Sheets-style filter icon
  const hasAnyColFilter = Object.keys(State.columnFilters).length > 0;
  const thCells = cols.map((col) => {
    const bg = V2_GROUP_BG[col.group] || V2_GROUP_BG.default;
    const deleteBtn = col.system
      ? ''
      : '<button class="v2-col-delete" data-col-idx="' + cols.indexOf(col) + '" title="Xóa cột">✕</button>';
    const typeIcon = col.fieldType && TYPE_ICONS[col.fieldType] ? `<span style="margin-left:4px;font-size:0.8rem;opacity:0.7" title="${col.fieldType}">${TYPE_ICONS[col.fieldType]}</span>` : '';
    const isFilterActive = !!State.columnFilters[col.id];
    const filterBtn = col.system ? '' : '<button class="col-filter-btn' + (isFilterActive ? ' active' : '') + '" data-filter-col="' + col.id + '" title="Lọc cột này">▾</button>';
    return '<th style="background:' + bg + '"><div class="v2-th-wrap"><span style="display:inline-flex;align-items:center">' + col.label + typeIcon + '</span><div style="display:flex;gap:2px;align-items:center">' + filterBtn + deleteBtn + '</div></div></th>';
  }).join('');

  // Build body
  const bodyRows = rows.map((row, rowIdx) => {
    const cells = cols.map(col => {
      if (col.system && col.id === 'stt') {
        return '<td class="col-stt">' + (rowIdx + 1) + '</td>';
      }

      let val = '';
      if (col.knownKey) {
        val = colVal(row, col.knownKey);
      } else if (col.headerName) {
        val = row[col.headerName];
        if (val === undefined) {
          const lowerHeader = col.headerName.toLowerCase().trim();
          const actualKey = Object.keys(row).find(k => k.toLowerCase().trim() === lowerHeader);
          if (actualKey) val = row[actualKey];
        }
        val = val || '';
      }

      // Format special columns
      if (col.knownKey === 'PRICE' && val) val = formatPrice(val);
      if (col.knownKey === 'PRICE_M2' && val) val = formatPriceM2(val);
      if (col.knownKey === 'SCORE' && val) {
        const n = parseFloat(val);
        val = (!isNaN(n) && n > 0) ? '<span class="score-badge ' + getScoreClass(val) + '" style="font-size:0.75rem;padding:2px 8px">' + n.toFixed(1) + '</span>' : '';
      }
      if (col.knownKey === 'TYPE' && val) val = '<span class="badge badge-accent" style="font-size:0.68rem">' + val + '</span>';
      if (col.knownKey === 'STATUS' && val) {
        const statusColors = { 'Tiềm năng': 'badge-yellow', 'Đã chốt': 'badge-green', 'Đang xem xét': 'badge-blue', 'Bỏ qua': 'badge-red', 'Đã khảo sát': 'badge-accent' };
        const cls = statusColors[val] || 'badge-accent';
        val = '<span class="badge ' + cls + '">' + val + '</span>';
      }
      if (col.knownKey === 'MAPS_LINK' && val) {
        const short = val.length > 25 ? val.substring(0, 25) + '…' : val;
        return '<td><a href="' + val + '" target="_blank" style="color:var(--accent);text-decoration:none;font-size:0.75rem" title="' + val + '">🗺️ ' + short + '</a></td>';
      }
      if ((col.knownKey === 'PHOTOS' || (col.headerName && col.headerName.toLowerCase() === 'ảnh')) && val) {
        const count = val.split(',').filter(x => x.trim()).length;
        val = '<span class="badge badge-accent" style="font-size:0.75rem">📸 ' + count + ' ảnh</span>';
      }
      if (col.knownKey === 'ADDRESS') {
        return '<td class="col-addr" style="color:var(--accent);font-weight:700;cursor:pointer" data-v2row="' + row._row + '">' + (val || '(xem)') + '</td>';
      }
      if (col.knownKey === 'PRICE') {
        return '<td class="col-price">' + val + '</td>';
      }

      return '<td>' + (val || '') + '</td>';
    }).join('');
    
    return '<tr data-v2row="' + row._row + '" style="cursor:pointer">' + cells + '</tr>';
  }).join('');

  // Clear all filter badge in header actions
  const clearFilterBtnId = 'btnClearColFilters';
  let existingClearBtn = document.getElementById(clearFilterBtnId);
  if (hasAnyColFilter) {
    if (!existingClearBtn) {
      const headerActions = document.querySelector('.header-actions');
      if (headerActions) {
        existingClearBtn = document.createElement('button');
        existingClearBtn.id = clearFilterBtnId;
        existingClearBtn.className = 'btn btn-ghost btn-sm';
        existingClearBtn.style.cssText = 'font-size:0.75rem;padding:4px 10px;white-space:nowrap;color:var(--accent);border-color:var(--accent)';
        headerActions.insertBefore(existingClearBtn, headerActions.firstChild);
      }
    }
    if (existingClearBtn) {
      const filterCount = Object.keys(State.columnFilters).length;
      existingClearBtn.textContent = '🔽 Bỏ lọc (' + filterCount + ')';
      existingClearBtn.onclick = () => {
        State.columnFilters = {};
        applyFiltersAndSort();
        renderList();
      };
    }
  } else if (existingClearBtn) {
    existingClearBtn.remove();
  }

  container.innerHTML =
    '<table class="data-table">' +
    '<thead><tr>' + thCells + '</tr></thead>' +
    '<tbody>' + bodyRows + '</tbody>' +
    '</table>';

  // ── Events ──
  // Add column button (in list header)
  document.getElementById('btnAddColFromHeader')?.addEventListener('click', () => {
    document.getElementById('newColName').value = '';
    document.getElementById('newColGroup').value = 'default';
    document.getElementById('newColType').value = 'text';
    document.getElementById('newColOptions').value = '';
    document.getElementById('newColOptionsGroup').classList.add('hidden');
    document.getElementById('addColModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('newColName').focus(), 100);
  });

  // Show/hide options textarea when type = select
  document.getElementById('newColType')?.addEventListener('change', (e) => {
    document.getElementById('newColOptionsGroup')?.classList.toggle('hidden', e.target.value !== 'select');
  });

  // Delete column buttons
  container.querySelectorAll('.v2-col-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.colIdx);
      const col = cols[idx];
      if (!col) return;
      v2RequestDeleteColumn(col.id, col.label);
    });
  });

  // ── Column filter buttons (Google Sheets style) ──
  container.querySelectorAll('.col-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colId = btn.dataset.filterCol;
      const col = cols.find(c => c.id === colId);
      if (!col) return;
      openColumnFilterDropdown(col, btn);
    });
  });

  // ── Row selection + header delete button ──
  let _selectedRowNum = null;

  function _setSelectedRow(rowNum) {
    _selectedRowNum = rowNum;
    // Highlight
    container.querySelectorAll('tr[data-v2row]').forEach(tr => {
      tr.classList.toggle('v2-row-selected', parseInt(tr.dataset.v2row) === rowNum);
    });
    // Toggle delete button in header
    const delBtn = document.getElementById('btnDeleteSelectedRow');
    const copyBtn = document.getElementById('btnSmartCopyRow');
    if (delBtn) {
      if (rowNum) {
        delBtn.classList.remove('hidden', 'btn-ghost');
        delBtn.classList.add('btn-danger');
        delBtn.dataset.row = rowNum;
        if (copyBtn) {
          copyBtn.classList.remove('hidden');
          copyBtn.dataset.row = rowNum;
        }
      } else {
        delBtn.classList.add('hidden');
        delBtn.dataset.row = '';
        if (copyBtn) { copyBtn.classList.add('hidden'); copyBtn.dataset.row = ''; }
      }
    }
  }

  container.querySelector('table')?.addEventListener('click', (e) => {
    if (e.target.closest('.v2-col-delete') || e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-v2row]');
    if (!tr) { _setSelectedRow(null); return; }
    const rowNum = parseInt(tr.dataset.v2row);
    if (!rowNum) return;
    if (_selectedRowNum === rowNum) {
      // Second click on same row → navigate to detail
      const rowObj = State.filtered.find(r => r._row === rowNum);
      if (!rowObj) return;
      localStorage.setItem('_rowData', JSON.stringify(rowObj));
      localStorage.setItem('_rowHeaders', JSON.stringify(State.headers));
      const targetUrl = WorkspaceManager.isBDSMode(State.colMap) ? `form.html?row=${rowNum}` : 'form-generic.html';
      window.location.href = targetUrl;
    } else {
      _setSelectedRow(rowNum);
    }
  });

  // Wire the header delete button (re-attach each render to avoid stale closures)
  const headerDelBtn = document.getElementById('btnDeleteSelectedRow');
  if (headerDelBtn) {
    // Clone to remove old listeners
    const fresh = headerDelBtn.cloneNode(true);
    headerDelBtn.parentNode.replaceChild(fresh, headerDelBtn);
    fresh.addEventListener('click', async () => {
      const rowId = parseInt(fresh.dataset.row);
      if (!rowId) return;
      if (!confirm('Bạn có chắc chắn muốn xóa BĐS này khỏi bảng? Dữ liệu bị xóa không thể khôi phục!')) return;
      const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
      const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
      try {
        fresh.disabled = true;
        fresh.textContent = '⏳ Đang xóa…';
        const sheetIdNum = await SheetsAPI.getSheetId(spreadsheetId, sheetName);
        if (sheetIdNum === undefined) throw new Error('Không tìm thấy ID Worksheet');
        await SheetsAPI.deleteRow(spreadsheetId, sheetName, rowId, sheetIdNum);
        showToast('Đã xóa dòng thành công ✓', 'success');
        SheetsAPI.invalidateCache();
        _selectedRowNum = null;
        await loadData(true);
      } catch (err) {
        showToast('Lỗi xóa: ' + err.message, 'error');
        fresh.disabled = false;
        fresh.textContent = '🗑️ Xóa dòng';
      }
    });
  }

  // Wire the Smart Copy button
  const smartCopyBtn = document.getElementById('btnSmartCopyRow');
  if (smartCopyBtn) {
    const freshCopyBtn = smartCopyBtn.cloneNode(true);
    smartCopyBtn.parentNode.replaceChild(freshCopyBtn, smartCopyBtn);
    freshCopyBtn.addEventListener('click', () => {
      const rowId = parseInt(freshCopyBtn.dataset.row);
      if (!rowId) return;
      const rowObj = State.filtered.find(r => r._row === rowId);
      if (!rowObj) return;

      // Ensure we maintain a clean sequential list matching table logic
      let details = [];
      let index = 1;
      const allCols = getV2Columns();
      const hidden = getHiddenCols();
      const cols = allCols.filter(col => !hidden.has(col.id));
      
      cols.forEach(col => {
        if (col.id === 'stt' || col.system === true && col.id !== 'stt') return;
        
        let val = '';
        if (col.knownKey) {
          val = colVal(rowObj, col.knownKey);
        } else if (col.headerName) {
          val = rowObj[col.headerName];
          if (val === undefined) {
            const lowerHeader = col.headerName.toLowerCase().trim();
            const actualKey = Object.keys(rowObj).find(k => k.toLowerCase().trim() === lowerHeader);
            if (actualKey) val = rowObj[actualKey];
          }
        }
        
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          details.push(`${index}. ${col.label}: ${val}`);
          index++;
        }
      });
      const dataText = details.join('\n');

      // Open Modal
      document.getElementById('smartCopyModal').classList.remove('hidden');
      
      const resultBox = document.getElementById('smartCopyResultBox');
      resultBox.classList.remove('hidden');
      resultBox.textContent = dataText;
      
      const confirmBtn = document.getElementById('btnConfirmCopy');
      confirmBtn.classList.remove('hidden');

      confirmBtn.onclick = () => {
        navigator.clipboard.writeText(dataText).then(() => {
          showToast('Đã copy dữ liệu ✓', 'success');
          document.getElementById('smartCopyModal').classList.add('hidden');
        }).catch(err => {
          showToast('Lỗi copy: ' + err.message, 'error');
        });
      };
    });
  }
}

// ── Google Sheets-style Column Filter Dropdown ────────────────────────────────
function openColumnFilterDropdown(col, triggerBtn) {
  // Remove existing dropdown
  document.getElementById('colFilterDropdown')?.remove();

  // Collect all unique values for this column from ALL rows (before column filters, but after search+advanced)
  // We use State.allRows and re-apply search+advanced (but NOT column filters) to get the base dataset
  let baseRows = [...State.allRows];
  const isBDS = WorkspaceManager.isBDSMode(State.colMap);

  // Reapply search
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    baseRows = baseRows.filter(r => {
      if (isBDS) {
        return ['ADDRESS', 'DISTRICT', 'OWNER', 'NOTES'].some(key => colVal(r, key).toLowerCase().includes(q));
      } else {
        return (State.headers || []).some(h => (r[h] || '').toString().toLowerCase().includes(q));
      }
    });
  }

  // Reapply advanced filter (BDS only)
  if (isBDS) {
    const af = State.advancedFilter || { type: 'all', price: 'all', status: 'all' };
    if (af.type && af.type !== 'all') baseRows = baseRows.filter(r => colVal(r, 'TYPE') === af.type);
    if (af.status && af.status !== 'all') baseRows = baseRows.filter(r => colVal(r, 'STATUS') === af.status);
    if (af.price && af.price !== 'all') {
      baseRows = baseRows.filter(r => {
        const p = parseFloat(colVal(r, 'PRICE'));
        if (isNaN(p)) return false;
        if (af.price === '0-3') return p < 3;
        if (af.price === '3-5') return p >= 3 && p <= 5;
        if (af.price === '5-10') return p > 5 && p <= 10;
        if (af.price === '10-999') return p > 10;
        return true;
      });
    }
  }

  // Collect unique values
  const valCounts = new Map(); // value → count
  baseRows.forEach(row => {
    let val = '';
    if (col.knownKey) {
      val = colVal(row, col.knownKey);
    } else if (col.headerName) {
      val = row[col.headerName];
      if (val === undefined) {
        const lk = col.headerName.toLowerCase().trim();
        const ak = Object.keys(row).find(k => k.toLowerCase().trim() === lk);
        if (ak) val = row[ak];
      }
      val = val || '';
    }
    val = String(val).trim();
    if (val === '') val = '(Trống)';
    valCounts.set(val, (valCounts.get(val) || 0) + 1);
  });

  // Sort values alphabetically, but put "(Trống)" last
  const sortedValues = [...valCounts.keys()].sort((a, b) => {
    if (a === '(Trống)') return 1;
    if (b === '(Trống)') return -1;
    return a.localeCompare(b, 'vi');
  });

  // Current filter state for this column
  const currentFilter = State.columnFilters[col.id];
  const isAllSelected = !currentFilter; // If no filter → all selected

  // Build dropdown HTML
  const dropdown = document.createElement('div');
  dropdown.id = 'colFilterDropdown';
  dropdown.innerHTML = `
    <div class="col-filter-header">
      <span>🔽 Lọc: ${col.label}</span>
      <button class="col-filter-close" id="colFilterClose">✕</button>
    </div>
    <div class="col-filter-search-wrap">
      <input type="text" class="col-filter-search" id="colFilterSearch" placeholder="Tìm giá trị…" autocomplete="off">
    </div>
    <div class="col-filter-actions">
      <button class="col-filter-action-btn" id="colFilterSelectAll">✅ Chọn tất cả</button>
      <button class="col-filter-action-btn" id="colFilterSelectNone">☐ Bỏ hết</button>
    </div>
    <div class="col-filter-list" id="colFilterList">
      ${sortedValues.map(val => {
        const checked = isAllSelected || (currentFilter && currentFilter.has(val));
        const count = valCounts.get(val);
        const escaped = val.replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return `<label class="col-filter-item" data-val="${escaped}" data-search="${val.toLowerCase()}">
          <input type="checkbox" value="${escaped}" ${checked ? 'checked' : ''}>
          <span class="col-filter-val">${escaped}</span>
          <span class="col-filter-count">${count}</span>
        </label>`;
      }).join('')}
    </div>
    <div class="col-filter-footer">
      <button class="btn btn-ghost btn-sm" id="colFilterClear">Xóa bộ lọc</button>
      <button class="btn btn-primary btn-sm" id="colFilterApply">Áp dụng</button>
    </div>
  `;
  document.body.appendChild(dropdown);

  // Position below the trigger button
  const rect = triggerBtn.getBoundingClientRect();
  const dropW = 260;
  let left = rect.left;
  // Clamp to viewport
  if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
  if (left < 8) left = 8;
  dropdown.style.top = (rect.bottom + 4) + 'px';
  dropdown.style.left = left + 'px';

  // Search filter
  const searchInput = dropdown.querySelector('#colFilterSearch');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    dropdown.querySelectorAll('.col-filter-item').forEach(item => {
      const match = item.dataset.search.includes(q);
      item.style.display = match ? '' : 'none';
    });
  });

  // Select all / none
  dropdown.querySelector('#colFilterSelectAll').addEventListener('click', () => {
    dropdown.querySelectorAll('.col-filter-item input[type=checkbox]').forEach(cb => {
      if (cb.closest('.col-filter-item').style.display !== 'none') cb.checked = true;
    });
  });
  dropdown.querySelector('#colFilterSelectNone').addEventListener('click', () => {
    dropdown.querySelectorAll('.col-filter-item input[type=checkbox]').forEach(cb => {
      if (cb.closest('.col-filter-item').style.display !== 'none') cb.checked = false;
    });
  });

  // Apply
  dropdown.querySelector('#colFilterApply').addEventListener('click', () => {
    const checkedVals = new Set();
    dropdown.querySelectorAll('.col-filter-item input[type=checkbox]:checked').forEach(cb => {
      checkedVals.add(cb.value);
    });

    // If all values are checked → remove filter (= no filter)
    if (checkedVals.size >= sortedValues.length) {
      delete State.columnFilters[col.id];
    } else if (checkedVals.size === 0) {
      // Nothing selected → filter everything out (empty set)
      State.columnFilters[col.id] = new Set(['__IMPOSSIBLE_VALUE__']);
    } else {
      State.columnFilters[col.id] = checkedVals;
    }

    dropdown.remove();
    applyFiltersAndSort();
    renderList();
  });

  // Clear filter for this column
  dropdown.querySelector('#colFilterClear').addEventListener('click', () => {
    delete State.columnFilters[col.id];
    dropdown.remove();
    applyFiltersAndSort();
    renderList();
  });

  // Close
  dropdown.querySelector('#colFilterClose').addEventListener('click', () => dropdown.remove());

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', function outsideClick(e) {
      if (!dropdown.contains(e.target) && !triggerBtn.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);

  // Focus search
  setTimeout(() => searchInput.focus(), 100);
}

// ── V2: Delete column with custom confirm ─────────
let _v2PendingDeleteId = null;

function v2RequestDeleteColumn(colId, colLabel) {
  _v2PendingDeleteId = colId;
  const msgEl = document.getElementById('confirmDeleteMsg');
  if (msgEl) msgEl.innerHTML = 'Cột <strong style="color:var(--accent)">\u201C' + colLabel + '\u201D</strong> sẽ bị xóa khỏi bảng V2.<br>Thao tác này không ảnh hưởng đến Google Sheet.';
  document.getElementById('confirmDeleteCol').classList.remove('hidden');
}

async function v2ExecuteDeleteColumn() {
  if (!_v2PendingDeleteId) return;
  const cols = getV2Columns();
  const realIdx = cols.findIndex(c => c.id === _v2PendingDeleteId);
  if (realIdx >= 0) {
    const colToDelete = cols[realIdx];
    const removed = cols.splice(realIdx, 1);
    saveV2Columns(cols);

    // Ghi nhớ cột đã bị user xóa để form.js không hiển thị lại dưới dạng "Thông tin khác"
    if (colToDelete.headerName) {
      let delCols = JSON.parse(localStorage.getItem('bds_user_deleted_cols') || '[]');
      if (!delCols.includes(colToDelete.headerName)) delCols.push(colToDelete.headerName);
      localStorage.setItem('bds_user_deleted_cols', JSON.stringify(delCols));
      
      // THỰC TẾ XÓA CỘT TRÊN GOOGLE SHEET
      try {
        const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
        const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
        if (spreadsheetId && sheetName && State.headers) {
           const targetHeader = colToDelete.headerName.toLowerCase().trim();
           const sheetColIndex = State.headers.findIndex(h => h && h.toLowerCase().trim() === targetHeader);
           if (sheetColIndex >= 0) {
              showToast('Đang xóa vật lý cột trên Sheet...', 'info');
              const sheetIdNum = await SheetsAPI.getSheetId(spreadsheetId, sheetName);
              await SheetsAPI.deleteColumn(spreadsheetId, sheetName, sheetColIndex, sheetIdNum);
              SheetsAPI.invalidateCache();
              loadData(true); // reload table fully
           }
        }
      } catch (e) {
        console.error('Lỗi xóa cột trên Sheet:', e);
        showToast('Đã ẩn cột, nhưng lỗi xóa vật lý: ' + e.message, 'error');
      }
    }

    showToast('Đã xóa cột "' + (removed[0]?.label || '') + '"', 'success');
  }
  _v2PendingDeleteId = null;
  document.getElementById('confirmDeleteCol').classList.add('hidden');
  renderV2Table();
}

async function v2AddColumn(name, group, fieldType = 'text', options = []) {
  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  // Thêm cột vào Google Sheet trước
  if (spreadsheetId && sheetName) {
    try {
      showToast('Đang thêm cột vào Google Sheet…', 'info', 2000);
      await SheetsAPI.addColumnHeader(spreadsheetId, sheetName, name);
    } catch (err) {
      console.error('Lỗi thêm cột vào Sheet:', err);
      showToast('Lỗi thêm cột vào Sheet: ' + err.message, 'error');
      return;
    }
  }

  // Lưu vào V2 config với headerName + fieldType để map dữ liệu
  const cols = getV2Columns();
  const id = 'custom_' + Date.now();
  cols.push({ id, label: name, group: group || 'default', custom: true, headerName: name, fieldType, options });
  saveV2Columns(cols);

  // Xóa khỏi danh sách đã xóa nếu bị trùng tên
  let delCols = JSON.parse(localStorage.getItem('bds_user_deleted_cols') || '[]');
  delCols = delCols.filter(h => h !== name);
  localStorage.setItem('bds_user_deleted_cols', JSON.stringify(delCols));

  showToast(`Đã thêm cột "${name}" (${fieldType}) vào Sheet ✓`, 'success');

  // Reload data từ Sheet để cập nhật headers mới
  SheetsAPI.invalidateCache();
  await loadData(true);
}

// ─── View Toggle ──────────────────────────────────────────────────────────────
function setViewMode(mode) {
  State.viewMode = mode;
  localStorage.setItem('bds_view_mode', mode);
  document.querySelectorAll('#viewToggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  renderList();
}


// ─── Load Data ────────────────────────────────────────────────────────────────
async function loadData(forceRefresh = false) {
  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
  if (!spreadsheetId || !sheetName) return;

  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.textContent = '⏳';

  try {
    const { headers, rows } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName, forceRefresh);
    State.headers = headers;
    
    // Tự động dọn dẹp các cột custom đã bị xóa khỏi Google Sheet (khi sync)
    const currentCols = getV2Columns();
    let colsChanged = false;
    const prunedCols = currentCols.filter(col => {
      if (col.custom && col.headerName && !headers.includes(col.headerName)) {
        colsChanged = true;
        return false;
      }
      return true;
    });
    if (colsChanged) saveV2Columns(prunedCols);

    State.rows = rows; // lưu để dùng trong ColMapper
    State.colMap = buildColMap(headers);
    const isBDS = WorkspaceManager.isBDSMode(State.colMap);

    State.allRows = rows.filter((r) => {
      if (isBDS) {
        const addr = colVal(r, 'ADDRESS');
        const price = colVal(r, 'PRICE');
        const district = colVal(r, 'DISTRICT');
        const owner = colVal(r, 'OWNER');
        const phone = colVal(r, 'PHONE');
        
        const isValid = (addr && addr.trim()) || 
                        (district && district.trim()) || 
                        (owner && owner.trim()) || 
                        (phone && phone.trim()) || 
                        (price && price.trim() && !isNaN(parseFloat(price)));
        return isValid;
      } else {
        // Khác BĐS: Chỉ cần có ít nhất 1 dòng dữ liệu thực sự (không phải mảng _values trống)
        if (!r._values) return false;
        
        let hasData = false;
        Object.keys(r).forEach(k => {
          if (k !== '_row' && k !== '_values' && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
            if (String(r[k]) !== '#DIV/0!' && String(r[k]) !== '#REF!') {
              hasData = true;
            }
          }
        });
        return hasData;
      }
    });

    // Cập nhật UI filter theo chế độ BĐS hay Generic mode
    updateFilterUI(isBDS);

    applyFiltersAndSort();
    renderList();

    // (sheetRowCount removed — count is shown in listCount instead)

    // Nếu là BĐS sheet nhưng ADDRESS chưa map và chưa có saved mapping → gợi ý mapper
    // Bỏ qua hoàn toàn với generic sheet — ColMapper BĐS không có nghĩa với chúng
    if (isBDS) {
      const hasSavedMap = Object.keys(ColMapper.load()).length > 0;
      if (!State.colMap['ADDRESS'] && !hasSavedMap) {
        openColMapper();
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
  } finally {
    if (refreshIcon) refreshIcon.textContent = '🔄';
  }
}

// Mở cột mapper modal
function openColMapper() {
  // Xóa cache để đảm bảo headers mới nhất
  SheetsAPI.invalidateCache();

  const headers = State.headers || [];
  const rows = State.rows || State.allRows || [];
  const colMap = State.colMap || {};

  // Nếu chưa có headers → sheet trống
  if (headers.length === 0) {
    showToast('Sheet hiện trạng đăng trống hoặc chưa có cột dữ liệu (hàng 1). Vui lòng thêm cột vào Sheet!', 'error');
    return;
  }

  ColMapper.openMapper(headers, rows, colMap, async () => {
    // Sau khi lưu: force reload từ Google Sheets để áp dụng mapping mới
    await loadData(true);
    showToast('Đã áp dụng cấu hình cột ✓', 'success');
  });
}

// ─── Sheet Connection ─────────────────────────────────────────────────────────
async function connectSheet() {
  try {
    showToast('Đang mở Google Picker…', 'info', 5000);
    const result = await Auth.openSheetPicker();
    if (!result) return;

    const { spreadsheetId, name } = result;

    // Get sheet names
    const sheetNames = await SheetsAPI.getSheetNames(spreadsheetId);

    let chosenSheet = sheetNames[0];
    if (sheetNames.length > 1) {
      chosenSheet = await promptSheetSelect(sheetNames);
      if (!chosenSheet) return;
    }

    // ── Add to WorkspaceManager & switch ──
    const ws = WorkspaceManager.add(spreadsheetId, chosenSheet, name);
    WorkspaceManager.switchTo(ws.id);

    // Legacy sync (các phần code cũ vẫn đọc)
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_ID, spreadsheetId);
    localStorage.setItem(APP_CONFIG.STORAGE.SHEET_NAME, chosenSheet);
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME, name);

    const labelEl = document.getElementById('sheetNameLabel');
    if (labelEl) labelEl.textContent = name;
    document.getElementById('sheetInfoBar')?.classList.remove('hidden');

    WorkspaceSwitcher.updateNavBadge();
    showUI();
    await loadData(true);
    showToast(`Đã kết nối: ${name}`, 'success');
  } catch (err) {
    showToast('Lỗi kết nối Sheet: ' + err.message, 'error');
  }
}

// Prompt user to select sheet (simple modal)
function promptSheetSelect(sheetNames) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-sheet" style="max-width:360px">
        <div class="modal-handle"></div>
        <h3 style="margin-bottom:var(--space-4)">Chọn Sheet</h3>
        ${sheetNames.map((s) => `<button class="btn btn-secondary btn-full" style="margin-bottom:var(--space-2)" data-name="${s}">${s}</button>`).join('')}
        <button class="btn btn-ghost btn-full" id="cancelSheetSelect">Hủy</button>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-name]').forEach((btn) => {
      btn.addEventListener('click', () => { backdrop.remove(); resolve(btn.dataset.name); });
    });
    backdrop.querySelector('#cancelSheetSelect').addEventListener('click', () => { backdrop.remove(); resolve(null); });
  });
}

// ─── UI State Management ──────────────────────────────────────────────────────
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('connectBanner').classList.add('hidden');
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('fabAdd').classList.add('hidden');
  document.getElementById('btnSetupCols')?.classList.add('hidden');
  document.getElementById('btnChangeSheet')?.classList.add('hidden');
  document.getElementById('aiFabBtn')?.classList.add('hidden');
  document.getElementById('aiPanel')?.classList.add('hidden');
  // Ẩn bottom nav ở màn hình đăng nhập
  document.getElementById('bottomNav')?.classList.add('hidden');
}

function showConnectBanner() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('connectBanner').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('fabAdd').classList.add('hidden');
  // Ẩn bottom nav ở màn hình kết nối Sheet
  document.getElementById('bottomNav')?.classList.add('hidden');

  document.getElementById('aiFabBtn')?.classList.add('hidden');
  document.getElementById('aiPanel')?.classList.add('hidden');

  const userInfo = Auth.getUserInfo();
  if (userInfo) {
    const avatar = document.getElementById('userAvatar');
    if (avatar && userInfo.picture) { avatar.src = userInfo.picture; avatar.classList.remove('hidden'); }
    const nameEl = document.getElementById('userNameShort');
    if (nameEl) nameEl.textContent = userInfo.given_name || '';
    updateAccountModal(userInfo);
  }
}

function showUI() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('connectBanner').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
  document.getElementById('fabAdd').classList.remove('hidden');
  document.getElementById('btnSetupCols')?.classList.remove('hidden');
  document.getElementById('btnChangeSheet')?.classList.remove('hidden');
  document.getElementById('aiFabBtn')?.classList.remove('hidden');
  // Hiển thị workspace nav button
  const wsBtn = document.getElementById('btnWorkspace');
  if (wsBtn) wsBtn.style.display = '';
  // Hiển thị bottom nav cố định khi vào màn hình chính
  document.getElementById('bottomNav')?.classList.remove('hidden');

  const userInfo = Auth.getUserInfo();
  if (userInfo) {
    const avatar = document.getElementById('userAvatar');
    if (avatar && userInfo.picture) { avatar.src = userInfo.picture; avatar.classList.remove('hidden'); }
    const nameEl = document.getElementById('userNameShort');
    if (nameEl) nameEl.textContent = userInfo.given_name || '';
    updateAccountModal(userInfo);
  }
}

function updateAccountModal(info) {
  const el = (id) => document.getElementById(id);
  if (el('modalAvatar') && info.picture) el('modalAvatar').src = info.picture;
  if (el('modalUserName')) el('modalUserName').textContent = info.name || '';
  if (el('modalUserEmail')) el('modalUserEmail').textContent = info.email || '';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
let _appInitialized = false;  // guard: chỉ chạy 1 lần

async function init() {
  if (_appInitialized) return;
  _appInitialized = true;

  // 1. Chờ Google Identity Services (GIS) load — tối đa 6 giây
  let tries = 0;
  while (typeof google === 'undefined' && tries < 30) {
    await new Promise((r) => setTimeout(r, 200));
    tries++;
  }
  if (typeof google === 'undefined') {
    showToast('Không kết nối được Google. Kiểm tra mạng rồi tải lại trang!', 'error');
    showLoginScreen();
    return;
  }

  // 2. Chờ gapi (Picker) load — tối đa 5 giây rồi bỏ qua (Picker không bắt buộc để login)
  await new Promise((resolve) => {
    if (typeof gapi !== 'undefined') {
      gapi.load('picker', resolve);
    } else {
      // Nếu load event đã xong hoặc chưa → dùng timeout fallback
      const timeout = setTimeout(resolve, 5000); // bỏ qua sau 5s
      const onLoad = () => {
        clearTimeout(timeout);
        if (typeof gapi !== 'undefined') {
          gapi.load('picker', resolve);
        } else {
          resolve();
        }
        window.removeEventListener('load', onLoad);
      };
      if (document.readyState === 'complete') {
        // load event đã xảy ra rồi → gapi sẽ không load nữa → resolve ngay
        clearTimeout(timeout);
        resolve();
      } else {
        window.addEventListener('load', onLoad);
      }
    }
  });

  // 3. Khởi tạo Auth
  await Auth.init();

  // 4. Kiểm tra trạng thái đăng nhập
  if (!Auth.isSignedIn()) {
    showLoginScreen();
    return;
  }

  // 5. Kiểm tra Sheet đã kết nối chưa
  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  if (!spreadsheetId || !sheetName) {
    showConnectBanner();
    return;
  }

  // 6. Migrate legacy single-sheet → workspace system
  WorkspaceManager.migrate();

  // 7. Hiển thị UI chính và tải dữ liệu
  showUI();
  WorkspaceSwitcher.updateNavBadge();
  await loadData();

  // 7. Gán event chỉ sau khi UI đang hiển thị
  document.getElementById('searchInput')?.addEventListener('input', debounce((e) => {
    State.searchQuery = e.target.value.trim();
    applyFiltersAndSort();
    renderList();
  }, 300));

  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    State.sortBy = e.target.value;
    applyFiltersAndSort();
    renderList();
  });

  // Table row click → mở form.html
  document.getElementById('tableView')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-row]');
    if (tr) {
      const isBDS = WorkspaceManager.isBDSMode(State.colMap);
      window.location.href = isBDS ? `form.html?row=${tr.dataset.row}` : `form-generic.html`;
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // (View toggle removed — chỉ dùng V2 table)

  // Advanced Filter Modal Logic
  State.advancedFilter = { type: 'all', price: 'all', status: 'all' };

  const btnAdv = document.getElementById('btnAdvancedFilter');
  const advModal = document.getElementById('advancedFilterModal');
  const typeSel = document.getElementById('filterType');
  const priceSel = document.getElementById('filterPrice');
  const statusSel = document.getElementById('filterStatus');

  btnAdv?.addEventListener('click', () => {
    // Sync current state to UI
    typeSel.value = State.advancedFilter.type;
    priceSel.value = State.advancedFilter.price;
    statusSel.value = State.advancedFilter.status;
    advModal.classList.remove('hidden');
  });

  document.getElementById('btnCloseFilter')?.addEventListener('click', () => {
    advModal.classList.add('hidden');
  });
  
  document.getElementById('btnClearFilter')?.addEventListener('click', () => {
    typeSel.value = 'all';
    priceSel.value = 'all';
    statusSel.value = 'all';
  });

  document.getElementById('btnApplyFilter')?.addEventListener('click', () => {
    State.advancedFilter = {
      type: typeSel.value,
      price: priceSel.value,
      status: statusSel.value
    };
    advModal.classList.add('hidden');
    applyFiltersAndSort();
    renderList();
    
    // Highlight button if active filter differs from default
    if (State.advancedFilter.type !== 'all' || State.advancedFilter.price !== 'all' || State.advancedFilter.status !== 'all') {
      btnAdv.classList.add('badge-accent');
    } else {
      btnAdv.classList.remove('badge-accent');
    }
  });

  // FAB – route to BĐS form or generic form based on current workspace
  document.getElementById('fabAdd')?.addEventListener('click', () => {
    const isBDS = WorkspaceManager.isBDSMode(State.colMap);
    window.location.href = isBDS ? 'form.html' : 'form-generic.html';
  });

  // Refresh
  document.getElementById('btnRefresh')?.addEventListener('click', () => loadData(true));
  document.getElementById('btnChangeSheet')?.addEventListener('click', connectSheet);
  document.getElementById('btnPickSheet')?.addEventListener('click', connectSheet);

  // Workspace switcher nav button
  document.getElementById('btnWorkspace')?.addEventListener('click', (e) => {
    e.stopPropagation();
    WorkspaceSwitcher.open(async (wsId, action) => {
      if (action === 'import') {
        // User clicked "Import Sheet mới"
        await connectSheet();
        return;
      }
      if (wsId) {
        // Switch to another workspace
        SheetsAPI.invalidateCache();
        WorkspaceSwitcher.updateNavBadge();
        showUI();
        await loadData(true);
        showToast('Đã chuyển sheet ✓', 'success');
      }
    });
  });
  document.getElementById('btnSetupCols')?.addEventListener('click', openColMapper);
  document.getElementById('btnModalPickSheet')?.addEventListener('click', () => {
    closeModal(); connectSheet();
  });

  // Sign in
  document.getElementById('btnSignIn')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSignIn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang đăng nhập...'; }
    try {
      // Chờ GIS sẵn sàng
      let t = 0;
      while (typeof google === 'undefined' && t++ < 30) {
        await new Promise((r) => setTimeout(r, 200));
      }
      await Auth.init();
      await Auth.signIn();   // ← mở popup Google 1 lần duy nhất
      const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
      if (spreadsheetId) { showUI(); await loadData(true); } // <-- force refresh here
      else showConnectBanner();
    } catch (e) {
      showToast('Đăng nhập thất bại: ' + (e.message || 'Vui lòng thử lại'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> Đăng nhập với Google'; }
    }
  });

  // Sign out — reload page để kill GIS session khỏi memory
  document.getElementById('btnSignOut')?.addEventListener('click', () => {
    closeModal();
    Auth.signOut();           // xoá token + đánh dấu signed-out
    window.location.reload(); // reload hoàn toàn → GIS không thể auto sign-in lại
  });

  // Account modal
  document.getElementById('btnUser')?.addEventListener('click', openAccountModal);
  document.getElementById('navAccount')?.addEventListener('click', (e) => { e.preventDefault(); openAccountModal(); });
  document.getElementById('accountModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // New sheet
  document.getElementById('btnNewSheet')?.addEventListener('click', async (e) => {
    e.preventDefault();
    showToast('Tính năng tạo sheet mới sẽ được bổ sung sớm', 'info');
  });

  // ── V2 Column Modals ──
  // Add column modal
  document.getElementById('confirmAddCol')?.addEventListener('click', () => {
    const name = document.getElementById('newColName').value.trim();
    if (!name) { showToast('Vui lòng nhập tên cột', 'warning'); return; }
    const group      = document.getElementById('newColGroup').value;
    const fieldType  = document.getElementById('newColType')?.value || 'text';
    const optionsRaw = document.getElementById('newColOptions')?.value || '';
    const options    = fieldType === 'select'
      ? optionsRaw.split('\n').map(s => s.trim()).filter(Boolean)
      : [];
    document.getElementById('addColModal').classList.add('hidden');
    v2AddColumn(name, group, fieldType, options);
  });
  document.getElementById('cancelAddCol')?.addEventListener('click', () => {
    document.getElementById('addColModal').classList.add('hidden');
  });
  document.getElementById('addColModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('addColModal').classList.add('hidden');
  });

  // Delete column confirm
  document.getElementById('execDeleteCol')?.addEventListener('click', () => v2ExecuteDeleteColumn());
  document.getElementById('cancelDeleteCol')?.addEventListener('click', () => {
    _v2PendingDeleteId = null;
    document.getElementById('confirmDeleteCol').classList.add('hidden');
  });
  document.getElementById('confirmDeleteCol')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      _v2PendingDeleteId = null;
      document.getElementById('confirmDeleteCol').classList.add('hidden');
    }
  });

  // ── AI Chat Panel ──
  initAIChat();

  init();
});

function openAccountModal() {
  document.getElementById('accountModal')?.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('accountModal')?.classList.add('hidden');
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
function initAIChat() {
  const fab = document.getElementById('aiFabBtn');
  const panel = document.getElementById('aiPanel');
  const closeBtn = document.getElementById('aiCloseBtn');
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  const messagesEl = document.getElementById('aiMessages');
  const setupEl = document.getElementById('aiSetup');
  const quickEl = document.getElementById('aiQuickActions');
  
  const sessionSelect = document.getElementById('aiSessionSelect');
  const newChatBtn = document.getElementById('aiNewChatBtn');
  const exportDocsBtn = document.getElementById('aiExportDocsBtn');

  if (!fab || !panel) return;

  // Render chat history
  function renderHistory() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    const history = GeminiAI.getChatHistory();
    if (history.length === 0) {
      messagesEl.innerHTML = `
        <div class="ai-welcome">
          <div style="font-size:2rem;margin-bottom:var(--space-3)">🏠✨</div>
          <p style="font-weight:600;margin-bottom:var(--space-2)">Xin chào! Tôi là trợ lý AI BĐS.</p>
          <p class="text-muted text-small">Hỏi tôi về dữ liệu khảo sát: tóm tắt, so sánh, phân tích giá, tìm BĐS tiềm năng…</p>
        </div>`;
    } else {
      for (const msg of history) {
         if (msg.role === 'user') appendMessage('user', msg.parts[0].text);
         else if (msg.role === 'model') appendMessage('ai', msg.parts[0].text);
      }
    }
  }

  // Cập nhật Dropdown Sessions
  function updateSessionSelect() {
    if (!sessionSelect) return;
    const list = GeminiAI.getSessionsList();
    sessionSelect.innerHTML = list.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    sessionSelect.value = GeminiAI.getActiveId();
  }
  
  window._triggerSessionUIDocUpdate = updateSessionSelect;

  // Toggle panel
  fab.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      updateAISetupVisibility();
      updateSessionSelect();
      renderHistory();
      setTimeout(() => input?.focus(), 200);
    }
  });

  closeBtn?.addEventListener('click', () => panel.classList.add('hidden'));

  // Đổi Session
  sessionSelect?.addEventListener('change', (e) => {
    GeminiAI.switchSession(e.target.value);
    updateSessionSelect(); // refresh để đảm bảo title hiển thị đúng
    renderHistory();
  });

  // Tạo Chat Mới
  newChatBtn?.addEventListener('click', () => {
    GeminiAI.startNewSession();
    updateSessionSelect();
    renderHistory();
    input?.focus();
    showToast('Đã tạo chat mới', 'success');
  });

  // Xuất Google Docs
  exportDocsBtn?.addEventListener('click', async () => {
      exportDocsBtn.disabled = true;
      const originalText = exportDocsBtn.textContent;
      exportDocsBtn.textContent = '⏱️ Đang lưu...';
      try {
        const url = await GeminiAI.exportActiveSessionToDocs();
        showToast('Đã lưu thành công vào Google Docs', 'success');
        window.open(url, '_blank');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
         exportDocsBtn.textContent = originalText;
         exportDocsBtn.disabled = false;
      }
  });

  // API key save
  document.getElementById('aiSaveKey')?.addEventListener('click', () => {
    const key = document.getElementById('aiKeyInput').value.trim();
    if (!key) { showToast('Vui lòng nhập API key', 'warning'); return; }
    GeminiAI.setApiKey(key);
    updateAISetupVisibility();
    showToast('Đã lưu API key ✓', 'success');
  });

  // Settings → show key input again
  document.getElementById('aiSettingsBtn')?.addEventListener('click', () => {
    if (setupEl) {
      setupEl.style.display = setupEl.style.display === 'none' ? 'block' : 'none';
      const keyInput = document.getElementById('aiKeyInput');
      if (keyInput) keyInput.value = GeminiAI.getApiKey();
    }
  });

  // Clear history
  document.getElementById('aiClearBtn')?.addEventListener('click', () => {
    GeminiAI.clearHistory();
    renderHistory();
    showToast('Đã xóa lịch sử cuộc trò chuyện này', 'success');
  });

  // Send message
  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    text = text.trim();

    // Remove welcome
    const welcome = messagesEl?.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    appendMessage('user', text);

    // Clear input
    if (input) input.value = '';

    // Show typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'ai-typing';
    typingEl.innerHTML = '<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';
    messagesEl?.appendChild(typingEl);
    scrollToBottom();

    // Disable input
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.disabled = true;

    try {
      const reply = await GeminiAI.chat(text);
      typingEl.remove();
      appendMessage('ai', reply);
      updateSessionSelect(); // refresh title có thể đã được AI generate
    } catch (err) {
      typingEl.remove();
      if (err.message === 'NO_API_KEY') {
        appendMessage('error', '⚠️ Chưa có API key. Nhấn ⚙️ để cài đặt.');
        if (setupEl) setupEl.style.display = 'block';
      } else if (err.message.startsWith('API chưa được bật')) {
        appendMessage('error', '❌ API chưa được bật. Vào console.cloud.google.com → APIs → bật "Generative Language API". Hoặc dùng key từ aistudio.google.com');
      } else {
        appendMessage('error', '❌ ' + err.message);
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) { input.disabled = false; input.focus(); }
    }
  }

  sendBtn?.addEventListener('click', () => sendMessage(input?.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  // Quick action chips
  quickEl?.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (chip) sendMessage(chip.dataset.prompt);
  });

  function appendMessage(type, text) {
    const div = document.createElement('div');
    if (type === 'user') {
      div.className = 'ai-msg ai-msg-user';
      div.textContent = text;
    } else if (type === 'ai') {
      div.className = 'ai-msg ai-msg-ai';
      div.innerHTML = simpleMarkdownToHTML(text);
    } else {
      div.className = 'ai-msg ai-msg-error';
      div.textContent = text;
    }
    messagesEl?.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    if (messagesEl) {
      requestAnimationFrame(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }
  }

  function updateAISetupVisibility() {
    const hasKey = !!GeminiAI.getApiKey();
    if (setupEl) setupEl.style.display = hasKey ? 'none' : 'block';
    if (messagesEl) messagesEl.style.display = hasKey ? 'flex' : 'none';
    if (quickEl) quickEl.style.display = hasKey ? 'flex' : 'none';
    if (sessionSelect) sessionSelect.style.display = hasKey ? 'inline-block' : 'none';
    if (newChatBtn) newChatBtn.style.display = hasKey ? 'inline-flex' : 'none';
    if (exportDocsBtn) exportDocsBtn.style.display = hasKey ? 'inline-flex' : 'none';
  }
}

/**
 * Simple Markdown → HTML cho AI responses
 */
function simpleMarkdownToHTML(text) {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--bg-base);padding:8px 12px;border-radius:8px;overflow-x:auto;font-size:0.8rem;margin:4px 0"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<div style="font-weight:700;font-size:0.92rem;margin:8px 0 4px;color:var(--accent)">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:0.95rem;margin:8px 0 4px;color:var(--accent)">$1</div>')
    // Bullet points
    .replace(/^[-•] (.+)$/gm, '<div style="padding-left:12px;position:relative"><span style="position:absolute;left:0">•</span>$1</div>')
    // Numbered list
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px;position:relative"><span style="position:absolute;left:0;color:var(--accent);font-weight:600">$1.</span>$2</div>')
    // Line breaks
    .replace(/\n\n/g, '<div style="height:8px"></div>')
    .replace(/\n/g, '<br>');
}
