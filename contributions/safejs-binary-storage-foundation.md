# SafeJS binary storage foundation

September 5, 2026. **Dormant upstream contribution, not deployed guest bytes.**
`safejs-binary-storage-foundation.patch` adds two internal SDK files: a storage
helper and its unit tests. It changes no existing SDK file, public export,
browser runtime selection, dependency, native manifest or authentication rule.
It has not been posted upstream. The selected actual passkey runtime gate still
fails; its historical evidence is unchanged.

## Base and scope

The base is the selected local `@poe-code/safe-js` package version `0.0.1` under
`/tmp/agent-browser-safejs-13.0.10/packages/safe-js`. The enclosing `13.0.10` label
is not its package version or a claim about a current upstream release.

| Anchor | SHA-256 |
| --- | --- |
| Base package manifest | `676f77f02e8a185c15f97142378549afede9dfc15d45fc98edbf8fb056aae233` |
| Base `dist/core.js` | `4a827a803dfad1dbd3039b3321006ac858ed8b16f3257c0ace5fa1399d835a7b` |
| Contribution patch | `c3636b6edf4f370fd829e8a03236cfd2455738e1db7368828f1bf9df0bb6be8b` |
| New `interp/binary-storage.ts` | `39a7649447a0f4d44f49c4e15e60e4e1286ecd11c98f58ab2053b992845f2c00` |
| New `interp/binary-storage.test.ts` | `889cac7a31365aa21ca09ac3a084e5afb8630883fda80e8f9b1fd632a4f7c020` |

The original package is never edited. Work and replay use separate copies under
`node_modules/.cache/native-validation/safejs-byte-storage-candidate/` and
`safejs-byte-storage-replay/`. A 395-file original source ledger and the earlier
52-file selected SDK ledger are independently rechecked. These scoped anchors
are not a historical full-transitive SDK integrity or dependency provenance audit.

## Implemented storage contract

`binaryStorage(value)` returns the native kind, backing buffer, byte offset,
visible byte length and whole backing length. It uses captured slot getters,
not instance `.buffer`, `.byteOffset`, `.byteLength`, `.length`, constructor,
species or tag properties. Hostile shadow getters and proxy traps are not run.
Native brands and exact current prototypes are required; shared, resizable,
detached and unsupported storage fail with fixed TypeError text. Valid empty
buffers and empty views at the end of a backing store are admitted.

This is present brand/prototype validation, not historical construction-origin
attestation. Unmodified subclasses and foreign prototypes are rejected; a host
that deliberately normalizes a genuine object's prototypes is trusted, not an
origin that this helper can retrospectively identify. Genuine cross-realm
fixtures were not executed. Raw Node Buffer is not an admitted Uint8Array subclass.

`copyBinaryStorage(value, state, budget)` clones the **whole backing store** and
preserves the visible offset, length, kind and shared copied storage. Different
original stores remain independent; copied overlapping views observe each
other's writes but not subsequent original writes. A repeated raw buffer returns
the memoized copy. Repeated view wrapper identity, expandos and cyclic graphs
are deliberately outside this low-level helper's contract.

**A small view is not a secrecy boundary.** Every byte of its backing store is
transferred. Any future host crossing must authorize that whole store or first
make a fresh exact-span buffer. The existing browser passkey broker independently
does the latter; this contribution does not weaken or replace that boundary.
Silently zeroing adjacent bytes would not preserve native graph semantics.

The real SDK Budget is required. Whole backing length is checked against the
array-length limit, including on memo hits. Copying provisions new backing bytes
plus one wrapper unit, or one wrapper unit for an existing backing, before
allocation. A finally block releases provisional usage. Validation and bounds
failures do not insert a new memo entry or rewrite existing copied bytes.

Budget and memo are trusted host inputs. A memo must remain private to one graph
traversal, without guest access, cross-principal reuse or externally detached
copies. A memo hit deliberately does not refresh source bytes. Provisional/peak
accounting is **not** retained graph accounting or a heap-memory measurement:
the future integration must charge retained backing, all wrappers and aggregate
graph lifetime. The validation-only zero-length view is a temporary wrapper,
not a new backing allocation. Post-provision native allocation failure cleanup
is statically covered by finally, not a separately forced failure experiment.

