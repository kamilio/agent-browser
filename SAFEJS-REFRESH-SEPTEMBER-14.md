# SafeJS refresh — September 14, 2026

**PROGRESS; acquisition complete, browser runtime migration still pending.**

The user requested the latest SafeJS improvements and a current status update.
The public registry response dated September 14, 2026, 17:15:33 UTC identifies
`@poe-platform/safe-js@0.1.599` as latest. This supersedes the *acquisition
status*, not the historical measurements, in `SAFEJS-UPSTREAM-MIGRATION.md`.

## Source and artifact

- Clean `/home/kjopek/project/poe-code` main was fast-forwarded by 118 commits
  from `31fe11c1fd3d2d403882c0a7c42684cb114434e7` to freshly fetched upstream
  `9baf685284b3a089eaa3a22d1521b6dc391fccd9`. No reset, rebase, new branch or push.
  SafeJS lives in this monorepo, so the source pull includes its other packages.
- The source checkout remains clean. A SHA-256 inventory records all 1,827
  tracked files under `packages/safe-js` after the pull. Recent commit subjects
  include snapshot-envelope validation, replay-graph validation, rejection of
  active nested-runtime snapshot data and repeated snapshot-recovery tests.
  These are inspected changes, not browser-local behavioral test results.
- Downloaded the exact published `0.1.599` tarball: 8,536,965 bytes. Its SHA-512
  integrity and SHA-1 match registry metadata. Extraction checks reject unsafe
  paths and links and verify 372 files totaling 43,071,863 bytes. The package
  name, version and contained `./core` export match the published manifest.
- Registry signatures/provenance were **not** independently verified. Source
  HEAD and published package are separate observations; no exact source-to-
  tarball build equivalence is claimed.
- No install scripts, dependency installation, source build, SafeJS execution
  or browser runtime switch occurred. Existing built/global packages were not
  overwritten. A downloaded package is not a completed compatibility gate.

## Browser status

- Last audited browser runtime remains
  `5c7a882003df9a558397e4a8ece1220023baa83e`: 23,975 selected native tests pass,
  zero fail, with two exclusions. This refresh did not rerun that suite.
- The last completed fresh live flow is the man7 `ls` to genuinely discovered
  `date` navigation in `MAN7-LIVE-FLOW-SEPTEMBER-14.md`.
- Captured Hacker News still has unsupported geometry, documented in
  `HN-WORD-BREAK-RECHECK-SEPTEMBER-14.md`; it is not a new live run.
- The fresh MDN querySelector-to-querySelectorAll lane remains **PREPARED**,
  with no launch locks or new website requests. Independent prelaunch review
  found root-inventory, formatting-stop, URL-policy and redirect-accounting
  mismatches. Corrections are authored; final refreshed syntax/hash review and
  one bounded launch remain outstanding. No fresh MDN success is claimed.
- The browser's 42 dirty tracked paths and 697 original untracked files were
  byte-checked and preserved before documentation staging. Native, live-site,
  SafeJS, credential/provider, device and real-TTY gates remain distinct.

## Evidence and next work

Acquisition receipts, registry metadata, source inventory and the staged package
are retained under
`node_modules/.cache/native-validation/safejs-refresh-september14/`.
Preparation originals are under
`/dev/shm/agent-browser-safejs-refresh-september14/`.
The staged package root is the durable directory's `release/package` subdirectory;
it is not installed on the browser's default module-resolution path.

Next: inspect the current public SafeJS contract against the existing released-
core adapter, run a separately scoped isolated compatibility check, and activate
only after passing evidence. Separately finish the MDN launch review; refreshing
SafeJS must not relabel historical native or website results as new validation.
The overall browser goal remains **ACTIVE**, not complete or blocked.
