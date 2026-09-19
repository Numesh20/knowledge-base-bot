# -*- coding: utf-8 -*-
"""
api.py — FastAPI Web Server for KnowledgeBot
Run: py api.py
Then open: http://localhost:8000
"""

import os
import sys
import glob
import shutil
from pathlib import Path
from dotenv import load_dotenv

# Fix Windows terminal encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY or GEMINI_API_KEY == "your-gemini-api-key-here":
    print("\n[ERROR] No GEMINI_API_KEY found in .env file!")
    print("  Get a FREE key at: https://aistudio.google.com\n")
    sys.exit(1)

print("[OK] API key loaded.")
print("[...] Loading libraries...")

import chromadb
from google import genai
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

# ── Gemini client ──
client = genai.Client(api_key=GEMINI_API_KEY)

# ── ChromaDB ──
db = chromadb.PersistentClient(path="./chroma_db")

# ── Global collection ──
collection = None
doc_count = 0
chunk_count = 0
chat_history = []

# ── Helpers ──
def chunk_text(text, chunk_size=400, overlap=50):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    return chunks

def get_embedding(text):
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
    )
    return response.embeddings[0].values

def build_kb():
    global collection, doc_count, chunk_count
    print("\n[...] Building knowledge base...")
    try:
        db.delete_collection("knowledge_base")
    except Exception:
        pass
    collection = db.create_collection("knowledge_base")

    txt_files = glob.glob("knowledge/*.txt")
    doc_count = len(txt_files)
    chunk_count = 0

    for file_path in txt_files:
        print(f"  [FILE] {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        chunks = chunk_text(text)
        for i, chunk in enumerate(chunks):
            emb = get_embedding(chunk)
            collection.add(
                ids=[f"{file_path}-{i}"],
                embeddings=[emb],
                documents=[chunk],
                metadatas=[{"source": file_path, "chunk": i}],
            )
        chunk_count += len(chunks)

    print(f"[READY] {doc_count} files, {chunk_count} chunks loaded.\n")

def retrieve(question, top_k=3):
    if not collection:
        return [], []
    emb = get_embedding(question)
    results = collection.query(query_embeddings=[emb], n_results=min(top_k, chunk_count or 1))
    chunks = results["documents"][0]
    sources = list(set([m["source"] for m in results["metadatas"][0]]))
    return chunks, sources

def generate_answer(question, context_chunks, history):
    context = "\n\n".join(context_chunks)

    # Build conversation history string
    history_str = ""
    for turn in history[-4:]:  # last 4 exchanges
        history_str += f"User: {turn['question']}\nBot: {turn['answer']}\n\n"

    prompt = f"""You are a helpful and friendly knowledge base assistant.
Use the KNOWLEDGE BASE CONTEXT below to answer the user's question accurately.
If the answer is not in the context, say: "I don't have that information in my knowledge base."
Keep answers clear and concise.

=== PREVIOUS CONVERSATION ===
{history_str}
=== KNOWLEDGE BASE CONTEXT ===
{context}
==============================

Current Question: {question}

Answer:"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )
    return response.text.strip()

# ── FastAPI App ──
app = FastAPI(title="KnowledgeBot API")

# Serve static files (HTML/CSS/JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def home():
    return FileResponse("static/index.html")

# Request/Response models
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    answer: str
    sources: list
    history_length: int

# ── Chat endpoint ──
@app.post("/chat")
def chat(req: ChatRequest):
    global chat_history
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")
    if chunk_count == 0:
        return JSONResponse({"answer": "No knowledge loaded yet! Upload a .txt file first using the panel on the left.", "sources": [], "history_length": 0})

    chunks, sources = retrieve(req.message)
    answer = generate_answer(req.message, chunks, chat_history)
    chat_history.append({"question": req.message, "answer": answer})

    # Keep history to last 20
    if len(chat_history) > 20:
        chat_history = chat_history[-20:]

    return {"answer": answer, "sources": sources, "history_length": len(chat_history)}

# ── Upload endpoint ──
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are supported")

    save_path = f"knowledge/{file.filename}"
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Rebuild knowledge base
    build_kb()
    return {"message": f"'{file.filename}' uploaded and learned!", "docs": doc_count, "chunks": chunk_count}

# ── Stats endpoint ──
@app.get("/stats")
def stats():
    return {
        "docs": doc_count,
        "chunks": chunk_count,
        "conversations": len(chat_history),
        "files": [Path(f).name for f in glob.glob("knowledge/*.txt")]
    }

# ── Clear history ──
@app.post("/clear")
def clear_history():
    global chat_history
    chat_history = []
    return {"message": "Chat history cleared"}

# ── Run server ──
if __name__ == "__main__":
    build_kb()
    print("=" * 50)
    print("  KnowledgeBot Web UI is running!")
    print("  Open your browser: http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
