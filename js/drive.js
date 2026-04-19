/**
 * BĐS Survey App – Google Drive API
 * =====================================
 * Upload ảnh, quản lý thư mục, camera capture
 */

const DriveAPI = (() => {
  const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

  function authHeaders() {
    const token = Auth.getToken();
    if (!token) throw new Error('Chưa đăng nhập hoặc token đã hết hạn.');
    return { Authorization: `Bearer ${token}` };
  }

  // ─── Folder Management ───────────────────────────────────────────────────────

  /**
   * Tạo hoặc tìm folder theo tên trong thư mục cha
   */
  async function findOrCreateFolder(name, parentId = null) {
    const hdrs = await authHeaders();
    // Tìm folder đã tồn tại
    let q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const searchUrl = `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const r = await fetch(searchUrl, { headers: hdrs });
    const data = await r.json();

    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Tạo folder mới
    const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];

    const createR = await fetch(`${DRIVE_BASE}/files`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
    const folder = await createR.json();
    return folder.id;
  }

  /**
   * Lấy hoặc tạo root folder "BDS_Survey_Photos"
   */
  async function ensureRootFolder() {
    const stored = localStorage.getItem(APP_CONFIG.STORAGE.DRIVE_ROOT_ID);
    if (stored) return stored;
    const folderId = await findOrCreateFolder(APP_CONFIG.DRIVE_ROOT_FOLDER);
    localStorage.setItem(APP_CONFIG.STORAGE.DRIVE_ROOT_ID, folderId);
    return folderId;
  }

  /**
   * Lấy hoặc tạo folder cho 1 BĐS cụ thể
   * propertyLabel: chuỗi nhận dạng (địa chỉ hoặc ID)
   */
  async function ensurePropertyFolder(propertyLabel) {
    const rootId = await ensureRootFolder();
    // Folder name: truncate + sanitize
    const folderName = String(propertyLabel).slice(0, 50).replace(/[/\\?*:|"<>]/g, '_');
    return await findOrCreateFolder(folderName, rootId);
  }

  /**
   * Liệt kê tất cả subfolder trong parentId
   * Returns: [{ id, name }]
   */
  async function listSubFolders(parentId) {
    if (!parentId) return [];
    const hdrs = await authHeaders();
    const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await fetch(`${DRIVE_BASE}/files?q=${q}&fields=files(id,name)&orderBy=name`, { headers: hdrs });
    if (!r.ok) return [];
    const data = await r.json();
    return data.files || [];
  }

  // ─── Upload ──────────────────────────────────────────────────────────────────

  /**
   * Upload ảnh (blob) vào folder Drive
   * Returns: { id, name, webViewLink, thumbnailLink }
   */
  async function uploadPhoto(folderId, blob, filename) {
    const hdrs = await authHeaders();
    const token = hdrs.Authorization.replace('Bearer ', '');

    const meta = JSON.stringify({
      name: filename || `photo_${Date.now()}.jpg`,
      parents: [folderId],
    });

    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file', blob);

    const r = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Upload error: ${r.status} – ${err}`);
    }

    const file = await r.json();

    // Set file permission: anyone with link can view (cho thumbnail hoạt động)
    await setPublicReadPermission(file.id);

    return file;
  }

  /**
   * Đặt quyền view cho file (cần để hiện thumbnail)
   */
  async function setPublicReadPermission(fileId) {
    const hdrs = await authHeaders();
    try {
      await fetch(`${DRIVE_BASE}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
    } catch {
      // Không phải lỗi nghiêm trọng, bỏ qua
    }
  }

  // ─── List & Read ─────────────────────────────────────────────────────────────

  /**
   * Liệt kê ảnh trong 1 folder
   * Returns: mảng { id, name, thumbnailLink, webViewLink, createdTime }
   */
  async function listPhotos(folderId) {
    if (!folderId) return [];
    const hdrs = await authHeaders();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType contains 'image/'`);
    const fields = 'files(id,name,thumbnailLink,webViewLink,createdTime)';
    const r = await fetch(`${DRIVE_BASE}/files?q=${q}&fields=${fields}&orderBy=createdTime`, { headers: hdrs });
    if (!r.ok) return [];
    const data = await r.json();
    return data.files || [];
  }

  /**
   * Xóa file trên Drive
   */
  async function deleteFile(fileId) {
    const hdrs = await authHeaders();
    await fetch(`${DRIVE_BASE}/files/${fileId}`, { method: 'DELETE', headers: hdrs });
  }

  // ─── Thumbnail URL ────────────────────────────────────────────────────────────

  /**
   * Tạo URL thumbnail từ file ID (không cần auth nếu đã set public)
   */
  function getThumbnailUrl(fileId, size = 400) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
  }

  function getDirectUrl(fileId) {
    return `https://drive.google.com/uc?id=${fileId}&export=view`;
  }

  // ─── Camera Capture ──────────────────────────────────────────────────────────

  /**
   * Mở camera và chụp ảnh
   * Returns: { blob, dataUrl } hoặc null nếu hủy
   */
  async function capturePhoto() {
    return new Promise((resolve) => {
      // Tạo UI camera overlay
      const overlay = document.createElement('div');
      overlay.className = 'camera-overlay';
      overlay.innerHTML = `
        <div class="camera-container">
          <div class="camera-header">
            <span>📷 Chụp ảnh</span>
            <button class="camera-close-btn" id="cameraClose">✕</button>
          </div>
          <video id="cameraVideo" autoplay playsinline></video>
          <div class="camera-controls">
            <button class="camera-switch-btn" id="cameraSwitch" title="Đổi camera">🔄</button>
            <button class="camera-capture-btn" id="cameraCapture">⬤</button>
            <button class="camera-gallery-btn" id="cameraGallery" title="Chọn từ thư viện">🖼️</button>
          </div>
          <canvas id="cameraCanvas" style="display:none"></canvas>
          <input type="file" id="cameraFileInput" accept="image/*" style="display:none">
        </div>
      `;
      document.body.appendChild(overlay);

      const video = overlay.querySelector('#cameraVideo');
      const canvas = overlay.querySelector('#cameraCanvas');
      const fileInput = overlay.querySelector('#cameraFileInput');
      let stream = null;
      let facingMode = 'environment'; // rear camera

      function cleanup() {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        overlay.remove();
      }

      async function startCamera(mode) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
          video.srcObject = stream;
        } catch (err) {
          console.error('Camera error:', err);
          cleanup();
          resolve(null);
        }
      }

      startCamera(facingMode);

      overlay.querySelector('#cameraClose').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      overlay.querySelector('#cameraSwitch').addEventListener('click', () => {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        startCamera(facingMode);
      });

      overlay.querySelector('#cameraCapture').addEventListener('click', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          cleanup();
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ blob, dataUrl });
        }, 'image/jpeg', 0.85);
      });

      overlay.querySelector('#cameraGallery').addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          cleanup();
          resolve({ blob: file, dataUrl: ev.target.result });
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // ─── Image Compression ───────────────────────────────────────────────────────
  
  /**
   * Nén ảnh qua Canvas trước khi lưu
   * file: File hoặc Blob
   * maxDimension: Kích thước chiều dài/rộng tối đa (px)
   * quality: Chất lượng JPEG (0-1)
   */
  async function compressImage(file, maxDimension = 1920, quality = 0.8) {
    if (!file.type.match(/image.*/)) return file; // Chỉ nén ảnh
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Tính toán tỷ lệ thu nhỏ
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round(height *= maxDimension / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round(width *= maxDimension / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            // Đặt tên lại file để tránh lỗi nếu không phải file từ form tải lên
            const compressedFile = new File([blob], file.name || `photo_${Date.now()}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  return {
    findOrCreateFolder,
    ensureRootFolder,
    ensurePropertyFolder,
    listSubFolders,
    uploadPhoto,
    listPhotos,
    deleteFile,
    getThumbnailUrl,
    getDirectUrl,
    capturePhoto,
    compressImage
  };
})();

window.DriveAPI = DriveAPI;
