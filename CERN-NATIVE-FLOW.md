# CERN native link flow — September 11, 2026

**Passed the bounded native link-click flow.** One authorized public run used
`BrowserSession` and `NodeNetworkTransport`; no retry or direct-navigation
fallback occurred. Only this report and the new
`node_modules/.cache/native-validation/native-cern-link-flow-september11/` lane
were written. Source, tests, TASKS, previous evidence, and commits were untouched.

## Observed result

- Loaded `https://info.cern.ch/hypertext/WWW/TheProject.html`: HTTP 200,
  title **The World Wide Web project**, 123 native nodes.
- Native `a[href]` discovery found exactly one text match: **What's out there?**,
  reference `e39`, href `../DataSources/Top.html`, target `_self`. Native document
  base resolution produced `https://info.cern.ch/hypertext/DataSources/Top.html`.
- Verified a same-origin, bodyless GET anchor route and called
  `BrowserSession.click` once on `e39`.
- Committed exactly that observed destination: HTTP 200, title **Overview of the
  Web**, 28 native nodes, and 498 UTF-16 code units of nonempty native body text
  beginning “General Overview”. It was a different document; the old document
  already had zero nodes after replacement.
- Both documents passed challenge classification using their actual primary
  status/headers plus native title/text. Both classifications returned null.
- Two navigations and two commits; two real requests, zero mocks/redirects,
  2,881 encoded and decoded bytes. Both pages had zero stylesheet rules,
  declarations, CSS issues, and image elements.

## Exact build and timing

Used only the specified immutable
`native-relative-has-september11-round01/snapshot01/dist` build and
`native-relative-has-compiled-september11` pins, under
`node_modules/.cache/native-validation/`. This is the named relative-has build,
not a claim to use the newest build; no separate custom-property candidate was
used. Its prior validation had **6,614 passed, zero failed, one known skipped
test** (`exposes the separate total host-object ceiling without claiming
full-pool runtime capacity`). That validation was checked, not rerun.

Independent inventories verified 1,006 source files and 1,788 compiled files,
unchanged before/after the flow and matching the original ledgers:

| Ledger | SHA-256 |
| --- | --- |
| Source | `4311707c7e339e2529c3566824faa216b46ae88f64de7a4388f095904fd45b90` |
| Compiled | `db3cb2e3b6bb9956a7b8110b24f7931ecd9cc32b65e1f47f1b2e5a66c9c77e04` |

Exact UTC timestamps on September 11, 2026:

| Time | Receipt |
| --- | --- |
| `10:05:27.959Z` | Preflight pins accepted. |
| `10:05:27.961Z` | Sole supervised native child launched. |
| `10:05:28.039Z` | Native probe started. |
| `10:05:28.655Z` | Observed link selected and native click started. |
| `10:05:29.081Z` | Destination/closure assertions passed; cleanup completed. |
| `10:05:29.088Z` | Child exited zero, without timeout or signal. |
| `10:05:29.124Z` | Supervisor post-run integrity check completed. |
| `10:05:44.540Z` | Independent verifier passed all 36 checks. |

## Captures, guards, and cleanup

Both actual response bodies are retained in the owned lane:

| Capture | Encoded / decoded bytes | SHA-256 |
| --- | --- | --- |
| `response-1.body`, initial document | 2,217 / 2,217 | `d78ac003f36a0ed898bcda19b10daaf5a928a250014fbb4a1daa823ef4e6b71b` |
| `response-2.body`, destination | 664 / 664 | `92b967469e53745f1740783005446e00ee7efb66032e0587a08b957dc826b351` |

The reused HN live supervisor enforced one child, one tab, two maximum
navigations, one pending navigation, a 20-second navigation timeout, 30-second
child deadline plus five-second grace, and 6-MiB file/combined-output caps.
Native transport retained 12 requests, concurrency one, 250-ms minimum spacing,
15-second request timeout, 2,000,000-byte response cap, 8,000,000-byte total cap,
16,384-byte header cap, one-byte configured request-body cap, and five maximum
redirects. The wrapper permitted only bodyless GETs to `https://info.cern.ch`,
omitted credentials, and rejected non-2xx/challenge responses. No scripts,
SafeJS, alternate clients, account interactions, forms, external links, or
TTY/PTY were used. HOME/TMPDIR were private and empty; the child received only
the six-variable environment allowlist recorded in `INVOCATION.json`.

Cleanup verified zero remaining nodes in both documents, zero tabs, zero active
requests, zero cleanup errors, and `pendingLoads: 0` immediately after close.
No settlement sample was necessary. Session/transport were closed and the
process group was absent. Stdout was 16,261 bytes; stderr was empty.

`stdout.jsonl` and `progress.jsonl` preserve intermediate native results,
headers, and timings. `INTEGRITY.json` and `VERIFICATION.json` confirm unchanged
source/build/runtime/harness/prompt, capture hashes, caps, two successful commits,
old-document closure, and final cleanup. The verifier imported no browser and
made no network requests. `RECEIPTS.sha256` seals 23 files, with SHA-256
`cc00cb359a893cd7b1818ed75d9ed5bf2b40c27f0b318dae524cba149a29129e`.
The later `REPORT-VERIFICATION.json` separately binds this report to the ledger.

## Remaining limitations

This passes native navigation/content/closure only—not full visual conformance,
research-topic completion, performance benchmarking, or validation of other
sites and script/CSS-heavy pages. Both documents remain partial native HTML
parses in quirks mode with `missing-doctype` and
`quirks-layout-not-implemented`; the initial document additionally reports
`misnested-body-end` and `unmatched-formatting-end`. Both used windows-1252.
Those diagnostics were preserved, not repaired or waived as proof of complete
rendering. No additional browsing was performed.
