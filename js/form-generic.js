/**
 * BĐS Survey App – Generic Form Logic
 * ====================================
 * Tự động generate form từ headers của bất kỳ Google Sheet nào.
 * Dùng cho các workspace không phải BĐS mode.
 */

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.2s'; setTimeout(()=>t.remove(),250); }, duration);
}

// ── State ───────────────────────────────────────────────────────────────────────
const GFormState = {
  mode: 'add',        // 'add' | 'edit'
  rowIndex: null,
  headers: [],
  colMap: {},
  existingData: null,
  spreadsheetId: null,
  sheetName: null,
};

// ── Column Type Detection ────────────────────────────────────────────────────────
function detectFieldType(headerName, sampleValues = []) {
  const h = (headerName || '').toLowerCase().trim();

  // Pattern matching trên tên cột
  if (/email|e-mail|mail/.test(h))                          return 'email';
  if (/phone|sđt|sdt|tel|điện thoại|dien thoai/.test(h))   return 'tel';
  if (/date|ngày|ngay|thời gian|thoi gian/.test(h))         return 'date';
  if (/url|link|http|website|web/.test(h))                  return 'url';
  if (/note|ghi chú|ghi chu|mô tả|mo ta|description|nhận xét/.test(h)) return 'textarea';
  if (/checkbox|có\/không|yes\/no|đồng ý/.test(h))         return 'checkbox';

  // Phân tích sample values
  const filled = sampleValues.filter(v => v && String(v).trim());
  if (filled.length >= 3) {
    // Tất cả đều là số → number
    const allNum = filled.every(v => !isNaN(parseFloat(String(v).replace(/,/g,'.'))));
    if (allNum) return 'number';

    // Ít unique values → select
    const unique = new Set(filled.map(v => String(v).trim()));
    if (unique.size <= 6 && filled.length >= 8) return 'select';
  }

  return 'text';
}

// ── Build field config from headers ──────────────────────────────────────────────
function buildFieldConfigs(headers, sampleRows = []) {
  return headers.map((header, idx) => {
    if (!header || header.startsWith('_')) return null;
    const samples = sampleRows.map(r => r._values?.[idx] || '').filter(Boolean);
    const type    = detectFieldType(header, samples);
    // Collect unique values cho select
    let options = [];
    if (type === 'select') {
      options = [...new Set(samples.map(v => String(v).trim()).filter(Boolean))].sort();
    }
    return { header, idx, type, options };
  }).filter(Boolean);
}

// ── Render one form field ─────────────────────────────────────────────────────────
function renderField(field, existingVal = '') {
  const id = `gfield_${field.idx}`;
  const label = field.header;
  const val   = _esc(existingVal);

  let input = '';
  switch (field.type) {
    case 'textarea':
      input = `<textarea class="form-control" id="${id}" data-header="${_esc(field.header)}" rows="3" placeholder="${_esc(label)}…">${val}</textarea>`;
      break;
    case 'select':
      input = `
        <select class="form-control" id="${id}" data-header="${_esc(field.header)}">
          <option value="">— Chọn —</option>
          ${field.options.map(o => `<option value="${_esc(o)}"${o === existingVal ? ' selected' : ''}>${_esc(o)}</option>`).join('')}
        </select>`;
      break;
    case 'checkbox':
      input = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
          <input type="checkbox" id="${id}" data-header="${_esc(field.header)}" ${existingVal === 'TRUE' || existingVal === '1' || existingVal === 'true' ? 'checked' : ''}
            style="width:20px;height:20px;accent-color:var(--accent);cursor:pointer;">
          <label for="${id}" style="cursor:pointer;color:var(--text-primary)">${_esc(label)}</label>
        </div>`;
      // Trả về ngay (không cần thêm label bên ngoài)
      return `<div class="gform-field">${input}</div>`;
    case 'number':
      input = `<input type="number" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val}" placeholder="0" step="any">`;
      break;
    case 'date':
      input = `<input type="date" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val ? _toDateValue(val) : ''}">`;
      break;
    case 'email':
      input = `<input type="email" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val}" placeholder="example@email.com">`;
      break;
    case 'tel':
      input = `<input type="tel" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val}" placeholder="0912 345 678">`;
      break;
    case 'url':
      input = `<input type="url" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val}" placeholder="https://…">`;
      break;
    default:
      input = `<input type="text" class="form-control" id="${id}" data-header="${_esc(field.header)}" value="${val}" placeholder="${_esc(label)}…">`;
  }

  return `
    <div class="gform-field">
      <label class="form-label" for="${id}">${_esc(label)}</label>
      ${input}
    </div>`;
}

