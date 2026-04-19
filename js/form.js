/**
 * BĐS Survey App – Form Page Logic
 * ===================================
 * Thêm / sửa BĐS, ghi vào Google Sheet
 */

// Toast helper (shared)
function showToast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.2s'; setTimeout(()=>t.remove(),250); }, duration);
}

// Trả về chuỗi datetime-local theo giờ địa phương: "2026-04-18T23:44"
function nowLocalIso() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ─── Rating definitions ────────────────────────────────────────────────────────
const RATINGS = [
  { key: 'RATING_LOCATION', label: 'Vị trí', weight: 0.30, fieldHints: ['vị trí', 'vi tri', 'location'] },
  { key: 'RATING_PRICE',    label: 'Giá cả',  weight: 0.25, fieldHints: ['giá', 'gia', 'price'] },
  { key: 'RATING_LEGAL',    label: 'Pháp lý', weight: 0.20, fieldHints: ['pháp lý', 'phap ly', 'legal'] },
  { key: 'RATING_SPEC',     label: 'Thông số', weight: 0.15, fieldHints: ['thông số', 'thong so', 'spec'] },
  { key: 'RATING_INTERIOR', label: 'Nội thất', weight: 0.10, fieldHints: ['nội thất', 'noi that', 'interior'] },
];

const ratingValues = {};
RATINGS.forEach((r) => (ratingValues[r.key] = 0));

// ─── State ────────────────────────────────────────────────────────────────────
const FormState = {
  mode: 'add',     // 'add' | 'edit'
  rowIndex: null,
  headers: [],
  colMap: {},
  existingData: null,
};

// ─── Column Map ───────────────────────────────────────────────────────────────
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

// ─── Ratings UI ───────────────────────────────────────────────────────────────
function initRatings() {
  const container = document.getElementById('ratingsContainer');
  if (!container) return;

  container.innerHTML = RATINGS.map((r) => `
    <div class="rating-item">
      <span class="rating-name">${r.label} <span class="text-xs text-muted">${(r.weight * 100).toFixed(0)}%</span></span>
      <div class="rating-stars" data-key="${r.key}">
        ${[1,2,3,4,5,6,7,8,9,10].map((n) =>
          `<button type="button" class="star-btn" data-value="${n}" title="${n}">★</button>`
        ).join('')}
      </div>
      <span class="rating-value" id="rv_${r.key}">0</span>
    </div>
  `).join('');

  container.querySelectorAll('.rating-stars').forEach((stars) => {
    stars.addEventListener('click', (e) => {
      const btn = e.target.closest('.star-btn');
      if (!btn) return;
      const key = stars.dataset.key;
      const val = parseInt(btn.dataset.value);
      ratingValues[key] = val;
      updateStars(stars, val);
      document.getElementById(`rv_${key}`).textContent = val;
      updateTotalScore();
    });
  });
}

function updateStars(container, value) {
  container.querySelectorAll('.star-btn').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.value) <= value);
  });
}

function updateTotalScore() {
  let total = 0;
  let hasAny = false;
  RATINGS.forEach((r) => {
    const v = ratingValues[r.key] || 0;
    if (v > 0) hasAny = true;
    total += v * r.weight;
  });

  const display = document.getElementById('totalScoreDisplay');
  const valueEl = document.getElementById('totalScoreValue');
  if (!display || !valueEl) return;

  if (hasAny) {
    display.style.display = 'block';
    valueEl.textContent = total.toFixed(1) + ' / 10';
    const cls = total >= 7 ? 'score-high' : total >= 5 ? 'score-med' : 'score-low';
    valueEl.style.color = total >= 7 ? 'var(--score-high)' : total >= 5 ? 'var(--score-med)' : 'var(--score-low)';
  } else {
    display.style.display = 'none';
  }
}

