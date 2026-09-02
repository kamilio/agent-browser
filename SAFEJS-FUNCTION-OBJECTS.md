# SafeJS guest function objects

The later `SAFEJS-OBJECT-PROTOTYPE.md` checkpoint adds ordinary Object intrinsics
and records the newer real-site failures. The evidence below is this earlier
function-object milestone, not the latest complete browser compatibility result.

September 2, 2026, approximately 01:30 UTC. This is a local SDK candidate for
`poe-platform/poe-code#541`, not a published upstream implementation or complete
ECMAScript object model. No dependencies are added or installed.

## Implemented boundary

Guest functions have sandbox-owned property tables, separate from their frozen
interpreter closures. Ordinary constructors get distinct prototype objects and
guest constructor links. Own properties, inherited data properties and methods,
prototype replacement, bound construction, `in` and guest `instanceof` work
without traversing native JavaScript prototypes. Reflection, assignment, deletion,
enumeration and shallow freezing use these guest tables. Native capability and
intrinsic callables remain read-only; native property lookup is own-only.

Prototype traversal charges interpreter work. Synthetic chains are limited to
256 links, and retained-data accounting includes guest function and prototype
state. Live host grants cannot become constructor prototypes. Ordinary guest
functions retain their properties across page evaluations; fresh restored
constructors receive the default guest table. Snapshot/replay explicitly rejects
modified function properties and custom prototype state rather than silently
discarding it. This serialization limitation is intentional, not full support.

Intrinsic Object/Function/Array prototype graphs, inherited accessors, generator
intrinsic prototypes and complete exotic property-key coercion remain absent.
The generic extension lifecycle requested in #540 is still unfinished. Browser
code consumes the compiled public SafeJS core, not private interpreter modules.

## Validation

- Browser suite: 1075 passing tests across 61 files; strict package compilation
  and the configured 143-file Biome check pass.
- New guest-function suite: 21 passing tests. Focused SDK regression run:
  538 passes across five files. The restoration suite separately passes 69 tests,
  including one new restored-constructor regression.
- Native-config full SDK run: 7979 passes, 30 failures, six skips and 54 failed
  files. Both failed assertion identities and failed file paths match the prior
  7957-pass checkpoint exactly: 22 added passes, not a green upstream gate.
- Strict compilation passes for changed production paths and the new function
  suite. Including the legacy restoration test file produces 29 diagnostics;
  compiling its original source through an in-memory compiler host produces
  exactly the same diagnostics. These are retained, not suppressed or fixed.
- Final compiled-core owned-process checks: 29 website-script checks (27 fixtures
  and two public reporting checks), 17 timer checks and 22 executable CLI/paired
  API checks pass. The new automatic fixture constructs an inherited guest
  object and a native click invokes its inherited method, updating semantic text.
  All probe-owned actors and the isolated CLI service close.

Reports and the baseline comparisons are indexed in `reports/README.md`.
The combined, applicability-checked source patch is described in
`SAFEJS-EXTENSIONS.md`; no installed SDK is modified.

## Real website results

The final build was tested against unmodified public page scripts, not a patched
jQuery or a mocked browser engine. Both sites still fail automatic compatibility:

- Books to Scrape advances to cached plain-object `toString.call` inspection;
  its guest Object prototype method is absent.
- Quotes to Scrape advances to `Date.now`; the Date intrinsic is absent.

The bounded diagnostic report preserves source hashes and error locations.
Minimal compiled-public-core reproductions are also retained. The user-authorized
Poe Code issues #543 (bounded replay-aware Date) and #544 (sandbox-owned Object
prototype inspection) were filed and verified open. Their bodies are in
`upstream-issues/`. No public dynamic-site acceptance, anti-bot parity, full
JavaScript conformance or completion of the 72-hour browser goal is claimed.
