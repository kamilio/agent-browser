# MDN selector-test-order: paired offline evidence

## Outcome — September 11, 2026

One authorized native child performed exactly two sequential fixture-only initial
navigations: immutable logical-availability baseline, then selector-test-order
candidate. Both navigations and bounded native content extraction succeeded.
Independent file-only verification passed. All **323 corresponding selector
calls** preserved original selector order, ordered node IDs, exact specificity
tuples, and error categories/messages. This is not merely match-count equality.

| Measured quantity | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Completed `matchingSpecificities` calls | 294 | 294 | 0 |
| Recoverable unsupported-selector calls | 29 | 29 | 0 |
| Completed selector work, all 294 calls | 3,692,716 | 2,893,772 | 798,944 (21.64%) |
| Completed cascade work | 4,790,072 | 3,991,128 | 798,944 (16.68%) |
| Cascade work outside completed selector calls | 1,097,356 | 1,097,356 | 0 |
| Exact fixture responses served | 19 | 19 | 0 |
| Encoded wire bytes | 0 | 0 | 0 |

These are charged-work comparisons, **not wall-clock speedup measurements**.
No click, second-page navigation, layout/rendering acceptance, live website,
socket, real TTY/PTY, SafeJS, credentials, or alternate browser was exercised.
The historical live run's initial navigation success is not a live-click pass;
this pair supplies no evidence that its subsequent click failure improved.

## Scope, gate, and immutable inputs

All cache paths below are relative to `node_modules/.cache/native-validation/`:

- New evidence lane: `native-mdn-selector-test-order-pair-september11/`.
- New compiled-reference ledger directory: `native-selector-test-order-compiled-september11/`.
- Baseline build: `native-logical-availability-september11-round01/snapshot01/`.
- Candidate build: `native-selector-test-order-september11-round01/snapshot01/`.
- Exact authorized captures: `native-mdn-logical-availability-live-september11/`.

The parent SUMMARY finished at **2026-09-11T11:01:57.618Z**. Before launch,
the harness independently checked build/strict/format/native terminal exit 0,
stable inputs, **6,765 passed / 0 failed / 1 excluded**, 112 selected files all
listed in the snapshot's native manifest, and 111 strict roots. The baseline
likewise verified **6,737 passed / 0 failed / 1 excluded**, 112 selected files,
111 strict roots. Both snapshots contain exactly **1,006 source files and 1,788
compiled files**. The one pre-existing skipped assertion is:

`exposes the separate total host-object ceiling without claiming full-pool runtime capacity`

The paired child's supervised interval was
**2026-09-11T11:11:31.598Z–2026-09-11T11:11:32.350Z**, after the gate.
No native child was launched while parent validation was pending. A preparatory
path-normalization assertion was corrected before pinning or native launch;
there was no native retry, recompile, raised cap, or fallback.

SHA-256 fingerprints:

| Input | Baseline | Candidate |
| --- | --- | --- |
| Validation SUMMARY | `980dd74105d0b215a208d1c0f48f9bb4f0750873c8ee4c5b8e063a5d5f5ce22e` | `4bcb1acc834e61818a6954bcce586287351f10c0050977033cfe83be172a0b9f` |
| Source ledger | `d284dbd69e929c432dcdc60f65c9b3b910a99be7adaae32645f319dd1ade42d4` | `e82598eaa407d9a3a76d3f0d740e914311af2b339d08c786c374a77dccd09b68` |
| Compiled ledger | `ee2177cd3f8f516b3ba917564d5ecf22557773d65a8d9a0fa2055d70e2f942d1` | `4f3635ffa96f8cc26ed908917885e39a7d1609fee689359b06de2dee851afebe` |

All **45 capture receipt entries** and all **19 bodies** were verified before
launch and independently afterward. Bodies total **270,288 decoded bytes**:
one document and 18 stylesheet responses. Capture report SHA-256 is
`70282aae6f120fde8496eec654f82f67113efbc42a066060eac138b60beec68c`;
capture receipt-ledger SHA-256 is
`ed77967316f8cbc26b5b1a3def9613ebd23ee817f00dbfd6806c579bd4c55c49`.
Each replay required the original request/response URL, order, status, full
recorded headers, and exact decoded body. Both served all 19 original HTTP-200
responses through native fixture routes with zero wire bytes. Historical wire
timings/byte measurements were not repurposed as new live evidence.

## Exact correctness and native content

Public `DocumentQueries.prototype.matchingSpecificities` wrappers called the
original methods with unchanged arguments and recorded every call. Completed
receipts retain full ordered `[nodeId, [a, b, c]]` specificity arrays plus a
SHA-256 digest; failed receipts retain exact error categories/messages and
exclude stale `lastWork` from completed costs. No compiled implementation was
edited. Each original descriptor was restored before the next build started.

