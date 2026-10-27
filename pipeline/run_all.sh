#!/usr/bin/env bash
# run_all.sh - learn -> verify -> eval, then publish outputs to the web app.
#
# Designed to run on Linux / WSL (Smart App Control blocks the OpenCV DLL on
# native Windows). It creates a local venv, installs pinned deps, generates
# synthetic data if none is present, runs the full pipeline, transcodes the
# annotated video to browser-friendly H.264, and copies out/ to web/public/demo/.
#
# Usage:  bash pipeline/run_all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="${PYTHON:-python3}"
VENV="$ROOT/.venv-linux"

echo "== USTAAD run_all =="
if [ ! -d "$VENV" ]; then
  echo "-- creating venv at $VENV"
  "$PY" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install --upgrade pip -q
python -m pip install -q -r pipeline/requirements.txt

mkdir -p out/keyframes out/evidence data

if [ ! -f data/expert.mp4 ] || [ ! -f data/worker.mp4 ] || [ ! -f data/manual.txt ]; then
  echo "-- no input set found: generating synthetic data"
  python pipeline/make_synthetic.py
fi

echo "-- learn"
python pipeline/learn.py
echo "-- verify"
python pipeline/verify.py
echo "-- eval"
python pipeline/eval.py

# ---- transcode videos to browser H.264 (falls back to a copy if ffmpeg absent) ----
transcode () {  # src dst
  if command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -y -loglevel error -i "$1" -c:v libx264 -preset veryfast -pix_fmt yuv420p \
      -movflags +faststart "$2"
  else
    echo "   (ffmpeg not found - copying $1 as-is; install ffmpeg for H.264)"
    cp "$1" "$2"
  fi
}
echo "-- transcoding videos to H.264"
transcode out/worker_annotated_raw.mp4 out/worker_annotated.mp4
transcode data/expert.mp4 out/expert.mp4
rm -f out/worker_annotated_raw.mp4

# ---- publish to the web app ----
DEMO="web/public/demo"
echo "-- publishing to $DEMO"
rm -rf "$DEMO"
mkdir -p "$DEMO"
cp -r out/keyframes "$DEMO/keyframes"
cp -r out/evidence "$DEMO/evidence"
cp out/procedure.json out/session.json out/results.json "$DEMO/"
cp out/worker_annotated.mp4 out/expert.mp4 "$DEMO/"

echo "== done. outputs in out/ and $DEMO =="
ls -la "$DEMO"
