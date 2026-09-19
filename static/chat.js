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
      filesList.innerHTML = data.files.map(f =>
        `<div class="file-tag"><span>📄 ${f}</span></div>`
      ).join("");
    }
  } catch (err) {
    document.getElementById("status-dot").classList.add("loading");
    document.getElementById("header-status").textContent = "Connecting to server...";
  }
}

// ── Send message ──
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

  // Disable send button
  const btn = document.getElementById("send-btn");
  btn.disabled = true;

  // Show typing indicator
  const typingId = showTyping();

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();
    removeTyping(typingId);

    // Add bot answer
    addMessage("bot", data.answer, data.sources);

    // Update chat count
    document.getElementById("stat-chats").textContent = data.history_length;

  } catch (err) {
    removeTyping(typingId);
    addMessage("bot", "⚠️ Connection error. Make sure the server is running (`py api.py`).", []);
  }

  btn.disabled = false;
  input.focus();
}

// ── Quick prompt buttons ──
function sendQuick(text) {
  document.getElementById("user-input").value = text;
  sendMessage();
}

// ── Add message bubble ──
function addMessage(role, text, sources = []) {
  const container = document.getElementById("messages");
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const avatar = role === "bot" ? "🧠" : "👤";

  // Format text — convert **bold** and bullet points
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>")
    .replace(/^\* (.+)/gm, "• $1");

  // Sources HTML
  let sourcesHTML = "";
  if (sources && sources.length > 0) {
    const tags = sources.map(s => {
      const name = s.split(/[\\/]/).pop();  // filename only
      return `<span class="source-tag">${name}</span>`;
    }).join("");
    sourcesHTML = `<div class="sources"><span class="source-label">📎 Sources:</span>${tags}</div>`;
  }

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
    label.textContent = "📄 Choose .txt File";

    // Reload stats
    loadStats();

    // Show system message in chat
    const welcome = document.getElementById("welcome");
    if (welcome) welcome.remove();
    addMessage("bot", `✅ I've learned from **${file.name}**! It was split into chunks and indexed. You can now ask me questions about it.`);

  } catch (err) {
    status.textContent = `✗ ${err.message}`;
    status.className = "upload-status error";
    label.textContent = "📄 Choose .txt File";
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
