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
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader
import uvicorn
import json

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
def extract_text_from_file(file_path):
    """Extract text from a .txt or .pdf file."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    elif ext == ".pdf":
        reader = PdfReader(file_path)
        pages_text = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                pages_text.append(t.strip())
        return "\n\n".join(pages_text)
    return ""

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

def get_embedding(text, max_retries=3):
    import time
    for attempt in range(max_retries):
        try:
            response = client.models.embed_content(
                model="gemini-embedding-001",
                contents=text,
            )
            return response.embeddings[0].values
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            print(f"      [RETRY] Embedding call failed ({e}). Retrying in {1.5 * (attempt + 1):.1f}s...")
            time.sleep(1.5 * (attempt + 1))

def build_kb(force_rebuild=False):
    global collection, doc_count, chunk_count
    all_files = glob.glob("knowledge/*.txt") + glob.glob("knowledge/*.pdf")
    doc_count = len(all_files)

    if not force_rebuild:
        try:
            collection = db.get_collection("knowledge_base")
            chunk_count = collection.count()
            if chunk_count > 0:
                print(f"[READY] Knowledge base loaded from disk! ({doc_count} files, {chunk_count} chunks)\n")
                return
        except Exception:
            pass

    print("\n[...] Building knowledge base from scratch...")
    try:
        db.delete_collection("knowledge_base")
    except Exception:
        pass
    collection = db.create_collection("knowledge_base")

    files = all_files
    doc_count = len(files)
    chunk_count = 0

    for file_path in files:
        print(f"  [FILE] {file_path}")
        try:
            text = extract_text_from_file(file_path)
        except Exception as e:
            print(f"  [ERROR] Could not read {file_path}: {e}")
            continue

        if not text.strip():
            print(f"  [WARN] No readable text found in {file_path}")
            continue

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
    chunks = results["documents"][0] if results.get("documents") else []
    metas = results["metadatas"][0] if results.get("metadatas") else []

    source_details = []
    for i, chunk_text in enumerate(chunks):
        meta = metas[i] if i < len(metas) else {}
        src = meta.get("source", "knowledge")
        filename = os.path.basename(src)
        source_details.append({
            "source": src,
            "filename": filename,
            "chunk_text": chunk_text,
            "index": i + 1
        })

    return chunks, source_details

def build_prompt(question, context_chunks, history):
    """Build the prompt string — shared by streaming and non-streaming."""
    context = "\n\n".join(context_chunks)
    history_str = ""
    for turn in history[-4:]:
        history_str += f"User: {turn['question']}\nBot: {turn['answer']}\n\n"

    history_section = f"=== PREVIOUS CONVERSATION ===\n{history_str}\n" if history_str else ""

    return f"""You are a helpful and friendly knowledge base assistant.
Use the KNOWLEDGE BASE CONTEXT below to answer the user's question accurately.
If the answer is not in the context, say: "I don't have that information in my knowledge base."
Keep answers clear and concise.

{history_section}=== KNOWLEDGE BASE CONTEXT ===
{context}
==============================

Current Question: {question}

