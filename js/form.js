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
  { key: 'R_LOC', label: 'I. Vị trí', fieldHints: ['vị trí', 'location'], desc: [
    "Vị trí xấu, hẻm cụt, phong thủy kém",
    "Ngõ sâu, khó tìm",
    "Ngõ xe máy, cách ô tô <100m",
    "Ô tô vào nhà / ngõ rộng >3m",
    "Mặt phố / ô tô tránh / kinh doanh tốt"
  ]},
  { key: 'R_SPEC', label: 'II. Thông số', fieldHints: ['thông số', 'spec'], desc: [
    "Rất khó dùng",
    "Méo, nhỏ, khó bố trí",
    "Bình thường",
    "Diện tích ổn, không lỗi lớn",
    "Diện tích đẹp, mặt tiền rộng (>4m), vuông vắn"
  ]},
  { key: 'R_RARE', label: 'III. Độ hiếm', fieldHints: ['độ hiếm', 'độ hot', 'rare'], desc: [
    "Tràn lan",
    "Nhiều lựa chọn",
    "Có vài căn tương tự",
    "Ít hàng cùng phân khúc",
    "Gần như không có hàng so sánh"
  ]},
  { key: 'R_PRICE', label: 'IV. Giá cả', fieldHints: ['giá cả', 'đánh giá giá', 'price'], desc: [
    "Giá ngáo",
    "Hơi cao",
    "Giá ngang thị trường",
    "Giá hợp lý, dễ bán",
    "Rẻ hơn thị trường rõ rệt (deal tốt)"
  ]},
  { key: 'R_INT', label: 'V. Nội thất', fieldHints: ['nội thất', 'interior'], desc: [
    "Nhà thô / xuống cấp",
    "Cần sửa",
    "Trung bình",
    "Khá ổn",
    "Full đẹp, vào ở ngay"
  ]},
  { key: 'R_CASH', label: 'VI. Dòng tiền', fieldHints: ['dòng tiền', 'cashflow'], desc: [
    "Không có dòng tiền",
    "Khó khai thác",
    "Bình thường",
    "Có thể cho thuê ổn",
    "Cho thuê ngon / kinh doanh tốt"
  ]}
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
    <div class="rating-item" style="flex-direction:column; align-items:flex-start; gap:4px">
      <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span class="rating-name" style="font-weight:600">${r.label}</span>
          <div class="rating-stars" data-key="${r.key}">
            ${[1,2,3,4,5].map((n) =>
              `<button type="button" class="star-btn" data-value="${n}" title="${r.desc[n-1]}">★</button>`
            ).join('')}
          </div>
      </div>
      <div class="rating-desc text-muted" id="desc_${r.key}" style="font-size:0.75rem; font-style:italic; min-height:16px;">Chưa đánh giá</div>
    </div>
  `).join('');

  container.querySelectorAll('.rating-stars').forEach((stars) => {
    stars.addEventListener('click', (e) => {
      const btn = e.target.closest('.star-btn');
      if (!btn) return;
      const key = stars.dataset.key;
      let val = parseInt(btn.dataset.value);
      
      // Cho phép bấm lại sao đang chọn để hủy (remove star)
      if (ratingValues[key] === val) val = 0;
      
      ratingValues[key] = val;
      updateStars(stars, val);
      
      const rDef = RATINGS.find(r => r.key === key);
      const descEl = document.getElementById(`desc_${key}`);
      if (descEl && rDef) {
          descEl.textContent = val > 0 ? `${val}⭐ - ${rDef.desc[val-1]}` : 'Chưa đánh giá';
          descEl.style.color = val > 0 ? 'var(--accent)' : 'var(--text-muted)';
      }
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
    total += v;
  });

  const display = document.getElementById('totalScoreDisplay');
  const valueEl = document.getElementById('totalScoreValue');
  if (!display || !valueEl) return;

  if (hasAny) {
    display.style.display = 'block';
    valueEl.textContent = total + ' / 30';
    valueEl.style.color = total >= 20 ? 'var(--score-high)' : total >= 12 ? 'var(--score-med)' : 'var(--score-low)';
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
async function reverseGeocodeToForm(lat, lng, forceOverwrite = false) {
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
      
      if (addrEl) {
         if (!addrEl.value || addrEl.value.trim() === '' || forceOverwrite) {
            addrEl.value = fullAddress;
            addrEl.dispatchEvent(new Event('input'));
         }
      }
      
      if (distEl) {
         if (!distEl.value || distEl.value.trim() === '' || forceOverwrite) {
            let dName = district.replace(/^(Quận|Huyện|Thành phố)\s+/i, '').trim();
            distEl.value = dName;
            distEl.dispatchEvent(new Event('input'));
         }
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
        if (latEl) { latEl.value = lat; latEl.dispatchEvent(new Event('input')); }
        if (lngEl) { lngEl.value = lng; lngEl.dispatchEvent(new Event('input')); }
        
        showToast('Đã lấy tọa độ ✓ Đang phân tích địa chỉ...', 'info');
        updateMapsLink(lat, lng);
        
        const addrEl = document.getElementById('field_ADDRESS');
        let overwrite = false;
        if (addrEl && addrEl.value && addrEl.value.trim() !== '') {
            overwrite = await showConfirm('Cập nhật địa chỉ?', 'Địa chỉ đang có dữ liệu. Kéo địa chỉ mới nhất từ GPS để ghi đè?');
        }
        await reverseGeocodeToForm(lat, lng, overwrite);
        showToast('Khởi tạo vị trí hoàn tất ✓', 'success');
      },
      (err) => showToast('Lỗi GPS: ' + err.message, 'error'),
      { enableHighAccuracy: true }
    );
  });

  ['field_LAT', 'field_LNG'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      const lat = document.getElementById('field_LAT')?.value;
      const lng = document.getElementById('field_LNG')?.value;
      if (lat && lng) updateMapsLink(lat, lng);
    });
  });
  
  // Xử lý dán link tọa độ MAPS_LINK
  document.getElementById('field_MAPS_LINK')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!val) return;
    
    // regex bóc tọa độ từ URL dạng /@lat,lng hoặc q=lat,lng
    const match = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || val.match(/[q=|\/place\/](-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) {
        const lat = match[1];
        const lng = match[2];
        const latEl = document.getElementById('field_LAT');
        const lngEl = document.getElementById('field_LNG');
        if (latEl) { latEl.value = lat; latEl.dispatchEvent(new Event('input')); }
        if (lngEl) { lngEl.value = lng; lngEl.dispatchEvent(new Event('input')); }
        showMapPreview(lat, lng);
        showToast('Đã trích xuất tọa độ từ Link bản đồ ✓', 'success');
        
        const addrEl = document.getElementById('field_ADDRESS');
        if (!addrEl || !addrEl.value || addrEl.value.trim() === '') {
            reverseGeocodeToForm(lat, lng, true);
        }
    }
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

  const btnDeleteFolder = document.getElementById('btnDeleteFolder');

  // When folder changes → load gallery from that folder
  folderSelect?.addEventListener('change', async () => {
    if (btnDeleteFolder) btnDeleteFolder.style.display = folderSelect.value ? 'inline-block' : 'none';
    const folderId = folderSelect.value;
    if (!folderId) return;
    FormState.driveFolderId = folderId;
    const idInput = document.getElementById('field_DRIVE_FOLDER');
    if (idInput) idInput.value = folderId;

    // Reset category → load gallery from parent folder
    if (categorySelect) categorySelect.value = '';
    await loadGallery(folderId);
  });
  
  btnDeleteFolder?.addEventListener('click', async () => {
    const id = folderSelect.value;
    if(!id) return;
    const fName = folderSelect.options[folderSelect.selectedIndex].text.replace('📁 ', '');
    try {
       showToast('Đang kiểm tra thư mục...', 'info');
       const photos = await DriveAPI.listPhotos(id);
       const confirmMsg = `Bạn sắp xóa folder "${fName}" và toàn bộ ${photos.length} tấm ảnh bên trong. Hành động này không thể hoàn tác!`;
       if (!await showConfirm('Xác nhận xóa thư mục?', confirmMsg, true)) return;
       
       showToast('Đang xóa...', 'info', 1000);
       await DriveAPI.deleteFile(id);
       showToast('Đã xóa thư mục', 'success');
       
       if (FormState.driveFolderId === id) {
           FormState.driveFolderId = '';
           const idInput = document.getElementById('field_DRIVE_FOLDER');
           if (idInput) idInput.value = '';
       }
       await loadFolderList();
    } catch(err) {
       showToast('Lỗi xóa thư mục: ' + err.message, 'error');
    }
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
    const name = await showPrompt('Tạo Folder Mới', 'Nhập tên folder…');
    if (!name) return;

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
  btnNewCategory?.addEventListener('click', async () => {
    const name = await showPrompt('Thêm Nhóm Giá', 'VD: 5-7 tỷ…');
    if (!name) return;

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

      const newUrls = await uploadPhotos(files, uploadFolderId);
      
      let csvField = document.querySelector('[data-header="Ảnh"]') || document.getElementById('field_PHOTOS');
      let currentUrls = [];
      if (csvField && csvField.value) {
         currentUrls = csvField.value.split(',').map(s => s.trim()).filter(s => s);
      }
      const combined = currentUrls.concat(newUrls).join(',');
      if (csvField) csvField.value = combined;
      
      await loadGallery(uploadFolderId, combined);

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
      try {
        const folderInfo = await DriveAPI.getFile(FormState.driveFolderId);
        if (folderInfo && folderInfo.parents && folderInfo.parents.length > 0) {
           if (folderInfo.parents[0] === rootId) {
              // It's a top-level folder directly in our root
              sel.value = FormState.driveFolderId;
           } else {
              // It's a subfolder -> Parent is top-level folder
              sel.value = folderInfo.parents[0];
              // Subfolder name is the category
              const catSel = document.getElementById('categorySelect');
              if (catSel) {
                 const exists = Array.from(catSel.options).some(o => o.value === folderInfo.name);
                 if (!exists) {
                     const opt = document.createElement('option');
                     opt.value = folderInfo.name;
                     opt.textContent = '🏷️ ' + folderInfo.name;
                     catSel.appendChild(opt);
                 }
                 catSel.value = folderInfo.name;
              }
           }
        } else {
          sel.value = FormState.driveFolderId; // fallback
        }
      } catch (e) {
        console.error('Lỗi nhận diện cha/con:', e);
        sel.value = FormState.driveFolderId; // fallback
      }
    }
    const btnDel = document.getElementById('btnDeleteFolder');
    if (btnDel) btnDel.style.display = sel.value ? 'inline-block' : 'none';
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
  const uploadedUrls = [];
  for (let i = 0; i < files.length; i++) {
    try {
      if (statusText) statusText.textContent = `Đang tải ảnh ${i + 1}/${files.length}`;
      const uploadedFile = await DriveAPI.uploadPhoto(folderId, files[i], files[i].name);
      if (uploadedFile && uploadedFile.id) {
        uploadedUrls.push(`https://drive.google.com/uc?id=${uploadedFile.id}&export=view`);
      }
      
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
  return uploadedUrls;
}

