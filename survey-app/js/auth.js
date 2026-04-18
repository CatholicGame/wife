/**
 * BĐS Survey App – Google Auth & Picker
 * ======================================
 * Xử lý đăng nhập Google + Google Picker chọn Sheet
 */

const Auth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;

  // ─── Internal helpers ────────────────────────────────────────────────────────

  function saveToken(token, expiresIn) {
    accessToken = token;
    tokenExpiry = Date.now() + (expiresIn - 60) * 1000; // refresh 1 phút trước hết hạn
    sessionStorage.setItem(APP_CONFIG.STORAGE.ACCESS_TOKEN, token);
    sessionStorage.setItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY, String(tokenExpiry));
  }

  function loadTokenFromStorage() {
    const token = sessionStorage.getItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    const expiry = Number(sessionStorage.getItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY) || 0);
    if (token && Date.now() < expiry) {
      accessToken = token;
      tokenExpiry = expiry;
      return true;
    }
    return false;
  }

  function clearToken() {
    accessToken = null;
    tokenExpiry = 0;
    sessionStorage.removeItem(APP_CONFIG.STORAGE.ACCESS_TOKEN);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.TOKEN_EXPIRY);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function isSignedIn() {
    if (accessToken && Date.now() < tokenExpiry) return true;
    return loadTokenFromStorage();
  }

  function getUserInfo() {
    const raw = localStorage.getItem(APP_CONFIG.STORAGE.USER_INFO);
    return raw ? JSON.parse(raw) : null;
  }

  function saveUserInfo(info) {
    localStorage.setItem(APP_CONFIG.STORAGE.USER_INFO, JSON.stringify(info));
  }

  function clearAll() {
    clearToken();
    localStorage.removeItem(APP_CONFIG.STORAGE.USER_INFO);
    localStorage.removeItem(APP_CONFIG.STORAGE.SPREADSHEET_ID);
    localStorage.removeItem(APP_CONFIG.STORAGE.SPREADSHEET_NAME);
    localStorage.removeItem(APP_CONFIG.STORAGE.SHEET_NAME);
    localStorage.removeItem(APP_CONFIG.STORAGE.HEADERS);
    localStorage.removeItem(APP_CONFIG.STORAGE.DRIVE_ROOT_ID);
    sessionStorage.removeItem(APP_CONFIG.STORAGE.CACHED_DATA);
  }

  /**
   * Khởi tạo Google Identity Services token client
   * Gọi 1 lần sau khi GIS script load
   */
  function init() {
    return new Promise((resolve) => {
      if (typeof google === 'undefined') {
        resolve(false);
        return;
      }
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.CLIENT_ID,
        scope: APP_CONFIG.SCOPES,
        callback: (response) => {
          if (response.error) {
            console.error('Token error:', response);
            return;
          }
          saveToken(response.access_token, response.expires_in);
          // Lấy user info
          fetchUserInfo(response.access_token).then((info) => {
            if (info) saveUserInfo(info);
          });
        },
      });
      resolve(true);
    });
  }

  /**
   * Lấy thông tin user từ token
   */
  async function fetchUserInfo(token) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return await r.json();
    } catch {
      return null;
    }
  }

  /**
   * Yêu cầu access token (prompt sign-in nếu chưa đăng nhập)
   */
  function requestToken() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error('Token client chưa khởi tạo'));
        return;
      }
      const originalCallback = tokenClient.callback;
      tokenClient.callback = (response) => {
        originalCallback(response);
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.access_token);
        }
        tokenClient.callback = originalCallback;
      };
      tokenClient.requestAccessToken({ prompt: isSignedIn() ? '' : 'consent' });
    });
  }

  /**
   * Lấy token hợp lệ (refresh nếu cần)
   */
  async function getToken() {
    if (isSignedIn()) return accessToken;
    return await requestToken();
  }

  /**
   * Sign out
   */
  function signOut() {
    if (accessToken && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(accessToken);
    }
    clearAll();
  }

  /**
   * Mở Google Picker để chọn Spreadsheet
   * Returns: { spreadsheetId, name } hoặc null nếu hủy
   */
  async function openSheetPicker() {
    const token = await getToken();
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
            const doc = data.docs[0];
            resolve({ spreadsheetId: doc.id, name: doc.name });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  /**
   * Mở Google Picker để chọn folder trên Drive (tùy chọn)
   */
  async function openFolderPicker() {
    const token = await getToken();
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

  return { init, isSignedIn, getToken, requestToken, signOut, getUserInfo, openSheetPicker, openFolderPicker };
})();

window.Auth = Auth;
