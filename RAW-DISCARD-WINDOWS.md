# Adaptive windows for omitted raw text

The native tokenizer's `discardRaw` starts each element with a1,024-unit input
window, grows to4,096 then16,384 units after incomplete steps, and caps subsequent
windows at the existing65,536 UTF-16 units. Each window is still prepaid before
slicing/stepping; scanner operations still debit the same aggregate work budget.

This prevents short script/style bodies from repeatedly prepaying64KiB of trailing
ordinary content. It changes internal window sizing, not the scanner, closing-tag
semantics, maximum source/window/work limits, script execution policy or defaults.
The explicit reader policy remains `separate-omitted-raw-v1`.

## Functional result

A76,397-byte synthetic page with600 one-character scripts and a65,536-character
paragraph previously fails the32,000,000-unit raw-work budget. The adaptive
implementation completes with625,800 charged units, preserves the whole paragraph
and produces exactly the legacy raw reader's sanitized HTML. The work cap is not
raised, and a separate excessive-work fixture still fails it.

The session still reports only frozen counts, leaves the closing tag to ordinary
tokenization, preserves escaped/double-escaped script handling and accounts source
progress only after completed steps. Cancellation, issue quotas and EOF behavior
remain tested across the adaptive boundaries.

## Evidence and tradeoffs

Final validation passes3,615 tests across42 selected native files, build, selected
types, format and lint. The new96-case file produces87 passes/9 failures against
pre-change production; all96 pass with the fix. Existing cancellation coverage is
expanded rather than relaxed. This is not a full-manifest or SafeJS-runtime pass.

Across117 saved bodies,114 successful pairs retain complete prior extraction,
diagnostic text and classifications after excluding only raw work/step counters;
three non-HTML failures remain identical. Aggregate charged work falls from
358,720,303 to129,469,488 units. This sum spans separate invocations, not one budget.
Seventeen pages charge slightly more overlap/preparation work; the largest observed
increase is21,510 units. No cap is raised or error suppressed, and this is not a
promise of identical acceptance for every hypothetical input near a work limit.

**No wall-clock speedup is established.** A local alternating sanitizer-only timing
diagnostic on three captured articles records0.7–1.2% higher medians with overlapping
ranges. It excludes transport, preflight and extraction and does not control JIT,
GC or host scheduling. The demonstrated improvement is useful capacity under the
same protective budget, not verified faster page loading or CAPTCHA bypass.

Three new native article visits established the motivating workload; they used the
prior committed runtime. Final-runtime checks use their saved responses. See
`reports/deep-content-2026-09-16.md` and
`reports/raw-discard-windows-2026-09-16.md` for provenance, source reviews, timing
samples and limits. Historical reports retain their original measurements.
