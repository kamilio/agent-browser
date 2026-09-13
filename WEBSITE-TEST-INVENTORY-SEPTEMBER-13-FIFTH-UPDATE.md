# Website evidence — September 13, 2026, fifth update

This supplements the fourth update. **No new HTTP requests, URLs or hosts were
tested in this increment.** Three separately scoped offline operations reuse the
previously captured Wikipedia and GitHub bodies; original retrieval timestamps
and failures remain unchanged.

## Wikipedia: distinguish raw extraction from reader alternatives

The fourth update correctly records mathematical-content loss in raw-tree
extraction: display:none MathML and aria-hidden image alternatives are excluded.
The reader's29 omitted MathML subtrees alone do not establish whether image text
alternatives survive its different projection policy.

At04:54:24UTC, one offline invocation of the existing audited17741 reader loaded
the original Wikipedia body. One native target query and section extraction
retained seven image alternatives: the displayed perplexity formula's TeX,
one inlineN and five inlinei alternatives. The section contains six headings,
ends before the next section, and retains24847 compact JSON bytes. Its document
closes to zero nodes. No network, script, asset or additional extraction ran.

The observation changes the next action: use the existing validated reader replay
workflow for these source alternatives rather than weaken raw extraction's
hidden/inert/aria-hidden policy. Reader output explicitly reports
`hiddenContentSemantics:false` and `styling:false`; it is not appropriate when
the task depends on excluding all content hidden in the original page.
This preserves source-provided alternatives, not MathML rendering or full
mathematical understanding. No missing alternatives are synthesized.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-reader-math-september13/`.
RESULT.json, SECTION-JSON.json and original/current input identities distinguish
this new reader tree from the fourth update's raw tree. Even identical reference
strings across runs do not denote a shared live document.

## Actual offline CLI: no refetch needed

The new bounded stdin/stdout command wraps the existing native replay helper.
At05:11:43UTC, one actual invocation of the audited17836 runtime consumes the
saved successful receipt and independently supplied host pins. It selects
`#Evaluation`, retains the same seven image alternatives, emits25964 JSONL bytes
and exits0. Native extraction inspects374 returned nodes, with source section
metadata scanning6334/selecting362 nodes. Its one document closes to zero nodes.

The receipt pin comes from the earlier sealed host manifest, whose own digest is
verified; the body pin/count come from original capture evidence. The CLI does
not derive expected pins from its untrusted stdin. It receives no input filename
and performs no URL navigation. Guards record zero network/process attempts;
the original receipt/body and full runtime inventories remain unchanged. No
MathML renderer, browser script, credential/device, SafeJS or realTTY is involved.

The399ms child interval is a single observation, not a controlled performance
comparison. The practical request-saving result is concrete: this reading made
zero additional HTTP requests. No claim of bypassing a crawler block or CAPTCHA.
See RESEARCH-REPLAY-CLI.md for command flags, byte/chunk/deadline limits, error
handling and reader tradeoffs.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-replay-cli-september13/`:
INVOCATION.json, EXECUTION.json, GUARD-AUDIT.json, CHECKS.json, replay.jsonl and
before/after inventories. The first reader experiment uses the old17741 runtime;
this actual CLI experiment uses the new17836 runtime. They are not interchangeable
validation runs or fresh website visits.

## MLPerf: additional archived policy reading

At04:56:32UTC, one socket-sealed native parse/query reads the original GitHub
policy body. It selects three heading groups totaling11921 excerpt code units;
49 other content-bearing groups remain unselected. No benchmark, checker, audit
report, system, login or new source URL is accessed.

Selected audit rules describe a selective process rather than auditing every
submission: up to two submissions per round, with eligibility, exemptions,
committee discretion and qualified confidentiality/reporting provisions.
These are archived project statements, not evidence of enforcement or fairness.

The header-preserving Edge table provides PointPainting-specific relative-quality
and required-scenario evidence:99.9% of the FP32 reference and a special Single
Stream99.9% tail condition. Relative model quality and tail latency are distinct
quantities, not99.9% absolute task accuracy. Selected policy/reference values
still lack a common version context with the earlier v5.0 overview.

**Extraction limitation:** the selected Datacenter rows lack their table header.
The harness recognized only th header cells; that did not retain this table's
label row. No positional column labels are invented, no absent models inferred,
and no second extraction replaces the partial evidence. This row-selection
limitation needs correction in future bounded research harnesses. The broader
high-accuracy/category inconsistencies remain unresolved across versions.

Evidence: `node_modules/.cache/native-validation/native-mlperf-policy-detail-september13/`:
RESULT.md/JSON, EXCERPTS.md/JSON, OFFLINE-AUDIT.json and SOURCE-INPUT.json. New links
to audit guidelines, messaging rules and system metadata are recorded as
unfollowed. Master remains unpinned to an upstream commit/current round.

## Pins and acceptance boundaries

Original Wikipedia receipt SHA256:
`4201161ea91f22f2432aacb264f30934443e17f8c58fd1228d9f0e429b992293`.
Original Wikipedia decoded body SHA256:
`d245314a28881a374410f72c84cc496cbe9b00e67d4716f4b237b7ecf0890705`.
CLI output SHA256:
`f2fcdc02ba377e53c211880e80f56b8c4a4f0d96023f67da185b597f14f7d149`.
Original GitHub decoded body SHA256:
`9ee4273d6dca5ff6ed34b4666d64d63f1e69858b7d189434c9499c9a5b7b4e06`.

The new CLI has95 new tests and843/0/0 focused validation. Its clean broader gate
passes17836/0/2 unchanged exclusions across344 selected suites, with378 of722
manifest suites unrun. Unit tests are not website or device acceptance evidence.
All three offline operations preserve original archives and close their owners;
private directories and process termination are recorded. The broader browser,
four research topics and human challenge-handoff work remain incomplete.
