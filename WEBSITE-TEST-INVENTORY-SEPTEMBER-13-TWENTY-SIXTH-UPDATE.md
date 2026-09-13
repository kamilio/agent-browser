# Website test inventory — September 13, twenty-sixth update

**Generated block clearance now has real geometry and raster regressions.
The selected native run has 19,803 passes, zero failures and two unchanged
skips. Python website completion and the overall browser/research goal remain
OPEN.** This continues the twenty-fifth inventory without rewriting its
historical measurements or substituting native unit tests for website checks.
Cache paths below are relative to `node_modules/.cache/native-validation/`.

## New live resource capture

Exactly one new native GET in this work: `https://docs.python.org/3/_static/basic.css`.
HTTP 200, `text/css`, 14,685 decoded bytes / 3,390 encoded bytes, received at
`2026-09-13T15:03:52.901Z`. Source SHA-256:
`656ff1bacd6f260fc7d71b97f9c2f1fcbf692dc84bf469cd952034efcb9eefed`.
No redirects, retries, linked-resource requests or credential access. This is
an exact CSS import observed during native homepage loading, not a new website
or a fresh complete-page capture. Header-only stop checks found no challenge,
429 or Retry-After signal; this is not semantic interpretation of the CSS.

The capture uses the prior audited native reader-ID runtime, not the later
clearance candidate. Its complete source/compiled inventories, native owners,
private-directory cleanup and process group are verified. All 32 repository-
relative evidence digests were independently rechecked by the parent.
Lane: `native-python-basic-css-september13/`; digest ledger SHA-256:
`3872ca69a9f508d9f8ec46c30096b1ad7ce5a5180ba7bb3969d60230724ec58f`.
Full report: `PYTHON-BASIC-CSS-CAPTURE-SEPTEMBER-13.md`.

## Exact offline resource set

The complete-asset replay uses these eight captured responses through native
`NodeNetworkTransport.requestWithRoutes`, with no wire traffic. The mixed
September 11/13 provenance is explicit; none of the older responses is called
a fresh September 13 download. The native import loader applies the actual CSS
bytes, without stylesheet rewriting or diagnostic suppression.

| Exact URL | Original capture date |
| --- | --- |
| `https://docs.python.org/3/` | September 11, 2026 |
| `https://docs.python.org/3/_static/pygments.css?v=b86133f3` | September 11, 2026 |
| `https://docs.python.org/3/_static/classic.css?v=234b1a7c` | September 11, 2026 |
| `https://docs.python.org/3/_static/basic.css` | September 13, 2026 |
| `https://docs.python.org/3/_static/pydoctheme.css?v=4365c8fe` | September 11, 2026 |
| `https://docs.python.org/3/_static/pygments_dark.css?v=0fc419ee` | September 11, 2026 |
| `https://docs.python.org/3/_static/pydoctheme_dark.css` | September 11, 2026 |
| `https://docs.python.org/3/_static/py.svg` | September 11, 2026 |

The target is the actually discovered Tutorial anchor, `e375`, pointing to
`https://docs.python.org/3/tutorial/index.html`. A real `Session.click` invokes
the native actionability/layout gate; there is no direct navigation fallback.
The previous turn's separately captured tutorial index remains direct-content
coverage only, not proof that this homepage interaction works.

## Complete-asset before/after observations

The baseline uses `native-reader-id-contract-september13-round01/snapshot01/dist`
at `2026-09-13T15:12:46.754Z`–`15:12:46.869Z`; the after-proof uses the audited
clearance candidate at `2026-09-13T15:17:46.522Z`–`15:17:46.637Z`. Both phases
accept all eight exact fixtures once, totaling 72,064 decoded bytes, with zero
wire requests, retries, denied requests or Tutorial destination requests.

