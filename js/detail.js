/**
 * BĐS Survey App – Detail Page
 */

function showToast(msg, type = 'info', dur = 3500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.2s'; setTimeout(() => t.remove(), 250); }, dur);
}

function formatPrice(val) {
  const n = parseFloat(String(val).replace(/,/g, '.'));
  if (isNaN(n)) return val || '—';
  if (n >= 1) return n.toFixed(n % 1 === 0 ? 0 : 2) + ' tỷ';
  return Math.round(n * 1000) + ' triệu';
}

function getScoreClass(score) {
  const n = parseFloat(score);
  if (isNaN(n)) return '';
  if (n >= 7) return 'score-high';
  if (n >= 5) return 'score-med';
  return 'score-low';
}

function buildColMap(headers) {
  const map = {};
  Object.keys(APP_CONFIG.KNOWN_COLUMNS).forEach((key) => {
    const idx = findColumnIndex(headers, key);
    if (idx >= 0) map[key] = { index: idx, name: headers[idx] };
  });
  // Ưu tiên dùng saved mapping của ColMapper (nếu có)
  if (typeof ColMapper !== 'undefined') {
    return ColMapper.buildColMap(headers, map);
  }
  return map;
}

function colVal(row, colMap, key) {
  const col = colMap[key];
  return col ? (row[col.name] || '') : '';
}

