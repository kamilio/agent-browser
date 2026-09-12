# Native float and container outer-flow coordination

## Verified scope

The clean isolated gate passes **13501 tests, zero failures and
two unchanged exclusions**, adding **55 cases**. Focused testing passes
1364 checks across 33 suites.
Full gate UTC: **2026-09-12T13:33:04.718Z–2026-09-12T13:35:58.306Z**.

Ordinary physical-float scopes now coordinate supported block flex, grid and
table shells instead of rejecting every page containing the combination.
Supported cases include page siblings and shells inside ordinary floated or
inline-block subtrees where the existing baseline profile is supported.
Intersecting independent shells retain their measured width and horizontal
position and move below earlier floats. This is the existing deterministic
downward-only policy, not automatic beside-float width narrowing.

The compatibility flex-flow entry delegates to a raw shell measurement/merge
helper. That helper supplies real shell heights to one outer document traversal
with the float coordinator. Actual reflowed outer text, metrics, shell boxes,
baselines, collapsed borders, images and atomic metadata survive subsequent
merges. Direct atomic owners are placed once per scope. Float and atomic nesting
depth, source-order placement, work/retention limits and cleanup remain bounded.

Two concrete retention/actionability issues exposed by the new topology are
fixed: already-placed floated-child atomic metrics are appended once with
charged work, and deferred grid containers participate in native hit-owner
selection beside flex/table containers. The latter prevents a container's
background from incorrectly resolving to its source parent. Both omissions
predate this patch; new failing regressions precede their localized fixes.

## Explicit limits

Floating flex/grid/table roots and floats inside container items/cells remain
unsupported because those child-reflow adapters are not coordinated here.
Logical float/clear values, clear on deferred shells, unsupported positioned
profiles, unrelated CSS/HTML guards and existing grid inline-block baseline
limitations remain explicit. No guard is removed merely to force a click.

The retained Libjpeg-turbo page has independent applicable CSS and non-CSS
diagnostics. This native fixture release is not a Libjpeg, Go or entire-website
pass. No performance improvement, new live validation, provider/passkey/device,
TTY, real SafeJS or challenge-bypass acceptance is claimed by this gate.

## Regression evidence

Three unchanged canonical fixtures assert float/shell/following rectangles,
raster colors and physical hit ownership. Original and formatter-only13446
baselines each fail all three at the old combination guard. The same final
fixture bytes pass after implementation. The focused suites cover both sides,
ordering, real wrapped text, heights, nested shell/atomic ownership, mutation,
collapsed borders, limits, precise negative profiles and a genuine mocked
native grid-anchor click with destination and cleanup checks.

- float-shell-geometry.test.ts: 3 new cases.
- float-shell-layout.test.ts: 29 new cases.
- float-shell-limits.test.ts: 23 new cases.

Four older suites retain all fourteen formerly blanket-negative cases as real
geometry/text/ownership assertions, preserving original markup and unrelated
guards. The collapsed-table child-float negative retains its case and checks
the still-unimplemented child adapter's precise guard.

Failed intermediate evidence is retained: fixed00 stops during preparation on
unavailable neighboring test paths; fixed01 has535passes/14obsolete guards;
fixed02 has1336passes/27failures, including the two atomic-retention and two
grid-hit defects. Other new fixture mistakes distinguish absent width refs,
collapsed border-box width and an existing unsupported grid baseline. No old
run, source capture or measured failure is rewritten. Details and every focused
run remain under node_modules/.cache/native-validation/float-shell-work-september12/.

## Clean gate

259 selected native suites, 258 strict roots,
653 clean manifest entries, 1155 source and
1968 compiled files, 1142 unchanged
tracked inputs. Build, strict typing and scoped formatting pass; no exclusion
is added. The gate uses kernel socket/socketpair denial and private HOME/TMPDIR.

- Gate: node_modules/.cache/native-validation/native-float-shell-september12-round00.
- Source inventory SHA256: a1a6b8c9f1bad92db4740f45d8fb7dadb2c91d1ee516c1f8775cdb26b886d296.
- Compiled inventory SHA256: 245b8f4a4b78a1c75d34fb1a4a6fa708b2eefbdc1ed40b5036f205507af297fe.
- Native results SHA256: fcd0b07729a130294b2cb276b551d04ace082a7e48d37bc1520c062f3acc7fb5.
- Summary SHA256: e10da848cf843523745b03e5d860f13e3c7060e142b0f703bfa7399062eb586e.

Pre-existing user work is preserved, including the two unrelated manifest
entries and927TASKS additions. No dependency or foreign browser engine is added.
The overall browser goal and all broader acceptance gates remain open.
