# Lua captured-page collapsed-table replay — September 12, 2026

## Outcome

**Two isolated native replays completed; the manual-link flow still fails in both runtimes.** There was no live request, destination fetch, successful geometry result, or working-site acceptance. No third replay occurred.

Each runtime consumed the same four original responses, made one initial navigation, committed one document, discovered the actual `manual.html` anchor, and attempted exactly one native click. Both clicks returned `unsupported`: “Document width resolution requires an issue-free supported formatting profile”. The destination was never requested; replay-miss handling remained unexercised, and no destination response was fabricated.

| Observation | old11599 | new11784 |
| --- | --- | --- |
| Runtime commit | `0ca889debf2e52abb6316a2ec661fcb5f0ccd529` | `ffc7b2ef34b271c617ca846ec2296e8deede88b2` |
| Native child UTC, September 12, 2026 | 04:04:39.044–04:04:39.896 | 04:04:40.062–04:04:40.915 |
| Supervisor UTC | 04:04:38.929–04:04:39.928 | 04:04:39.949–04:04:40.947 |
| Supervisor elapsed seconds | 0.9978857599198818 | 0.996910622343421 |
| Native adapter entries / transport requests / mocks | 4 / 4 / 4 | 4 / 4 / 4 |
| Live HTTP / redirects / replay misses | 0 / 0 / 0 | 0 / 0 / 0 |
| Original bytes replayed | 45114 | 45114 |
| Formatting nodes / visited DOM nodes | 2381 / 2330 | 2381 / 2330 |
| Formatting work | 27918 | 30299 |
| Deferred subtrees | 1 | 1 |
| Retained CSS / non-CSS diagnostic records | 19 / 9 | 19 / 9 |
| Child exit / stdout bytes / stderr bytes | 1 / 83240 / 0 | 1 / 83230 / 0 |

The original HTTP capture is historical: September 12, 2026, **03:03:55.333–03:03:57.239 UTC**, not the replay times above. Original response dates, received-at times, raw headers and wire-body hashes are preserved separately from mock timestamps. The original live report is unchanged at `LUA-MANUAL-FLOW.md`.

## Releases and preservation

Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, version 22.22.0, SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

Runtimes are the sealed `snapshot01/dist` trees under `native-noscript-september12-round01` and `native-collapsed-table-september12-round03`, respectively. No production, snapshot, compiler, manifest, shared documentation or historical evidence was modified. No rebuild or suite rerun was performed; the parent's separate tests are not part of this evidence.

- Old release: all 1094 source files, 1928 compiled files, 20 gate receipt members and 12 commit-owned inputs verified. All 1094 source files independently match actual Git commit blobs. Historical gate: 11599 passed, 0 failed, 2 exclusions; 208 selected suites, 207 strict roots, 602 manifest entries.
- New release: all 1103 source files, 1944 compiled files, 20 gate receipt members and 21 commit-owned inputs verified. All 1103 source files independently match actual Git commit blobs. Historical gate: 11784 passed, 0 failed, 2 exclusions; 213 selected suites, 212 strict roots, 607 manifest entries.
- Both full source/compiled inventories match before, after and during independent verification. Both original release summaries, audit/result/summary/commit-verification pins and complete gate receipt ledgers verify. Manifest entry counts are not executed suite counts.
- Both complete original Lua ledgers and all 54 original exact-byte archives verify using the approved `verify-fixed01.mjs` / `checks-fixed01.mjs`. The historical failed verifiers were not executed. Both completed Man7 replay ledgers also verify; no old browser probe was rerun.
- Thirteen completed Man7 harness/reference files were archived and byte-compared before adaptation; fifty additional task, release, Lua-capture and receipt files were archived. The user refined the task after initial archival but before either run: `CONTRACT.md` retains the original bytes, `CONTRACT-REFINED.md` retains the authorized refinement, and `CONTRACT-REFINEMENT.json` records both hashes. No historical task bytes were silently replaced.

| Release | Full source ledger SHA256 | Full compiled ledger SHA256 |
| --- | --- | --- |
| old11599 | `a17003a374936ef07f7cb39ce2cf57d0ce739e0dbf865e935fad081347d14bb9` | `97dd82d475c52022e6602e066646d292244f9ff2fe45e66aaeb958fc1eb81570` |
| new11784 | `4bcebc7b8f7f0f18ad608efc218820db1bf5f89c34cd2aa9b3faa7ff51669938` | `10c5acd79ba2931c66c619e190b79b454e6eb73cc779759ff24ecf1ae090cbad` |

## Exact responses and unchanged inputs

