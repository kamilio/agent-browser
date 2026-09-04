# Native disclosure core

September 4, 2026 continuation of `SEVEN-DAY-PLAN.md`.

## Shared document state

The native engine now treats the first `summary` child of a `details` element as
its disclosure control. A shared helper supplies identity to focus metadata,
keyboard actions, semantic snapshots and collapsed-subtree styling. Weak caches
use immutable node views and follow structural invalidation; no second document
owner or runtime dependency is introduced.

Closed details keep their full DOM/query membership but suppress all children
except that summary branch from displayed layout, hit testing, focus, snapshots
and element captures. Computed `display` remains the authored value. Author
`display: block !important` does not expose collapsed content, and opening an
outer disclosure does not open a nested disclosure. Hidden descendants still
consume existing cascade work budgets; cold first-summary scans also charge work.

Details and summary are no longer unconditionally deferred by the formatting
tree. Their supported contents use existing native layout and raster paths.
This does not add generated markers, a missing-summary fallback or complete
user-agent shadow/layout behavior.

## Actions and properties

Native click, Enter and held Space activate a primary summary through the shared
cancelable event/default-action path. Space does not scroll while activating the
control. Interactive descendants retain their own behavior. Canceled clicks do
not toggle, and default actions revalidate summary ownership after listeners;
controlled asynchronous native listeners complete before the default action.
Detached primary summaries can activate through the existing programmatic path.

The details-only `open` property reflects attribute presence with Boolean
conversion. Truthy assignment sets the empty string even when an existing
attribute contains another value; false removes it. Retained accessors honor
binding revocation. Native snapshots publish the primary summary's button role
and live `expanded` state, including snapshot deltas.

Closing a disclosure clears focus and held-key activation within its body before
mutation observers can read stale state, while preserving focus in the summary.
Inserting a new primary summary, directly or in a fragment, also clears focus in
the newly hidden old branch. Reopening does not restore old focus. Full platform
blur/focusout and flat-tree focus fixups remain outside this checkpoint.

## Regression evidence

The 38-case new native file produces 36 failures and two passes on isolated
prior HEAD. Initial integration exposed four formatter-deferral failures.
Two additional structural regressions reproduce stale focus before the insertion
fix, and an attribute-reflection regression fails before normalizing truthy
assignment. All 38 pass after these fixes. A pre-existing label test clicked a
descendant of closed details; it now explicitly opens that fixture so it still
tests interactive-descendant label suppression without bypassing actionability.

Focused runs pass 301 tests across eight files in both the working tree and
isolated proposed commit. Both pass typecheck/build, strict checking of the new
test and adjusted label test, and fourteen-file Biome checking. The isolated
tree contains only this checkpoint over prior HEAD, not unrelated pending work.

Authorized full native suites pass 10,172 tests / 279 working files and 9,026 /
257 isolated files. Their preceding full runs fail only the now-corrected label
fixture (10,171 and 9,025 passes respectively). These use `native-tests.json`,
not discovery of gated integration probes.

## Open acceptance gates

This is a disclosure core, not full details conformance. Coalesced asynchronous
`toggle` events and ToggleEvent state, named accordion exclusivity, generated
fallback summaries/markers, complete accessibility and UA shadow behavior remain
open. No synchronous substitute toggle event is emitted. Continue with bounded,
document-owned notification scheduling and name-group semantics in a separate
checkpoint rather than claiming these parts are complete.

Read-only primary specification research on September 4 covered:

- `https://html.spec.whatwg.org/multipage/interactive-elements.html`
- `https://html.spec.whatwg.org/multipage/interaction.html`
- `https://w3c.github.io/html-aam/`

Specification review and native fixtures are not reference-browser or released
SafeJS evidence. No live-site, socket, real TTY/PTY or SafeJS probe ran. The denied
SafeJS probe remains unrun. Historical evidence and unrelated pending changes
remain intact; the full seven-day browser objective stays active.
