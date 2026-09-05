# Independent synthetic passkey ceremony verification

September 5, 2026. **The isolated actual-runtime synthetic ceremony now passes
independent public-key and signature verification.** This is not physical or
synchronized passkey support, attestation trust, real user verification, general
relying-party validation or live-site interoperability. The default SDK and
authentication policies are unchanged; no denied gate is reopened.

## What changed

`scripts/passkey-probe-verifier.ts` is manual probe tooling, not a public browser
API. It uses Node builtins and its own bounded CBOR/COSE and DER validation; it
does not import the broker, authenticator, their encoders or their signing
helpers. Independence here means separate verification code and a public key
parsed from the observed registration, not a second cryptographic library.

The actual guest obtains credential properties and converts each byte field to
an ordinary numeric array. These packets cross the existing runtime copy and
`PageScripts` JSON-result path. Verification does not intercept provider output,
use a provider-side public key or acquire a private key. The host-only verified
registration retains the extracted public key for the assertion check.

- Registration checks exact credential fields and canonical textual/raw IDs;
  client JSON type, challenge, origin and crossOrigin; none-attestation with an
  empty statement; RP hash, flags, initial counter, zero AAGUID, embedded ID;
  and the entire EC2/P-256/ES256 COSE key, including coordinate sizes.
- Assertion checks scope and credential-ID continuity, user handle, original
  client JSON, RP hash, flags and counter, strict DER, and the ES256 signature
  over authenticatorData concatenated with SHA256 of the **original** client
  JSON bytes. The parsed registration key supplies verification authority.
- Actual-runtime negative controls alter the observed signature and alter the
  signed client JSON while updating its expected challenge to match. The latter
  is not merely an expected-challenge mismatch. Both reject after an unchanged
  valid packet has passed. Fixed-error output does not expose the internal
  rejection branch; the separate tests and static review inspect those paths.
- All previous 24 bridge checks remain, including wrong-RP and required-UV
  rejection, approval counts, cancellation, owner closure and pending-work
  cleanup. Packet and cryptography checks increase the successful total to 32.

The summary now reports independentCryptoVerification as not-performed, failed
or passed. It becomes passed only after registration, assertion and both tamper
controls succeed. A later cancellation/cleanup failure can still make the
overall probe fail; crypto status is deliberately phase-specific. No credential
bytes, identifiers, signatures, public/private keys or raw exceptions are printed.

## Explicit fixture policy

Only the exact `https://passkeys.fixture.invalid` origin/RP fixture is accepted:
none-attestation, ES256/P-256, registration counter zero, first assertion counter
one, UP flags with no UV/backup/extensions, zero AAGUID and a 32-byte credential
identifier. Expected parameters and the returned registration are trusted
host-only state, not untrusted RP input or persistent anti-replay storage.

Plain own-data records and ordinary byte-number arrays are required. Proxies,
accessors, holes, extra fields and invalid numbers reject without invoking hooks.
Limits are 2,048 client-data bytes, 4,096 attestation bytes, exactly 37 assertion
authenticator-data bytes, 8–72 signature bytes and 1–64 user-handle bytes.

CBOR accepts only definite integers, byte/text strings and maps, with fatal UTF-8,
minimal lengths, no duplicate keys or trailing bytes, depth at most four, at most
16 entries per map and 32 total entries. Eight-byte integer encodings, arrays,
tags and other values are outside this fixture subset. DER requires a complete
short-form sequence with two positive minimally encoded integers. Client JSON
must round-trip through compact JSON serialization unchanged; duplicate keys,
whitespace, noncanonical escapes and BOM reject. Another canonical key ordering
is accepted and its actual bytes are hashed. These restrictions are not claimed
as universal WebAuthn requirements.

## Transport bound and review corrections

Static review found that the initial 8,192 result cap was insufficient:
`scriptJsonResult` charges 32 units per number plus index/key costs, not merely
raw-byte or compact JSON length. The **probe-local** cap is now 327,680. Shared
serializer accounting and ordinary export are unchanged.

