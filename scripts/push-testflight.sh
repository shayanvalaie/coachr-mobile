#!/usr/bin/env bash
#
# push-testflight — build the iOS production app and ship it to TestFlight.
#
# Under the hood it:
#   1. commits any uncommitted changes (so the build is reproducible)
#   2. runs `eas build --profile production` which auto-increments the
#      iOS buildNumber, then auto-submits the finished build to TestFlight
#
# Usage:
#   ./scripts/push-testflight.sh                 # commits with a default message
#   ./scripts/push-testflight.sh "fix lineup bug"  # custom commit message
#
set -euo pipefail

# Always operate from the mobile app root (the dir that holds this script's ../).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

COMMIT_MSG="${1:-TestFlight build}"

# 1. Commit anything pending so EAS builds the exact state you see locally.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "▸ Committing pending changes: \"$COMMIT_MSG\""
  git add -A
  git commit -m "$COMMIT_MSG" >/dev/null
else
  echo "▸ Working tree clean — nothing to commit."
fi

# 2. Build + submit in one shot. autoIncrement (eas.json) bumps buildNumber;
#    --auto-submit ships the finished binary to TestFlight (ascAppId is in eas.json).
echo "▸ Building iOS production and submitting to TestFlight…"
npx eas build --platform ios --profile production --auto-submit --non-interactive

echo "✅ Done. Apple will process the binary (~5–10 min), then it appears in TestFlight."
