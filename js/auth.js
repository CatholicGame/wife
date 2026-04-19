/**
 * BĐS Survey App – Google Auth & Picker
 * ======================================
 * Xử lý đăng nhập Google + Google Picker chọn Sheet
 *
 * LUỒNG ĐƠN GIẢN:
 *  1. Auth.init()       → khởi tạo tokenClient
 *  2. Auth.isSignedIn() → true nếu có token hợp lệ trong sessionStorage
 *  3. Auth.signIn()     → mở popup Google, chờ xong mới trả về token (CHỈ GỌI TỪ nút bấm!)
 *  4. Auth.getToken()   → trả token đang có (KHÔNG mở popup)
 *  5. Auth.signOut()    → xoá token + user info
 */

const Auth = (() => {
  let tokenClient = null;
  let _accessToken = null;  // token đang giữ trong bộ nhớ
  let _tokenExpiry = 0;

  // ─── Internal ────────────────────────────────────────────────────────────────

  function _save(token, expiresIn) {
    _accessToken = token;
    const secs = (expiresIn && !isNaN(expiresIn)) ? Number(expiresIn) : 3599;
    _tokenExpiry = Date.now() + (secs - 60) * 1000;
    sessionStorage.setItem(APP_CONFIG.STORAGE.ACCESS_TOKEN, token);
    sessionStorage.setItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY, String(_tokenExpiry));
  }

  function _load() {
    const t = sessionStorage.getItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    const e = Number(sessionStorage.getItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY) || 0);
    if (t && Date.now() < e) {
      _accessToken = t;
      _tokenExpiry = e;
      return true;
    }
    return false;
  }

  function _clear() {
    _accessToken = null;
    _tokenExpiry = 0;
    sessionStorage.removeItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY);
  }

  // ─── Public ──────────────────────────────────────────────────────────────────

  /**
   * Khởi tạo GIS token client. Gọi 1 lần sau khi GIS script load.
   * Không tự mở popup!
   */
  function init() {
    return new Promise((resolve) => {
      if (typeof google === 'undefined') { resolve(false); return; }

      // Thử load token từ sessionStorage trước
      _load();

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.CLIENT_ID,
        scope: APP_CONFIG.SCOPES,
        // Callback rỗng — sẽ được gán lại bởi signIn()
        callback: () => {},
      });

      resolve(true);
    });
  }

  /**
   * Kiểm tra xem token còn hợp lệ không.
   * KHÔNG mở popup, chỉ kiểm tra bộ nhớ + sessionStorage.
   */
  function isSignedIn() {
    if (_accessToken && Date.now() < _tokenExpiry) return true;
    return _load();
  }

  /**
   * Lấy token đang có. KHÔNG mở popup.
   * Nếu hết hạn → trả null (caller phải tự xử lý)
   */
  function getToken() {
    if (isSignedIn()) return _accessToken;
    return null;
  }

  /**
   * Đăng nhập – mở popup Google để xin cấp quyền.
   * CHỈ gọi hàm này từ handler của nút bấm!
   * Returns: access_token (string) hoặc throw nếu lỗi/user hủy
   */
  function signIn() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error('Google chưa sẵn sàng, thử lại sau'));
        return;
      }

      tokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        _save(response.access_token, response.expires_in);
        // Lưu user info bất đồng bộ, không block flow chính
        _fetchUserInfo(response.access_token).then((info) => {
          if (info) localStorage.setItem(APP_CONFIG.STORAGE.USER_INFO, JSON.stringify(info));
        });
        resolve(response.access_token);
      };

      // prompt='select_account' nếu chưa có token, '' nếu chỉ cần gia hạn
      tokenClient.requestAccessToken({ prompt: isSignedIn() ? '' : 'select_account' });
    });
  }

  /**
   * Đăng xuất – thu hồi token và xoá toàn bộ dữ liệu cục bộ
   */
  function signOut() {
    const t = _accessToken;
    _clear();
    localStorage.removeItem(APP_CONFIG.STORAGE.USER_INFO);
    // Không xoá spreadsheetId để user đăng nhập lại vẫn thấy sheet cũ

    if (t && typeof google !== 'undefined') {
      try { google.accounts.oauth2.revoke(t); } catch (_) {}
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
