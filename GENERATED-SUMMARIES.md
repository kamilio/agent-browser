# Generated disclosure summary foundation

September 4, 2026 continuation of `HANDLER-OBJECTS.md`, `DISCLOSURE-MARKERS.md`
and `SEVEN-DAY-PLAN.md`.

## Native generated targets

Missing-summary details now have a document-owned generated target and native
fallback rendering. The target has a distinct `u…-details-…` reference, host node
ID, control kind and English fallback label `Details`. It is not a document node:
ordinary DOM reference resolution rejects it, and generating/rendering it does
not change DOM children, text, attributes, queries, node counts or revision.

Target identity belongs to the host for its lifetime. Toggling, restyling and
body changes preserve it. A direct authored summary, including a hidden one,
makes the fallback target unavailable; removing that summary restores the same
host-owned target. Nested summaries do not replace the fallback. Detaching the
host makes resolution stale, while reconnecting the same host restores its
identity. Foreign-document references cannot resolve.

`DocumentGeneratedControls` bounds retained targets to 4,096 by default, validates
references and limits, preflights allocation and releases its maps on document
close. Tests use a smaller configured limit to verify rejection leaves the
document and existing targets unchanged. This does not create page-visible
shadow-root or node capabilities.

## Rendering, geometry and hit ownership

The formatting tree creates a separate generated header, label and disclosure
marker. Label and marker inherit native typography/color without matching
authored summary selectors. Generated text, depth and boxes consume existing
formatting budgets. Marker raster limits and paint accounting remain shared with
authored summaries. Main and intrinsic-width layout now accept generated content
references rather than requiring a light-DOM reference for every text/replaced
item. Inline, contents, flex and inline-block host paths are covered.

The generated header contributes to host layout but has its own client geometry.
`DocumentGeometry.getGeneratedClientRects` validates its generated reference and
uses existing layout caching and viewport scrolling. The open body is not part
of the generated header rectangle. Host DOM geometry retains only the host's
normal rectangle, not an extra synthetic child rectangle.

`DocumentHitTesting.targetFromPoint` distinguishes generated header hits from
ordinary body hits, even when both retarget to the same host node. Header
whitespace is included; overlapping content, visibility, pointer-events and
inertness use normal hit-test rules. Existing page-facing element-from-point
methods still return the real host element and preserve duplicate suppression.

This is the shared identity/rendering/geometry foundation, not completed fallback
interaction. Native click/default-action, generated focus/tab order, keyboard
activation and semantic/agent target publication remain next. No fake DOM summary
or whole-details-body click shortcut was added. The fallback is currently visible
in native captures but is not yet wired as an actionable semantic control.

## Native evidence

The 18 rendering/geometry/hit cases all fail on isolated prior HEAD. Twenty
additional registry cases cover identity, availability, foreign/invalid refs,
quotas and close. Initial integration reproduced missing replaced/text source
support; the flex case additionally exposed the intrinsic-width path. Both now
consume generated references without aliasing the DOM host. Strict checking also
caught an inferred literal limit type and an optional test value; both were fixed.

All 38 new tests pass. Matching focused runs pass 306 tests / eight files in both
working and isolated trees. Both pass types/builds, strict checking of both new
files and eight-file Biome checking. Both test files are included explicitly in
`native-tests.json`. Authorized full native runs pass 9,233 tests / 264 isolated
files. The working run reports 10,378 passes and the one unchanged pending
Window-onload expectation failure / 286 files, with no additional failures.
The isolated snapshot contains only this checkpoint on prior HEAD.

A 300-by-300 native PNG was generated and visually inspected at
`node_modules/.cache/native-validation/generated-summary-contact.png`. It shows
closed and open fallback headers, separated body content, and an authored summary
for comparison. Its raster reports three painted markers. This is an ignored
local native artifact, not a reference-browser screenshot or live-site probe.

Read-only primary research on September 4 used HTML's details/summary rendering
and interactive-element rules:

- `https://html.spec.whatwg.org/multipage/rendering.html#the-details-and-summary-elements`
- `https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element`

## Remaining gates

Complete generated action routing, focus/keyboard behavior and semantic targets
before claiming fallback controls work end-to-end. Localization, full UA/shadow/
accessibility behavior, remaining event interfaces and released-runtime/browser
acceptance remain open. The pending Window-onload object-to-null test conflict
recorded in `HANDLER-OBJECTS.md` remains unchanged. No live-site, socket, real
TTY/PTY or SafeJS probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated work stay separate. The seven-day browser goal is active.
