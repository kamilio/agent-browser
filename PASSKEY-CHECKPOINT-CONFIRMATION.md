# Bounded checkpoint content confirmation

The native checkpoint-file wrapper checks a private, owned regular file, its
descriptor/path identity, mode, size, timestamps and expected ciphertext hash.
Those protections remain necessary, but timestamp equality alone cannot prove
that a file was not rewritten during a read.

## Observed problem

A September16,2026 synthetic trace injected an awaited same-length rewrite
after the original42-byte envelope had been read. Nine of32 attempts returned
the previously read authenticated empty checkpoint: the actual inode, mtimeNs
and ctimeNs observations were unchanged. All32 injections ran. The other23
attempts observed changed timestamps and rejected. This reproduces the earlier
intermittent mutation-test symptom; the historical failure itself had no such
timestamp trace and is not retroactively rewritten as new evidence.

The previous hash used the already-read buffer. It could still match the
remembered checkpoint even though the on-disk ciphertext had changed. Returning
an old authenticated value is not evidence of accepting forged ciphertext, but
it violates this wrapper's tested rejection behavior for a detected rewrite.

## Confirmation behavior

Each present-file snapshot now performs a second positional read through the
same open descriptor and compares every returned byte against the first read.
It uses one scratch buffer of at most65,536 bytes, advances only on valid positive
integer counts, rejects short EOF/mismatch/invalid counts, and verifies final EOF.
Descriptor and pathname metadata are rechecked after confirmation. Positive
partial reads remain supported; there is no retry-until-stable loop.

The scratch buffer is wiped on success and failure. Existing snapshot buffer
ownership, descriptor closure, generic errors and load/save poisoning remain.
Initial open, destination checks, temporary-file verification and post-publication
verification all use the same snapshot path. No checkpoint format, key-provider,
public API, package dependency, expected-hash or lock policy changes.

## Limits and cost

- This is bounded re-observation, not an atomic snapshot or protection against an
  unrestricted same-user writer. A writer can restore bytes before observations
  or change them after the last content/metadata check; separate FD/path/lock
  checks are not mutually atomic. Trusted directory ownership and cooperating
  writer discipline remain required.
- A stable present snapshot reads its envelope twice and probes EOF twice, with
  extra metadata observations. The added scratch allocation is at most64KiB.
  These are deterministic work bounds, not a speedup or a filesystem-latency
  guarantee. Save performs multiple snapshots, so it also incurs this work.
- Failures after publication still do not provide rollback. Existing freshness,
  backup/recovery, real-vault, actual runtime and physical-authenticator gates
  remain separate. Synthetic keys/files do not establish live passkey acceptance.

The codec's original scope and measurements remain in PASSKEY-CHECKPOINTS.md.
New validation evidence is recorded separately rather than rewriting that history.
