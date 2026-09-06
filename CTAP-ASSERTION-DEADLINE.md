# Assertion exceptional-deadline enforcement

`getCtapAssertion` now checks its absolute deadline on an exceptional exit before
the operation has committed, when no earlier abort/timeout reason exists. This
closes a gap in which synchronous request/response processing or a rejected
promise could cross the deadline before the scheduled timer callback ran, then
cancel that callback during cleanup and expose the underlying error instead.

The change does not extend the deadline, replace an earlier cancellation reason,
close a later connection owner, or re-arm cancellation after a successful result
has committed inside its exclusive exchange. Existing ownership, quarantine,
buffer cleanup, typed terminal responses and sanitized error boundaries remain.

## Focused evidence

Validation on September 6, 2026 uses a committed dependency closure from
`2398f7bfade8a5f6fa40bcbdf2e4767e8108dc6c`, not the unrelated working tree.
The five new tests use actual in-memory HID transport, framing, request encoding,
response parsing and exclusive ownership. They advance the monotonic clock
without dispatching the deadline timer, covering request-size failure, deferred
digest rejection, owned write rejection, forbidden unverified response metadata
and deferred account-selection rejection. Buffer and connection assertions
cover cleanup and preservation of another owner where applicable.

- Actual unchanged assertion code: **0 passed, 5 failed**, one test file,
  `18:43:41.726443232–18:43:42.398629413 UTC`, exit 1. Each failure specifically
  expects `timeout` instead of, respectively, `resource-limit`, `network-error`,
  `unsupported`, `invalid-input` or `policy-denied`. None is an import failure or
  runner timeout. The same test bytes are used in the passing candidate.
- Two-line fix: **546 passed, 0 failed**, eight explicit native test files,
  `18:46:19.954284476–18:46:21.965809996 UTC`, exit 0. Counts are deadline 5,
  assertion transaction 124, registration lifecycle 38, registration transaction
  49, exclusive HID 37, HID connection 61, assertion response 122 and request 110.
- Build, strict test types and Biome pass for the baseline-02 and fixed-01
  snapshots. Baseline-01 setup retained one test-only deferred-buffer generic
  variance error (strict exit 2); its build and Biome passed, and no native test
  was launched for that setup. Correcting the generic preceded both native runs.
- Each native run received separate exact-scope authorization. No full manifest,
  live site, socket, TTY, SafeJS runtime, device or account test was invoked.

Evidence is retained under
`node_modules/.cache/native-validation/ctap-assertion-deadline/`; the separately
hashed baseline and fixed snapshots remain immutable. The committed assertion
runtime SHA-256 is
`4b9a8591045824590c068b0cf3636277078a18676670320deff71594d23d75d4`;
the five-case regression file SHA-256 is
`6f855cebecbdce01879b5ab35199fd53681662c869e78e1561c4e4b6a7059cd2`.

## Boundaries

This is an internal CTAP transaction deadline, **not** the page WebAuthn
`NotAllowedError` privacy-delay algorithm. It does not implement attestation
privacy projection, cryptographic verification, PIN/UV token flows, real device
allocation, genuine user consent, provider activation or page/account acceptance.
No parent-RP policy changes or previously denied gates are included. Historical
source receipts and measurements are unchanged; the overall browser goal and
outstanding gates remain in `TASKS.md`.