All resources are from the original `https://www.lua.org/manual/5.4/` capture, status 200, identity encoded. Encoded and decoded archives are byte-equal. Every replayed response body and normalized header set is checked against the original; original raw header arrays retain names, order and values. Header files are HTTP response records, not packet captures.

| Archive index | Resource | Encoded / decoded bytes | Body SHA256 |
| --- | --- | --- | --- |
| 1 | contents document `/manual/5.4/` | 32734 / 32734 | `400cce3bc5b23b1d424a01c23dae926fbecb56fbbe266a3b7a669f5f180cefa0` |
| 2 | `lua.css` | 2247 / 2247 | `73e7e5fa61afec5f04f5e43ad5c8348620abc41b8e4671631300b5defe3f2826` |
| 3 | `logo.png` | 9893 / 9893 | `de4ca280a5561940ace4b1a72dc5bc1d96ac154e59c7ae32d98ddcde010baeaa` |
| 4 | `index.css` | 240 / 240 | `b6ef324ca66e9ffdafa9e5b5a1478a548aa20f3a23f264eb1bed6d21c1c7d039` |

Full body hashes, raw-header byte lengths/hashes, original timestamps and all four unchanged metadata files are retained in `archive/` and independently checked. Each runtime reports exactly 45114 mocked decoded bytes, zero wire encoded bytes, four mocked requests and no rejected optional image. No CSS deletion, stub, alternate source or capacity increase was used. The original loader callbacks, same-origin resource policy, 1280×720 viewport, document/stylesheet/network/session limits and scripts-disabled mode are unchanged.

Both native documents have title “Lua 5.4 Reference Manual - contents”, root `e1`, 2341 nodes and revision 2345. Complete native HTML serialization is byte-equal between runtimes and unchanged before/after diagnostics and the click: **32856 bytes**, SHA256 `2a74ce1ad43676d1dbe2b01edda8ec9fbdb1cbc5a74cbfcfeb311d597db2b500`. Serialization is native DOM evidence, not a claim that it equals the original 32734-byte HTTP HTML.

Native body text, serialized DOM, extraction inputs and extraction options are equal. The bounded extraction call (`format=json`, `maxBytes=65536`, `maxNodes=1000`, `maxDepth=128`) fails identically with `resource-limit`, “Extraction structure limit exceeded”. This is **not successful extraction**; limits were not raised to obtain a cleaner result.

Both runs inspect the first 96 current `body a[href]` elements, evaluate native style/actionability and ancestor completeness, and select the discovered “start” link, current ref `e33`, original href `manual.html`. That ref comes from the current document, not a hardcoded historical selector. Before/after URL, title, root, revision and history remain unchanged: one history entry, index 0, key `h1-1`, retained bytes 39, no evictions.

## Same-census diagnostics

Exactly one explicit bounded formatting census per runtime follows the failed click; native click/geometry internals are not claimed to perform only one layout build. Both the click and the separate read-only bounding-rectangle observation fail with the same unsupported-profile error. No geometry coordinates or rendering success are claimed.

| Diagnostic | Raw CSS, both | Applicable CSS, both |
| --- | --- | --- |
| `unimplemented-or-invalid-css-value` | 10 | 5 |
| `unimplemented-css-property` | 11 | 5 |
| `unimplemented-or-invalid-css-selector` | 1 | 1 |

Formatting CSS issues retain the `css:` prefix and remain non-advisory. Independent non-CSS guards are **unchanged**: `html-presentation-hint-not-supported`: 1; `display-layout-not-supported`: 1; `table-collapsed-borders-not-supported`: 7. Deferred `e401` is the actual `table.menubar`, with original `width="100%"`, display `table`, border collapse `collapse`, reason `display-layout-not-supported`.

The same census retains **19 actual grouped CSS diagnostic records** (22 issue occurrences) and **9 non-CSS source-attributed records**, below caps 32 and 20, with none omitted. They are in each `stdout.jsonl` at `formattingCensus.diagnosticRecords` and in its progress census record. CSS records preserve source URL/ref/hash, exact original rule excerpt and offset, selector, native parser reason/count, native selector failure where applicable, matching count and up to eight matched refs. Independently summed records equal the authoritative raw/applicable CSS counts.

The CSS diagnostic source is the actual `lua.css` link `e9`. Applicable records identify these original rule contexts for a future focused investigation, without rewriting them:

| Selector context | Native diagnostic occurrences |
| --- | --- |
| `body` | 2 unsupported/invalid values, 1 unimplemented property |
| `h1, h2, h3, h4` | 1 unsupported/invalid value, 1 unimplemented property |
| `h1 img` | 1 unsupported/invalid value |
| `h2:before` | 1 unimplemented property, 1 invalid/unsupported selector |
| `a` | 1 unimplemented property |
| `.footer` | 1 unsupported/invalid value, 1 unimplemented property |

