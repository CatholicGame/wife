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
  viewMode: localStorage.getItem('bds_view_mode') || 'table', // 'card' | 'table'
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
function applyFiltersAndSort() {
  let rows = [...State.allRows];

  // Search
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    rows = rows.filter((r) => {
      return ['ADDRESS', 'DISTRICT', 'OWNER', 'NOTES'].some((key) => {
        const v = colVal(r, key).toLowerCase();
        return v.includes(q);
      });
    });
  }

  // Type filter
  if (State.activeFilter && State.activeFilter !== 'all') {
    rows = rows.filter((r) => colVal(r, 'TYPE') === State.activeFilter);
  }

  // Status filter
  if (State.activeStatus) {
    rows = rows.filter((r) => colVal(r, 'STATUS') === State.activeStatus);
  }

  // Sort
  rows.sort((a, b) => {
    switch (State.sortBy) {
      case 'score-desc': return (parseFloat(colVal(b, 'SCORE')) || 0) - (parseFloat(colVal(a, 'SCORE')) || 0);
      case 'price-asc':  return (parseFloat(colVal(a, 'PRICE')) || 0) - (parseFloat(colVal(b, 'PRICE')) || 0);
      case 'price-desc': return (parseFloat(colVal(b, 'PRICE')) || 0) - (parseFloat(colVal(a, 'PRICE')) || 0);
      case 'area-desc':  return (parseFloat(colVal(b, 'AREA')) || 0) - (parseFloat(colVal(a, 'AREA')) || 0);
      default: return row_desc(a, b); // date-desc
    }
  });

  State.filtered = rows;
}

function row_desc(a, b) {
  // Sort by row index descending (newer rows = larger index = newer)
  return b._row - a._row;
}

