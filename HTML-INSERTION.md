# Contextual adjacent HTML and outer replacement

September 2, 2026. The page DOM now implements `element.outerHTML` assignment
and all four `element.insertAdjacentHTML(position, markup)` positions through
the independent fragment parser. No dependency, source rewrite, remote browser
or interpreter change is used.

## Implemented profile

- `beforebegin`/`afterend` insert siblings; `afterbegin`/`beforeend` insert children.
  Positions are case-insensitive but not whitespace-trimmed. Invalid positions
  and missing arguments fail visibly. The method returns undefined.
- Adjacent insertion does not serialize/reparse the existing subtree. Existing
  node capabilities, listeners, native control values and stable references stay
  attached to their original nodes. New parsed nodes get fresh identities.
- Outer replacement parses using the parent context, then replaces only the
  target. Existing variables still refer to the detached old element, whose
  children and listeners are not transferred to the new markup. Connected agent
  references to the removed subtree become stale; unaffected references survive.
- An outerHTML assignment to a detached element is a no-op, without parsing or
  allocating replacement nodes. A document-element assignment rejects, including
  an empty string. Sibling insertion requires an element or fragment parent.
- Null outerHTML becomes an empty string and removes the target. Explicit null
  or undefined adjacent markup becomes text. Object coercion and TrustedHTML
  objects remain unsupported; no user coercion hook is called.
- Table/section/row, select, raw-text, RCDATA and ancestor-form contexts use the
  existing parser. Fragment parents use body context. Adjacent insertion into
  an html element also uses body context instead of creating head/body wrappers.
  Context-sensitive behavior remains subject to the partial parser's limits.
- Parsed scripts are inert in both paths. Controls created by markup can receive
  listeners explicitly registered by page code and then be acted on natively.

Library exports `setOuterHtml(tree, id, source, {signal})` and
`insertAdjacentHtml(tree, id, position, source, {signal})` own staging-tree cleanup.
They accept markup strings; the script adapter performs primitive conversion.
`capabilities.htmlInsertion` exposes supported positions, inert scripts and the
explicit absence of Trusted Types and sanitization.

## Ownership and failure behavior

Parsing occurs in a separately bounded tree. The shared native import operation
validates destination depth, aggregate node/text quotas and insertion references
before copying or detaching committed content. Parse, quota and cancellation
failures leave committed nodes, native node count and revision unchanged.
Empty insertion allocates no destination nodes; empty outer replacement can
remove a node even when the destination's node quota is full. Removal clears
focus when its focused descendant becomes disconnected.

The document intentionally retains detached nodes and nonempty imported fragment
wrappers until closure. Repeated replacement consumes cumulative quotas; there
is no DOM garbage collector. Staging and import have bounded native work but are
not exactly accounted as interpreter steps. Hard containment still needs the
owned-process boundary.

**This is not HTML sanitization.** Returned/retained markup may contain scripts,
event attributes and unsafe URLs. Inert inserted script elements do not make that
markup safe to inject into another application. Inline event-attribute execution,
general dynamic resource/script loading, custom-element reactions, namespaces,
template/shadow contents, Trusted Types and full parser/DOM exception conformance
remain unsupported or unverified. InsertAdjacentElement/Text are separate gaps.

## Evidence

- `reports/html-insertion-focused-2026-09-02.json`: 1,421 tests across 65 files,
  including 26 new insertion/replacement cases and updated script-DOM/capability
  checks. Covers positions, contextual parsing, detached/document roots, control
  identity, stale references, cancellation, quotas, no-op operations and coercion.
- `reports/html-insertion-safejs-fixture-2026-09-02.json`: 12 actual existing
  experimental-core checks. Native fill/click drives an interpreted card UI;
  adjacent creation preserves a previously edited control; outer replacement
  produces fresh native references; a new listener runs on the replacement;
  inserted scripts stay inert; tables, fragment parents, failure and cleanup pass.
- Regression reports for script mutations (12), script select (11), selection
  state (10) and action waiting (8) add 41 actual existing-core checks.

All new fixtures/transports are in memory. These are not public-site, separate
CLI/live-terminal, released-SDK or framework-conformance gates. The first fixture
attempt incorrectly expected adjacent text nodes to render as one snapshot line;
native inspection confirmed separate text entries and combined `textContent`.
The final probe checks both rather than changing DOM node identity to fit output.

Build, strict changed-test compilation, focused formatting and diff checks pass.
The broader browser goal and released-adapter acceptance gates remain open.

Primary algorithms inspected:

- https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-outerhtml
- https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-insertadjacenthtml
- https://html.spec.whatwg.org/multipage/parsing.html#html-fragment-parsing-algorithm
