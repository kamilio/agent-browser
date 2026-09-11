# Bounded shared session request scheduling

September 11, 2026: concurrent native stylesheet and image work can exhaust a
transport's active-request cap even though each resource loader is independently
bounded. `PYTHON-DOCS-NATIVE-FLOW.md` records this admission boundary with the
unchanged transport cap of one; that original failed live run remains unchanged.

## Behavior and scope

`NetworkTransport` can advertise readonly `limits.maxConcurrent`. The existing
native `NodeNetworkTransport` already exposes this property. A `BrowserSession`
using an advertised capacity schedules its network dispatch through one FIFO
permit queue rather than issuing competing requests past that cap.

- Respect the advertised capacity, from one through128 active dispatches. Keep
  parallelism when capacity is greater than one; do not silently serialize all
  native browsing or raise the transport's limit.
- Retain at most128 pending admissions. Additional work gets an explicit
  resource-limit error. Existing request/body/byte/origin/DNS/TLS budgets and
  transport-level immediate concurrency rejection remain unchanged.
- Remove canceled pending work without calling the transport. Recheck cancellation
  and session closure after a slot is granted, before dispatch.
- Release each slot once, only after underlying dispatch settles, including
  failures. An outer navigation timeout does not prematurely free a still-active
  transport slot. There is no automatic retry.
- Session closure rejects queued work and preserves normal active-request/document
  cancellation. Abort listeners are removed on cancellation, admission and close.
- Bootstrap stylesheet/script work has a lifetime linked to navigation and the
  candidate document. Finishing bootstrap, successfully or unsuccessfully, cancels
  its unawaited queued work without changing ongoing document image/fetch lifetimes.
- `session.metrics().requestQueue` exposes active/pending counts, capacity and
  closure when scheduling is enabled. The queue creates no timers; existing
  navigation/resource lifetimes still cover waiting work.

Adapters without advertised limits retain their previous direct-dispatch behavior.
A capture/proxy adapter must forward its actual underlying `limits` to participate;
the original Python probe wrapper did not. An adapter's advertised limit is a
trusted adapter contract, not a page-controlled setting. Independently initiated
requests outside this session are not coordinated by its queue. Invalid advertised
capacities fail construction and close the newly created transport.

## Native regression evidence

Development lane:
`node_modules/.cache/native-validation/native-session-request-queue-work-september11/`.

- Immutable clean baseline with nine new integration cases: **76 pass,9 fail**,
  at15:19:09.452–15:19:11.117 UTC.
  Failures reproduce resource admission at capacity one/two, lost following work
  after failure/cancellation, and invalid capacity acceptance.
- Separate fixed snapshot: **90 pass,0 fail**, including five additional bounded
  queue lifecycle tests. Execution: **15:22:01.885–15:22:03.684 UTC**.
- Cases cover exact FIFO transport order, preserved parallel capacity, failure
  release without retries, canceled images, pending-limit exhaustion, listener
  cleanup, idempotent release/close, pre-aborted requests and session shutdown with
  active/queued resources. All requests use guarded in-memory native fixtures.
- Source review then identified stale bootstrap requests remaining queued after a
  loader failed. Four additional fixtures cover both stylesheet/script resources
  and failed/successful loader completion: `fixed02` reproduces **90 pass,4 fail**
  at15:28:53.939–15:28:55.620 UTC. `fixed03` passes **94/0** at
  15:29:27.761–15:29:29.628 UTC after explicit bootstrap lifetime cancellation.
  The uncooperative active fixture keeps its slot until actual settlement; the
  stale queued request never dispatches, and subsequent navigation recovers.

Clean broad gate:
`node_modules/.cache/native-validation/native-session-request-queue-september11-round01/`.
Tracked `47e68e6` plus only four owned source/test files; concurrent outside-marker
changes and unrelated dirty work are excluded. Build, strict, format and native
commands all pass at **15:23:02.703–15:24:49.895 UTC**: **8335 native passes,zero
failures,one existing exclusion**,137 selected files and136 strict roots. All1018
source/input files remain stable; the build contains1816 compiled files. Parent
rechecks all source hashes and byte-compares the four owned files to this snapshot.

That first broad gate predates the reproduced bootstrap-lifetime issue. It is not
the release gate for the final implementation. The corrected clean gate is
`node_modules/.cache/native-validation/native-session-request-queue-september11-round02/`:
**8339 pass,zero failures,one existing exclusion**,137 files/136 strict roots,
at **15:30:06.736–15:31:53.742 UTC**. Build, strict, format and native commands all
exit zero. Clean tracked`a60ee4a` plus the four owned files retains1018 source/input
and1816 compiled files; parent rechecks hashes and exact source bytes. The follow-up
source review closes the P2 finding without substituting for this runtime gate.
The proposed Python live follow-up was
paused before launch when review found the issue; no live run used the8335 build.

The existing focus-pressure exclusion and snapshot.test strict-only omission are
unchanged. No live website, socket/TTY, SafeJS, credential or device probe is part
of this gate. A fresh native Python-documentation flow must separately verify the
effect with its original concurrency cap and a capacity-forwarding capture
adapter; neither this gate nor the original failed run proves that site works.
