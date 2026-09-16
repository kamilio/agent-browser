# Node.js stream-documentation recovery — September 16, 2026

## Actual native-browser results

One URL was fetched twice across the original diagnosis and this recovery, using
the standalone native browser, not Chromium/Firefox, an alternate client or SDK.
Each run makes one anonymous GET, with no redirect/retry, credential headers or
page/example execution. The historical failure is retained unchanged.

| Capture | UTC received | HTTP | Decoded bytes | Encoded bytes | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Original | 2026-09-16T18:29:13.279Z | 200 | 857597 | 62521 | Unsupported loader/extraction failure |
| Candidate | 2026-09-16T19:06:20.660Z | 200 | 857597 | 61595 |222,068 Markdown bytes, no prefix fallback |

Both decoded bodies have SHA-256:20363608cd74ec5af9ff38b1a88c6b18c89689fd61e97593596c9b5e715aa59e. Different encoded transfer sizes
do not imply a speedup. Corrected Markdown SHA-256:c4a813396ba828b8025473960f2f71841cd96a98b50bcd39b8f0e1feda37b5e5.
The candidate's complete extraction matches the saved-body API result after
normalizing only opaque refs, not text, counters or metadata.

## Diagnosis and verified recovery

The original source starts with HTML5 doctype. The reader formerly dropped it;
its native reparse consequently used quirks mode. One of45 tables remained inside
a paragraph, triggering the real table-structure guard. A minimal offline fixture
reproduces the same mode/nesting/extraction difference. Source-only independent
review identifies the original use-case/class/method table near the failure.

The candidate preserves the effective declaration and now has no-quirks mode,
45 source tables and zero paragraph-contained tables. Markdown contains45 table
begin/end pairs and99 fenced code blocks. These counts are structural checks, not
proof every example is correct or executable. Captured version labels are source
labels, not verification of the latest Node release.

Independent cell-by-cell and code/warning source-fidelity review remains
incomplete. The optional bounded reviewer produced no artifacts and was shut
down; this is recorded explicitly in the companion JSON. The separate source
review of the implementation is complete, but table/block counts and matching
two output paths do not substitute for independent source-content verification.

Whole structured extraction still fails its existing output budget. The CLI
retains outcome extracted-unverified/contentSuccess:null; this report adds scoped
review evidence rather than silently changing that automatic classification.

The existing section workflow provides useful bounded JSON despite that global
limit: select h4:has(a#streampipelinestreams-callback) with --section/--format json.
One actual native CLI run using the saved body under kernel network denial gives
36,937 JSON bytes,692 selected nodes plus7 context nodes. Both code blocks exactly
match the full Markdown. No extra GET, enlarged budget or executed example.

## Safety and retained attempts

Both request/socket lifecycles and process groups close; HOME/TMP remain empty.
A kernel-network-denied synthetic doctype/table/code-context proof passes before
the fresh GET. Its first verifier wrongly expects unescaped underscores; that
failed proof and corrected proof remain separate, with no live request during
either proof. Original loader/Markdown diagnoses and malformed structured-budget
attempts likewise remain unchanged.

Selected native gate4,756/0 and broader available-file gate45,991/0 pass;22 absent
committed manifest tests remain a separate gap. No actual SDK, device, credential,
dynamic-site, general challenge-handling or overall-browser completion claim.

Original evidence:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/node-stream-reference-september16; seal SHA-256:51e0f654e4e68c60cc1adae00c011d72ef724cd2ca6914d00c31f35edd932e9a.
Recovery evidence:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/node-stream-recovery-september16; seal SHA-256:57b0b2452062d8638ab1f6d54898a29ac2f964bb6f7183fd3a85948218512267.