// ─── Auto-calc price/m² ───────────────────────────────────────────────────────
function setupAutoCalc() {
  const priceEl = document.getElementById('field_PRICE');
  const areaEl = document.getElementById('field_AREA');
  const priceM2El = document.getElementById('field_PRICE_M2');

  function calc() {
    const p = parseFloat(priceEl?.value);
    const a = parseFloat(areaEl?.value);
    if (priceM2El && !isNaN(p) && !isNaN(a) && a > 0) {
      const m2 = (p * 1e9) / a; // convert tỷ to đồng, then per m2
      priceM2El.value = formatVND(m2);
    } else if (priceM2El) {
      priceM2El.value = '';
    }
  }

  priceEl?.addEventListener('input', calc);
  areaEl?.addEventListener('input', calc);
}

function formatVND(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' tr';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

// ─── GPS & Reverse Geocoding ───────────────────────────────────────────────────
async function reverseGeocodeToForm(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'vi' }
    });
    const data = await res.json();
    if (data && data.address) {
      const addr = data.address;
      
      // Lấy tên Phường / Xã
      const ward = addr.suburb || addr.village || addr.quarter || addr.hamlet || '';
      // Lấy Quận / Huyện
      const district = addr.city_district || addr.county || addr.town || addr.city || '';
      // Lấy chi tiết số nhà, tên đường
      const street = addr.road || '';
      const houseNum = addr.house_number || '';
      
      // Ghép thành Address Local
      let fullAddress = [houseNum, street].filter(Boolean).join(' ');
      if (ward) fullAddress += (fullAddress ? ', ' : '') + ward;
      
      const addrEl = document.getElementById('field_ADDRESS');
      const distEl = document.getElementById('field_DISTRICT');
      
      // Tự động điền nếu ô đang trống hoặc user đồng ý ghi đè
      if (addrEl && (!addrEl.value || addrEl.value.trim() === '')) {
        addrEl.value = fullAddress;
      }
      
      if (distEl && (!distEl.value || distEl.value.trim() === '')) {
        // Chuẩn hóa tên "Quận " "Huyện" nếu API OSM trả thiếu hoặc thừa
        let dName = district.replace(/^(Quận|Huyện|Thành phố)\s+/i, '').trim();
        distEl.value = dName;
      }
    }
  } catch (err) {
    console.error('Reverse Geocode error:', err);
  }
}

function setupGPS() {
  document.getElementById('btnGetGPS')?.addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Thiết bị không hỗ trợ GPS', 'error'); return; }
    showToast('Đang lấy vị trí…', 'info', 3000);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const latEl = document.getElementById('field_LAT');
        const lngEl = document.getElementById('field_LNG');
        if (latEl) latEl.value = lat;
        if (lngEl) lngEl.value = lng;
        
        showToast('Đã lấy tọa độ ✓ Đang phân tích địa chỉ...', 'info');
        updateMapsLink(lat, lng);
        await reverseGeocodeToForm(lat, lng);
        showToast('Khởi tạo vị trí hoàn tất ✓', 'success');
      },
      (err) => showToast('Lỗi GPS: ' + err.message, 'error'),
      { enableHighAccuracy: true }
    );
  });

  ['field_LAT', 'field_LNG'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      const lat = document.getElementById('field_LAT')?.value;
      const lng = document.getElementById('field_LNG')?.value;
      if (lat && lng) updateMapsLink(lat, lng);
    });
  });
}

// ─── Hình ảnh (Google Drive) ──────────────────────────────────────────────────

const CATEGORIES_KEY = 'bds_photo_categories';
const DEFAULT_CATEGORIES = ['1-3 tỉ', '3-4 tỉ', '4-5 tỉ', '5-7 tỉ', '7-10 tỉ', '10+ tỉ'];

