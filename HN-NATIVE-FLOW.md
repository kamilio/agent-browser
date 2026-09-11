# One-run native Hacker News link flow — September 11, 2026

## Result and scope

**The requested link flow did not pass.** The single authorized native child
loaded the Hacker News homepage, classified its actual primary response plus
native title/text, discovered the header `new` link, and attempted
`BrowserSession.click` on native reference `e28`. That action failed with
`AgentBrowserError`, code `unsupported`:

> Document width resolution requires an issue-free supported formatting profile

There was no direct-navigation fallback, retry, second native child, or request
to `/newest`. Destination title/story extraction and old-document closure caused
by replacement navigation were **not reached**. Final session/document/network
cleanup did pass. This is not evidence that the two-document acceptance gate or
navigation-settlement regression is fixed.

Owned evidence lane:
`node_modules/.cache/native-validation/native-hn-link-flow-september11/`.
Only this new lane and this report were written. No source, tests, `TASKS.md`,
existing evidence, or the parallel MDN lane were edited. No commits, installs,
pushes, alternate HTTP/browser clients, web search, credential reads, page
scripts, SafeJS execution, TTY/PTY, or challenge evasion were used.

## Immutable validation and provenance

The supervisor adapted the existing `native-mdn-link-flow-september11` harness
but imported only the immutable
`native-research-challenge-handoff-september11-round02/snapshot01/dist` build.
Its compiled reference was
`native-research-challenge-handoff-compiled-september11`.
All names in this paragraph are under `node_modules/.cache/native-validation/`.

Before launch, the supervisor checked the prior green validation: **6,543 passed,
zero failed, one skipped**, with successful build, strict, format, and explicit
native-test-list commands. That validation ran from
`2026-09-11T09:31:22.469Z` through `2026-09-11T09:32:58.800Z`.
The skipped test was `exposes the separate total host-object ceiling without
claiming full-pool runtime capacity`. This historical validation was checked,
not rerun or represented as the live website result.

Exact SHA-256 pins:

| Input | SHA-256 |
| --- | --- |
| Validation `SUMMARY.json` | `bcbe081fdcfce201ddebd115195783c1f49652213b26250967565320f924c8cc` |
| Validation `native.stdout` | `33089cae5f59659c1166705f6a97bf9845b3ae4c854119912efaa6c4c99dada3` |
| Source inventory, 1,006 files | `11712f2d97eeded2d12368cb3ba9c5ec3a662cd994a926f3443a1fe6a8641aa6` |
| Compiled inventory, 1,788 files | `8ac79987f90c5d39954d3585055dc9d5ef2251bfabd53def93717a42cdb3c516` |

`PREFLIGHT.json` also pins Node v22.22.0, the compiled research CLI, the adapted
harness, its MDN provenance, and the authorized Markdown prompt. Independent
before/after inventories match the original source and compiled ledgers.

## Exact UTC sequence

| UTC timestamp on September 11, 2026 | Observation |
| --- | --- |
| `09:42:48.704Z` | Preflight pins and inventories accepted. |
| `09:42:48.705Z` | Supervisor launched the sole native child through GNU timeout. |
| `09:42:48.784Z` | Native probe report started. |
| `09:42:48.786Z` | Homepage navigation started. |
| `09:42:49.045Z` | Homepage HTTP 200 captured. |
| `09:42:49.305Z` | Same-origin stylesheet HTTP 200 captured. |
| `09:42:49.323Z` | Native document loader completed with 1,303 nodes. |
| `09:42:49.324Z` | Homepage committed; title `Hacker News`; primary-header/content classification returned no barrier. |
| `09:42:49.327Z` | One matching header link recorded, then native click attempted. |
| `09:42:49.330Z` | Unsupported-action failure reported; immediate cleanup observed; probe finished. |
| `09:42:49.337Z` | Child exited 1, with no signal, timeout, or remaining process group. |
| `09:42:49.373Z` | Supervisor post-run integrity check completed. |
| `09:42:58.753Z` | Independent offline verifier completed 32 successful evidence/integrity checks. |

The DOM selector was `.pagetop a[href]`. Exactly one candidate resolved to
same-origin path `/newest`; the deterministic rule selected the first candidate
in native query order. Its observed text was `new`, href `newest`, reference
`e28`, resolved URL `https://news.ycombinator.com/newest`, and target was empty.
No login, vote, submit, comment, account, or story link was clicked.

## Requests, native diagnostics, and cleanup

