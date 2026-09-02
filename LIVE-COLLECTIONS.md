# Live DOM collections

September 2, 2026, approximately 02:06 UTC. Document and element
`getElementsByTagName` / `getElementsByClassName` now return live, indexed
HTMLCollection-style capabilities. `children` uses the same live collection
implementation on documents, elements and fragments. No dependency is added.

## Behavior

- Saved collections refresh after insertions, removals, reordering, reparenting
  and relevant attribute changes. Descendant queries exclude their owner and
  return elements in tree order; children is direct and element-only.
- Tag queries support the wildcard and ASCII case folding for the current HTML
  model. Class queries match all ASCII-whitespace-separated tokens without routing
  class names through a CSS selector parser.
- `length`, numeric indexing, `item` and `namedItem` read current state. A missing
  numeric index is undefined; a missing item/name lookup is null. Required argument
  checks and primitive unsigned index conversion are implemented. Object coercion
  remains explicitly unsupported.
- Element identity is shared with other DOM operations. Guest for-of, spread,
  Array.from, own-key inspection and membership use the generic SafeJS indexed
  capability. Array.from preserves shallow element identity rather than deep-copying
  live nodes. Iteration observes mutations, not a hidden snapshot array.
- Children has stable collection identity. Repeated normalized queries reuse a
  bounded cache. Detached subtree collections remain usable until document close;
  close invalidates reads and releases cached IDs.

`children` is no longer an Array: use Array.from when Array methods are needed.
The browser owns querying and invalidation in `src/script-collections.ts`.
SafeJS only provides the generic indexed capability described in
`SAFEJS-INDEXED-HOST-OBJECTS.md`; it contains no DOM special cases or native Proxy.

## Limits and incomplete coverage

The default store permits 256 live collections, up to the document node limit
(capped at 65,536) per collection, 200,000 cached IDs across collections,
250,000 work units per refresh/lookup, and 16,384 query code units. Refresh work
counts visited nodes and class-input units. Caches refresh on document revisions.
Exceeding a limit fails explicitly; no live capability is silently evicted.
The SafeJS array-length/work budgets apply independently (the default realm array
limit is 16,384). These are internal host limits, not new CLI flags.

This is not a complete WebIDL HTMLCollection implementation. Named bracket
properties, intrinsic collection prototypes/type tags, all borrowed Array methods,
namespaces and quirks-mode differences remain unfinished. childNodes still uses
the earlier snapshot-array representation; querySelectorAll remains a static
snapshot array rather than a fully modeled NodeList. Live NodeList methods and
the wider DOM/CSSOM feature ledger remain open.

## Validation and real websites

The browser suite passes 1087 tests across 62 files, including 12 new collection
tests for ordering, liveness, identity, names, unsigned indices, detached roots,
cleanup, caching and resource limits. Strict package/new-test compilation and
the configured 145-file Biome check pass.

The actual compiled-public-core process probe passes 34 website-script checks:
32 automatic fixtures plus two public reporting checks. New fixtures query and
save collections, append nodes, iterate and copy them, then dispatch a native
button action that removes a node and changes class membership. Final timer and
executable CLI/paired-API regressions pass 17 and 22 checks respectively. All
probe-owned actors and the isolated CLI service close. No new visual UI run is
claimed. Reports are indexed in `reports/README.md`.

Unmodified Books jQuery advances past getElementsByTagName and now fails when
assigning `element.style.cssText`; the native style/CSSOM bridge is missing.
Quotes still requires Date.now (#543). Both public sites remain incompatible;
successful reporting checks are not dynamic-site acceptance. Next: style/CSSOM,
Date and the remaining terminal/playground/Playwright-like superset ledger.
The full 72-hour goal remains active.
