FROM python:3.11-slim

WORKDIR /app

# Skip the heavy 1.6 GB HF model pre-download in environments that can't
# afford the disk / build time (CI, low-RAM hosts using the heuristic
# fallback). Set SKIP_MODEL_DOWNLOAD=1 to opt in.
ARG SKIP_MODEL_DOWNLOAD=0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the HF model into the image so runtime never needs network.
RUN if [ "$SKIP_MODEL_DOWNLOAD" = "0" ]; then \
      python -c "from transformers import pipeline; pipeline('zero-shot-classification', model='facebook/bart-large-mnli')"; \
    else \
      echo "Skipping HuggingFace model download (SKIP_MODEL_DOWNLOAD=$SKIP_MODEL_DOWNLOAD)"; \
    fi

COPY ./app ./app

# Honour $PORT so the same image runs on:
#   * Render (PORT=10000)
#   * HuggingFace Spaces Docker SDK (PORT=7860)
#   * Railway (PORT=...)
#   * Bare uvicorn (PORT=8000 default, kept for backwards-compat)
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
