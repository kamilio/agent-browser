# Sandbox-owned Object prototype

The later `LIVE-COLLECTIONS.md` checkpoint resolves the collection-method blocker
reported below and records the newer style/CSSOM failure. This document retains
the evidence and limits of the earlier Object intrinsic milestone.

September 2, 2026, approximately 01:47 UTC. The isolated SafeJS candidate now
implements the ordinary-object portion of upstream issue #544. It is not a
published upstream implementation or a complete intrinsic prototype graph.
No dependency is added, installed or upgraded.

## Implemented

- Each realm has its own Object constructor and Object.prototype. Ordinary
  objects inherit sandbox-owned methods, never the native process's prototypes.
  Prototype mutations persist within the realm, are budgeted, and do not leak
  to another realm. Closing releases the intrinsic retention source.
- Generic `toString` identifies supported primitives and branded guest values
  without inspecting user-spoofable internal field names or invoking host getters.
  Cached calls such as `({}).toString.call(value)` work.
- `hasOwnProperty`, `propertyIsEnumerable` and static `Object.hasOwn` inspect
  guest-visible properties, not interpreter records. Static/prototype receiver
  coercion order differs intentionally. Native intrinsic property tables are
  non-enumerable to guest inspection; guest function own descriptors are honored.
- `valueOf` preserves object identity. Ordinary-object `toLocaleString` calls the
  current guest `toString`. `isPrototypeOf` traverses the bounded synthetic chain.
- `Object()`, `new Object()`, ordinary-object `Object.getPrototypeOf`,
  `Object.create(null)` and ordinary custom prototypes work. Literal prototype
  setters distinguish null/custom prototypes from a computed own `__proto__` key.
  Enumeration, inherited reads, shadowing and `instanceof Object` use this model
  for ordinary objects. Native capability callables remain read-only.

All of this lives in SafeJS source; the browser consumes its compiled public core.
There is no jQuery rewrite, native JavaScript evaluator or browser-specific type
inspection shim.

## Explicit limits

Primitive boxing, Object.create descriptor maps, exotic prototype reflection,
the Array/Function intrinsic prototype graphs, inherited accessors and symbol
semantics remain unfinished. In particular, do not infer Array/Function
inheritance from ordinary-object tests. Implicit coercion is not yet fully
inheritance-aware. Generator-function intrinsic tagging is also incomplete.
Unsupported boxing, descriptor maps and exotic reflection reject explicitly.

Plain-data replay encoding and the lower-level object-graph serializer reject
explicit custom/null prototype state instead of silently erasing it. Public run
dumps reject direct intrinsic prototype references and modified Object prototype
state. Existing source-replay behavior for ordinary guest constructors remains
unchanged; an overly broad intermediate dump guard broke a Promise regression
and was narrowed before final validation. Complete intrinsic snapshot support
remains open.

Object is now a constructor rather than a namespace record. Its diagnostic dump
binding consequently changes to a function marker. The immutable historical
regex checkpoint test explicitly expects that one binding change while retaining
all other graph, source-hash, aliasing and replay assertions. This is not a claim
of byte-identical old and new diagnostic dumps.

## Evidence

- Browser suite: 1075 passes across 61 files; strict package compilation and the
  configured 143-file Biome check pass.
- New Object suite: 33 passes, including 14 native type-inspection comparisons,
  isolation, cleanup, budgeting, reflection, coercion order and dump boundaries.
  The focused SDK regression run passes 248 tests across seven files.
- Final native-config SDK run: 8012 passes, 30 failed assertions, six skips,
  54 failed files. Exact failed assertion/file identities match the preceding
  7979-pass checkpoint: 33 additional passes, not a green upstream release gate.
- Changed production paths and the new dedicated test file compile strictly using
  existing tooling. The candidate is separately rebuilt; the installed SDK is
  untouched. The combined patch passes applicability checks against the pinned base.
- Final compiled-core probes: 30 website-script checks (28 automatic fixtures and
  two public reporting checks), 17 timer checks and 22 executable CLI/paired API
  checks pass. The automatic fixture exercises cached type inspection and ordinary
  and null prototype reflection without injecting replacement page behavior.
  All probe-owned actors and the isolated CLI service close.

Reports are indexed in `reports/README.md`; source artifact provenance and its
current hash are in `SAFEJS-EXTENSIONS.md`.

## Real websites and next work

Unmodified Books to Scrape jQuery advances past the previous type-inspection
failure and now reaches missing element `getElementsByTagName` in the browser DOM
bridge. That is browser work, not an upstream SafeJS intrinsic request. Quotes to
Scrape still stops at missing `Date.now`, tracked by #543. Both sites still fail
automatic JavaScript compatibility; successful reporting checks are not acceptance.

Next: live DOM collection/query support and the Date handoff, alongside the full
terminal/playground/Playwright-like superset ledger. #540's unified extension
lifecycle and the full 72-hour browser objective remain unfinished.