Maximum allowed registration and assertion packets account for 289,830 and
103,793 units respectively. Separate transport tests send maximal dummy numeric
packets through the actual serializer: both fit the new cap, and registration
rejects at 8,192. These maximal packets are not valid ceremonies and are not
used as positive cryptography fixtures. Cumulative guest source is 4,119 code
units under the unchanged 8,192 source limit; the probe still uses six evaluations.

Independent helper review found no implementation bypass within the stated
contract, but identified two coverage gaps. Parent follow-up normalizes a real
valid signature to low-S, verifies that control and bounds all DER mutations to
72 bytes so they do not stop at the outer size gate. Another test truncates only
inner COSE and re-encodes a complete outer attestation, with the untruncated
control accepted first. The original review checkpoint and 142-case initial
test record remain unchanged; the final suite has 143 cases.

## Measured evidence

Artifacts are under
`node_modules/.cache/native-validation/passkey-ceremony-verification/`.
The clean browser snapshot is sibling `passkey-ceremony-verification-integrated`,
based on HEAD `63b6472` plus only this increment. Pending parent-RP changes and
their two native-manifest entries are excluded from that snapshot.

| Gate | Evidence |
| --- | --- |
| Initial new native suite | `evidence/working-verifier-01-tests.json`: 142 passes |
| Final working native suite | `evidence/working-verifier-final-tests.json`: 143 passes |
| Final isolated native suite | `evidence/isolated-verifier-final-tests.json`: 143 passes |
| Clean project types/build | `isolated-project-types-01.log`, `isolated-project-build-01.log`: pass |
| Strict verifier/tests | `verifier-strict-final.log`: pass |
| Scoped three-file Biome | `scoped-biome-final.log`: pass |
| Actual SDK candidate | `actual-crypto-candidate-01.jsonl`: 32 passes, independent crypto passed |
| Actual pristine SDK replay | `actual-crypto-replay-01.jsonl`: 32 passes, independent crypto passed |

Test records have zero failures/skips and exactly one native test file:
`src/passkey-probe-verifier.test.ts`, explicitly added to `native-tests.json`.
The bounded runner validates manifest membership, uses an empty environment-file
directory and runs no other native suite or SDK tests. Unit keys exist only in
test memory. Positive fixtures use a test-owned encoder and real signing;
semantic assertion mutations are re-signed where necessary so a stale signature
does not hide the intended check. Full manifest validation was not run.

Actual executions had separate explicit authorization. The candidate run spans
**2026-09-05T10:15:26.137Z–10:15:26.276Z**; the replay run spans
**2026-09-05T10:15:52.236Z–10:15:52.385Z**. Both report bridgeVerified=true,
independentCryptoVerification=passed, cancellationObserved=true and
cleanupComplete=true. These timestamps identify executions, not performance
benchmarks. No website, socket, real TTY, vault or device was accessed.

Both runs use the unchanged previous `safejs-guest-bytes-{candidate,replay}`
runtime-package roots and legacy adapter. The complete previous SDK/evidence
hash ledger passes before and after. The original selected SDK, historical
failed records, previous 24-check records and the earlier contribution report's
not-performed cryptography status remain untouched. This is new evidence for
the same frozen byte implementation, not a rewritten historical acceptance run.

The first permission review timed out without execution; one permitted retry
ran the initial native suite. Initial formatting/import diagnostics and the
sandbox-blocked cache mirror are retained separately from passing final results.

## Remaining browser goal

Physical/USB/platform/hybrid/synchronized passkeys, real consent and user
verification, recovery, attestation trust, persistent relying-party state and
real-site interoperability still require their own implementations and gates.
The SDK contribution is still unpublished and unselected by default. Denied
parent-RP, browser-identity and HTTP identity-wire gates remain denied.
Password-provider, research, fingerprinting and broader seven-day work stays
tracked in `TASKS.md`; this proof does not complete that overall goal.