| Capture | Observed URL | Status | Encoded bytes | Decoded bytes | SHA-256 of decoded body |
| --- | --- | --- | --- | --- | --- |
| `response-1.body` | `https://news.ycombinator.com/` | 200 | 5,799 | 34,946 | `724d5760b11a50927a9e1404221eb96be75f13b685e0ae22e11ec1c70c523bee` |
| `response-2.body` | `https://news.ycombinator.com/news.css?e1A2H4cHxVYFl1HF3Snj` | 200 | 1,825 | 7,418 | `de4722818cb6e7859a4287ba956bf04973a63ca97318f6d4c4f44d55e7d454b5` |

Totals: two real requests, no mocks or redirects, **7,624 encoded / 42,364
decoded bytes**, one navigation and one document commit. Both response-level
challenge classifications and the primary-header/native-content classification
returned null. This reports those observations, not universal absence of an
access challenge.

The loaded document remained partial: HTML quirks mode, missing doctype,
unimplemented quirks layout, one ignored nonvoid self-close, content after body,
and one script intentionally not executed. Styles reported 109 rules, 219
declarations, 7,881 code units, 38,508 work units, 17
`unimplemented-or-invalid-css-value` issues and 24
`unimplemented-css-property` issues. Two image elements were `policy-denied`;
no image requests were made. These are native diagnostics, not complete rendering
or a performance benchmark.

Cleanup immediately observed `pendingLoads: 0`, zero active requests, zero tabs,
zero remaining document nodes, zero cleanup errors, and closed session/transport.
No settlement sample was necessary or taken. In particular, this run supplies
no delayed-settlement observation and makes no pending-load leak claim. Private
HOME/TMPDIR remained empty; the independent verifier confirmed process-group
absence. Stdout was 15,071 bytes; stderr was empty.

## Enforced bounds

- Sole allowed origin: `https://news.ycombinator.com`; one run, one tab, at most
  two document navigations and one pending navigation; no click fallback.
- Native transport: 12 requests, concurrency one, 250-ms minimum request
  spacing, 15,000-ms network timeout, 2,000,000-byte response cap,
  8,000,000-byte total cap, 16,384-byte header cap, one-byte configured request
  body cap, and five maximum redirects. The harness allowed only bodyless GETs
  with omitted credentials and rejected authorization/cookie request headers.
- Navigation timeout 20,000 ms; native child deadline 30 seconds with five-second
  termination grace; inherited hard/soft file cap 6 MiB and combined output cap
  6 MiB. Diagnostic text was capped at 12,000 code units.
- If needed, the original child could take exactly one 50-ms event-loop wait
  and settlement sample, bounded to 100 ms inside its original deadline; this
  branch was not used. Session internals/counters were not modified.
- Clean environment allowlist: `PATH`, `LANG`, `LC_ALL`, `TZ`, private `HOME` and
  `TMPDIR`; stdin ignored, stdout/stderr pipes, no TTY/PTY.

## Receipts and next issue

Within the owned lane, `progress.jsonl` preserves intermediate stages and response
metadata; `stdout.jsonl` preserves the native report; `EXECUTION.json` records
the child exit; `INTEGRITY.json` records unchanged inputs; `VERIFICATION.json`
records `integrityPassed: true`, `flowPassed: false`, and `passed: false`.
Its 32 checks independently cover inventories, harness/prompt/runtime hashes,
captures, invocation, caps, deterministic link selection, and cleanup. The
offline verifier imports no browser and performs no network access.

`RECEIPTS.sha256` seals 23 files including `VERIFICATION.json`; its SHA-256 is
`c0b56cf0e673dcfaef318814a1174266823fcac38e869d5adc7c2ecf8405b450`.
The `VERIFICATION.json` SHA-256 is
`7f453f18b715c579c24954714a3ac72d093a0ab73257969e5a46afec0c91a332`.
`REPORT-VERIFICATION.json`, created after that sealed run evidence, separately
binds this report to the receipt ledger and records a final checksum audit.

**Next concrete issue:** isolate, offline from the retained homepage/CSS, which
non-advisory formatting issues prevent native click geometry. Static inspection
of the pinned `snapshot01/src/formatting-tree.ts:851` confirms the observed error
comes from `resolveFormattingPageWidths` rejecting a non-supported formatting
profile; the compiled counterpart throws at `dist/src/formatting-tree.js:656`.
The exact rejecting issue set was not sampled. Quirks/table markup and CSS issues
are observed context, not a proven single root cause. No replay, diagnostic
native child, layout workaround, source fix, or newly authorized live retry was
performed. Full rendering, research completion, destination story extraction,
replacement-document closure, and navigation-settlement acceptance remain open.
