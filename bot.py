"""
╔══════════════════════════════════════════════════════╗
║        Knowledge Base Bot  —  bot.py                 ║
║  Uses Google Gemini (FREE) + ChromaDB (local)        ║
║  Run:  python bot.py                                  ║
╚══════════════════════════════════════════════════════╝
"""

import os
import glob
from dotenv import load_dotenv

# ── Load API key from .env file ──
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("\n❌  ERROR: No GEMINI_API_KEY found in your .env file!")
    print("   1. Open the .env file")
    print("   2. Replace 'your-gemini-api-key-here' with your real key")
    print("   3. Get a FREE key at: https://aistudio.google.com\n")
    exit(1)

print("✅  API key loaded.")

# ── Import AI libraries ──
print("📦  Loading AI libraries...")
import chromadb
import google.generativeai as genai

# ── Configure Gemini ──
genai.configure(api_key=GEMINI_API_KEY)

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
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]

# ── Build the Knowledge Base ──
def build_knowledge_base():
    """Load all .txt files from /knowledge folder and store in ChromaDB."""
    print("\n📚  Building knowledge base...")

    # Connect to local ChromaDB (saves data in ./chroma_db folder)
    client = chromadb.PersistentClient(path="./chroma_db")

    # Delete old collection if it exists (fresh rebuild)
    try:
        client.delete_collection("knowledge_base")
    except Exception:
        pass

    collection = client.create_collection("knowledge_base")

    # Find all .txt files in the knowledge/ folder
    txt_files = glob.glob("knowledge/*.txt")
    if not txt_files:
        print("⚠️   No .txt files found in the knowledge/ folder!")
        print("     Add some .txt files there and run again.")
        return collection, 0

    total_chunks = 0
    for file_path in txt_files:
        print(f"   📄  Loading: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()

        # Split into chunks
        chunks = chunk_text(text)
        print(f"       → Split into {len(chunks)} chunks")

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

    print(f"\n✅  Knowledge base ready! ({len(txt_files)} files, {total_chunks} chunks)\n")
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

    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(prompt)
    return response.text.strip()

# ── Main Chat Loop ──
def main():
    print("=" * 55)
    print("  🧠  Knowledge Base Bot  (powered by Google Gemini)")
    print("=" * 55)

    # Build the knowledge base from your files
    collection, total_chunks = build_knowledge_base()

    if total_chunks == 0:
        print("No knowledge loaded. Please add .txt files to knowledge/ folder.")
        return

    print("💬  Ask me anything! (type 'quit' to exit)\n")

    chat_history = []

    while True:
        # Get user question
        question = input("You: ").strip()

        if not question:
            continue
        if question.lower() in ("quit", "exit", "bye"):
            print("\nBot: Goodbye! 👋\n")
            break

        # Step 1: Retrieve relevant chunks
        print("🔍  Searching knowledge base...")
        chunks, sources = retrieve(collection, question)

        # Step 2: Generate answer
        print("🤖  Generating answer...\n")
        answer = generate_answer(question, chunks)

        # Step 3: Show answer + sources
        print(f"Bot: {answer}")
        print(f"\n📎  Sources: {', '.join(set(sources))}")
        print("-" * 55)

        # Save to history
        chat_history.append({"question": question, "answer": answer})

if __name__ == "__main__":
    main()
