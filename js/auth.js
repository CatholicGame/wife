/**
 * BĐS Survey App – Google Auth & Picker
 * ======================================
 * Luồng:
 *  - init()       → khởi tạo GIS client (không mở popup)
 *  - isSignedIn() → kiểm tra token còn hợp lệ không (chỉ đọc, không request)
 *  - getToken()   → trả token hiện tại (không mở popup, trả null nếu hết hạn)
 *  - signIn()     → MỞ POPUP Google (CHỈ gọi từ click handler của nút bấm!)
 *  - signOut()    → xóa token + đánh dấu "tự tay đăng xuất" để chặn GIS auto sign-in
 */

const Auth = (() => {
  // ─── State ──────────────────────────────────────────────────────────────────
  let tokenClient = null;
  let _accessToken = null;
  let _tokenExpiry  = 0;

  // Key đánh dấu user CHỦ ĐỘNG đăng xuất — ngăn GIS tự sign-in lại
  const KEY_SIGNED_OUT = 'bds_signed_out';

  // ─── Internal ────────────────────────────────────────────────────────────────

  function _save(token, expiresIn) {
    _accessToken = token;
    const secs = (expiresIn && !isNaN(expiresIn)) ? Number(expiresIn) : 3599;
    _tokenExpiry = Date.now() + (secs - 60) * 1000;
    sessionStorage.setItem(APP_CONFIG.STORAGE.ACCESS_TOKEN, token);
    sessionStorage.setItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY, String(_tokenExpiry));
    // Bỏ flag "đã đăng xuất" khi có token mới
    localStorage.removeItem(KEY_SIGNED_OUT);
  }

  function _load() {
    const t = sessionStorage.getItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    const e = Number(sessionStorage.getItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY) || 0);
    if (t && Date.now() < e) {
      _accessToken = t;
      _tokenExpiry  = e;
      return true;
    }
    return false;
  }

  function _clear() {
    _accessToken = null;
    _tokenExpiry  = 0;
    sessionStorage.removeItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.CACHED_DATA);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.CACHE_TIME);
  }

  function _isIntentionallySignedOut() {
    return localStorage.getItem(KEY_SIGNED_OUT) === '1';
  }

  // ─── Public ──────────────────────────────────────────────────────────────────

  /**
   * Khởi tạo GIS token client. Gọi 1 lần. KHÔNG mở popup.
   */
  function init() {
    return new Promise((resolve) => {
      if (typeof google === 'undefined') { resolve(false); return; }

      // Nếu user ĐÃ CHỦ ĐỘNG đăng xuất → không load token cũ
      if (!_isIntentionallySignedOut()) {
        _load();
      }

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.CLIENT_ID,
        scope: APP_CONFIG.SCOPES,
        // Callback trống — chỉ signIn() mới gán callback thật
        callback: () => {},
      });

      resolve(true);
    });
  }

  /**
   * Kiểm tra token hợp lệ. KHÔNG mở popup, KHÔNG request mới.
   */
  function isSignedIn() {
    if (_isIntentionallySignedOut()) return false;
    if (_accessToken && Date.now() < _tokenExpiry) return true;
    return _load();
  }

  /**
   * Lấy token hiện tại. KHÔNG mở popup.
   * Trả null nếu chưa đăng nhập / đã hết hạn.
   */
  function getToken() {
    if (isSignedIn()) return _accessToken;
    return null;
  }

  /**
   * Mở popup Google để đăng nhập.
   * CHỈ gọi từ event handler của nút bấm!
   */
  function signIn() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error('Google chưa sẵn sàng, thử lại sau'));
        return;
      }

      tokenClient.callback = (response) => {
        // Reset về callback trống sau khi xử lý
        tokenClient.callback = () => {};

        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        _save(response.access_token, response.expires_in);

        // Lấy user info bất đồng bộ
        _fetchUserInfo(response.access_token).then((info) => {
          if (info) localStorage.setItem(APP_CONFIG.STORAGE.USER_INFO, JSON.stringify(info));
        });

        resolve(response.access_token);
      };

      // Xóa flag signed-out khi user chủ động đăng nhập
      localStorage.removeItem(KEY_SIGNED_OUT);

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }

  /**
   * Đăng xuất: xóa token + đánh dấu "đã đăng xuất thủ công"
   * QUAN TRỌNG: sau khi gọi hàm này, gọi location.reload() ở caller
   * để kill toàn bộ GIS state trong memory.
   */
  function signOut() {
    const t = _accessToken;

    _clear();
    localStorage.removeItem(APP_CONFIG.STORAGE.USER_INFO);
    localStorage.setItem(KEY_SIGNED_OUT, '1'); // ← chặn GIS auto sign-in sau reload

    // Thu hồi token phía Google
    if (t && typeof google !== 'undefined') {
      try { google.accounts.oauth2.revoke(t); } catch (_) {}
    }

    // Vô hiệu hóa callback để GIS không tự gọi nếu còn đang pending
    if (tokenClient) {
      tokenClient.callback = () => {};
    }
  }

  function getUserInfo() {
    const raw = localStorage.getItem(APP_CONFIG.STORAGE.USER_INFO);
    return raw ? JSON.parse(raw) : null;
  }

  async function _fetchUserInfo(token) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }

  // ─── Google Pickers ──────────────────────────────────────────────────────────

  async function openSheetPicker() {
    const token = getToken();
    if (!token) throw new Error('Chưa đăng nhập');
    return new Promise((resolve) => {
      if (typeof google === 'undefined' || !google.picker) {
        alert('Google Picker chưa load. Thử lại sau.');
        resolve(null);
        return;
      }
      const picker = new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
            .setIncludeFolders(false)
        )
        .setOAuthToken(token)
        .setDeveloperKey(APP_CONFIG.PICKER_API_KEY)
        .setTitle('Chọn Google Sheet chứa dữ liệu BĐS')
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            resolve({ spreadsheetId: data.docs[0].id, name: data.docs[0].name });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function openFolderPicker() {
    const token = getToken();
    if (!token) throw new Error('Chưa đăng nhập');
    return new Promise((resolve) => {
      const picker = new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder')
        )
        .setOAuthToken(token)
        .setDeveloperKey(APP_CONFIG.PICKER_API_KEY)
        .setTitle('Chọn thư mục Drive để lưu ảnh')
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            resolve({ folderId: data.docs[0].id, name: data.docs[0].name });
          } else {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  return { init, isSignedIn, getToken, signIn, signOut, getUserInfo, openSheetPicker, openFolderPicker };
})();

window.Auth = Auth;
