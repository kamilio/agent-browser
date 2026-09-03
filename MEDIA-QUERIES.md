# Responsive media queries and resize events

`MEDIA-RANGES.md` extends the original flat query profile with compiled comparisons,
chained bounds, nested Boolean conditions, ratios and resolution. Page getters and
notifications now reuse the compiled query. Historical probe results below are
preserved; the separate interpreted function-identity failure is not resolved.

The September 3 implementation connects native viewport changes to owned page
`matchMedia` objects, real asynchronous `change` callbacks and Window `resize`
events. Stylesheets and page queries use the same CSS media evaluator. The
existing agent `resize` command updates this viewport; no browser engine, new
dependency, service, network access or default runtime switch is involved.

## Page interface

```js
const narrow = matchMedia("(max-width: 48em)");
narrow.addEventListener("change", event => {
  document.getElementById("status").textContent = event.matches ? "narrow" : "wide";
});
window.onresize = () => console.log(window.innerWidth, window.innerHeight);
```

- Global `matchMedia` and `window.matchMedia` invoke the same native operation.
  Each call returns a fresh owned object, without allocating a DOM node.
- `.media` and `.matches` are readonly; matching is live even before queued
  notifications run. `window.innerWidth` and `window.innerHeight` use the same
  logical CSS viewport as layout. Bare global dimension accessors are absent.
- Media lists expose `addEventListener`, `removeEventListener`, `onchange`,
  `addListener` and `removeListener`. Legacy listener methods use the same ordinary
  `change` registration, so duplicates/removal work across the two APIs.
- Handler attributes preserve their position when replacing a function. Setting
  a nonfunction clears the handler. Ordinary listener registrations remain
  separate, even when they use the same function as an attribute handler.
- Capture, once, passive, listener deduplication, removal during dispatch,
  propagation control and exception isolation reuse the native document event
  dispatcher. Listener objects, option accessors and signal support retain the
  existing page event bridge's restrictions.
- Change events expose actual media/match data, MediaQueryList target/currentTarget,
  callback receiver and composed path. They do not bubble, are not cancelable,
  and retain this engine's existing `isTrusted: false` convention. Window resize
  uses the Window target. Target/currentTarget lifecycle is shared with DOM events.

## Matching and scheduling

The current profile supports `all`, `screen`, `print`, comma alternatives,
`not`/`only`, grouped `and`/`or`/`not`, comparisons/chained bounds, width/height,
aspect ratio, fixed native resolution and portrait/landscape orientation.
Dimensions accept px, em, rem and absolute CSS length units (font units use the
initial 16px font), plus unitless zero. Square viewports match portrait. Screen
is the active medium, including during the current screen-layout PDF export.

Queries receive bounded whitespace/comment/case normalization. Invalid **or
unsupported** comma branches become `not all`, rather than throwing or partially
matching. This is explicitly not full CSSOM query serialization or Media Queries
Level 4 parsing. Color/pointer/preference features, viewport/font-metric relative
units, zero-denominator ratios, calc/var, escaped identifiers and general-enclosed
syntax remain unsupported. Their fallback is not proof of browser conformance.

Viewport changes notify a bounded native observer, which queues one host task.
Same-task updates coalesce. If the viewport returns to its last reported dimensions
before delivery, there is no resize notification. Resize runs before media changes;
media objects are visited in creation order, and changes fire only when their last
reported result differs. Callback prefixes are awaited through the existing event
engine, not asynchronous callback return values. Reentrant changes schedule a later
turn. This is a software notification opportunity, not hardware rendering/vsync or
complete HTML update-the-rendering semantics.

## Ownership and limits

| Resource | Bound |
| --- | ---: |
| Media lists per page binding | 256 |
| Input query UTF-16 units per call | 4,096 |
| Retained serialized query UTF-16 units | 65,536 |
| Delivered resize/change events per owner | 4,096 |
| Update turns per owner | 4,096 |
| Native independent target lifetime allocations per dispatcher | 512 |
| Native viewport subscribers | 16 |

