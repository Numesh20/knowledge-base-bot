// ── KnowledgeBot Web UI — chat.js ──

const API = "";  // same origin

// ── Theme Switcher ──
function initTheme() {
  const saved = localStorage.getItem("kb_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "dark");
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("kb_theme", theme);

  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-label");

  if (theme === "light") {
    if (icon) icon.textContent = "🌙";
    if (label) label.textContent = "Dark";
  } else {
    if (icon) icon.textContent = "☀️";
    if (label) label.textContent = "Light";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  showToast(`Switched to ${next === "light" ? "Light" : "Dark"} mode`, "success");
}

// ── Multi-Chat Sessions ──
let chatSessions = [];
let currentSessionId = null;

function loadSessions() {
  try {
    const raw = localStorage.getItem("kb_chat_sessions");
    chatSessions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    chatSessions = [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem("kb_chat_sessions", JSON.stringify(chatSessions));
    if (currentSessionId) {
      localStorage.setItem("kb_active_session_id", currentSessionId);
    }
  } catch (e) {
    console.warn("Could not save chat sessions to localStorage:", e);
  }
}

function getActiveSession() {
  return chatSessions.find(s => s.id === currentSessionId);
}

function initChatSessions() {
  loadSessions();
  currentSessionId = localStorage.getItem("kb_active_session_id");

  if (!chatSessions || chatSessions.length === 0) {
    createNewChatSession(false);
  } else {
    if (!currentSessionId || !getActiveSession()) {
      currentSessionId = chatSessions[0].id;
    }
    renderSessionsList();
    renderActiveSessionMessages();
  }
}

function renderWelcomeScreen() {
  return `
    <div class="welcome-screen" id="welcome">
      <div class="welcome-icon">🧠</div>
      <h2>Welcome to KnowledgeBot</h2>
      <p>I can answer questions from your uploaded documents.<br/>
         Upload a <strong>.txt</strong> or <strong>.pdf</strong> file on the left, or ask me about the sample knowledge!</p>
      <div class="quick-prompts">
        <button class="quick-btn" onclick="sendQuick('What are the working hours?')">⏰ Working hours?</button>
        <button class="quick-btn" onclick="sendQuick('What products do you sell?')">📦 Products?</button>
        <button class="quick-btn" onclick="sendQuick('How do I contact support?')">📧 Contact info?</button>
        <button class="quick-btn" onclick="sendQuick('Tell me about the company')">🏢 About company?</button>
      </div>
    </div>
  `;
}

function renderActiveSessionMessages() {
  const container = document.getElementById("messages");
  if (!container) return;
  container.innerHTML = "";

  const session = getActiveSession();
  if (!session || !session.messages || session.messages.length === 0) {
    container.innerHTML = renderWelcomeScreen();
    return;
  }

  session.messages.forEach(msg => {
    addMessage(msg.role, msg.text, msg.sources || []);
  });
}

function renderSessionsList() {
  const listEl = document.getElementById("sessions-list");
  const countEl = document.getElementById("session-count");
  if (!listEl) return;

  if (countEl) countEl.textContent = chatSessions.length;

  if (chatSessions.length === 0) {
    listEl.innerHTML = '<p class="no-files">No past chats yet</p>';
    return;
  }

  listEl.innerHTML = chatSessions.map(session => {
    const isActive = session.id === currentSessionId;
    const safeTitle = (session.title || "New Conversation").replace(/"/g, '&quot;');
    const safeId = session.id.replace(/'/g, "\\'");
    return `
      <div class="session-item ${isActive ? "active" : ""}" onclick="switchChatSession('${safeId}')" title="${safeTitle}">
        <span class="session-icon">💬</span>
        <span class="session-title">${safeTitle}</span>
        <div class="session-actions">
          <button class="session-action-btn" onclick="renameChatSession(event, '${safeId}')" title="Rename conversation">✏️</button>
          <button class="session-action-btn delete" onclick="deleteChatSession(event, '${safeId}')" title="Delete conversation">✕</button>
        </div>
      </div>
    `;
  }).join("");
}

function createNewChatSession(notify = true) {
  const newId = "session_" + Date.now();
  const newSession = {
    id: newId,
    title: "New Conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  chatSessions.unshift(newSession);
  saveSessions();
  switchChatSession(newId, false);

  if (notify) {
    showToast("Started a new conversation", "success");
  }
}

async function switchChatSession(sessionId, syncBackend = true) {
  currentSessionId = sessionId;
  saveSessions();
  renderSessionsList();
  renderActiveSessionMessages();

  if (syncBackend) {
    try {
      await fetch(`${API}/clear`, { method: "POST" });
    } catch (e) {}
  }

  const input = document.getElementById("user-input");
  if (input) input.focus();
}

function deleteChatSession(event, sessionId) {
  event.stopPropagation();

  const idx = chatSessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return;

  chatSessions.splice(idx, 1);

  if (currentSessionId === sessionId) {
    if (chatSessions.length > 0) {
      currentSessionId = chatSessions[0].id;
    } else {
      createNewChatSession(false);
      return;
    }
  }

  saveSessions();
  renderSessionsList();
  renderActiveSessionMessages();
  showToast("Conversation deleted", "success");
}

function renameChatSession(event, sessionId) {
  event.stopPropagation();
  const session = chatSessions.find(s => s.id === sessionId);
  if (!session) return;

  const newTitle = prompt("Rename conversation:", session.title);
  if (newTitle && newTitle.trim()) {
    session.title = newTitle.trim().slice(0, 40);
    session.updatedAt = Date.now();
    saveSessions();
    renderSessionsList();
    showToast("Conversation renamed", "success");
  }
}

function appendMessageToActiveSession(role, text, sources = []) {
  let session = getActiveSession();
  if (!session) {
    createNewChatSession(false);
    session = getActiveSession();
  }

  if (role === "user" && (!session.title || session.title === "New Conversation")) {
    session.title = text.slice(0, 32).trim() + (text.length > 32 ? "..." : "");
  }

  session.messages.push({ role, text, sources });
  session.updatedAt = Date.now();
  saveSessions();
  renderSessionsList();
}

// ── Init ──
window.onload = () => {
  initTheme();
  initChatSessions();
  loadStats();
  setInterval(loadStats, 10000);  // refresh stats every 10s
};

// ── Load stats from server ──
async function loadStats() {
  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();

    document.getElementById("stat-docs").textContent = data.docs;
    document.getElementById("stat-chunks").textContent = data.chunks;
    document.getElementById("stat-chats").textContent = data.conversations;

    // Update status
    const dot = document.getElementById("status-dot");
    const status = document.getElementById("header-status");
    dot.classList.remove("loading");

    if (data.docs === 0) {
      status.textContent = "No knowledge loaded — upload a file!";
    } else {
      status.textContent = `Ready — ${data.docs} document${data.docs > 1 ? "s" : ""} loaded`;
    }

    // Files list
    const filesList = document.getElementById("files-list");
    if (data.files.length === 0) {
      filesList.innerHTML = '<p class="no-files">No files yet</p>';
    } else {
      filesList.innerHTML = data.files.map(f => {
        const icon = f.toLowerCase().endsWith(".pdf") ? "📕" : "📄";
        const safeName = f.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="file-tag">
          <span title="${f}">${icon} ${f}</span>
          <button class="delete-doc-btn" onclick="openDeleteModal('${safeName}')" title="Delete '${safeName}'">✕</button>
        </div>`;
      }).join("");
    }
  } catch (err) {
    document.getElementById("status-dot").classList.add("loading");
    document.getElementById("header-status").textContent = "Connecting to server...";
  }
}

// ── Full Markdown Renderer ──
function formatMessageText(text) {
  if (!text) return "";

  // Escape HTML entities first (safety)
  const escape = s => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Split into lines for block-level parsing
  const lines = text.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block (``` ... ```) ──
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      let code = "";
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code += escape(lines[i]) + "\n";
        i++;
      }
      html += `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${lang || "code"}</span><button class="md-copy-code" onclick="copyCodeBlock(this)">📋 Copy</button></div><pre><code>${code.trimEnd()}</code></pre></div>`;
      i++; // skip closing ```
      continue;
    }

    // ── Heading 1 ──
    if (/^# /.test(line)) {
      html += `<h1 class="md-h1">${renderInline(line.slice(2))}</h1>`;
      i++; continue;
    }
    // ── Heading 2 ──
    if (/^## /.test(line)) {
      html += `<h2 class="md-h2">${renderInline(line.slice(3))}</h2>`;
      i++; continue;
    }
    // ── Heading 3 ──
    if (/^### /.test(line)) {
      html += `<h3 class="md-h3">${renderInline(line.slice(4))}</h3>`;
      i++; continue;
    }
    // ── Heading 4 ──
    if (/^#### /.test(line)) {
      html += `<h4 class="md-h4">${renderInline(line.slice(5))}</h4>`;
      i++; continue;
    }

    // ── Blockquote ──
    if (/^> /.test(line)) {
      let quote = "";
      while (i < lines.length && /^> /.test(lines[i])) {
        quote += renderInline(lines[i].slice(2)) + "<br/>";
        i++;
      }
      html += `<blockquote class="md-blockquote">${quote}</blockquote>`;
      continue;
    }

    // ── Horizontal rule ──
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      html += `<hr class="md-hr"/>`;
      i++; continue;
    }

    // ── Unordered list ──
    if (/^[\*\-] /.test(line)) {
      html += `<ul class="md-ul">`;
      while (i < lines.length && /^[\*\-] /.test(lines[i])) {
        html += `<li>${renderInline(lines[i].slice(2))}</li>`;
        i++;
      }
      html += `</ul>`;
      continue;
    }

    // ── Ordered list ──
    if (/^\d+\. /.test(line)) {
      html += `<ol class="md-ol">`;
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        html += `<li>${renderInline(lines[i].replace(/^\d+\. /, ""))}</li>`;
        i++;
      }
      html += `</ol>`;
      continue;
    }

    // ── Table ──
    if (/\|/.test(line) && i + 1 < lines.length && /^\|?[\s\-:|]+\|/.test(lines[i + 1])) {
      const headers = line.split("|").filter(c => c.trim()).map(c => `<th>${renderInline(c.trim())}</th>`).join("");
      i += 2; // skip header + separator
      let rows = "";
      while (i < lines.length && /\|/.test(lines[i])) {
        const cells = lines[i].split("|").filter(c => c.trim()).map(c => `<td>${renderInline(c.trim())}</td>`).join("");
        rows += `<tr>${cells}</tr>`;
        i++;
      }
      html += `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
      continue;
    }

    // ── Empty line → paragraph break ──
    if (line.trim() === "") {
      html += `<div class="md-spacer"></div>`;
      i++; continue;
    }

    // ── Regular paragraph ──
    html += `<p class="md-p">${renderInline(line)}</p>`;
    i++;
  }

  return html;
}

// ── Inline Markdown (bold, italic, code, links) ──
function renderInline(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, `<code class="md-inline-code">$1</code>`)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>`);
}

// ── Copy code block button ──
function copyCodeBlock(btn) {
  const code = btn.closest(".md-code-block").querySelector("code").innerText;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = "✓ Copied!";
    btn.style.color = "#4ade80";
    setTimeout(() => { btn.textContent = "📋 Copy"; btn.style.color = ""; }, 2000);
  });
}

// ── Global Source Cache ──
const sourceStore = {};

// ── Render Interactive Source Chips ──
function buildSourcesHTML(sources) {
  if (!sources || sources.length === 0) return "";
  const tags = sources.map((s, idx) => {
    let filename = "";
    let chunkText = "";
    let chunkNum = idx + 1;

    if (typeof s === "string") {
      filename = s.split(/[\\/]/).pop();
      chunkText = `Document: ${filename}`;
    } else {
      filename = s.filename || (s.source ? s.source.split(/[\\/]/).pop() : "document");
      chunkText = s.chunk_text || "";
      chunkNum = s.index || (idx + 1);
    }

    const sourceId = "src_" + Math.random().toString(36).slice(2, 10);
    sourceStore[sourceId] = {
      filename,
      chunkNum,
      chunkText,
    };

    const icon = filename.toLowerCase().endsWith(".pdf") ? "📕" : "📄";
    return `<button type="button" class="source-tag clickable" onclick="openSourceModal('${sourceId}')" title="Click to inspect retrieved passage">${icon} ${filename} <span class="chunk-badge">#${chunkNum}</span></button>`;
  }).join("");

  return `<div class="sources"><span class="source-label">📎 Referenced Context:</span>${tags}</div>`;
}

// ── Send message with Live SSE Streaming ──
async function sendMessage() {
  const input = document.getElementById("user-input");
  const message = input.value.trim();
  if (!message) return;

  // Stop voice recording if active
  stopVoiceInput();

  // Hide welcome screen
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  // Add user bubble
  addMessage("user", message);
  appendMessageToActiveSession("user", message);
  input.value = "";
  autoResize(input);

  // Disable send button while streaming
  const btn = document.getElementById("send-btn");
  btn.disabled = true;

  // Create live bot bubble
  const container = document.getElementById("messages");
  const botMsg = document.createElement("div");
  botMsg.className = "message bot";
  botMsg.innerHTML = `
    <div class="avatar">🧠</div>
    <div class="bubble">
      <div class="bubble-content">
        <div class="typing-indicator" style="padding:4px 0">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
      <div class="sources-container"></div>
    </div>
  `;
  container.appendChild(botMsg);
  container.scrollTop = container.scrollHeight;

  const contentEl = botMsg.querySelector(".bubble-content");
  const sourcesEl = botMsg.querySelector(".sources-container");

  let fullText = "";

  try {
    const res = await fetch(`${API}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let hasReceivedFirstToken = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep partial event in buffer

      for (const raw of events) {
        const line = raw.trim();
        if (!line.startsWith("data: ")) continue;

        try {
          const ev = JSON.parse(line.slice(6));

          if (ev.type === "token") {
            hasReceivedFirstToken = true;
            fullText += ev.text;
            contentEl.innerHTML = formatMessageText(fullText) + '<span class="streaming-cursor"></span>';
            container.scrollTop = container.scrollHeight;

          } else if (ev.type === "done") {
            // Streaming complete
            contentEl.innerHTML = formatMessageText(fullText || "No response generated.");
            if (ev.sources && ev.sources.length > 0) {
              sourcesEl.innerHTML = buildSourcesHTML(ev.sources);
            }
            if (ev.history_length !== undefined) {
              document.getElementById("stat-chats").textContent = ev.history_length;
            }
            container.scrollTop = container.scrollHeight;
            appendMessageToActiveSession("bot", fullText || "No response generated.", ev.sources || []);

          } else if (ev.type === "error") {
            contentEl.innerHTML = formatMessageText(ev.text || "⚠️ An error occurred.");
          }
        } catch (parseErr) {
          console.error("SSE parse error:", parseErr, line);
        }
      }
    }

    // Ensure cursor is removed even if done event was missed
    if (contentEl.querySelector(".streaming-cursor")) {
      contentEl.innerHTML = formatMessageText(fullText);
    }

  } catch (err) {
    console.warn("Streaming fetch failed, trying fallback /chat:", err);
    // Fallback to standard /chat endpoint
    try {
      const fallbackRes = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await fallbackRes.json();
      contentEl.innerHTML = formatMessageText(data.answer);
      if (data.sources && data.sources.length > 0) {
        sourcesEl.innerHTML = buildSourcesHTML(data.sources);
      }
      document.getElementById("stat-chats").textContent = data.history_length;
      appendMessageToActiveSession("bot", data.answer, data.sources || []);
    } catch (fallbackErr) {
      contentEl.innerHTML = "⚠️ Connection error. Make sure the server is running (`py api.py`).";
    }
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

// ── Quick prompt buttons ──
function sendQuick(text) {
  document.getElementById("user-input").value = text;
  sendMessage();
}

// ── Add static message bubble (for welcome/system/uploads) ──
function addMessage(role, text, sources = []) {
  const container = document.getElementById("messages");
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const avatar = role === "bot" ? "🧠" : "👤";
  const formatted = formatMessageText(text);
  const sourcesHTML = buildSourcesHTML(sources);

  msg.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble">
      <div class="bubble-content">${formatted}</div>
      ${sourcesHTML}
    </div>
  `;

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// ── Typing indicator ──
function showTyping() {
  const container = document.getElementById("messages");
  const id = "typing-" + Date.now();
  const el = document.createElement("div");
  el.className = "message bot";
  el.id = id;
  el.innerHTML = `
    <div class="avatar">🧠</div>
    <div class="bubble">
      <div class="bubble-content" style="padding:14px 16px">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Upload file ──
async function uploadFile(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById("upload-status");
  const label = document.getElementById("upload-text");

  status.textContent = "Uploading and learning...";
  status.className = "upload-status loading";
  label.textContent = "⏳ Processing...";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    }

    const data = await res.json();
    status.textContent = `✓ ${data.message}`;
    status.className = "upload-status success";
    label.textContent = "📁 Choose File (.txt / .pdf)";

    // Reload stats
    loadStats();

    // Show system message in chat
    const welcome = document.getElementById("welcome");
    if (welcome) welcome.remove();
    addMessage("bot", `✅ I've learned from **${file.name}**! It was split into chunks and indexed. You can now ask me questions about it.`);

  } catch (err) {
    status.textContent = `✗ ${err.message}`;
    status.className = "upload-status error";
    label.textContent = "📁 Choose File (.txt / .pdf)";
  }

  // Reset file input
  input.value = "";
  setTimeout(() => { status.textContent = ""; }, 4000);
}

// ── Clear history ──
async function clearHistory() {
  await fetch(`${API}/clear`, { method: "POST" });
  const session = getActiveSession();
  if (session) {
    session.messages = [];
    session.title = "New Conversation";
    saveSessions();
    renderSessionsList();
  }
  renderActiveSessionMessages();
  showToast("Chat cleared", "success");
  document.getElementById("stat-chats").textContent = "0";
}

// ── Key handler ──
function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Auto resize textarea ──
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

// ── Source Inspector Modal Handlers ──
let activeSnippetText = "";

function openSourceModal(sourceId) {
  const item = sourceStore[sourceId];
  if (!item) return;

  activeSnippetText = item.chunkText;
  const filenameEl = document.getElementById("modal-filename");
  const chunkBadgeEl = document.getElementById("modal-chunk-id");
  const snippetEl = document.getElementById("modal-snippet");

  if (filenameEl) filenameEl.textContent = item.filename;
  if (chunkBadgeEl) chunkBadgeEl.textContent = `Passage #${item.chunkNum}`;
  if (snippetEl) snippetEl.textContent = item.chunkText;

  const copyBtn = document.getElementById("copy-btn");
  if (copyBtn) {
    copyBtn.innerHTML = "📋 Copy text";
    copyBtn.classList.remove("copied");
  }

  const modal = document.getElementById("source-modal");
  if (modal) modal.classList.add("open");
}

function closeSourceModal(e) {
  if (e && e.target && e.target !== document.getElementById("source-modal") && !e.target.classList.contains("modal-close-btn")) {
    return;
  }
  const modal = document.getElementById("source-modal");
  if (modal) modal.classList.remove("open");
}

// Close any open modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["source-modal", "export-modal", "delete-modal"].forEach(id => {
      const modal = document.getElementById(id);
      if (modal && modal.classList.contains("open")) {
        modal.classList.remove("open");
      }
    });
  }
});

async function copySourceSnippet() {
  if (!activeSnippetText) return;
  try {
    await navigator.clipboard.writeText(activeSnippetText);
    const copyBtn = document.getElementById("copy-btn");
    if (copyBtn) {
      copyBtn.innerHTML = "✓ Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.innerHTML = "📋 Copy text";
        copyBtn.classList.remove("copied");
      }, 2200);
    }
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
}

