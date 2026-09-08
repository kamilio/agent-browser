# Passkey errors use private issuance identity

The broker's two exception classifiers no longer inspect caught-value prototypes
or forward caught objects. They recognize privately issued errors by identity and
construct fresh fixed outward errors from separately recorded canonical codes.
This fixes a bounded exception-handling problem, not the complete passkey trust or
consent model.

## Corrected behavior

Previously, `instanceof PasskeyError` could execute a hostile Proxy trap. In the
live ceremony handler that could reject a discarded catch promise and defer actual
settlement until cancellation/deadline. Private-prototype counterfeits or modified
genuine errors could also pass instanceof and escape unchanged with provider text,
accessors, cause or stack. These mechanisms were identified by static review; no
real provider, page runtime or device exploit was demonstrated.

`src/passkeys.ts` now has a private WeakMap of issued error identities to canonical
ErrorName values. Only an unexported factory registers issuance; invoking a captured
class constructor or copying its prototype does not. Lookup uses typeof/null and
WeakMap only, without properties, prototypes or coercion. Both classifiers create
a fresh fixed error, never reading the caught object's mutable name/message/cause
or forwarding its stack. Cancellation also uses the trusted issuance factory.

Unknown initial-validation failures retain fixed TypeError. Unknown live provider
or result failures retain UnknownError, except the unchanged create-only,
matching-signal consent-qualified exclusion mapping. `valid()` still precedes
classification/exclusion consumption. Existing canonical codes, consent checks,
deadline/cancellation/cleanup order, origins/RP, provider/crypto and page interfaces
remain unchanged. No new dependency, registry export or real provider activation.

Identity is trusted issuance, **not current-ceremony provenance**. A genuine error
captured from an earlier operation can retain its recorded canonical code when
replayed, even if its fields are modified; only the outward object is sanitized.
The change does not make every provider-originated genuine error UnknownError or
prove fresh human consent. Providers remain trusted host code, not sandboxed code.
Other intentional dictionary/result reads are not made globally property-free,
and monkeypatched intrinsics/nonreturning callbacks are outside this guarantee.

## Actual isolated validation — September 8, 2026

Committed7c7b2d89 source/config/package plus exactly two candidate files form the
isolated snapshots. The native manifest grows521 to522; the mixed root has524
entries, preserving two unrelated pending origin/RP entries outside this cohort.
Root passkeys.ts also retains its prior54-added/8-removed pending delta; only the
new identity correction is isolated for commit. That mixed file is not represented
as the exact tested snapshot. The new root test matches the accepted test bytes.

- Format01,09:21:47.126962185–09:21:47.442615638Z: success with originals retained.
- Setup01,09:30:44.055883177–09:30:52.006136847Z: build0/types0/lint1, solely the
  new fixture's direct then-getter construction. A uniform named-field loop keeps
  identical getter identity, property order/descriptors and all assertions.
- Setup02,09:32:50.791807084–09:32:58.880342690Z: build0/types0/lint0.
- Native02,09:34:22.576757035–09:34:27.057411486Z:134pass/3fail/0pending. All117
  prior cases pass; three new zero-inspection assertions observe a Proxy read.
- Setup03,09:39:40.189282947–09:39:49.493404838Z: build0/types0/lint0 after the
  test-only instrumentation correction. Runtime bytes remain unchanged.
- Native03,09:42:30.344358153–09:42:35.103306099Z: **137pass/0fail/0pending in
  three files**:20new,77unchanged broker cases and40unchanged exclusion cases.

These are supervisor intervals. Every action has fresh approval without an
approval timeout/retry. No native01 ran. Format/action children, including prechecks
and final records, have60+5/120+5/210+5second bounds respectively; native has its own
180+5child bound and6MiB per-file cap. Supervisor startup/final publication remains
outside the deadline, not atomic/durable storage or process-isolation proof.

### Preserved instrumentation failure

Static inspection of installed @vitest/spy4.1.10 finds a synchronous-throw catch
that evaluates instanceof TypeError before rethrowing. The old fixture sent hostile
throws through that mock boundary, which can inspect or replace the tested value
before the broker sees it. This explains a concrete fixture hazard consistent with
the three failures, not an additional executed reproduction. A passed revoked-getter
case had the same masking risk; its old pass remains recorded without overclaiming.

The corrected fixture uses plain provider/descriptor/result-getter handlers that
record via nonthrowing spies and then throw outside mock instrumentation. Typed
one-shot queues preserve synchronous versus asynchronous behavior and call counts.
No zero-inspection, immediate settlement, cleanup/reuse or other assertion is
removed. All20case names and117prior test bytes remain intact; unhandled errors are
not globally ignored. No dependency code or broker runtime changes for this repair.

New/exclusion fixtures use synthetic providers, fake clocks and stub digests.
Prior broker tests retain ordinary SHA256 calls and10ms scheduling waits, not key
generation. One native PagePasskeys fixture is not a guest/SafeJS acceptance run.
No live network, real password/provider/key/vault/device/TTY/SafeJS operation occurs.

Native03 JSON:42311bytes, SHA256
`8f51e896f3b6cffe0d1726bca5967ac822bc248e6c746c42250d1f6062b840e5`.
Expected/before/after2734-input ledgers match at
`35b4a094ff24794972b526e48b6327e31ee12f76913c754bb0596ff3670b7f78`.
They include two explicit installed spy implementation/package files beyond02's
2732entries, not retroactive02 or complete transitive-toolchain attestation.
Parent independently rehashes all2734; audit
`4830172868ae71f756079be154d4d85caf5086e9b81cc81b68c64f15763a9cc3`.
Independent integration review confirms the narrow delta and preserved pending
work, checks actual03metadata and rehashes selected inputs. The226-file evidence
ledger is sealed and all226opaque hashes pass its final audit:
`4685bd64ff528ff810d3eb027fdca4875ea7837636d2eefc7b97c54da760ade3`.
No validation is rerun to create that seal.
Evidence: `node_modules/.cache/native-validation/native-passkey-error-identity/`.
`TASKS.md` retains the browser goal and all outstanding consent/privacy/device gates.
