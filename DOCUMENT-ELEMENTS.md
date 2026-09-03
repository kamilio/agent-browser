# Structural document access and body replacement

September 3, 2026. Native page bindings now implement writable `document.body`
and structural `document.head`/`document.body` selection. These readers share the
same document-element/head helpers with native title creation.

## Behavior

- `document.documentElement` is the first element child of the document. Comments,
  text and detached nodes do not substitute for it.
- `document.head` is the first direct head child of an `html` document element.
  A nested lookalike or an `html` descendant below another root does not qualify.
- `document.body` is the first direct body or frameset child of that `html` root,
  in tree order. The head and document-element accessors remain readonly.
- Setting body accepts an existing body/frameset node granted by the current
  script-document binding. The native node is moved, never cloned. Assigning the
  current body is a no-op without a revision change.
- An existing body is replaced in place, preserving surrounding siblings. If no
  body exists, the supplied node is appended to the document element. Without a
  document element, assignment fails before moving the node.
- A non-`html` document element can receive an appended body even though the body
  getter remains null. This distinction is covered explicitly.
- Invalid node kinds/tags, foreign capabilities, cycles and depth failures leave
  the prior tree positions intact. Closure revokes access to the owning document.

Replacement reuses the existing native mutation machinery and allocation budget.
It works at the current node/text quota because no replacement nodes are created.
Removed nodes retain detached identity; native focus is cleared when its subtree
is removed. Failed depth checks leave the current focus untouched. Selectors,
snapshots, extraction and document title continue to read the shared live tree.

## Limits

The current binding accepts only its own node capabilities, like the existing
mutation APIs. Cross-document adoption and foreign-realm grants are not added.
Native hierarchy failures use `AgentBrowserError` codes rather than claiming full
DOMException/Web IDL brand or prototype parity. Namespace-aware SVG/XML behavior,
body-to-Window event-handler reflection and custom-element reactions remain open.

Recognizing a native frameset node does not implement frameset parsing, frame
browsing contexts or rendering. The existing explicit frameset parser rejection
is not removed. This is not released-SafeJS, real-site or UI acceptance.

## Reference and validation

Primary reference reviewed September 3, 2026:
`https://html.spec.whatwg.org/multipage/dom.html`, DOM tree accessors.

Eleven initial native regressions failed before the implementation. Thirty-four
new cases cover structural selection, body/frameset ordering, moves from detached
trees/fragments/siblings, no-op behavior, invalid operands, isolated owners,
allocation/depth/cycle limits, native focus, live extraction/snapshots/title and
closure. The non-extensible mock host objects expose real registered getters and
setters rather than allowing a missing API to become a test-only expando.

No website, socket, actual guest runtime or TTY/PTY probe runs in these tests.
Outstanding broader browser gates remain listed in `TASKS.md`.

Focused validation passes 109 tests across five native files. The full working
tree passes 6,175 tests across 189 explicit native files with no unhandled errors.
The build initially found a missing setter parameter annotation; after correction,
production build and strict test typechecking pass. Four-source lint/formatting
passes, preserving pre-existing import organization in the dirty binding file.
An isolated HEAD snapshot containing only this source/allowlist change also
typechecks and passes 3,415 tests across 128 available allowlisted files, excluding
the pre-existing unfinished browser work.
