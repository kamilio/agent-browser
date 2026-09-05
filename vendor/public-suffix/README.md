# Pinned source-only Public Suffix List fixture

This directory retains an unmodified, complete observed response for upstream
revision `b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8`. It is an offline validation
fixture, not a browser runtime dependency or permission policy. Neither RP-ID nor
cookie behavior loads it. No background refresh or network-dependent test exists.

`test_psl.txt` preserves the exact official vectors at that revision, including
their original public-domain/CC0 dedication. Its 4,308 bytes have SHA-256
`8f50ad958916d6a8f79fba2363501475571acce752757f9126fe9d2f17dd920d`.
The native reader received it on September 5, 2026, at 05:13:59.609 UTC from
`https://raw.githubusercontent.com/publicsuffix/list/b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8/tests/test_psl.txt`.
Exact decoded-body reconstruction also matches the earlier recorded master
response byte-for-byte. This is not a claim about a later branch tip. Vector
dedication does not change the separate list file's MPL-2.0 notice.

`public_suffix_list.dat` retains every byte, including upstream MPL-2.0 notices,
comments and both ICANN/PRIVATE sections. `LICENSE` is the exact upstream license
at the same revision. Do not strip notices, filter rules, canonicalize the stored
file, treat a partial file as complete, or replace the data without review.

## Provenance

- Official repository: `https://github.com/publicsuffix/list`.
- Observed revision: `b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8`, linked by official
  history and its commit page during native browsing on September 5, 2026.
- Data URL: `https://raw.githubusercontent.com/publicsuffix/list/b952f046c27f9b2a7c3e5d2060f9e3acbc4cf1e8/public_suffix_list.dat`.
- Data received: September 5, 2026, 05:09:29.211 UTC; HTTP 200, no redirects,
  335,592 identity-encoded entity bytes. Source SHA-256:
  `87a80788b0151117c77fa520421c4bed9b7e7c91c6df6ac363bbf2b64fd21291`.
- License: 16,727 bytes; SHA-256:
  `66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172`.
  Reconstructed exactly against an earlier pinned native-response body hash;
  no additional license request was made during data acquisition.

The upstream header requests downloads from
`https://publicsuffix.org/list/public_suffix_list.dat` and warns that VCS URLs
are not guaranteed supported. This one-off commit-addressed provenance capture
does not establish a supported update service. The header has no VERSION or
COMMIT line; the revision comes from the recorded request and repository chain,
not from an invented file field. HTTP/hash preservation is not independent
Git-object or signature verification, nor a census of every real-world suffix.

## Validation and maintenance boundary

The source contains 10,321 lexical rules: 6,949 ICANN and 3,372 PRIVATE, including
287 wildcards and eight exceptions. Counts and section markers supplement, but
do not replace, exact-byte identity. `src/public-suffix-snapshot.test.ts` is the
explicit-manifest offline admission test; `PUBLIC-SUFFIX.md` records its actual
results and limitations separately from acquisition.

Before runtime use, define trusted distribution/loading, version and freshness
handling, reviewed updates and rollback, normalization compatibility and saved
state handling. Review additions and removals in both sections. Never activate
partial or failed data or fall back to a fixture/last-two-label heuristic. RP-ID
and cookie permission widening each require separate consumer tests and review.

Original receipts, raw body, exact artifact copies, setup failure and inventories
remain under `node_modules/.cache/native-validation/public-suffix-data-acquisition/`.
The parent verified all 38 saved acquisition artifact checksums. The source-only
fixture and license are retained in version control; no package/distribution
acceptance or new runtime installation is claimed.
