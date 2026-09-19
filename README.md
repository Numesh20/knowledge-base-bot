# 🧠 Knowledge Base Bot

An AI-powered chatbot that answers questions from your own documents — built with **Python**, **Google Gemini** (free), and **ChromaDB**.

> Ask it anything. It searches your knowledge base and gives intelligent, sourced answers.

---

## ✨ Features

- 📄 **Load any `.txt` file** as your knowledge base
- 🔍 **Semantic search** — finds relevant info even if wording is different
- 🤖 **AI-powered answers** — powered by Google Gemini (free tier)
- 🗄️ **Local vector database** — ChromaDB stores everything on your computer
- 🔄 **Continuous learning** — just add more `.txt` files and re-run
- 💬 **Chat history** — remembers your conversation

---

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/knowledge-base-bot.git
cd knowledge-base-bot
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Get a FREE Gemini API Key
- Go to [aistudio.google.com](https://aistudio.google.com)
- Sign in with Google → **Get API Key** → **Create API Key**
- Copy your key

### 4. Add your API key
Create a `.env` file in the project root:
```
GEMINI_API_KEY=your-key-here
```

### 5. Add your knowledge
Put `.txt` files in the `knowledge/` folder. A sample is already included!

### 6. Run the bot!
```bash
python bot.py
```

---

## 💬 Example

```
You: What are your working hours?
Bot: Based on the knowledge base: Monday to Friday: 9 AM – 6 PM (PST),
     Saturday: 10 AM – 2 PM (PST), Sunday: Closed.

📎 Sources: knowledge/sample.txt
```

---

## 📁 Project Structure

```
knowledge-base-bot/
├── bot.py              ← Main bot code (RAG pipeline)
├── requirements.txt    ← Python dependencies
├── .env                ← Your API key (NOT uploaded to GitHub)
├── .gitignore          ← Protects secrets from being shared
└── knowledge/
    └── sample.txt      ← Your knowledge documents go here
```

---

## 🧠 How It Works (RAG Architecture)

```
Your Question
     ↓
Embed question → Search ChromaDB → Find relevant chunks
     ↓
Send chunks + question to Gemini
     ↓
Get intelligent, sourced answer!
```

This pattern is called **RAG (Retrieval-Augmented Generation)** — the same technology used by ChatGPT plugins, Notion AI, and enterprise knowledge bases.

---

## 📚 Add Your Own Knowledge

Simply drop `.txt` files into the `knowledge/` folder:

```
knowledge/
├── company_faq.txt
├── product_manual.txt
├── support_guide.txt
└── policies.txt
```

Then re-run `python bot.py` — it will automatically learn from all of them!

---

## 🛠️ Tech Stack

| Tool | Purpose |
|------|---------|
| Python 3.12+ | Core language |
| Google Gemini | AI model (free) |
| ChromaDB | Local vector database |
| python-dotenv | Secure API key loading |

---

## 📖 Learning Resources

- [LangChain Docs](https://python.langchain.com)
- [Google Gemini API](https://ai.google.dev)
- [ChromaDB Docs](https://docs.trychroma.com)
- [What is RAG?](https://cloud.google.com/use-cases/retrieval-augmented-generation)

---

## ⚠️ Important

- Never share or commit your `.env` file — it contains your secret API key
- The `chroma_db/` folder is auto-generated and excluded from Git
- This project uses Google Gemini's **free tier** — no credit card needed

---

Made with ❤️ for learning AI development.