| Native observation | Before | After |
| --- | --- | --- |
| Actual Tutorial clicks | 1 | 1 |
| Click outcome | Fails at layout gate | Still fails at layout gate |
| Diagnostic execution | Exit 0, complete | Exit 0, complete |
| DOM nodes / revision | 853 / 860 | 853 / 860 |
| Formatting boxes / visited DOM nodes | 669 / 576 | 669 / 576 |
| Formatting work / text units / deferred subtrees | 8,294 / 4,074 / 9 | 8,294 / 4,074 / 9 |
| Two empty visible `ul::after` blocks | Present | Present |
| Computed display / position / clear | block / static / both | Unchanged |
| Emitted physical-clear metadata | Absent on both | `both` on both |
| Generated-clear unsupported issues | 2 | 0 |
| Raw ordinary float-coordinator clear markers | 1 | 3 |

The actual owners are `e269` and `e745`, with generated formatting IDs 70 and
622, parent IDs 9 and 561. They retain no DOM or independent action reference;
both contents are empty. This is applicable block clearance, not merely an
inapplicable-clear declaration being ignored. The two additional ordinary clear
markers account for these boxes through the existing float coordinator. They
remain inspectable in raw formatting output and are not new errors in the
actual downstream click exception.

The after click still reports `css:unimplemented-css-property` (9),
`css:unimplemented-or-invalid-css-value` (3),
`inline-vertical-align-not-supported` (2), `position-layout-not-supported` (1)
and `overflow-layout-not-supported` (1). Native style observations identify
sticky sidebar `e607` and overflow-hidden/auto wrapper `e609`. Raw formatting
also retains eight float and nine display coordination markers; not every raw
marker is independently demonstrated fatal by the actual click result.

The missing-import diagnostics disappear only when the captured CSS is actually
loaded. Comparing the earlier seven-resource replay to this complete set is
not a code-only comparison: CSS-property diagnostics rise from 5 to 9 and the
actual formatting changes with the imported stylesheet. The clearance
before/after comparison, in contrast, uses byte-identical fixture inputs and
the same native diagnostic probe. No source, stylesheet, selector or error is
rewritten to force an interaction through.

Complete source/compiled pins match each phase's separate audit. Both supervisor
processes exit zero with empty stderr, closed owners, removed empty private
HOME/TMP and absent process groups, within 30-second/5-second-grace and 10MiB
stream/file limits. No additional geometry or raster probe is performed on
this page. Real clearance geometry and pixels are proven only by the separate
native fixtures, not by removal of one page diagnostic.

Lanes: `native-python-complete-assets-september13-before/` and
`native-python-complete-assets-september13-after/`. The after lane intentionally
retains the reused `before-` receipt filename prefix; the distinct directory,
runtime pins and timestamps identify its true phase. Full comparative report:
`PYTHON-GENERATED-CLEAR-REPLAY-SEPTEMBER-13.md`.

The parent independently rechecks every digest after worker sealing. The after
whitelist also binds the comparative report, source fixtures, prior evidence
and audit receipts; neither manifest includes itself.

| Phase | Verified digest entries | Digest ledger SHA-256 |
| --- | ---: | --- |
| Baseline | 95 | `d74738117346eaf4f2dccba15451c96496ace1a79afb7f76ae6d3f37a56d910d` |
| After | 185 | `aac3e0ba16c987f5609c94ce20788cd5f689dc7334062e8d2ccf08d3d8ad288b` |

The comparative report SHA-256 is
`32f9a7c663ffee35254a5821a0001d61be20faf5f52aa1dc7a7a4e89f73a9ac5`.

## Preserved earlier attempts

The first current-runtime replay ends at a harness assertion at
`2026-09-13T14:54:52.805Z`: native headers use a null-prototype object while the
JSON fixture has an ordinary prototype. One response was routed, but the
adapter assertion failed before DOM discovery or any click. This is not a
website failure. Correcting only the header-entry comparison gives a separate
observation at `2026-09-13T14:55:33.826Z`, not overwritten evidence.

That second attempt accepts seven retained responses and denies an eighth
attempt for the previously uncaptured `basic.css` import **before transport**.
It is an unanticipated CSS request, not the planned potential Tutorial request,
not an authorized/fetched resource and not a server rejection. The actual
Tutorial click fails at the layout gate; two import diagnostics and independent
CSS/layout issues remain in that original receipt. Both attempts have zero HTTP,
stable complete inventories, closed owners, removed empty private HOME/TMP and
absent process groups. A successful diagnostic exit is not a successful click.

