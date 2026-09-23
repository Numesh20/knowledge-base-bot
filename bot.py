# -*- coding: utf-8 -*-
"""
Knowledge Base Bot  -  bot.py
Uses Google Gemini (FREE) + ChromaDB (local)
Run:  py bot.py
"""

import os
import sys
import glob
from dotenv import load_dotenv

# Fix Windows terminal encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")

# ── Load API key from .env file ──
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY or GEMINI_API_KEY == "your-gemini-api-key-here":
    print("\n[ERROR] No GEMINI_API_KEY found in your .env file!")
    print("   1. Open the .env file")
    print("   2. Replace 'your-gemini-api-key-here' with your real key")
    print("   3. Get a FREE key at: https://aistudio.google.com\n")
    exit(1)

print("[OK] API key loaded.")

# ── Import AI libraries ──
print("[...] Loading AI libraries...")
import chromadb
from google import genai
from google.genai import types

# ── Configure Gemini client ──
client = genai.Client(api_key=GEMINI_API_KEY)

# ── Helper: extract text from file (.txt or .pdf) ──
def extract_text_from_file(file_path):
    """Extract text from a .txt or .pdf file."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    elif ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        pages_text = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                pages_text.append(t.strip())
        return "\n\n".join(pages_text)
    return ""

# ── Helper: split text into chunks ──
def chunk_text(text, chunk_size=400, overlap=50):
    """Break a big text into smaller overlapping pieces."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    return chunks

# ── Helper: get embedding from Gemini ──
def get_embedding(text):
    """Convert text into a list of numbers (vector) using Gemini."""
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
    )
    return response.embeddings[0].values

# ── Build the Knowledge Base ──
def build_knowledge_base():
    """Load all .txt and .pdf files from /knowledge folder and store in ChromaDB."""
    print("\n[...] Building knowledge base...")

    # Connect to local ChromaDB (saves data in ./chroma_db folder)
    db = chromadb.PersistentClient(path="./chroma_db")

    # Delete old collection if it exists (fresh rebuild)
    try:
        db.delete_collection("knowledge_base")
    except Exception:
        pass

    collection = db.create_collection("knowledge_base")

    # Find all .txt and .pdf files in the knowledge/ folder
    files = glob.glob("knowledge/*.txt") + glob.glob("knowledge/*.pdf")
    if not files:
        print("[WARN] No .txt or .pdf files found in the knowledge/ folder!")
        print("       Add some .txt or .pdf files there and run again.")
        return collection, 0

    total_chunks = 0
    for file_path in files:
        print(f"   [FILE] Loading: {file_path}")
        try:
            text = extract_text_from_file(file_path)
        except Exception as e:
            print(f"   [ERROR] Could not read {file_path}: {e}")
            continue

        if not text.strip():
            print(f"   [WARN] No readable text found in {file_path}")
            continue

        # Split into chunks
        chunks = chunk_text(text)
        print(f"          -> Split into {len(chunks)} chunks")

        # Store each chunk with its embedding
        for i, chunk in enumerate(chunks):
            embedding = get_embedding(chunk)
            collection.add(
                ids=[f"{file_path}-chunk-{i}"],
                embeddings=[embedding],
                documents=[chunk],
                metadatas=[{"source": file_path, "chunk": i}],
            )
        total_chunks += len(chunks)

    print(f"\n[READY] Knowledge base built! ({len(files)} files, {total_chunks} chunks)\n")
    return collection, total_chunks

# ── Retrieve relevant chunks ──
def retrieve(collection, question, top_k=3):
    """Find the most relevant chunks for a question."""
    question_embedding = get_embedding(question)
    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k,
    )
    chunks = results["documents"][0]
    sources = [m["source"] for m in results["metadatas"][0]]
    return chunks, sources

# ── Generate answer with Gemini ──
def generate_answer(question, context_chunks):
    """Send question + retrieved context to Gemini for an answer."""
    context = "\n\n".join(context_chunks)

    prompt = f"""You are a helpful knowledge base assistant.
Answer the user's question using ONLY the information provided below.
If the answer is not in the context, say: "I don't have that information in my knowledge base."

=== KNOWLEDGE BASE CONTEXT ===
{context}
==============================

User Question: {question}

Answer:"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )
    return response.text.strip()

# ── Main Chat Loop ──
def main():
    print("=" * 55)
    print("  Knowledge Base Bot  (powered by Google Gemini)")
    print("=" * 55)

    # Build the knowledge base from your files
    collection, total_chunks = build_knowledge_base()

    if total_chunks == 0:
        print("No knowledge loaded. Add .txt files to knowledge/ folder.")
        return

    print("Ask me anything! (type 'quit' to exit)\n")

    chat_history = []

    while True:
        question = input("You: ").strip()

        if not question:
            continue
        if question.lower() in ("quit", "exit", "bye"):
            print("\nBot: Goodbye!\n")
            break

        # Step 1: Retrieve relevant chunks
        print("[...] Searching knowledge base...")
        chunks, sources = retrieve(collection, question)

        # Step 2: Generate answer
        print("[...] Generating answer...\n")
        answer = generate_answer(question, chunks)

        # Step 3: Show answer + sources
        print(f"Bot: {answer}")
        print(f"\nSources: {', '.join(set(sources))}")
        print("-" * 55)

        # Save to history
        chat_history.append({"question": question, "answer": answer})

if __name__ == "__main__":
    main()
