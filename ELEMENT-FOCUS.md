# Element focus properties

September 4, 2026. Native element capabilities now expose `tabIndex` and `inert`
through shared document attributes. These are application-facing additions to
the existing focus, keyboard, selector and semantic-snapshot implementation.

## Reflection is not focusability

`tabIndex` reads an HTML integer prefix using ASCII whitespace and an optional
sign. Trailing text does not invalidate an already parsed integer. A parsed value
inside the signed 32-bit range is returned; otherwise the HTML element-specific
default applies. This includes zero for the specified control/link/frame/object
tags and the first summary child of details, and minus one for other elements.
Summary defaults follow insertion, reordering and removal.

The getter is deliberately independent of native actionability. A disabled or
hidden input can report zero; an anchor without an href can report zero. A plain
div with no attribute and a div with explicit `tabindex="-1"` both report minus
one, although only the latter is programmatically focusable in the native profile.
Reporting a frame/summary default does not implement frame browsing or details
activation.

Assignments use signed-long conversion for supported primitives, then serialize
the resulting integer into the attribute. Fractions truncate, wrapping uses
32 bits, and NaN/infinities become zero. BigInt and Symbol reject with TypeError;
objects/functions reject explicitly without invoking guest numeric conversion.
Failed conversion does not mutate attributes or document revision.

Native focus eligibility now shares the same integer-prefix parser rather than
requiring the entire attribute to be numeric. The previous native safe-integer
bound remains: focus ordering accepts representable integers beyond the getter's
32-bit range but falls back for values beyond the safe-integer range. Full
arbitrary-precision/platform focus ordering remains open.

## Inert state

The `inert` property reflects local attribute presence using Boolean conversion.
The string `"false"` and objects are truthy; an ancestor's inert state does not
make a descendant's reflected property true. Effective inertness still uses the
existing shared ancestor checks for native focus and semantic visibility.

Adding an inert attribute to the focused element or an ancestor now clears native
focus and keyboard-activation state before attribute mutation observers read it.
Property assignment, ordinary attribute writes, toggleAttribute and attribute-node
installation use the same document mutation boundary. Unrelated focused subtrees
are unchanged. Removing inert does not restore old focus; explicit refocusing can.
Failed attribute budget checks preserve focus and attributes.

Native tests distinguish semantic exclusion from visual removal: an inert button
remains in DOM queries and has geometry, but no longer matches `:focus` or appears
as an actionable semantic entry. The focus-dependent stylesheet width changes
through existing invalidation. Full focus fixup/blur/focusout scheduling, pointer
state transitions, flat-tree/shadow behavior and modal-dialog inertness remain open.

## Ownership and evidence

Properties are element-only and their retained accessors follow existing binding
revocation. Attribute parsing and first-summary lookup use weak caches keyed by
immutable node views; document node/text limits bound the input. No document query
index, runtime dependency or independent focus-state owner is introduced.

All 84 new cases fail on isolated prior HEAD and pass after implementation.
An integration failure after initial property wiring exposed stale activeElement
state under inert ancestors; the document mutation fix resolves that failure.
Focused native runs pass 217 tests / six files in both trees. Authorized full
native runs pass 10,134 / 278 working files and 8,988 / 256 isolated files. Both
trees pass types/builds, strict new-test checking and five-file lint. `TASKS.md`
and `SEVEN-DAY-PLAN.md` also record this checkpoint.

Read-only primary research on September 4 used the HTML interaction rules at
`https://html.spec.whatwg.org/multipage/interaction.html` and numeric conversion
rules at `https://webidl.spec.whatwg.org/`. This is specification review, not a
reference-browser or upstream test run.

No live website, socket, real TTY/PTY or SafeJS probe ran. The denied SafeJS probe
remains unrun. Historical evidence and unrelated pending work are preserved; the
complete seven-day browser objective and its original acceptance gates stay active.
