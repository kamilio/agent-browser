# Local ordinary Object intrinsic candidate

The local v13.0.10-based candidate now provides realm-owned Object construction,
Object.prototype, generic type inspection, own/enumerable property inspection,
ordinary/null prototype reflection and bounded prototype traversal. No native
Object/Function prototype is granted or mutated. Cached `({}).toString.call(value)`
works against guest brands rather than spoofable interpreter fields.

The candidate preserves prototype mutation within a realm, meters retained values,
and releases intrinsic retention on close. Separate and sequential realms are
tested for isolation. Native capability callables remain read-only. Literal null
and custom prototype setters are distinct from a computed own `__proto__` key.

Still incomplete: primitive boxing, Object.create descriptors, exotic reflection,
Array/Function intrinsic graphs, inherited accessors, symbols and fully inherited
implicit coercion. Unsupported boxing/descriptors/exotic reflection reject.
Plain-data graph encoding and execution dumps have explicit prototype limitations.
Object's diagnostic dump binding changes from namespace to constructor; immutable
historical regex checkpoint tests retain every other graph/hash/replay assertion.
Existing ordinary-constructor source replay continues to pass.

Final September 2 validation:

- 33 new Object cases, including 14 native type-inspection comparisons.
- Focused SDK run: 248 passes across seven files.
- Full native-config SDK run: 8012 passes, 30 failed assertions, six skips and
  54 failed files. Failed assertion/file identities match the prior 7979-pass
  candidate exactly. This is not a green upstream gate.
- Browser suite: 1075 passes. Final public-core process probes: 30 website-script,
  17 timer and 22 actual executable CLI/paired-API checks pass; processes close.
- Unmodified Books jQuery passes the old Object inspection failure and now reaches
  missing element getElementsByTagName in our DOM bridge. Quotes still needs
  Date.now (#543). Neither site passes automatic JavaScript compatibility yet.

The combined local source patch applies against
`7fbbd81fd99c46928bcf314ad89410b946d203cc`; SHA-256:
`9e1328ab48249182fe0393f8a82693ed263149610306e2065cce43d2c8f88326`.
No dependency was added and no installed SDK, release, PR, commit or push was
changed. This is not an upstream implementation claim or completion of #540's
unified extension lifecycle.
