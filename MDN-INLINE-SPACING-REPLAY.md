# Captured MDN inline-spacing check — September 14, 2026

## Verified outcome

**The captured page now reports fewer unsupported CSS-property occurrences.**
One native observation on committed runtime `be3aaf6` runs from
`2026-09-14T09:54:18.408Z` to `2026-09-14T09:54:18.823Z`. It loads the original
MDN `Document.querySelector` capture, builds default formatting, reads cached
CSS diagnostics and performs the unchanged bounded attribution workload.
This is not fresh live browsing, pixel validation or a successful website click.

The comparison is with the actual logical-block replay at
`08:53:38.387`–`08:53:38.811` UTC on `565aa1e`, documented in
`MDN-LOGICAL-BLOCK-REPLAY.md`. Its 40 core evidence entries rehash unchanged.

| Native observation | Previous | Current |
| --- | ---: | ---: |
| Raw unsupported CSS-property occurrences | 126 | 113 |
| Applicable unsupported CSS-property occurrences | 64 | 54 |
| Total overlapping formatting issue occurrences | 206 | 196 |
| Retained diagnostic samples | 128 | 128 |
| Omitted diagnostic occurrences | 31 | 18 |
| Cascade work | 4,208,458 | 4,209,763 |
| Generated-content work | 65,503 | 65,620 |

Other raw/applicable issue counts are unchanged: invalid/unsupported values
31/15, at-rules 14/14, media queries 16/16 and selectors 2/2. The ten formatting
issue categories remain, including 63 unsupported-display and 29 coordinated-
positioning occurrences. These counts overlap; they are not unique affected
nodes or a whole-page correctness score.

All formatting metrics stay unchanged: 1,954 visited DOM nodes, 2,054 boxes,
seven outside markers, 15,270 text code units, 83,210 work and 65 deferred
subtrees. Visited nodes are not the document's total node count. Stylesheet
metrics retain one cascade build, 18 external sheets, zero imported sheets,
591 rules, 1,446 declarations and 84,329 code units.

The cached diagnostics read does not change style metrics or rebuild the
cascade. Across runtimes, cascade work rises by 1,305 and generated-content
work by 117. No speed or memory improvement is claimed.

## Sampling and scope

Sampling remains truncated and nonexhaustive. No inline-spacing rejection is
present in the 128 retained samples; this alone does not establish the absence
of every possible rejection. Sample states are 55 unmatched/active, 53 matched/
active, 18 not-evaluated/inactive, one matched/uncertain and one unresolved/
active. The separate attribution workload uses 127 lookups and returns five
candidate records; empty sampled categories do not establish no remaining gap.

The same 19 original resources supply 270,288 decoded bytes, each once. One
BrowserSession navigation, one default formatting build, one cached diagnostic
read and one hint query run. Zero wire requests, scripts, clicks or recorded
JavaScript guard attempts. There is no new asset, destination response, width
resolution, geometry/raster probe, fallback or retry. Only the native browser
interprets the captured HTML/CSS.

## Binding and verification

Runtime commit: `be3aaf699412909e0675c10f3e6487795c61b1f2`.
Compiled runtime: `/dev/shm/agent-browser-logical-inline-september14/release00/snapshot01/dist`.
The final 22,991-pass native gate, with two unchanged exclusions, is rehashed,
not rerun for this observation. Its 100 receipts and exact 1,363-source/
2,184-compiled inventories verify. The dirty worktree is not the runtime.

Prepared result verification and independent parent verification both pass.
The five reused helper/fixture/preparer/guard files are byte-identical. The
workload changes only its provenance; the supervisor changes only its stale
Font-wide label to the accurate inline-spacing release label. Limits and
execution behavior are unchanged.

Supervision runs `09:54:18.285`–`09:54:18.838` UTC, exits 0, and process group
1487558 is subsequently absent. Output is 139,514 bytes, below the 6 MiB cap.
The 30-second timeout/5-second grace, 35-second watchdog and 10 MiB file-size
bound remain. No integrity, cleanup, spawn, stream, watchdog or cap failure
occurs. Owners close, documents retain zero nodes, and private HOME/TMP are
removed empty. Kernel denied-syscall telemetry is not collected; empty
JavaScript guard arrays do not measure kernel denials.

Original lane: `/dev/shm/agent-browser-mdn-inline-spacing-september14/`.
Durable-copy target: `node_modules/.cache/native-validation/mdn-inline-spacing-replay-september14/`.
The persistence receipt and copy ledger preserve original paths and bytes;
copying evidence does not create another run or rewrite historical outcomes.

| Original artifact | SHA256 |
| --- | --- |
| `before-RESULT.json` | `e79866874b40147b1e78b06fadc8f45c62289544ca83de624c00bca24ee0f439` |
| `VERIFICATION.json` | `c8ab37220f63fb2e6d63fe139a447ae0b79942f0f0a13142df33d3e1a4c11865` |
| `PARENT-VERIFICATION.json` | `c7c63a0ac20e36f30a58cc054b4118ffc69275542a8e58e348b20e7cb5fa3ebe` |
| `EVIDENCE.sha256`, 41 core entries | `bc08321a7cea6aab3942a9adc3c7494ba6a86d6dd408f428e483a8ab57111a27` |
| `PREPARED.sha256`, 13 framework entries | `2eed6a9d5582abf00d843ef14e8dcdb7895368173a2ca72affa43e138de10a5a` |

## Next acceptance check

Revisit the earlier captured MDN ordinary-click failure on this current runtime,
with a separate bounded scope. Diagnostics do not prove that width resolution
or click actionability now works. Its destination remains uncaptured: any
request outside the corpus must fail closed rather than trigger a live fetch.
Wikipedia geometry, broader live sites/forms, original research, credentials/
providers/passkeys/devices, SafeJS, socket/real terminal and challenge gates
remain open. Overall goal active; nothing pushed.
