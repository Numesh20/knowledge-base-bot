// ── KnowledgeBot Web UI — chat.js ──

const API = "";  // same origin

// ── Init ──
window.onload = () => {
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
        return `<div class="file-tag"><span>${icon} ${f}</span></div>`;
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

  // Hide welcome screen
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  // Add user bubble
  addMessage("user", message);
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
  const container = document.getElementById("messages");
  container.innerHTML = "";
  addMessage("bot", "Chat history cleared! I still have all my documents loaded. Ask me anything! 🧠");
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

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("source-modal");
    if (modal && modal.classList.contains("open")) {
      modal.classList.remove("open");
    }
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

