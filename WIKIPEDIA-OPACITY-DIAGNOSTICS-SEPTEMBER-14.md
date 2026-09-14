# Wikipedia captured opacity diagnostic — September 14, 2026

**Native diagnostic completed; search geometry remains unsupported.** This is
one new observation of an existing portal capture, not a live request, new
capture, rendered search flow or current-availability claim.

## Runtime and scope

- Runtime commit: `39b55d996feb7af5320e3a1d575821743477b475`.
- Native interval: **13:51:28.935–13:51:29.302 UTC**, September 14, 2026.
- One native `loadBrowserDocument`, formatting inspection, cached diagnostic
  read, `#searchInput` query and geometry attempt; viewport 1,280×900.
- Zero wire requests, scripts, resource callbacks, raster operations, typing,
  clicks or submissions. No credentials, password providers, passkeys, devices,
  real terminal or SafeJS runtime were exercised. This is not BrowserSession
  navigation. Only this browser interpreted the captured page.
- Unchanged original body: 119,573 bytes, SHA-256
  `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
  The body and adjacent receipt retain their original paths under
  `node_modules/.cache/native-validation/native-wikipedia-form-flow-september13/`.

The audited runtime comes from `opacity-september14/release01`: 23,757 native
passes, zero failures and two unchanged exclusions, with build, strict checks
and formatting passing. Its audit distinguishes 23,514 unchanged baseline case
occurrences, one explicit opacity-to-filter unsupported-fixture migration and
244 new passing cases. Identical-source supplemental controls contribute 264
distinct existing cases, giving 24,021 unique passing occurrences. See OPACITY.md
for implementation, tests, restrictions and retained earlier failures. These
tests were rehashed, not rerun during this captured observation. All 2,925 source
and 2,200 compiled files were checked. Pre-existing dirty work is excluded.

## Actual comparison

The comparison baseline is the **13:13:00.256–13:13:00.631 UTC** observation on
`6e95ddc`, recorded in WIKIPEDIA-WORD-SPACING-DIAGNOSTICS-SEPTEMBER-14.md.
That historical report and its original measurements remain unchanged.

| Measurement | Previous captured diagnostic | This observation |
| --- | ---: | ---: |
| Overlapping formatting issue occurrences | 137 | 131 |
| Applicable unsupported CSS-property occurrences | 63 | 57 |
| Applicable invalid/unsupported CSS-value occurrences | 2 | 2 |
| DOM nodes before closure | 2,708 | 2,708 |
| Formatting boxes | 2,250 | 2,250 |
| Formatting work | 20,977 | 20,977 |
| Cascade builds | 2 | 2 |
| Style work | 372,668 | 372,690 |
| Generated-content work | 8,532 | 8,532 |
| Bounded diagnostic samples | 107 | 97 |
| Omitted sample occurrences | 0 | 0 |
| Samples containing a truncated field | 7 | 7 |
| Search-input geometry supported | No | No |

These are diagnostic counters, not unique defects or a speed benchmark. Both
sample sets remain explicitly non-exhaustive. The cached diagnostic read leaves
style metrics unchanged; document revision 2,712 is stable. The disappearance of
sampled opacity issues is consistent with the committed implementation, whose
synthetic tests establish actual group compositing, nested isolation, pixels,
stacking, clipping and genuine zero-opacity click dispatch. Diagnostic removal
alone would not prove rendered website compatibility.

Search input **e239** is found and has a formatting node. Its geometry is still
`unsupported` because width resolution requires an issue-free supported
formatting profile. The reported blocking profile includes two invalid-value
occurrences, one CSS at-rule, 57 unsupported properties, eight selectors, one
element-layout issue, 22 direction issues and one overflow issue. Other recorded
formatting categories remain unchanged.

The two applicable value samples still include the layered background
`linear-gradient(transparent,transparent),url(portal/wikipedia.org/assets/img/sprite-e49fbf32.svg)`
and `clip-path:inset(50%)!important`. Appearance, direction and other actual gaps
remain. No sprite is acquired, no raster is produced and no usable search flow
is demonstrated. Both native owners close cleanly; retained nodes fall to zero.

## Isolation and verification

The scoped captured diagnostic retains the corrected prior workload and guards:
kernel network denial, process/worker/addon restrictions, pipe-only stdio,
private HOME/TMP, bounded output/time, pinned fixture and audited runtime. Its
tab identifier changes; preparation checks authorization and workload identity
before reporting readiness. The user instruction to continue testing is scoped
in the lane's authorization record, not treated as proof of other acceptance
gates.

The child exits zero without timeout or output cap. All 12 verifier checks pass,
including owner cleanup, absent process group, private-directory cleanup,
framework/runtime integrity and preserved repository state. The independent
parent metadata/hash audit also passes. All **33 original evidence entries**
match; the final seal covers **36 entries**. There is no repeated sealing failure
in this lane. The previous word-spacing lane's stale original stdout seal and
explicit correction remain historical facts, not silently rewritten evidence.

- Original lane: `/dev/shm/agent-browser-wikipedia-opacity-september14/`.
- Byte-identical durable copy:
  `node_modules/.cache/native-validation/wikipedia-opacity-september14/`.
- Result SHA-256:
  `e5cbede8ff4c434c627e507b332756c000481a2edee8cbbbb6ae24fffa9053bd`.
- Observation SHA-256:
  `b613f7a46d16af2bd578908cbe08064199a031b1ac392a3c89b376164515ea8e`.
- Final evidence SHA-256:
  `2d1aee6ebae0e4f4e2f841d159db12b969ef3525085c1bb3ccf93c5369a22e14`.

At 13:56:43.617 UTC, all 37 then-existing regular files, totaling 1,383,240
bytes, were copied and compared byte-for-byte. PERSISTENCE.json records the
copy, not a second execution. Source bodies and original receipts are unchanged.

## Remaining work

Broaden checks to other captured hosts and implement genuine rendering fixes
for remaining gaps rather than suppressing unsupported guards. New live-site
coverage, the original research topics, provider/passkey/device acceptance,
SafeJS probes and challenge-handling validation remain separate open work.
The overall browser goal remains active.
