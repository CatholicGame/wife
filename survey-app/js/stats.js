/**
 * BĐS Survey App – Stats Page (Chart.js)
 */

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.2s'; setTimeout(() => t.remove(), 250); }, 3000);
}

// Chart.js global defaults (dark theme)
function configureChartDefaults() {
  Chart.defaults.color = '#8b949e';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
}

function buildColMap(headers) {
  const map = {};
  Object.keys(APP_CONFIG.KNOWN_COLUMNS).forEach((key) => {
    const idx = findColumnIndex(headers, key);
    if (idx >= 0) map[key] = { index: idx, name: headers[idx] };
  });
  return map;
}
const cv = (row, colMap, key) => { const c = colMap[key]; return c ? (row[c.name] || '') : ''; };

function formatPrice(val) {
  const n = parseFloat(String(val).replace(/,/g, '.'));
  if (isNaN(n)) return '—';
  if (n >= 1) return n.toFixed(1) + ' tỷ';
  return Math.round(n * 1000) + ' tr';
}

// ─── Render overview stats ────────────────────────────────────────────────────
function renderOverview(rows, colMap) {
  const total = rows.length;
  const prices = rows.map((r) => parseFloat(cv(r, colMap, 'PRICE'))).filter((n) => !isNaN(n) && n > 0);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const areas = rows.map((r) => parseFloat(cv(r, colMap, 'AREA'))).filter((n) => !isNaN(n) && n > 0);
  const avgArea = areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0;
  const scores = rows.map((r) => parseFloat(cv(r, colMap, 'SCORE'))).filter((n) => !isNaN(n) && n > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  document.getElementById('overviewGrid').innerHTML = [
    { value: total, label: 'Tổng BĐS', icon: '🏠' },
    { value: avgPrice > 0 ? formatPrice(avgPrice) : '—', label: 'Giá trung bình', icon: '💰' },
    { value: avgArea > 0 ? Math.round(avgArea) + ' m²' : '—', label: 'Diện tích TB', icon: '📐' },
    { value: avgScore > 0 ? avgScore.toFixed(1) : '—', label: 'Điểm trung bình', icon: '⭐' },
  ].map((item) => `
    <div class="stat-card">
      <div style="font-size:1.5rem;margin-bottom:4px">${item.icon}</div>
      <div class="stat-value">${item.value}</div>
      <div class="stat-label">${item.label}</div>
    </div>`).join('');
}

// ─── Render charts ────────────────────────────────────────────────────────────
function renderCharts(rows, colMap) {
  const container = document.getElementById('chartsContainer');
  container.innerHTML = '';

  // 1. BĐS theo loại (Pie)
  const typeCounts = {};
  rows.forEach((r) => { const t = cv(r, colMap, 'TYPE') || 'Khác'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const typeKeys = Object.keys(typeCounts);

  addChart(container, 'typeChart', `🏘️ Phân loại BĐS`, 'doughnut', {
    labels: typeKeys,
    datasets: [{
      data: typeKeys.map((k) => typeCounts[k]),
      backgroundColor: ['#00d4aa', '#58a6ff', '#f5a623', '#f85149', '#3fb950', '#b48ead'],
      borderWidth: 0,
    }],
  }, {
    plugins: { legend: { position: 'right' } },
    cutout: '60%',
  });

  // 2. Phân bố giá (bar)
  const priceBuckets = { '< 2 tỷ': 0, '2-3 tỷ': 0, '3-5 tỷ': 0, '5-8 tỷ': 0, '8-12 tỷ': 0, '> 12 tỷ': 0 };
  rows.forEach((r) => {
    const p = parseFloat(cv(r, colMap, 'PRICE'));
    if (isNaN(p) || p <= 0) return;
    if (p < 2) priceBuckets['< 2 tỷ']++;
    else if (p < 3) priceBuckets['2-3 tỷ']++;
    else if (p < 5) priceBuckets['3-5 tỷ']++;
    else if (p < 8) priceBuckets['5-8 tỷ']++;
    else if (p < 12) priceBuckets['8-12 tỷ']++;
    else priceBuckets['> 12 tỷ']++;
  });

  addChart(container, 'priceChart', '💰 Phân bố giá', 'bar', {
    labels: Object.keys(priceBuckets),
    datasets: [{
      label: 'Số BĐS',
      data: Object.values(priceBuckets),
      backgroundColor: 'rgba(0,212,170,0.5)',
      borderColor: 'var(--accent)',
      borderWidth: 1,
      borderRadius: 6,
    }],
  }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } });

  // 3. Giá/m² theo quận (top 8)
  const districtPrices = {};
  rows.forEach((r) => {
    const d = cv(r, colMap, 'DISTRICT');
    const p = parseFloat(cv(r, colMap, 'PRICE'));
    const a = parseFloat(cv(r, colMap, 'AREA'));
    if (!d || isNaN(p) || isNaN(a) || a === 0) return;
    if (!districtPrices[d]) districtPrices[d] = [];
    districtPrices[d].push((p * 1e9) / a);
  });

  const districtAvg = Object.entries(districtPrices)
    .map(([d, prices]) => ({ district: d, avg: prices.reduce((a, b) => a + b, 0) / prices.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);

  if (districtAvg.length > 1) {
    addChart(container, 'districtChart', '🗺️ Giá/m² trung bình theo quận', 'bar', {
      labels: districtAvg.map((d) => d.district),
      datasets: [{
        label: 'Giá/m² (triệu)',
        data: districtAvg.map((d) => Math.round(d.avg / 1e6)),
        backgroundColor: 'rgba(88,166,255,0.5)',
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 6,
      }],
    }, {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    });
  }

  // 4. Tình trạng (pie)
  const statusCounts = {};
  rows.forEach((r) => { const s = cv(r, colMap, 'STATUS') || 'Chưa xác định'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const statusKeys = Object.keys(statusCounts);

  if (statusKeys.length > 1) {
    addChart(container, 'statusChart', '📋 Tình trạng khảo sát', 'pie', {
      labels: statusKeys,
      datasets: [{
        data: statusKeys.map((k) => statusCounts[k]),
        backgroundColor: ['#00d4aa', '#58a6ff', '#f5a623', '#f85149', '#3fb950'],
        borderWidth: 0,
      }],
    }, { plugins: { legend: { position: 'bottom' } } });
  }
}

function addChart(container, id, title, type, data, options = {}) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = `<h3>${title}</h3><canvas id="${id}"></canvas>`;
  container.appendChild(card);

  const ctx = document.getElementById(id);
  new Chart(ctx, { type, data, options: { responsive: true, maintainAspectRatio: true, ...options } });
}

// ─── Top 5 ────────────────────────────────────────────────────────────────────
function renderTop5(rows, colMap) {
  const scored = rows
    .filter((r) => parseFloat(cv(r, colMap, 'SCORE')) > 0)
    .sort((a, b) => parseFloat(cv(b, colMap, 'SCORE')) - parseFloat(cv(a, colMap, 'SCORE')))
    .slice(0, 5);

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  document.getElementById('topList').innerHTML = scored.map((row, i) => `
    <a href="detail.html?row=${row._row}" class="top-item">
      <div class="top-rank">${medals[i]}</div>
      <div class="top-info">
        <div class="top-address">${cv(row, colMap, 'ADDRESS') || '—'}</div>
        <div class="top-sub">${[cv(row, colMap, 'DISTRICT'), cv(row, colMap, 'TYPE'), formatPrice(cv(row, colMap, 'PRICE'))].filter(Boolean).join(' • ')}</div>
      </div>
      <div class="top-score">${parseFloat(cv(row, colMap, 'SCORE')).toFixed(1)}</div>
    </a>`).join('') || '<p class="text-muted text-small" style="padding:var(--space-4)">Chưa có dữ liệu điểm đánh giá</p>';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initStats() {
  let t = 0;
  while (typeof google === 'undefined' && t++ < 20) await new Promise((r) => setTimeout(r, 200));
  await Auth.init();

  if (!Auth.isSignedIn()) {
    showToast('Vui lòng đăng nhập', 'error');
    setTimeout(() => (window.location.href = 'index.html'), 1500);
    return;
  }

  const spreadsheetId = localStorage.getItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
  const sheetName = localStorage.getItem(APP_CONFIG.STORAGE.SHEET_NAME);
  if (!spreadsheetId || !sheetName) { window.location.href = 'index.html'; return; }

  async function loadStats(forceRefresh = false) {
    document.getElementById('statsLoading').style.display = 'block';
    document.getElementById('statsMain').classList.add('hidden');

    try {
      const { headers, rows } = await SheetsAPI.getCachedRows(spreadsheetId, sheetName, forceRefresh);
      const colMap = buildColMap(headers);
      const validRows = rows.filter((r) => r._values?.some((v) => v));

      configureChartDefaults();
      renderOverview(validRows, colMap);
      // Clear old charts
      document.getElementById('chartsContainer').innerHTML = '';
      renderCharts(validRows, colMap);
      renderTop5(validRows, colMap);

      document.getElementById('statsLoading').style.display = 'none';
      document.getElementById('statsMain').classList.remove('hidden');
    } catch (err) {
      showToast('Lỗi tải thống kê: ' + err.message, 'error');
      document.getElementById('statsLoading').style.display = 'none';
    }
  }

  await loadStats();

  document.getElementById('btnRefreshStats')?.addEventListener('click', () => loadStats(true));
}

document.addEventListener('DOMContentLoaded', initStats);
