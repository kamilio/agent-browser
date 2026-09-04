# Native element focus options and scrolling

September 4, 2026. Parallel focus-worker delivery, reviewed and integrated after
`EDITABLE-FILL.md`. This is a native focus API and async host adapter, **not** a
claim that browser-synchronous HTMLElement.focus/blur now exists in page scripts.

## Implemented behavior

The existing DocumentFocus owner now provides focusElement/blurElement, async
variants and composable EventAction generators. Disabled, hidden, inert,
disconnected and otherwise unfocusable element receivers are no-ops. Invalid
document IDs and non-element receivers reject. Blur acts only on the receiver's
actual focus identity, not a generated summary represented by its owner node.
The original reference-based agent focus methods retain their behavior.

Element focusing supports preventScroll and explicit focusVisible. Same-target
calls apply options without duplicate focus events or loss of dirty edit baselines.
After focus events, an explicit false indication overrides editable/text-input
inference. The next input-modality recording or focus identity transition clears
that override. Omission on an already focused element preserves its indication.

Default element focus scrolls center/center using existing root-scroll geometry
and bounds. preventScroll skips planning. An injected page-scroll queue port can
apply the position and own its notification, avoiding duplicate native scroll
events. Existing reference-based agent focus does not silently gain auto-scroll.

Newer nested requests and actual focus transitions supersede stale options and
scrolling. Parent integration found an additional case: indication publication
can synchronously trigger a same-target request or a focus round trip. Four new
regressions reproduced unwanted stale scrolling; request/transition identity is
now checked again after indication publication and before either scroll path.

`PageFocus` exposes explicitly async host operations and owned cancellation.
Its restricted dictionary conversion accepts own data properties and distinguishes
omitted values from false; accessors/custom prototypes remain unsupported. Closing
the helper cancels suspended operations without closing the shared focus owner.
Cancellation does not roll back focus or scroll already applied.

## Page adapter gate

Current continuation: `FOCUS-BRIDGE.md` implements the public-contract publication
bridge with native identity/lifetime/listener tests. The following text records
the original helper boundary; separately authorized released guest execution
remains open rather than being inferred from the new native fixtures.

Controlled page listeners require the async event runner. The helper deliberately
does not advertise browser-synchronous page methods. Do not publish a Promise-
returning focus stub as standards-compatible HTMLElement.focus. The public
runtime's nested host-call/guest-callback completion contract still needs a correct
adapter and separately authorized execution evidence. The production runtime
selection and web-globals lanes are examining that shared integration boundary.

Primary research for the worker covered HTML focus algorithms and CSS focus-visible
heuristics; reference: `https://html.spec.whatwg.org/multipage/interaction.html#dom-focus`.
The original handoff remains at
`node_modules/.cache/native-validation/parallel-focus-options/FOCUS-OPTIONS-INTEGRATION.md`.
No runtime dependency or alternative browser engine was added.

## Native evidence

The worker delivered 43 new tests with 171 / four focused and 938 / 25 broader
native passes. Parent review added four indication-reentrancy regressions, all
four observed failing before the integration fix. Final integrated focused runs
pass **315 / seven files** in both working and isolated trees. Typecheck, build,
strict checking of the new test and four-file scoped lint pass in both.

Authorized full explicit native runs pass **9,733 / 277 isolated files**. The
working run reports **10,878 passes and the unchanged pending Window-onload
assertion failure / 299 files**, at `src/page-bindings.test.ts:161`. Its contents
still match the preexisting backup; unrelated pending work remains separate.

The combined snapshot is
`node_modules/.cache/native-validation/focus-options-integrated.Z1aNHA`.
Local logs include `focus-options-indication-red.log` and
`focus-options-integrated-{focused,native}-{working,isolated}.log` in the parent
cache. These are new integration measurements, not rewritten worker or migration
evidence.

Three inspected 240 by 180 PNGs from `focus-options-capture.mjs` use the isolated
native focus API, in-memory session and command capture path. With preventScroll
and forced false indication, focused `e9` stays offscreen at `(20,220,160,28)` and
scroll `(0,0)`; PNG size is 2,241 bytes. Default centering moves scroll to `(0,144)`
and its viewport bounds to `(20,76,160,28)`, still without an authored outline;
PNG size is 2,343 bytes. A native ArrowRight command restores keyboard indication
and the outside outline without further movement; PNG size is 2,519 bytes.

## Remaining requirements

Active-page focus/blur publishing, synchronous guest callbacks, full dictionary
conversion, nested overflow scrolling, smooth behavior, scroll margins/padding,
snap, shadow/frame/OS focus and broader focus fixup remain open. Native input
borders can remain visible even when the authored focus-visible outline is hidden.
No live site, socket, real TTY/PTY or SafeJS probe ran; the denied SafeJS probe
remains unrun. The accelerated deadline does not close the original browser gates.
