# Hit testing, pointer policy and scroll commands

September 4, 2026 checkpoint in the standalone seven-day browser plan.

## Shared targeting pipeline

Hit regions now consume the committed page layout and stacking-aware paint order.
Queries translate viewport CSS pixels through the shared scroll origin once and
return deduplicated element targets front to back, including source-parent text
targets and the declared root fallback. Regions remain bounded and revision-owned.
Native inertness, including the supported select-button exclusion, still prevents
targeting suppressed descendants. Closure releases retained regions.

The `pointer-events` auto/none profile is integrated through stylesheet parsing,
inline CSSOM, cascade/inheritance, custom-property resolution and live computed
reads. Suppression changes targeting without changing paint, geometry or focus
policy. Descendants can explicitly restore auto targeting, but cannot override
ancestor inertness. The computed property list adds one longhand. Guest document
hit methods publish the actual existing node capabilities and revoke on DOM close.

`hit-test` now provides viewport-coordinate reference stacks through the command
host and existing CLI dispatch. `scroll-into-view` resolves selectors strictly,
supports the bounded root alignment profile, and checks session cancellation and
document identity around event delivery. Geometry command output now reports the
actual scroll origin instead of its old constant zero record.

The asynchronous event-action runner forwards the optional abort signal to the
dispatcher, so a command can cancel while a controlled scroll listener's prefix
is still pending. Cancellation unwinds dispatch without rolling back movement
that listeners could already observe. This adapter is a required dependency, not
just a post-event cancellation check.

## Capability boundary

The native hit capability now accurately reports root-viewport scrolling. Command
capabilities expose pointer policy, hit inspection and the already-integrated
page/root/element scroll and offset owners. They do not claim the pending mouse,
click/hover actionability or coordinate activation adapters in the isolated tree.
Their existing broader worktree implementations remain separate.

The original 46-case hit suite is promoted unchanged. Pointer-event and command suites
that also require mouse activation remain pending rather than being rewritten
to claim partial acceptance. Unrelated selector invalidation, active-element,
tracing, keyboard and tab changes are excluded. Source integration preserves
pending work; the only new edits to existing working source are the hit scroll
capability correction and descriptive coordinate local names in the adopted
command handler. Historical reports and paths remain unchanged.

## Research and validation

Official CSSOM View and CSS UI drafts were inspected on September 4, 2026 at
`https://drafts.csswg.org/cssom-view/` and
`https://drafts.csswg.org/css-ui-4/`: viewport hit queries, root fallback and
inherited pointer exclusion with descendant overrides. This is a bounded profile,
not complete CSS or external-browser conformance.

The explicit `src/hit-core.test.ts` adds 27 tests for native/guest/command target
agreement, live CSSOM, inheritance/variables/important cascade, inertness,
scrolled pixels and geometry, invalid input, stale references, cancellation,
closure and the actual CLI entry with an injected in-memory connection.
No socket, target website or SafeJS runtime is used by that fixture.

Prior HEAD plus the two original pending helpers fails 19 of the 27 checks;
eight rejection/cleanup cases already pass. A second baseline supplies the entire
integration but omits signal forwarding in the event-action runner: exactly the
pending-prefix cancellation test fails. All 27 pass after integration.

Focused validation passes 348 tests across eleven working-tree files and 284
across ten isolated files. The broader pointer-event suite and unrelated existing
test changes account for the working-tree difference, not weakened assertions.

Full native validation passes 9,386 tests across 258 working-tree files and
7,435 across 210 isolated-commit files. Both trees pass build, typecheck, strict
checking of the four affected test files and seventeen-file lint. The first full
isolated run found one obsolete assertion that geometry did not support scrolling;
only that assertion is updated, keeping unrelated capability changes pending.
The computed-style enumeration similarly adds only the new pointer longhand.

## Outstanding work

Next integrate mouse boundary events, focus/default activation, pointer routing
and click/hover command actionability against the shared hit owner. Real physical
input, pointer capture, modal/shadow hit rules, transforms/zoom, nested scrolling/
clipping, SVG hit policy, full positioning and complete event-loop behavior remain
open. Native tests and injected CLI dispatch do not satisfy the independent
live-site, socket, real TTY/PTY or SafeJS acceptance gates. No gated probe ran;
the denied SafeJS probe remains unrun. The full browser goal and seven-day window
remain active.