| Preserved lane | Exit / outcome | 24-file digest ledger SHA-256 |
| --- | --- | --- |
| `native-python-current-click-september13/` | 1; harness-only failure | `ec52d6309c5362a89ffc10e1a7aab8ea90ef4bcc1d7f12e6cac58318fd42fce1` |
| `native-python-current-click-september13-round01/` | 0; observation succeeds, click fails | `37fcca284107131714ab6423231d4fd6036d190da42e0387b94e0f659edb9819` |

## Clearance implementation and native tests

The formatting builder now retains physical clearance on supported static or
relative generated block/flow-root boxes and accounts for it in the existing
float coordinator. Empty clearfixes affect real owner/sibling geometry; hidden
paint does not remove layout. Inline, inline-block and out-of-flow clear remain
inapplicable no-ops. Generated floats, logical block clearance, unsupported
generated flex/Grid/table, sticky and overflow stay explicitly guarded.

The 38 new regressions cover all three physical sides, before/after boxes,
opposite-side no-ops, empty and hidden boxes, ordinary-element parity, margins,
independent float contexts, relative positioning, mutation invalidation, limits,
actual pixels and origin hit targets without adding DOM/control references.
No new dependency or coordinator rewrite is added.

| Selected focused phase | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Initial unchanged implementation | 471 | 30 | 0 |
| Initial candidate | 500 | 1 | 0 |
| Unchanged implementation, final identical tests | 471 | 30 | 0 |
| Final candidate | 501 | 0 | 0 |

Every focused failure is in the new suite. The initial candidate's single
failure is a new test's incorrect undefined-glyph-reference expectation after
its geometry and pixels already passed; the existing native sentinel is an
empty string. Correcting that assertion preserves all real geometry checks and
all failed receipts. The final before/after test files are byte-identical.

Full candidate: `native-generated-clear-september13-round00/`, run from
`2026-09-13T15:08:08.286Z` to `2026-09-13T15:12:40.595Z`.
19,803 passed / zero failed / two unchanged skipped; 384 selected suites,
383 strict roots, 749 committed-manifest entries, 365 unselected. Build, strict,
format, native runner and audit all exit zero. The audit verifies 1,290 source
inputs, 2,124 compiled files and 1,285 unchanged tracked inputs against base
`ea00b5b71952efeae0f7467e3c3280b9dc7471bb`. Unrelated dirty work is not bundled
or represented as validated by this pinned snapshot.

| Full candidate evidence | SHA-256 |
| --- | --- |
| Source inventory | `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619` |
| Compiled inventory | `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9` |
| Native results | `91b9449961cf45aba9163eab061cdb3c0a34b8e3f3532b56144f77667395b118` |
| Summary | `ddef7649ac4b54413cd57120665c47b2b041e996048404ee5b11f74e0d38afd0` |

`allExecutedTestsPassed` and `selectedRunSuccessful` are true;
`allSelectedTestsPassed` is false because the existing host-object-ceiling and
unsupported-display media tests remain skipped. Focused evidence remains in
`python-layout-work-september13/`; its 68-entry `FOCUSED.sha256` digest is
`bc529f24f1b0159f97ecb5fbae0949887b7b0087b074f0fe711e408ab96e5418`.
Implementation details and limits: `GENERATED-CONTENT-CLEAR.md`.

## Remaining gates

No broad website-rendering, script, image-decoding, performance or research
completion claim follows from these tests. Credentials, passkey devices,
real TTY/PTY, sockets and SafeJS keep separate acceptance gates. No secrets,
fingerprint spoofing, challenge solving or push occurs in this work.

No new retrieval for the four original research topics occurs here. Preserve
the hardware/configuration and benchmark-methodology evidence and historical
Astra chatter sample; do not replace them with later blocked attempts. The
verified Reddit/Poe opinion gap remains open, as recorded in
`RESEARCH-STATUS-SEPTEMBER-13.md`. The overall browser objective stays ACTIVE.
