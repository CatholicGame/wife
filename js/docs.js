/**
 * BĐS Survey App – Docs API
 * ===========================
 * Quản lý file Google Docs để lưu trữ lịch sử chat AI
 */

const DocsAPI = (() => {
  const BASE = 'https://docs.googleapis.com/v1/documents';

  function authHeaders() {
    const token = Auth.getToken();
    if (!token) throw new Error('Chưa xác thực Google Docs API.');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // Tạo một tài liệu mới
  async function createDoc(title) {
    const headers = await authHeaders();
    const r = await fetch(BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: title || 'Dữ Liệu Chat BĐS - AI Assistant' })
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        throw new Error('Bạn chưa cấp quyền truy cập Docs. Hãy bấm "Đăng xuất" ở mục Cài Đặt và đăng nhập lại để cấp quyền Google Docs.');
      }
      const err = await r.text();
      console.error('Docs create error:', err);
      throw new Error(`Docs create error: ${r.status}`);
    }
    return await r.json();
  }

  // Tạo (hoặc đổi tên) Tab
  async function createTab(docId, title) {
    const headers = await authHeaders();
    const body = {
      requests: [
        {
          createTab: {
            tabProperties: {
              title: title
            }
          }
        }
      ]
    };
    const r = await fetch(`${BASE}/${docId}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        throw new Error('Bạn chưa cấp quyền truy cập Docs. Hãy bấm "Đăng xuất" ở mục Cài Đặt và đăng nhập lại để cấp quyền Google Docs.');
      }
      const err = await r.text();
      console.error('Docs createTab error:', err);
      // Nếu không hỗ trợ tạo Tab do API/permission, fallback
      throw new Error(`Tạo Tab thất bại: ${r.status}`);
    }
    const data = await r.json();
    return data.replies[0].createTab.tabId;
  }

  // Chèn text (hỗ trợ tabId nếu có)
  async function insertText(docId, tabId, text) {
    const headers = await authHeaders();
    
    // Khi chèn text mới vào index 1, đoạn text sẽ đẩy dần xuống dưới.
    // Nếu muốn nối vào cuối, cần get `document` outline để tìm index cuối.
    // Tạm thời để đơn giản, ta insertText vào index 1 nhưng với toàn bộ lịch sử.
    // Do đó hàm này chỉ chạy 1 lần lúc Export toàn bộ Session.
    
    const req = {
      insertText: {
        location: { index: 1 },
        text: text + '\n'
      }
    };
    
    if (tabId) {
      req.insertText.location.tabId = tabId;
    }

    const r = await fetch(`${BASE}/${docId}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests: [req] })
    });

    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        throw new Error('Bạn chưa cấp quyền truy cập Docs. Hãy bấm "Đăng xuất" ở mục Cài Đặt và đăng nhập lại để cấp quyền Google Docs.');
      }
      const err = await r.text();
      console.error('Docs insertText error:', err);
      throw new Error(`Ghi vào Docs thất bại: ${r.status}`);
    }
    return await r.json();
  }

  // Đổi tên tài liệu hoặc Tab hiện tại (Dành cho việc tận dụng tab mặc định đầu tiên)
  async function updateTabTitle(docId, tabId, newTitle) {
    const headers = await authHeaders();
    const req = {
      updateTabProperties: {
         tabProperties: { title: newTitle },
         fields: 'title'
      }
    };
    if (tabId) req.updateTabProperties.tabId = tabId;

    await fetch(`${BASE}/${docId}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests: [req] })
    });
  }

  return { createDoc, createTab, insertText, updateTabTitle };
})();
