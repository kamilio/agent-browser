# Native public-suffix matcher foundation

`src/public-suffix.ts` implements a bounded, immutable matcher over explicitly
supplied trusted PSL-format text. It has no imports, ambient data, network reads,
runtime dependency or default list. It is not yet connected to RP-ID or cookie
policy and is not a complete browser public-suffix implementation on its own.

## Contract

`createPublicSuffixMatcher(trustedSource)` returns frozen `ruleCount` and `match`
members. Results contain canonical ASCII `domain`, `publicSuffix`, nullable
`registrableDomain`, prevailing `rule` and `ruleType`. All supplied rules apply,
including PRIVATE entries. Longest ordinary matches, whole-label wildcards,
overriding exceptions and the default rule are supported. One terminal root dot
is preserved in domain-valued outputs. No last-two-label approximation is used.

Inputs are hostnames, not URLs or cookie attributes. The platform WHATWG URL
IDNA profile canonicalizes Unicode; this is not independent strict IDNA2008.
Malformed syntax, IP literals/numeric URL aliases, duplicate canonical rules,
orphan exceptions and overlapping exceptions reject. Source, rule, label and
canonical domain limits apply before expensive operations. Construction does
not certify that supplied data is complete, fresh or suitable for a security
boundary. Sparse synthetic lists are intentionally valid inputs to this primitive.

An exact match does not establish PRIVATE completeness: with only `com` loaded,
`alice.blogspot.com` and `bob.blogspot.com` both produce registrable domain
`blogspot.com`, even though their match type is `exact`. Adding empty section
markers changes nothing. Loading the PRIVATE `blogspot.com` rule separates the
tenants. Never treat successful parsing, section markers, a rule count or a
non-default match as permission to share credentials or cookies across tenants.

## Provenance and pending gates

### Subsequent pinned offline snapshot

`vendor/public-suffix/` now preserves the complete observed upstream list at
revision `b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8`, its MPL-2.0 license and
same-revision official vectors with their separate public-domain/CC0 dedication.
The 335,592-byte source retains all notices and both sections. Exact acquisition
hashes, times and the unsupported-VCS-download warning are recorded in the
directory's `README.md`. This is source-only test data: no runtime consumer loads
it and no credential/cookie permission changes.

All **10,321 rules** are admitted without filtering: 6,949 ICANN, 3,372 PRIVATE,
287 wildcards and eight exceptions. The new explicit-manifest file has **103
passing cases**, including all 78 same-revision official vectors, fixed boundary
examples, source/license/vector byte pins and complete section inventory. Invalid
official inputs use this API's throwing contract; expected Unicode domains use
explicit fixture punycode labels rather than reusing the implementation's URL
normalizer. One test traverses a child query for every rule, checking bounded
canonical outputs and isolation; that traversal is not an independent proof of
every possible domain result or a heap profile.

Four named files yield **481 passes in each tree**; types/builds, strict new-test
types and scoped Biome pass. The manifest has 436 entries; no full-manifest,
network, SDK or device run is included in these offline checks. Logs use
`public-suffix-snapshot-final-` in `node_modules/.cache/native-validation/`; the
clean candidate path is recorded in `/tmp/public-suffix-snapshot-path`.
The parent separately verified 38 acquisition and 19 pinned-vector artifact
checksums. Original failed setup and all research receipts remain intact.

Runtime distribution/loading, update/freshness/rollback and saved-state policies,
normalization compatibility and separate RP-ID/cookie acceptance are still open.
Full observed source-file identity is not independent Git-signature verification
or a guarantee that every real-world suffix exists in the list. Do not activate
permission widening merely because this offline fixture passes.

### Original matcher checkpoint

Integrated September 5 checkpoint: **246 matcher cases pass**, including 78
adapted official vectors and two parent-added PRIVATE-completeness diagnostics.
Together with the existing broker and cookie suites, three explicitly listed
files produce **378 passes in each tree**. Types/builds in both trees, strict
matcher-test types and scoped Biome pass. The manifest has 435 entries; the full
manifest was not run. Final logs use `public-suffix-integrated-final-` under
`node_modules/.cache/native-validation/`; the clean candidate is recorded in
`/tmp/public-suffix-integrated-path`. A separate static review found no actionable
defect within the admitted-input contract, but identified the incomplete-data
hazard illustrated above. This is not proof of full-list or consumer correctness.
All 43 foundation artifact checksums passed the parent's independent audit,
recorded in `public-suffix-parent-integrity.log` in the same cache directory.

The September 5 native-reader research preserves three official primary sources,
original response hashes, timestamps, failures and detailed API decisions in
`node_modules/.cache/native-validation/public-suffix-foundation/`. Its `PLAN.md`
records source URLs; `REPORT.md` records the initial isolated worker checks.
The test fixture includes all 78 active official registrable-domain vectors,
adapting invalid-input expectations to this API's throwing contract and Unicode
outputs to canonical ASCII. Those fixtures are not the full PSL dataset.

Before widening any permission, separately review and pin complete ICANN plus
PRIVATE data, retain upstream notices and provenance, validate source integrity
and full-list admission, and define version/update handling. RP IDs also require
WebAuthn-specific parent-domain, secure-origin and normalization policy tests.
Cookies need separate Domain, host-only, IP, path and same-site policy review.
Neither consumer is changed here. Real hardware, live-site, SDK and guest-runtime
acceptance remain separate.