Answer:"""

def generate_answer(question, context_chunks, history):
    prompt = build_prompt(question, context_chunks, history)
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )
    return response.text.strip()


# ── FastAPI App ──
app = FastAPI(title="KnowledgeBot API")

@app.on_event("startup")
def startup_event():
    """Build knowledge base automatically on server startup (local & cloud)."""
    global collection
    if collection is None:
        build_kb()

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

# ── Chat endpoint (non-streaming fallback) ──
@app.post("/chat")
def chat(req: ChatRequest):
    global chat_history
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")
    if chunk_count == 0:
        return JSONResponse({"answer": "No knowledge loaded yet! Upload a .txt or .pdf file first using the panel on the left.", "sources": [], "history_length": 0})

    chunks, sources = retrieve(req.message)
    answer = generate_answer(req.message, chunks, chat_history)
    chat_history.append({"question": req.message, "answer": answer})
    if len(chat_history) > 20:
        chat_history = chat_history[-20:]
    return {"answer": answer, "sources": sources, "history_length": len(chat_history)}

# ── Streaming chat endpoint (Server-Sent Events) ──
@app.post("/stream")
def stream_chat(req: ChatRequest):
    global chat_history
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    if chunk_count == 0:
        def no_kb():
            data = {"type": "token", "text": "No knowledge loaded yet! Upload a .txt or .pdf file first using the panel on the left."}
            yield f"data: {json.dumps(data)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'sources': [], 'history_length': 0})}\n\n"
        return StreamingResponse(no_kb(), media_type="text/event-stream")

    # Retrieve context before streaming
    chunks, sources = retrieve(req.message)
    prompt = build_prompt(req.message, chunks, chat_history)

    def event_stream():
        full_answer = ""
        try:
            # Use Gemini streaming
            for chunk in client.models.generate_content_stream(
                model="gemini-3.6-flash",
                contents=prompt,
            ):
                text_piece = chunk.text or ""
                if text_piece:
                    full_answer += text_piece
                    data = {"type": "token", "text": text_piece}
                    yield f"data: {json.dumps(data)}\n\n"

            # Save to history
            chat_history.append({"question": req.message, "answer": full_answer.strip()})
            if len(chat_history) > 20:
                chat_history[:] = chat_history[-20:]

            # Send done event with sources
            done_data = {"type": "done", "sources": sources, "history_length": len(chat_history)}
            yield f"data: {json.dumps(done_data)}\n\n"

        except Exception as e:
            err_data = {"type": "error", "text": f"⚠️ Error: {str(e)}"}
            yield f"data: {json.dumps(err_data)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── Upload endpoint ──
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".txt", ".pdf"]:
        raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported")

    save_path = f"knowledge/{filename}"
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Rebuild knowledge base
    build_kb()
    return {"message": f"'{filename}' uploaded and learned!", "docs": doc_count, "chunks": chunk_count}

# ── Delete document endpoints ──
def remove_document_internal(filename: str):
    global doc_count, chunk_count
    safe_filename = os.path.basename(filename)
    file_path = os.path.join("knowledge", safe_filename)

    file_existed = False
    if os.path.exists(file_path):
        os.remove(file_path)
        file_existed = True

    deleted_chunks = 0
    if collection:
        all_data = collection.get()
        ids_to_delete = []
        for doc_id, meta in zip(all_data.get("ids", []), all_data.get("metadatas", [])):
            src = meta.get("source", "") if meta else ""
            if os.path.basename(src) == safe_filename or safe_filename in doc_id:
                ids_to_delete.append(doc_id)
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            deleted_chunks = len(ids_to_delete)
        chunk_count = collection.count()

    all_files = glob.glob("knowledge/*.txt") + glob.glob("knowledge/*.pdf")
    doc_count = len(all_files)

    if not file_existed and deleted_chunks == 0:
        raise HTTPException(status_code=404, detail=f"Document '{safe_filename}' not found")

    return {
        "message": f"'{safe_filename}' deleted successfully ({deleted_chunks} chunks removed)",
        "filename": safe_filename,
        "deleted_chunks": deleted_chunks,
        "docs": doc_count,
        "chunks": chunk_count,
        "files": sorted([Path(f).name for f in all_files])
    }

@app.delete("/documents/{filename}")
def delete_document(filename: str):
    insights_cache.pop(os.path.basename(filename), None)
    return remove_document_internal(filename)

@app.delete("/api/documents/{filename}")
def delete_document_api(filename: str):
    insights_cache.pop(os.path.basename(filename), None)
    return remove_document_internal(filename)

class DeleteRequest(BaseModel):
    filename: str

@app.post("/delete-document")
def delete_document_post(req: DeleteRequest):
    insights_cache.pop(os.path.basename(req.filename), None)
    return remove_document_internal(req.filename)

# ── Document Insights Cache & Endpoints ──
insights_cache = {}

def generate_document_insights(filename: str):
    safe_filename = os.path.basename(filename)
    if safe_filename in insights_cache:
        return insights_cache[safe_filename]

    file_path = os.path.join("knowledge", safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Document '{safe_filename}' not found")

    file_size_bytes = os.path.getsize(file_path)
    if file_size_bytes < 1024:
        file_size_str = f"{file_size_bytes} B"
    elif file_size_bytes < 1024 * 1024:
        file_size_str = f"{file_size_bytes / 1024:.1f} KB"
    else:
        file_size_str = f"{file_size_bytes / (1024 * 1024):.1f} MB"

    ext = os.path.splitext(safe_filename)[1].upper().replace(".", "")
    text = extract_text_from_file(file_path)
    if not text.strip():
        return {
            "filename": safe_filename,
            "file_type": ext,
            "file_size": file_size_str,
            "chunks": 0,
            "word_count": 0,
            "summary": "This document appears to be empty or has no readable text.",
            "takeaways": [],
            "topics": []
        }

    chunks_in_doc = 0
    if collection:
        try:
            all_data = collection.get()
            for meta in all_data.get("metadatas", []):
                if meta and os.path.basename(meta.get("source", "")) == safe_filename:
                    chunks_in_doc += 1
        except Exception:
            pass

    sample_text = text[:12000]

    prompt = f"""You are an expert document analyst. Analyze this document and provide a structured JSON overview.

DOCUMENT TITLE: {safe_filename}
CONTENT EXCERPT:
{sample_text}

Return ONLY a valid JSON object with EXACTLY this structure:
{{
  "summary": "A clear, engaging 2-3 sentence executive summary of what this document covers.",
  "takeaways": [
    "Key takeaway point 1",
    "Key takeaway point 2",
    "Key takeaway point 3"
  ],
  "topics": [
    "Topic 1",
    "Topic 2",
    "Topic 3",
    "Topic 4"
  ]
}}"""

    try:
        from google.genai import types
        config = types.GenerateContentConfig(response_mime_type="application/json")
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=config,
        )
        resp_text = response.text.strip()
        data = json.loads(resp_text)
    except Exception as e:
        print(f"[WARN] Insights generation fallback: {e}")
        data = {
            "summary": f"Document covering information from '{safe_filename}'.",
            "takeaways": ["Contains reference information indexed in your knowledge base."],
            "topics": [safe_filename.split(".")[0]]
        }

    result = {
        "filename": safe_filename,
        "file_type": ext,
        "file_size": file_size_str,
        "chunks": chunks_in_doc or len(chunk_text(text)),
        "word_count": len(text.split()),
        "summary": data.get("summary", ""),
        "takeaways": data.get("takeaways", []),
        "topics": data.get("topics", [])
    }

    insights_cache[safe_filename] = result
    return result

@app.get("/documents/{filename}/insights")
def get_insights(filename: str):
    return generate_document_insights(filename)

@app.get("/api/documents/{filename}/insights")
def get_insights_api(filename: str):
    return generate_document_insights(filename)

# ── Stats endpoint ──
@app.get("/stats")
def stats():
    all_files = glob.glob("knowledge/*.txt") + glob.glob("knowledge/*.pdf")
    return {
        "docs": doc_count,
        "chunks": chunk_count,
        "conversations": len(chat_history),
        "files": sorted([Path(f).name for f in all_files])
    }

# ── Clear history ──
@app.post("/clear")
def clear_history():
    global chat_history
    chat_history = []
    return {"message": "Chat history cleared"}

# ── Run server ──
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("=" * 50)
    print("  KnowledgeBot Web UI is running!")
    print(f"  Open your browser: http://localhost:{port}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
