# Fresh-corpus native Python offline replay — September 12, 2026

## Result: harness header comparison stopped the sole attempt

At **2026-09-12T19:34:32.329Z**, the first navigation stopped at `offline-native-navigation:memory-resource` with **`AssertionError / ERR_ASSERTION`**. The retained native response has a **null-prototype** header object; the captured JSON headers are a plain object. The harness's strict `assert.deepEqual(response.headers, fixture.record.headers)` rejects that prototype distinction. The unchanged assertion, original failure, stack excerpt, and frozen harness remain preserved.

This is **not a resource-limit or SVG-decoder finding**, not evidence of measured cap exhaustion, and not a website or native layout defect. No corrected comparison was run in this lane. Main owns any separately authorized correction. There was no retry, second navigation, new corpus, or post-stop native analysis.

## Exact accounting

- **1 navigation attempt, 1 native memory response, 19434 native decoded bytes**, from the exact captured initial `https://docs.python.org/3/` body. The native transport reports `requests: 1`, `mockedRequests: 1`, `mockedDecodedBytes: 19434`, `decodedBytes: 19434`, `encodedBytes: 0`, and `redirects: 0`.
- **0 recorded post-assertion fixture responses / 0 post-assertion recorded decoded bytes**. The `fixtureRequests` array and derived `accounting.capturedResponses` are empty because recording occurs after the failing assertion. They are **not the number of native memory responses**; the native transport metrics are retained and authoritative for the one response already served.
- **0 wire requests / 0 wire bytes, 0 document commits, 0 clicks, 0 formatting inspections, 0 used-layout attempts**. No original `loadBrowserDocument` entry occurred. No second resource was requested.
- All **8 authorized fresh responses / 72064 decoded fixture bytes** were verified before/after. Only the initial response reached native memory routing. `basic.css` and the other resources were verified fixtures, **not replayed or newly fetched**.

The known historical `unsupported` states for three `py.svg` images remain an observation of the earlier live run. This replay did not reach any image owner or test the engine's existing alt fallback. Native image/style/formatting issues, document title/root/revision, and geometry are **unobserved, not zero**. `DIAGNOSTIC.json` truthfully contains no samples or observations. No DOM/CSS/error state was cleared, altered, or made available by force; no document was constructed through the instrumented loader.

## Release and isolation

- Committed runtime **`43060222e28db7abb3259b0ad50d230f359705c6`**, `native-html-cell-spacing-september12-round00/snapshot01/dist`, pinned Node **22.22.0**. No build, full test rerun, uncommitted code import, source edit, manifest edit, TASKS edit, or Git write.
- Before/after: **11 committed source/manifest inputs, 14 actual Git objects**, **1184 source / 1996 compiled files**, **20 gate receipts**, **675 manifest entries / 297 selected files / 296 strict roots**. The existing **15522 passed / 0 failed / 2 unchanged exclusions** gate was verified, not rerun. Git object reads occur outside the syscall seal.
- Parent fresh-corpus proof: `website-functional-september12-evening/verify-python-fresh/RESULT.json`, SHA-256 `23565d3dd35490f3f9b455ae0b7fb2fdb2c46216511b52e838d769abf83d31a9`; Main's verification completed at **19:26:21.640 UTC**, with 16 actual Git objects / 32 archive comparisons.
- Immutable fresh capture ledger SHA-256: `979bd3d6d854abfdb5ed4d290fc2cb304c6a101ec97a722ae18143de7b46ead2`. New attempt's pre-execution 22-file harness ledger SHA-256: `a1ae1965dd53a922df41d2da91afcdddbfd45f7d3bd9c098fede1ec48cfb0d7e`. The older incomplete seven-response corpus was not used or modified.
- Original network policy caps remain **12 requests / 1 concurrent / 250ms spacing policy / 2000000 response bytes / 8000000 total bytes / 15000ms request timeout / 16384 header bytes / 5 redirect ceiling**; no uncaptured redirects. Exact URL memory routing retains original captured status, header fields, and decoded body. No fabricated sequential request timing is claimed; memory-route `elapsedMs: 0` and `encodedBytes: 0` are replay metadata, not live measurements.
- Parent **45s**, native child **30s + 5s grace**, **6MiB output/files**, **16MiB lane**, **64MiB minimum free**, diagnostics **64 samples / 32KiB**. Native request queue remains bounded at **128 pending**, concurrency **1**, with identical frozen underlying/advertised transport limits.
- Kernel socket/socketpair denial covers the native child and offline syntax/preflight/verifiers. JS network, subprocess, addon/SafeJS guards are retained; no guard invocation was observed. Fresh empty cookie jar, omitted credentials, private empty HOME/TMPDIR under `/home`, sanitized environment, non-TTY descriptors, no device/provider/credential access or socket self-probe.

## Lifecycle and verification

Supervisor UTC **2026-09-12T19:34:31.987Z–2026-09-12T19:34:32.589Z**, elapsed **0.600042s**, exit **1** from the preserved assertion. Child stdout **19834 bytes**, stderr **0 bytes**; no timeout, truncation, or termination signals.

Immediate cleanup retained **1 pending load / 1 active queue entry**. The single 50ms settlement sample took **50.521397ms**. Final pending loads, active/pending queue, active transport, tabs, cookies, storage entries, pending storage events, and cleanup errors are zero. Session/transport/queue are closed; process group **52055** is absent; HOME/TMPDIR are empty. Document/image/event/control owner arrays are empty because loader initialization was never reached; **independent owner-cleanup proof is not claimed from empty arrays**.

Evidence lane: `node_modules/.cache/native-validation/native-python-current-replay-september12`. Key receipts: `RELEASE-MESSAGE.md`, `HARNESS.sha256`, `PREFLIGHT.json`, `GIT-COMMANDS.json`, `GIT-AFTER-COMMANDS.json`, `replay/INVOCATION.json`, `replay/EXECUTION.json`, `replay/stdout.json`, `progress.jsonl`, `DIAGNOSTIC.json`, `VERIFICATION.json`, `RESULT.json`, `SEAL.json`, and `FINAL-RECEIPTS.sha256`.

Readonly verifier: `node_modules/.cache/native-validation/native-python-current-replay-september12/verify.mjs`, through that lane's `offline.py verify` with sanitized private HOME/TMPDIR and socket-denying `sealed-exec.py`. It validates the failed attempt and distinguishes actual native transport accounting from post-assertion recording. The seal covers this report and every lane file except the receipt ledger itself. Evidence verification success **does not establish native document, formatting, layout, SVG fallback, interaction, live, or whole-site acceptance**.

Only this owned lane and `PYTHON-FRESH-NATIVE-REPLAY.md` were created. Earlier sealed evidence and source/manifest/Git state were not edited. Main independently verifies, commits documentation, and owns any separately authorized corrected lane.
