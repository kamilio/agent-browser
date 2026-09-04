# Inline CSSOM priority and removal

September 4, 2026. This checkpoint fixes declaration priority queries and empty
`setProperty` writes before further pending-shorthand representation work.

## Priority is not a serialized value

`getPropertyPriority` previously required `getPropertyValue` to return a nonempty
string. That confused two independent questions. Longhands originating in an
unresolved shorthand have empty value serialization but retain their declaration
priority. A shorthand can also have uniformly important components whose values
cannot be combined into one serialized shorthand.

Priority reads now consult the winning stored components independently of value
serialization. They honor important precedence across pending shorthand overlaps,
return an empty priority for absent/incomplete/mixed-priority components, and
retain case-sensitive custom-property handling. Direct attribute replacement
refreshes these reads through the existing cache; owner/document close revokes
them. No independent style store or guest-runtime dependency is introduced.

## Empty writes and reference divergence

Within the existing input/resource limits, an empty or null-to-empty value now
removes the requested declaration before checking whether the priority string is
valid. Invalid-priority writes with nonempty values remain no-ops. Successful
removal uses the existing attribute mutation and shared style/layout invalidation
path rather than editing only a CSSOM-facing cache.

This follows the algorithms researched on September 4 in
`https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty` and
`https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertypriority`.

The preserved September 2 browser case `remove-invalid-priority` in
`reports/cssom-native-cases-2026-09-02.json` reports the opposite removal behavior:
it leaves `display: block` in place. That record is unchanged. Its exact-parity
assertion moves to an explicit divergence test that checks both the historical
record and the new empty declaration block. The other reference cases retain
their comparisons. This is a deliberate specification-based compatibility
decision, not a newly passing browser-equivalence result. No fresh reference
browser or upstream WPT execution is claimed.

## Native evidence

The new test file has 26 cases; 24 fail on isolated prior HEAD. It includes twelve
pending-shorthand families, non-serializable important shorthands, overlapping
priorities, empty/null removals, invalid nonempty writes, cache revocation and
shared geometry/software-pixel changes. One new case replaces the historical
equivalence assertion with the explicit divergence check described above.

Focused native runs pass 118 tests across three working-tree files and 111 across
three isolated-commit files; the difference is unrelated pending CSSOM coverage.
The new test file is explicitly listed in `native-tests.json`.

Authorized full native runs pass 9,652 tests across 269 working-tree files and
8,499 across 247 isolated-commit files. Both trees pass production typecheck/build,
strict checks of the two affected test files and four-file lint. Filesystem
checks use actual ownership; this authorizes none of the separate probes below.

## Remaining work

Pending shorthands still use the existing raw-declaration representation, not
standard longhand pending-substitution slots. Expanded enumeration, partial
removal and lowering one important pending component's priority remain open.
This also does not establish every `all` shorthand interaction or complete CSSOM
serialization/prototype/coercion behavior. Those gaps need shared native style
ownership, not merely more permissive string rewriting.

Historical paths and measurements, unrelated changes and the denied SafeJS probe
are preserved. No live site, socket, real TTY/PTY, browser or SafeJS probe ran.
The complete seven-day browser goal and original compatibility gates remain active.
