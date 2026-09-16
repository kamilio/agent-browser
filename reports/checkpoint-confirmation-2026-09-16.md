# Checkpoint read confirmation — September 16, 2026

## Failure reproduction

The preceding full native run recorded46,304 passes and one checkpoint-file
mutation failure. Three isolated baseline runs passed, while one of three
candidate repetitions failed; its local import closure was unchanged and no
JSON feature dependency was found. Those results remain historical evidence,
not retroactively reclassified as a passed gate or a baseline reproduction.

A new controlled32-attempt trace on unchanged checkpoint production records9
accepted rewrites and23 rejections. Every injected write actually ran after the
whole42-byte original envelope was read. All9 accepted cases have identical
initial/after mtimeNs and ctimeNs and the same inode; all23 rejections have a
changed timestamp. The hash covered old already-read ciphertext. This establishes
the mechanism for this traced reproduction, not unseen timestamp values in the
historical failure. No forged ciphertext or real credential exposure is shown.

## Focused fix

Confirm the contents through the same descriptor using at most64KiB scratch,
bounded positional reads, byte comparison and an EOF probe. Repeat metadata
checks afterward. Keep private-file/no-follow/ownership/size limits, expected
hashes, generic errors, poisoning, save ordering and owned-buffer cleanup.
The shared snapshot path covers open/load and save verification. No checkpoint
format, public API or runtime dependency changes; the existing mutation assertion
is not weakened. See PASSKEY-CHECKPOINT-CONFIRMATION.md.

Two reads are not an atomic snapshot: a same-user writer can restore bytes or
write after the final observation. A stable snapshot adds one full envelope read,
EOF and metadata observations, with64KiB maximum scratch. This is additional I/O,
not a speedup, filesystem-latency bound or protection from a compromised host.

## Executed validation

- Final28 deterministic regressions all fail against unchanged production and
  all pass with the fix. The other172 selected cases remain passing with identical
  case names. Release02:200/0 in4 explicit manifest files; build, strict selected
  types, format and lint pass. Earlier26-case red/fixed runs remain separate.
- The same32-attempt trace on fixed production rejects all32, including9 with
  unchanged timestamps. Its instrumented test copy is not the committed test.
- Full03:46,333 passed/0 failed in942 available files across four isolated shards,
  at most two concurrently; 304.430 seconds overall. Every available
  file appears exactly once, with original assertions and explicit manifest scope.
  The964-entry canonical manifest still lists22 missing files. This clears the
  observed native checkpoint gate for this snapshot, not credential/device/SDK
  acceptance or a claim that every manifest file exists.
-135 saved-response comparisons remain identical:128 successful content/DOM/
  metadata/classification pairs and7 matching long-profile non-HTML refusals.
  No new website request is made by those comparisons.
- Regression coverage includes masked mid-read changes, later64KiB chunks,
  positive partial and one-byte reads, invalid counts/EOF, growth/replacement,
  poisoning, wiping, initial-open FD/lock cleanup and save temporary cleanup.
  Independent production review finds no concrete defect within its bounded
  scope and explicitly retains the non-atomicity limits.

The first full-suite launcher was terminated while its original child continued.
That same child was observed to finish and disappear; its JSON reports46,333/0,
but its exit status was not recovered. It is retained as a non-accepted supervision
attempt. Only after it and its process group were gone did full03 repeat the
entire manifest with complete per-shard exit/cleanup receipts. The source and
tests are identical. The original launcher termination's cause is unknown;
sharded coverage is not described as a second single-process execution.

The first trace run had22 passes/10 failures but its JSON reporter suppressed
console observations; it is not used for timestamp conclusions. A new trace
script writes metadata directly to captured stdout. All failed red/trace attempts
and original gate reports remain; none is rewritten as passing.

All keys and files in these tests are synthetic. No real password provider,
vault, authenticator, account, network, TTY or SafeJS probe occurs.42 prior dirty
tracked files and697 untracked files are preserved separately. Historical100-page
33 useful/67 other results, dynamic-site/SafeJS, rendering, access/CAPTCHA,
research and real authentication gates remain open. The overall goal stays active.

Evidence: node_modules/.cache/native-validation/checkpoint-confirmation-september16/.
The adjacent JSON retains test/trace summaries, source pins and negative-control
case names. Original traces include only read counts and file metadata, not key
or ciphertext contents.
