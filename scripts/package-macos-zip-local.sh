#!/usr/bin/env bash
set -euo pipefail

# Zips the built YOW.app for beta distribution. Unlike a DMG, a zip is not
# Gatekeeper-assessed on open, so unsigned beta testers only face one
# "Open Anyway" step (at app launch) instead of two.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/YOW.app"
OUT_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/zip"
OUT_PATH="${OUT_DIR}/YOW_0.1.0_aarch64_macos.zip"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Missing app bundle: ${APP_PATH}" >&2
  echo "Run npm run desktop:build:app first." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
rm -f "${OUT_PATH}"

# Strip Finder metadata that codesign rejects as "detritus"
xattr -cr "${APP_PATH}"
codesign --force --deep --sign - "${APP_PATH}" >/dev/null
codesign --verify --deep --strict "${APP_PATH}"

ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${OUT_PATH}"

if [[ ! -s "${OUT_PATH}" ]]; then
  echo "Expected zip was not created: ${OUT_PATH}" >&2
  exit 1
fi

shasum -a 256 "${OUT_PATH}"
echo "Created ${OUT_PATH}"
