# Template contents script bindings

September 4, 2026 continuation of `TEMPLATE-OWNERSHIP.md` and the seven-day plan.
This checkpoint exposes the native contents model to script host objects. It
does not enable template parsing, cross-document adoption or a new page runtime.

## Contents and owner identity

Template elements expose a read-only `content` getter. It returns the same bound
DocumentFragment on repeated reads; siblings share one separately bound contents
document, while their fragment identities differ. Nested templates in that
document reuse its binding. Ordinary elements, documents and fragments do not
gain a `content` property.

Contents stay outside ordinary template children, queries, textContent and DOM
ancestry. Their own node, attribute, query, collection and mutation APIs operate
on the actual contents owner. HTML serialization and deep cloning use the native
template graph. Shallow template clones have empty contents. Explicit import
can copy a contents fragment into the main document for subsequent insertion;
foreign-node append still rejects rather than claiming adoption support.

The contents owner has no initial document element, head, body or doctype. Its
URL is about:blank, its origin is a distinct opaque identity, and its unrendered
bindings have null defaultView/location, empty cookies, no focus side effects,
zero geometry and no page storage or navigation provider. Its document type is
HTML internally, while contentType retains the standard's newly constructed
document default, application/xml; encoding is UTF-8 and mode is no-quirks.
Document type and MIME metadata are distinct. This follows the reviewed
construction algorithms, not an independently measured cross-engine result.

When callbacks are available, contents use their own native DocumentEvents,
without a Window target or the main page's dispatcher. Native wrapping of a
contents document also receives the inert defaults. No timer, network, Window
or storage capability is introduced by these bindings.

## Creation families and origin

Accessing contents associates its native owner with the initiating binding's
HTML-document family without consuming a createHTMLDocument attempt. The family
authenticates the source template/owner relationship. A contents owner cannot
silently join another family or create a new auxiliary family after association.

Calls to `implementation.createHTMLDocument` from the main document, created HTML
documents and associated contents owners share one lifetime admission counter
and the existing auxiliary resource pool. Template ownership in auxiliary
documents already uses that pool, so it cannot multiply quotas. The original
document and its contents retain their separate native aggregate budget.

Creation inherits the actual calling document's origin, not a fixed family-root
origin. Thus the main page's creations retain its origin, creations through a
contents owner retain that owner's opaque identity, and their descendants inherit
that same identity. Different contents owners' opaque identities stay distinct.
Unrelated native callers are rejected before admission. Both native caller
liveness and initiating ScriptDom liveness are checked after publication.

## Publication and teardown

The first contents binding is committed only after its document and requested
fragment capabilities have published. A guard rejects recursive first access,
including access through a sibling template during a factory callback. Existing
node publication guards reject premature callbacks and globally reused capability
identities. Failed initial publication revokes the candidate binding and its
owned event dispatcher without replacing the native contents document. A retry
can publish fresh capabilities. A later sibling-fragment failure does not revoke
an already successfully published owner.

Closing the initiating ScriptDom revokes retained contents capabilities and
closes the owned event dispatcher and auxiliary family, even when the native
main document remains open. Native document closure also revokes bindings.
Closing one auxiliary document closes its associated contents, but does not
close sibling or descendant HTML documents in the shared family. A closed
native contents owner is not replaced with fresh identities.

## Remaining gates

- Template `innerHTML` parsing, template fragment contexts and parsed template
  markup still reject. Actual insertion modes and owner-aware parser operations
  remain next; body-context substitution is not equivalent.
- Inert parser owners must suppress script, resource and policy side effects.
- Cross-document adoption, cross-owner observer/runtime integration, complete
  event construction/dispatch, prototypes, XML/namespaces, declarative shadow
  roots and content patching remain incomplete.
- Object-to-DOM-string title coercion remains explicitly unsupported; this
  checkpoint does not introduce guest object conversion side effects.
- No SafeJS, live website, socket or real TTY/PTY probe ran. The denied SafeJS
  probe remains unrun. Native evidence does not close those acceptance gates.

## Validation

Three initial regressions fail before implementation. The final 36 new tests
pass; 274 focused checks across seven files pass. On September 4, 2026 the
explicit native suite passes 8,228 tests / 232 files in the working tree and
5,468 / 171 available files in an isolated HEAD plus owned-patch snapshot.
Missing pre-existing untracked tests account for the smaller available isolated
set. Production/new-test typechecks, builds and three-file Biome checks pass in
both trees. The isolated source delta preserves pre-existing pending changes.

Tests use native host-object factories and injected callback interfaces. They
cover ownership, inert defaults, imports, origin identity, shared admission and
quota bounds, reentrant/failed/reused publication and independent teardown.
They are not released-SafeJS execution or live framework acceptance evidence.
Historical reports remain unchanged and the seven-day goal stays active.

## Research

Reviewed the WHATWG HTML template owner/content algorithms and DOM document
construction defaults and createHTMLDocument origin steps on September 4, 2026.
The template algorithm changes document type to HTML but does not overwrite
the default MIME metadata or opaque origin; createHTMLDocument explicitly sets
text/html and inherits its associated caller's origin.

Primary references: HTML Standard, “The template element”; DOM Standard,
“Interface Document” and “Interface DOMImplementation”. No reference engine or
page-runtime probe was used for this research.
