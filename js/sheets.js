/**
 * BĐS Survey App – Google Sheets API v4
 * ========================================
 * CRUD helpers cho Sheets
 */

const SheetsAPI = (() => {
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

  function authHeaders() {
    const token = Auth.getToken();
    if (!token) throw new Error('Chưa đăng nhập hoặc token đã hết hạn.');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  // ─── Spreadsheet Info ────────────────────────────────────────────────────────

  /**
   * Lấy danh sách tên sheets trong spreadsheet
   */
  async function getSheetNames(spreadsheetId) {
    const headers = await authHeaders();
    const r = await fetch(`${BASE}/${spreadsheetId}?fields=sheets.properties`, { headers });
    if (!r.ok) throw new Error(`Sheets API error: ${r.status}`);
    const data = await r.json();
    return data.sheets.map((s) => s.properties.title);
  }

  /**
   * Lấy headers – dùng cùng auto-detect logic với getAllRows
   * (Sheet của user có row 1 = formula, row 2 = headers thật)
   */
  async function getHeaders(spreadsheetId, sheetName) {
    const hdrs = await authHeaders();
    // Đọc 2 hàng đầu để auto-detect
    const range = encodeURIComponent(`${sheetName}!1:2`);
    const r = await fetch(`${BASE}/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: hdrs });
    if (!r.ok) throw new Error(`Không đọc được headers: ${r.status}`);
    const data = await r.json();
    const rows = data.values || [];
    if (rows.length === 0) return [];

    // Auto-detect: nếu hàng 1 có < 5 ô → dùng hàng 2
    const row0NonEmpty = (rows[0] || []).filter((v) => v && String(v).trim()).length;
    const headerRow = (row0NonEmpty < 5 && rows.length > 1) ? rows[1] : rows[0];

    // NFC normalize (giống getAllRows)
    return headerRow.map((h, i) => h ? h.normalize('NFC').trim() : `_col${i}`);
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /**
   * Lấy tất cả dữ liệu (bỏ hàng 1 = headers)
   * Returns: mảng object { _row: rowIndex, col0: val, col1: val, ... }
   *  với key là tên header lowercase
   */
  async function getAllRows(spreadsheetId, sheetName) {
    const hdrs = await authHeaders();
    const range = encodeURIComponent(`${sheetName}`);
    const url = `${BASE}/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) throw new Error(`Sheets read error: ${r.status}`);
    const data = await r.json();
    const rows = data.values || [];
    if (rows.length === 0) return { headers: [], rows: [] };

    // ── Auto-detect header row ────────────────────────────────
    // Nếu hàng 1 có ít hơn 5 ô có giá trị (merged cell / gần trống)
    // → dùng hàng 2 làm header (như sheet của user: row1=formula, row2=headers)
    let headerRowIdx = 0;
    const row0NonEmpty = (rows[0] || []).filter((v) => v && String(v).trim()).length;
    if (row0NonEmpty < 5 && rows.length > 1) {
      headerRowIdx = 1;
      console.log(`📋 Auto-detect: dùng hàng ${headerRowIdx + 1} làm header (hàng 1 chỉ có ${row0NonEmpty} ô)`);
    }

    // Normalize headers: NFC để tránh lỗi so sánh NFD vs NFC
    const headerRow = rows[headerRowIdx];
    const normalizedHeaders = headerRow.map((h, i) =>
      h ? h.normalize('NFC').trim() : `_col${i}`
    );

    const dataRows = rows.slice(headerRowIdx + 1).map((row, i) => {
      const sheetRowNum = i + headerRowIdx + 2; // số hàng thực trong sheet (1-based)
      const obj = { _row: sheetRowNum };
      normalizedHeaders.forEach((h, j) => {
        obj[h] = row[j] !== undefined ? row[j] : '';
      });
      obj._values = row;
      return obj;
    });

    return { headers: normalizedHeaders, rows: dataRows };
  }


  /**
   * Lấy 1 hàng theo rowIndex (1-based)
   */
  async function getRow(spreadsheetId, sheetName, rowIndex) {
    const hdrs = await authHeaders();
    const range = encodeURIComponent(`${sheetName}!${rowIndex}:${rowIndex}`);
    const r = await fetch(`${BASE}/${spreadsheetId}/values/${range}`, { headers: hdrs });
    if (!r.ok) throw new Error(`Row read error: ${r.status}`);
    const data = await r.json();
    return (data.values && data.values[0]) ? data.values[0] : [];
  }

  // ─── Write ───────────────────────────────────────────────────────────────────

  /**
   * Thêm hàng mới vào cuối sheet
   * values: mảng theo thứ tự headers
   */
  async function appendRow(spreadsheetId, sheetName, values) {
    const hdrs = await authHeaders();
    const range = encodeURIComponent(`${sheetName}`);
    const url = `${BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const body = { values: [values] };
    const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Append error: ${r.status} – ${err}`);
    }
    const result = await r.json();
    // Lấy row number từ updatedRange (e.g. "Sheet1!A15:Z15")
    const updatedRange = result.updates?.updatedRange || '';
    const match = updatedRange.match(/!A(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Cập nhật 1 hàng theo rowIndex (1-based)
   * values: mảng đầy đủ từ cột A trở đi
   */
  async function updateRow(spreadsheetId, sheetName, rowIndex, values) {
    const hdrs = await authHeaders();
    const range = encodeURIComponent(`${sheetName}!A${rowIndex}`);
    const url = `${BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
    const body = { values: [values] };
    const r = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Update error: ${r.status} – ${err}`);
    }
    return await r.json();
  }

  /**
   * Cập nhật 1 ô cụ thể
   */
  async function updateCell(spreadsheetId, sheetName, rowIndex, colIndex, value) {
    const hdrs = await authHeaders();
    const col = colIndexToLetter(colIndex);
    const range = encodeURIComponent(`${sheetName}!${col}${rowIndex}`);
    const url = `${BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
    const body = { values: [[value]] };
    const r = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Cell update error: ${r.status}`);
    return await r.json();
  }

  /**
   * Xóa hàng (clear nội dung – không xóa dòng vật lý để tránh lệch công thức)
   * Nếu muốn xóa dòng vật lý, dùng batchUpdate deleteRows
   */
  async function deleteRow(spreadsheetId, sheetName, rowIndex, sheetId) {
    const hdrs = await authHeaders();
    // Xóa dòng vật lý bằng batchUpdate
    if (sheetId !== undefined) {
      const url = `${BASE}/${spreadsheetId}:batchUpdate`;
      const body = {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1, // 0-based
              endIndex: rowIndex,
            },
          },
        }],
      };
      const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Delete row error: ${r.status}`);
      return await r.json();
    }
    // Fallback: clear nội dung
    const range = encodeURIComponent(`${sheetName}!${rowIndex}:${rowIndex}`);
    await fetch(`${BASE}/${spreadsheetId}/values/${range}:clear`, { method: 'POST', headers: hdrs });
  }

  /**
   * Xóa một cột vật lý trên Google Sheet
   */
  async function deleteColumn(spreadsheetId, sheetName, colIndex, sheetId) {
    const hdrs = await authHeaders();
    if (sheetId === undefined) {
      sheetId = await getSheetId(spreadsheetId, sheetName);
      if (sheetId === undefined) throw new Error('Không tìm thấy sheetId để xóa cột');
    }
    const url = `${BASE}/${spreadsheetId}:batchUpdate`;
    const body = {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: colIndex,
            endIndex: colIndex + 1,
          },
        },
      }],
    };
    const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
    if (!r.ok) {
       const err = await r.text();
       throw new Error(`Delete column error: ${r.status} - ${err}`);
    }
    return await r.json();
  }

  /**
   * Lấy sheetId số (dùng cho deleteRow vật lý)
   */
  async function getSheetId(spreadsheetId, sheetName) {
    const hdrs = await authHeaders();
    const r = await fetch(`${BASE}/${spreadsheetId}?fields=sheets.properties`, { headers: hdrs });
    const data = await r.json();
    const sheet = data.sheets?.find((s) => s.properties.title === sheetName);
    return sheet ? sheet.properties.sheetId : undefined;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function colIndexToLetter(index) {
    let letter = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  /**
   * Cache helper – đọc cached data hoặc fetch mới
   */
  async function getCachedRows(spreadsheetId, sheetName, forceRefresh = false) {
    const cacheKey = APP_CONFIG.STORAGE.CACHED_DATA;
    const cacheTimeKey = APP_CONFIG.STORAGE.CACHE_TIME;
    const cacheTime = Number(sessionStorage.getItem(cacheTimeKey) || 0);
    const isFresh = Date.now() - cacheTime < APP_CONFIG.CACHE_DURATION_MS;

    if (!forceRefresh && isFresh) {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    }

    const result = await getAllRows(spreadsheetId, sheetName);
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
    sessionStorage.setItem(cacheTimeKey, String(Date.now()));
    return result;
  }

  /**
   * Thêm 1 cột mới vào header row (cột tiếp theo chưa có giá trị)
   * Trả về: { colIndex, colLetter }
   */
  async function addColumnHeader(spreadsheetId, sheetName, columnName) {
    const hdrs = await authHeaders();

    // Wrap sheet name in single quotes (cần thiết khi tên sheet có dấu/khoảng trắng)
    const quotedSheet = `'${sheetName.replace(/'/g, "''")}'`;

    // Đọc 2 hàng đầu để detect header row (giống getAllRows)
    const range = encodeURIComponent(`${quotedSheet}!1:2`);
    const r = await fetch(`${BASE}/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: hdrs });
    if (!r.ok) {
      const errBody = await r.text();
      console.error('addColumnHeader – đọc headers thất bại:', errBody);
      throw new Error(`Không đọc được headers: ${r.status}`);
    }
    const data = await r.json();
    const rows = data.values || [];

    // Auto-detect header row
    let headerRowIdx = 0;
    if (rows.length > 0) {
      const row0NonEmpty = (rows[0] || []).filter(v => v && String(v).trim()).length;
      if (row0NonEmpty < 5 && rows.length > 1) headerRowIdx = 1;
    }

    const headerRow = rows[headerRowIdx] || [];
    // Tìm cột tiếp theo trống
    const newColIndex = headerRow.length;
    const colLetter = colIndexToLetter(newColIndex);
    const sheetRow = headerRowIdx + 1; // 1-based

    console.log(`📝 Thêm cột "${columnName}" tại ${colLetter}${sheetRow} (colIndex=${newColIndex})`);

    // Ghi tên cột vào ô header
    const cellRange = encodeURIComponent(`${quotedSheet}!${colLetter}${sheetRow}`);
    const url = `${BASE}/${spreadsheetId}/values/${cellRange}?valueInputOption=USER_ENTERED`;
    const body = { values: [[columnName]] };
    const wr = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
    if (!wr.ok) {
      const errBody = await wr.text();
      console.error('addColumnHeader – ghi cột thất bại:', errBody);
      throw new Error(`Lỗi thêm cột: ${r.status} – ${errBody}`);
    }

    return { colIndex: newColIndex, colLetter };
  }

  function invalidateCache() {
    sessionStorage.removeItem(APP_CONFIG.STORAGE.CACHED_DATA);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.CACHE_TIME);
  }

  return {
    getSheetNames,
    getHeaders,
    getAllRows,
    getRow,
    appendRow,
    updateRow,
    updateCell,
    deleteRow,
    deleteColumn,
    getSheetId,
    getCachedRows,
    addColumnHeader,
    colIndexToLetter,
    invalidateCache,
  };
})();

window.SheetsAPI = SheetsAPI;