// ─── Render (dispatcher) ──────────────────────────────────────────────────────
function renderList() {
  const cardContainer = document.getElementById('propertiesList');
  const tableContainer = document.getElementById('tableView');
  const countEl = document.getElementById('listCount');

  if (countEl) {
    countEl.textContent = State.filtered.length === 0
      ? '0 kết quả'
      : `${State.filtered.length} bất động sản`;
  }

  if (State.filtered.length === 0) {
    const empty = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Không tìm thấy</h3>
        <p>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
      </div>`;
    if (cardContainer) cardContainer.innerHTML = empty;
    if (tableContainer) tableContainer.innerHTML = empty;
    return;
  }

  const refactorContainer = document.getElementById('refactorView');

  if (State.viewMode === 'table') {
    if (cardContainer) cardContainer.classList.add('hidden');
    if (refactorContainer) refactorContainer.classList.add('hidden');
    if (tableContainer) { tableContainer.classList.remove('hidden'); renderTable(); }
  } else if (State.viewMode === 'refactor') {
    if (cardContainer) cardContainer.classList.add('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (refactorContainer) refactorContainer.classList.remove('hidden');
  } else {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (refactorContainer) refactorContainer.classList.add('hidden');
    if (cardContainer) { cardContainer.classList.remove('hidden'); renderCards(); }
  }
}

function renderCards() {
  const container = document.getElementById('propertiesList');
  if (!container) return;
  container.innerHTML = State.filtered.map(renderCard).join('');
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

  // Một event listener duy nhất xử lý tất cả click
  container.querySelector('table').addEventListener('click', e => {
    const target = e.target.closest('[data-rownum]');
    if (!target) return;
    const rowNum = parseInt(target.dataset.rownum);
    const rowObj = window._rowMap[rowNum];
    if (!rowObj) return;
    localStorage.setItem('_rowData', JSON.stringify(rowObj));
    window.location.href = 'form.html';
  });
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
    State.rows = rows; // lưu để dùng trong ColMapper
    State.colMap = buildColMap(headers);
    State.allRows = rows.filter((r) => {
      // Chỉ giữ dòng có địa chỉ hoặc giá
      const addr = colVal(r, 'ADDRESS');
      const price = colVal(r, 'PRICE');
      const district = colVal(r, 'DISTRICT');
      if (addr && addr.trim()) return true;
      if (price && price.trim() && !isNaN(parseFloat(price))) return true;
      if (district && district.trim()) return true;
      // Fallback: kiểm tra raw values có ít nhất 3 ô không trống
      if (!r._values) return false;
      const nonEmpty = r._values.filter(v => v && String(v).trim() && String(v) !== '#DIV/0!').length;
      return nonEmpty >= 3;
    });
    applyFiltersAndSort();
    renderList();

    document.getElementById('sheetRowCount') && (document.getElementById('sheetRowCount').textContent = State.allRows.length);

    // Nếu ADDRESS chưa map được và chưa có saved mapping → tự mở mapper
    const hasSavedMap = Object.keys(ColMapper.load()).length > 0;
    if (!State.colMap['ADDRESS'] && !hasSavedMap) {
      openColMapper();
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

  // Nếu chưa có headers → reload trước rồi mở
  if (headers.length === 0) {
    loadData(true).then(() => openColMapper());
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
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_ID, spreadsheetId);
    localStorage.setItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME, name);

    // Get sheet names
    const sheetNames = await SheetsAPI.getSheetNames(spreadsheetId);

    let chosenSheet = sheetNames[0];
    if (sheetNames.length > 1) {
      // Prompt user to pick a sheet
      chosenSheet = await promptSheetSelect(sheetNames);
      if (!chosenSheet) return;
    }

    localStorage.setItem(APP_CONFIG.STORAGE.SHEET_NAME, chosenSheet);
    document.getElementById('sheetNameLabel').textContent = name;
    document.getElementById('sheetInfoBar').classList.remove('hidden');

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
  document.getElementById('sheetInfoBar').classList.add('hidden');
}

function showConnectBanner() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('connectBanner').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('fabAdd').classList.add('hidden');

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
  document.getElementById('sheetInfoBar').classList.remove('hidden');

  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME);
  if (sheetName) document.getElementById('sheetNameLabel').textContent = sheetName;

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
async function init() {
  // Wait for GIS to load
  let tries = 0;
  while (typeof google === 'undefined' && tries < 20) {
    await new Promise((r) => setTimeout(r, 200));
    tries++;
  }

  // Wait for picker API
  await new Promise((resolve) => {
    if (typeof gapi !== 'undefined') {
      gapi.load('picker', resolve);
    } else {
      window.addEventListener('load', () => {
        if (typeof gapi !== 'undefined') gapi.load('picker', resolve);
        else resolve();
      });
    }
  });

  await Auth.init();

  if (!Auth.isSignedIn()) {
    showLoginScreen();
    return;
  }

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  if (!spreadsheetId || !sheetName) {
    showConnectBanner();
    return;
  }

  showUI();
  await loadData();

  // Events
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

  // Table row click → mở form.html (giống giao diện nhập liệu)
  document.getElementById('tableView')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-row]');
    if (tr) {
      window.location.href = `form.html?row=${tr.dataset.row}`;
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // View toggle
  document.getElementById('viewToggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (btn) setViewMode(btn.dataset.view);
  });
  // Sync toggle button active state on load
  document.querySelectorAll('#viewToggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === State.viewMode);
  });

  // Filter chips
  document.getElementById('filterRow')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    if (chip.dataset.filter) {
      State.activeFilter = chip.dataset.filter;
      State.activeStatus = null;
    } else if (chip.dataset.status) {
      State.activeFilter = 'all';
      State.activeStatus = chip.dataset.status;
    }
    applyFiltersAndSort();
    renderList();
  });

  // FAB
  document.getElementById('fabAdd')?.addEventListener('click', () => {
    window.location.href = 'form.html';
  });

  // Refresh
  document.getElementById('btnRefresh')?.addEventListener('click', () => loadData(true));
  document.getElementById('btnChangeSheet')?.addEventListener('click', connectSheet);
  document.getElementById('btnPickSheet')?.addEventListener('click', connectSheet);
  document.getElementById('btnSetupCols')?.addEventListener('click', openColMapper);
  document.getElementById('btnModalPickSheet')?.addEventListener('click', () => {
    closeModal(); connectSheet();
  });

  // Sign in
  document.getElementById('btnSignIn')?.addEventListener('click', async () => {
    try {
      await new Promise((resolve) => {
        let t = 0;
        const wait = () => { if (typeof google !== 'undefined') resolve(); else if (t++ < 30) setTimeout(wait, 200); };
        wait();
      });
      await Auth.init();
      await Auth.requestToken();
      const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
      if (spreadsheetId) { showUI(); await loadData(); }
      else showConnectBanner();
    } catch (e) { showToast('Đăng nhập thất bại: ' + e.message, 'error'); }
  });

  // Sign out
  document.getElementById('btnSignOut')?.addEventListener('click', () => {
    Auth.signOut();
    showLoginScreen();
    closeModal();
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

  init();
});

function openAccountModal() {
  document.getElementById('accountModal')?.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('accountModal')?.classList.add('hidden');
}
