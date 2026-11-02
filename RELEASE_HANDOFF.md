# Mobile release completion — November 1, 2026

Branch: `codex/finish-release-20261101`, baseline `45c1102`. Original mobile and
other agents' worktrees were read-only. No dependency or visual changes.

## Implemented

- `recoverRosterImportFiles()` reclaims the native app-specific
  `cache/DocumentPicker/` directory on startup with one asynchronous native delete,
  without loading directory entries or file bytes into JavaScript. The only
  DocumentPicker use in this app is roster import. Verified installed Expo SDK54
  iOS source creates its copies in that exact folder.
- Startup and the first picker share one recovery promise. A new native picker
  waits for cleanup; failures produce a safe error and can retry. This prevents
  startup cleanup racing a newly selected copy. Normal final cleanup now removes
  only a URI inside that native temporary directory.
- Provider deadlines are 90 seconds only for POST generation, manual save
  validation, and exact roster preview. Ordinary read/write, import commit and
  Apple verification deadlines remain unchanged; existing cancellation/session
  guards stay in place.
- Import previews validate optional bounded `rulesContext`. Durable pending
  operations use the context returned after server preview, falling back to the
  screen context only for a response without that optional field. A screen test
  proves a newer preview context replaces stale initial rules for commit.

## Verification

Own fresh install: `npm ci --ignore-scripts` completed successfully.

```text
npx tsc --noEmit
exit 0; no output
node --test tests/rosterImport.test.cjs tests/requestBudgets.test.cjs
23 passed, 0 failed
node --test tests/*.test.cjs
157 passed, 0 failed
git diff --check
exit 0; no output
```

Tests cover killed-process next-launch cleanup, one-time recovery, picker race,
retry after cleanup failure, ownership of temporary files, exact route deadlines,
server rules-context validation and durable commit context. No test uses a native
device or parses hostile files on the host.

No signed build/device run was performed. Initial native picker copy still occurs
before JavaScript can enforce the size limit; actual OS storage/memory behavior,
process termination timing, iPhone/iPad UI and SDK behavior remain device gates.
