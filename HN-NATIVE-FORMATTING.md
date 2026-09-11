# Hacker News native formatting diagnosis — September 11, 2026

**Diagnosis captured; website flow still fails.** One network-denied native
replay reproduced the original `BrowserSession.click` failure on header link
`new` (`e28`, href `newest`). No live request, second child, click retry, fallback
navigation, source/test/TASKS edit, or commit occurred.

## Exact rejecting issue set

| Formatting issue | Count | Observed provenance |
| --- | ---: | --- |
| `css:unimplemented-or-invalid-css-value` | 17 | Existing stylesheet issue counts copied into formatting issues. |
| `css:unimplemented-css-property` | 24 | Existing stylesheet issue counts copied into formatting issues. |
| `element-layout-not-supported` | 1 | Deferred `<center>` element `e12`, ancestor of clicked link `e28`. |

All three satisfy the width resolver's rejection predicate. There are no
positioned nodes, flex coordination, or applicable advisory exceptions. The
original error is reproduced unchanged:

> Document width resolution requires an issue-free supported formatting profile

Code: `unsupported`. The actual click stack reaches
`DocumentScrollIntoView.plan` → `DocumentGeometry.refresh` → `layoutDocument` →
`layoutPageDocument` → `layoutFormattingPageDocument` →
`resolveFormattingPageWidths`, which throws at pinned compiled
`dist/src/formatting-tree.js:656:15`.

**The structural blocker is specifically `<center>`, not a measured table or
quirks-layout rejection.** The formatting tree contains only viewport, HTML
`e2`, BODY `e11`, and deferred CENTER `e12`: four boxes, five visited DOM nodes,
22 work units, one deferred subtree. CENTER has computed display `inline` and
no formatting children. Its DOM child is table `e13`; clicked descendant `e28`
is absent from the formatting tree. Tables remain below this untraversed
formatting subtree. The loaded document's quirks diagnostics are not members
of this rejecting issue set.

## Pinned source locations

All source locations below are relative to the immutable directory
`node_modules/.cache/native-validation/native-research-challenge-handoff-september11-round02/snapshot01/`:

- `src/formatting-tree.ts:851`: `resolveFormattingPageWidths`; rejection
  predicate starts at line 861 and throws the observed message at line 871.
- `src/formatting-tree.ts:181`: copies all stylesheet issues with a `css:` prefix.
- `src/formatting-tree.ts:135`: includes `center` in `deferredElements`;
  `src/formatting-tree.ts:653` selects its `element-layout-not-supported` reason
  and emits a deferred node without descending into its children.
- `src/styles.ts:127` and `src/styles.ts:198`: default block-tag set omits
  `center`; the user-agent display fallback is `inline`.
- `src/css-parser.ts:268`: unsupported-property issue origin. Unsupported or
  invalid values have several issue sites in that parser; individual captured
  declarations were not isolated in this one diagnostic.
- `src/flex-document.ts:37` builds the formatting tree; line 60 invokes the
  width resolver. `src/document-geometry.ts:402` requests layout during scrolling.

## Method, limits, and receipts

Owned lane:
`node_modules/.cache/native-validation/native-hn-formatting-diagnostic-september11/`.
The supervisor reuses the existing MDN offline replay pattern and unchanged
`network-guard.mjs` / `sealed-exec.py`. Only this new lane and this report were
written; the previous HN lane and report remain unchanged.

The sole child loads the original captured homepage and CSS using exact native
fixture routes, retaining original URLs, status, full headers, decoded bodies,
and response order. The stylesheet's query string is preserved. It discovers
the same single header candidate and clicks once **before** extra diagnostics.
After that failure, public `buildFormattingTree` and
`resolveFormattingPageWidths` expose the issues and reproduce the same error.
No native instrumentation, DOM edits, patches, or budget/counter resets were
needed. Document revision remains 1303; the serialized formatting input remains
byte-identical across width resolution.

The prior green validation remains 6,543 passed, zero failed, one skipped.
Independent inventories verify 1,006 source files, 1,788 compiled files, and all
25 files in the original HN lane. Exact SHA-256 pins:

