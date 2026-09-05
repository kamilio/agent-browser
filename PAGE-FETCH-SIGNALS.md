# Owned fetch cancellation

September 5, 2026. Native `PageFetch` can accept explicitly published signal
capabilities from a document-owned `PageAbortSignals` registry. This is a trusted
host embedding interface and fetch-consumer implementation, **not deployed guest
AbortController/AbortSignal constructors or a complete EventTarget/Streams API**.

## Host interface

Create `PageAbortSignals(document, hostObjectFactory, limits?)`, then call
`publish(nativeSignal)` to obtain its owned capability. Supply that registry as
`PageFetch`'s `signals` option, or `PageBindingOptions.fetchSignals`. The latter
also applies to `PageScriptOptions` and forwards to both page fetch entry points.
The caller owns the registry; closing bindings detaches their consumers without
closing unrelated caller subscriptions. Document closure closes the registry.

Only that registry's capabilities are accepted in `fetch(url, { signal })`.
Raw native signals, lookalikes, proxies and another document's capabilities do
not authorize cancellation. Repeated publication of one native source preserves
capability identity within a registry; separate registries use separate wrappers.
A factory cannot reuse a previously published signal capability across owners,
including after closure. A wrong-document registry is rejected at fetch setup.

Without a registry, non-null `init.signal` remains explicitly unsupported;
null/undefined behavior is unchanged. This does not add page globals or expose
native controllers, vaults, passwords, passkey devices or host processes.

Published capabilities have readonly `aborted` and `reason` getters and
`throwIfAborted`. `resolve(capability)` supplies the trusted native consumer view
and its synchronous, once-only subscription hook. Native reason identity is
preserved by this layer. **Actual guest arbitrary-reason copying, throwing and
Promise rejection identity remain a separate SDK integration requirement.**
Native tests are not evidence for that boundary or for guest DOMException
prototype behavior.

## Native-source admission

This Node-hosted implementation uses built-in AbortSignal following and standard
library proxy detection, with no added package dependency. It captures native
getters, following and event operations when the module loads. Publication
requires native `AbortSignal.any` support; the validation environment uses the
pinned Node 22.22.0 binary.

State-property lookup must resolve to the captured native `aborted` and `reason`
getters. Shadowed state data/accessors and proxy-containing or excessively deep
lookup paths reject without invoking their hooks. The lookup is bounded to 64
prototypes. Native signal brand checks still follow; an inherited native getter
alone is not sufficient. Ordinary overridden instance event methods are ignored.
Callers must not replace trusted native state behavior after registration.

This admission rule is intentional: the initial native test demonstrated that
Node's following operation can observe a shadowing state getter. The registry
does not temporarily mutate the caller's signal, forge a native signal object,
or pretend arbitrary host state overrides are supported. Future browser-owned
controllers must keep their underlying native signals private and unmodified.

A private native follower receives abortion, so fabricated public abort events
on the source do not cancel consumers, and source event listeners cannot suppress
cancellation with `stopImmediatePropagation()`. No public source listener is
installed by the registry. Consumer hooks are trusted synchronous host callbacks;
thrown exceptions are swallowed so other subscribers can be cleaned up. An
asynchronous callback-return protocol is not provided.

## Fetch and buffered bodies

- A pre-aborted valid capability rejects before request/quota admission and does
  not call the transport. Cancellation after admission reaches the internal
  request controller, including preflight/redirect work and transports that do
  not cooperate. The latter can still settle later, with existing accounting.
- Fetch fulfillment does not end cancellation ownership when non-null bodies
  remain unread. Such buffered bodies are treated as logically readable until
  consumed or errored. Abort errors every remaining unread clone with the same
  native reason, releases retained body bytes and keeps response metadata readable.
- Reading an errored body rejects and disturbs that body. Subsequent reads and
  cloning a disturbed body fail as already consumed. An unread errored body can
  be cloned; that clone preserves the error and still uses the response quota.
- Null bodies remain null: text reads repeatedly produce empty text without
  setting `bodyUsed`, while JSON conversion of empty text can still fail. An
  empty but non-null body is distinct and can be errored before consumption.
- The final unread clone owns the subscription. Consumption, error, failed
  publication, timeout and owner closure detach it when no pending request/body
  needs it. Publication-time abortion rejects before returning a response.
- Closing only the signal registry stops its consumers with a closed error and
  revokes signal operations, without aborting the caller's native controller.
  Closing the fetch owner also revokes its response capabilities.

