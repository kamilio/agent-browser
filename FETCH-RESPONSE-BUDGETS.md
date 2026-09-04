# Page and native response budgets

September 4, 2026 native continuation. This narrows existing fetch/transport
resource boundaries; it does not implement XHR, guest streams or new globals.

## Admission and receiving

`PageFetch` rejects a new logical operation once its cumulative completed-response
byte allowance is exhausted. It checks again at queued dispatch, including
preflights and manually followed redirect hops. An exact-fit last response is
allowed; a later request is refused even if it might return an empty body. Reading
or cloning a retained response does not refund cumulative traffic. Existing
responses remain readable after exhaustion, subject to their usual ownership.

At dispatch the page passes the smaller of its per-response allowance and current
remaining cumulative allowance as `NetworkRequest.maxResponseBytes`. This is a
trusted transport option, not a newly accepted guest fetch-init property. The
existing session port forwards it without bypassing document ownership, CORS,
credentials, CSP, redirects, cancellation or the session's own resource limits.

The built-in Node transport snapshots and validates the optional ceiling before
admission. It accepts nonnegative safe integers, including zero; absence preserves
the prior session ceiling. A caller cannot raise that ceiling. Encoded crossing
chunks are rejected before forwarding to decoders, and decoded crossing chunks
before copying into the retained body list. Route responses are validated and
charged before the same narrowing check and owned body copy. Existing HEAD,
wire-bodyless, redirect, compression and header policies remain in force.

Input normalization can invoke caller-owned accessors. The transport now rechecks
closure before allocating an active operation, snapshots the request body once,
and checks owner closure at shared active-operation boundaries. Genuine signal
listener registration that closes the owner cannot dispatch work in the gap
before controller registration. Existing aborted-signal precedence is preserved;
timers, listeners and active slots are cleaned up on rejection.

## Explicit limits

- The page cumulative counter still charges complete responses returned by its
  provider. Partial native streams that reject are charged to session transport
  counters, not to the page's completed-response counter.
- Concurrent requests do not reserve the same page allowance atomically. Already
  dispatched work can collectively exceed the page remainder before completion;
  final page checks remain necessary. This is not a strict page-wide allocation
  bound or complete failed-stream accounting.
- Custom providers may ignore the optional field. Final page body checks still
  reject oversized returned bodies and block further admission after exhaustion,
  but cannot prevent that provider's earlier allocation.
- The ceiling does not bound decoder working memory, upstream chunk allocation,
  route-provider allocations, total RSS or every intermediate compression stage.
  Crossing chunks remain charged; accounting is not refunded on failure.
- No Content-Length shortcut substitutes for received-byte checks. No session
  quota was increased and no CORS/ownership policy was relaxed.

## Regressions and evidence

Three explicit native test files add 109 cases: 21 page-admission cases, 76
transport/consumer cases and 12 signal-admission cases. The existing 80-case
`src/network.test.ts` is also explicitly registered; it contains native policy and
decoding checks, not the separate real-socket transport suite.

The eight parent consumer cases exercise actual native transport streams, the
committed session fetch port, different owners, remaining allowance, redirects,
CORS preflight and a provider ignoring the optional ceiling. All eight fail on
the corrected pre-wiring fixture and pass after wiring. The first baseline used
an incomplete fixture without the required cookie jar/document loader; its log
is retained separately and is not the corrected defect reproduction.

The backend review additionally reproduced twelve close-during-accessor cases
before the v2 fix. Six genuine signal registration/closure cases still failed on
v2 and pass with the shared owner check. Native fixtures forbid unmatched HTTP,
HTTPS, DNS resolver construction and server creation. No actual socket is used.

Parent evidence lives in `node_modules/.cache/native-validation/` under
`fetch-response-budget-integration-*`; the isolated archive is
`fetch-response-budget-integrated.pdd3ov`, based on `25a3e03`. Both focused suites
pass 408 tests across twelve files. Both project type checks and explicit
`--outDir dist` builds pass. The added tests and the updated private-method fixture
signatures in `src/node-route-transport.test.ts` receive strict static checking;
that route fixture is not executed in this continuation after the denial below.

The attempted full-manifest run was denied before execution by the approval
reviewer, which flagged `src/node-route-transport.test.ts` as socket-related.
Static inspection finds a fake resolver and mocked private wire exchange in that
file; this observation is not permission to override the denial. No full run or
broad filtered substitute was attempted afterward. The same 355-entry manifest
is retained in both trees; 22 preexisting uncommitted test files are absent from
the isolated archive. Earlier full counts remain historical, not validation of
this change. Full-suite acceptance now awaits explicit authorization.

Preserved worker deliveries are `parallel-fetch-budget-admission-ffd9d15`,
`parallel-response-budget-v2-1c20fcc/delivery/`, and its
`signal-admission-followup/`. Original v1/v2 patches, hashes and baseline logs are
not rewritten. A sandbox subprocess EPERM is retained separately and is not a
passing validation run. The first scoped Biome check identified one assignment
expression in a new fixture; it was rewritten without changing the test oracle.

## Runtime boundary

The fresh static XHR investigation is preserved at
`parallel-xhr-feasibility-ffd9d15/REPORT.md` in the same cache. Four existing local
SafeJS artifacts were inspected, not executed or represented as registry-latest
releases. Current nested-source permission exists, but the inspected public
contract still lacks the required trusted construction/live-prototype facilities
for a truthful standard XHR interface. No spoofable factory alias is published.

No new dependency, SafeJS execution, live website, socket, real TTY/PTY or actual
service/process probe is part of this checkpoint. Original browser acceptance
gates, framework compatibility and XHR remain open in `TASKS.md`.
