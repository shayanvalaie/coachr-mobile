#!/usr/bin/env bash
#
# deploy-testflight — build the iOS production app, ship it to TestFlight, and
# keep your git repos in sync.
#
# Under the hood it:
#   1. commits + pushes any pending changes in the mobile AND backend repos
#      (so your work is backed up to GitHub before the long build starts)
#   2. runs `eas build --profile production` which auto-increments the iOS
#      buildNumber, then auto-submits the finished build to TestFlight
#   3. commits + pushes the buildNumber bump that step 2 wrote into app.json
#
# Usage:
#   ./scripts/deploy-testflight.sh                    # default commit message
#   ./scripts/deploy-testflight.sh "fix lineup bug"   # custom commit message
#
set -euo pipefail

# Resolve repo locations relative to this script (mobile/scripts/..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # mobile repo
BACKEND_DIR="$(cd "$APP_DIR/../backend" && pwd)"  # backend repo

COMMIT_MSG="${1:-TestFlight build}"

# Commit any changes in a repo and push it to its remote.
# Skips the commit if the tree is clean, but still pushes any unpushed commits.
sync_repo() {
  local dir="$1" label="$2" msg="${3:-$COMMIT_MSG}"
  ( cd "$dir"
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "▸ [$label] committing changes: \"$msg\""
      git add -A
      git commit -m "$msg" >/dev/null
    else
      echo "▸ [$label] no changes to commit."
    fi
    local branch; branch="$(git branch --show-current)"
    echo "▸ [$label] pushing $branch → origin"
    git push origin "$branch"
  )
}

# 1. Back up current work to GitHub before the long build.
sync_repo "$BACKEND_DIR" "backend"
sync_repo "$APP_DIR"     "mobile"

# 2. Build + submit. autoIncrement (eas.json) bumps app.json's buildNumber;
#    --auto-submit ships the finished binary to TestFlight (ascAppId in eas.json).
echo "▸ [mobile] building iOS production and submitting to TestFlight…"
( cd "$APP_DIR" && npx eas build --platform ios --profile production --auto-submit --non-interactive )

# 3. Commit + push the buildNumber bump that the build wrote into app.json.
sync_repo "$APP_DIR" "mobile" "Bump iOS buildNumber for TestFlight"

echo "✅ Done. Repos pushed, and Apple will process the binary (~5–10 min) before it appears in TestFlight."
