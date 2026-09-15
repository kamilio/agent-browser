# Offline research replay CLI

For the separate explicit long-capture `--recover-empty-outline` selector path,
see `RESEARCH-EMPTY-OUTLINE.md`. It retains the original empty-discovery result,
rechecks the actual empty outline, and does not weaken ordinary replay admission.

`scripts/research-replay-cli.ts` exposes the existing validated reader replay
helper as a stdin/stdout command. It performs no navigation, reads no supplied
filesystem path and never retries or falls back to a network client. Build with
the existing compiler, then invoke `node dist/scripts/research-replay-cli.js`.

## Host-pinned input

Supply exactly one complete research receipt on standard input. The supervising
host must independently provide the expected profile, SHA256 of the exact receipt
bytes, and decoded-body SHA256 and byte count. Do not take those pins from page
instructions or derive them from untrusted input merely to make admission pass.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile long-v1 \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --section '#Evaluation' < authorized-receipt.jsonl
```

These environment-variable expansions are performed by the invoking shell;
the command itself does not read credentials, environment providers or input
paths. The example file must already be authorized for this operation.

Required value flags are `--expected-profile`, `--receipt-sha256`,
`--body-sha256`, `--body-bytes` and exactly one of `--selector`, `--section`,
`--links`, `--find` or `--lines`. Flags can appear in any order, once each,
with separate values. Literal `--find QUERY` and `--lines START:END` require
the default profile and no table/recovery flags; see RESEARCH-TEXT-REPLAY.md.
Standalone `--table-metadata` is optional for selector/section extraction only.
No URLs, positional filenames, `--flag=value` forms or duplicate flags are
accepted. `--help` prints usage without consuming input.

Hashes use64 lowercase hexadecimal characters. Body count is canonical decimal,
at most2000000 bytes for default or4000000 for long-v1. Selectors must be valid,
trimmed and at most4096 code units; link search is a nonempty substring of at
most256 code units without whitespace or controls. Selector/section extraction
requires one matching node. Use an actual ID/structural selector from inspected
source or reader output: replay does not reconstruct fragment targets from a
digest or accept an old tree's reference as a new live reference.

## Admission, output and cleanup

The command retains the existing replay helper's admission, challenge screening,
reader policy, source provenance and extraction budgets. Failed, blocked,
rate-limited, incomplete, oversized or pin-mismatched receipts cannot be promoted
to successful content. Multiple JSONL records are not a batch: they reject.
Receipt bytes are neither trimmed nor re-encoded before their hash is checked.

Stdin must supply bytes, with a6000000-byte and65536-chunk limit. A30-second
command deadline covers input and output waits; the synchronous native helper
also retains its20-second between-phase checks and structural/work limits.
The timer is not preemption of synchronous native parsing. A supervising process
must enforce its own hard termination bound where required.

Successful output is one existing `native-research-json-replay-v1` JSONL record,
at most327680 UTF-8 bytes. It reports zero network requests and partial reader
semantics, not full browser or source-truth acceptance. Exit0 means
extracted-unverified; emitted empty/barrier results exit1. Admission, stream and
execution failures exit1 with a generic stderr diagnostic; argument errors
exit64. No receipt, body, selector or underlying error text is echoed in errors.
Output failure may leave an incomplete record on a pipe; it is never success.

The command copies incoming chunks, clears its owned input buffers, and lets the
existing helper clear its owned decoded body and close its document. It does not
alter caller-owned chunks or claim whole-heap erasure. Failed execution stops
input/output; temporary error guards remain only until those streams close.
Cancellation/deadline also settle pending input/output operations.

## Mathematical-content tradeoff

The retained Wikipedia source demonstrated a distinction: raw extraction omits
display:none MathML and aria-hidden image alternatives, losing formulas and
inline symbols. Existing reader projection retains image alternatives while
omitting MathML markup, so its JSON extraction can preserve the source TeX text.
This CLI makes that existing reader workflow available without a fresh request.

This does not change raw extraction, render MathML, invent missing alternatives
or preserve the original visibility/accessibility tree. Reader output explicitly
reports `hiddenContentSemantics:false` and `styling:false`. It is unsuitable when
the task requires excluding all source content hidden in the original document.
Do not mistake omitted-math-subtree counts for proof that all formula alternatives
were lost, or preserved alternatives for complete mathematical understanding.

## Validation

The isolated focused run passes843 tests with zero failures or exclusions across
nine explicit manifest suites, including95 new CLI cases. Build, strict checking,
configured formatting and source immutability checks pass. The new cases cover
argument and independent-pin validation, default/long reader image alternatives,
byte/chunk limits, buffer ownership/clearing, stream errors, cancellation,
backpressure, deadline cleanup and zero network calls during replay.

Focused evidence is `node_modules/.cache/native-validation/math-fidelity-work-september13/fixed00`;
run September13,2026,05:05:20.659–05:06:49.790UTC. No live website,
credential/device, SafeJS, realTTY, interactive or human challenge-handoff gate
is implied by these tests. Real retained-source checks are separate evidence.

The clean broader gate passes17836 tests, zero failures and two unchanged
exclusions across344 selected suites/343 strict roots. Its722-entry manifest
leaves378 suites unrun. Build/strict/format/source checks pass; the audit binds
1252 source files,2080 compiled files and1249 unchanged tracked inputs. Evidence:
`node_modules/.cache/native-validation/native-research-replay-cli-september13-round00`.
Run05:07:15.858–05:11:20.931UTC; audit05:11:21.032UTC on September13,2026.

At05:11:43UTC, one actual invocation of the audited CLI consumed the independently
pinned saved Wikipedia receipt through stdin, emitted25964 JSONL bytes and exited0.
It retained the displayed formula's TeX alternative plus inlineN/i alternatives
through section extraction. Kernel/JS guards recorded zero network/process
attempts, the native document closed to zero nodes, and source/compiled inputs
and the original receipt/body remained unchanged. This was offline replay, not
a new Wikipedia request, MathML rendering test or controlled speed comparison.
Evidence: `node_modules/.cache/native-validation/native-wikipedia-replay-cli-september13`.
