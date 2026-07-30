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
# Note: pushing the backend repo is what deploys the backend — Railway is
# wired to the backend's GitHub repo and auto-deploys every push to main.
#
# Commit messages: just run the script and it asks for them interactively.
# Press Enter at either prompt to accept the default. You can also skip the
# prompts entirely by passing the messages as arguments.
#
# Usage:
#   ./scripts/deploy-testflight.sh                                 # prompts for messages
#   ./scripts/deploy-testflight.sh "fix lineup bug"                # mobile message, no prompts
#   ./scripts/deploy-testflight.sh "fix lineup bug" "harden IAP"   # mobile + backend, no prompts
#
set -euo pipefail

# Resolve repo locations relative to this script (mobile/scripts/..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # mobile repo
BACKEND_DIR="$(cd "$APP_DIR/../backend" && pwd)"  # backend repo

DEFAULT_MSG="TestFlight build"

# Preflight: fail fast if EAS isn't authenticated, BEFORE we prompt or commit
# anything — otherwise we'd type messages / back up work and then die at the build.
echo "▸ checking EAS authentication…"
( cd "$APP_DIR" && npx eas whoami >/dev/null 2>&1 ) || {
  echo "✗ Not logged into EAS. Run 'npx eas login' in the mobile repo and retry." >&2
  exit 1
}

# Resolve the two commit messages. Command-line arguments win; otherwise, when
# running in an interactive terminal, ask for them. A blank answer (just Enter)
# falls back to the default — the frontend to "TestFlight build", the backend
# to whatever the frontend ended up being.
COMMIT_MSG="${1-}"
BACKEND_MSG="${2-}"
if [[ $# -eq 0 && -t 0 ]]; then
  read -r -p "Frontend (mobile) commit message [${DEFAULT_MSG}]: " COMMIT_MSG
  read -r -p "Backend commit message [same as frontend]: " BACKEND_MSG
fi
COMMIT_MSG="${COMMIT_MSG:-$DEFAULT_MSG}"    # blank frontend → default
BACKEND_MSG="${BACKEND_MSG:-$COMMIT_MSG}"   # blank backend  → reuse frontend message

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
#    Pushing the backend repo triggers Railway's auto-deploy of the backend.
sync_repo "$BACKEND_DIR" "backend" "$BACKEND_MSG"
echo "▸ [backend] pushed → Railway will auto-deploy the backend from this commit."
sync_repo "$APP_DIR"     "mobile"

# 2. Build + submit. autoIncrement (eas.json) bumps app.json's buildNumber;
#    --auto-submit ships the finished binary to TestFlight (ascAppId in eas.json).
echo "▸ [mobile] building iOS production and submitting to TestFlight…"
( cd "$APP_DIR" && npx eas build --platform ios --profile production --auto-submit --non-interactive )

# 3. Commit + push the buildNumber bump that the build wrote into app.json.
sync_repo "$APP_DIR" "mobile" "Bump iOS buildNumber for TestFlight"

echo "✅ Done."
echo "   • Backend  → pushed; check Railway for the deploy: https://railway.app"
echo "   • Mobile   → binary submitted; Apple processes it (~5–10 min) before it appears in TestFlight."
