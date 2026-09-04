# Live page response-byte accounting

September 4, 2026 native continuation of `FETCH-RESPONSE-BUDGETS.md`. Concurrent
and rejected native streams now debit their document-owned fetch budget while
bytes are observed, rather than relying only on completed response bodies. This
is a resource-policy change, not complete Fetch/XHR or a total-allocation proof.

## Accounting policy

Each `PageFetch` owns a portable `ResponseByteAccounting` ledger. Its existing
`maxTotalBytes` limit applies independently to observed encoded traffic and to
observed decoded traffic plus completed-only fallback bytes. Encoded and decoded
counts are never added together. A compressed response can therefore exhaust the
page budget even when its completed body would not have done so previously.

Each dispatched request, preflight or manually followed redirect hop gets a
one-shot opaque lease through the internal `NetworkRequest.responseAccounting`
field. The actual session fetch port preserves its identity. The built-in native
transport claims it once and debits encoded chunks before decoder forwarding and
decoded chunks before retained-body copies. Validated route callback bodies debit
decoded bytes only; no wire byte count is invented. Existing per-request and
session ceilings still apply, and their rejection precedence is retained.

The entire crossing chunk remains recorded, including on failure. Later chunks
already observed are not refunded. A completed, fully metered response is not
double-charged or retroactively rejected merely because another operation crosses
the budget before its provider result settles. Exact-fit final responses remain
allowed; further dispatch is refused after exhaustion, even for potentially empty
responses. Reading or cloning a response never refunds traffic.

Providers that do not claim the lease receive completed-body fallback accounting.
Successful results charge only the positive difference between returned body size
and bytes already observed by that lease. Unknown rejected-provider traffic stays
unknown and increments `unmeteredFailures`; no global metric delta or error-object
receipt is used to guess attribution. Existing response, URL, redirect, CORS and
header checks are not bypassed. A rejected fallback allowance prevents publication
and retention after the existing response inspection.

## Ownership and drain

The ledger uses private scalar state and a module-private WeakMap, with frozen
opaque handles. It retains no document, response body, headers or callback. Forged,
copied, proxied, reused and foreign-owner handles are rejected without invoking
caller getters or coercion. Numeric inputs are safe nonnegative integers; counters
saturate and fail closed on overflow rather than performing unsafe quota sums.

`maxPending` also bounds outstanding native accounting leases. Logical fetch
cancellation does not prove that a stream pipeline has stopped. The transport
releases its lease only after both request finalization and all tracked native
consumers settle. A delayed stream destroy can therefore leave `active: 0` while
accounting reports `outstanding: 1, draining: 1`; admission remains bounded until
the consumer actually finishes. Capacity rejection has the distinct message
`Response accounting operation limit exceeded`.

Page shutdown closes the ledger before aborting its genuine native controllers.
Late bytes are still recorded and refused. Abandoning an unclaimed lease revokes
late native admission without pretending that an arbitrary provider has stopped;
a late completed body still receives fallback accounting. Outcome callbacks keep
only the accounting state and lease, not an extra page/document closure. The page
does not release native writer ownership on provider settlement or cancellation.

## Metrics

`PageFetch.metrics().responseAccounting` adds an immutable scalar snapshot:

| Field | Meaning |
| --- | --- |
| `observedEncodedBytes` | Native bytes observed before decoder forwarding |
| `observedDecodedBytes` | Native decoded/validated route bytes observed before body retention |
| `completedOnlyBytes` | Positive returned-body deficit not already natively observed |
| `nativeRequests` | Successfully claimed one-shot native leases |
| `completedOnlyRequests` | Completed unclaimed results or positive native deficits |
| `unmeteredFailures` | Unclaimed failed/abandoned outcomes with unknown traffic |
| `outstanding` / `draining` | Retained lease capacity / claimed abandoned-or-settled writers awaiting finish |
| `closed` / `overflowed` | Owner revocation / saturated-counter state |
| `maxTotalBytes` / `maxOutstanding` | This ledger's byte and capacity limits |

The old `totalBytes` metric remains separate: it counts completed provider bodies
that reach the byte-accounting step of existing response inspection, after URL/
redirect checks and before later body/header/CORS rejection. It does not become a
received-wire counter. Retained bodies, completed bodies, observed traffic and
reservations must not be conflated. `unmeteredFailures` remains a historical marker
even if a formerly abandoned unclaimed provider later returns a countable body.