Across 294 completed calls there are **12,450 result rows**, including **172
nonempty calls**. All rows and all 29 errors compare exactly. Both full captured
native node graphs also compare exactly, binding numerical IDs to the same
document rather than assuming ID correspondence. Their shared SHA-256 is
`576b8b3bfdbc28c0c76deff34edd9d4836af3e05000a85c85b5a6b7affc204d4`.
For example, call 299, `:is(.breadcrumbs li) a`, returned in both runs:

```json
[[1090,[0,1,2]],[1099,[0,1,2]],[1108,[0,1,2]],[1117,[0,1,2]]]
```

Both native pages have 2,731 nodes, one `main`, title
`Document: querySelector() method - Web APIs | MDN`, and main heading
`Document: querySelector() method` at `e1444`. The ordered 15 extracted headings
and 6,469-character main text are identical. Extraction retained the original
12,000-code-unit text bound, 20-heading bound, and 512-code-unit heading bound.

Both completed one cascade build with 18 external sheets, 591 rules, 1,446
declarations, and 84,329 CSS code units. Loader, navigation, and final style
snapshots report the same per-run work; they are not added together. All five
CSS issue counts remain exactly unchanged, **395 total**, and styles remain
explicitly partial:

| CSS issue | Each run |
| --- | ---: |
| `unimplemented-css-property` | 306 |
| `unimplemented-css-at-rule` | 14 |
| `unimplemented-or-invalid-css-value` | 24 |
| `unimplemented-or-invalid-css-selector` | 29 |
| `unimplemented-or-invalid-media-query` | 22 |

The 29 selector errors are `AgentBrowserError`, code `unsupported`: 19
`Unsupported selector: :after`, eight `Unsupported selector: :before`, and two
`Unsupported selector: pseudo-elements`. No resource-limit failure occurred.

## Changed costs and residual bottlenecks

The largest reductions are late-state predicates; all calls below returned
empty ordered result arrays in both builds:

| Call | Original selector | Baseline work | Candidate work | Saved work |
| ---: | --- | ---: | ---: | ---: |
| 323 | `:is(.footer__mozilla a):hover` | 126,872 | 4,323 | 122,549 |
| 310 | `:is(.footer__socials a):hover` | 126,836 | 4,323 | 122,513 |
| 106 | `:is(.content-section a):visited` | 118,156 | 4,323 | 113,833 |
| 209 | `:is(.reference-toc a):hover:not([aria-current=true])` | 117,950 | 4,323 | 113,627 |
| 318 | `:is(.footer__links a):hover` | 116,964 | 4,321 | 112,643 |
| 248 | `:is(.a11y-menu a):focus-within` | 102,056 | 4,317 | 97,739 |
| 235 | `:is(.left-sidebar a):hover` | 84,089 | 4,320 | 79,769 |
| 227 | `:is(:is(.left-sidebar details) summary):hover` | 22,473 | 4,336 | 18,137 |
| 228 | `:is(:is(.left-sidebar details) summary):hover:has(a:hover)` | 22,480 | 4,343 | 18,137 |

Three small regressions are preserved, not omitted: call 79,
`:is(.prev-next a):visited`, increases 12→13; calls 151 and 152, the nested
specifications-list summary `:hover` and `:hover:has(a:hover)` selectors,
increase 45→46 each. Thus nine reductions and three +1 changes produce the
net 798,944 saving; the other 282 completed calls have unchanged cost.
Full original strings and costs, including late predicates, are retained in
`COMPARISON.json` and the call receipts.

Largest remaining completed selector calls:

| Call | Original selector | Work in both builds | Matches |
| ---: | --- | ---: | ---: |
| 180 | `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | **958,911** | 0 |
| 20 | `[data-current-area=learn]:root *` | 289,655 | 0 |
| 299 | `:is(.breadcrumbs li) a` | 167,061 | 4 |
| 222 | `:is(.left-sidebar ol):not(:has(>li>details))>li` | 119,139 | 190 |
| 101 | `:is(.content-section h2,.content-section h3,.content-section h4,.content-section h5,.content-section h6) code` | 109,316 | 0 |

## Authorized post-cascade intersection queries

After each cascade/content measurement, the same native page query API ran
the six authorized extra queries. These issued **no requests or additional
`matchingSpecificities` calls**. Their work is kept separate from both main
totals. All counts and ordered IDs match across builds and were independently
recomputed from the retained native node graphs without another browser run.

| Query | Count in each run | Ordered IDs | Separate query work, each run |
| --- | ---: | --- | ---: |
| `.baseline-indicator` | 1 | `[1447]` | 34,829 |
| `.discouraged` | 36 | Full list below | 24,798 |
| `.removing` | 2 | `[2586,2833]` | 20,499 |
| `.baseline-indicator.discouraged` | 0 | `[]` | 34,864 |
| `.baseline-indicator.removing` | 0 | `[]` | 34,861 |
| `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | 0 | `[]` | 958,874 |