async function loadGallery(folderId, photosCsv = null) {
  const gallery = document.getElementById('photoGallery');
  const countBadge = document.getElementById('photoCountBadge');
  if (!gallery) return;

  // Render instantly from CSV if available (bypassing Google Drive list)
  if (photosCsv) {
    const links = photosCsv.split(',').filter(url => url.trim() !== '');
    // Extract ID from full URL, fallback to raw string if it's already an ID
    const items = links.map(link => {
       const m = link.match(/[?&]id=([a-zA-Z0-9_-]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
       return m ? m[1] : link.trim();
    });

    if (countBadge) countBadge.textContent = `${items.length} ảnh`;
    const countInput = document.getElementById('field_PHOTO_COUNT');
    if (countInput) countInput.value = items.length;

    if (items.length === 0) {
      gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.8rem;padding:var(--space-2) 0">Chưa có hình ảnh nào</div>';
      return;
    }

    window.lightboxImages = items.map(id => `https://drive.google.com/thumbnail?id=${id}&sz=w2500`);

    gallery.innerHTML = items.map((id, index) => `
      <div class="gallery-photo-item" id="photo-${id}" style="position:relative;padding-top:100%;border-radius:var(--radius-md);overflow:hidden;background:#f0f0f0;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1)">
        <a href="#" onclick="window.openLightbox(${index}, event)">
          <img src="https://drive.google.com/thumbnail?id=${id}&sz=w400" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" alt="Hình ảnh">
        </a>
        <button type="button" class="photo-del-btn" onclick="deletePhotoFromGallery('${id}', event)" title="Xóa ảnh" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s">✕</button>
      </div>
    `).join('');
    
    // Also update field_PHOTOS hidden input 
    const fieldPhotos = document.querySelector('[data-header="Ảnh"]') || document.getElementById('field_PHOTOS');
    if (fieldPhotos) fieldPhotos.value = photosCsv;
    return;
  }

  // Fallback: list from Drive API — chỉ dùng để HIỂN THỊ gallery, KHÔNG ghi vào field_PHOTOS
  gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-size:0.8rem;color:var(--text-muted)">Đang tải danh sách ảnh từ Drive...</div>';
  
  try {
    const photos = await DriveAPI.listPhotos(folderId);
    
    // CHỈ cập nhật badge đếm ảnh để người dùng biết folder có bao nhiêu ảnh
    if (countBadge) countBadge.textContent = `${photos.length} ảnh trong folder`;
    // KHÔNG ghi vào field_PHOTOS hay field_PHOTO_COUNT ở đây
    // (tránh bug: BĐS B thấy và kế thừa ảnh của BĐS A đã upload cùng folder)

    if (photos.length === 0) {
      gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.8rem;padding:var(--space-2) 0">Chưa có hình ảnh nào</div>';
      return;
    }

    window.lightboxImages = photos.map(p => `https://drive.google.com/thumbnail?id=${p.id}&sz=w2500`);

    gallery.innerHTML = photos.map((p, index) => `
      <div class="gallery-photo-item" id="photo-${p.id}" style="position:relative;padding-top:100%;border-radius:var(--radius-md);overflow:hidden;background:#f0f0f0;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1)">
        <a href="#" onclick="window.openLightbox(${index}, event)">
          <img src="${p.thumbnailLink}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" alt="${p.name}">
        </a>
        <button type="button" class="photo-del-btn" onclick="deletePhotoFromGallery('${p.id}', event)" title="Xóa ảnh" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s">✕</button>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    gallery.innerHTML = '<div style="grid-column:1/-1;color:var(--red);font-size:0.8rem">Không thể tải ảnh</div>';
  }
}

// Global function to handle image deletion
window.deletePhotoFromGallery = async function(photoId, event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (!await showConfirm('Xóa ảnh này?', 'Nó sẽ bị xóa vĩnh viễn khỏi Google Drive.', true)) return;
  
  try {
    showToast('Đang xóa ảnh...', 'info', 1000);
    await DriveAPI.deleteFile(photoId);
    
    // Remove from UI
    const el = document.getElementById('photo-' + photoId);
    if (el) el.remove();
    
    // Remove from CSV field
    let csvField = document.querySelector('[data-header="Ảnh"]') || document.getElementById('field_PHOTOS');
    let newCsv = '';
    if (csvField) {
      let urls = csvField.value.split(',').filter(u => u.trim() !== '');
      urls = urls.filter(url => !url.includes(photoId));
      newCsv = urls.join(',');
      csvField.value = newCsv;
      
      // Update count badge + field
      const countInput = document.getElementById('field_PHOTO_COUNT');
      if (countInput) countInput.value = urls.length;
      const countBadge = document.getElementById('photoCountBadge');
      if (countBadge) countBadge.textContent = `${urls.length} ảnh`;
    }
    
    // ── Auto-save PHOTOS & PHOTO_COUNT cells to Sheet ──────────
    if (FormState.mode === 'edit' && FormState.rowIndex) {
      try {
        const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
        const sheetName    = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
        
        if (spreadsheetId && sheetName && FormState.colMap) {
          const photosCol   = FormState.colMap['PHOTOS'];
          const countCol    = FormState.colMap['PHOTO_COUNT'];
          const countVal    = parseInt(document.getElementById('field_PHOTO_COUNT')?.value || '0');
          
          const tasks = [];
          if (photosCol)   tasks.push(SheetsAPI.updateCell(spreadsheetId, sheetName, FormState.rowIndex, photosCol.index, newCsv));
          if (countCol)    tasks.push(SheetsAPI.updateCell(spreadsheetId, sheetName, FormState.rowIndex, countCol.index, countVal));
          
          await Promise.all(tasks);
          SheetsAPI.invalidateCache(); // buộc danh sách reload
          showToast('Đã xóa ảnh và cập nhật dữ liệu ✓', 'success');
        } else {
          showToast('Đã xóa ảnh (lưu form để cập nhật Sheet)', 'warning');
        }
      } catch (saveErr) {
        console.error('Auto-save photo URL error:', saveErr);
        showToast('Đã xóa ảnh nhưng chưa lưu được Sheet: ' + saveErr.message, 'warning');
      }
    } else {
      // Chế độ thêm mới — Sheet chưa có row → không cần auto-save
      showToast('Đã xóa ảnh ✓', 'success');
    }
  } catch (err) {
    showToast('Lỗi xóa ảnh: ' + err.message, 'error');
  }
}

// Global function to open full-screen lightbox
window.lightboxImages = [];
window.lightboxIndex = 0;

window.updateLightboxView = function() {
  const img = document.getElementById('lightboxImg');
  const cnt = document.getElementById('lightboxCounter');
  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');
  
  if (img && window.lightboxImages && window.lightboxImages[window.lightboxIndex]) {
    img.style.opacity = '0';
    setTimeout(() => {
        img.src = window.lightboxImages[window.lightboxIndex];
        img.onload = () => { img.style.opacity = '1'; };
    }, 100);
  }
  if (cnt) {
    cnt.textContent = window.lightboxImages.length > 1 ? `${window.lightboxIndex + 1} / ${window.lightboxImages.length}` : '';
  }
  if (prev) prev.style.display = window.lightboxIndex > 0 ? 'flex' : 'none';
  if (next) next.style.display = window.lightboxIndex < window.lightboxImages.length - 1 ? 'flex' : 'none';
};

window.openLightbox = function(index, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!window.lightboxImages || window.lightboxImages.length === 0) return;
  window.lightboxIndex = index;
  window.updateLightboxView();
  const lb = document.getElementById('imageLightbox');
  if (lb) lb.style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
    const lightbox = document.getElementById('imageLightbox');
    const closeBtn = document.getElementById('lightboxClose');
    const img = document.getElementById('lightboxImg');
    const prev = document.getElementById('lightboxPrev');
    const next = document.getElementById('lightboxNext');

    if (lightbox) {
        // Đóng khi click nút X
        closeBtn?.addEventListener('click', () => {
            lightbox.style.display = 'none';
            if (img) img.src = '';
        });

        // Đóng khi click ngoài hình ảnh
        lightbox.addEventListener('click', (e) => {
            if (e.target.id === 'imageLightbox') {
                lightbox.style.display = 'none';
                if (img) img.src = '';
            }
        });
        
        // Điều hướng slide
        prev?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.lightboxIndex > 0) window.openLightbox(window.lightboxIndex - 1);
        });
        next?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.lightboxIndex < window.lightboxImages.length - 1) window.openLightbox(window.lightboxIndex + 1);
        });
        
        // Bàn phím điều hướng
        document.addEventListener('keydown', (e) => {
            if (lightbox.style.display === 'flex') {
                if (e.key === 'Escape') closeBtn?.click();
                if (e.key === 'ArrowLeft' && window.lightboxIndex > 0) window.openLightbox(window.lightboxIndex - 1);
                if (e.key === 'ArrowRight' && window.lightboxIndex < window.lightboxImages.length - 1) window.openLightbox(window.lightboxIndex + 1);
            }
        });
    }
});


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
  
  // Lọc ngầm màng các header thuộc tiêu chí Đánh giá để không sinh ra ô text thừa
  const isRatingCol = (h) => {
    const s = (h || '').toLowerCase().trim();
    return RATINGS.some(r => r.fieldHints.some(hint => s.includes(hint)));
  };
  
  // Lấy tên các custom col để tránh render trùng (không phân biệt chữ hoa/thường)
  const customColNames = new Set(_getCustomCols().map(c => (c.headerName || c.label).toLowerCase().trim()));
  const userDeletedCols = new Set(JSON.parse(localStorage.getItem('bds_user_deleted_cols') || '[]').map(h => (h || '').toLowerCase().trim()));
  
  const unmapped = headers.filter((h, i) => {
    const s = (h || '').toLowerCase().trim();
    return !mappedIndices.has(i) && !isRatingCol(h) && !customColNames.has(s) && !userDeletedCols.has(s);
  });

  if (unmapped.length === 0) return;

  const section = document.getElementById('dynamicSection');
  const container = document.getElementById('dynamicFields');
  if (!section || !container) return;

  section.classList.remove('hidden');
  container.innerHTML = unmapped.map((h) => `
    <div class="form-group field-unknown">
      <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
        <span>${h}</span>
        <button type="button" class="btn-hide-dynamic" data-header="${h}" style="background:transparent;border:none;color:var(--danger);font-size:12px;cursor:pointer" title="Ẩn cột này khỏi form">✕ Bỏ qua</button>
      </label>
      <input type="text" class="form-control" data-header="${h}" placeholder="${h}…">
    </div>
  `).join('');

  // Add listener cho nút Hide
  container.querySelectorAll('.btn-hide-dynamic').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const h = e.target.dataset.header;
      let delCols = JSON.parse(localStorage.getItem('bds_user_deleted_cols') || '[]');
      if (!delCols.includes(h)) delCols.push(h);
      localStorage.setItem('bds_user_deleted_cols', JSON.stringify(delCols));
      
      // Xóa phần tử khỏi DOM ngay lập tức
      e.target.closest('.form-group').remove();
      if (container.children.length === 0) section.classList.add('hidden');
      showToast('Đã ẩn cột "' + h + '" khỏi form', 'success');
    });
  });
}

// ─── Custom columns (từ V2 col config) ────────────────────────────────────────
const V2_COLS_STORAGE_KEY = (() => {
  // Lấy key giống list.js (version hiện tại)
  try {
    const raw = Object.keys(localStorage).find(k => k.startsWith('bds_v2_cols'));
    return raw || 'bds_v2_cols_v2_col_v5';
  } catch { return 'bds_v2_cols_v2_col_v5'; }
})();

function _getCustomCols() {
  try {
    // Tìm key nào chứa v2_cols trong localStorage
    const key = Object.keys(localStorage).find(k => k.includes('v2_col'));
    if (!key) return [];
    const cols = JSON.parse(localStorage.getItem(key) || '[]');
    return cols.filter(c => c.custom === true && c.headerName);
  } catch { return []; }
}

/**
 * Render các trường nhập liệu cho custom columns vào section #customFieldsSection
 * existingData: object row data (edit mode) hoặc null (add mode)
 */
function renderCustomFields(headers, existingData = null) {
  const section = document.getElementById('customFieldsSection');
  const container = document.getElementById('customFieldsContainer');
  if (!section || !container) return;

  const lowerHeaders = headers.map(h => (h || '').toLowerCase().trim());
  const customCols = _getCustomCols().filter(c => lowerHeaders.includes((c.headerName || '').toLowerCase().trim()));
  if (customCols.length === 0) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');

  const typeIcons = { text:'📔', number:'🔢', date:'📅', datetime:'🕰️', textarea:'📝', select:'🏷️', checkbox:'☑️' };

  container.innerHTML = customCols.map(col => {
    const fieldId = `custom_field_${col.id}`;
    const currentVal = existingData ? (existingData[col.headerName] || '') : '';
    const icon = typeIcons[col.fieldType] || '📔';

    let input = '';
    switch (col.fieldType) {
      case 'number':
        input = `<input type="number" class="form-control" id="${fieldId}" data-custom-header="${col.headerName}" value="${currentVal}" placeholder="Nhập số…">`;
        break;
      case 'date':
        input = `<input type="date" class="form-control" id="${fieldId}" data-custom-header="${col.headerName}" value="${currentVal}">`;
        break;
      case 'datetime': {
        // datetime-local không nhận định dạng lạ — chuẩn hóa về YYYY-MM-DDTHH:mm
        let dtVal = '';
        if (currentVal) {
          try {
            const d = new Date(currentVal);
            if (!isNaN(d)) dtVal = d.toISOString().slice(0, 16);
          } catch {} 
          if (!dtVal) dtVal = currentVal.slice(0, 16); // fallback
        }
        input = `<input type="datetime-local" class="form-control" id="${fieldId}" data-custom-header="${col.headerName}" value="${dtVal}">`;
        break;
      }
      case 'textarea':
        input = `<textarea class="form-control" id="${fieldId}" data-custom-header="${col.headerName}" rows="3" placeholder="Nhập ghi chú…">${currentVal}</textarea>`;
        break;
      case 'select': {
        const opts = (col.options || []).map(o =>
          `<option value="${o}"${currentVal === o ? ' selected' : ''}>${o}</option>`
        ).join('');
        input = `<select class="form-control" id="${fieldId}" data-custom-header="${col.headerName}">
          <option value="">— Chọn —</option>${opts}
        </select>`;
        break;
      }
      case 'checkbox':
        input = `<label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">
          <input type="checkbox" id="${fieldId}" data-custom-header="${col.headerName}"${currentVal === 'true' || currentVal === '1' || currentVal === 'Có' ? ' checked' : ''}
            style="width:18px;height:18px;accent-color:var(--accent)">
          <span style="font-size:0.9rem">${currentVal === 'true' || currentVal === '1' || currentVal === 'Có' ? 'Có' : 'Không'}</span>
        </label>`;
        break;
      default: // text
        input = `<input type="text" class="form-control" id="${fieldId}" data-custom-header="${col.headerName}" value="${currentVal}" placeholder="Nhập ${col.label}…">`;
    }

    return `<div class="form-group">
      <label class="form-label">${icon} ${col.label}</label>
      ${input}
    </div>`;
  }).join('');

  // Checkbox label live update
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const span = cb.parentElement.querySelector('span');
      if (span) span.textContent = cb.checked ? 'Có' : 'Không';
    });
  });
}

/**
 * Thu thập giá trị các custom fields và ghi vào mảng values
 */
function collectCustomFieldValues(headers, values) {
  document.querySelectorAll('[data-custom-header]').forEach(el => {
    const header = el.dataset.customHeader;
    const lowerHeader = (header || '').toLowerCase().trim();
    const idx = headers.findIndex(h => (h || '').toLowerCase().trim() === lowerHeader);
    if (idx < 0) return;
    if (el.type === 'checkbox') {
      values[idx] = el.checked ? 'Có' : 'Không';
    } else {
      values[idx] = (el.value || '').trim();
    }
  });
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

  // Save Ratings (Total Score and individual rating mapped column)
  const scoreTotal = RATINGS.reduce((sum, r) => sum + (ratingValues[r.key] || 0), 0);
  const ratedCount = RATINGS.filter(r => ratingValues[r.key] > 0).length;
  set('SCORE', ratedCount > 0 ? scoreTotal.toString() : '');
  
  RATINGS.forEach((r) => {
    const val = ratingValues[r.key];
    if (val > 0) {
      // Find matching dynamic header for each individual rating
      const normalized = (s) => (s || '').toLowerCase().trim();
      const matchedHeader = headers.find((h) => r.fieldHints.some((hint) => normalized(h).includes(hint)));
      if (matchedHeader) {
        const idx = headers.indexOf(matchedHeader);
        if (idx >= 0 && !values[idx]) values[idx] = val.toString();
      }
    }
  });
  
  // Custom Fields (Drive mapping & photo counts)
  set('DRIVE_FOLDER', FormState.driveFolderId || '');
  
  const fieldPhotos = document.getElementById('field_PHOTOS');
  if (fieldPhotos && fieldPhotos.value) {
     const cnt = fieldPhotos.value.split(',').filter(s => s.trim() && s !== 'undefined' && s !== 'null').length;
     set('PHOTO_COUNT', cnt.toString());
  } else {
     set('PHOTO_COUNT', '0');
  }

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

  // Custom field values (cột tùy chỉnh do user thêm)
  collectCustomFieldValues(headers, values);

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
  
  // Custom hidden field for PHOTOS
  let fieldPhotos = document.getElementById('field_PHOTOS');
  if (!fieldPhotos) {
    fieldPhotos = document.createElement('input');
    fieldPhotos.type = 'hidden';
    fieldPhotos.id = 'field_PHOTOS';
    // Đảm bảo [data-header="Ảnh"] sẽ được set để lưu khi buildRowValues
    let photoHeaderName = 'Ảnh';
    if (FormState.colMap && FormState.colMap['PHOTOS']) {
       photoHeaderName = FormState.headers[FormState.colMap['PHOTOS'].index];
    }
    fieldPhotos.dataset.header = photoHeaderName;
    document.body.appendChild(fieldPhotos);
  }
  
  if (get('DRIVE_FOLDER') || get('PHOTOS')) {
    FormState.driveFolderId = get('DRIVE_FOLDER');
    const csv = get('PHOTOS');
    
    // Nếu có sẵn CSV trong Sheet, ưu tiên load từ CSV
    if (csv && csv.trim()) {
      fieldPhotos.value = csv;
      
      // Phục hồi DriveFolderId nếu bị thiếu ở dữ liệu cũ (nhưng có link ảnh)
      if (!FormState.driveFolderId) {
         (async () => {
            try {
               const firstUrl = csv.split(',').find(s => s.trim().includes('id='));
               if (firstUrl) {
                   const m = firstUrl.match(/id=([^&]+)/);
                   if (m && m[1]) {
                       const info = await DriveAPI.getFile(m[1]);
                       if (info && info.parents && info.parents.length > 0) {
                           FormState.driveFolderId = info.parents[0];
                           const el = document.getElementById('field_DRIVE_FOLDER');
                           if (el) el.value = FormState.driveFolderId;
                           // Load lại dropdown sau khi tìm ra
                           if (typeof loadFolderList === 'function') loadFolderList();
                       }
                   }
               }
            } catch (e) {
               console.warn('Không thể recover Folder ID từ ảnh:', e);
            }
         })();
      }
      
      loadGallery(FormState.driveFolderId, csv);
    } else if (FormState.driveFolderId) {
      // Tương thích ngược: BĐS cũ có thư mục Drive nhưng chưa có link CSV
      loadGallery(FormState.driveFolderId);
    }
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

  // Custom fields prefill (sau khi renderCustomFields đã tạo DOM)
  renderCustomFields(headers, rowData);

  // Extra non-mapped fields (cố gắng prefill từ các cột tương ứng)
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

  Object.entries(extra).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const hints = APP_CONFIG.KNOWN_COLUMNS[k] || [k.toLowerCase()];
    const normalized = (s) => (s || '').toLowerCase().trim();
    const matchedHeader = headers.find((h) => hints.some((hint) => normalized(h).includes(hint)));
    if (matchedHeader && rowData[matchedHeader] !== undefined) {
       el.value = rowData[matchedHeader];
    }
  });

  // Prefill ratings
  RATINGS.forEach((r) => {
    ratingValues[r.key] = 0; // reset
    const normalized = (s) => (s || '').toLowerCase().trim();
    const matchedHeader = headers.find((h) => r.fieldHints.some((hint) => normalized(h).includes(hint)));
    if (matchedHeader && rowData[matchedHeader]) {
       const strVal = rowData[matchedHeader].toString().trim();
       let val = parseInt(strVal);
       
       // Fallback nếu dữ liệu cũ có text "3 sao", "4" hoặc match keywords
       if (isNaN(val) || val < 1 || val > 5) {
           const matches = strVal.match(/(\d)\s*sao/i);
           if (matches && matches[1]) {
               val = parseInt(matches[1]);
           }
       }
       
       if (!isNaN(val) && val >= 1 && val <= 5) {
          ratingValues[r.key] = val;
       }
    }
    // Update UI for this rating
    const stars = document.querySelector(`.rating-stars[data-key="${r.key}"]`);
    if (stars) updateStars(stars, ratingValues[r.key]);
    
    const descEl = document.getElementById(`desc_${r.key}`);
    const v = ratingValues[r.key];
    if (descEl) {
        descEl.textContent = v > 0 ? `${v}⭐ - ${r.desc[v-1]}` : 'Chưa đánh giá';
        descEl.style.color = v > 0 ? 'var(--accent)' : 'var(--text-muted)';
    }
  });

  updateTotalScore();
  
  // Re-run track changes snapshot now that prefill is complete
  setupTrackChanges();
}

function setupTrackChanges() {
  const inputs = document.querySelectorAll('#propertyForm .form-control');
  inputs.forEach(input => {
    input.dataset.initialValue = input.value || '';
    const trackHandler = function() {
       if (this.value !== this.dataset.initialValue) {
           this.classList.add('is-changed');
           this.style.backgroundColor = 'rgba(0,168,255,0.1)';
           this.style.borderColor = 'var(--accent)';
       } else {
           this.classList.remove('is-changed');
           this.style.backgroundColor = '';
           this.style.borderColor = '';
       }
    };
    input.removeEventListener('input', trackHandler); // remove if exists
    input.addEventListener('input', trackHandler);
    input.removeEventListener('change', trackHandler);
    input.addEventListener('change', trackHandler);
  });
}

function addCopyButtons() {
  document.querySelectorAll('#propertyForm .form-group').forEach(group => {
     const label = group.querySelector('.form-label');
     const input = group.querySelector('.form-control');
     if (label && input && !label.querySelector('.copy-btn')) {
        label.style.display = 'flex';
        label.style.justifyContent = 'space-between';
        label.style.alignItems = 'center';
        
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:14px;opacity:0.6;padding:0 5px';
        copyBtn.title = "Copy nội dung";
        copyBtn.onclick = (e) => {
            e.preventDefault();
            if (input.value) {
                navigator.clipboard.writeText(input.value);
                showToast('Đã copy: ' + input.value.substring(0, 30) + (input.value.length>30?'...':''), 'info', 1000);
            }
        };
        label.appendChild(copyBtn);
     }
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

  // Generate DOM structures before prefilling
  initRatings();

  // Set today's date
  const dateEl = document.getElementById('field_DATE');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().split('T')[0];
  }

  // Đọc row data + headers từ localStorage (được lưu khi click từ bảng)
  const savedRow = localStorage.getItem('_rowData');
  const savedHeaders = localStorage.getItem('_rowHeaders');
  localStorage.removeItem('_rowData');
  localStorage.removeItem('_rowHeaders');

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);

  if (savedRow) {
    // Chế độ xem/sửa - điền data thẳng từ localStorage
    const rowObj = JSON.parse(savedRow);
    FormState.mode = 'edit';
    FormState.rowIndex = rowObj._row;
    document.getElementById('formPageTitle').textContent = 'Xem / Sửa BĐS';
    document.getElementById('btnSaveText').textContent = '💾 Cập nhật';

    if (savedHeaders) {
      // Dùng headers từ localStorage — không cần API call
      let headers = JSON.parse(savedHeaders);
      let colMap = buildColMap(headers);
      
      // Auto-create column 'Ảnh' nếu nó chưa có
      if (colMap['PHOTOS'] === undefined) {
        try {
           showToast('Hệ thống đang thêm tính năng Cột Ảnh vào Sheet...', 'info');
           await SheetsAPI.addColumnHeader(spreadsheetId, sheetName, 'Ảnh');
           SheetsAPI.invalidateCache();
           const fresh = await SheetsAPI.getCachedRows(spreadsheetId, sheetName, true);
           headers = fresh.headers;
           colMap = buildColMap(headers);
        } catch(e) { console.error('Auto create PHOTOS col failed:', e); }
      }

      FormState.headers = headers;
      FormState.colMap = colMap;
      renderDynamicFields(headers, FormState.colMap);
      renderCustomFields(headers, rowObj);
      prefillForm(rowObj, headers, FormState.colMap);
    } else if (spreadsheetId && sheetName) {
      // Fallback: lấy headers từ cache
      try {
        let { headers } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
        let colMap = buildColMap(headers);
        
        if (colMap['PHOTOS'] === undefined) {
           await SheetsAPI.addColumnHeader(spreadsheetId, sheetName, 'Ảnh');
           SheetsAPI.invalidateCache();
           const fresh = await SheetsAPI.getCachedRows(spreadsheetId, sheetName, true);
           headers = fresh.headers;
           colMap = buildColMap(headers);
        }

        FormState.headers = headers;
        FormState.colMap = colMap;
        renderDynamicFields(headers, FormState.colMap);
        renderCustomFields(headers, rowObj);
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
        let { headers } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
        let colMap = buildColMap(headers);
        
        if (colMap['PHOTOS'] === undefined) {
           await SheetsAPI.addColumnHeader(spreadsheetId, sheetName, 'Ảnh');
           SheetsAPI.invalidateCache();
           const fresh = await SheetsAPI.getCachedRows(spreadsheetId, sheetName, true);
           headers = fresh.headers;
           colMap = buildColMap(headers);
        }

        FormState.headers = headers;
        FormState.colMap = colMap;
        renderDynamicFields(headers, FormState.colMap);
        renderCustomFields(headers, null);
        
        // Setup hidden PHOTOS field
        let fieldPhotos = document.getElementById('field_PHOTOS');
        if (!fieldPhotos) {
          fieldPhotos = document.createElement('input');
          fieldPhotos.type = 'hidden';
          fieldPhotos.id = 'field_PHOTOS';
          let photoHeaderName = 'Ảnh';
          if (colMap['PHOTOS']) photoHeaderName = headers[colMap['PHOTOS'].index];
          fieldPhotos.dataset.header = photoHeaderName;
          document.body.appendChild(fieldPhotos);
        }
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

  // Khởi tạo các module con
  setupTrackChanges();
  addCopyButtons();
  setupAutoCalc();
  setupGPS();
  setupCallBtn();
  setupPhotos();

  // Form events
  document.getElementById('propertyForm')?.addEventListener('submit', handleSubmit);
  document.getElementById('btnCancel')?.addEventListener('click', () => history.back());
  document.getElementById('btnClearForm')?.addEventListener('click', async () => {
    const ok = await showConfirm('Xóa form?', 'Toàn bộ dữ liệu đã nhập sẽ bị xóa.', true);
    if (ok) {
      document.getElementById('propertyForm')?.reset();
      RATINGS.forEach((r) => {
          ratingValues[r.key] = 0;
          const descEl = document.getElementById(`desc_${r.key}`);
          if (descEl) {
              descEl.textContent = 'Chưa đánh giá';
              descEl.style.color = 'var(--text-muted)';
          }
      });
      document.querySelectorAll('.star-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById('totalScoreDisplay').style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', initForm);