## Native regressions and evidence

Four new explicitly registered files add 122 cases: 77 portable ledger cases,
28 custom-provider fallback cases, twelve live-accounting cases using in-memory
native stream fixtures, and five guarded route callback cases. Existing native
response-budget assertions additionally distinguish completed and observed bytes.

The stream fixtures cover concurrent completion, repeated partial failure, encoded
crossing, gzip expansion, close after partial receipt, exact-fit/no-double-charge,
separate page owners, lease identity through the actual browser session port,
forged/reused handles, and late accessor/signal-registration revocation. A real
PassThrough with a controlled destroy callback verifies prompt timeout separately
from eventual native drain and capacity release; it is not a socket fixture.

The preserved five-case before report is
`node_modules/.cache/native-validation/parallel-fetch-accounting-9e5578a/REPORT.md`
and its `REPRO.md`. Those measurements remain unchanged. The current tests check
the repaired boundaries rather than relabeling the old report as a new run.

Parent integration evidence is under `node_modules/.cache/native-validation/`
with prefix `fetch-accounting-integration-`. The isolated archive is
`fetch-accounting-integrated.QebusW`, based on `94f4c58`. The focused 17-file suite
passes 561 cases in each tree, with passing project type checks, explicit
`--outDir dist` builds, strict checks for five changed test files and Biome checks
for nine source/test files. Final diagnostic-message reruns use the separate
`fetch-accounting-integration-final-` prefix; earlier logs are retained.

The first combined run had two incorrect expected error codes in new revocation
tests: an abandoned one-shot lease is `invalid-input`, not `closed`. The assertions
were corrected without weakening no-dispatch and cleanup checks. Actual page close
still rejects through its abort race. Initial import-formatting findings were also
fixed; those logs are retained rather than overwritten.

The five new callback-only route cases received separate explicit authorization
after one approval-review timeout and one retry. HTTP, HTTPS, DNS and server
entrypoints are guarded to throw. That approval and the named focused suite do not
authorize the previously denied full manifest or `src/node-route-transport.test.ts`.
Neither was executed or retried; no broad filtered substitute was run. Both
manifests contain the same 361 entries, with 22 preexisting uncommitted files absent
from the isolated archive. Prior full-suite counts remain historical.

The independent `fetch-accounting-lifecycle-review/REPORT.md` finds no new defect
within the byte-producing consumer contract. Two separately approved in-memory
diagnostics distinguish unsupported-encoding/HEAD raw response destruction from
an unfinished metered pipeline. The initial stronger raw-teardown hypothesis and
fixture failures remain recorded; the final two boundary cases pass. They remain
snapshot-only diagnostics, not additions to the 122 integrated cases or evidence
of exhaustive review. No formatter/types/build pass is claimed for that lane.

## Remaining boundaries

- This records observed bytes; it does not reserve all future allocations or bound
  upstream chunk creation, decoder working memory, intermediate decompression,
  custom route/provider allocations or total RSS. Concurrent crossing chunks can
  make observed counts exceed the configured limit before producers stop.
- Drain capacity tracks byte-producing consumer tasks, not all raw HTTP/socket
  teardown. Early unsupported-encoding, HEAD/bodyless and header-rejection paths
  can destroy a response without creating a metered pipeline; delayed raw destroy
  alone does not keep the accounting lease outstanding. Transport-wide resource
  teardown acceptance remains a separate gate.
- A provider that ignores the lease has completed-only coverage and unknown failed
  traffic. Prompt cancellation cannot force it to stop. Claimed native ownership
  must be finished by the actual producer, not fabricated by a wrapper. A custom
  provider that returns a body before continuing to produce native bytes can be
  conservatively double-accounted; the built-in transport does not return that way.
- The capability is internal, process/module-local and not serializable. Static
  inspection of `node-session-child.ts` places the session transport, page fetch
  owner and bindings together in the child; the lease does not travel through CLI
  IPC or become a guest object. This is static integration evidence, not a new
  process/SafeJS probe. Custom IPC adapters cannot forward a cloned empty handle
  as a valid native lease.
- No new dependency, SafeJS/runtime probe, live website, real socket, TTY/PTY or
  service-process validation is included. Full-suite authorization, standard XHR,
  guest streams/signals, browser conformance and the original playground/interface
  acceptance gates remain open in `TASKS.md` and `COMPATIBILITY.md`.