function getCategories() {
  try {
    const saved = localStorage.getItem(CATEGORIES_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [...DEFAULT_CATEGORIES];
}

function saveCategories(cats) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

function setupPhotos() {
  const fileInput = document.getElementById('filePhotos');
  const btnPick = document.getElementById('btnPickPhotos');
  const folderSelect = document.getElementById('folderSelect');
  const categorySelect = document.getElementById('categorySelect');
  const btnNewFolder = document.getElementById('btnNewFolder');
  const btnNewCategory = document.getElementById('btnNewCategory');

  if (!fileInput) return;

  // Populate category dropdown
  populateCategories();

  // Load folders from Drive
  loadFolderList();

  // Pick photos button → open file input
  btnPick?.addEventListener('click', () => fileInput.click());

  // When folder changes → load gallery from that folder
  folderSelect?.addEventListener('change', async () => {
    const folderId = folderSelect.value;
    if (!folderId) return;
    FormState.driveFolderId = folderId;
    const idInput = document.getElementById('field_DRIVE_FOLDER');
    if (idInput) idInput.value = folderId;

    // Reset category → load gallery from parent folder
    if (categorySelect) categorySelect.value = '';
    await loadGallery(folderId);
  });

  // When category changes → find/create subfolder and load gallery
  categorySelect?.addEventListener('change', async () => {
    const cat = categorySelect.value;
    const parentId = folderSelect?.value;
    if (!cat || !parentId) return;

    try {
      showToast('Đang mở nhóm "' + cat + '"…', 'info', 2000);
      const subFolderId = await DriveAPI.findOrCreateFolder(cat, parentId);
      FormState.driveFolderId = subFolderId;
      const idInput = document.getElementById('field_DRIVE_FOLDER');
      if (idInput) idInput.value = subFolderId;
      await loadGallery(subFolderId);
    } catch (err) {
      console.error('Category folder error:', err);
      showToast('Lỗi mở nhóm: ' + err.message, 'error');
    }
  });

  // Create new folder
  btnNewFolder?.addEventListener('click', async () => {
    const name = prompt('Tên folder mới:');
    if (!name || !name.trim()) return;

    try {
      showToast('Đang tạo folder…', 'info', 2000);
      const rootId = await DriveAPI.ensureRootFolder();
      const newId = await DriveAPI.findOrCreateFolder(name.trim(), rootId);

      // Add to dropdown & select it
      const opt = document.createElement('option');
      opt.value = newId;
      opt.textContent = '📁 ' + name.trim();
      folderSelect?.appendChild(opt);
      if (folderSelect) folderSelect.value = newId;

      FormState.driveFolderId = newId;
      const idInput = document.getElementById('field_DRIVE_FOLDER');
      if (idInput) idInput.value = newId;

      showToast('Đã tạo folder "' + name.trim() + '" ✓', 'success');
      await loadGallery(newId);
    } catch (err) {
      showToast('Lỗi tạo folder: ' + err.message, 'error');
    }
  });

  // Create new category
  btnNewCategory?.addEventListener('click', () => {
    const name = prompt('Tên nhóm giá mới (VD: 5-7 tỉ):');
    if (!name || !name.trim()) return;

    const cats = getCategories();
    if (cats.includes(name.trim())) {
      showToast('Nhóm này đã tồn tại', 'warning');
      return;
    }
    cats.push(name.trim());
    saveCategories(cats);

    // Add to dropdown & select
    const opt = document.createElement('option');
    opt.value = name.trim();
    opt.textContent = '🏷️ ' + name.trim();
    categorySelect?.appendChild(opt);
    if (categorySelect) categorySelect.value = name.trim();

    showToast('Đã thêm nhóm "' + name.trim() + '" ✓', 'success');

    // Trigger change to create subfolder
    categorySelect?.dispatchEvent(new Event('change'));
  });

  // File input change → upload
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    try {
      // Ensure we have a target folder
      if (!FormState.driveFolderId) {
        // Auto-create from address if no folder selected
        if (folderSelect?.value) {
          FormState.driveFolderId = folderSelect.value;
        } else {
          const addressLabel = document.getElementById('field_ADDRESS')?.value || 'Nhà_Mới';
          FormState.driveFolderId = await DriveAPI.ensurePropertyFolder(addressLabel);
          const idInput = document.getElementById('field_DRIVE_FOLDER');
          if (idInput) idInput.value = FormState.driveFolderId;
          // Refresh folder list to include the new folder
          loadFolderList();
        }
      }

      // If category is selected, use category subfolder
      const cat = categorySelect?.value;
      let uploadFolderId = FormState.driveFolderId;
      if (cat && folderSelect?.value) {
        uploadFolderId = await DriveAPI.findOrCreateFolder(cat, folderSelect.value);
        FormState.driveFolderId = uploadFolderId;
      }

      await uploadPhotos(files, uploadFolderId);
      await loadGallery(uploadFolderId);

      // Reset file input
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      showToast('Lỗi Upload: ' + err.message, 'error');
    }
  });
}

