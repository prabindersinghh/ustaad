# USTAAD API container. opencv-contrib-python-headless needs a few shared libs.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/pipeline

# runtime libs for OpenCV + ffmpeg for video decode/encode
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY api/requirements.txt /app/api/requirements.txt
RUN pip install --no-cache-dir -r /app/api/requirements.txt

COPY pipeline /app/pipeline
COPY api /app/api

EXPOSE 8000
# assert OpenCV 5 at image build time, then serve
RUN python -c "import sys; sys.path.insert(0,'/app/pipeline'); from ustaad import assert_opencv5; print('OpenCV', assert_opencv5())"

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
