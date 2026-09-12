# Lua percentage-table replay — September 12, 2026

## Outcome

**The seven collapsed-border guards disappear on the 11901 release, but the manual-link flow still fails.** This is not working-site acceptance.

This is the separately authorized **one-session** scope on commit `1478cd7c1b9263c17fc1f445009287bcd8db8575`. The old two-run scope remains closed. Its 11784 observation is used only as an immutable recorded comparator, not rerun or relabeled.

Exactly one initial native navigation committed the captured Lua contents document. The current native DOM supplied a genuine `manual.html` anchor; exactly one native click returned `unsupported`: “Document width resolution requires an issue-free supported formatting profile”. The destination was not requested. No response was fabricated; replay-miss handling remains unexercised. No second native run occurred after the failure.

| Observation | Recorded 11784 | New 11901 |
| --- | --- | --- |
| Commit | `ffc7b2ef34b271c617ca846ec2296e8deede88b2` | `1478cd7c1b9263c17fc1f445009287bcd8db8575` |
| Native child UTC, September 12, 2026 | 04:04:40.062–04:04:40.915 | 05:09:11.740–05:09:12.597 |
| `table-collapsed-borders-not-supported` | 7 | 0 |
| `display-layout-not-supported` | 1 | 1 |
| `html-presentation-hint-not-supported` | 1 | 1 |
| Explicit census formatting nodes / visited DOM nodes | 2381 / 2330 | 2381 / 2330 |
| Formatting work | 30299 | 31358 |
| Deferred subtrees | 1 | 1 |
| Geometry result | unsupported | unsupported |
| Extraction result | structure limit exceeded | structure limit exceeded |

The observed collapsed-guard delta is **7 → 0**, with formatting work increasing by 1059. The other guards and the authoritative CSS diagnoses remain. This is a bounded release comparison, not a single-root-cause proof or a general CSS/table correctness claim.

## Release verification

Runtime: `node_modules/.cache/native-validation/native-table-percentage-september12-round01/snapshot01/dist`, never working source. Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, version 22.22.0, SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

- All **20 gate receipt members**, **1106 source files**, **1944 compiled files** and **8 commit-owned inputs** verify. The complete before/after inventories are byte-equal and rechecked by the read-only verifier.
- Actual local Git outputs for the pinned commit were obtained before socket-denied checks: one complete tree and eight exact blobs. Every owned blob is byte/length/hash-equal to its sealed snapshot input; all 1106 source files also match the preverified commit tree's blob identities. Explicit Git configuration/environment and exact command/output hashes are retained in `GIT-COMMANDS.json`. No nested Git IPC or kernel-policy relaxation is needed during verification.
- The preserved gate reports **11901 passed, 0 failed, 2 unchanged exclusions**, 216 selected suites, 215 strict roots and 610 manifest entries. These are historical gate results, not suites rerun by this task; manifest entries are not executed suite counts.
- Source ledger SHA256: `e212ee5d3c7ecfdcc82ed69e2e28f9569b2e41c20f18b4a4fbf4ed3a668958d7`.
- Compiled ledger SHA256: `8acb255db90a057ecdeaa44d60b194330bfa375d3ece491f411d1fe049958ac4`.
- Gate receipts SHA256: `164e5df5c3c522db6c210f85c3fe4216f1d27a1fd19d5c661059436284d40bdc`. Commit-verification receipt SHA256: `78897d0bedd6cb2b2767c5d03d1d0f0fc4dfc64198c322793bb7b97c780435ec`.

No build, full suite, source edit, manifest change or capacity increase was performed.

## Original capture and preserved history

All four resources are exact responses from the original Lua capture. Its HTTP observation window remains **September 12, 2026, 03:03:55.333–03:03:57.239 UTC**; it is not the new replay window. Original response times, raw headers, identity-encoded bodies and normalized metadata are preserved separately from mock timing.

| Original resource | Encoded / decoded bytes | Body SHA256 |
| --- | --- | --- |
| Contents `/manual/5.4/` | 32734 / 32734 | `400cce3bc5b23b1d424a01c23dae926fbecb56fbbe266a3b7a669f5f180cefa0` |
| `lua.css` | 2247 / 2247 | `73e7e5fa61afec5f04f5e43ad5c8348620abc41b8e4671631300b5defe3f2826` |
| `logo.png` | 9893 / 9893 | `de4ca280a5561940ace4b1a72dc5bc1d96ac154e59c7ae32d98ddcde010baeaa` |
| `index.css` | 240 / 240 | `b6ef324ca66e9ffdafa9e5b5a1478a548aa20f3a23f264eb1bed6d21c1c7d039` |

