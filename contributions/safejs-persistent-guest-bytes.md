# SafeJS persistent guest bytes

September 5, 2026. **Upstream contribution candidate, not a deployed SDK.**
`safejs-persistent-guest-bytes.patch` integrates native ArrayBuffer, Uint8Array
and DataView into an isolated copy of the existing SafeJS persistent runtime.
It applies **after** `safejs-binary-storage-foundation.patch`, not directly to
the pristine SDK. No dependency, browser engine, default runtime selection or
authentication policy changes. Neither contribution has been posted upstream.

The candidate and a pristine two-patch replay each pass 682 tests across 22
explicitly named SDK files. Each also passes the separately authorized actual
synthetic browser passkey bridge probe: 24 checks, including creation, assertion,
wrong-RP rejection, unsupported required-UV rejection and cancellation cleanup.
These use temporary software keys, not real credentials or platform devices.
**Independent ceremony cryptographic verification was not performed.**

## Base and reproducibility

The preserved local package is `@poe-code/safe-js` **0.0.1** under
`/tmp/agent-browser-safejs-13.0.10/packages/safe-js`. The directory's 13.0.10 is
not its package version or a statement about the latest upstream release.

| Anchor | SHA-256 |
| --- | --- |
| Original package manifest | `676f77f02e8a185c15f97142378549afede9dfc15d45fc98edbf8fb056aae233` |
| Original `dist/core.js` | `4a827a803dfad1dbd3039b3321006ac858ed8b16f3257c0ace5fa1399d835a7b` |
| Required foundation patch | `c3636b6edf4f370fd829e8a03236cfd2455738e1db7368828f1bf9df0bb6be8b` |
| This incremental patch | `558586de80d4e8b13d62511990a47e3686fd8cbdf4e54f6447b77dc234a1236e` |

The patch changes 32 SDK paths: 11 additions and 21 modifications. Foundation
source has 397 files; the integrated trees each have 408. The original 395-file
source ledger is rechecked against the original, preserved foundation and
original-baseline copies. All 408 candidate/replay source files and all 229
built runtime files, including the package manifest, match. This is a current
scoped integrity check, not retroactive release/dependency provenance evidence.

Apply the foundation and then this patch to a fresh compatible SDK tree rooted
above `packages/safe-js`. Standard forward `git apply --check --verbose` against
the preserved foundation and reverse checks against the replay each validate
all 32 paths, without skipped patches. Actual replay edits used `apply_patch`.
Do not apply either patch to the browser's `src/` directory or the preserved
historical SDK installation.

## Implemented contract

- Persistent realms register SDK-owned constructor closures, not injected host
  constructors or JSON byte facades. Ordinary run/replay globals remain unchanged.
- ArrayBuffer supports fixed allocation, byteLength and relative-index slicing.
  Uint8Array supports length, ordinary-array, Uint8Array and backing-buffer
  construction, indexed access, overlapping set, slice, subarray and iteration.
  DataView supports non-BigInt integer and floating-point accessors with offsets
  and endianness. Supported reflection, tags, Array.from and explicit String
  conversion use native storage and the actual SDK Budget.
- Copy/import/export/clone and host callbacks preserve backing aliases, view
  offsets, repeated wrappers, cycles, admitted own data properties and
  extensibility. Mixed Float32/raw-buffer/view graphs share one backing memo.
  Unsupported native kinds, shared/resizable/detached buffers, proxies and
  unnormalized foreign/subclass prototypes reject rather than becoming `{}`.
- Copying transfers the **whole backing store**. A small view is not a secrecy
  boundary. Browser passkey exports independently retain their existing fresh,
  exact-span buffers. No password or credential boundary is weakened.
- Guest structuredClone and console use aggregate preflight and the actual
  Budget. Console copies its entire argument graph once, preserving aliases.
  Array expando retained accounting includes mutable descendants beneath frozen
  parents. Binding-record getters resolve once before preflight. Native
  collection traversal avoids overridable iterator/size hooks.
- Callable names use own data descriptors; name accessors and proxy callables
  reject without invocation. Inherited names are ignored, and async detection
  uses captured native branding rather than prototype traversal. Callable
  bodies remain trusted host capabilities, not sanitized guest code.
- Binary replay, snapshots, dump admission/restoration and argument digests
  reject explicitly. Existing encoded Float32 storage remains supported. No new
  persistence tag, surrogate codec or silent semantic loss is introduced.

The public host-owned copy API remains intentionally unbounded when no Budget
is supplied. Provisional/retained units are logical accounting, not measured
JavaScript heap bytes. Full typed-array/prototype/species/transfer behavior,
arbitrary coercion callbacks, implicit binary numeric coercion, other typed
array families and BigInt DataView methods are not claimed.

## Validation and preserved failures

All paths in this section are beneath `node_modules/.cache/native-validation/`.
Each SDK or actual-runtime execution had separate explicit authorization.
Neither SDK suite is a browser native-manifest pass, full SDK test pass or live
website/device acceptance. No denied identity, wire or parent-RP gate reopened.

| Record | Result |
| --- | --- |
| Original SDK realm prerequisites, `safejs-guest-bytes-baseline/evidence/realm-prewire-red-tests.json` | 15 failures; 68 deliberately excluded |
| Wired same realm scope, candidate `realm-wired-01-tests.json` | 15 passes; 68 excluded |
| Candidate initial eight-file integration | 295 passes, seven failures |
| Candidate final twelve-file integration | 462 passes, no skips |
| Candidate ten existing regression files | 220 passes, no skips |
| Original ten-file regression baseline | 220 passes, no skips |
| Pristine replay, same twelve plus ten files | 462 + 220 passes, no skips |