function populateCategories() {
  const sel = document.getElementById('categorySelect');
  if (!sel) return;

  const cats = getCategories();
  // Keep the default "— Chọn nhóm —" option
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = '🏷️ ' + cat;
    sel.appendChild(opt);
  });
}

async function loadFolderList() {
  const sel = document.getElementById('folderSelect');
  if (!sel) return;

  try {
    const rootId = await DriveAPI.ensureRootFolder();
    const folders = await DriveAPI.listSubFolders(rootId);

    // Clear existing options (keep first)
    while (sel.options.length > 1) sel.remove(1);

    folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = '📁 ' + f.name;
      sel.appendChild(opt);
    });

    // Auto-select if form has a saved folder ID
    if (FormState.driveFolderId) {
      sel.value = FormState.driveFolderId;
    }
  } catch (err) {
    console.error('Load folders error:', err);
  }
}

async function uploadPhotos(files, folderId) {
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressBar = document.getElementById('uploadProgressBar');
  const statusText = document.getElementById('uploadStatusText');
  const percentText = document.getElementById('uploadPercent');

  if (progressContainer) progressContainer.classList.remove('hidden');

  let successCount = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      if (statusText) statusText.textContent = `Đang nén ảnh ${i + 1}/${files.length}`;
      const compressed = await DriveAPI.compressImage(files[i], 1920, 0.8);

      if (statusText) statusText.textContent = `Đang tải ảnh ${i + 1}/${files.length}`;
      await DriveAPI.uploadPhoto(folderId, compressed, files[i].name);
      
      successCount++;
      const p = Math.round(((i + 1) / files.length) * 100);
      if (progressBar) progressBar.style.width = p + '%';
      if (percentText) percentText.textContent = p + '%';
    } catch (err) {
      console.error('Lỗi upload file thứ', i, err);
      showToast(`Không thể tải ảnh thứ ${i + 1}`, 'error');
    }
  }

  // Update photo count
  const countInput = document.getElementById('field_PHOTO_COUNT');
  if (countInput) {
    const cur = parseInt(countInput.value || '0');
    countInput.value = cur + successCount;
  }

  showToast(`Đã tải lên ${successCount} ảnh`, 'success');
  if (progressContainer) {
    setTimeout(() => { progressContainer.classList.add('hidden'); }, 1000);
  }
}

