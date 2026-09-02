# SafeJS indexed live capabilities

September 2, 2026. User-authorized upstream issue `poe-platform/poe-code#545`
requests bounded indexed host objects. The local SDK candidate implements the
primitive; no upstream release, merge, dependency installation or installed SDK
modification is claimed. #540's unified extension lifecycle remains unfinished.

## Public shape and separation

`HostObjectDefinition` accepts optional `indexed` data with `maxLength`, a
synchronous `length()` getter, and synchronous `get(index)`. The public
`HostObjectIndexed` type is exported from the normal and lightweight core
entrypoints. Declarations require a positive maximum no greater than 65,536,
reject numeric/static length conflicts, and are validated without invoking
declaration accessors. Empty collections use a positive maximum and length zero.

The bridge validates current lengths against that declaration and the realm
budget. Out-of-range and non-canonical keys do not invoke the element getter.
Values pass the existing conversion, identity, error and revocation boundaries.
Index writes, assignment into indices, deletion of existing indices, and freezing
indexed state reject. Length is a read-only, non-enumerable own property.

Virtual indices are interpreted capabilities, not a native Proxy or thousands
of preallocated getters. Read/own-key/membership/iteration paths consult generic
capability metadata. Enumeration charges work and allocation budgets; retained
data measurement does not enumerate or fetch the collection's elements.
For-of, Array.from and object spread use this boundary, including mutation during
iteration/spread. Complete native reflection and every borrowed Array operation
are not implied. Live objects remain excluded from plain copy/replay boundaries.

The browser owns the DOM implementation and cache policy separately. It consumes
only `createHostObject` from the explicitly selected compiled public SDK; an older
SDK rejects the unsupported declaration rather than silently returning a snapshot.

## Evidence

- 17 new indexed-capability tests cover length changes, identity, virtual keys,
  iteration, mutation during spread, writes, limits, invalid names, async return
  rejection, declaration validation, copying and revocation.
- Focused SDK regression run: 561 passes across five files.
- Final native-config SDK run: 8029 passes, 30 failed assertions, six skips and
  54 failed files. Exact failed assertion/file identities match the preceding
  8012-pass candidate: 17 additional passes, not a green upstream release gate.
- Changed production paths and the dedicated new test file compile strictly using
  existing tools. No missing test dependency is installed or mocked.
- Actual browser-owned processes exercise saved live collections and native
  actions, not just a test factory. `LIVE-COLLECTIONS.md` records browser results.

The refreshed combined patch passes applicability checks against pinned base
`7fbbd81fd99c46928bcf314ad89410b946d203cc`; its hash and source provenance are in
`SAFEJS-EXTENSIONS.md`. Full browser compatibility is not achieved by this primitive.
