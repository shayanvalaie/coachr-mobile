# Task 6 — mobile dependency and backup cleanup

Date: November 1, 2026. Branch `codex/launch-06-dependencies-20261101`.
Baseline: preserved dirty snapshot `752904a`. Owner originals remain untouched.

## Changes

- Cleanup commit `e4afa45`: remove 37 obsolete numbered source/test backups.
  Canonical source is unchanged. `DUPLICATE_ARTIFACTS.json` inventories every
  removed path and backup/canonical SHA-256. Baseline Git retains their contents.
- Dependency commit `bb376ea`: update lockfile node-forge 1.4.0 -> 1.4.2 and undici
  6.29.0 -> 6.29.1. Pin all 14 Metro suite packages to upstream patch 0.83.8 via
  package overrides, replacing Expo's 0.83.3 pins consistently for Expo and RN CLI.
  Metro 0.83.8 explicitly vendors corrected image parsers and removes image-size.
  No Expo/RN/native module major upgrade, UI, application behavior, or policy change.
- No installed node_modules contents are committed or modified as a source fix.
  All installs use this worktree's own dependency directory. Original corrupt
  duplicate @types folders are absent from the clean deterministic install.

## Diagnosis and evidence

A fresh install first reproduced TypeScript errors exclusively in stale numbered
backup sources: old calendar/lineup request types, obsolete import API/xlsx use,
old IAP function arguments. Removing those files makes `npx tsc --noEmit` succeed
without changing canonical implementations. `launch-evidence/typescript-before.log`
contains the actual diagnostic output.

Before npm audit: 32 grouped findings, including 3 high. After: 29 grouped findings
(28 moderate, 1 low), **zero high or critical**. Tooling count remains nonzero and
must not be described as a clean audit. Machine audits are in `launch-evidence/`.

## Actual final checks

Node v20.20.0, npm 10.8.2. Independent worktree dependencies installed with:

```text
npm ci --ignore-scripts
exit 0 (clean install from changed lockfile)
npx tsc --noEmit
exit 0, no output
node --test tests/*.test.cjs
149 passed, 0 failed
npx expo install --check
Dependencies are up to date
npx expo-doctor
18/18 checks passed. No issues detected!
npx expo export --platform ios --output-dir /tmp/coachr-task6-ios-export-final
Exported successfully; Hermes iOS bundle 4.9 MB, 17 assets
npx expo export --platform ios --source-maps --output-dir /tmp/coachr-task6-ios-reachability
Exported successfully; 1683 source-map modules
git diff --check
exit 0
```

Scripts were skipped during npm ci for tooling verification. A normal signed native
build and any required native lifecycle scripts still need their own validation.
No iOS/Android native files changed, and no generated native project or signed
archive was assembled in this task.

## Remaining advisory reachability and limits

The four residual advisory leaf packages are deepmerge (prototype poisoning),
glob (cancellation traversal), minimatch (pattern resource exhaustion), and uuid
(buffer bounds with explicit output buffer). Other reported packages inherit these
findings through Expo/RN configuration, codegen, CLI and test tooling.
The actual release iOS source map contains **no module** from any of these four
packages. This is evidence they are not in this exported runtime bundle; it does
not make development/build tools safe for untrusted project inputs or prove a
future native archive's behavior. Restrict local config/plugins/assets to trusted
project source. A fully clean toolchain audit needs upstream compatible releases
or a separately scoped Expo migration; no blind audit fix --force was used.

Metro patch overrides intentionally supersede Expo's pinned patch. Doctor and a
real Hermes export pass, but native build/signing/device checks remain open.
Do not deploy this entire dirty baseline. Integrate canonical source and reviewed
commits with other task changes and repeat release validation.

Primary upstream references:
- https://github.com/react/metro/releases/tag/v0.83.8
- https://github.com/nodejs/undici/releases/tag/v6.29.1
- https://github.com/digitalbazaar/forge/security/advisories
