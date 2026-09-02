# Tested local indexed host-object candidate

The local v13.0.10-based candidate now implements optional
`HostObjectDefinition.indexed` with synchronous `length()` and `get(index)`
callbacks and a positive `maxLength` no greater than 65,536. The public type is
exported from normal and lightweight core entrypoints. Fixed members cannot
conflict with length or canonical indices.

The interpreter reads virtual indices through capability metadata: there is no
native Proxy, hidden evaluator or eager per-index getter allocation. Values use
existing host conversion/identity rules. Length, enumeration and iteration are
budgeted. Invalid/out-of-range names do not invoke the element getter. Index
writes, assignment, deletion of existing indices and freezing reject. Realm close
revokes access; existing plain-copy/replay restrictions remain.

For-of, Array.from, own keys/values, membership and object spread are integrated.
Array.from preserves shallow element identity, and spread skips an index removed
by an earlier getter. Every native reflection or borrowed Array operation is not
claimed supported.

Validation on September 2:

- 17 new capability tests; focused SDK run passes 561 tests across five files.
- Native-config SDK run: 8029 passes, 30 failed assertions, six skips, 54 failed
  files. Exact failure identities match the preceding 8012-pass candidate. This
  is not a green upstream gate; no missing dependency was installed or mocked.
- Browser suite: 1087 passes, including 12 new collection cases.
- Final real public-core process probes pass 34 website-script checks, 17 timer
  checks and 22 executable CLI/paired-API checks. Owned processes close.
- Browser-owned tag/class/children collections preserve identity and liveness
  through native DOM actions. Unmodified Books jQuery advances to missing
  element.style.cssText; Quotes still needs Date.now. Neither site passes full
  automatic JavaScript compatibility.

The combined local patch applies to
`7fbbd81fd99c46928bcf314ad89410b946d203cc`; SHA-256:
`6f86fee09099bc4f064ed2980944b55f595c26c9bc1aaba2e3d5c155bb205f77`.
No installed SDK, dependencies, PR, commit, push or release were changed. This
candidate does not complete #540's unified extension lifecycle.
