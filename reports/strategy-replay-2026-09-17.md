# Strategy-aware cached extraction — September 17, 2026

Saved native-first captures can now be re-extracted with an explicit selection
without downloading the website again. This addresses noisy whole-document
output while preserving the original loading strategy and evidence boundaries.
It is not a new live crawl, dynamic-browser acceptance or CAPTCHA solution.

## Implementation

The replay CLI accepts the explicit pair
`--expected-document-strategy native-reader-fallback-v1` with the default profile
and trusted receipt/body pins. Its asynchronous API recomputes native-first
loading on the unchanged captured bytes, at the original default limits, then
requires the selected mode and native failure diagnostic to match the capture.
Native captures stay native; the implementation does not force them through a
reader or strip strategy metadata to admit a different interpretation.

Selector, section, content-focus and links selections are supported with their
existing format/table restrictions. Recovery and interpretation overrides remain
unsupported. Complete successful HTML evidence is required; contradictory
classifier diagnostics, absent/empty extraction, barriers, rate limits and
incomplete bodies are not converted into success. The original source strategy
and outcome remain in provenance, separate from the new extraction result.

There are no transport, page-script, SDK or subresource hooks. Documents and owned
decoded bytes are cleaned up on success, failure or cancellation. Synchronous
replay still refuses tagged captures; ordinary untagged replay remains on its
existing path. See `RESEARCH-STRATEGY-REPLAY.md` for usage and restrictions.

## Final isolated validation

Release02 is committed parent e7b3817 plus six source/test overlays and the three
new manifest entries. All 1604 source and2380 compiled pins verify. It passes
**3804 tests, zero failures, across52 explicitly selected native files**, including
381 new cases:292 admission,42 asynchronous extraction and47 CLI integration.
Build and selected test types pass; formatting/lint pass for the six overlays.

This is not full-suite acceptance. The canonical1003-entry manifest has22 paths
absent from the isolated commit-plus-overlays tree. All22 exist in the dirty
workspace, whose1006-entry manifest has no missing paths; that workspace is not
the qualified runtime. The separately run172-case admission diagnostic remains
171 passed/1 failed, with every outcome equal to the preceding fallback candidate.
The known heading-options reference-identity assertion is not repaired here.

Against pre-feature code, the381 new cases produce201 passes/180 failures. Against
the pre-review admission helper, its292 cases produce248 passes/44 failures.
Every case from both controls is present and passing in final release02. Test
comparison keys include within-file/name occurrence ordinals for parameterized
tests with identical displayed names.

Independent static admission review finds two evidence-consistency defects,
subsequently fixed and covered: contradictory classifier diagnostics and missing
or empty success-labelled extraction. Final static integration review finds no
actionable defect within its stated scope; it is not independent execution.

## Saved-response compatibility

110 untagged saved captures are passed through the old and new synchronous APIs:
220 offline calls,110 matching projections. The comparison covers outcome,
barrier, content byte count/hash, reader and content-selection metadata, or error
category. It is not full-record/reference-ID/error-message equality. Both versions
produce68 extracted-unverified results,37 policy-denied and5 unsupported errors;
this does not mean110 successfully extracted websites.

Five sealed native-first captures receive main-content selection, plus a separate
PCMag article selector: six successful asynchronous selections. Six real compiled
CLI invocations independently match the API content and inspected provenance,
classification, reader, strategy and selection projections. All preserve the
captured mode and report zero network requests. Caller-owned API receipts remain
unchanged. Network-denied processes close, with no JavaScript denied-I/O attempts
and empty private HOME/TMP directories. Kernel denial enforces the network boundary
but is not a kernel-attempt counter. No socket or real-TTY probe is performed.

## Measured content reduction

| Saved page | Selection | Mode | Original bytes | Selected bytes | Reduction |
| --- | --- | --- | ---: | ---: | ---: |
| nerdwallet-home | main-content-v3 | reader | 44656 | 12042 | 73% |
| pcmag-home | main-content-v3 | reader | 48340 | 18601 | 61.5% |
| mayo-home | main-content-v3 | reader | 22614 | 6074 | 73.1% |
| pcmag-article | main-content-v3 | reader | 46991 | 16785 | 64.3% |
| pcmag-article | #article | reader | 46991 | 8733 | 81.4% |
| nerdwallet-article | main-content-v3 | native | 21508 | 15310 | 28.8% |

These compare Markdown byte sizes from the same saved responses, not model token
counts, live-network latency, factual accuracy or complete website functionality.
The homepages receive no independent task-content retention inventory in this run.

For the PCMag article, main-content focus retains all13 identified direct editorial
paragraphs,3 direct subheadings and the headline under full normalized-text
matching. Explicit `#article` retains the same13 paragraphs and3 subheadings,
while omitting the visible headline from content; its original document-title
metadata still contains that headline. The nested author biography is not one
of the13 editorial paragraphs. Ancillary material can remain in either selection.

For NerdWallet, independently reparsing the original source identifies21 direct
article paragraph containers,7 headings and8 list items; their entire normalized
texts and the visible headline remain in focused output. This is not matching
only truncated report excerpts. Original document-title metadata is unchanged,
although this publisher's HTML title differs from its visible headline.

These checks establish source-pattern text presence, not byte-perfect Markdown,
ordering, occurrence multiplicity, rendered completeness, images, interaction or
publisher accuracy. Original acquisition times and live evidence remain in the
September17 fallback and article-workflow reports; this run performs no new GETs.

## Retained failures and limits

Release01's native tests pass but scoped types/lint fail; corrected release02 is
separate. Early checker assumptions about unique test names and identical visible
headline/document-title text are corrected without changing production behavior.
The CLI worker preserves a pre-launch harness error; it is not an extra browser
request. Original scripts, failures, review artifacts and intermediate runs are
retained rather than rewritten as successful evidence.

Actual SafeJS integration, dynamic sites, real credentials/passkeys/devices/TTY,
broader performance, access/CAPTCHA handling and unfinished topic research remain
open. Historical100-entry33-useful/67-other verdicts are unchanged. The overall
browser objective remains active; next work returns to deeper source-advertised
website tasks and runtime functionality, not a claim of100 working sites.

## Evidence

The adjacent JSON records the qualified runtime, measurements and review scopes.
Private reproducibility artifacts are retained under
`node_modules/.cache/native-validation/strategy-replay-september17/`, including
native/quality runs, red controls, saved-response comparisons, compiled CLI
controls, source-content review, input seals and publication checks.
