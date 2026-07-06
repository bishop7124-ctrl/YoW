#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/YOW.app"
OUT_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
OUT_PATH="${OUT_DIR}/YOW_0.1.0_aarch64.local.dmg"
STAGING_DIR="$(mktemp -d /private/tmp/yow-dmg-staging.XXXXXX)"
IMAGE_BASE="${OUT_PATH%.dmg}"

cleanup() {
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Missing app bundle: ${APP_PATH}" >&2
  echo "Run npm run desktop:build:app first." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
rm -f "${OUT_PATH}" "${IMAGE_BASE}.dmg"

codesign --force --deep --sign - "${APP_PATH}" >/dev/null
codesign --verify --deep --strict "${APP_PATH}"

ditto "${APP_PATH}" "${STAGING_DIR}/YOW.app"
ln -s /Applications "${STAGING_DIR}/Applications"

hdiutil makehybrid \
  -default-volume-name YOW \
  -hfs \
  -o "${IMAGE_BASE}" \
  "${STAGING_DIR}"

if [[ ! -s "${OUT_PATH}" ]]; then
  echo "Expected DMG was not created: ${OUT_PATH}" >&2
  exit 1
fi

if ! file "${OUT_PATH}" | grep -q "Apple"; then
  echo "Created file does not look like an Apple disk image: ${OUT_PATH}" >&2
  file "${OUT_PATH}" >&2
  exit 1
fi

shasum -a 256 "${OUT_PATH}"
echo "Created ${OUT_PATH}"
