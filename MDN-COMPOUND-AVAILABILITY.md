# MDN same-element availability: paired offline evidence

## Outcome — September 11, 2026

The single authorized native child completed two sequential fixture-only
navigations, baseline then candidate. Both initial navigations and bounded
native content checks succeeded. Independent file-only verification passed:
all **323 corresponding calls** retain identical original selector strings,
call order, ordered node IDs, exact specificity tuples, and error
categories/messages. Full result arrays and native node graphs are retained.

| Measurement | Selector-test-order baseline | Compound-availability candidate | Reduction |
| --- | ---: | ---: | ---: |
| Completed `matchingSpecificities` calls | 294 | 294 | 0 |
| Recoverable unsupported-selector calls | 29 | 29 | 0 |
| Completed selector work, all 294 calls | 2,893,772 | 1,794,196 | **1,099,576 (38.00%)** |
| Completed cascade work | 3,991,128 | 2,891,552 | **1,099,576 (27.55%)** |
| Cascade work outside completed selector calls | 1,097,356 | 1,097,356 | 0 |
| Former largest selector, call 180 | 958,911 | **217** | 958,694 |
| Exact fixture responses served | 19 | 19 | 0 |
| Encoded wire bytes | 0 | 0 | 0 |

The explicitly tracked selector is
`:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *`;
its ordered result remains `[]`. The six separately accounted public page
queries also preserve their exact results, but **their work is unchanged**:
the same full selector still costs 958,874 through `querySelectorAll`.
Do not substitute that public-query cost for the cascade-call cost of 217.

These are offline charged-work savings, **not wall-clock speedups, live-click
acceptance, or solved grid layout**. No live request, click, second-page
navigation, rendering acceptance, SafeJS execution, credentials, real TTY/PTY,
or alternate browser was exercised. Both stylesheets/cascade outcomes remain
partial with the same 395 CSS issues.

## Authorization, gate, and immutable builds

All cache paths below are relative to `node_modules/.cache/native-validation/`:

- Task: `mdn-compound-availability-pair-prompt.md`.
- New evidence lane: `native-mdn-compound-availability-pair-september11/`.
- New reference directory: `native-compound-availability-compiled-september11/`.
- Baseline: `native-selector-test-order-september11-round01/snapshot01/`.
- Candidate: `native-compound-availability-september11-round01/snapshot01/`.
- Reused exact captures: `native-mdn-logical-availability-live-september11/`.
- Previous pair: `native-mdn-selector-test-order-pair-september11/`.

The harness was prepared while candidate validation was incomplete. A file-only
waiter imported no browser implementation and launched no native child. The
candidate's completed SUMMARY covers **2026-09-11T11:23:17.583Z through
11:24:55.352Z**, with successful build/strict/format/native commands and stable
source inputs. At **11:24:59.110Z**, the waiter independently verified the
completed gate, including the actual new case count rather than assuming it:

| Validation | Passed | Failed | Existing excluded assertion | Selected manifest-listed files | Strict roots |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 6,765 | 0 | 1 | 112 | 111 |
| Candidate | **6,786** | 0 | 1 | 112 | 111 |

Both builds have exactly **1,006 source files and 1,788 compiled files**.
The single excluded assertion remains
`exposes the separate total host-object ceiling without claiming full-pool runtime capacity`.
Counts were checked against individual assertion records, suite filenames,
the immutable native manifest, strict configuration, and source inventories.

Pinning and launch preflight rechecked the complete gate and all inputs. The
single paired child ran during **2026-09-11T11:25:32.701Z–11:25:33.443Z**,
strictly after verification. The later parent completion note,
`compound-availability-validation-complete.md`, was read after the already
authorized gated launch; it confirmed this same lane, interval and counts.
Its SHA-256 is
`f1e8540d91a8eee64ac1579e349e39d459bdabe7b2bf29f8188fab54ae25b046`.
No second launch or retry followed that note.

SHA-256 fingerprints:

| Input | Baseline | Candidate |
| --- | --- | --- |
| Validation SUMMARY | `4bcb1acc834e61818a6954bcce586287351f10c0050977033cfe83be172a0b9f` | `1f9c3f959e3483231475789ef07632779d4d75fd69c542984e171c2ba543729f` |
| Source ledger | `e82598eaa407d9a3a76d3f0d740e914311af2b339d08c786c374a77dccd09b68` | `af1e5f3a54527f3502a4ca11fb4824dc5c5d925bf3c9be00d9604a5563df0205` |
| Compiled ledger | `4f3635ffa96f8cc26ed908917885e39a7d1609fee689359b06de2dee851afebe` | `af0e0b8e081be312f733c136bdafde8deaa289a02f8c02202c2b49fa0bd2a4bb` |

The new baseline exactly reproduces the previous pair's candidate call
receipts—including costs and query metrics, not just semantic results.
The prior pair's complete receipt ledger was verified and its directory
inventory remained unchanged. Its receipt-ledger SHA-256 is
`fcc63b821bb4e3b428e1bd169a9e7e8c88ee3931b3164d56bc5bfdfccf167bf3`.
Historical reports, build paths and measurements were not rewritten.

## Exact fixtures, results, and native content

All **45 capture receipt entries** and all **19 exact response bodies** were
verified before launch and independently afterward. The fixture sequence is
one document plus 18 stylesheets, totaling **270,288 decoded bytes**, all
original status 200. Both sessions required the original request/response URLs,
full retained headers, decoded body hashes, and request order; native fixture
routes served zero encoded wire bytes. Nothing was fetched to fill a gap.

Capture report SHA-256:
`70282aae6f120fde8496eec654f82f67113efbc42a066060eac138b60beec68c`.
Capture receipt-ledger SHA-256:
`ed77967316f8cbc26b5b1a3def9613ebd23ee817f00dbfd6806c579bd4c55c49`.

The public `matchingSpecificities` wrappers called original methods with
unchanged arguments, recorded full ordered `[nodeId, [a, b, c]]` arrays,
charged work, and exact error categories/messages, then returned original
results. No compiled implementation was edited. Failed calls are excluded
from completed selector costs rather than attributing stale `lastWork`.

There are **12,450 exact result rows** across 294 completed calls, including
**172 nonempty calls**. All arrays compare exactly. Both full primary native
node graphs also compare exactly, binding returned IDs to identical nodes.
Their shared SHA-256 is
`576b8b3bfdbc28c0c76deff34edd9d4836af3e05000a85c85b5a6b7affc204d4`.
For example, call 299, `:is(.breadcrumbs li) a`, returns in both builds:

```json
[[1090,[0,1,2]],[1099,[0,1,2]],[1108,[0,1,2]],[1117,[0,1,2]]]
```

Both pages have **2,731 nodes**, one `main`, title
`Document: querySelector() method - Web APIs | MDN`, and main heading
`Document: querySelector() method` at `e1444`. All 15 extracted headings and
6,469 characters of main text compare exactly. Bounds remain 12,000 text code
units, 20 headings, 512 code units per heading and 1,024 per title.

Each run completes one cascade build: 18 external sheets, 591 rules, 1,446
declarations and 84,329 CSS code units. Loader, navigation and final style
snapshots agree on the per-run work; those snapshots are not summed together.
All CSS issue counts remain identical:

| Issue | Each build |
| --- | ---: |
| `unimplemented-css-property` | 306 |
| `unimplemented-css-at-rule` | 14 |
| `unimplemented-or-invalid-css-value` | 24 |
| `unimplemented-or-invalid-css-selector` | 29 |
| `unimplemented-or-invalid-media-query` | 22 |
| **Total** | **395** |

The 29 selector failures retain `AgentBrowserError`, code `unsupported`:
19 `Unsupported selector: :after`, eight `Unsupported selector: :before`,
and two `Unsupported selector: pseudo-elements`. Neither navigation suffered
a resource-limit failure.

## All decreases and largest increases

Exactly **23 completed calls change cost**: seven decreases save 1,100,808
work gross, and 16 increases add 1,232 work, yielding the net 1,099,576 saving.
The other **271 completed calls** have unchanged costs. Every changed call
still has identical ordered matches and specificity tuples.

All decreases, each returning zero matches in both builds:

| Call | Original selector | Baseline | Candidate | Saved |
| ---: | --- | ---: | ---: | ---: |
| 180 | `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | 958,911 | **217** | 958,694 |
| 178 | `[data-theme=light] :is(.baseline-indicator.discouraged,.baseline-indicator.removing)` | 71,195 | 218 | 70,977 |
| 179 | `[data-theme=dark] :is(.baseline-indicator.discouraged,.baseline-indicator.removing)` | 71,195 | 218 | 70,977 |
| 177 | `.baseline-indicator.discouraged,.baseline-indicator.removing` | 281 | 216 | 65 |
| 182 | `[data-theme=light] .baseline-indicator.removing` | 138 | 106 | 32 |
| 183 | `[data-theme=dark] .baseline-indicator.removing` | 138 | 106 | 32 |
| 181 | `.baseline-indicator.removing` | 136 | 105 | 31 |

Largest increases and representative remaining increases:

| Call | Original selector | Baseline | Candidate | Added |
| ---: | --- | ---: | ---: | ---: |
| 35 | `.icon.icon-deprecated,.icon.icon-experimental,.icon.icon-nonstandard` | 2,115 | 2,248 | 133 |
| 157 | `.content-section.article-footer` | 159 | 251 | 92 |
| 57 | `:is(.left-sidebar,.content-section) .icon.icon-baseline` | 14,562 | 14,642 | 80 |
| 58 | `:is(:is(.left-sidebar,.content-section) .icon.icon-baseline)~.icon` | 9,662 | 9,742 | 80 |
| 59 | `.discouraged:is(:is(.left-sidebar,.content-section) .icon.icon-baseline)` | 15,400 | 15,480 | 80 |
| 167 | `.baseline-indicator.high` | 124 | 195 | 71 |
| 171 | `.baseline-indicator.high *` | 2,802 | 2,873 | 71 |
| 184 | `.baseline-indicator.removing *` | 93 | 105 | 12 |

The complete increase list is preserved in `COMPARISON.json`: calls 57–64
each add 80, calls 167–171 each add 71, alongside calls 35, 157 and 184.
Both increases and decreases are included; costs are not presented as uniformly
lower. The earlier late-state improvement remains intact: call 323,
`:is(.footer__mozilla a):hover`, costs **4,323 in each build** and returns `[]`.
The full late-state list is retained in the comparison artifact.

The remaining largest cascade-selector costs are unchanged:

| Call | Original selector | Work, each build | Matches |
| ---: | --- | ---: | ---: |
| 20 | `[data-current-area=learn]:root *` | 289,655 | 0 |
| 299 | `:is(.breadcrumbs li) a` | 167,061 | 4 |
| 222 | `:is(.left-sidebar ol):not(:has(>li>details))>li` | 119,139 | 190 |
| 101 | `:is(.content-section h2,.content-section h3,.content-section h4,.content-section h5,.content-section h6) code` | 109,316 | 0 |
| 132 | `:is(.content-section .code-example,.content-section mdn-code-example,.content-section mdn-live-sample-result)+:is(.content-section .code-example,.content-section mdn-code-example,.content-section mdn-live-sample-result)` | 97,835 | 0 |

## Six separate post-cascade native queries

After each cascade/content measurement, the same native page API ran the six
authorized class/intersection queries. They introduced no extra requests or
`matchingSpecificities` calls. The original 10,000-result / 5,000,000-work
public-query bounds were unchanged. Exact counts and ordered IDs match across
builds and were independently derived from the retained node graphs.

| Public query | Count, each build | Ordered IDs | Work, each build |
| --- | ---: | --- | ---: |
| `.baseline-indicator` | 1 | `[1447]` | 34,829 |
| `.discouraged` | 36 | Full list below | 24,798 |
| `.removing` | 2 | `[2586,2833]` | 20,499 |
| `.baseline-indicator.discouraged` | 0 | `[]` | 34,864 |
| `.baseline-indicator.removing` | 0 | `[]` | 34,861 |
| `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | 0 | `[]` | **958,874** |

The `.discouraged` IDs are identical in both builds:

```json
[2281,2286,2291,2296,2301,2366,2375,2382,2403,2440,2446,2475,2494,2507,2517,2539,2544,2549,2601,2606,2639,2652,2669,2675,2693,2703,2784,2793,2799,2805,2843,2848,2859,2865,2982,3097]
```

