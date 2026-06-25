#!/usr/bin/env bash
set -e
pip install -r requirements.txt
# Download CAMeL Arabic morphology DB into project dir so Render's build cache picks it up.
# Set CAMEL_DATA_PATH before calling camel_data so it lands in a cached location.
export CAMEL_DATA_PATH="${RENDER_PROJECT_DIR:-.}/.camel_data"
camel_data -i morphology-db-calima-msa-r13 || echo "[camel] data download failed (non-fatal)"