This is buffered-body cancellation, not network streaming, readable-stream locks,
tee scheduling, backpressure, request-body streams, or complete Fetch conformance.
Response error reasons can refer to caller-owned values; byte counters measure
retained response bytes, not arbitrary host reason graphs or JavaScript heap size.

## Resource ownership

Defaults are 256 retained signals and 1024 active subscriptions per registry;
positive safe-integer overrides can only lower these values. Publication attempts
also have a fixed cumulative ceiling of 1024, including failed host publication.
Duplicate publication does not allocate another wrapper. Limits use plain own-data
records; accessors, unknown fields and proxies reject.

Factory failures, aliasing, recursive publication and close during publication do
not leave an accepted half-published capability. Closure revokes saved operations,
removes follower listeners/subscriptions and releases owned native references.
Trusted factories still require bounded work; this API cannot preempt arbitrary
host code or undo unrelated side effects inside a factory.

Existing fetch request/pending/redirect/body/retention quotas and response-byte
accounting remain authoritative. Abandoning a claimed in-flight accounting lease
does not release it until its writer finishes. Late returned bytes that exceed
the writer's observed debit remain charged as a completed-byte deficit.

## Evidence status

The final clean nine-file matrix passes **232 tests**, including 80 new cases,
with zero failures or skips. Isolated build and strict new-test type checks pass;
the two implementation and two new test files pass Biome. Evidence is under
`node_modules/.cache/native-validation/page-fetch-signals/`:

| Artifact under `evidence/` | Result |
| --- | --- |
| `isolated-signals-02-tests.json` | 232 pass / zero fail or skip |
| `isolated-build-02.log` | Clean project build passes |
| `strict-tests-02.log` | Both new suites pass strict type checking |
| `biome-02.log` | Four focused files pass formatting/import/lint checks |

The named suites are `page-abort-signals`, `page-fetch-signals`, `page-fetch`,
`page-fetch-ownership`, `page-fetch-preflight-cache`, `page-fetch-budget-admission`,
`page-fetch-live-accounting`, `page-fetch-accounting-fallback` and
`page-fetch-journal`, all `.test.ts` in `src` and explicitly in `native-tests.json`.
This is not a full-manifest or unrelated binding-fixture pass.

The initial clean
nine-file matrix (`evidence/isolated-signals-01-tests.json`) has 219 passes and two
failures, with no skips. One exposed the source state-shadowing issue above; the
other fixture incorrectly expected zero completed-byte deficit after debiting
two bytes but returning four. The failed record and its seven changed source
inputs remain preserved separately in `page-fetch-signals-checkpoint-01`, against
base commit `4e45c6a`. No unrelated accounting behavior was changed to fit a test.

No SafeJS, real socket, live form, passkey-device or TTY/PTY probe is part of this
matrix. In particular, the denied built-runtime constructor probe remains denied;
this native consumer work is not an alternative execution of that probe.

## Primary-source research

One freshly authorized native-browser request to the Fetch standard returned HTTP
200 and captured 1,929,966 decoded bytes. Native loading then failed with a loader
resource limit, and the runner exited 1. No limit was increased or request retried.
There is **no successful native section extraction** from that run.

`research/fetch/findings.md` retains the acquisition failure. A separately labeled
local raw-source appendix examines bounded windows in the already captured bytes,
with section IDs, exact byte offsets and hashes, without a loader, HTML parser or
new request. It separates source ordering from native implementation choices:
abort can error a still-readable response body after the fetch promise fulfills;
consume-body tests unusable before its null-body conversion branch; clone tests
unusable before delegated cloning. Delegated Streams semantics are not proven.

Capture SHA-256:
`f72f58d3320c54413fcc95da4e125f07b4141663c6ff7077733909216ad1905b`.
Native acquisition was September 5, 2026, 11:41:06.804Z–11:41:07.035Z.
The original failure report remains unchanged; the appendix is static analysis,
not a rewritten browser success or live conformance result.

## Remaining integration

Guest constructors/static AbortSignal methods, abort EventTarget behavior, listener
consumers, arbitrary guest reason identity and actual runtime validation remain
open. The separate SafeJS constructor and guest-byte contributions are not
implicitly selected or combined here. Existing denied identity/wire/parent-RP/
constructor and full-native gates remain closed. The complete browser goal and
outstanding acceptance requirements remain in `TASKS.md`.
