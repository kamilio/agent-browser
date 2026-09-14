# Wikipedia captured word-spacing diagnostic — September 14, 2026

**Native diagnostic completed; search geometry remains unsupported.** This is
one new observation of the original portal capture, not a live request, new
capture, search-flow success or current-availability claim.

## Runtime and scope

- Runtime commit: `6e95ddcdfe53dfc3ec952de9c8c81fce9c54a7a6`.
- Native interval: **13:13:00.256–13:13:00.631 UTC**, September 14, 2026.
- One `loadBrowserDocument`, formatting inspection, cached diagnostic read,
  `#searchInput` query and geometry attempt; viewport 1,280×900.
- Zero wire requests, scripts, resource callbacks, raster operations, typing,
  clicks or submissions. This is not BrowserSession navigation. No credentials,
  providers, passkeys, devices, real terminal or SafeJS runtime were exercised.
- Original body: 119,573 bytes, SHA-256
  `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
  Its original receipt remains adjacent under
  `node_modules/.cache/native-validation/native-wikipedia-form-flow-september13/`.
  Neither original fixture was changed. Only this browser interpreted the page.

The runtime comes from `word-spacing-september14/release02`, with the completed
23,513-pass / two-exclusion native gate and identical-source supplemental control
coverage documented in WORD-SPACING.md. Those tests were rehashed, not rerun for
this observation. All 2,914 source and 2,196 compiled files were rechecked, and
1,378 committed runtime source files match. Pre-existing dirty work is excluded.

## Actual comparison

The comparison baseline is the **12:25:23.897–12:25:24.219 UTC** captured
observation on `b5d2efd`, documented in
WIKIPEDIA-BACKGROUND-DIAGNOSTICS-SEPTEMBER-14.md. That report remains unchanged.

| Measurement | Previous captured diagnostic | This observation |
| --- | ---: | ---: |
| Overlapping formatting issue occurrences | 138 | 137 |
| Applicable unsupported CSS-property occurrences | 64 | 63 |
| Applicable invalid/unsupported CSS-value occurrences | 2 | 2 |
| DOM nodes before closure | 2,708 | 2,708 |
| Formatting boxes | 2,250 | 2,250 |
| Formatting work | 20,977 | 20,977 |
| Cascade builds | 2 | 2 |
| Style work | 372,664 | 372,668 |
| Generated-content work | 8,500 | 8,532 |
| Bounded diagnostic samples | 109 | 107 |
| Omitted sample occurrences | 0 | 0 |
| Samples containing a truncated field | 7 | 7 |
| Search-input geometry supported | No | No |

These are diagnostic counters, not unique defects or a performance benchmark.
Both diagnostic sets remain explicitly non-exhaustive. The cached diagnostic
read changes no style metrics, and the document revision stays stable.

The prior sampled `word-spacing:-4px` unsupported-property issue is absent from
the new sample set, consistent with the committed implementation. Synthetic
layout, range, hit, pixel and control tests establish that implementation does
real spacing work; disappearance of a diagnostic alone would not prove it.
The captured page still cannot reach supported search geometry, so this run
does not demonstrate a rendered or interactive Wikipedia search field.

Input **e239** is found and has a formatting node, but the geometry call returns
`unsupported` because the supported formatting profile is not issue-free.
The two remaining applicable value samples are the layered `background-image`
and `clip-path:inset(50%)!important`. Other real gaps include `appearance:none`,
opacity including fractional values, direction and overflow. No sprite bytes
are acquired and no missing-image pixels are tested. Both native owners close
cleanly, reducing the document's retained node count to zero.

## Preserved harness and sealing failures

The initial lane, `agent-browser-wikipedia-word-spacing-september14`, completed
metadata preparation but failed its workload identity assertion before a child
process, run lock or browser load. A baseline-path update had left an older
tab-ID substitution in the comparison. This is a harness mistake, not a website
authorization barrier. Its failure, approval, seals and output remain intact.

A separately prepared `agent-browser-wikipedia-word-spacing-retest-september14`
lane corrects that expected identity mapping and performs the single observation
reported here. Kernel network denial, process/worker/addon guards, pipe-only
stdio, private HOME/TMP, limits, fixture/runtime pins and the workload remain;
the tab identifier changes. The verifier passes all 12 checks, including owner,
process-group, private-directory, source, framework and dirty-work checks.

The parent also caught a sealing-order mistake: redirected `verify.stdout` was
hashed while empty, then received the final verifier record. The original
`EVIDENCE.sha256` therefore has exactly one known stale entry. It is not silently
called valid or rewritten. The parent validates the final stdout against the
verifier JSON and original seal, rehashes every other entry, and creates
`FINAL-EVIDENCE.sha256` after output closure. See `SEALING-NOTE.md` and
`PARENT-VERIFICATION.json`. No browser or verifier is rerun for that correction.

## Durable evidence

Original execution/preparation lanes remain under `/dev/shm/` with the names
above. Byte-verified copies are retained at:

- `node_modules/.cache/native-validation/wikipedia-word-spacing-september14/`:
  24 copied files / 1,201,792 bytes, plus persistence receipt; failed pre-execution
  attempt, not a browser observation.
- `node_modules/.cache/native-validation/wikipedia-word-spacing-retest-september14/`:
  43 copied files / 1,382,840 bytes, plus persistence receipt; successful
  diagnostic with unsupported geometry. Its final seal covers 42 entries.

Persistence is copying and verification, not another execution. Historical
paths, measurements and failures remain unchanged. No new host or live traffic
is added. The overall browser goal and wider website, research, credential,
passkey, challenge and device acceptance gates remain open.
