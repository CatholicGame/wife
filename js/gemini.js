/**
 * BĐS Survey App – Gemini AI Integration
 * ========================================
 * Chat AI để tóm tắt & phân tích dữ liệu BĐS
 */

const GeminiAI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let activeModel = localStorage.getItem('bds_gemini_model') || MODELS[0];

  // Lịch sử session
  let sessionsState = (() => {
    try {
      const saved = localStorage.getItem('bds_gemini_sessions');
      if (saved) return JSON.parse(saved);
    } catch(e){}
    
    const initId = 'chat_' + Date.now();
    return {
      activeId: initId,
      docsId: localStorage.getItem('bds_chat_docs_id') || null,
      list: {
        [initId]: { title: 'Chat mới', history: [] }
      }
    };
  })();

  function saveSessions() {
    localStorage.setItem('bds_gemini_sessions', JSON.stringify(sessionsState));
    if (sessionsState.docsId) {
      localStorage.setItem('bds_chat_docs_id', sessionsState.docsId);
    }
  }

  function getActiveSession() {
    if (!sessionsState.list[sessionsState.activeId]) {
      const initId = 'chat_' + Date.now();
      sessionsState.activeId = initId;
      sessionsState.list[initId] = { title: 'Chat mới', history: [] };
    }
    return sessionsState.list[sessionsState.activeId];
  }

  function getChatHistory() {
    return getActiveSession().history;
  }

  function getSessionsList() {
    return Object.keys(sessionsState.list).map(id => ({
      id,
      title: sessionsState.list[id].title
    })).reverse();
  }

  function switchSession(id) {
    if (sessionsState.list[id]) {
      sessionsState.activeId = id;
      saveSessions();
    }
  }

  function startNewSession() {
    const newId = 'chat_' + Date.now();
    sessionsState.list[newId] = { title: 'Chat mới', history: [] };
    sessionsState.activeId = newId;
    saveSessions();
    return newId;
  }

  /**
   * Lấy API key từ config hoặc localStorage
   */
  function getApiKey() {
    return localStorage.getItem('bds_gemini_api_key') || APP_CONFIG.GEMINI_API_KEY || '';
  }

  function setApiKey(key) {
    localStorage.setItem('bds_gemini_api_key', key.trim());
  }

  /**
   * Tạo context từ dữ liệu BĐS hiện tại
   */
  function buildContext() {
    // Lấy dữ liệu từ State (global trong list.js)
    const rows = (typeof State !== 'undefined' && State.allRows) ? State.allRows : [];
    const colMap = (typeof State !== 'undefined' && State.colMap) ? State.colMap : {};

    if (rows.length === 0) return 'Chưa có dữ liệu BĐS nào được tải.';

    const summary = rows.slice(0, 100).map((row, i) => {
      const get = (key) => {
        const col = colMap[key];
        return col ? (row[col.name] || '') : '';
      };

      const parts = [];
      parts.push(`#${i + 1}`);
      if (get('ADDRESS')) parts.push(`Địa chỉ: ${get('ADDRESS')}`);
      if (get('DISTRICT')) parts.push(`Quận: ${get('DISTRICT')}`);
      if (get('TYPE')) parts.push(`Loại: ${get('TYPE')}`);
      if (get('PRICE')) parts.push(`Giá: ${get('PRICE')} tỷ`);
      if (get('AREA')) parts.push(`DT: ${get('AREA')} m²`);
      if (get('FRONT')) parts.push(`MT: ${get('FRONT')}m`);
      if (get('SCORE')) parts.push(`Điếm: ${get('SCORE')}`);
      if (get('PROS'))  parts.push(`Ưu: ${get('PROS')}`);
      if (get('CONS'))  parts.push(`Nhược: ${get('CONS')}`);
      
      return parts.join(' | ');
    }).join('\n');

    return `Dữ liệu ${rows.length} bất động sản đã khảo sát:\n${summary}`;
  }

  function getSystemPrompt() {
    return `Bạn là trợ lý AI chuyên phân tích bất động sản (BĐS) Việt Nam.
Bạn đang hỗ trợ một nhân viên môi giới/khảo sát BĐS.

NĂNG LỰC:
- Tóm tắt danh sách BĐS đã khảo sát
- So sánh các BĐS theo giá, diện tích, vị trí, điểm đánh giá
- Phân tích ưu/nhược điểm
- Đề xuất BĐS tiềm năng

QUY TẮC:
- Trả lời bằng tiếng Việt
- Ngắn gọn, có cấu trúc (bullet points, bảng)
- Khuyến nghị trung lập, khách quan

DỮ LIỆU HIỆN TẠI:
${buildContext()}`;
  }

  // Yêu cầu AI đặt tên cho session dựa vào câu nội dung
  async function generateSessionTitle(firstQuery) {
    try {
      const apiKey = getApiKey();
      if (!apiKey) return;
      const body = {
        contents: [{ role: 'user', parts: [{ text: `Dựa vào tin nhắn sau: "${firstQuery}". Hãy đặt một tiêu đề rất ngắn gọn (tối đa 3 đến 5 chữ) mô tả cuộc trò chuyện này. Chi trả về đúng tiêu đề, không giải thích gì thêm.` }] }],
      };
      
      const r = await fetch(`${BASE}/models/${activeModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const data = await r.json();
        let title = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        title = title.replace(/['"]/g, '').trim();
        if (title.length > 0 && title.length < 30) {
          getActiveSession().title = title;
          saveSessions();
        }
      }
    } catch(e) {} // Bỏ qua nếu lỗi
  }

  async function chat(userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    const activeSession = getActiveSession();
    const chatHistory = activeSession.history;
    const isFirstMessage = chatHistory.length === 0;

    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    saveSessions();

    const body = {
      system_instruction: { parts: [{ text: getSystemPrompt() }] },
      contents: chatHistory,
      generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 2048 }
    };

    const modelsToTry = [activeModel, ...MODELS.filter(m => m !== activeModel)];

    for (const model of modelsToTry) {
      const url = `${BASE}/models/${model}:generateContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (r.ok) {
        const data = await r.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '(Không có phản hồi)';

        if (model !== activeModel) {
          activeModel = model;
          localStorage.setItem('bds_gemini_model', model);
        }

        chatHistory.push({ role: 'model', parts: [{ text: reply }] });
        if (chatHistory.length > 20) {
            // Giữ lại tối đa 20 tin nhắn (bảo toàn chẵn cặp user-model)
            activeSession.history = chatHistory.slice(-20); 
        }
        saveSessions();

        // Nếu là tin nhắn đầu tiên, đặt tên
        if (isFirstMessage) generateSessionTitle(userMessage).then(() => {
          if (window._triggerSessionUIDocUpdate) window._triggerSessionUIDocUpdate();
        });

        return reply;
      }

      const errText = await r.text();
      let detail = '';
      try { detail = JSON.parse(errText).error?.message || ''; } 
      catch (_) { detail = errText.substring(0, 200); }

      if ((r.status === 429 && detail.includes('limit: 0')) || r.status === 404) continue;

      chatHistory.pop(); saveSessions();
      if (r.status === 400 && detail.includes('API_KEY')) throw new Error('API key không hợp lệ.');
      if (r.status === 403) throw new Error('API chưa được bật.');
      if (r.status === 429) throw new Error('Quá giới hạn (Rate limit). Thử lại sau.');
      throw new Error(detail || `Lỗi ${r.status}`);
    }

    chatHistory.pop(); saveSessions();
    throw new Error('Tất cả model đều bị giới hạn truy cập. Hãy dùng tài khoản Google mới cấp key.');
  }

  function clearHistory() {
    getActiveSession().history = [];
    saveSessions();
  }
  
  async function exportActiveSessionToDocs() {
     const history = getChatHistory();
     if (history.length === 0) throw new Error("Chat trống, không có gì để lưu.");
     
     // 1. Tạo file nếu chưa có
     if (!sessionsState.docsId) {
        const doc = await DocsAPI.createDoc("Dữ Liệu Chat BĐS - AI Assistant");
        sessionsState.docsId = doc.documentId;
        saveSessions();
     }
     const docId = sessionsState.docsId;
     
     // 2. Tạo tab dựa theo Tên Session
     const tabTitle = getActiveSession().title;
     const tabId = await DocsAPI.createTab(docId, tabTitle + ' - ' + new Date().toLocaleDateString('vi-VN'));
     
     // 3. Format text từ history
     let fullText = history.map(m => {
       const role = m.role === 'user' ? '👤 BẠN:\n' : '\n🤖 TRỢ LÝ AI:\n';
       return role + m.parts[0].text;
     }).join('\n\n');
     
     // 4. Ghi vào Tab
     await DocsAPI.insertText(docId, tabId, fullText);
     return `https://docs.google.com/document/d/${docId}/edit`;
  }

  return {
    chat, clearHistory, getApiKey, setApiKey, buildContext,
    getSessionsList, switchSession, startNewSession, getChatHistory,
    exportActiveSessionToDocs, getActiveId: () => sessionsState.activeId
  };
})();

window.GeminiAI = GeminiAI;