Each individual class exists, but neither required same-element compound
exists. That remains independently verified evidence for the empty ancestor
alternatives rather than an assumption based only on global key presence.
The measured 958,911→217 reduction belongs specifically to the cascade's
`matchingSpecificities` call; **this pair shows no work reduction in the
separate public-query path** for the same selector.

These six queries cost **1,108,725 per run**, excluded from the main selector
and cascade totals. Cascade work stays 3,991,128 before/after these queries in
the baseline and 2,891,552 before/after in the candidate. Corresponding wrapped
call counts stay 323. No query cache, work counter, or limit was manually reset.

## Isolation, cleanup, and verification receipts

- Exactly one launch and two sequential fixture-only navigations. Each build
  has separate native module imports/constructors, session, transport, document,
  query engines and independently loaded fixture arrays. No page/session/cache
  state is reused across builds. The original wrapper descriptor is restored
  and baseline closure/settlement completes before candidate creation.
- The baseline's settled cleanup sample is **11:25:33.100Z**; candidate setup
  begins **11:25:33.101Z**. Both immediate and post-event-loop samples have
  pending loads zero. Both documents close to zero nodes and both observed query
  engines per build close. Sessions, transports, routes, cookies, storage and
  storage events close with zero active requests, pending storage events or
  cleanup errors. Empty private HOME/TMPDIR directories are removed.
- Inherited seccomp denies network/socket and io_uring syscalls. JS guards deny
  network access, native addons/SafeJS, subprocesses and workers. Guard attempts
  are zero; no security/socket self-probes were run. The child uses private
  directories, an explicit credential-free environment and non-TTY pipes.
- Supervisor bounds remain **30 seconds plus five seconds** termination grace;
  **6,291,456 bytes** per file and combined output; core limit zero. Session
  stylesheet allowance remains **24**, transport maximum requests **50**,
  cascade work **5,000,000**, and DOM limits **50,000 nodes / depth 256 /
  2,000,000 text code units**. The cascade query's default result limit remains
  50,000, versus the public query's 10,000. Full unchanged CSS/query/network and
  session limits are retained and compared in the result receipts.
- Exit is **0**; output is **17,622 bytes**, stderr empty. No timeout, cap breach,
  retry, fallback or raised limit occurred. The process group is absent after
  exit. Source/compiled before/after inventories, the full capture inventory,
  the prior pair inventory, and all pinned harness references are unchanged.
- Independent `verify.mjs` rehashes the build/capture pins; checks actual native
  assertion counts and selected files; compares all ordered result arrays,
  specificity tuples, errors and full node graphs; reproduces the six extra
  query ID lists from graph attributes/ancestry; recomputes work totals; and
  checks limits, guard attempts, sequential cleanup and artifact bounds. It
  also verifies this baseline exactly reproduces the previous candidate's
  complete call receipts and costs. Verification passed without another native
  import, child, request or navigation.

Evidence resides in `native-mdn-compound-availability-pair-september11/`:
`PREPARATION.json`, `GATE.json`, `PINS.json`, `PREFLIGHT.json`,
`INVOCATION.json`, `EXECUTION.json`, `INTEGRITY.json`, `COMPARISON.json`,
`VERIFICATION.json`, both `*-result.json` files, both full `*-calls.jsonl`
streams, both `*-document-1.json` graphs, before/after inventories, bounded
progress/output, and the harness sources. The separate new reference directory
holds only the candidate's compiled ledgers and pinning metadata; it does not
recompile or edit the validated implementation.

The two artifact directories contain **45 files / 5,906,531 bytes** before
this report. The largest individual artifact is a **586,022-byte** node graph.
The final evidence `RECEIPTS.sha256` fingerprint is
`26f5e1fd4cc5f34d04da96c91ac1fefe64b25c8e24c9000dcb5e1b853802e0c9`.
Only the authorized new artifact/reference directories and this report were
written. No source/test/`TASKS.md`, dependencies, protected historical files,
old evidence or commits were changed by this task. Concurrent parent changes
are outside this lane. The task stops after this single verified pair.
