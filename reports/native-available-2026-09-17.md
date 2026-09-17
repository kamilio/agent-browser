# Available committed native tests — September 17, 2026

## Result and scope

**49,370 tests pass, zero fail, across all 992 available committed native test
files.** No tests are skipped or marked todo. The explicit 1,014-entry manifest
still references 22 absent committed files, so this is not full-manifest
acceptance. The focused eleven-file gate passes 398 tests. Build, selected types
for the changed test, formatter and linter also pass.

Baseline: `3d5043b8e830e9b7d4a3115885388445ea74aa21`, with exactly one owned test-file overlay.
All 1,621 source and 2,404 compiled pins are verified. Every compiled production
artifact is byte-identical to the preceding qualified baseline: **this change
corrects a test contract; it does not change browser production behavior**.

## Cause and correction

Heading discovery intentionally copies per-operation limits to support an
explicit source-heading policy. The older CLI test incorrectly required object
identity with the shared limit record. It now requires strict equality to a
pre-call value snapshot, unchanged frozen shared limits, no unrequested policy
in options or output, and exactly one discovery call. Existing document/network
limits, capture and reader assertions remain intact.

## Preserved attempts

| Run | Passed | Failed | Files | Meaning |
| --- | ---: | ---: | ---: | --- |
| Original broad run, before the supervisor commit | 49,234 | 91 | 991 | Protected file operations correctly reject unsafe test-temp ancestry. |
| Identical source, protected temp ancestry | 352 | 1 | 10 | Ninety environment-induced failures disappear; the stale identity assertion remains. |
| Current focused candidate | 398 | 0 | 11 | Corrected assertion plus the newly committed 45 supervisor cases. |
| Current full available candidate | 49,370 | 0 | 992 | Fresh complete run of every available manifest path. |

The new run uses protected HOME/TMP under a private /tmp root. No file-ownership
or directory-protection check is weakened. The original full and focused failure
records remain sealed and unchanged. The final full run takes
658.219 seconds; this is test duration, not a browser
performance comparison. Native and quality children/groups close normally and
native HOME/TMP remain empty.

## Remaining gates

The 22 missing paths are recorded individually in the JSON report and remain
pre-existing untracked work, not silently admitted tests. All 42 pre-existing
modified tracked files and 697 untracked files are preserved.

This is the explicit native gate under its existing JavaScript-level guard,
not an independent kernel-isolation, real process-group, SDK, website, socket,
credential, passkey/device, TTY or rendering-interop acceptance run. The SafeJS
supervisor is exercised through fake dependencies; its concrete guarded adapter
and actual scheduling contract remain separate work. Historical website outcomes
remain unchanged. The broader browser goal stays active.

Private evidence: `node_modules/.cache/native-validation/native-heading-contract-september17/`.
Original failures: `node_modules/.cache/native-validation/full-native-after-svg-september17/`.
