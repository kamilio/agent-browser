# Programmatic document types

Native checkpoint, September 4, 2026. This is the first document-creation step
toward inert HTML documents and templates, not a claim that template parsing or
the complete DOMImplementation interface is implemented.

## Connected APIs

- `document.implementation` returns one owner-bound capability per ScriptDom.
- `implementation.createDocumentType(name, publicId, systemId)` requires all
  three arguments, performs the existing primitive DOM-string conversion, and
  returns a detached DocumentType belonging to that document.
- `implementation.hasFeature(...)` is the historical argument-insensitive true
  result. It is not a report that this browser implements the queried feature.
- `document.doctype` returns the current direct doctype child or null, preserving
  capability identity as nodes are inserted, replaced and removed.
- DocumentType exposes nodeType 10, name/nodeName, publicId, systemId and ordinary
  Node ownership/relations. Name and identifiers are readonly; nodeValue and
  textContent are null and their setters do not change the node. It has no
  children, supports ChildNode removal/movement, and cannot be an insertion parent.
- `cloneNode` and `importNode` preserve name and both identifiers, charge the
  destination quota and create independent node identities. Equality compares all
  three strings, not just the node kind.

The native `DocumentTree.createDocumentType` convenience method defaults omitted
identifiers to empty strings. Its script-facing counterpart keeps the required
three-argument contract.

## Validation and ownership

The current DOM valid-doctype-name rule excludes ASCII whitespace, NUL and `>`.
It is not the older XML qualified-name rule: empty names, slashes and mixed case
are retained. Identifiers are bounded strings, not DTD instructions; no external
subset fetching or entity resolution is introduced.

Name/public/system data live in frozen doctype metadata, not the element tagName
field. A doctype named `script` therefore cannot be mistaken for a script element
by tag-oriented consumers. All metadata counts toward native text retention;
create, clone and import quota failures happen before node allocation.

Shared insertion validation computes the final document order before mutation:
at most one doctype, before the sole element, and no text children. Replacement
accounts for the removed node and moving nodes. Doctypes cannot enter elements
or fragments. The general native tree's pre-existing forest behavior remains
unchanged when no doctype participates; script document insertion always enforces
document hierarchy. Native insertion tracks the attached doctype without scanning
every ordinary document child on each append.

The implementation object uses the existing guarded publication owner as a fourth
capability kind. It participates in the 128-active-publication limit and is revoked
on owner close. It does not consume attribute-map quota or survive teardown.

## Serialization

HTML serialization emits `<!DOCTYPE name>` for a doctype child or an include-self
doctype request. It does not include public/system identifiers, as required by
the HTML fragment serializer. Output limits still apply. XML serialization is a
separate, unimplemented contract.

## Evidence

Four initial API regressions fail before implementation. Forty new native cases
cover names, identifiers, required arguments, identity, null node values, equality,
cloning/import, hierarchy/order, comments, replacement, quota failures, serialization
and closure. Focused validation passes 334 tests across nine explicit files.

Full native validation passes 7,977 tests across 226 files. A separate snapshot of
committed HEAD plus only this owned patch passes 5,217 tests across its 165
available allowlisted files. Production/new-test types, builds and eight-file
Biome checks pass in both trees. Pre-existing pending changes remain outside the
checkpoint and historical measurements are not rewritten.

## Remaining document work

1. Add bounded `createHTMLDocument`, correct inert-document ownership/defaults,
   shared family admission and teardown, using this doctype primitive.
2. Preserve parsed DOCTYPE tokens and identifiers, with explicit compatibility
   mode behavior. The current parser still does not materialize those tokens;
   this checkpoint's `document.doctype` reflects programmatically inserted nodes.
3. Add the actual template content-owner model and ownership-aware cloning,
   importing, movement and HTML serialization, then connect parser insertion modes
   and inert script behavior. Do not merely remove the parser's template rejection
   or treat template contents as ordinary child nodes.

`createDocument`, XML namespaces, complete WebIDL conversion, cross-document
adoption and full template/runtime/site acceptance remain open. No SafeJS, live
website, socket or real TTY/PTY probe ran. The previously denied probe remains
unrun; native results do not close those independent gates or the seven-day goal.

## Research

Reviewed the current [DOMImplementation and DocumentType definitions](https://dom.spec.whatwg.org/#interface-domimplementation),
[doctype-name validation](https://dom.spec.whatwg.org/#valid-doctype-name), and
[HTML fragment serialization](https://html.spec.whatwg.org/multipage/parsing.html#serialising-html-fragments)
on September 4, 2026. The implementation uses current doctype-name rules rather
than assuming legacy XML name validation.
