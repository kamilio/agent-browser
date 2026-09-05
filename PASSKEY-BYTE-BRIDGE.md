# Passkey byte bridge and host boundaries

September 5, 2026. **The original selected SDK gate still fails; an isolated
patched SDK now passes the synthetic passkey bridge gate.** Neither result is
hardware, synchronized-passkey or full WebAuthn acceptance. No denied gate reopens.

The later `PASSKEY-CRYPTO-VERIFICATION.md` increment independently verifies
guest-exported registration, public key, client data and assertion signatures.
Both frozen SDK roots pass 32 separately authorized actual checks, including
tamper rejection and cleanup; 143 native verifier cases pass in each tree.
Earlier 24-check runs remain recorded as crypto not-performed. Default runtime
selection and the original SDK's failures are unchanged.

`contributions/safejs-persistent-guest-bytes.md` records the later persistent-byte
integration: 682 named SDK cases pass in both candidate and pristine patch replay.
Both separately built runtimes pass 24 actual synthetic browser checks for
create/get, rejection and cancellation, with cleanup complete. The browser
fixture excludes pending parent-RP changes; its probe only gains four explicit
result returns required by the existing SDK. Initial loader/build and completion
value failures remain preserved. Those initial runs did not independently verify
cryptography; the later increment above does. Real devices/user verification,
persistence and live sites remain open. The
candidate is not installed, published or selected as the browser default.

A later, separately authorized in-memory SDK increment is recorded in
`contributions/safejs-binary-storage-foundation.md`: a dormant two-file storage
contribution, with 64 passing cases in both candidate and pristine patch replay.
It does not register guest bytes or alter the selected runtime. Whole-backing
copy authority, graph accounting, interpreter/marshalling and persistence gates
remain explicit. Those new SDK unit runs are separate from the historical
host-only hardening and static inspection described below.

## Historical runtime failure

The authorized legacy prerequisite run found Promise and shared global/Window
credentials identity, but neither Uint8Array nor ArrayBuffer constructors. Its
record remains failed, bridgeVerified=false and cleanupComplete=true. Earlier
creation-stage and initial build/import failures remain separate. No ceremony,
typed rejection, cancellation or independent crypto acceptance was demonstrated.

Original records under `node_modules/.cache/native-validation/` remain in
`passkey-runtime-probe/actual-isolated-first.jsonl`, `actual-prerequisites.jsonl`
and `PARENT-RESULTS.md`. Historical JSON lacks later timestamp/package fields;
none are retroactively inserted or inferred. No probe against that original SDK
was rerun; the later isolated candidate/replay runs above use distinct records.

## Selected SDK finding

This section describes the unchanged original package, not the patched candidate.

The explicit root is `/tmp/agent-browser-safejs-13.0.10/packages/safe-js`.
Its manifest identifies **@poe-code/safe-js 0.0.1**, exporting `./core` through
`dist/core.js`. The directory's 13.0.10 is not this package's SDK version.
Current hashes match the previous post-run anchors:

- Manifest: `676f77f02e8a185c15f97142378549afede9dfc15d45fc98edbf8fb056aae233`
- Core: `4a827a803dfad1dbd3039b3321006ac858ed8b16f3257c0ace5fa1399d835a7b`

This is not a historical full-transitive integrity audit. The new static review
verifies 52 selected source/dist/documentation/instruction files as they exist
now, without executing them or establishing a newer SDK release.

The selected builtin registration, public options and interpreter copy paths
lack a general guest ArrayBuffer/Uint8Array/DataView implementation. **Limited
Float32Array support exists**, installed unconditionally, with selected numeric
operations but no guest backing-buffer API or general TypedArray family.
Internal host ArrayBuffer/Uint8Array use does not install guest constructors.

Copy/admission special-cases Float32 values; raw host byte buffers/views do not
qualify as plain objects. Static inspection predicts unsupported-value rejection,
not a byte codec; that is not a new runtime result. Generic injected host
functions lack the interpreter's constructor slot. A host facade is not a genuine
guest BufferSource, and neither injection nor a shim is proposed as a substitute.

No supported byte-feature switch was found. Browser selection explicitly checks
**contract shape only**. Legacy bindings/budgets do not create byte intrinsics;
the extension adapter declares no byte codec and was not run as a workaround.
Final JSON evaluation-result copying is distinct from nested credential arguments
and capability-return buffers. The SDK needs an actual byte implementation.

## Independent host defects and hardening

The two findings predate pending parent-RP edits and do not prove an RP/consent
bypass or demonstrated guest exploit.