// ─── Render detail ────────────────────────────────────────────────────────────
function renderDetail(row, headers, colMap) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('detailContent').style.display = 'block';

  const cv = (key) => colVal(row, colMap, key);

  const address = cv('ADDRESS') || '(Không có địa chỉ)';
  const district = cv('DISTRICT');
  const price = formatPrice(cv('PRICE'));
  const area = cv('AREA');
  const priceM2 = cv('PRICE_M2');
  const owner = cv('OWNER');
  const phone = cv('PHONE');
  const type = cv('TYPE');
  const score = cv('SCORE');
  const status = cv('STATUS');
  const date = cv('DATE');
  const lat = cv('LAT');
  const lng = cv('LNG');
  const mapsLink = cv('MAPS_LINK');
  const notes = cv('NOTES');

  document.getElementById('detailAddress').textContent = address;
  document.getElementById('detailDistrict').textContent = [district, type].filter(Boolean).join(' • ');
  document.getElementById('detailPrice').textContent = price;

  // Score badge
  if (score) {
    const sb = document.getElementById('detailScoreBadge');
    sb.textContent = parseFloat(score).toFixed(1);
    sb.className = `score-badge ${getScoreClass(score)}`;
  }

  // Hero price
  document.getElementById('heroPriceBadge').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      ${type ? `<span class="badge badge-accent">${type}</span>` : ''}
      ${status ? `<span class="badge badge-yellow">${status}</span>` : ''}
      ${date ? `<span class="badge badge-blue">${date}</span>` : ''}
    </div>`;

  // Info grid
  const infoItems = [
    { label: 'Diện tích sổ', value: area ? area + ' m²' : '—' },
    { label: 'Giá/m²', value: priceM2 ? formatPrice(priceM2) + '/m²' : '—' },
    { label: 'Mặt tiền', value: cv('FRONT') ? cv('FRONT') + ' m' : '—' },
    { label: 'Đường trước', value: cv('ROAD') ? cv('ROAD') + ' m' : '—' },
    { label: 'Số tầng', value: cv('FLOORS') || '—' },
    { label: 'Phòng ngủ', value: cv('BEDROOMS') || '—' },
    { label: 'Hướng', value: cv('DIR') || '—' },
    { label: 'Pháp lý', value: cv('LEGAL') || '—' },
  ].filter((item) => item.value !== '—');

  document.getElementById('infoGrid').innerHTML = infoItems.map((item) => `
    <div class="info-item">
      <div class="info-label">${item.label}</div>
      <div class="info-value">${item.value}</div>
    </div>`).join('');

  // Action buttons
  const actions = [];
  if (phone) actions.push(`<a href="tel:${phone}" class="btn btn-secondary">📞 Gọi</a>`);
  if (mapsLink || (lat && lng)) {
    const url = mapsLink || `https://www.google.com/maps?q=${lat},${lng}`;
    actions.push(`<a href="${url}" target="_blank" class="btn btn-secondary">🗺️ Maps</a>`);
  }
  actions.push(`<a href="form.html?row=${row._row}" class="btn btn-primary">✏️ Sửa</a>`);
  document.getElementById('actionButtons').innerHTML = actions.join('');

  // Bottom bar links
  if (phone) document.getElementById('btnCallOwner').href = `tel:${phone}`;
  if (mapsLink || (lat && lng)) {
    const url = mapsLink || `https://www.google.com/maps?q=${lat},${lng}`;
    document.getElementById('btnOpenMaps').href = url;
  }
  document.getElementById('btnEditBottom').href = `form.html?row=${row._row}`;

  // Mini map – luôn hiện section, nếu không có toạ độ thì cho chọn vị trí
  document.getElementById('mapSection').style.display = 'block';
  if (lat && lng) {
    setTimeout(() => {
      const map = L.map('miniMap').setView([parseFloat(lat), parseFloat(lng)], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map).bindPopup(address).openPopup();
    }, 100);
  } else if (mapsLink) {
    // Có link maps nhưng không có tọa độ → hiện nút
    document.getElementById('miniMap').innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-surface);gap:8px">
        <span style="font-size:2rem">🗺️</span>
        <a href="${mapsLink}" target="_blank" class="btn btn-secondary" style="font-size:0.82rem">🗺️ Mở Google Maps</a>
      </div>`;
  } else {
    // Không có gì → cho phép pick vị trí
    document.getElementById('miniMap').innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-surface);gap:8px">
        <span style="font-size:2rem">📍</span>
        <span style="color:var(--text-secondary);font-size:0.82rem">Chưa có vị trí</span>
        <button class="btn btn-primary" style="font-size:0.82rem" id="btnPickLocation">📍 Chọn vị trí trên bản đồ</button>
      </div>`;
    document.getElementById('btnPickLocation')?.addEventListener('click', () => {
      openLocationPicker(row, colMap);
    });
  }

  // Ratings bars
  const ratingDefs = [
    { label: 'Vị trí', hints: ['vị trí', 'vi tri', 'location'] },
    { label: 'Giá cả', hints: ['giá cả', 'gia ca', 'price rating'] },
    { label: 'Pháp lý', hints: ['pháp lý', 'phap ly', 'legal'] },
    { label: 'Thông số', hints: ['thông số', 'thong so', 'spec'] },
    { label: 'Nội thất', hints: ['nội thất', 'noi that', 'interior'] },
  ];
  const ratingData = ratingDefs.map((rd) => {
    const idx = headers.findIndex((h) =>
      rd.hints.some((hint) => h.toLowerCase().includes(hint))
    );
    return { label: rd.label, value: idx >= 0 ? (row._values?.[idx] || '') : '' };
  }).filter((r) => r.value);

  if (ratingData.length > 0) {
    document.getElementById('ratingsSection').style.display = 'block';
    document.getElementById('ratingBars').innerHTML = ratingData.map((r) => `
      <div class="rating-bar-item">
        <span class="rating-bar-label">${r.label}</span>
        <div class="rating-bar-track">
          <div class="rating-bar-fill" style="width:${Math.min(100, parseFloat(r.value) * 10)}%"></div>
        </div>
        <span class="rating-bar-val">${r.value}</span>
      </div>`).join('');
  }

  // Notes
  const notesTexts = [
    { label: 'Ưu điểm', value: cv('PROS') },
    { label: 'Nhược điểm', value: cv('CONS') },
    { label: 'Ghi chú', value: notes },
  ].filter((n) => n.value);

  if (notesTexts.length > 0) {
    document.getElementById('notesSection').style.display = 'block';
    document.getElementById('notesContent').innerHTML = notesTexts.map((n) => `
      <div style="margin-bottom:var(--space-3)">
        <div class="text-xs text-muted" style="margin-bottom:4px">${n.label}</div>
        <div class="text-block">${n.value}</div>
      </div>`).join('');
  }

  // All fields table
  const allFields = headers.map((h, i) => ({
    label: h,
    value: row._values?.[i] || '',
  })).filter((f) => f.value);

  document.getElementById('allFieldsGrid').innerHTML = allFields.map((f) => `
    <div class="info-item" style="text-align:left">
      <div class="info-label">${f.label}</div>
      <div class="info-value" style="font-size:0.82rem;font-weight:500;word-break:break-all">${f.value}</div>
    </div>`).join('');

  // Button actions
  document.getElementById('btnEdit').addEventListener('click', () => {
    window.location.href = `form.html?row=${row._row}`;
  });

  document.getElementById('btnShare').addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({ title: address, url: location.href });
    } else {
      navigator.clipboard.writeText(location.href);
      showToast('Đã copy link ✓');
    }
  });

  document.getElementById('btnDelete').addEventListener('click', async () => {
    if (!confirm(`Xóa BĐS "${address}"?\nThao tác này không thể hoàn tác.`)) return;
    try {
      const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
      const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
      const sheetId = await SheetsAPI.getSheetId(spreadsheetId, sheetName);
      await SheetsAPI.deleteRow(spreadsheetId, sheetName, row._row, sheetId);
      SheetsAPI.invalidateCache();
      showToast('Đã xóa BĐS', 'success');
      setTimeout(() => (window.location.href = 'index.html'), 1000);
    } catch (err) {
      showToast('Lỗi xóa: ' + err.message, 'error');
    }
  });
}