// ── Export Chat Modal ──
function openExportModal() {
  const messages = document.querySelectorAll("#messages .message");
  const count = [...messages].filter(m => !m.querySelector(".typing-indicator")).length;

  const badge = document.getElementById("export-msg-count");
  if (badge) badge.textContent = `${count} message${count !== 1 ? "s" : ""}`;

  const modal = document.getElementById("export-modal");
  if (modal) modal.classList.add("open");
}

function closeExportModal(e) {
  if (e && e.target !== document.getElementById("export-modal")) return;
  const modal = document.getElementById("export-modal");
  if (modal) modal.classList.remove("open");
}

// ── Scrape visible chat messages into structured log ──
function scrapeChat() {
  const msgs = document.querySelectorAll("#messages .message");
  const log = [];
  msgs.forEach(msg => {
    // Skip typing indicators and welcome screen
    if (msg.querySelector(".typing-indicator") || msg.querySelector(".welcome-screen")) return;

    const isBot = msg.classList.contains("bot");
    const role = isBot ? "bot" : "user";

    const contentEl = msg.querySelector(".bubble-content");
    const text = contentEl ? (contentEl.innerText || contentEl.textContent || "").trim() : "";
    if (!text) return;

    // Collect sources from clickable buttons inside the message
    const sources = [];
    msg.querySelectorAll(".source-tag").forEach(tag => {
      const filename = tag.textContent.replace(/#\d+/g, "").trim();
      if (filename && !sources.includes(filename)) sources.push(filename);
    });

    log.push({ role, text, sources });
  });
  return log;
}

// ── Build Markdown export string ──
function buildMarkdownExport(log) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  let md = `# 🧠 KnowledgeBot Conversation\n\n`;
  md += `> **Exported:** ${dateStr} at ${timeStr}  \n`;
  md += `> **Powered by:** Gemini AI + ChromaDB RAG\n\n`;
  md += `---\n\n`;

  log.forEach((entry, i) => {
    if (entry.role === "user") {
      md += `### 👤 You\n\n${entry.text}\n\n`;
    } else {
      md += `### 🧠 KnowledgeBot\n\n${entry.text}\n\n`;
      if (entry.sources.length > 0) {
        md += `> 📎 **Sources:** ${entry.sources.map(s => `\`${s}\``).join(", ")}\n\n`;
      }
    }
    if (i < log.length - 1) md += `---\n\n`;
  });

  return md;
}

// ── Build Plain Text export string ──
function buildTxtExport(log) {
  const now = new Date();
  const dateStr = now.toLocaleString("en-US");

  let txt = `KNOWLEDGEBOT CONVERSATION\n`;
  txt += `Exported: ${dateStr}\n`;
  txt += `${"=".repeat(50)}\n\n`;

  log.forEach(entry => {
    const role = entry.role === "user" ? "YOU" : "KNOWLEDGEBOT";
    txt += `[${role}]\n${entry.text}\n`;
    if (entry.sources.length > 0) {
      txt += `Sources: ${entry.sources.join(", ")}\n`;
    }
    txt += `\n${"-".repeat(40)}\n\n`;
  });

  return txt;
}

// ── Trigger file download ──
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export chat in chosen format ──
function exportChat(format) {
  const log = scrapeChat();

  if (log.length === 0) {
    alert("No conversation to export yet! Ask the bot a question first.");
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);

  if (format === "md") {
    const content = buildMarkdownExport(log);
    downloadFile(content, `knowledgebot-${datePart}.md`, "text/markdown;charset=utf-8");
  } else {
    const content = buildTxtExport(log);
    downloadFile(content, `knowledgebot-${datePart}.txt`, "text/plain;charset=utf-8");
  }

  // Close modal after download
  const modal = document.getElementById("export-modal");
  if (modal) modal.classList.remove("open");
}

// ── Delete Document Modal & Logic ──
let filePendingDelete = null;

function openDeleteModal(filename) {
  filePendingDelete = filename;
  const nameEl = document.getElementById("delete-doc-name");
  const valEl = document.getElementById("delete-file-val");
  const btn = document.getElementById("confirm-delete-btn");

  if (nameEl) nameEl.textContent = filename;
  if (valEl) valEl.textContent = `knowledge/${filename}`;
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = "🗑️ Delete Document";
  }

  const modal = document.getElementById("delete-modal");
  if (modal) modal.classList.add("open");
}

function closeDeleteModal(e) {
  if (e && e.target !== document.getElementById("delete-modal")) return;
  const modal = document.getElementById("delete-modal");
  if (modal) modal.classList.remove("open");
  filePendingDelete = null;
}

async function executeDeleteDocument() {
  if (!filePendingDelete) return;
  const filename = filePendingDelete;
  const btn = document.getElementById("confirm-delete-btn");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Deleting...";
  }

  try {
    const res = await fetch(`${API}/documents/${encodeURIComponent(filename)}`, {
      method: "DELETE"
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Failed to delete document");
    }

    closeDeleteModal();
    showToast(`Deleted '${filename}' (${data.deleted_chunks} vectors purged)`, "success");
    await loadStats();
  } catch (err) {
    console.error("Delete error:", err);
    showToast(`Error: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🗑️ Try Again";
    }
  }
}