**Native view slots:** ordinary reads of view.buffer/byteOffset/byteLength could
be shadowed, changing the selected span or invoking getters. NaN length could
bypass a minimum and yield an empty copy. The broker now uses captured native
TypedArray/DataView slot getters and finite-integer bounds before copying.
Own/inherited shadows are ignored without invocation; raw-buffer native brands
and rejection of shared/invalid storage remain. Actual visible bytes are copied
independently. Limits, origin/RP rules, consent/UV, providers and persistence do
not change. Host BufferSource hardening cannot create missing guest bytes.

**Publication errors:** raw createHostObject throws during asynchronous
credential publication could escape the host Promise. Guest exposure depended
on the adapter. The capability boundary now checks current lifetime; if still
current it emits fixed NotSupportedError text without inspecting raw errors.
Otherwise the existing lifecycle error takes precedence. Existing
before/after guards, duplicate checks, provider errors and signal cleanup stay.
Initial, response/credential and extension-result publication share this check.
Failure does not promise rollback of an already successful authenticator action.

## Genuine SDK and adapter acceptance still required

- SDK-owned constructors/brands and the byte/view operations required by real
  pages; matching public types, built dist, interpreter and marshalling.
- Byte-preserving inbound/outbound conversion, exact nonzero-offset spans,
  independent snapshots and documented alias/lifetime behavior.
- Genuine guest Uint8Array/ArrayBuffer operations and other required views;
  rejected fake/proxy/shared/detached or unsupported states, bounded allocation
  and copying, unchanged challenge/user/credential bytes and fresh output buffers.
- Guest Promise settlement and fixed typed errors; cancellation, navigation and
  close cleanup. No raw provider private key or fabricated user verification.
- Separately authorized actual-runtime checks after compatible SDK work, then
  independent relying-party/device acceptance. Same-realm mocks are insufficient.

These are minimum bridge checks, not a reduced browser/passkey goal. Float32
numeric conversion and arbitrary property bags are not substitutes. The existing
manual probe remains gated; source inspection does not authorize its execution.

## Evidence and scope

**99 buffer-slot and 69 publication regressions pass.** Six explicitly named
files total **356 passes in each working/isolated tree**, with project types,
explicit dist builds, strict new tests and scoped Biome/format checks passing.
No full manifest ran. Working/candidate manifests contain 451/449 entries; the
two pending parent-RP suites are excluded from the patch and test matrix.

The unchanged old code fails **138/168** new cases and passes 30: 90 buffer
failures and 48 publication failures. Its four existing suites independently
pass 188 cases. These tests use existing APIs, not missing new exports. Old
snapshot and five-file input ledger are preserved via
`/tmp/passkey-byte-boundary-old-baseline-path`; the separate tested candidate is
in `/tmp/passkey-byte-boundary-integrated-path`. Final validation logs use
`passkey-byte-boundary-final-01-`. Before/candidate/working delta verification
preserves pending RP and unrelated changes rather than staging whole auth files.

The buffer worker's first run was already after parent hardening, so its initial
pass is not presented as a red baseline; the parent replay above is separate.
Publication history preserves the original 65-case pre-fix run, one fixture
TypeScript narrowing error and a post-fix 57-pass/eight-failure run. Those eight
failures came from Vitest's own instanceof check on thrown proxies before the
production catch. A plain throwing factory, with a separate harmless recorder,
removes that tooling interference without weakening the no-property-read check.
Final 69-case results and all earlier logs remain distinct. No source security
check or quota was relaxed to make those fixtures pass.

Cache paths below share `node_modules/.cache/native-validation/`:
`passkey-byte-sdk-review/` holds the 52-file SDK review;
`passkey-byte-adapter-review/` holds browser adapter analysis;
`passkey-byte-bridge-review/` preserves the original host findings and synthetic
coverage limits. Their pre-fix files remain in `passkey-byte-boundary-before/`;
the original reports are not rewritten into post-fix findings.

The parent verified original bridge inputs before editing. Their two subsequently
changed production files have exact pre-fix copies; the original input ledger is
not falsely claimed to still match post-fix live paths. A separate incremental
source review verifies six current/before/context hashes and finds no new
blocker within the host contract. It is not runtime or device evidence.

Host implementation regression and baseline evidence is separate from static
SDK inspection. No SDK import/execution, other engine, shim, dependency
acquisition, live request, socket, real vault/account, hardware or platform
authenticator is involved. Pending parent-RP changes remain excluded from this
focused change. The full browser goal remains active in `TASKS.md`.