Each list owns an independent event target, not a hidden DOM element. Targets have
no propagation parent; releasing one removes its native listeners and page mapping.
IDs are not reused. Existing per-target/total listener and callback budgets still
apply. Closing the page/document cancels queued work, aborts active dispatch waits,
unsubscribes viewport observation, releases list target mappings/listeners, and
revokes saved capabilities. Cumulative event exhaustion closes the media owner and
reports failure through the page lifecycle instead of endlessly queuing work.

## Evidence and remaining failure

- `reports/media-queries-focused-final-2026-09-03.json`: **2,304 passing tests
  across 103 explicit safe files**. Package build, strict checks of changed tests,
  lint and formatting pass. The earlier focused report retains one stale expected
  global-name-list failure; the corrected test explicitly includes `matchMedia`.
- `reports/media-commands-safejs-2026-09-03.json`: nine passing assertions through
  actual agent `open`, `eval`, `resize`, `snapshot`, chunked `screenshot` and `close`
  commands over an in-memory mocked transport. Real interpreted callbacks respond
  to resize, update snapshots and native pixels, restore byte-identical PNGs, and
  close with the session. The largest JSON frame is 1,347 bytes. This focused
  command evidence does not erase the separate function-identity failure.
  `media-commands-safejs-repeat-2026-09-03.json` repeats all nine checks after
  final compilation with the same maximum frame size.
- `reports/media-queries-final-probe-2026-09-03.json` repeats the complete probe
  after final compilation, with explicit callback receiver/target checks: 13 pass,
  one identity check fails. The probe still reports false and exits nonzero.
- `reports/media-background-regression-2026-09-03.json` and
  `media-animation-regression-2026-09-03.json`: all 13 previous background and
  all 11 animation-frame actual-core assertions pass with the new page bindings.

- `src/page-media.test.ts`: 28 cases, including actual PageBindings wiring,
  shared CSS matching/painting, event order/identity/removal, coalescing,
  reentrancy, limits, serialized-text charging, close/revocation, and a 256-list
  repeated-resize workload that reaches the 4,096-event cap and releases listeners.
- `reports/media-queries-safejs-2026-09-03.json` stops at the initial assertion.
  `media-queries-diagnostic-2026-09-03.json` isolates the cause: the existing
  experimental SafeJS core exposes distinct global and Window function wrappers.
  Query results, media text and viewport dimensions in that same observation are
  correct. These failed reports are retained, not relabeled as acceptance.
- `reports/media-queries-complete-probe-2026-09-03.json` runs the rest of the
  actual production-binding/experimental-core checks without discarding the
  identity assertion: **13 pass and one fails; overall passed is false and the
  process exits nonzero**. Interpreted listeners mutate real DOM, agent snapshots
  and native PNGs; legacy/once removal, event state and close checks pass.
- The wide 80×40 fixture produces a 380-byte PNG, SHA-256
  `2fd17cce4b70eb6fbae0f652dcdb9b8c8374bcb877c969dc83199c372f2130cd`.
  At 40×80, matching CSS and guest changes produce 416 bytes, SHA-256
  `fb37d440cd98521baa75de00496d9d64139dd69aa8c7f31acaa29b447689d250`.
  Restoring dimensions/content restores identical original PNG bytes. These are
  generated in memory; no saved artifact is implied by the hashes.

The pure native bindings share a function reference, but that **does not prove
interpreted alias identity**. The selected experimental core constructs a distinct,
receiver-checked closure for each live host-object method. This checkpoint does not
patch the SDK, inject a guest alias shim, relax the failed assertion, or claim that
the released SDK has the same behavior. See `docs/poe-code-workaround-audit.md`.

MediaQueryList/Event constructors and prototypes, script `dispatchEvent`, global
dimension accessors, complete event/coercion semantics and the identity mismatch
remain open. Native/in-memory evidence is not real-site, Worker, released-SDK or
full Kitesurf/Playwright-superset acceptance. The main goal remains active.

Reproduce after building (currently exits nonzero for the retained identity gap):

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/existing/experimental/safe-js \
  node packages/browser-agent/dist/scripts/check-media-queries.js
```

References: https://drafts.csswg.org/cssom-view/#the-mediaquerylist-interface and
https://drafts.csswg.org/mediaqueries-4/#orientation.
