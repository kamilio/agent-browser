# Website evidence — September 13, 2026, tenth update

This supplements the ninth update without replacing any previous evidence.
The Wikipedia lane makes no new HTTP request: it executes the native browser
against the unchanged captured portal after the real rich-button correction.
This is not a successful full-page rendering or interactive search test.

## Wikipedia: genuine rich-button children

At 08:33:21.905–08:33:22.198 UTC, one separately sealed offline native load uses
the same 119,573-byte portal body, SHA256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
Runtime: audited 18,046/base `cd906c3`, not root dist or another browser engine.

Three bounded queries, one formatting inspection and one geometry request run.
The DOM remains at 2,708 nodes/revision 2,712. The actual rich submit button
`e522` now has its own native button-layout formatting node and retains child
`e524`. Its children are not flattened into a software-control caption. The
search input remains underneath the genuine fieldset outer/content owner.

| Observation | Historical 17,962 tree | Fresh 18,046 tree |
| --- | ---: | ---: |
| Visited DOM nodes | 2,110 | 2,114 |
| Formatting boxes | 2,234 | 2,238 |
| Formatting text code units | 4,997 | 5,005 |
| Counted work | 16,670 | 16,700 |
| Deferred subtrees | 2 | 1 |
| Real rich-button child retained | no | yes |

The button leaves the deferred list; only logo image `e51` remains there.
Actual child traversal also reveals one more unsupported inline vertical
alignment: 31→32. Other issue counts remain unchanged. These counters are not
performance benchmarks, and fewer deferred nodes does not mean all remaining
CSS/positioning/overflow/direction issues are resolved.

Whole-page geometry still rejects the unsupported profile. Exit zero means
the bounded inspection expectations pass; **geometrySupported remains false**.
There is no website pointer action, raster, form submission, credential access,
script/resource execution or markup rewriting in this lane.

Evidence:
`node_modules/.cache/native-validation/native-wikipedia-button-content-september13/`.
`RESULT.json` links earlier evidence by path/hash. Runtime inventories match
before/after; native owners close, process group is absent, guards record zero
attempts, and private HOME/TMP is removed empty. `EVIDENCE.sha256`:
`3bfdfea51678383136bb9bd9e5f8d4ad05bf7759a63f35fc59b5840c8b7d2d32`.

The failed 17,945 rich-button replay remains failed at its original path, and
the 17,962 diagnostic replay remains diagnostic-only. Neither is rerun or
relabelled as this new result.

## Native implementation and tests

Actual rich-button layout admits supported block, inline, float, flex/inline-flex
and block-grid profiles with real child ownership and fit-content auto width.
Source-backed UA defaults honor author overrides. Primitive appearance uses
the existing software palette, not a platform theme. Absolute/fixed buttons,
flex/grid items, inline-grid, and plain/rich natural-size/frame consistency
remain follow-up work. See `BUTTON-CONTENT.md` for the exact boundary.

Two manifest suites add 84 cases: 32 style and 52 layout. The earlier 78-case
baseline gives 19 pass/59 fail against unchanged production. A review then
exposes incorrect percentage padding when converting an inherited intrinsic
minimum into a used border-box minimum. Its six supported reproductions give
2 pass/4 fail against the pre-fix implementation; 46 unselected cases are
reported as pending, not broad exclusions. The corrected block/inline/float
paths preserve cyclic intrinsic zero-basis handling.

Final focused validation passes 699/0/0 across 19 suites/19 strict roots.
Clean broad round01 passes 18,046/0/2 unchanged historical exclusions across
350 suites/349 strict roots. The 728-entry manifest leaves 378 suites unrun;
the historical snapshot strict-only omission remains. Build, strict checking,
formatting, input stability and 1,247 unchanged tracked inputs pass. Source and
compiled inventories contain 1,262 and 2,096 files respectively. Root dist and
unrelated pre-existing work are not included.

Broad run: 08:28:18.989–08:32:29.433 UTC; audit: 08:33:21.825 UTC.
Audit:
`node_modules/.cache/native-validation/native-button-content-september13-round01/AUDIT.json`.
Source inventory SHA256:
`7d35910776bf8a9912f0648cc8ec4119870245adbd54535437754db78740bf48`.
Compiled inventory SHA256:
`a4709f542e26ac79b4401b9fd287e689fc8cab3e49621b8d943054281f10a792`.

Provisional broad round00 passed before the minimum-width finding but is not
the audited final runtime. Original red/focused/broad attempts remain retained;
three related legacy fixtures explicitly move their negative checks to the
still-unsupported positioned profile rather than adding exclusions.

## Outstanding gates

Full Wikipedia rendering/search, Selenium external CSS/color/range controls,
fieldset legends, complete button sizing/theme behavior, varied-site speed and
compatibility, the original four research topics, real credential/passkey
devices, SafeJS, real TTY and human challenge handoff remain open. Fixture tests
and diagnostic website reads do not complete those gates or the overall goal.