// ─── Load photos ──────────────────────────────────────────────────────────────
async function loadPhotos(folderId, container) {
  if (!folderId) return;
  try {
    document.getElementById('photoLoading').style.display = 'block';
    const photos = await DriveAPI.listPhotos(folderId);
    document.getElementById('photoLoading').style.display = 'none';

    photos.forEach((photo) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-photo';
      const thumbUrl = DriveAPI.getThumbnailUrl(photo.id, 300);
      thumb.innerHTML = `
        <img src="${thumbUrl}" alt="" loading="lazy" onerror="this.src=''">
        <button class="photo-del-btn" data-id="${photo.id}" title="Xóa ảnh">✕</button>`;
      thumb.querySelector('img').addEventListener('click', () => openLightbox(DriveAPI.getDirectUrl(photo.id)));
      thumb.querySelector('.photo-del-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Xóa ảnh này?')) return;
        try {
          await DriveAPI.deleteFile(photo.id);
          thumb.remove();
          showToast('Đã xóa ảnh', 'success');
        } catch (err) { showToast('Lỗi xóa ảnh', 'error'); }
      });
      container.insertBefore(thumb, container.firstChild);
    });
  } catch (err) {
    document.getElementById('photoLoading').style.display = 'none';
    console.error('Load photos error:', err);
  }
}

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.remove('hidden');
}