// ── Toast Notification Helper ──
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : "⚠️";
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3300);
}

// ── Voice Input (Speech-to-Text) ──
let speechRecognizer = null;
let isRecording = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  let finalTranscript = "";

  rec.onstart = () => {
    isRecording = true;
    updateVoiceUI(true, "Listening... Speak your question");
  };

  rec.onresult = (event) => {
    let interim = "";
    const input = document.getElementById("user-input");

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }

    const currentText = (finalTranscript + interim).trim();
    if (input) {
      input.value = currentText;
      autoResize(input);
    }
  };

  rec.onerror = (event) => {
    console.warn("Speech recognition error:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showToast("Microphone permission denied. Allow mic access in your browser settings.", "error");
    } else if (event.error === "no-speech") {
      // Periodic no-speech is normal, let it stay active
    } else {
      showToast(`Voice error: ${event.error}`, "error");
    }
    stopVoiceInput();
  };

  rec.onend = () => {
    // If still marked as recording, stop cleanly
    stopVoiceInput();
  };

  return rec;
}

function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Speech recognition is not supported in this browser. Please use Chrome or Edge.", "error");
    return;
  }

  if (isRecording) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

function startVoiceInput() {
  const input = document.getElementById("user-input");
  if (!speechRecognizer) {
    speechRecognizer = initSpeechRecognition();
  }
  if (!speechRecognizer) return;

  try {
    speechRecognizer.start();
  } catch (err) {
    console.warn("Could not start speech recognition:", err);
    try {
      speechRecognizer.stop();
      setTimeout(() => speechRecognizer.start(), 250);
    } catch (e) {}
  }
}

function stopVoiceInput() {
  if (speechRecognizer && isRecording) {
    try {
      speechRecognizer.stop();
    } catch (e) {}
  }
  isRecording = false;
  updateVoiceUI(false);
}

function updateVoiceUI(recording, statusText = "") {
  const btn = document.getElementById("mic-btn");
  const bar = document.getElementById("voice-status");
  const textEl = document.getElementById("voice-status-text");

  if (btn) {
    if (recording) {
      btn.classList.add("recording");
      btn.title = "Click to stop listening";
    } else {
      btn.classList.remove("recording");
      btn.title = "Voice input — Speak your question";
    }
  }

  if (bar) {
    bar.style.display = recording ? "flex" : "none";
    if (textEl && statusText) textEl.textContent = statusText;
  }
}



