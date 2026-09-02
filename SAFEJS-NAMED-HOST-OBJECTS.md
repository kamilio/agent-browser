# SafeJS named live capabilities

September 2, 2026. User-authorized issue `poe-platform/poe-code#546` requests this
generic extension primitive. The isolated local candidate implements it; no
upstream merge/release, installation or modification of the installed SDK is
claimed. It complements #545's indices and does not complete #540's extension
manifest/registration/lifecycle contract.

## Public boundary

`HostObjectDefinition.named` accepts maxKeys (1–65,536), maxKeyCodeUnits
(1–1,048,576 aggregate UTF-16 units), synchronous keys()/get(name) providers,
and optional enumerable (default true). `HostObjectNamed` is exported from the
normal and lightweight core entrypoints. The browser imports only public exports.

Declarations reject unknown/accessor fields and malformed bounds without running
declaration getters. Live key lists must be dense own-data arrays of distinct
strings within both declared limits. Sparse arrays, accessors, proxies,
non-string entries and prototype capability names reject. Rejected async key
promises are consumed before reporting the synchronous-provider violation, so
they do not become unhandled host rejections.

Virtual named descriptors share the normal identity, work accounting, conversion,
error and cancellation boundaries. Lookup and membership see current keys; values
are fetched only on actual reads. Fixed members take precedence, and an indexed
provider owns canonical numeric names when present. Enumeration can omit named
aliases while retaining numeric entries. Object.values, object spread and for-in
observe current descriptors, including removal during an earlier getter.

Virtual names are read-only; guest writes, assignment and deletion cannot replace
host state. Freezing a capability with virtual keys rejects. Saved virtual getters
are revoked when their realm closes. Live objects remain excluded from plain copy
and replay serialization. Full native reflection or all legacy-platform-object
semantics are not implied. There is no native Proxy or eager getter-per-key table
in the production implementation.

DOM attributes, query policy, resource storage and attachment semantics stay in
the browser package (`DOM-ATTRIBUTES.md`), not in SafeJS. The named metadata also
provides a future basis for named collection access, without claiming that every
browser collection already implements it.

## Verification

- Nineteen new named tests plus seventeen indexed tests pass: 36 across two files.
  `reports/safejs-named-host-focused-2026-09-02.json` retains the result.
- Native-config full SDK run: 8048 passes, 30 failed assertions, six skips and
  54 failed files. `reports/safejs-named-host-baseline-comparison-2026-09-02.json`
  proves exact failed-assertion and failed-file identity against the preceding
  8029-pass candidate. There are nineteen additional passes, not a green SDK
  release gate. No missing test dependencies were installed or mocked.
- The lightweight public core and new tests compile strictly with existing tools
  and Bun ambient types. The full package build still encounters unavailable
  optional agent/MCP/tool dependencies; it is not claimed green. Actual browser
  probes load the strictly compiled lightweight core, not those optional modules.
- Actual owned browser processes exercise named/indexed Attr identity, real
  attribute mutation, native actions and semantic visibility. Public diagnostic
  and permission-restricted outcomes remain separately classified.

The combined contribution patch was regenerated and applicability-checked against
base `7fbbd81fd99c46928bcf314ad89410b946d203cc`. See `SAFEJS-EXTENSIONS.md` for
the current hash and provenance. No PR, commit, push or publication is made.
