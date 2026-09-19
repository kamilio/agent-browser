# SafeJS object-literal accounting and snapshot compatibility

The interpreter allocates new object literals with the existing private tracked
object factory instead of an untracked null-prototype object. Its existing
descriptor revision/projection cache avoids repeated descriptor discovery;
descendant values are still traversed and charged on every measurement.
Restored object identities and all existing budget/depth checks remain unchanged.

Tracked objects also require the accompanying snapshot compatibility repair.
The two runtime snapshot checks recognize only exact privately branded tracked
objects alongside existing intrinsic and module-namespace exceptions. The
data-properties-only transport boundary still rejects proxies, including tracked
objects. Unknown and outer proxies remain rejected without invoking their traps.

## Qualification

The patch applies to the exact private callback-prefix candidate
`/tmp/agent-browser-sdk-callback-prefix-zspAIs/candidate`; it contains only
`interp/interpreter.ts`, `snapshot/validation.ts` and their two new test files.
The qualified combined source is
`/tmp/agent-browser-sdk-literal-snapshot-kR8kMd/candidate`, which also includes the
separate retained-scope cache contribution. No moving SDK checkout is modified.

- Descriptor-reuse RED: five pass, one fails; GREEN: six pass. Related initial
  regression: 324 tests across 22 files. Combined accounting regression: 535
  tests across 38 files. A test-only Proxy generic annotation is corrected before
  the fresh passing strict type check, build and 14-case combined focused run.
- Snapshot RED with final assertions: five pass, twelve fail; GREEN: 17 pass.
  Supported core snapshot regression: 201 pass across six files; types/build pass.
- Three additional suites cannot load `@poe-code/agent-spawn/configs`; they are
  unavailable, not passing. A subsequent dependency-copy attempt is explicitly
  terminated and is not qualification. No full CLI/distribution claim is made.
- A later seven-case absent-capture change runs a 125-test regression including
  both new test files against these exact production changes; all pass.

Tests cover descriptor reuse/invalidation, descendant growth, aliases, symbols,
hidden properties, prototype/copy guards, runtime snapshots, restore/dump paths,
source mismatch and rejection of untrusted proxies/transport values.

## Native integration and limitation

Package `/tmp/agent-browser-restored-accounting-sdk-Utmqoo/package` passes all nine
actual native Event/legacy/Unicode checks in 11.884 seconds with unchanged core50.
All observed resources close; parent verifies 7,085 inputs and 43 artifacts.
Evidence: `/tmp/agent-browser-accounting-actual-0URWvP`.

The exact captured 417,914-byte Zoom vendor replay still times out at 120.230
seconds: 827,172 steps and 801,145 peak data units. Parent verifies 7,085 inputs
and 20 artifacts in `/tmp/agent-browser-accounting-vendor-8Ci2VZ`. This is a
synthetic-transport single-asset replay, not live Zoom or a verified speedup.

The contribution is not installed as the browser's default runtime. Usable
meeting UI, legitimate admission, incoming audio and notetaking remain open.
