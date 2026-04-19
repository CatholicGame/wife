/**
 * BĐS Survey App – Configuration
 * ================================
 * Sau khi tạo GCP project, điền CLIENT_ID vào đây.
 * Xem hướng dẫn trong GCP_SETUP.md
 */

const APP_CONFIG = {
  // ⚠️ Điền Google OAuth Client ID của bạn vào đây
  CLIENT_ID: '978024184108-vf4si7c9e1bauucue9l309ft541v6a90.apps.googleusercontent.com',

  // OAuth scopes cần thiết
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/generative-language.retriever',
    'https://www.googleapis.com/auth/documents',
    'openid',
    'profile',
    'email',
  ].join(' '),

  // Google Picker API key (cũng lấy từ GCP Console → Credentials → API Key)
  PICKER_API_KEY: 'AIzaSyCkEJESzPsDlFTxsdSeJr1SgeXlxIZ80_M',

  // Gemini AI API key (lấy từ https://aistudio.google.com/apikey)
  // Có thể để trống ở đây và nhập qua giao diện Settings
  GEMINI_API_KEY: '',

  // Drive folder name để lưu ảnh
  DRIVE_ROOT_FOLDER: 'BDS_Survey_Photos',

  // Storage keys
  STORAGE: {
    ACCESS_TOKEN: 'bds_access_token',
    TOKEN_EXPIRY: 'bds_token_expiry',
    USER_INFO: 'bds_user_info',
    SPREADSHEET_ID: 'bds_spreadsheet_id',
    SPREADSHEET_NAME: 'bds_spreadsheet_name',
    SHEET_NAME: 'bds_sheet_name',
    HEADERS: 'bds_headers',
    DRIVE_ROOT_ID: 'bds_drive_root_id',
    CACHED_DATA: 'bds_cached_data',
    CACHE_TIME: 'bds_cache_time',
  },

  // Cache duration (5 phút)
  CACHE_DURATION_MS: 5 * 60 * 1000,

  // Các tên cột đặc biệt mà app nhận biết (không phân biệt hoa thường, trim)
  KNOWN_COLUMNS: {
    ID:       ['stt', 'id', 'mã', 'ma', 'số thứ tự'],
    DATE:     ['ngày khảo sát', 'ngay khao sat', 'ngày', 'ngay', 'date'],
    // "Thông tin chung" = cột tóm tắt tổng hợp
    NOTES:    ['thông tin chung', 'thong tin chung', 'ghi chú', 'ghi chu', 'notes', 'note', 'nhận xét', 'nhan xet'],
    // TYPE: "Loại BDS (nhà/đất/căn hộ)"
    TYPE:     ['loại bds', 'loai bds', 'loại bđs', 'loai bđs', 'loại', 'loai', 'type',
               'loại bất động sản', 'loai bat dong san', 'loại nhà'],
    // ADDRESS: "Địa chỉ"
    ADDRESS:  ['địa chỉ', 'dia chi', 'address', 'địa điểm', 'dia diem',
               'địa chỉ nhà', 'địa chỉ bất động sản'],
    // DISTRICT: "Quận/Huyện"
    DISTRICT: ['quận/huyện', 'quan/huyen', 'quận', 'huyện', 'quan', 'huyen',
               'district', 'khu vực', 'khu vuc'],
    // AREA: "Diện tích (m2) trên sổ"
    AREA:     ['diện tích (m2) trên sổ', 'dien tich (m2) tren so',
               'diện tích sổ', 'dien tich so',
               'diện tích', 'dien tich', 'dt sổ', 'area', 'dt', 'dtđ'],
    // FRONT: "Mặt tiền (m)"
    FRONT:    ['mặt tiền (m)', 'mat tien (m)', 'mặt tiền', 'mat tien', 'ngang', 'mt'],
    // PRICE: "Giá chào bán (tỷ)"
    PRICE:    ['giá chào bán (tỷ)', 'gia chao ban (ty)',
               'giá chào bán', 'gia chao ban',
               'giá chào', 'gia chao', 'giá bán', 'gia ban', 'giá', 'gia', 'price'],
    // PRICE_M2: "Giá/m2"
    PRICE_M2: ['giá/m2', 'gia/m2', 'giá/m²', 'gia/m²', 'price/m2', 'đơn giá', 'don gia'],
    // LEGAL: "Pháp lý (số đỏ/số hồng)"
    LEGAL:    ['pháp lý (số đỏ/số hồng)', 'phap ly (so do/so hong)',
               'pháp lý', 'phap ly', 'legal', 'giấy tờ', 'giay to'],
    FLOORS:   ['số tầng', 'so tang', 'tầng', 'tang', 'floors'],
    BEDROOMS: ['phòng ngủ', 'phong ngu', 'pn', 'bedrooms', 'số phòng ngủ'],
    DIR:      ['hướng nhà', 'huong nha', 'hướng', 'huong', 'direction'],
    ROAD:     ['đường trước nhà', 'duong truoc nha', 'đường trước', 'duong truoc',
               'lộ giới', 'lo gioi', 'lộ', 'đường'],
    PROS:     ['ưu điểm', 'uu diem', 'pros', 'điểm tốt'],
    CONS:     ['nhược điểm', 'nhuoc diem', 'cons', 'điểm yếu'],
    OWNER:    ['đầu chủ', 'dau chu', 'chủ nhà', 'chu nha', 'owner', 'chủ', 'tên chủ',
               'người bán', 'nguoi ban'],
    PHONE:    ['sđt', 'sdt', 'điện thoại', 'dien thoai', 'phone', 'số điện thoại',
               'số dt', 'so dt', 'tel'],
    STATUS:   ['tình trạng', 'tinh trang', 'trạng thái', 'trang thai', 'status'],
    // SCORE: "Tổng điểm" (column AA)
    SCORE:    ['tổng điểm', 'tong diem', 'điểm tổng', 'diem tong',
               'điểm đánh giá', 'diem danh gia', 'score'],
    MAPS_LINK:['link maps', 'link google maps', 'google maps', 'maps', 'map', 'bản đồ', 'map link', 'đường link'],
    LAT:      ['lat', 'latitude', 'vĩ độ', 'vi do'],
    LNG:      ['lng', 'lon', 'longitude', 'kinh độ', 'kinh do'],
    DRIVE_FOLDER: ['drive folder id', 'drive_folder_id', 'folder id', 'ảnh folder'],
    PHOTO_COUNT:  ['số ảnh', 'so anh', 'ảnh', 'photos', 'photo count', 'sl ảnh'],
  },


  // Màu badge theo điểm
  SCORE_COLORS: {
    HIGH: { min: 7, color: '#00d4aa', label: 'Tốt' },
    MED: { min: 5, color: '#f5a623', label: 'Khá' },
    LOW: { min: 0, color: '#e74c3c', label: 'Thấp' },
  },

  // Loại BĐS options
  PROPERTY_TYPES: ['Nhà tầng', 'Đất', 'Căn hộ', 'Biệt thự', 'Nhà cấp 4', 'Shophouse', 'Khác'],

  // Hướng nhà options
  DIRECTIONS: ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'],

  // Tình trạng options
  STATUSES: ['Đã khảo sát', 'Đang xem xét', 'Tiềm năng', 'Đã chốt', 'Bỏ qua'],
};

