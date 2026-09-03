# Live document titles

September 3, 2026. Native page bindings now expose `document.title` and
`HTMLTitleElement.text`. Document extraction uses the same title reader rather
than maintaining different whitespace and descendant-text rules.

## Supported behavior

- `document.title` reads the first attached HTML title in tree order. Only direct
  text children contribute; comments and nested element text do not. ASCII
  whitespace is collapsed and trimmed, while non-ASCII spaces are preserved.
- Setting `document.title` replaces that title's children with literal text.
  An existing title retains its identity, including when it is outside the head.
- If no title exists, the setter appends one to the actual head: the first head
  child of an HTML document element. It does not invent a head or use a misleading
  nested head. Without a usable title/head, assignment has no effect.
- `title.text` reads uncollapsed direct-child text and replaces children on write.
  It is independent of the element's advisory `title` attribute. Detached title
  capabilities remain live without changing the document title until attached.
- Existing primitive DOM-string conversions apply, including literal `null` and
  `undefined` strings. Unsupported object/function/symbol conversion fails before
  mutation and does not invoke user-supplied conversion hooks.
- All getters/setters revoke on document closure. Document owners remain isolated.

Native extraction keeps title metadata document-scoped even when extracting a
subtree. It still escapes terminal-control and formatting characters and applies
its serialized-output budget. The DOM getter returns the actual title text rather
than extraction's escaped presentation.

## Ownership and limits

The implementation shares the existing native tree and mutation machinery. It
does not parse assigned strings as HTML, execute scripts, allocate a second title
metadata owner or depend on a browser engine.

Creation stages a title in a temporary native tree and uses the existing atomic
fragment-import path. Node, text and depth quotas are checked before changing the
live document. The import's bookkeeping fragment counts toward the destination
node quota; tests make that cost explicit. Existing-title replacement preserves
old nodes as detached identities and retains existing lifetime allocation limits.

The current document model supports HTML, not namespace-aware SVG/XML title
semantics. This does not add custom-element reactions, full Web IDL reflection,
object-to-string coercion, tab-bar rendering or released-runtime acceptance.

## Reference and validation

Primary references reviewed September 3, 2026:

- `https://html.spec.whatwg.org/multipage/dom.html#document.title`
- `https://html.spec.whatwg.org/multipage/semantics.html#the-title-element`

Twenty initial binding/native-tree regressions failed before implementation.
Thirty-two new tests cover direct-child text, whitespace, title identity/order,
creation and replacement limits, literal text, extraction safety, lifecycle and
trusted native parser hooks. The mock host-object factory is non-extensible so a
missing setter cannot appear to work by creating a test-only JavaScript property.

The fourteen existing extraction tests were absent from `native-tests.json`.
Their imports and fixtures were reviewed as native tree/formatting tests with no
network, socket, TTY or SafeJS execution; they are now explicitly included. Earlier
native-suite totals are not retroactively changed to claim that coverage.

Focused validation passes 86 tests across four native files. The full working tree
passes 6,141 tests across 188 explicit files with no unhandled errors. Production
build, strict new-test typechecking and four-source lint/formatting pass. Existing
import organization in the pre-existing dirty binding file is preserved.
An isolated HEAD snapshot with only these source/allowlist changes also typechecks
and passes 3,381 tests across 127 available allowlisted files, excluding the
pre-existing unfinished feature work.

Native binding and parser-hook evidence is not actual guest execution. The separate
released-SafeJS, real-site, socket, UI and broader browser acceptance gates remain
open. No denied probe was retried or runtime acquired for this change.
