# Native document collections

September 3, 2026 continuation of the JavaScript-application work in the seven-day
plan. This checkpoint adds missing document collection accessors to the existing
bounded native collection owner; it does not add a second query engine or runtime
dependency.

## Behavior

The native document capability now exposes these readonly, live collections:

| Property | Members |
| --- | --- |
| `links` | `a` and `area` elements with an `href` attribute, including an empty value |
| `anchors` | `a` elements with a `name` attribute, including an empty value |
| `scripts` | All `script` elements, regardless of type or execution state |
| `embeds` | `embed` elements, not `object` or `applet` elements |
| `plugins` | The same collection object as `embeds`, not an installed-plugin inventory |

Repeated property reads return the same capability. Members are connected
descendants of the document in tree order, represented by the existing native
node capabilities rather than copies. Attribute changes, parsed HTML insertion,
node moves, removal and body replacement update saved collections. Detached nodes
and fragments do not contribute members until connected to the document.

The existing collection interface supplies numeric indexed access, `length`,
`item()` and `namedItem()`. Named lookup checks IDs and names in filtered tree
order; an empty lookup returns null. An out-of-range index returns undefined,
while an out-of-range `item()` returns null. These additions do not change the
existing `forms` or `images` accessors.

## Ownership and limits

The revision cache, collection-count limit, item limit, aggregate retained-entry
limit and traversal-work limit are shared with existing collections. Filtered-out
nodes still count toward traversal work. Failed refreshes do not publish partial
results or corrupt retained-entry accounting; subsequent reads can recover after
the tree returns within budget. Closing the binding or document revokes retained
collection access. Separate bindings keep separate capabilities.

## Native validation

All seventeen initial reproductions failed before implementation. The expanded
suite has thirty-eight cases covering filters, stable identity, plugin aliasing,
readonly properties, node identity, live mutation, lookup ordering, indexed
conversions, owner isolation, closure, cache reuse and resource-failure recovery.
Tests use a native mock host-object factory and offline parser fixtures. Script
elements in fixtures are data; no guest script, network request or plugin is run.

Validation on September 3, 2026:

- Focused document/collection regressions: 104 tests across four files pass.
- Full working tree: 6,213 tests across 190 explicitly allowlisted native files
  pass, with no unhandled errors.
- Isolated HEAD-plus-owned-patch snapshot: typechecking and 3,453 tests across 129
  available allowlisted native files pass, independently of unfinished work.
- Production build, strict new-test typechecking, source/test lint and formatting
  pass. Initial test lint rejected three non-null assertions; explicit fixture
  guards replaced them before final validation.

## Limitations and references

These are native host-binding tests, not evidence of released-SafeJS execution,
real-site or framework compatibility, terminal/playground interaction, or real
socket acceptance. Those gates remain open and separately authorized. Collections
do not add module loading, plugin execution, namespace-aware SVG/XML filtering,
template content, shadow trees, arbitrary named JavaScript properties, or full
WebIDL coercion/prototype parity. `document.all`, `applets` and the live NodeList
returned by `getElementsByName()` are not implemented by this checkpoint.

Primary references reviewed September 3, 2026: WHATWG HTML, DOM tree accessors
(`https://html.spec.whatwg.org/multipage/dom.html#dom-document-links`) and obsolete
Document members (`https://html.spec.whatwg.org/multipage/obsolete.html#dom-document-anchors`),
plus the DOM collection model (`https://dom.spec.whatwg.org/#concept-collection`).
