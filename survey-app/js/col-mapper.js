/**
 * BĐS Survey App – Column Mapper
 * ================================
 * Giao diện cho user tự assign cột từ Sheet vào các trường dữ liệu.
 * Lưu vào localStorage, ưu tiên hơn auto-detect.
 */

const ColMapper = (() => {
  const STORAGE_KEY = 'bds_col_mapping';

  // Các trường cần map (theo thứ tự ưu tiên hiển thị)
  const FIELDS = [
    { key: 'ADDRESS',    label: 'Địa chỉ',        required: true,  icon: '📍' },
    { key: 'DISTRICT',   label: 'Quận/Huyện',      required: false, icon: '🗺️' },
    { key: 'TYPE',       label: 'Loại BĐS',        required: false, icon: '🏠' },
    { key: 'AREA',       label: 'Diện tích (m²)',  required: false, icon: '📐' },
    { key: 'PRICE',      label: 'Giá (tỷ)',        required: false, icon: '💰' },
    { key: 'PRICE_M2',   label: 'Giá/m² (tr)',     required: false, icon: '📊' },
    { key: 'OWNER',      label: 'Đầu chủ / Tên',  required: false, icon: '👤' },
    { key: 'PHONE',      label: 'Số điện thoại',   required: false, icon: '📞' },
    { key: 'DATE',       label: 'Ngày khảo sát',   required: false, icon: '📅' },
    { key: 'STATUS',     label: 'Tình trạng',      required: false, icon: '🔖' },
    { key: 'SCORE',      label: 'Tổng điểm',       required: false, icon: '⭐' },
    { key: 'NOTES',      label: 'Ghi chú',         required: false, icon: '📝' },
    { key: 'MAPS_LINK',  label: 'Link Maps',       required: false, icon: '🔗' },
    { key: 'LAT',        label: 'Vĩ độ (Lat)',     required: false, icon: '🧭' },
    { key: 'LNG',        label: 'Kinh độ (Lng)',   required: false, icon: '🧭' },
    { key: 'DRIVE_FOLDER', label: 'Drive Folder ID', required: false, icon: '📁' },
  ];

  // Load saved mapping
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  // Save mapping { KEY: headerName }
  function save(mapping) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  }

  // Clear mapping (re-run auto-detect)
  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Build colMap using saved mapping (takes priority over auto-detect)
  function buildColMap(headers, autoColMap) {
    const saved = load();
    if (Object.keys(saved).length === 0) return autoColMap; // Chưa setup → dùng auto

    // NFC-normalize headers array for indexOf comparison
    const nfcHeaders = headers.map(h => (h || '').normalize('NFC').trim());

    const map = { ...autoColMap };
    Object.entries(saved).forEach(([key, headerName]) => {
      if (!headerName) return; // bỏ qua empty – không xóa auto map
      const nfcName = headerName.normalize('NFC').trim();
      const idx = nfcHeaders.indexOf(nfcName);
      if (idx >= 0) map[key] = { index: idx, name: headers[idx] };
    });
    return map;
  }

  // ── Open Mapper Modal ───────────────────────────────────────────────────────
  function openMapper(headers, sampleRows, currentColMap, onSave) {
    document.getElementById('colMapperModal')?.remove();

    const saved = load();

    // Build preview: first 3 data values per column
    const previews = headers.map((h, i) => {
      const vals = sampleRows.slice(0, 3).map(r => (r._values?.[i] || '')).filter(Boolean);
      return vals.slice(0, 2).join(', ');
    });

    const modal = document.createElement('div');
    modal.id = 'colMapperModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:300;
      display:flex; align-items:flex-end; justify-content:center;
      backdrop-filter:blur(4px);
    `;

    modal.innerHTML = `
      <div style="
        background:var(--bg-card); border-radius:20px 20px 0 0;
        border:1px solid var(--border); border-bottom:none;
        width:100%; max-width:680px; max-height:90vh;
        display:flex; flex-direction:column; overflow:hidden;
      ">
        <div style="padding:20px 20px 12px; border-bottom:1px solid var(--border); flex-shrink:0">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <h3 style="margin:0;font-size:1rem">⚙️ Gán cột từ Google Sheet</h3>
              <p style="margin:4px 0 0;font-size:0.78rem;color:var(--text-secondary)">
                Chọn cột trong Sheet tương ứng với từng trường dữ liệu
              </p>
            </div>
            <button id="colMapperClose" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--text-secondary);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem">✕</button>
          </div>
        </div>

        <div style="overflow-y:auto;flex:1;padding:16px 20px">
          <table style="width:100%;border-collapse:collapse;font-size:0.83rem">
            <thead>
              <tr style="color:var(--text-secondary);text-align:left">
                <th style="padding:6px 8px;font-weight:600">Trường</th>
                <th style="padding:6px 8px;font-weight:600">Cột trong Sheet</th>
                <th style="padding:6px 8px;font-weight:600;color:var(--text-muted)">Ví dụ giá trị</th>
              </tr>
            </thead>
            <tbody id="colMapperRows">
              ${FIELDS.map(f => {
                const currentHeader = saved[f.key] || currentColMap[f.key]?.name || '';
                return `
                  <tr style="border-top:1px solid var(--border)">
                    <td style="padding:8px;white-space:nowrap">
                      ${f.icon} <b>${f.label}</b>${f.required ? ' <span style="color:var(--red)">*</span>' : ''}
                    </td>
                    <td style="padding:8px">
                      <select data-key="${f.key}" style="
                        width:100%; background:var(--bg-surface); border:1px solid var(--border);
                        border-radius:8px; padding:6px 8px; color:var(--text-primary);
                        font-size:0.8rem; cursor:pointer;
                      ">
                        <option value="">— Không có / Bỏ qua —</option>
                        ${headers.filter(h => !h.startsWith('_col')).map((h, i) => `
                          <option value="${h}" ${h === currentHeader ? 'selected' : ''}>
                            ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? String.fromCharCode(64 + Math.floor(i/26)) : ''}: ${h}
                          </option>
                        `).join('')}
                      </select>
                    </td>
                    <td style="padding:8px;color:var(--text-secondary);font-size:0.75rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      <span id="preview_${f.key}">${currentHeader ? previews[headers.indexOf(currentHeader)] || '—' : '—'}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="padding:16px 20px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:12px">
          <button id="colMapperReset" class="btn btn-secondary" style="flex:1">🔄 Reset về tự động</button>
          <button id="colMapperSave" class="btn btn-primary" style="flex:2">💾 Lưu cấu hình cột</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Update preview on select change
    modal.querySelectorAll('select[data-key]').forEach(sel => {
      sel.addEventListener('change', () => {
        const key = sel.dataset.key;
        const headerName = sel.value;
        const idx = headers.indexOf(headerName);
        const preview = modal.querySelector(`#preview_${key}`);
        if (preview) preview.textContent = idx >= 0 ? (previews[idx] || '—') : '—';
      });
    });

    // Close
    modal.querySelector('#colMapperClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Reset
    modal.querySelector('#colMapperReset').addEventListener('click', () => {
      clear();
      modal.remove();
      if (onSave) onSave({});
      window.showToast?.('Đã reset về tự động nhận cột', 'info');
    });

    // Save
    modal.querySelector('#colMapperSave').addEventListener('click', () => {
      const mapping = {};
      modal.querySelectorAll('select[data-key]').forEach(sel => {
        if (sel.value) mapping[sel.dataset.key] = sel.value;
      });
      save(mapping);
      modal.remove();
      if (onSave) onSave(mapping);
      window.showToast?.('Đã lưu cấu hình cột ✓', 'success');
    });
  }

  return { load, save, clear, buildColMap, openMapper, FIELDS };
})();

window.ColMapper = ColMapper;