The `.discouraged` IDs in both builds are:

```json
[2281,2286,2291,2296,2301,2366,2375,2382,2403,2440,2446,2475,2494,2507,2517,2539,2544,2549,2601,2606,2639,2652,2669,2675,2693,2703,2784,2793,2799,2805,2843,2848,2859,2865,2982,3097]
```

The six extra queries total **1,108,725 work in each run**, excluded from the
cascade/selector comparison. The standalone full-selector cost, 958,874, is
not substituted for its cascade-call cost, 958,911: these use different native
query engines and operation/cache contexts. The public page API retained its
10,000-result bound and 5,000,000-work bound; no counter or limit was reset.

**Supported inference, not an implemented optimization:** each individual
class key exists somewhere, but both required same-element class intersections
are empty. Therefore a sound per-compound key-intersection availability check,
applied to both alternatives inside this logical ancestor selector, could
prove those alternatives impossible before walking descendant ancestry. This
fixture supports that specific optimization target; an individual-key-presence
test cannot prove the same absence. The pair does not measure that proposed
optimization's overhead, saved work, correctness on other documents, or any
live-click improvement. No implementation changes were made here.

## Bounds, isolation, cleanup, and receipts

- One launch lock and one native child; two separate build imports and native
  selector constructors, separate sessions/transports/documents/engines, and
  independently loaded fixture arrays. The baseline closed and settled before
  candidate creation. No engine, session, query cache, cookies, or page state
  was reused across builds.
- The child inherited seccomp network/socket and io_uring denial, plus JS
  network, native-addon/SafeJS, subprocess, and worker guards. Guard attempts
  were zero. No socket/security self-probes were performed.
- Supervisor limit: 30 seconds plus five-second termination grace; 6,291,456
  bytes per artifact and combined stdout/stderr; core limit zero. Private clean
  HOME/TMPDIR and a whitelist environment excluded credentials. No TTY/PTY.
- Session stylesheet allowance stayed 24; transport request ceiling stayed 50.
  Cascade work stayed 5,000,000; DOM limits stayed 50,000 nodes / depth 256 /
  2,000,000 text code units. Cascade query result allowance stayed at its native
  default 50,000; public page query allowance stayed 10,000. All other original
  CSS/query/network limits are recorded and equal across builds in the receipts.
- Both immediate and post-event-loop cleanup samples show pending loads zero.
  Each run closed its document to zero nodes and both observed query engines;
  session, transport, routes, cookies, storage, and storage events closed, with
  zero active requests, pending storage events, or cleanup errors. Both wrapper
  descriptors were restored. Clean HOME/TMPDIR were empty and removed.
- Child exit was 0, stderr was empty, output was 10,284 bytes, no timeout/cap
  breach occurred, and its process group was absent after exit. Baseline and
  candidate source/compiled before/after inventories, the complete capture
  inventory, and pinned runner references all remained unchanged.
- The two new artifact directories occupy 5,851,223 bytes before this report;
  the largest individual artifact is a 586,022-byte native node graph. No
  historical fixture/evidence files were modified or protected historical
  fixtures read. No source, test, `TASKS.md`, dependency, or commit changes were
  made by this task; concurrent parent changes are outside this lane.

The new lane contains `PINS.json`, `PREFLIGHT.json`, `INVOCATION.json`,
`EXECUTION.json`, `INTEGRITY.json`, `COMPARISON.json`, `VERIFICATION.json`,
`baseline-result.json`, `candidate-result.json`, both full `*-calls.jsonl`
streams, both `*-document-1.json` graphs, before/after inventories, bounded
progress/output, and the exact harness sources. `verify.mjs` is an independent
file-only verifier: it rehashes every pinned build/capture input, compares
complete corresponding result arrays/errors and native graphs, recomputes all
six extra query ID lists from graph attributes/ancestry, recomputes totals, and
checks guards, unchanged limits, sequential cleanup, and artifact bounds.

The evidence lane's final `RECEIPTS.sha256` fingerprint is
`fcc63b821bb4e3b428e1bd169a9e7e8c88ee3931b3164d56bc5bfdfccf167bf3`.
The verifier completed successfully after the single pair. This assignment stops
here; follow-up runs use a new, separately scoped evidence lane under the user's
existing authorization.