async function loadGallery(folderId) {
  const gallery = document.getElementById('photoGallery');
  const countBadge = document.getElementById('photoCountBadge');
  if (!gallery) return;

  gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-size:0.8rem;color:var(--text-muted)">Đang tải danh sách ảnh...</div>';
  
  try {
    const photos = await DriveAPI.listPhotos(folderId);
    
    if (countBadge) countBadge.textContent = `${photos.length} ảnh`;
    const countInput = document.getElementById('field_PHOTO_COUNT');
    if (countInput) countInput.value = photos.length;

    if (photos.length === 0) {
      gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.8rem;padding:var(--space-2) 0">Chưa có hình ảnh nào</div>';
      return;
    }

    gallery.innerHTML = photos.map(p => `
      <div style="position:relative;padding-top:100%;border-radius:var(--radius-md);overflow:hidden;background:#f0f0f0">
        <a href="${p.webViewLink}" target="_blank">
          <img src="${p.thumbnailLink}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" alt="${p.name}">
        </a>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    gallery.innerHTML = '<div style="grid-column:1/-1;color:var(--red);font-size:0.8rem">Không thể tải ảnh</div>';
  }
}

function updateMapsLink(lat, lng) {
  const link = document.getElementById('mapsLink');
  if (link) {
    link.href = `https://www.google.com/maps?q=${lat},${lng}`;
    link.classList.remove('hidden');
  }
  const mapsInput = document.getElementById('field_MAPS_LINK');
  if (mapsInput && !mapsInput.value) {
    mapsInput.value = `https://www.google.com/maps?q=${lat},${lng}`;
  }
  showMapPreview(parseFloat(lat), parseFloat(lng));
}

// ─── Mini Map Preview ─────────────────────────────────────────────────────────
let _miniMap = null;

function initLeafletMap(lat, lng) {
  const preview = document.getElementById('mapPreview');
  const fallback = document.getElementById('mapLinkFallback');
  if (preview) preview.style.display = 'block';
  if (fallback) fallback.style.display = 'none';

  setTimeout(() => {
    if (typeof L === 'undefined') return;
    if (_miniMap) {
      _miniMap.setView([lat, lng], 16);
      _miniMap.eachLayer(l => { if (l instanceof L.Marker) _miniMap.removeLayer(l); });
      L.marker([lat, lng]).addTo(_miniMap);
      return;
    }
    _miniMap = L.map('miniMap', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_miniMap);
    _miniMap.setView([lat, lng], 16);
    L.marker([lat, lng]).addTo(_miniMap);
  }, 100);
}

async function showMapPreview(lat, lng, fallbackUrl) {
  const preview = document.getElementById('mapPreview');
  const fallback = document.getElementById('mapLinkFallback');

  // Ưu tiên 1: có tọa độ → Leaflet ngay
  const fLat = parseFloat(lat), fLng = parseFloat(lng);
  if (!isNaN(fLat) && !isNaN(fLng)) {
    initLeafletMap(fLat, fLng);
    return;
  }

  // Ưu tiên 2: geocode địa chỉ bằng Nominatim (OSM, miễn phí)
  const addr = (document.getElementById('field_ADDRESS')?.value?.trim() || '')
             + ' ' + (document.getElementById('field_DISTRICT')?.value?.trim() || '');
  if (addr.trim().length > 3) {
    try {
      const q = encodeURIComponent(addr.trim() + ', Thành phố Hồ Chí Minh, Việt Nam');
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, { headers: { 'Accept-Language': 'vi' } });
      const data = await res.json();
      if (data && data[0]) { initLeafletMap(parseFloat(data[0].lat), parseFloat(data[0].lon)); return; }
    } catch (_) {}
  }

  // Fallback: Google Maps embed iframe với địa chỉ
  if (preview) {
    preview.style.display = 'block';
    const q = encodeURIComponent((addr.trim() || fallbackUrl || ''));
    preview.innerHTML = `<iframe src="https://maps.google.com/maps?q=${q}&output=embed&hl=vi" style="width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe>`;
  }
  if (fallback) fallback.style.display = 'none';
}


// ─── Call button ──────────────────────────────────────────────────────────────
function setupCallBtn() {
  const phone = document.getElementById('field_PHONE');
  const callBtn = document.getElementById('callBtn');
  if (!phone || !callBtn) return;
  function update() {
    const num = phone.value.trim();
    callBtn.href = num ? `tel:${num}` : '#';
  }
  phone.addEventListener('input', update);
}

// ─── Dynamic fields (cột trong Sheet chưa map được) ───────────────────────────
function renderDynamicFields(headers, colMap) {
  const mappedIndices = new Set(Object.values(colMap).map((c) => c.index));
  const unmapped = headers.filter((_, i) => !mappedIndices.has(i));

  if (unmapped.length === 0) return;

  const section = document.getElementById('dynamicSection');
  const container = document.getElementById('dynamicFields');
  if (!section || !container) return;

  section.classList.remove('hidden');
  container.innerHTML = unmapped.map((h) => `
    <div class="form-group field-unknown">
      <label class="form-label">${h}</label>
      <input type="text" class="form-control" data-header="${h}" placeholder="${h}…">
    </div>
  `).join('');
}

