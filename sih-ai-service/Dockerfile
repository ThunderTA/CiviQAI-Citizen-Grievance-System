FROM python:3.11-slim

WORKDIR /app

# Build tools are needed by some wheels (faiss/torch fallbacks) and removed
# afterwards to keep the image small.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so edits to application code do not bust the layer cache.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Bake the embedding model into the image. Without this the container reaches
# out to HuggingFace on first request, so a demo on a bad network silently
# falls back to the hashing encoder.
RUN python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('all-MiniLM-L6-v2')" || \
    echo "WARNING: model prefetch failed; will download at runtime"

ENV PYTHONUNBUFFERED=1 \
    VECTOR_STORE_DIR=/data/vector_store

# The index must outlive the container; compose mounts a volume here.
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fs http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.sih_main:app", "--host", "0.0.0.0", "--port", "8000"]