These are native **per-rule** diagnoses with exact declaration-block excerpts, not an invented per-declaration blame assignment. Unmatched hover, target, input, session and book rules are retained separately and are not mislabeled applicable. CSS detail collection uses bounded read-only native parsing/selector matching; it does not replace the cascade or alter original CSS. Deferred reasons come directly from formatting records. Other non-CSS source attribution uses retained native nodes and the unchanged native predicates because the formatter exposes counts, not a per-issue source emitter. The seven collapse refs are `e401`, `e403`, `e404`, `e406`, `e721`, `e1221`, `e1772`; the presentation hint is `e401`.

New formatting work rises by 2381 (27918 → 30299), but no recorded guard is removed. This differential does not establish a single root cause, general collapsed-table correctness, visual correctness or a working website.

## Isolation, pacing and cleanup

Both browser children run under kernel seccomp denial of socket/socketpair/connect/bind/listen/accept/send/receive/shutdown and related prohibited operations, no-new-privileges, 6 MiB file-size and zero core limits. JS network, DNS, process, worker/module and native-addon guards prevent alternate transports and real SafeJS. No socket self-probe, real TTY/PTY, credential, provider, device, challenge handling or bypass was used.

The supervisor uses explicit environment keys only (`PATH`, `LANG`, `LC_ALL`, `TZ`, `HOME`, `TMPDIR`, `PYTHONDONTWRITEBYTECODE`), private empty mode-0700 HOME/TMP, ignored stdin, piped output and a separate child process group. Bounds: 45 seconds plus 5-second kill grace per child, 6 MiB per file/combined child output, 16 MiB lane, at least 64 MiB free. Both children finish in under one second, without timeout, signal, truncation or storage breach; both process groups are absent on return.

The monotonic mock deadline is rechecked in a loop; no one-shot timer rounding is accepted. Exact observed inter-mock intervals (ms):

- old11599: `251.55915099999999`, `251.17461899999995`, `251.977215`.
- new11784: `251.888464`, `251.33729`, `251.07107800000006`.

All intervals exceed 250 ms. Historical Man7's shortfall is not repeated or rewritten. Mock pacing is not measured HTTP pacing.

Returned metrics independently prove cleanup of one actual document, image, event and control owner per runtime: zero retained document nodes/text/collectors; zero image resources/active/queued/waiters; zero listeners/dispatches; zero file controls/files/bytes and mouse buttons/pressed state. Owners are closed; session tabs/pending loads/request queue and transport activity are zero and closed; cookie jars are empty/closed; cleanup errors are zero. This is sampled-owner proof, not process-wide leak freedom.

## Preserved verifier correction

The first new offline verifier failed because it expected progress `kind=native-adapter-attempt`. The inherited progress helper retains each adapter record's resource kind (`document`, `stylesheet`, `image`) instead. All four original ordered adapter records are intact. Corrected verification requires exact equality between every `nativeMethod`-bearing progress record and stdout's attempts, rather than a nonexistent label. `VERIFICATION-FAILURE.json`, the exact failed verifier source archive, and `VERIFIER-CORRECTION.json` remain sealed. No browser harness, output or historical evidence was changed; neither runtime was rerun. The final **27 evidence checks pass**, while both native flows remain failed.

## Changed paths and read-only verification

Only these new paths belong to this task:

- `LUA-COLLAPSED-TABLE-REPLAY.md`
- `node_modules/.cache/native-validation/native-lua-collapsed-replay-september12/` (including private archive and per-runtime HOME/TMP directories).

`ARTIFACTS.txt` is the exact complete file list, including this report. `RECEIPTS.sha256` seals report, execution, archives, harnesses, observations and verification evidence. `SEAL.json` binds that ledger and key report/execution hashes. `FINAL-RECEIPTS.sha256` covers every listed file except itself, including the first ledger and seal. The read-only verifier checks exact ledger membership, every byte hash, the report assertions, original Lua evidence, gate ledgers, full source/runtime inventories, actual commit blobs and independently recomputed outcome/cleanup/pacing records. It does not launch a browser, rebuild, rerun suites or write evidence.

From repository root:

```sh
env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC \
  /home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  node_modules/.cache/native-validation/native-lua-collapsed-replay-september12/verify.mjs
```

No commit or push. Overall browser acceptance and outstanding gates remain with the parent; this task does not modify `TASKS.md`. Protected source payloads and other unfinished agent lanes were not read.