// ─── Camera / Upload photo ────────────────────────────────────────────────────
async function addPhoto(row, colMap, headers) {
  const folderId = colVal(row, colMap, 'DRIVE_FOLDER');
  let activeFolderId = folderId;

  if (!activeFolderId) {
    const address = colVal(row, colMap, 'ADDRESS');
    showToast('Đang tạo thư mục ảnh…', 'info', 3000);
    try {
      activeFolderId = await DriveAPI.ensurePropertyFolder(address || `row_${row._row}`);
      // Save folder ID back to sheet
      const folderCol = colMap['DRIVE_FOLDER'];
      if (folderCol) {
        const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
        const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
        await SheetsAPI.updateCell(spreadsheetId, sheetName, row._row, folderCol.index, activeFolderId);
        SheetsAPI.invalidateCache();
      }
    } catch (err) {
      showToast('Lỗi tạo folder: ' + err.message, 'error'); return;
    }
  }

  const result = await DriveAPI.capturePhoto();
  if (!result) return;

  showToast('Đang upload ảnh…', 'info', 5000);
  try {
    const filename = `photo_${Date.now()}.jpg`;
    const uploaded = await DriveAPI.uploadPhoto(activeFolderId, result.blob, filename);

    // Add to gallery
    const container = document.getElementById('galleryGrid');
    const thumb = document.createElement('div');
    thumb.className = 'gallery-photo';
    thumb.innerHTML = `<img src="${result.dataUrl}" alt="" onclick="openLightbox('${DriveAPI.getDirectUrl(uploaded.id)}')">`;
    container.insertBefore(thumb, container.firstChild);

    showToast('Ảnh đã upload ✓', 'success');

    // Update photo count in sheet
    const countCol = colMap['PHOTO_COUNT'];
    if (countCol) {
      const currentCount = parseInt(colVal(row, colMap, 'PHOTO_COUNT') || '0');
      const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
      const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
      await SheetsAPI.updateCell(spreadsheetId, sheetName, row._row, countCol.index, currentCount + 1);
      SheetsAPI.invalidateCache();
    }
  } catch (err) {
    showToast('Lỗi upload: ' + err.message, 'error');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initDetail() {
  let t = 0;
  while (typeof google === 'undefined' && t++ < 20) await new Promise((r) => setTimeout(r, 200));
  await Auth.init();

  if (!Auth.isSignedIn()) {
    showToast('Vui lòng đăng nhập', 'error');
    setTimeout(() => (window.location.href = 'index.html'), 1500);
    return;
  }

  const params = new URLSearchParams(location.search);
  const rowParam = params.get('row');
  if (!rowParam) { window.location.href = 'index.html'; return; }

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
  if (!spreadsheetId || !sheetName) { window.location.href = 'index.html'; return; }

  try {
    const { headers, rows } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
    const row = rows.find((r) => r._row === parseInt(rowParam));
    if (!row) throw new Error('Không tìm thấy BĐS');

    const colMap = buildColMap(headers);
    renderDetail(row, headers, colMap);

    // Load photos
    const folderId = colVal(row, colMap, 'DRIVE_FOLDER');
    const galleryGrid = document.getElementById('galleryGrid');
    loadPhotos(folderId, galleryGrid);

    // Load first photo as hero
    if (folderId) {
      const photos = await DriveAPI.listPhotos(folderId).catch(() => []);
      if (photos.length > 0) {
        const heroImg = document.getElementById('heroImg');
        heroImg.src = DriveAPI.getThumbnailUrl(photos[0].id, 800);
        heroImg.classList.remove('hidden');
        document.getElementById('heroEmoji').style.display = 'none';
      }
    }

    // Camera button
    document.getElementById('btnAddPhoto').addEventListener('click', () => addPhoto(row, colMap, headers));

    // Lightbox click outside
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.target.classList.add('hidden');
    });

  } catch (err) {
    console.error(err);
    document.getElementById('loadingState').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <h3>Lỗi tải dữ liệu</h3>
        <p>${err.message}</p>
        <a href="index.html" class="btn btn-primary" style="margin-top:var(--space-4)">← Quay lại</a>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', initDetail);
window.openLightbox = openLightbox;

// ─── Location Picker (fullscreen map) ─────────────────────────────────────────
async function openLocationPicker(row, colMap) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:500; background:var(--bg-base);
    display:flex; flex-direction:column;
  `;
  overlay.innerHTML = `
    <div style="padding:12px 16px;display:flex;align-items:center;gap:8px;
                background:var(--bg-card);border-bottom:1px solid var(--border);flex-shrink:0">
      <button id="locPickerClose" style="background:none;border:none;color:var(--text-primary);font-size:1.1rem;cursor:pointer">←</button>
      <span style="font-weight:700;flex:1">📍 Chọn vị trí BĐS</span>
      <button id="locPickerSave" class="btn btn-primary" style="font-size:0.82rem;padding:6px 16px">💾 Lưu</button>
    </div>
    <div style="font-size:0.78rem;color:var(--text-secondary);padding:8px 16px;background:var(--bg-surface);flex-shrink:0">
      Nhấn vào bản đồ để chọn vị trí. Kéo marker để chỉnh.
    </div>
    <div id="locPickerMap" style="flex:1"></div>
  `;
  document.body.appendChild(overlay);

  // Default center: Hanoi
  const defaultCenter = [21.0285, 105.8542];
  const map = L.map('locPickerMap').setView(defaultCenter, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);

  let marker = null;
  let pickedLat = null, pickedLng = null;

  // Try browser geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      },
      () => {}, { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  map.on('click', (e) => {
    pickedLat = e.latlng.lat;
    pickedLng = e.latlng.lng;
    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng, { draggable: true }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      pickedLat = pos.lat;
      pickedLng = pos.lng;
    });
  });

  // Close
  overlay.querySelector('#locPickerClose').addEventListener('click', () => overlay.remove());

  // Save
  overlay.querySelector('#locPickerSave').addEventListener('click', async () => {
    if (!pickedLat || !pickedLng) {
      showToast('Chưa chọn vị trí!', 'error');
      return;
    }

    const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
    const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

    try {
      // Save lat/lng to sheet
      const latCol = colMap['LAT'];
      const lngCol = colMap['LNG'];

      if (latCol && lngCol) {
        await SheetsAPI.updateCell(spreadsheetId, sheetName, row._row, latCol.index, pickedLat.toFixed(6));
        await SheetsAPI.updateCell(spreadsheetId, sheetName, row._row, lngCol.index, pickedLng.toFixed(6));
      }

      // Also save Google Maps link
      const mapsCol = colMap['MAPS_LINK'];
      if (mapsCol) {
        const mapsUrl = `https://www.google.com/maps?q=${pickedLat.toFixed(6)},${pickedLng.toFixed(6)}`;
        await SheetsAPI.updateCell(spreadsheetId, sheetName, row._row, mapsCol.index, mapsUrl);
      }

      SheetsAPI.invalidateCache();
      showToast('Đã lưu vị trí ✓', 'success');
      overlay.remove();

      // Reload page to show map
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      showToast('Lỗi lưu vị trí: ' + err.message, 'error');
    }
  });
}
