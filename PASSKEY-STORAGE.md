# Private encrypted passkey storage foundation

September 5, 2026. `src/node-passkey-checkpoint-file.ts` adds an internal trusted
host file backend around the codec described in `PASSKEY-CHECKPOINTS.md`.
The explicit host-only `NodePasskeyAuthenticator.open` factory now connects it
to save-before-result publication; see `PASSKEYS.md`. The storage primitive itself
remains internal, with no agent/page API or ambient configuration. Do not treat
encrypted local persistence as synchronized or rollback-resistant storage.

## Ownership and API

`NodePasskeyCheckpointFile.open({ path, key })` requires an explicit canonical
absolute filename in an existing protected directory and a high-entropy 32-byte
key. It copies the key before its first await, acquires an exclusive lifetime lock
and authenticates any existing checkpoint. Unknown fields/accessors reject. There
is no directory discovery/creation, ambient environment, password KDF or real-vault
inspection. The caller can wipe its own key copy after invoking the factory.

- `load()` returns fresh host-owned records, or `undefined` only for an initially
  absent checkpoint that remains absent. An authenticated empty store returns
  `[]`; corruption, wrong keys or unexpected deletion never become empty state.
- `save(records)` borrows records until settlement and writes only encrypted
  checkpoint bytes. Callers must not mutate their records during that interval.
  It returns no path, key or credential metadata.
- `close()` immediately rejects new work, waits for admitted work and cleanup,
  wipes owned codec/digest buffers and releases its owned lock. Repeated calls
  share the same close promise. Closing does not cancel an admitted save.

Loaded KeyObjects, ID copies and strings belong to the trusted caller. Closing
the backend cannot revoke those objects or guarantee erasure of native crypto,
JavaScript strings, allocator memory or crash dumps. Private class fields prevent
ordinary reflection/serialization of paths, handles, codec and internal state;
this is not a sandbox against a compromised host.

## Publication and failure contract

The backend reuses the existing Unix ownership, canonical path, protected
ancestor, no-follow/nonblocking and regular private single-link checks. Its
same-parent `.lock` is exclusively created and held for the store lifetime.
An existing lock, including a stale lock, rejects opening; no automatic lock
breaking or deletion of unknown files is implemented.

Writes use exclusive random same-directory temporary files, preserve an existing
data file's restrictive owner mode, write the complete ciphertext and fsync it.
The backend revalidates destination, directory and lock state, renames atomically,
fsyncs the parent directory and verifies the published inode/content before
acknowledgment. Remembered stat identity and encrypted-byte digest detect changes
while the lock is held. Cleanup does not knowingly unlink replaced/unowned files.

**A rejected save may already have published.** Every failure within an admitted
load/save poisons the instance; there is no reset/retry method. Close/reopen and
any recovery decision must be explicit. Overlapping operation admissions reject
without poisoning the already-admitted operation. An authenticator must await
successful save before returning a registration or incremented assertion, then
recheck its own cancellation/publication boundary. The persistent authenticator
now does this and poisons itself on uncertain writes or post-save cancellation.

No bounded filesystem completion or cancellation is promised: a stalled call can
delay close. Timeout/abort does not prove that rename did not happen. Inode/path
rechecks are cooperative fail-closed defenses, not conditional descriptor-relative
rename/unlink guarantees against root, a compromised same-user process, hostile
mounts or an untrustworthy filesystem.

## Persistence is not freshness

Authenticated old checkpoints remain readable on reopen, including an older
signature counter. Same-key checkpoint substitution is also not detected by this
format. Tests explicitly retain this limitation rather than labeling encryption
as anti-rollback. Unique per-store keys, key usage/rotation, freshness, trusted
recovery and backup policy remain required. Cross-process contention, crash/power
loss, deployed vault-directory safety, platform/USB/hybrid/synchronized keys and
human approval/user verification are separate unvalidated gates.

## Validation and filesystem boundary

All **58 new cases pass**. Six named suites produce **318 passes in each working
and isolated tree**, including genuine codec/signature checks. Types/builds,
strict new-test typing and two-file Biome pass. Both native manifests contain
427 entries; the full manifest was not executed. Parent evidence remains under
`node_modules/.cache/native-validation/passkey-file-final-*`.

The final file tests use fresh private `/tmp/agent-browser-passkey-checkpoint-*`
directories, below an 8 MiB concurrent fixture budget, with real protected outer
ancestry on the authorized host. They exercise real files, encryption, inode
checks, locks, rename and fsync. Foreign-owner/special-file classification,
unchanged-timestamp digest checks and failure/partial-I/O barriers retain explicit
test injections; they are not real foreign-user or power-loss experiments.

Earlier cache-root tests needed a modeled protected ancestor chain because this
checkout's ancestors are 0775 and sandbox root metadata differs. Those intermediate
results are preserved as such, not relabeled as genuine protected-host acceptance.
Production checks and shared directory permissions were never relaxed. A deployed
vault still needs its own approved, actually protected location.

Full chronology, hashes and ownership contract:
`node_modules/.cache/native-validation/passkey-checkpoint-file/REPORT.md`.
Its final `tests-host-fixtures.json` is separate from the earlier modeled-ancestry
results. No real account, password, vault, SafeJS runtime, website, socket/service,
TTY/PTY or child-process contention probe ran for this storage slice.
