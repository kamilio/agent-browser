# Ordered native attribute enumeration

September 3, 2026 continuation of the JavaScript-application plan. Native elements
now expose `getAttributeNames()`, with one shared attribute-list order across
parsing, native mutation, NamedNodeMap indices, cloning/import and HTML output.

## Root correction

JavaScript object enumeration sorts canonical integer-index keys before ordinary
string keys. Using that order for an HTML attribute list incorrectly moved names
such as `9` and `1` ahead of earlier attributes. For example, the DOM order of
`<div z="z" 9="nine" 1="one">` is now `z`, `9`, `1`, not `1`, `9`, `z`.

The native attribute helper keeps insertion-order metadata in a WeakMap when a
canonical integer-index name first appears. Ordinary dictionaries and empty
nodes do not eagerly allocate an order set. Values remain plain records, without
Proxy access overhead, additional enumerable properties or runtime dependencies.
Frozen native snapshots retain independent order metadata while preserving their
existing ordinary-object prototype and value semantics.

All supported native attribute writes/removals update that order. Updating a value
or replacing an attached Attr preserves its slot; removing and re-adding a name
appends it. Duplicate parsed attributes retain the first occurrence. Repeated
html/body tag merges, contextual fragment imports and cross-tree copies preserve
the same order. The engine also uses it for its implementation-specific ordering
between Attr nodes on the same element.

## API and bounds

`element.getAttributeNames()` returns a fresh array of qualified attribute names,
including integer-like, empty-valued and prototype-like attributes. It allocates
no Attr nodes and does not change the document revision. Editing the returned
array does not edit the DOM. The method ignores extra arguments, is absent on
non-elements, and rejects access after binding or tree closure.

The getter and NamedNodeMap share the existing enumeration limits: 4,096 names
and 65,536 aggregate name code units. Existing native text/node limits still
apply to creation and mutation. Budget failures do not alter values, captured
Attr identity or order. Names can be removed to recover an over-limit enumeration.
The WeakMap does not strongly retain otherwise unreachable attribute records.

Low-level `DocumentNode.attributes` is still a JavaScript value dictionary:
`Object.keys()` and JSON retain ordinary JavaScript key-order semantics. Consumers
requiring DOM order use `DocumentTree.getAttributeNames()` or the native ordered
helpers. The custom native `createElement(tag, record)` API takes an ordinary
external Record in its observable JavaScript enumeration order; it cannot recover
source-literal ordering that JavaScript has already discarded.

## Evidence

An initial serializer test omitted the existing `includeSelf` option; it was
corrected without changing serializer defaults. Rerunning the eight corrected
reproductions against an isolated original HEAD produced eight failures. The
expanded suite has twenty-five native cases, including every split of a token
with numeric/duplicate/prototype-like attributes, readonly snapshots, Attr
replacement, imports, exact integer-index boundaries, limits and closure.

Focused validation passes 196 tests across six explicit native files. Tests use
offline documents and native host-object fixtures, not a released guest runtime
or another browser.

Final September 3 validation: the full working tree passes 6,368 tests across 196
explicit native files, with no unhandled errors. An isolated HEAD-plus-owned-patch
snapshot passes typechecking and 3,608 tests across 135 available native files,
independently of pre-existing unfinished work. Production build, strict new-test
types and targeted source/test lint and formatting pass.

## Remaining gates

Actual SafeJS array/NamedNodeMap behavior, framework/site acceptance, real sockets
and terminal/playground interaction remain separately authorized and unverified.
Namespace-qualified duplicate names, exact WebIDL/prototype parity and the broader
browser requirements remain open. Historical reports retain their original
measurements; this checkpoint does not reinterpret them as live validation.

Primary references reviewed September 3, 2026:
`https://dom.spec.whatwg.org/#dom-element-getattributenames`,
`https://dom.spec.whatwg.org/#interface-namednodemap`, and
`https://html.spec.whatwg.org/multipage/parsing.html#serialising-html-fragments`.
HTML serialization uses the native list order as its stable implementation choice.
