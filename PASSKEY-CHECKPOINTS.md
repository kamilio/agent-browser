# Encrypted passkey checkpoint foundation

September 5, 2026. `src/node-passkey-checkpoint.ts` implements an internal,
trusted-host codec for encrypted snapshots of native software passkey records.
It is not yet a persistent authenticator, public package export, agent command,
page capability, key provider or recovery interface. `PASSKEYS.md` retains the
separate actual-runtime and real-authenticator acceptance gates.

## Host boundary

`NodePasskeyCheckpointCodec` accepts an explicit high-entropy 32-byte encryption
key, copies it and keeps it in JavaScript-private state. `seal(records)` returns
encrypted bytes; `open(envelope)` authenticates and validates before returning
host-only records containing native private KeyObjects and copied public metadata.
`close()` wipes the owned raw encryption key and rejects further operations.

There is no method returning plaintext private-key bytes. Internal PKCS8 buffers
exist only for encryption/import and are wiped where owned. A trusted host holding
a returned KeyObject still has Node's ordinary signing/export capabilities: this
codec is not safe to expose to pages or an agent as a private-key lookup API.
No environment, password file, `pass` executable, account or keyring is consulted.
Key length is not an entropy test; callers must supply a suitable unique key.

## Authenticated format

The version-one binary envelope contains the eight-byte `ABPKCP`, version-one,
reserved-zero prefix, a four-byte length and a fresh random twelve-byte nonce.
This entire 24-byte header is authenticated as additional data. AES-256-GCM uses
an explicit sixteen-byte authentication tag on encryption and decryption.
Authentication completes before record parsing or key import. Unknown versions,
wrong keys, altered data, inconsistent lengths, truncation and trailing bytes
fail with a fixed error, without exposing underlying errors or input data.

The plaintext has an exact bounded binary schema: at most 64 records, strictly
ordered unique credential IDs, canonical DNS RP IDs, user identifiers/names,
unsigned 32-bit counters and native P256 private keys in canonical bounded PKCS8.
It rejects unsupported key types, unsafe record descriptors, proxies, shared or
invalid byte views, duplicate IDs and noncanonical UTF-8/DER. Validation is stricter
than the original ephemeral provider in some metadata edge cases; it is not a
public-suffix or origin-authorization check.

Maximum plaintext is 201,474 bytes; maximum envelope is 201,514 bytes. No JSON
private-key strings or caller-selected cipher/KDF parameters are used. Supported
keys are normal native Node P256 private KeyObjects; prototype discovery generates
one temporary synthetic pair lazily. This is not protection against a compromised
host or monkeypatched Node crypto prototypes.

## Not yet persistence

- No file writes, atomic counter updates, writer locks, crash recovery, user
  approval or durable authenticator integration occur in this codec.
- Old authentic checkpoints remain acceptable. Same-key checkpoint substitution
  between stores is not detected: there is no external store identity or durable
  generation in the authenticated format. Per-store key isolation, freshness,
  transaction and backup/recovery policy remain required integration work.
- Random nonce uniqueness is probabilistic. Aggregate key-usage limits, rotation
  and nonce policy across instances are external requirements, not enforced here.
- JavaScript strings, caller-owned copies, returned KeyObjects, native crypto
  internals, allocator pages and crash dumps are not claimed erased by close.
- This is software encryption, not hardware isolation, user verification,
  platform/USB/hybrid/synchronized passkeys or a completed passkey service.

## Validation provenance

The worker's 65 named synthetic cases exercise genuine encryption/decryption,
independent signatures using restored keys, every byte mutation/truncation of a
sample envelope, wrong keys, malformed authenticated records, capacity/ownership,
private-state reflection and observed owned-buffer wiping. Detailed interface,
schema, intermediate failures and final evidence remain at
`node_modules/.cache/native-validation/passkey-checkpoint/REPORT.md` and
`tests-final.json`. The worker explicitly selected its new suite with configuration
disabled; that is not a run of the repository's native manifest.

The parent registers the new suite in `native-tests.json` for integration with
the normal native configuration. File persistence, real secrets, actual SafeJS,
platform authenticators and relying-party acceptance are not inferred from these
in-memory cryptographic tests.

Parent integration passes **260 tests in five named files in each working and
isolated tree**, including all 65 new codec cases. Project types/builds, strict
new-test typing and two-file Biome checks pass. Both manifests contain 423 entries;
the full manifest was not executed. Logs and JSON remain under
`node_modules/.cache/native-validation/passkey-checkpoint-final-*`. The source
and test SHA-256 values at worker handoff match the integrated bytes.

Implementation reference: official Node crypto documentation,
`https://nodejs.org/api/crypto.html`, consulted by the parent September 5, 2026.
The reference lookup is not a native-browser acceptance measurement.
