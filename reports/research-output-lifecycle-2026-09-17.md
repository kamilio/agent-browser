# Research output lifecycle and content workflows — September 17, 2026

## Scope

The main research CLI's existing deadline did not interrupt a blocked output
write. The HTML JSON CLI also lacked protection against cancelled writes that
later failed. A final review identified a related successful-callback ordering
hole in the previously hardened source-index writer. These are output lifecycle
defects, not extraction, network-identity or website-access fixes.

The shared writer now waits for both callback and required drain, supports raw
Uint8Array payloads, propagates output cancellation, and retains narrow protection
through pending asynchronous destruction. Library helpers leave caller-owned
streams alone. Only executable failure paths tear down their own stdio and use
a sanitized diagnostic with a 100 ms event-loop fallback. Input/output limits,
serialized records, browser identity and extraction policies remain unchanged.

The candidate is clean release03, derived from commit
`5ca9d5a30704cb5b4c1e71b70b5eeb6dade026f8` with eight owned source/test overlays.
All **1,597 source and 2,376 compiled file hashes** are pinned. The separate live
workflows described below used that parent commit, not the uncommitted candidate.
Only the three CLI implementation/declaration/map groups differ among existing
compiled files; the shared writer adds four compiled artifacts. Reader and
transport implementations are unchanged.

## Native tests and retained failure

- Final selected output/content suite: **1,711 passed / zero failed in 25 files**.
  Build, selected strict types, formatting and lint pass.
- **75 new tests:** 36 shared-writer, 28 source-CLI lifecycle, 11 main-emitter
  cases. The remaining 1,636 selected cases pass as well.
- With the new consumer tests against the parent CLI implementations, **18 fail
  and 10 pass**. Four failures expose the source-index successful-callback /
  asynchronous-destruction gap; 14 expose the older HTML JSON protection gap.
- An additional, separately retained admission file is **171 passed / one failed**
  on both clean parent and final candidate. Every case has the same outcome. The
  unchanged heading-options test asserts reference identity despite production
  constructing an operation-local options object. Its failure is not fixed,
  suppressed, or counted as a pass.
- The canonical manifest has **997 entries with 22 missing files**. The admission
  test remains listed. This is not a complete-manifest or all-green suite claim.

Initial diagnostic release01 recorded 1,872 passes and that same failure, plus
a formatting failure subsequently corrected. Release02 quality checks passed
before the final review fix. The review added ten ordering cases; final release03
contains and passes them. All earlier diagnostics are retained privately.

## Actual executable pipe checks

All checks use owned anonymous pipes, empty private HOME/TMP, and both kernel and
JavaScript network denial. The main CLI receives one synthetic native transport
response, not a real website. No sockets, real TTY/PTY, credentials, SafeJS, page
scripts or alternate browser were used.

| Check | Observation |
| --- | --- |
| Main CLI, parent, full stdout | Still alive at 123.002 seconds; only exits after the supervisor closes the peer |
| Main CLI, release03, full stdout | Exits status 1 at 120.276 seconds with reader still open; fixed sanitized stderr message |
| Each of three CLIs, invalid arguments, regular/full/broken stderr | All nine commands exit status 64; regular-file diagnostics contain usage, not the supplied invalid option |
| HTML JSON help, full stdout and full stderr | Real 30-second deadline; exits status 1 at 30.204 seconds with both peers open |
| Source-index help, full stdout and full stderr | Real 30-second deadline; exits status 1 at 30.204 seconds with both peers open |

All children/process groups close without cleanup signals in the final checks.
The observed nine usage-command lifetimes range from 0.064 to 0.314 seconds.
Diagnostic delivery is not guaranteed when stderr is blocked/broken. Timer-based
termination requires event-loop progress and does not qualify synchronous blocked
file or TTY I/O, host failure, or universal wall-clock bounds. Cancellation may
leave a partial JSONL record; the exit code and complete-record validation matter.

## Separate native website follow-ups

These three source-linked GETs occurred at 06:14 UTC on September 17 using the
committed parent runtime. They are not a repeat of either historical 100-entry
corpus, and do not change the agent-citation corpus's 33-useful / 67-other result.

