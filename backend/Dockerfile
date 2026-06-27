# HeartLens backend — Railway deploy image (CLAUDE.md §9).
#
# This Dockerfile is deliberately explicit so the hard-won environment lessons CANNOT regress on
# a fresh build (Railway picks a Dockerfile over Nixpacks/runtime.txt automatically):
#   - Python is pinned to 3.12 — PyTorch has NO wheel for 3.14, the build would fail.
#   - torch is the CPU-only build (torch==2.5.1+cpu via the index in requirements.txt) — no CUDA
#     libraries we can't use, and far smaller RAM/footprint for Railway's ~1GB trial ceiling.
#   - EasyOCR's en+bn model weights are BAKED INTO THE IMAGE at build time. Railway's filesystem
#     is ephemeral, so without this every cold start would re-download ~100MB and the first real
#     upload could time out. Baked weights = no runtime download.
FROM python:3.12-slim

# Native libs torch (libgomp) and opencv-python-headless (libglib) need at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching). requirements.txt carries the CPU torch index.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Bake the EasyOCR en+bn detection + recognition weights into the image (downloads to
# /root/.EasyOCR). The runtime process runs as root with the same HOME, so it finds them — no
# re-download on cold start (CLAUDE.md §9, deploy Step 3).
RUN python -c "import easyocr; easyocr.Reader(['en', 'bn'], gpu=False)"

# App source (models/, alembic/, *.py). See .dockerignore for what is excluded (local venvs, db).
COPY . .

# Railway injects $PORT — never hardcode it. On boot: apply migrations (idempotent), seed the
# doctor directory (idempotent — skips if rows exist), then serve. OCR_EAGER_INIT defaults to 1,
# so warm_up_ocr() initializes the singleton Reader once at startup.
CMD ["sh", "-c", "alembic upgrade head && python seed_doctors.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
