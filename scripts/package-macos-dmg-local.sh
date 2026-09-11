#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/YOW.app"
OUT_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
APP_VERSION="$(node -p "require('${ROOT_DIR}/src-tauri/tauri.conf.json').version")"
OUT_PATH="${OUT_DIR}/YOW_${APP_VERSION}_aarch64.local.dmg"
STAGING_DIR="$(mktemp -d /private/tmp/yow-dmg-staging.XXXXXX)"
MOUNT_DIR="$(mktemp -d /private/tmp/yow-dmg-mount.XXXXXX)"
MOUNTED=false

cleanup() {
  if [[ "${MOUNTED}" == true ]]; then
    hdiutil detach "${MOUNT_DIR}" >/dev/null 2>&1 || true
  fi
  rm -rf "${STAGING_DIR}"
  rmdir "${MOUNT_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Missing app bundle: ${APP_PATH}" >&2
  echo "Run npm run desktop:build:app first." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
rm -f "${OUT_PATH}"

# Strip Finder/provenance metadata that ad-hoc codesign rejects as detritus.
xattr -cr "${APP_PATH}"
codesign --force --deep --sign - "${APP_PATH}" >/dev/null
codesign --verify --deep --strict "${APP_PATH}"

ditto --norsrc "${APP_PATH}" "${STAGING_DIR}/YOW.app"
xattr -cr "${STAGING_DIR}/YOW.app"
codesign --verify --deep --strict "${STAGING_DIR}/YOW.app"
ln -s /Applications "${STAGING_DIR}/Applications"

hdiutil create \
  -volname YOW \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${OUT_PATH}"

if [[ ! -s "${OUT_PATH}" ]]; then
  echo "Expected DMG was not created: ${OUT_PATH}" >&2
  exit 1
fi

# Verify the artifact users will mount, not only the staging source. HFS hybrid
# images can add FinderInfo metadata to every file and invalidate even an
# otherwise-correct app signature.
hdiutil attach -readonly -nobrowse -mountpoint "${MOUNT_DIR}" "${OUT_PATH}" >/dev/null
MOUNTED=true
codesign --verify --deep --strict "${MOUNT_DIR}/YOW.app"
hdiutil detach "${MOUNT_DIR}" >/dev/null
MOUNTED=false

shasum -a 256 "${OUT_PATH}"
echo "Created ${OUT_PATH}"
