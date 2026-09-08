# Software passkey exclusion after host approval

September 8, 2026. The software authenticator now waits for the existing trusted
creation approval before checking whether an excluded credential is present.
This fixes one pre-approval credential-membership disclosure branch. It is not
a complete WebAuthn page-consent or privacy-timing implementation.

## Behavior

For a valid creation request with available capacity, matching and nonmatching
exclusion lists both reach the host approval callback. Neither settles because
of exclusion membership while that decision remains pending. After approval,
the existing liveness check and exact-RP exclusion check still run before key
generation, credential insertion or checkpoint persistence.

An approved matching exclusion still rejects directly with `InvalidStateError`.
The broker preserves its existing provider-error redaction: this provider's
ordinary named error becomes `UnknownError` with the fixed broker message.
Changing that message alone would not have removed the early-completion leak.
Refusal, rejected approval, cancellation, timeout and close retain their existing
behavior; late approval cannot authorize a completed/cancelled operation.

The runtime delta is exactly one deleted early `checkExcluded()` invocation.
The post-approval invocation remains. No API, dependency, delay, consent cache,
automatic approval, attestation transformation, assertion behavior or RP policy
is added. Input snapshots, operation ownership and mandatory approval remain.
Capacity is still checked before approval; when both capacity and exclusion would
reject, the capacity error now takes precedence. This change does not claim
general timing noninterference or indistinguishability of all failures.

## Native evidence and tests

The rationale comes from the browser's verified native Registration Ceremony
Privacy section, recorded in `SOURCE-SECTION-PRIVACY-TRIAL.md`. It warns about
pre-consent exclusion probing and distinguishes the case where creation consent
has already occurred. The host callback remains a trusted embedder responsibility;
synthetic approvals in tests do not prove a genuine human UI or normative page
consent state. No additional source section was inferred or retrieved for this fix.

One exact isolated native cohort passes **187 tests in four files**:

- `src/node-passkey-exclusion-approval.test.ts`:20 new cases.
- `src/node-passkey-authenticator.test.ts`:49 existing cases.
- `src/node-passkey-persistence.test.ts`:41 existing cases.
- `src/passkeys.test.ts`:77 existing cases.

The new cases cover deferred approval for matching/nonmatching exclusions,
cross-RP independence, approved exclusion without key/checkpoint mutation,
restored credentials, refusal/rejection, absent approval, abort/timeout/close,
late decisions, post-resolution liveness and the actual broker/provider seam.
Crypto and checkpoint spies call through to actual local implementations.
Event ordering is deterministic; no wall-clock privacy threshold is asserted.

Two existing expectations intentionally change: direct exclusion now invokes
approval, and restored exclusion likewise consumes one approval. The direct
test title changes from before to after consent; all unrelated existing test
content remains unchanged. A draft new broker expectation was corrected during
static review to the existing `UnknownError` mapping before any test execution.

Candidate formatting passes07:07:53.756541654–07:07:53.893628971Z. Fresh committed-
baseline snapshot assembly, TypeScript production build, strict four-test types
and scoped Biome check pass07:10:59.510890624–07:11:05.937096412Z. Native outer
execution07:12:48.172106041–07:12:52.073017866Z passes with zero failed/pending
tests, matching2718input pins, all test/hash/aggregate statuses0 and empty stderr.
Each of these three execution approvals succeeds on its first attempt.

Native JSON SHA256:
`6cfeeedf5a7e81dc7ca70fb3af4e85bfb2e1561672e8593287778640b8480884`.
Expected/actual input ledger SHA256:
`9f2b799cf1a1481c0b638f173fd1af82f801a9305535ba274103a3a00c0e2179`.
Independent static candidate review finds no actionable defect; it is separate
from the actual build/test results. Evidence lives in
`node_modules/.cache/native-validation/native-passkey-exclusion-approval/`.
Independent integration review also finds no actionable discrepancy. All2718
native inputs and127frozen feature artifacts pass the final hash audits. FINAL:
`07dc704180cef2507ad78dda347059cda71b74584ba49aab66e90bee6006ffa8`.
Do not edit or rerun this frozen evidence lane.

## Scope boundaries

Tests run in a fresh snapshot based on committed `d2adff4`, not the entire dirty
working tree. The isolated manifest has518entries; only four named files run.
Two pre-existing pending manifest entries and unrelated working origin/parent-RP
changes are excluded. Integration preserves those pending changes rather than
adopting them or claiming that the mixed working tree was execution-validated.

Owned synthetic temporary checkpoints and generated test keys are not real
credentials or user vaults. No live website, socket, TTY, SafeJS, hardware device,
real password provider or page authenticator activation occurs. Full page consent,
permission lifetime, privacy-delay algorithms, attestation, other provider behavior
and genuine human approval remain separate acceptance gates. Denied parent-RP
expansion and all historical source/readiness evidence stay unchanged.
