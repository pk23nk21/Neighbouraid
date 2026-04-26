FROM python:3.11-slim

WORKDIR /app

# Set to 1 in CI to skip the heavy model pre-download (1.6 GB).
ARG SKIP_MODEL_DOWNLOAD=0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the HuggingFace model into the image so runtime needs no network.
# Skippable in CI / tests where NA_DISABLE_AI_MODEL=1 uses the keyword heuristic.
RUN if [ "$SKIP_MODEL_DOWNLOAD" = "0" ]; then \
      python -c "from transformers import pipeline; pipeline('zero-shot-classification', model='facebook/bart-large-mnli')"; \
    else \
      echo "Skipping HuggingFace model download (SKIP_MODEL_DOWNLOAD=$SKIP_MODEL_DOWNLOAD)"; \
    fi

COPY ./app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
