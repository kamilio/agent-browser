# Native media fallback — September 5, 2026

## Bounded source conclusion

The native browser admitted the archived Media Queries Level 5 section
**3.2. Error Handling**. Its grammar recovery replaces an invalid query with
`not all`, generally recovering at a top-level comma rather than discarding
every query in the list. Nested/unclosed blocks and the enclosing stylesheet's
parsing rules constrain recovery. An unknown media type is nonmatching and can
be negated; an unknown feature/value instead produces an unknown query value,
which is replaced with `not all` at the query boundary.

This supports retaining a diagnostic while rendering an accurately recovered
fallback. It does **not** prove that this partial native compiler implements
every recovery rule or require ignoring a native formatting restriction.
The source-linked WPT list was extracted as text only; none of those tests or
links was visited or executed. This section alone establishes neither current
standards maturity nor source publication date.

## Original receipt versus offline evidence

Source: `https://drafts.csswg.org/mediaqueries-5/#error-handling`.
The original document receipt was **2026-09-05T06:57:25.980Z**, HTTP 200,
**709,021 decoded / 114,627 encoded bytes**, without redirects. Its decoded
body hash is:

`13710d9352b367231363ef2445541cbf17a443f7e7af2f0707949f95a523546c`

That original live attempt failed in the old reader and extracted zero scopes.
`COLOR-MEDIA-RESEARCH-2026-09-05.md` and its original artifacts remain unchanged.
The earlier broad color-discovery failure and direct color/integer evidence
lanes are likewise separate and unmodified.

This new lane ran **07:42:29.821–07:42:30.106 UTC** using the fixed native
reader at `reader-table-integrated.O7zvlp/dist/` in the native-validation cache.
It created **zero transports, requests or SDK executions**. It did not parse
raw HTML with another engine, alter the archived response, or raise limits.
The fixed reader's hash is:

`cda8f2419aab50d999eb6ec7309b3b0c01fb1b952b583ecdddf04cb6f123205d`

Native heading queries selected exactly one matching heading, **e3558**.
Discovery used **174/2,000 bytes**. The heading and adjacent native siblings
through e3775 produced **13/16 scopes**, **15,367/32,000 serialized extraction
bytes**, and a **17,858/40,000-byte complete structured report**. Root/heading,
per-scope byte counts and exact extracts are in the separate report.

The load produced 14,240 native nodes; revision stayed 14,239 before and after.
Queries and document closed with no retained collectors or notifications.
The reader remains partial and does not execute scripting, styling or complete
hidden-content semantics. This offline success is not a new live validation.

## Implementation policy

`isAdvisoryFormattingIssue` uses exact equality with
`css:unimplemented-or-invalid-media-query`. Both the page-width and intrinsic
admission guards use it, leaving that warning and its count in the original
style/formatting records. A warning no longer prevents the already computed
fallback cascade from reaching supported native geometry and painting.

All other diagnostic keys remain blocking. Existing display/flex coordination
counts, positioned-tree transforms, resource limits and lifecycle checks are
unchanged. Unimplemented CSS properties, invalid declarations/selectors,
unloaded stylesheets and unsupported layout structures receive no exemption.
No runtime dependency or browser engine is added.

This intentionally renders the compiler's **partial native fallback**, not
necessarily the author's intended result in a fully conforming browser. The
compiler drops a balanced branch containing an unsupported term, even when a
different term in the same logical expression is known true. It does not yet
model three-valued unknown conditions or arbitrary media-type negation;
global malformed bracket/quote detection can discard a list. Unknown gamut
or device features remain compatibility gaps rather than measured properties.
No media-parser behavior is changed in this checkpoint.

The exact diagnostic string is not an authenticated provenance tag. Trusted
host callers must not use that name to relabel load/resource/security failures.
The inspected production stylesheet-load callers keep their separate names.
Narrow outward-facing geometry responses are not claimed to serialize every
diagnostic simply because the underlying formatting tree retains it.

## Evidence paths and remaining gates

Implementation validation adds **30 synthetic regressions**. Eight explicitly
named files pass **388 tests in each tree**, with project types/dist builds,
strict touched tests, formatting and test Biome checks passing. The production
modules have pre-existing import-order check failures, reproduced against their
before copies; these are not relabeled as a full source Biome pass. Working and
candidate manifests contain 447 and 445 entries; the two pending parent-RP
suites remain excluded from this patch and validation. No full manifest ran.

The unchanged old admission fails **21/30** new cases and passes nine. Its
seven existing selected suites independently pass 358 cases. The baseline
snapshot in `/tmp/media-fallback-old-baseline-path` and its seven-file input
hash ledger remain unchanged after testing. The candidate is separately stored
at `/tmp/media-fallback-integrated-path`; logs use `media-fallback-final-02-`.

Preserved harness history: the first baseline command requested an untracked
inline-block test absent from HEAD, so only six files ran; the corrected checked
matrix uses committed static-positioning tests. Initial worker results were
29 passes/one failed assumption that a table reports an unsupported-element
rather than display issue; the fixture was corrected to fieldset. The first
integration passed 388 isolated tests but its helper asserted a Vitest JSON
field that does not exist. Final validation checks the actual success/suite
schema; no production change was made for that checker failure. All initial
logs and the initial validation helper are preserved, not rewritten.

All cache paths here are under
`node_modules/.cache/native-validation/`. `media-fallback-research/REPORT.md`
records source interpretations and limits; `extract.json` and `extracted.md`
preserve native output. The parent independently verified **21 artifact hashes,
1,596 compiled input hashes, eight inherited files and one local source
snapshot**, with logs named `media-fallback-parent-*-SHA256SUMS.log` or
`media-fallback-parent-SHA256SUMS.log`. Earlier artifacts were not rewritten.

`media-fallback-review/REPORT.md` traces issue producers and all inspected
page/intrinsic/positioned/atomic consumers, including eight verified source
hashes. It finds no blocking defect within the declared advisory policy; it is
static review, not a test run. Implementation regression and integration logs
are separate from both that review and the native source read.

Full MQ conformance, broad site rendering and actual guest/device acceptance
remain outstanding. No full test manifest, live website, socket, TTY, SafeJS,
credential or physical-device probe is authorized or implied by this change.
Denied parent-RP, actual identity-runtime and identity-wire gates remain closed.
The overall browser goal stays active in `TASKS.md`.