All statuses are the original 200, with no original redirects. Each raw-header file's bytes/hash and original name/order/value array are rechecked; raw headers are HTTP response records, not packet captures. The new transport reports four requests, **four mocks**, 45114 decoded bytes, zero wire encoded bytes, zero redirects, zero local image rejections and zero replay misses. Every native adapter entry is represented by an exact captured-response mock. No direct HTTP client or fallback was used.

The approved original `verify-fixed01.mjs` ran under strict kernel socket denial and passed its 24 checks. Both original Lua ledgers, the original report and all 54 original exact-byte archives independently verify. The historical failed verifier and old browser probes were not executed.

Seventy new exact-byte archives preserve the task/release/instructions, original capture, all gate receipt bytes, completed harness references, recorded 11784 evidence and corrected-attribution evidence. The prior replay and correction seals remain unchanged:

- Replay final ledger: `7bef84e6654e05d07f13ffdf716ca04e9b44314dd31791c4366d2353c63bd73a`.
- CSS correction final ledger: `bb7e8715b67fb5745bef268d0975ac0cd891fd2ba5c04ffd11a69af0158b4159`.

Their original reports, errors, timestamps, measurements and adverse finding are not rewritten. Protected source payloads and other unfinished worker lanes were not read.

## DOM, anchor, extraction and history

The initial document remains “Lua 5.4 Reference Manual - contents”, URL `https://www.lua.org/manual/5.4/`, root `e1`, 2341 nodes, revision 2345. Native document/stylesheet/network/session limits, original loader callbacks, source HTML/CSS/image bytes, scripts-disabled mode, same-origin resource policy and 1280×720 viewport are unchanged.

The current DOM's first 96 `body a[href]` elements are inspected with native style/actionability and complete ancestry. The selected “start” link has discovered current ref `e33`, href `manual.html`, resolved `https://www.lua.org/manual/5.4/manual.html`. No historical ref is used as a hardcoded selector, and no forced navigation occurs.

Complete native DOM serialization is **32856 bytes**, SHA256 `2a74ce1ad43676d1dbe2b01edda8ec9fbdb1cbc5a74cbfcfeb311d597db2b500`: byte-equal to the recorded 11784 serialization and unchanged before/after the click and diagnostics. Native serialization is distinct from the original 32734-byte HTTP HTML.

The unchanged native body-text observation is **8135 code units**, below its 12000-code-unit observation cap, SHA256 `729dff3d410dc7253808189017627ab9cc02500a6313bc52974185cf87323977`. This is not a claim that structured extraction succeeded.

Structured extraction uses unchanged options `format=json`, `maxBytes=65536`, `maxNodes=1000`, `maxDepth=128` and returns the same `resource-limit`, “Extraction structure limit exceeded”. No larger extraction budget is substituted. Both click and bounding-rectangle observation fail at the unsupported formatting-profile guard; no geometry coordinates, destination rendering or visual success are claimed.

Before/after URL, title, node count, root, revision and history are unchanged. History is one entry, index 0, key `h1-1`, retained bytes 39, zero evictions. These values also match the recorded 11784 state.

## Failure census and corrected source attribution

One explicit bounded native census is taken after the failed click. This does not claim that native click/geometry internals performed only one layout build. Deferred `e401` remains the original `table.menubar`, with display `table`, reason `display-layout-not-supported`; the original width hint remains. Collapsed guards are absent, not suppressed by the harness.

| Authoritative CSS diagnostic | Raw | Applicable |
| --- | --- | --- |
| `unimplemented-or-invalid-css-value` | 10 | 5 |
| `unimplemented-css-property` | 11 | 5 |
| `unimplemented-or-invalid-css-selector` | 1 | 1 |

These counts are unchanged from 11784. Formatting CSS entries retain `css:` prefixes and non-advisory status. Independent non-CSS counts remain presentation hint 1 and display-layout guard 1; collapsed-border count is zero.