// ─── Build row array from form ─────────────────────────────────────────────────
function buildRowValues(headers, colMap) {
  const values = new Array(headers.length).fill('');

  function set(key, value) {
    const col = colMap[key];
    if (col) values[col.index] = value;
  }

  set('ADDRESS', document.getElementById('field_ADDRESS')?.value?.trim() || '');
  set('DISTRICT', document.getElementById('field_DISTRICT')?.value?.trim() || '');
  set('TYPE', document.getElementById('field_TYPE')?.value || '');
  set('AREA', document.getElementById('field_AREA')?.value || '');
  set('PRICE', document.getElementById('field_PRICE')?.value || '');
  set('PRICE_M2', document.getElementById('field_PRICE_M2')?.value || '');
  set('OWNER', document.getElementById('field_OWNER')?.value?.trim() || '');
  set('PHONE', document.getElementById('field_PHONE')?.value?.trim() || '');
  set('DATE', document.getElementById('field_DATE')?.value || '');
  set('STATUS', document.getElementById('field_STATUS')?.value || '');
  set('MAPS_LINK', document.getElementById('field_MAPS_LINK')?.value?.trim() || '');
  set('NOTES', document.getElementById('field_NOTES')?.value?.trim() || '');
  set('LAT', document.getElementById('field_LAT')?.value || '');
  set('LNG', document.getElementById('field_LNG')?.value || '');

  // Ratings attempts (try to find matching cols)
  const ratingTotal = RATINGS.reduce((sum, r) => sum + (ratingValues[r.key] || 0) * r.weight, 0);
  set('SCORE', ratingTotal > 0 ? ratingTotal.toFixed(2) : '');

  // Dynamic fields
  document.querySelectorAll('[data-header]').forEach((input) => {
    const header = input.dataset.header;
    const idx = headers.indexOf(header);
    if (idx >= 0) values[idx] = input.value.trim();
  });

  // Extra non-mapped fields
  const extra = {
    AREA_REAL: 'field_AREA_REAL',
    FRONT: 'field_FRONT',
    ROAD: 'field_ROAD',
    FLOORS: 'field_FLOORS',
    BEDROOMS: 'field_BEDROOMS',
    DIR: 'field_DIR',
    LEGAL: 'field_LEGAL',
    TITLE_INFO: 'field_TITLE_INFO',
    PROS: 'field_PROS',
    CONS: 'field_CONS',
  };
  // Try to set by partial header match
  Object.entries(extra).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (!el || !el.value) return;
    // find best matching header
    const hints = APP_CONFIG.KNOWN_COLUMNS[k] || [k.toLowerCase()];
    const normalized = (s) => (s || '').toLowerCase().trim();
    const idx = headers.findIndex((h) => hints.some((hint) => normalized(h).includes(hint)));
    if (idx >= 0 && !values[idx]) values[idx] = el.value.trim();
  });

  return values;
}

// ─── Pre-fill form (edit mode) ────────────────────────────────────────────────
function prefillForm(rowData, headers, colMap) {
  function get(key) {
    const col = colMap[key];
    return col ? (rowData[col.name] || '') : '';
  }

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

  setVal('field_ADDRESS', get('ADDRESS'));
  setVal('field_DISTRICT', get('DISTRICT'));
  setVal('field_TYPE', get('TYPE'));
  setVal('field_AREA', get('AREA'));
  setVal('field_PRICE', get('PRICE'));
  setVal('field_PRICE_M2', get('PRICE_M2'));
  setVal('field_OWNER', get('OWNER'));
  setVal('field_PHONE', get('PHONE'));
  setVal('field_DATE', get('DATE'));
  setVal('field_STATUS', get('STATUS'));
  setVal('field_MAPS_LINK', get('MAPS_LINK'));
  setVal('field_NOTES', get('NOTES'));
  setVal('field_LAT', get('LAT'));
  setVal('field_LNG', get('LNG'));
  
  // Custom fields newly added
  setVal('field_DRIVE_FOLDER', get('DRIVE_FOLDER'));
  setVal('field_PHOTO_COUNT', get('PHOTO_COUNT') || '0');
  
  if (get('DRIVE_FOLDER')) {
    FormState.driveFolderId = get('DRIVE_FOLDER');
    loadGallery(FormState.driveFolderId);
  }

  const lat = get('LAT'); const lng = get('LNG');
  const mapsUrl = get('MAPS_LINK');
  if (lat && lng) {
    updateMapsLink(lat, lng); // gọi showMapPreview bên trong
  } else if (mapsUrl) {
    showMapPreview(null, null, mapsUrl); // chỉ có link → nút mở Maps
  }

  // Dynamic field prefill
  document.querySelectorAll('[data-header]').forEach((input) => {
    input.value = rowData[input.dataset.header] || '';
  });
}

