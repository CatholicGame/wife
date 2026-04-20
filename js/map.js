/**
 * BĐS Survey App – Map Page (Leaflet.js)
 */

function showToast(msg, type = 'info', dur = 3000) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.2s'; setTimeout(() => t.remove(), 250); }, dur);
}

// Hiển thị avatar Google ở bottom nav
function _setNavAvatar() {
  const userInfo = Auth.getUserInfo();
  const el = document.getElementById('navAvatarIcon');
  if (!el || !userInfo?.picture) return;
  el.innerHTML = `<img src="${userInfo.picture}"
    style="width:26px;height:26px;border-radius:50%;object-fit:cover;
           border:2px solid var(--accent);display:block;margin:auto"
    referrerpolicy="no-referrer" alt="">`;
}

function getScoreColor(score) {
  const n = parseFloat(score);
  if (isNaN(n) || score === '') return '#8b949e';
  if (n >= 7) return '#00d4aa';
  if (n >= 5) return '#f5a623';
  return '#f85149';
}

function formatPrice(val) {
  const n = parseFloat(String(val).replace(/,/g, '.'));
  if (isNaN(n)) return val || '';
  if (n >= 1) return n.toFixed(n % 1 === 0 ? 0 : 2) + ' tỷ';
  return Math.round(n * 1000) + ' tr';
}

function buildColMap(headers) {
  const map = {};
  Object.keys(APP_CONFIG.KNOWN_COLUMNS).forEach((key) => {
    const idx = findColumnIndex(headers, key);
    if (idx >= 0) map[key] = { index: idx, name: headers[idx] };
  });
  return map;
}
function cv(row, colMap, key) {
  const c = colMap[key]; return c ? (row[c.name] || '') : '';
}

let mapInstance = null;
let allMarkers = [];
let activeFilter = 'all';

