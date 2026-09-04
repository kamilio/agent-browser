# Page scrolling bindings and callback lifecycle

September 4, 2026 checkpoint in the standalone seven-day browser plan.

## Integrated behavior

Page bindings now share the native viewport owner across Window `scroll`,
`scrollTo`, `scrollBy`, position aliases, root-element position setters and
`scrollIntoView`. `document.scrollingElement` identifies the supported standards
root. Element scroll extents use the shared layout; native visible-overflow
non-root elements retain zero scroll positions rather than pretending to be
nested scroll containers.

Readonly `offsetTop`, `offsetLeft` and `offsetParent` getters publish the shared
document-space measurements and the actual parent node capability. Scrolling
does not move these offsets. Guest-facing client rectangles and viewport captures
continue to consume the same origin. Window/document `onscroll` properties use
the existing event binding owner, not a separate callback registry.

Instant programmatic position changes return a resolved completion promise and
coalesce a later Document scroll event that bubbles to Window. The native page
owner waits for active source evaluation and synchronous callback prefixes.
`PageScripts` explicitly wakes pending work when either boundary ends, including
source failure. An asynchronous callback result alone does not block later scroll
tasks after its prefix ends. Realm closure cancels queued delivery and revokes
retained methods/getters. Existing request/event limits remain enforced.

The official CSSOM View editor's draft was inspected on September 4, 2026 at
`https://drafts.csswg.org/cssom-view/`, including instant completion, coalesced
document notifications and bubbling. The host-task schedule is a declared partial
profile, not the complete browser rendering-event-loop algorithm.

## Integration boundary

The commit promotes four pending modules: `page-scroll`, `root-scroll`,
`element-scroll` and `scroll-into-view`. Focused adapters in `script-dom`,
`page-bindings`, `page-scripts` and the native exports connect their ownership.
The viewport capability reports programmatic bindings and coalesced host tasks;
mousewheel and scroll-into-view command claims remain disabled in the isolated
commit until the command/pointer adapters are integrated.

Unrelated hit-testing, active-element, query metrics, base64 and Window onload
changes stay pending. The existing global-name assertion adds only the three
scrolling methods in the isolated tree; the broader worktree's base64 additions
are not swept into this checkpoint. Original source/test bytes remain intact.

## Validation provenance

`src/guest-scroll-core.test.ts` adds 17 explicitly allowlisted native tests.
They use an injected `PageRuntimeFactory` and host-object factory, not an actual
SafeJS execution or an external browser. Source bodies are injected callbacks;
the tests exercise the real `PageScripts` admission/completion hooks, page
bindings, document event dispatch, layout/geometry, offsets and raster capture.

All 17 fail on unmodified pre-integration HEAD. A second baseline supplies the
new bindings and metrics but omits the `PageScripts` busy/wake hooks: exactly
three tests fail, exposing early delivery during successful/failed source
evaluation and missing callback-prefix coordination. The integrated tests pass.

Five unchanged existing suites add 173 checks covering page scrolling, root
scrolling, element scroll extents, scroll-into-view and element offsets. Focused
validation passes 275 checks across ten working-tree files and 266 across ten
isolated files.
The nine additional working-tree checks are unrelated pending binding/DOM tests,
not omitted failing scroll cases.

Full native validation passes 9,359 tests across 257 working-tree files and
7,362 across 208 isolated-commit files. Both trees pass build, typecheck, strict
checking of the seven relevant test files and sixteen-file lint. The isolated
snapshot contains only prior HEAD plus this checkpoint's source and test changes.

## Remaining gates

Next integrate coordinate hit testing, pointer/action routing and command
capability reporting against the shared scroll origin. Nested scrolling and
clipping, smooth scrolling, scrollend, automatic-clamp notifications, full
rendering-loop timing, quirks/RTL/negative origins, transforms/zoom, full
positioning, scroll-margin/padding/snap and general dictionary coercion remain
open. Rich control internal scroll metrics remain explicitly unsupported.

No dependency was added. No live-site, socket, real TTY/PTY or SafeJS acceptance
probe ran, and the denied SafeJS probe remains unrun. Historical reports and
paths stay unchanged. The original browser scope and seven-day goal remain active.
