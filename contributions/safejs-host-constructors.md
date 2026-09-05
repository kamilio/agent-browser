# SafeJS host constructors

September 5, 2026. **Isolated upstream contribution candidate, not the selected
SDK or deployed browser functionality.** `safejs-host-constructors.patch` adds
an explicit public construct-only capability to the preserved SafeJS source.
This is a prerequisite for browser-owned AbortController and MutationObserver
constructors, not an implementation of those APIs or their consumers.

Candidate and pristine patch replay each pass **234 tests in eight named SDK
files**, including 103 new cases. Both scoped builds and strict checks pass.
The separate built-runtime probe was **denied authorization and not executed**.
Source-suite success does not satisfy that gate or any browser/live-site gate.

## Reproduction base

The preserved original is `@poe-code/safe-js` version **0.0.1**, located under
`/tmp/agent-browser-safejs-13.0.10/packages/safe-js`. The directory name is not
the package version or evidence of the latest upstream release.

- Original manifest SHA-256:
  `676f77f02e8a185c15f97142378549afede9dfc15d45fc98edbf8fb056aae233`.
- Patch SHA-256:
  `8f10b4c00adda89272c5f250343dcaffbad3dd9f07748e2baab10d3749046e76`.
- Apply at a tree root containing `packages/safe-js`, against the pristine
  original source. Thirteen paths change; source file count grows 395 to 398.
- This is **not** stacked on the earlier binary-storage/guest-byte patches.
  Combining those contributions needs explicit reconciliation and validation;
  no combined constructor/passkey runtime is claimed.
- Forward and reverse patch checks validate all paths. Replay edits use
  `apply_patch`; neither the original SDK nor the older frozen candidates change.

## Public contract

`createHostConstructor(name, construct)` is exported from `./core` and the root
source entry point. The exercised runtime source surface is `./core`; the broad
root entry point has unavailable optional workspace dependencies in this isolated
environment, so its runtime import is not claimed as validated.

- Names must be strings of 1–1024 code units, with no object coercion.
- Factories must be synchronous, non-proxy, non-async/non-generator host
  functions. The returned token is frozen and host-noncallable.
- Genuine guest `new` invokes the factory through the ordinary budgeted host
  bridge. Calling the token without `new`, including call/apply/bound-call routes,
  rejects without invoking the factory. Ordinary host functions remain
  nonconstructible; copied properties and lookalike records confer no authority.
- Results must synchronously be explicitly registered live host objects. Plain
  records, primitives, thenables, promises and proxy-wrapped capabilities reject.
- Guest arguments use existing bounded copying and callback conversion. Explicit
  `retainGuestArguments` remains available on the constructor token; failure
  releases newly captured references, and owner close clears retained references.
- Within one realm, bindings, getters and host results share the same constructor
  wrapper. Host-object results keep their existing identity and receiver checks.
  Deliberately injecting one trusted host token into two realms creates distinct
  wrappers; the native token itself is not restricted to a single realm.
- Bound construction and extracted function-method adapters preserve ephemeral
  marking and owner identity. Registered `startCallback` execution restores the
  owner context and can construct after an asynchronous guest continuation.

Factories are **trusted host code**, not preemptible guest code. Existing SDK
step/data/argument budgets do not limit arbitrary work inside a factory or undo
its external side effects. Browser owners must supply bounded allocation,
registration rollback and disposal when integrating specific APIs.

Invalid native Promise results receive best-effort rejection draining through
captured `Promise.prototype.then`. This bypasses an overridden `then`, but can
invoke host constructor/species hooks. Drain exceptions do not replace the
deterministic invalid-result TypeError. Exotic Promise rejection suppression is
not guaranteed; this is not an asynchronous constructor API.

## Ownership and persistence

Constructor execution requires its **live owning realm's active cancellation
context**. The check precedes the sandbox-call shortcut; factory-entry liveness
checks remain in place. Bound wrappers and extracted call/apply/bind adapters
inherit that identity. There is no automatic switch to a constructor's owner.

Direct, bound and marked adapter capabilities reject public copying, including
copy-from with a supplied closure wrapper, snapshot serialization and replay
encoding. Both replay callable-resolution forms reject them before reconstruction.
Journal-backed `run`, including resumed runs, rejects constructor binding admission
before factory effects. Realm closure clears the constructor wrapper cache.