The same census retains **19 grouped CSS records** and **2 non-CSS source-attributed records**, below bounds 32 and 20. The CSS helper uses the exact, unchanged native locator from the sealed `native-lua-css-correction-september12/rule-spans.mjs`. Each excerpt is matched to a unique native-scanned span and complete native parser identity; all 19 excerpts are also checked against the corrected prior records. The old unanchored substring search is not used.

In particular, selector `a` correctly uses **[581, 611)**, the 30-byte `a` rule containing `text-decoration: none ;`, not offset 9 inside `background-color`. Rule SHA256: `d1a1550fa56a8e30638e593879e4fc00b0aed2a9c1f273fa098d399d37d9b003`. Source ref remains `e9`; source SHA256, selector/count, applicability, matching count and retained refs agree with the corrected prior evidence.

The locator retains its bounded flat-rule scope and rejects unresolved/ambiguous identities and unsupported grouping/import scopes. These are per-rule diagnostic excerpts, not invented per-declaration blame. Deferred reasons are direct formatting observations; other non-CSS attribution uses retained nodes and native predicates, not a nonexistent per-issue emitter API. Full details are in `new11901/stdout.json` and its progress census record.

## Isolation, timing and cleanup

The native child runs under the inherited strict kernel denial of socket/socketpair/connect/bind/listen/accept/send/receive/shutdown and related prohibited operations, with no-new-privileges, zero core limit and a 6 MiB file limit. JS network/DNS/process/module/runtime guards remain active; actual wire APIs and real SafeJS are not used. No socket self-probe, credential, provider, device, real TTY/PTY, challenge handling or bypass occurs.

The supervisor uses explicit environment keys only, private empty mode-0700 HOME/TMP, ignored stdin, piped stdout/stderr and a separate process group. Bounds are 45 seconds plus 5-second kill grace, 6 MiB per file/combined output, 16 MiB lane, at least 64 MiB free disk.

Native supervisor UTC: **05:09:11.626–05:09:12.629**, September 12, 2026; elapsed **1.0011804662644863 seconds**; exit **1** for the preserved failed flow; stdout **83224 bytes**, stderr **0**. No timeout, signal, truncation or storage breach occurs. The process group is absent afterward. Earlier historical-verifier and preflight children exit 0; neither creates a native page session.

Monotonic inter-mock intervals are **251.537926**, **251.111084**, **251.96038899999996 ms**. The deadline loop is rechecked and each actual interval is independently asserted at least 250 ms. These are replay mock timings, not fresh HTTP timings.

One actual document, image, event and control owner is sampled. Returned metrics independently show closed owners, zero retained document nodes/text/collectors, zero image resources/active/queued/waiters, zero event listeners/dispatches, zero file controls/files/bytes and zero mouse pressed/buttons/busy state. Session tabs, pending loads, request queue and transport activity are zero and closed; cookies are empty/closed; cleanup errors are zero. This proves sampled-owner cleanup, not process-wide leak freedom.

## Verification and changed paths

The reproducible read-only verifier performs **16 named checks**: seven input/release/archive audits, then nine checks for the one-run outcome, exact mocks/pacing, unchanged DOM/limits/history, census delta, corrected exact spans, actual owner cleanup, all execution bounds, comparison derivation and complete seals/report claims. Its output lists every check. Native flow failure is separate from successful evidence verification.

Only these new paths belong to this task:

- `LUA-PERCENTAGE-TABLE-REPLAY.md`
- `node_modules/.cache/native-validation/native-lua-percentage-replay-september12/`

`COMPARISON.json` holds the exact machine-readable new-versus-recorded result. `ARTIFACTS.txt` is the complete file list, including this report. `RECEIPTS.sha256`, `SEAL.json` and `FINAL-RECEIPTS.sha256` bind the report, captured bytes, local command proofs, code, execution and observations. The final ledger covers every listed file except itself. The verifier checks every file hash and exact membership, full runtime inventories and gate receipts, original/corrected evidence, current output claims and actual source spans. It does not launch a browser, rebuild, rerun suites, invoke Git or write files.

From repository root:

```sh
env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B \
  node_modules/.cache/native-validation/native-lua-percentage-replay-september12/offline.py verify
```

No production, shared documentation, manifest or historical-evidence edits. No commit or push. Overall browser acceptance and integration remain with the parent; this task does not edit `TASKS.md` or reopen either prior replay allowance.
