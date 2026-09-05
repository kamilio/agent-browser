# HTML namespace reflection and queries

Native HTML element capabilities now expose readonly `namespaceURI`, `localName`
and `prefix`. The URI is `http://www.w3.org/1999/xhtml`, the local name is the
stored HTML name, and the prefix is null. This matches the engine's current
HTML-only element model; it is not foreign-content construction support.

Both Document and Element expose live `getElementsByTagNameNS(namespace, localName)`
collections. For example:

```js
const htmlNamespace = "http://www.w3.org/1999/xhtml";
const paragraphs = document.getElementsByTagNameNS(htmlNamespace, "p");
```

## Semantics and bounds

- Namespace and local-name `*` wildcards operate independently. Otherwise both
  comparisons are case-sensitive. In particular, namespace queries do not apply
  the ASCII folding used by the existing HTML `getElementsByTagName` method.
- Empty, null and undefined namespace inputs normalize to null. No currently
  supported native element has a null namespace, so these queries are empty.
  Arbitrary nonmatching namespace strings also produce empty collections.
- Queries traverse receiver descendants in tree order. An Element excludes
  itself; a Document includes its document element. Fragment capabilities do not
  acquire this Document/Element method. Existing template boundaries are retained.
- Collections stay live across insertion, removal, reordering and naming changes.
  Indexed access, `item`, `namedItem`, node identity and equivalent-query caching
  reuse the existing per-document collection implementation and shared quotas.
- Namespace plus local-name code units share the existing query-string budget;
  defaults are 16,384 query units, 256 collections, 200,000 cached entries and
  250,000 work units. Existing item limits and host override restrictions remain.
  No separate unbounded namespace cache is introduced.
- The script API requires two arguments and uses the existing bounded primitive
  DOM-string conversion policy. Object/function/Symbol conversion is unsupported
  without invoking user hooks; this is not full Web IDL coercion. Low-level
  `ScriptCollections.getByNamespace` requires primitive string/null arguments.
- Reflection does not mutate the tree. Getter and collection operations are
  revoked when their document/DOM owner closes. New query publication participates
  in the existing rollback, reentrancy and accounting rules.

Ordinary HTML `xmlns` attributes do not change an element's namespace. Colon-like
names created through ordinary HTML APIs do not acquire a namespace prefix.
`document.createElement("svg")` still creates an HTML-namespace element named
`svg`, not an SVG element. Existing Attr reflection remains unchanged.

## Evidence

`node_modules/.cache/native-validation/html-namespace-dom/` contains the clean
snapshot validation and runtime evidence. Seven explicit native manifest suites
pass 178 cases: 63 new namespace cases and 115 existing DOM, collection, attribute,
HTML-document and template cases. Build, strict new-suite types and four-file
Biome checks pass. No whole-manifest result is claimed.

A separately authorized probe used the unchanged original `@poe-code/safe-js`
package, version `0.0.1`, through its legacy factory. The directory name
`safejs-13.0.10` is not the package version. On September 5, 2026, from
13:02:21.254944076 to 13:02:21.546729610 UTC, two bounded guest evaluations passed
28 checks, including query/node identity and live mutation behavior. After a
format-only change altered emitted layout, a separately authorized final-build
run at 13:07:51.173799359–13:07:51.460070935 UTC passed the same 28 checks, and the
seven native suites passed again. All owner,
interaction, tree and runtime cleanup checks passed. It used synthetic HTML,
no network or credentials, and no new host-constructor API or identity probe.

The official mutable DOM source was separately retrieved through the native
browser at 12:52:51.535 UTC. Its 476,405-byte capture has SHA-256
`d98c6542f35f2aa976cfbf037f8cd1f556c09a704700f19a0a163100935098ff`.
Navigation loaded, but native extraction failed its resource limit. Normative
section inspection therefore used bounded local raw-source windows, explicitly
not successful native extraction. `research/dom/REPORT.md` records exact source
lines and the limits of the template/coercion interpretation. No spec examples ran.

## Remaining browser work

This does not enable SVG/MathML tree construction, XML documents, namespaced
attribute creation, qualified-name creation, `createElementNS`, namespace lookup,
foreign-content integration points or vector rendering. Those need a coherent
namespace-aware node model plus parser, serialization, selectors, controls,
action/security and rendering behavior before foreign parsing can be enabled.
HTML nodes must not silently become foreign nodes just because their name is svg.

Large-document gates also remain. A separately authorized offline replay of the
previously captured Fetch Standard through the ordinary native loader exceeded
50,000 nodes at an attempted 50,001. Its older reader run separately exceeded
the reader text budget. No limits were raised, no fresh Fetch-standard request
was made, and no historical failure was changed into successful loading. The
full-loader result is under `native-full-loader-investigation/evidence/` beside
this feature's cache directory.

The full browser goal and all previously denied or stopped constructor, identity,
RP, device, credential and research gates remain open or unchanged. This namespace
probe does not authorize or substitute for any of those gates.