These guarantees are deliberately narrower than arbitrary graph isolation:
existing opaque closures, shared collection shortcuts and future Promise outcomes
can remain indirect carriers. Some cross-realm captured-closure attempts are
already rejected by the SDK's compile-owner reentry guard; other tested foreign
paths reach the new ownership rejection. Already-authorized owner continuations
may still be triggered by another actor. This contribution does not establish
that all such graphs are export-safe or prevent every foreign-triggered owner
continuation. Use registered owner callbacks rather than raw internal values as
an inter-realm transport. No new snapshot tag or replay/re-issue semantics exist.

No full WebIDL conversion, prototype chain, subclassing, alternate newTarget,
instanceof contract, constructor/prototype round-trip, or browser event/microtask
semantics is supplied by this factory.

## Validation and retained failures

Artifacts are under `node_modules/.cache/native-validation/safejs-host-constructors/`.
Candidate and replay trees are the sibling `safejs-host-constructors-candidate`
and `safejs-host-constructors-replay` directories. Each SDK run had fresh exact
authorization; these are not native-manifest executions.

| Record under `evidence/` | Outcome |
| --- | --- |
| `sdk-constructors-01-tests.json` | Initial five-file checkpoint: 110 pass |
| `sdk-constructors-02-tests.json` | 207 pass / 26 fixture failures |
| `sdk-constructors-03-tests.json` | 233 pass / one spy/proxy fixture failure |
| `sdk-constructors-04-tests.json` | Final candidate: 234 pass / zero fail or skip |
| `replay-constructors-01-tests.json` | Pristine replay: 234 pass / zero fail or skip |
| `strict-04.log`, `replay-strict-01.log` | Scoped strict checks pass |
| `runtime-build-04.log`, `replay-build-01.log` | Scoped core builds pass |
| `format-imports-03.log` | Three new files pass format/import checks |
| `implementation-biome-03.log` | Implementation and positive suite pass Biome |

The eight files are `host-constructor`, `host-constructor-boundaries`,
`host-object`, `realm`, `callback`, `interp/host-bridge`, `snapshot/serialize`
and `snapshot/replay-data`, all `.test.ts` beneath `packages/safe-js/src`.

Twenty-three initial failures assumed expression completion rather than explicit
returns; three expected catchable TypeError where the existing SDK fails with
fatal compile-owner reentry. The last failed fixture used `vi.fn` around a proxy
result: its Promise instrumentation invoked a proxy trap before SDK validation.
A plain counted callback tests that boundary without altering the result. These
fixtures were corrected without changing interpreter completion/reentry behavior.
All historical results remain separate.

The first strict check also exposed two fixture type errors and the unavailable
root-entry dependencies. Tests now use the intended core-only surface. Earlier
formatter invocations and diagnostics remain recorded. The adversarial thenable
fixture intentionally defines `then` and triggers Biome's `noThenProperty` rule;
only formatting/import checks are claimed for that boundary test file.

`ACTUAL-PROBE-DENIED.md` preserves the exact rejected built-runtime command.
It was not retried against the candidate, replay or another wrapper. Fresh explicit
user approval is required before that gate can be reopened. Existing denied
identity, wire, parent-RP and full/near-full native gates are also unchanged.

## Native research followup

A separate worker followed the ordinary Part 2 Memory link from the saved BFCL V4
article using only this repository's native reader with body capture. One fresh
authorized request returned HTTP 200; 50,096 decoded bytes verified with SHA-256
`2b76051d65445eca484cc21a33c59058732e20cf4d281e29904166c3dac8d938`.
Retrieval was September 5, 2026, 11:14:39.676Z–11:14:40.066Z; the article labels
its release/update July 17, 2025. Partial extraction is not rendered-page or
benchmark execution evidence, and no latest-version claim is made.

`research/benchmarks/REPORT.md` separates the authors' key-value/vector/summary
memory protocol and reported deletion/retrieval/compression weaknesses from our
inferences. It does not import Part 1's exact-match rules into Part 2, reproduce
scores, validate current rankings, or treat memory scores as browser acceptance.
No Reddit denial, stopped X lane or Cloudflare challenge was revisited.

## Remaining browser work

Resolve the built-runtime probe authorization and upstream/default SDK integration;
reconcile with the separate guest-byte contribution; then add public adapter
feature detection, browser-owned constructor instances and lifecycle budgets.
AbortSignal branding/reasons/events, fetch and listener consumers, observer
notification microtasks, and actual guest/browser validation remain separate work.
Password/device/passkey/live-application acceptance gates and the overall browser
goal remain open in `TASKS.md`.