// Bỏ dấu tiếng Việt (fallback matching)
function removeDiacritics(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Helper: columnKey tra cứu index trong headers mảng
// Thử 3 cách: NFC exact, NFC includes, bỏ dấu includes
function findColumnIndex(headers, knownKeys) {
  const nfc = (s) => (s || '').normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
  const keys = APP_CONFIG.KNOWN_COLUMNS[knownKeys] || [];
  const keysNoDiac = keys.map(removeDiacritics);

  // Pass 1: NFC exact match hoặc includes
  for (let i = 0; i < headers.length; i++) {
    const h = nfc(headers[i]);
    if (keys.some((k) => h === nfc(k) || h.includes(nfc(k)))) return i;
  }

  // Pass 2: Bỏ dấu – fallback cho sheet gõ không dấu
  for (let i = 0; i < headers.length; i++) {
    const h = removeDiacritics(headers[i]);
    if (keysNoDiac.some((k) => h === k || h.includes(k))) return i;
  }

  return -1;
}

// Debug helper – gọi trong console: debugHeaders()
window.debugHeaders = function() {
  const cached = sessionStorage.getItem('bds_cached_data');
  if (!cached) { console.log('Chưa có data cache'); return; }
  const { headers } = JSON.parse(cached);
  console.table(headers.map((h, i) => ({ index: i, header: h, normalized: removeDiacritics(h) })));
  console.log('\n=== Column Map ===');
  Object.keys(APP_CONFIG.KNOWN_COLUMNS).forEach((key) => {
    const idx = findColumnIndex(headers, key);
    if (idx >= 0) console.log(`✅ ${key} → col ${idx}: "${headers[idx]}"`);
  });
};

// Export
window.APP_CONFIG = APP_CONFIG;
window.findColumnIndex = findColumnIndex;