// Geocode address using Nominatim
async function geocode(address, district) {
  const query = [address, district, 'TP HCM', 'Vietnam'].filter(Boolean).join(', ');
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const data = await r.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

function createMarker(lat, lng, row, colMap) {
  const score = cv(row, colMap, 'SCORE');
  const address = cv(row, colMap, 'ADDRESS') || '(Không rõ)';
  const price = formatPrice(cv(row, colMap, 'PRICE'));
  const type = cv(row, colMap, 'TYPE');
  const color = getScoreColor(score);
  const scoreText = score ? parseFloat(score).toFixed(1) : '?';

  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin" style="background:${color}"><span class="marker-score">${scoreText}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });

  const marker = L.marker([lat, lng], { icon });
  const thumbnailFolderId = cv(row, colMap, 'DRIVE_FOLDER');
  const thumbnailUrl = thumbnailFolderId ? `https://drive.google.com/thumbnail?id=${thumbnailFolderId}&sz=w200` : '';

  marker.bindPopup(`
    <div class="popup-content">
      ${thumbnailUrl ? `<img src="${thumbnailUrl}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px" onerror="this.style.display='none'">` : ''}
      <div class="popup-address">${address}</div>
      ${type ? `<div style="font-size:0.72rem;color:#8b949e;margin-bottom:4px">${type}</div>` : ''}
      ${price ? `<div class="popup-price">${price}</div>` : ''}
      ${score ? `<div style="font-size:0.72rem;margin-top:4px">⭐ ${parseFloat(score).toFixed(1)} điểm</div>` : ''}
      <div class="popup-foot">
        <a href="detail.html?row=${row._row}" class="popup-btn">Chi tiết</a>
        <a href="form.html?row=${row._row}" class="popup-btn">Sửa</a>
      </div>
    </div>`, { maxWidth: 240 });

  marker._type = type;
  return marker;
}

function applyFilter(filter) {
  activeFilter = filter;
  let visible = 0;
  allMarkers.forEach(({ marker, type }) => {
    if (filter === 'all' || type === filter) {
      if (!mapInstance.hasLayer(marker)) marker.addTo(mapInstance);
      visible++;
    } else {
      if (mapInstance.hasLayer(marker)) mapInstance.removeLayer(marker);
    }
  });
  document.getElementById('mapCount').textContent = `${visible} BĐS`;
}

async function initMap() {
  let t = 0;
  while (typeof google === 'undefined' && t++ < 20) await new Promise((r) => setTimeout(r, 200));
  await Auth.init();

  if (!Auth.isSignedIn()) {
    showToast('Vui lòng đăng nhập', 'error');
    setTimeout(() => (window.location.href = 'index.html'), 1500);
    return;
  }

  // Hiển thị avatar Google ở bottom nav
  _setNavAvatar();

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
  if (!spreadsheetId || !sheetName) {
    window.location.href = 'index.html';
    return;
  }

  // Init Leaflet — default center HCM, will pan to real location below
  mapInstance = L.map('map', { zoomControl: true }).setView([10.7769, 106.7009], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(mapInstance);

  // ── Auto-locate user ──────────────────────────────────────────
  let userLocationMarker = null;

  function panToUser(lat, lng, zoom = 14) {
    mapInstance.setView([lat, lng], zoom);
    if (userLocationMarker) userLocationMarker.remove();
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:18px;height:18px;
        background:#4285f4;
        border:3px solid #fff;
        border-radius:50%;
        box-shadow:0 0 0 4px rgba(66,133,244,0.3);
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    userLocationMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
      .addTo(mapInstance)
      .bindPopup('<b>📍 Vị trí của bạn</b>')
      .openPopup();
  }

  // Try to get real GPS
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => panToUser(pos.coords.latitude, pos.coords.longitude, 14),
      () => showToast('Không lấy được vị trí GPS — hiển thị TP.HCM', 'info', 3000),
      { timeout: 8000, maximumAge: 60000 }
    );
  }

  // "Locate me" button in top-nav
  const locateBtn = document.createElement('button');
  locateBtn.className = 'nav-btn';
  locateBtn.title = 'Về vị trí của tôi';
  locateBtn.innerHTML = '📍';
  locateBtn.style.cssText = 'font-size:1.2rem;padding:4px 8px;';
  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Trình duyệt không hỗ trợ GPS', 'error'); return; }
    showToast('Đang lấy vị trí…', 'info', 2000);
    navigator.geolocation.getCurrentPosition(
      (pos) => panToUser(pos.coords.latitude, pos.coords.longitude, 16),
      () => showToast('Không lấy được vị trí', 'error'),
      { timeout: 8000 }
    );
  });
  document.querySelector('.top-nav')?.appendChild(locateBtn);

  // Load data
  try {
    const { headers, rows } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName);
    const colMap = buildColMap(headers);

    const geocodeQueue = [];
    let placed = 0;

    for (const row of rows) {
      const lat = parseFloat(cv(row, colMap, 'LAT'));
      const lng = parseFloat(cv(row, colMap, 'LNG'));

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const marker = createMarker(lat, lng, row, colMap);
        marker.addTo(mapInstance);
        allMarkers.push({ marker, type: cv(row, colMap, 'TYPE') });
        placed++;
      } else {
        // Need geocoding
        geocodeQueue.push(row);
      }
    }

    document.getElementById('mapCount').textContent = `${placed} BĐS`;

    // Geocode up to 20 rows (rate limit)
    if (geocodeQueue.length > 0) {
      showToast(`Đang tìm tọa độ ${Math.min(geocodeQueue.length, 20)} địa chỉ…`, 'info', 5000);
      let geocoded = 0;
      for (const row of geocodeQueue.slice(0, 20)) {
        const address = cv(row, colMap, 'ADDRESS');
        const district = cv(row, colMap, 'DISTRICT');
        if (!address) continue;

        await new Promise((r) => setTimeout(r, 500)); // rate limit
        const coords = await geocode(address, district);
        if (coords) {
          const marker = createMarker(coords.lat, coords.lng, row, colMap);
          if (activeFilter === 'all' || cv(row, colMap, 'TYPE') === activeFilter) marker.addTo(mapInstance);
          allMarkers.push({ marker, type: cv(row, colMap, 'TYPE') });
          geocoded++;
          placed++;
          document.getElementById('mapCount').textContent = `${placed} BĐS`;
        }
      }
      if (geocoded > 0) showToast(`Đã tìm được ${geocoded} vị trí`, 'success');
    }
  } catch (err) {
    showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
  }

  // Filter chips
  document.getElementById('mapFilterBar').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    applyFilter(chip.dataset.filter);
  });
}

document.addEventListener('DOMContentLoaded', initMap);
