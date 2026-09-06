# Request-bound CTAP assertion transactions

The internal assertion path combines the canonical request encoder, a bounded
response decoder and an exclusive connection scope. It does not enable a new
authenticator provider, acquire a device, export a private key or establish
end-to-end authentication. All live/device, PIN, consent and page-runtime gates
remain separate.

## Connection ownership

`FidoHidCborConnection.withExclusiveExchange` supplies a scoped exchange function
to a trusted callback. Reservation occurs before callback invocation. Public
`exchange` and nested/concurrent scopes reject while reserved, including gaps
between messages; state is `reserved` in those gaps and `active` during I/O.
Escaped scoped functions become permanently unusable after the scope settles.

The callback must await every exchange it starts. Successful completion releases
the connection; a callback failure, external closure or completion with unfinished
exchanges quarantines it through the existing close path. Scope rejection does not
wait for potentially hanging native close/I/O to finish; `close()` remains the
separate truthful completion handle. No failed command is retried automatically.

The generic scope supplies no overall callback deadline and cannot preempt host
code. It does not erase fulfilled response payloads owned by its caller. It prevents
interleaving through this connection API, not interference by a malicious host,
another raw handle, process or physical authenticator client.

## Response decoding

`decodeCtapGetAssertionResponse` decodes a status byte and canonical CBOR map.
Success requires authenticator data and a nonempty signature; optional fields are
a credential descriptor, user entity and positive bigint credential count. Unknown
fields are ignored only after full CBOR syntax/canonical validation. Nonzero status
alone is accepted; any accompanying body must still be a valid map.

Assertions reject AT, inconsistent ED/tail layout and BS without BE. User-identifying
name, displayName or icon fields are rejected unless UV is set. Known metadata is
bounded text; it is never fetched or rendered by the decoder. Unknown fields are
not returned. UP and requested-UV policy, RP binding, count limits and descriptor
fallback belong to the request-aware collector rather than this structural parser.

Local caps are 1023 credential-ID bytes, 64 user-ID bytes, 256 UTF-16 units for names
and 2048 for icon text, within the 7609-byte message ceiling. These are engineering
limits, not alleged limits proved by the selected historical source. A recommendation
to use 64 random user-handle bytes is not a normative maximum-length rule.

The existing browser passkey broker also rejects the forbidden BS=1/BE=0 pattern.
It does not enforce historical RFU masks, infer consent from backup flags or persist
BE immutability across registrations. Valid flag combinations do not prove a
credential is actually backed up.

## Bound collection and selection

`getCtapAssertion` encodes and snapshots the RP ID, client-data hash, allow-list
and requested UV before asynchronous work. The expected RP hash is computed from
that snapshot. This does not authorize an arbitrary RP string: callers must first
apply the browser's origin/RP policy. No pending parent-RP policy is enabled here.

One exclusive scope spans the initial request, all GetNextAssertion requests and
account selection. Every response must match the RP hash, report UP and satisfy
requested UV. A missing descriptor is allowed only for an exactly one-entry
allow-list; supplied IDs must belong to a nonempty list. Discoverable responses
require user ID. Repeated credential IDs are rejected as defensive policy.

The first count defaults to one. Counts remain bigint until checked against the
configured maximum; a nonempty allow-list cannot produce multiple assertions in
this historical protocol path. Continuations must omit the count. Exactly count
minus one argument-free `0x08` commands are sent, sequentially and without retries.

Multiple results require an explicit trusted selector. It receives frozen
containers containing indices, independent user-ID byte copies and optional names,
not signatures, authenticator data, credential IDs or icon URLs. Metadata remains
untrusted display text. Its in-range integer choice selects one response; absence,
failure or cancellation never silently selects the first account. The selector is
not invoked for a single result and is not itself a user-consent proof.

Final output contains owned credential/authenticator/signature bytes, userHandle
or null, and reported presence/verification flags. It omits names, icon, counts and
`userConsented`. A provider must separately satisfy its consent contract rather
than manufacturing that field from a selected index or backup flag.

## Bounds and failure handling

Defaults are 120 seconds total, 64 credentials and 65536 accumulated raw response
bytes including status. Timeout and count overrides can reduce those bounds;
response bytes may be configured up to 486976. Request message size follows the encoder's
default/negotiated/global command-inclusive limit. Smaller report capacities remain
connection-layer constraints.

