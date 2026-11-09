FROM python:3.11-slim

# Create a non-root user (Hugging Face Spaces runs with UID 1000)
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR $HOME/app

# Install dependencies first for Docker caching
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy all application files
COPY --chown=user:user . .

# Ensure storage directories exist with write permissions
RUN mkdir -p knowledge chroma_db && chown -R user:user $HOME/app

USER user

# Hugging Face Spaces standard port
EXPOSE 7860

# Run FastAPI app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7860"]
