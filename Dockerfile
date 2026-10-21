FROM python:3.11-slim

WORKDIR /app

# Prevent Python from writing .pyc and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code and documents
COPY . .

# Hugging Face Spaces requires port 7860
EXPOSE 7860

# Run FastAPI app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7860"]