// ─── Form Submit ──────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();

  const address = document.getElementById('field_ADDRESS')?.value?.trim();
  if (!address) { showToast('Địa chỉ là bắt buộc', 'error'); return; }

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
  if (!spreadsheetId || !sheetName) { showToast('Chưa kết nối Google Sheet', 'error'); return; }

  const saveBtn = document.getElementById('btnSave');
  const saveText = document.getElementById('btnSaveText');
  if (saveBtn) saveBtn.disabled = true;
  if (saveText) saveText.textContent = '⏳ Đang lưu…';

  try {
    const values = buildRowValues(FormState.headers, FormState.colMap);

    if (FormState.mode === 'edit' && FormState.rowIndex) {
      await SheetsAPI.updateRow(spreadsheetId, sheetName, FormState.rowIndex, values);
      SheetsAPI.invalidateCache();
      showToast('Đã cập nhật BĐS ✓', 'success');
    } else {
      await SheetsAPI.appendRow(spreadsheetId, sheetName, values);
      SheetsAPI.invalidateCache();
      showToast('Đã thêm BĐS mới ✓', 'success');
    }

    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Lỗi lưu dữ liệu: ' + err.message, 'error');
    if (saveBtn) saveBtn.disabled = false;
    if (saveText) saveText.textContent = '💾 Lưu BĐS';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initForm() {
  // Wait for GIS
  let t = 0;
  while (typeof google === 'undefined' && t++ < 20) await new Promise((r) => setTimeout(r, 200));
  await Auth.init();

  if (!Auth.isSignedIn()) {
    showToast('Vui lòng đăng nhập trước', 'error');
    setTimeout(() => (window.location.href = 'index.html'), 1500);
    return;
  }

  // Set today's date
  const dateEl = document.getElementById('field_DATE');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().split('T')[0];
  }

  // Đọc row data từ localStorage (được lưu khi click từ bảng)
  const savedRow = localStorage.getItem('_rowData');
  localStorage.removeItem('_rowData');

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  if (savedRow) {
    // Chế độ xem/sửa - điền data thẳng từ localStorage
    const rowObj = JSON.parse(savedRow);
    FormState.mode = 'edit';
    FormState.rowIndex = rowObj._row;
    document.getElementById('formPageTitle').textContent = 'Xem / Sửa BĐS';
    document.getElementById('btnSaveText').textContent = '💾 Cập nhật';

    // Load headers để build colMap, rồi điền form
    if (spreadsheetId && sheetName) {
      try {
        const { headers } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
        FormState.headers = headers;
        FormState.colMap = buildColMap(headers);
        renderDynamicFields(headers, FormState.colMap);
        prefillForm(rowObj, headers, FormState.colMap);
      } catch (err) {
        console.error('Load headers error:', err);
      }
    }
  } else {
    // Chế độ thêm mới — auto-fill ngày giờ hiện tại
    const dateEl = document.getElementById('field_DATE');
    if (dateEl) dateEl.value = nowLocalIso();

    if (spreadsheetId && sheetName) {
      try {
        const { headers } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
        FormState.headers = headers;
        FormState.colMap = buildColMap(headers);
        renderDynamicFields(headers, FormState.colMap);
      } catch (err) {
        console.error('Load headers error:', err);
      }
    }
  }

  // Nút "Bây giờ" → cập nhật giờ hiện tại
  document.getElementById('btnNow')?.addEventListener('click', () => {
    const dateEl = document.getElementById('field_DATE');
    if (dateEl) dateEl.value = nowLocalIso();
  });

  initRatings();
  setupAutoCalc();
  setupGPS();
  setupCallBtn();
  setupPhotos();

  // Form events
  document.getElementById('propertyForm')?.addEventListener('submit', handleSubmit);
  document.getElementById('btnCancel')?.addEventListener('click', () => history.back());
  document.getElementById('btnClearForm')?.addEventListener('click', () => {
    if (confirm('Xóa tất cả dữ liệu đã nhập?')) {
      document.getElementById('propertyForm')?.reset();
      RATINGS.forEach((r) => (ratingValues[r.key] = 0));
      document.querySelectorAll('.star-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById('totalScoreDisplay').style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', initForm);