The total deadline and caller AbortSignal cover exchanges and asynchronous selection.
Continuation exchanges have an additional 30-second cap and a local gap check after
the prior reply. These conservative client measurements are not proof of equivalence
to the authenticator's internal timer. Synchronous hostile host code is not preempted.

Success has a commit point while the reservation is still held: the final lifecycle
check runs before old abort/timer effects are deactivated. Later abort or deadline
events cannot revoke that committed result or close a subsequent connection owner.
The outer browser broker retains its own document/ceremony lifecycle policy.

After scope entry, protocol errors, invalid replies, policy failures, abandoned
selection and timeouts quarantine the connection. Valid CTAP and HID errors retain
separate typed status results; malformed error bodies reject. Preflight validation
and busy acquisition do not close another operation's connection. Closing the
library connection is not a CTAP reset or proof the device erased its state.

Owned request/snapshot buffers, raw and late response payloads, discarded assertion
buffers and selector byte copies are wiped. Returned selected buffers remain owned
by the caller. The response wrapper wipes returned decoder trees and partial outputs;
partial allocations hidden inside the shared decoder before a throw are inaccessible.
Selector copies are wiped through a captured intrinsic, with each wipe guarded;
own method overrides and detached views cannot replace the transaction outcome or
prevent wiping other copies. A selector can retain independent copies or transfer
bytes to new storage, which this cleanup cannot erase through the old view.
Caller-owned buffers and immutable strings are not erased. No whole-process heap
erasure, hostile-host sandbox or hard native-I/O preemption is claimed.

## Native source provenance

Protocol text comes only from native-browser extractions in the cache lanes
`ctap-get-assertion-source`, `ctap-next-assertion-source` and `ctap-message-source`.
They select the historical January 30, 2019 CTAP document. The first two receipts
are September 6, 2026 at 07:02:23.949 and 07:28:53.858 UTC. Their body hashes differ;
no unchanged whole-document identity is inferred from the common URL.

WebAuthn structure/type/hash evidence comes from `webauthn-assertion-offline-02`
and `webauthn-assertion-fields-offline`, replaying the archived March 4, 2019
Recommendation through the native loader/extractor. Original receipt September 5,
2026 at 05:44:55.797 UTC is not a new live retrieval. Backup-state evidence comes
from `webauthn-modern-flags-source` and `webauthn-modern-layout-offline`, using W3C's
mutable development source, not a pinned released Recommendation. Existing reports
retain exact hashes, timestamps, selection limits and partial-evidence qualifications.

Neither exclusive ordering nor a matching RP hash proves that an authenticator
signed the intended clientDataHash. Signature/attestation verification, extension
CBOR interpretation, real PIN/UV, authenticator trust, production account-selection
UI, account authentication and page/SafeJS integration remain unverified gates.

## Validation checkpoint

On September 6, 2026, the isolated ten-file native matrix passes 781 cases,
including 347 new cases: response decoding 122, exclusive scopes 37, bound
collection 124 and backup flags 64. Build, strict types for all ten named test
files and scoped Biome pass. The final native run is 09:21:46.540962078 through
09:21:49.043402299 UTC. It uses only synthetic in-memory reports, selection
callbacks and broker fixtures; it is not evidence of a real authenticator ceremony.

The first native run remains recorded as 780 passed and one failed: a uint64 test
fixture incorrectly supplied nine integer bytes after its eight-byte header.
Removing the extra zero fixes the fixture; the decoder correctly rejected its
trailing byte. No runtime change was made between those two native runs.
Earlier setup lint failures and their original logs also remain available.

Against unchanged committed broker code, the new backup matrix passes 48 and
fails all 16 forbidden BS-without-BE cases. Against the preserved reviewed
collector, all six named cleanup/handoff regressions fail; 118 other collector
cases are unselected, not passed. Final code passes these same cases. The
baselines are finite assertion failures, not setup errors or timeout substitutes.

Original JSON, stdout/stderr, timestamps, immutable input hashes, focused snapshot,
review and baseline identities are retained under
`node_modules/.cache/native-validation/ctap-assertion-transaction/`.
No new network, credential-store, SDK, socket, TTY or actual HID probe ran in this
validation checkpoint. Existing pending parent-RP changes remain excluded.