## Separate authorized evidence

Each SDK test invocation had its own explicit authorization and sanitized
environment, with isolated HOME, TMPDIR and runner cache. Only the named unit
files ran; no whole SDK suite, browser native manifest, browser identity probe,
guest passkey ceremony, live website, socket, TTY, vault or device was exercised.
The Float32 file does execute existing in-memory SDK behavior; these are not
misrepresented as browser-only tests.

| Run | Result |
| --- | --- |
| Unchanged Float32Array baseline | 27 passed |
| New 36-case helper suite against explicit unimplemented stub | 25 failed, 11 passed |
| Initial helper implementation plus Float32Array | 63 passed across two files |
| Final candidate: 37 helper cases plus 27 Float32Array cases | 64 passed, zero failed/skipped/todo |
| Same final patch reconstructed in a second pristine SDK copy | 64 passed, zero failed/skipped/todo |

The stub red result is TDD evidence for an intentionally absent implementation,
not a demonstrated regression in the unchanged SDK. Its source and original
test fixture are preserved. A later static review prompted one additional
cross-brand native-view prototype case; the first 63-case run is not rewritten
as the final 64-case result. Shared, resizable and detached fixture guards were
all active in the final runs, with no skipped cases.

Final candidate strict source/test compilation, a focused helper declaration/JS
build, and scoped Biome checks pass. This is not a whole SDK build or proof that
the selected distribution exports these values. No new package is installed.
The first compiler invocation used an absent `.bin/tsc`; the next requested
unavailable Node typings. Reusing the installed compiler and Bun typings exposed
one DataView subclass generic annotation issue, which was corrected. Initial
stdin checks and 23 non-null-assertion lint findings are retained; explicit
getter validation and a narrowing test helper resolve the scoped checks without
disabling rules. The initial approval review timed out once; its permitted
retry was authorized, and no first-attempt execution occurred.

## Reproduction and next integration

The patch has only two additive paths beneath `packages/safe-js/src/interp/`.
An actual `git apply --check --verbose` checks both paths against the fresh copy;
neither is skipped. Reconstruction from the artifact is byte-equal to the tested
candidate files. Evidence includes the exact two-file Vitest configuration:
`vitest.byte-storage.config.mts` in each isolated workspace. It selects only
`binary-storage.test.ts` and `float32array.test.ts`, uses one worker, and keeps
cache output local. Re-executing SDK tests requires its own authorization; this
document is not blanket permission for a probe or an SDK switch.

The candidate's `evidence/` directory retains baseline, stub, initial and final
JSON separately, failed compiler/lint logs, final checks, worker reports and
the original source ledger. The replay copy has its own patch-check and test
records. `INTEGRATION-MAP.md` is static architecture analysis, not execution.
`STORAGE-REVIEW-02.md` finds no blocking defect in the final helper and retains
the cross-realm test gap. Its pending-execution note reflects the review's input,
not the later parent-verified results in `FINAL-AUDIT.json`. The intermediate
review text and hashes were restored after a brief update; final review remains
separate. `FINAL-SHA256SUMS` pins source, configuration and evidence artifacts.

Remaining delivery order is ownership and retained accounting with fail-closed
boundaries; SDK-owned ArrayBuffer identity/allocation; Uint8Array object/indexed
operations; DataView methods; explicit host copying and byte-aware digests;
then separately designed snapshot/replay formats. All generic fallbacks must
either understand bytes or reject them before erasing data. Wrapper identity
and a common backing graph, including Float32 interoperability if admitted,
cannot be replaced by independent per-brand copy maps.

The ordinary SDK run path creates replay/snapshot data even when no dump is
requested. A proposed non-replay realm surface therefore needs deliberate
integration, not merely constructor registration. No guest constructor,
SandboxValue admission, interpreter hook, marshalling rule, persistence record
or page capability is installed by this patch. Actual passkey success, device
acceptance and every previously denied gate remain open in `TASKS.md`.
