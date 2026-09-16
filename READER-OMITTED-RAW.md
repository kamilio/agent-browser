# Bounded omission of raw reader text

The explicit `separate-omitted-raw-v1` reader policy separates omitted nonentity
raw text from the reader's text quota. It addresses the measured SWE-bench
failure where a 2,362,382-code-unit script exceeded reader.text even though the
reader would never emit that script. Existing defaults and long-v1 limits are
unchanged; the policy must be selected explicitly.

## Accounting and semantics

Selected readers use the native tokenizer's bounded no-payload discard for
omitted script, style, iframe, noembed and noframes elements, plus xmp only inside
an already omitted subtree. They retain the native script escaped/double-state
rules and ordinary closing-token processing. No script is executed and no new
runtime dependency is introduced.

Raw scanning uses windows of at most 65,536 UTF-16 units and a single aggregate
32,000,000-unit work quota per sanitizer invocation. Window preparation and native
scanner operations debit that quota. The existing whole-source cap still bounds
every omitted character. Exceeding the new quota reports reader.omitted-work;
work units are conservative accounting, not CPU time or a memory benchmark.

Since the September16 adaptive-window fix, each discarded element starts with
a1,024-unit window and grows by4x after incomplete steps up to that same65,536-unit
maximum. This reduces repeated prepayment for short raw bodies without raising
the aggregate cap or changing scanner semantics. Some inputs incur more overlap
work; a lower aggregate debit is not a wall-clock speedup. See
RAW-DISCARD-WINDOWS.md for the separate validation and capacity result.

Only discarded nonentity raw payload stops consuming textCodeUnits. Ordinary
text within omitted subtrees, title/textarea raw processing, retained xmp and
plaintext retain their previous accounting and decoding. Source, output, token,
depth, encoded/decoded-body and document limits remain in force. Malformed
source is not silently repaired, and an unsuccessful reader does not publish a
partial successful extraction.

Selected reader reports include rawTextPolicy and frozen omittedRaw metadata:
codeUnits, workUnits, steps, elements, maxWorkUnits and maxWindowCodeUnits.
Image/style/hidden-content limitations remain unchanged. No-policy reports keep
their previous shape and interpretation. This policy does not enable rendered
visibility, page scripts, authentication, challenge solving or resource fetching.

## Entry points

`sanitizeResearchHtml` accepts the policy as its fifth argument, after the
existing document profile. `loadResearchDocument` accepts it as its fourth
argument. Unknown policy values reject before source/response access.

The research CLI accepts `--reader-raw-policy separate-omitted-raw-v1` together
with `--reader`; programmatic execution uses readerRawPolicy. The flag does not
change long-v1's single reader/capture/heading requirement, pacing or network
limits. Selected reports retain the policy even when navigation/loading fails.

Capture-to-JSON replay carries only the validated policy literal from the pinned
receipt metadata, never arbitrary reported limits or counters. Conflicting or
unknown policy declarations reject. Failed, blocked and evidence-only captures
remain ineligible; a new policy cannot retroactively turn a historical failure
into an admitted capture.

## Validation

On September 11, 2026 at 05:29:22.883–05:30:29.425 UTC, production build, strict
types for 22 roots, ten-file lint and 2,823/2,823 explicit native cases pass.
All 2,601 old case names/outcomes match an independently passing f01949a baseline.
The 222 new cases comprise 88 tokenizer, 47 reader, 41 CLI and 46 replay cases.
All 988 isolated source inputs stay unchanged. This is a selected 22-file check,
not a full-suite, SafeJS, credential, device or real-socket acceptance result.

Evidence: `node_modules/.cache/native-validation/native-reader-raw-policy-september11-round02/`.
The first attempt's three missing test callback this-type annotations caused a
strict-type failure after a successful build; its native tests did not run.
Only those annotations changed before the corrected attempt. Original failure
evidence remains in the preceding lane.

A separate fresh SWE-bench native request now returns HTTP200 and 11 DOM-reader
heading entries from the same 2,392,125-byte body that previously exceeded the
reader text cap. A subsequent independently pinned local replay produces JSON
for one observed benchmark section with no second request. See
SWE-BENCH-READER-RECOVERY.md for exact evidence. Historical failed captures stay
ineligible. No measured allocation reduction, speedup or CAPTCHA result follows.