function _toDateValue(str) {
  // Try parsing common date formats → yyyy-mm-dd for input[type=date]
  try {
    const d = new Date(str);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  } catch (_) {}
  return '';
}

// ── Render full form ─────────────────────────────────────────────────────────────
function renderGenericForm(fields, existingData) {
  const container = document.getElementById('gFormFields');
  if (!container) return;
  container.innerHTML = fields.map(f => {
    const val = existingData ? (existingData[f.header] || '') : '';
    return renderField(f, val);
  }).join('');
}

// ── Collect form values ──────────────────────────────────────────────────────────
function collectFormValues(fields) {
  const values = {};
  fields.forEach(f => {
    const id  = `gfield_${f.idx}`;
    const el  = document.getElementById(id);
    if (!el) return;
    if (f.type === 'checkbox') {
      values[f.header] = el.checked ? 'TRUE' : 'FALSE';
    } else {
      values[f.header] = el.value || '';
    }
  });
  return values;
}

// ── Save to Sheet ────────────────────────────────────────────────────────────────
async function saveGenericRow(fields) {
  const btn = document.getElementById('gFormSave');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu…'; }

  try {
    const values   = collectFormValues(fields);
    const rowArray = GFormState.headers.map(h => values[h] || '');

    const { spreadsheetId, sheetName, rowIndex, mode } = GFormState;

    if (mode === 'edit' && rowIndex) {
      // Update existing row (rowIndex = 1-based sheet row, header is row 1, data starts row 2)
      const range = `'${sheetName}'!A${rowIndex + 1}`;
      await SheetsAPI.updateRow(spreadsheetId, sheetName, rowIndex, rowArray);
      showToast('Đã cập nhật dòng ✓', 'success');
    } else {
      // Append new row
      await SheetsAPI.appendRow(spreadsheetId, sheetName, rowArray);
      showToast('Đã thêm dòng mới ✓', 'success');
    }

    SheetsAPI.invalidateCache();
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  } catch (err) {
    console.error('[GenericForm] Save error:', err);
    showToast('Lỗi lưu: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu'; }
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Chờ Google + Auth init
  let tries = 0;
  while (typeof google === 'undefined' && tries++ < 30) {
    await new Promise(r => setTimeout(r, 200));
  }
  await Auth.init();

  if (!Auth.isSignedIn()) {
    window.location.href = 'index.html';
    return;
  }

  GFormState.spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  GFormState.sheetName     = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  if (!GFormState.spreadsheetId || !GFormState.sheetName) {
    window.location.href = 'index.html';
    return;
  }

  // Load headers + sample rows
  let headers = [], sampleRows = [];
  try {
    const { headers: h, rows } = await SheetsAPI.getCachedRows(GFormState.spreadsheetId, GFormState.sheetName);
    headers    = h || [];
    sampleRows = rows?.slice(0, 20) || [];
  } catch (err) {
    showToast('Không thể tải headers: ' + err.message, 'error');
    return;
  }

  GFormState.headers = headers;

  // Check edit mode: _rowData in localStorage
  const rawRowData = localStorage.getItem('_rowData');
  if (rawRowData) {
    try {
      GFormState.existingData = JSON.parse(rawRowData);
      GFormState.mode         = 'edit';
      GFormState.rowIndex     = GFormState.existingData._row;
      localStorage.removeItem('_rowData');
    } catch (_) {}
  }

  // Build field configs
  const fields = buildFieldConfigs(headers, sampleRows);

  // Render form
  renderGenericForm(fields, GFormState.existingData);

  // Title
  const ws = WorkspaceManager.getActive();
  const titleEl = document.getElementById('gFormTitle');
  if (titleEl) {
    titleEl.textContent = GFormState.mode === 'edit'
      ? `✏️ Sửa dòng`
      : `➕ Thêm dòng mới`;
  }
  const subtitleEl = document.getElementById('gFormSubtitle');
  if (subtitleEl) subtitleEl.textContent = ws ? `${ws.icon} ${ws.name}` : GFormState.sheetName;

  const modeEl = document.getElementById('gFormMode');
  if (modeEl) modeEl.textContent = GFormState.mode === 'edit' ? 'Cập nhật' : 'Thêm mới';

  // Save button
  document.getElementById('gFormSave')?.addEventListener('click', () => saveGenericRow(fields));

  // Cancel
  document.getElementById('gFormCancel')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // User avatar
  const userInfo = Auth.getUserInfo();
  if (userInfo) {
    const avatar = document.getElementById('userAvatar');
    if (avatar && userInfo.picture) { avatar.src = userInfo.picture; avatar.classList.remove('hidden'); }
  }
});

// ── Utils ─────────────────────────────────────────────────────────────────────────
function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