| Target | Response time, UTC | HTTP | Decoded bytes | Extracted bytes | Content assessment |
| --- | --- | ---: | ---: | ---: | --- |
| MLCommons results change log | 06:14:09.483 | 200 | 136,285 | 11,659 | 44 validity/change records checked, not performance scores |
| Best Buy source-linked appliance promotion | 06:14:29.048 | 200 | 579,790 | 0 | Application-error shell; no content-task success |
| Official MLCommons inference rules on GitHub | 06:14:51.292 | 200 | 741,978 | 104,136 | Sampled methodology, scenario cells and headings checked |

The Best Buy target was a literal link in the September 16 saved homepage. That
homepage yielded only 43 placeholder bytes under the tested reader policy; its
35 links were under hidden ancestors. The fresh target's source title is
`PAGE_NOT_FOUND_ERROR`, but the transport status is **200**, not 404. Neither
capture supplies inert application/json or JSON-LD product data. There is no
demonstrated eligible static-text loss to repair, nor evidence here that this is
a CAPTCHA or that storefront interaction works.

The MLCommons audit checks all 44 data rows and six headers in six change-log
tables, plus 13 full rules paragraphs, 35 scenario-table cells and 55 article
headings. It does not audit all 1,049 rules paragraph elements or all 12 article
tables. The change log advertises publication November 13, 2024 and modification
September 9, 2025; these dates and row event dates are not September 2026 benchmark
measurements. The GitHub branch object does not establish the rules' effective
date. Numerical hardware performance remains outside these two captures.

Both workers retain their original native outcomes and corrected offline-auditor
diagnostics. Every acquisition has an exact synthetic command proof, pinned
inputs, request/TLS/socket/process closure and no redirects/retries/credentials
or scripts. The live evidence is sealed separately in `bestbuy-content-september17`
(72 artifacts) and `mlcommons-workflow-september17` (78 artifacts) under
`node_modules/.cache/native-validation/`.

## Saved website content and output controls

Final release03 also passes **108 offline response-substitution controls**: 96
historical sources, nine previously captured follow-ups and the three captures
above. All **105 original result projections match exactly**, including field
values and ordering. All 12 follow-up captures preserve their original outcome,
classification, reader metadata, failure and extracted content. Best Buy remains
an empty-extraction failure; other historical failures remain failures.

Each current report is emitted to a real in-memory Writable with highWaterMark 1
and a live un-aborted signal. All **108 byte sequences and exit reports match
the serializer exactly**, and all 108 backpressure drains complete. This covers
6,204,975 emitted bytes in aggregate, with a largest record of 1,105,370 bytes.
Receipt/body pins, transport closure, output listener cleanup and owned-buffer
clearing are checked. There are 108 native mock requests and zero new network
requests; the process/group closes in 5.110 seconds without cleanup signals.
This execution duration is not a baseline/candidate speed comparison.

The worker retains one preparation compatibility failure and discloses an
inspection mistake: a pre-harness command printed a full public receipt and its
base64 body to the tool log, contrary to the bounded-output instruction. Therefore
**worker instruction compliance is false**, separately from the 108 successful
functional controls and their supervised execution. The incident is not erased
or relabeled by successful tests. No real credentials were used in these captures.

The controls do not establish live access, rendering, cancellation/error behavior
of this particular replay harness, or ordinary admission of failed receipts.
Their evidence lane is `output-content-controls-september17` (23 sealed artifacts),
with 387 additional pinned runtime/harness/source inputs. The parent rechecks 566
external artifact/input records across the three worker lanes before publication.

## Evidence and remaining work

The JSON companion records exact artifact locations and hashes. The private
`research-output-lifecycle-september17` lane preserves native/quality results,
all pipe observations, initial failures and independent review. The API contract
is in `RESEARCH-OUTPUT-LIFECYCLE.md`.

Broader dynamic-page compatibility, runtime integration, useful task completion,
live speed/access improvements, CAPTCHA handoff, real credentials/passkeys/devices,
missing tests and original research remain open. No new runtime dependency,
fingerprint spoofing, challenge solver or performance ranking is introduced.
The overall browser goal remains active.