| Input | SHA-256 |
| --- | --- |
| Source ledger | `11712f2d97eeded2d12368cb3ba9c5ec3a662cd994a926f3443a1fe6a8641aa6` |
| Compiled ledger | `8ac79987f90c5d39954d3585055dc9d5ef2251bfabd53def93717a42cdb3c516` |
| Prior live stdout | `9a86e068f0ddbe006205f3c3dbd61181b308a558473a91112bbe8b8be4dc2d78` |
| Homepage capture | `724d5760b11a50927a9e1404221eb96be75f13b685e0ae22e11ec1c70c523bee` |
| CSS capture | `de4722818cb6e7859a4287ba956bf04973a63ca97318f6d4c4f44d55e7d454b5` |

Timing, all UTC on September 11, 2026:

| Time | Observation |
| --- | --- |
| `09:52:52.857Z` | Preflight passed. |
| `09:52:52.859Z` | Sole supervised child launched. |
| `09:52:52.960Z` | Native probe started. |
| `09:52:53.019Z` | Native click attempted. |
| `09:52:53.022Z` | Original click rejection reproduced. |
| `09:52:53.023Z` | Exact formatting issues captured; public width resolver rejected them. |
| `09:52:53.024Z` | Probe completed and cleanup observed. |
| `09:52:53.037Z` | Child exited zero: diagnosis captured, not website success. |
| `09:52:53.073Z` | Supervisor integrity check completed. |
| `09:53:02.535Z` | Independent verifier passed 40 checks. |

Network denial combines inherited seccomp EPERM rules for network/socket and
io_uring syscalls with JavaScript HTTP, DNS, socket, fetch, and WebSocket guards.
Native addons/SafeJS, subprocesses, and workers are denied inside the probe.
No guard self-probes were attempted. `Seccomp: 2`, `NoNewPrivs: 1`, zero JS
network/process guard attempts, and zero encoded wire bytes were recorded.
Two mocked native responses supplied 42,364 decoded bytes; there were no real
network requests. Challenge classification used the retained primary headers
and native title/text and returned null, not a new live challenge assessment.

Bounds remain unchanged: one tab, two maximum navigations, one pending
navigation, 20-second navigation timeout; 12 requests, concurrency one,
15-second network timeout, 2,000,000 response bytes, 8,000,000 total bytes,
16,384 header bytes, one-byte request-body cap, five redirects, and configured
250-ms request spacing. Fixture routes are not a wire-pacing measurement.
Formatting/layout work limits remain 2,000,000. Supervisor deadline is 30 seconds
plus five-second grace; file and combined-output caps are 6 MiB. Scripts,
credentials, and TTY/PTY remain disabled; HOME/TMPDIR were isolated and empty.

Cleanup: one navigation/commit; zero remaining nodes, tabs, active requests,
or pending loads; closed session/transport; process group absent. No settlement
sample was needed. Private directories were removed after inspection. Stdout
is 20,460 bytes; stderr is empty. Images remain policy-denied as in the capture.

`formatting.json` is the complete 4,306-byte public diagnostic output, SHA-256
`f56af4067c7921006949c0f20b79a8aa422f1df3556bc2895cd445e62cafe646`.
`stdout.jsonl` retains both exception stacks, issue counts, ancestor chain,
original failure, limits, and cleanup; `progress.jsonl` retains intermediate
stages. `VERIFICATION.json` records `integrityPassed: true`,
`diagnosticCaptured: true`, and `websiteFlowPassed: false`.
`RECEIPTS.sha256` seals 23 files; its hash is
`81c4e2f3eb128f3375b3e57a4249c5a8b0dc88c4eff7d871f4984f9d3a733d01`.
The later `REPORT-VERIFICATION.json` binds this report to the sealed evidence.

## Next implementation direction

1. Add bounded native `<center>` formatting/default-display and centering
   support so its descendants can receive real layout boxes. Merely deleting
   the deferral is insufficient: its present user-agent display is inline.
2. Address the 17 invalid/unsupported-value and 24 unsupported-property
   diagnostics separately: identify the needed declarations, implement supported
   behavior or a justified ignored-declaration policy, and retain explicit
   layout-critical failures. Do not blanket-disable the width guard.
3. Preserve a focused regression for this ancestor/link shape and issue
   propagation. Descendant table/presentation-hint or other failures may become
   visible only after these blockers are resolved; this run does not certify
   them or any future fix.

This diagnosis is independent of selector-performance work. No additional native
replay or live retry was performed. `/newest`, destination story extraction,
replacement-document closure, complete rendering, research completion, and
performance benchmarking remain unvalidated.
