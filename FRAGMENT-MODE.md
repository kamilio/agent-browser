# Native fragment document-mode inheritance

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and behavior

Reviewed the WHATWG HTML fragment parsing algorithm:
`https://html.spec.whatwg.org/multipage/parsing.html#html-fragment-parsing-algorithm`.
The temporary parser document inherits quirks or limited-quirks mode from the
context's node document; no-quirks remains the default otherwise.

`HtmlFragmentContext.documentMode` now accepts the existing native `DocumentMode`
values. Both ordinary contexts and the special html-element fragment path set
the temporary document mode before processing tokens. A doctype inside a fragment
does not override that mode. Invalid modes are rejected; omitted modes retain
the existing no-quirks default. The ordinary full-document parser still selects
its mode from document input, not this fragment-only context field.

The shared native `innerHTML`, `outerHTML` and `insertAdjacentHTML` implementation
passes the context owner's mode. This includes detached elements, fragment-parent
contexts and synthetic body contexts for adjacent insertion around html. Host
bindings delegate to these same native operations.

The observable parser difference is table insertion with an open paragraph:
quirks fragments retain the paragraph, while no-quirks and limited-quirks
fragments close it. These are parser-tree assertions, not quirks-layout support.
Parse metadata retains the inherited mode and the existing non-default-mode
layout limitation diagnostic.

## Ownership and lifecycle

The context owner determines the mode, not the eventual insertion destination.
Setting a template host's innerHTML uses its node document's mode even though
the result is imported into the inert template-content owner. Insertion into
an element already in that content owner instead uses that owner's mode. Neither
operation changes the destination document's mode.

Each insertion samples the current owner mode. Earlier nodes are not reparsed
when the native mode changes. The temporary parser owner still uses destination
limits, closes after import, and clears its mode/parse metadata when closed.
Aborted replacement leaves existing destination nodes and revisions unchanged.
No page-document initializer is invoked by fragment parsing.

## Validation and remaining gates

Two initial regressions fail before the fix. The new 44 tests cover all three
modes, ordinary/body/html/template contexts, doctype immunity, defaults, invalid
input, all native insertion positions, detached ownership, template ownership,
mode changes, cleanup, cancellation and three host bindings. The focused native
run passes 289 tests across seven files.

Full native validation passes 8,653 tests across 240 files. An isolated archived-
HEAD tree with only this checkpoint's changes passes 5,893 tests across its 179
available files. Production and new-test type checks, builds and three-file lint
pass in both trees. Pre-existing uncommitted changes are excluded from the
isolated patch and this checkpoint's commit.

Host-binding fixtures use native factories, not SafeJS. No live website, socket,
real TTY/PTY or SafeJS probe ran; the previously denied SafeJS probe remains
unrun. This checkpoint does not establish WPT, framework or rendering conformance.
Provisional scaffold publication timing, full EOF diagnostics, modern select,
foreign content and cross-owner observer/runtime breadth remain open. Full quirks
layout and the independent runtime/live-site/terminal acceptance gates remain
unfinished; the seven-day goal stays active.