Candidate records live in `safejs-guest-bytes-candidate/evidence/`; replay
records live in `safejs-guest-bytes-replay/evidence/`. Final records are
`integration-final-01-tests.json`, `existing-regressions-03-tests.json`,
`replay-guest-bytes-01-tests.json` and `replay-existing-regressions-01-tests.json`.

The twelve-file list is `interp/binary-{storage,storage-admission,globals,values,
persistence,reflection,realm,snapshot-admission,guest-copy,preflight-regressions,
callable-metadata}.test.ts` and `interp/float32array.test.ts`, relative to SDK
`src/`. The ten existing files are `interp/{values,clone-prototype-independent,
host-bridge,retained-shapes,host-call-graph,host-digest-representation,data-budget}
.test.ts` and `snapshot/{serialize,restore,replay-data}.test.ts`. The two exact
Vitest configs are retained in both isolated trees; one worker and no file
parallelism were used. No packages were installed.

Initial failures are retained, not rewritten: unreachable guest defineProperty
fixtures, a missing reflection return, a prematurely exhausted fixture Budget,
overstrict Uint8Array index writes, and superseded Uint8Array rejection tests.
Only those old rejection expectations change: Float32 tests now verify Uint8
copy independence, and the existing values test uses still-unsupported Uint16.
Relative slice indices and kind-specific readonly slots have native differential
coverage. A later Float32 snapshot failure mixed two distinct snapshot codecs;
its corrected fixture uses raw bindings with the high-level dump serializer.

Independent static reviews `BRIDGE-REVIEW.md`, `BRIDGE-REVIEW-02.md` and
`BRIDGE-REVIEW-03.md` preserve six budget/accounting/metadata findings and their
source checkpoints. Guest clone/console reproductions initially fail ten cases
and pass one, then pass all eleven. Initial callable metadata tests fail seven
cases: six boundary cases plus one incorrect native-Promise fixture. After
correcting that fixture, the first follow-up passes six and exposes the remaining
nested-proxy check. Final coverage has nine passing callable cases, including
root, nested and returned metadata paths. Review conclusions are static; actual
execution results are separate JSON records.

Strict compilation of the twelve named byte/Float32 test files and public core
passes. Scoped Biome passes for 13 helper/new-test files in both trees and the
browser probe. Existing `values.test.ts` has 45 strict diagnostics at identical
locations/codes in the original and candidate; those unrelated annotations are
not repaired or represented as passing. Full SDK lint/types are not claimed.

## Actual browser passkey gate

The browser fixture comes from committed HEAD `6fd37dc`, excluding pending
parent-RP changes. Its only source correction is four explicit `return`
statements in `scripts/check-passkeys-runtime.ts`. SafeJS returns a value for a
single expression, but a multi-statement block needs an explicit return. A new
real-realm regression proves this behavior and preserves var bindings across
asynchronous evaluations; no SDK semantics were changed to satisfy the probe.

`actual-candidate-passkeys-01.jsonl` fails loading the incomplete first build.
TypeScript emitted only the explicit core entry under the node_modules cache;
exit zero was not a complete executable build. The corrected config names core
**and** all 113 transitive SDK sources explicitly. It produces 114 JavaScript
files plus declarations; 409 discovered relative imports have existing targets.
Replay caught an omitted explicit core entry before any replay runtime probe;
the corrected candidate/replay builds match exactly. These build failures remain
separate from SDK behavior.

`actual-candidate-passkeys-02.jsonl` passes all byte prerequisites and evaluates
creation, but its implicit completion-value assertion fails. The separate
`actual-create-diagnostic-01.jsonl` likewise fails its array-shape check because
that multi-statement source returns undefined. Neither record proves a failed
ceremony predicate. After the four explicit-return corrections,
`actual-candidate-passkeys-03.jsonl` passes 24 checks at
**2026-09-05T09:53:11.322Z–09:53:11.450Z**. The separate replay record
`replay-actual-passkeys-01.jsonl` also passes all 24. Both report
bridgeVerified=true, cancellationObserved=true and cleanupComplete=true.

The original selected package and its earlier failed probe records are unchanged.
The successful runtime roots are each isolated tree's `runtime-package/`, legacy
adapter, original package manifest; they are not the default selected SDK.
`FINAL-AUDIT.json`, `FINAL-SHA256SUMS`, per-path source manifests, review reports,
compiler logs and initial/intermediate test records preserve the evidence chain.
The initial generated patch accidentally trimmed a final context-only blank line;
its malformed copy is preserved, and the corrected standard patch matches the
original intended hash and passes forward/reverse checks for all 32 paths.

## Outstanding gates

Actual signature/client-data/authenticator-data verification against an
independently parsed public key, physical or synchronized passkeys, attestation
trust, real user verification, persistence and real-site interoperability remain
separate work. This is not full WebAuthn or ECMAScript conformance. SafeJS release
integration and explicit runtime selection remain outstanding. Fingerprinting,
Cloudflare behavior and research access restrictions are unaffected. Keep the
overall browser goal and independent acceptance gates in `TASKS.md`.
