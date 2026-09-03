# Animation frames and page performance

This is a bounded page-JavaScript compatibility layer, not a new rendering engine
or a claim of desktop-browser event-loop equivalence. It uses existing SafeJS
callback phases and native host timers; it adds no dependency or service.

## Surface

- `requestAnimationFrame(callback)` returns a monotonically increasing page-local
  integer handle. Only functions are accepted; source-string evaluation is absent.
- `cancelAnimationFrame(handle)` removes a queued callback, including a later
  callback in the current batch. It does not interrupt a callback already started.
  Primitive unsigned-long conversion is supported; object, symbol, function and
  bigint conversion is explicitly unsupported. A missing argument throws.
- Global, `window` and `self` expose the same frame functions and `performance`
  object. The performance object provides readonly `timeOrigin`, `now()` and fresh
  `toJSON()` records containing the origin.
- `PageBindingOptions.animationFrameLimits` configures request and callback quotas.
  Agent `capabilities` reports the partial profiles and defaults. Page evaluation
  metrics expose clock reads and frame state without recording epoch timestamps.

## Scheduling contract

An active page needs at most one native frame alarm. There is no repeating timer
while idle. Software frame opportunities use a nominal 1,000 / 60 millisecond
interval, rounded up to a native timer delay; this is not a guaranteed frame rate.

At each opportunity, the scheduler captures one clock timestamp and a snapshot of
queued handles in insertion order. It removes each handle before invocation and
passes the same timestamp and the page Window receiver to every callback in the
batch. Cancellation of a later callback is observed. Registrations made from a
callback cannot enter that snapshot and wait for a subsequent opportunity.

The next callback starts when the current callback's SafeJS synchronous prefix
finishes, not when its potentially async return value settles. Ordinary guest
rejections are recorded by the existing page runtime without discarding later
callbacks. Callback startup or resource failures close the scheduler and invoke
the page failure lifecycle. Slow prefixes do not enqueue a catch-up callback for
every missed interval.

**Evidence boundary:** deterministic native tests exercise held prefixes and
unsettled async results. The actual-core probe uses synchronous guest callbacks,
including an ordinary throw. It does not establish released-SDK async-tail,
nested-callback or general event-loop conformance.

Frame DOM writes use the real document/style/layout implementation. A later
explicit capture paints those changes. Frames do not trigger automatic painting,
capture streaming, animation timelines or visibility-based throttling.

## Clock contract

`PageClock` anchors its origin when the page-runtime owner is constructed, before
lazy runtime initialization. It derives elapsed time from the host monotonic
performance clock, coarsens returned values to nominal 0.1 ms increments, clamps
backwards readings, and rejects nonfinite values. `timeOrigin` derives from the
host epoch-aligned origin plus that initial reading and remains fixed.

This is not exact network navigation-start timing. There is no `Performance`
constructor/prototype hierarchy, EventTarget, replaceable Window attribute,
performance entries, `mark`, `measure`, resource/navigation timing, observers,
cross-context time translation or cross-origin-isolation policy. Coarsening alone
is not a complete timing-side-channel defense. Page close revokes the clock and
the owned performance methods/getter.

## Bounds and lifetime

Default limits per page:

| Limit | Default |
| --- | ---: |
| Queued callbacks | 128 |
| Cumulative registrations | 4,096 |
| Cumulative callback invocations | 1,024 |
| Pending callback results | 128 |

Each limit accepts a positive safe integer up to 16 times its default. Invalid
keys and malformed options fail explicitly. The existing page-wide pending
callback limit applies in addition to the frame-specific limit.

Canceled and completed records release browser-owned callback references. Close
cancels alarms and clears queued, batch and in-flight records. Late completion
handlers cannot restart a closed scheduler. This is not a claim that individual
SafeJS callback registry slots are reclaimed before realm close. Handles are
independent of timeout/interval IDs, with no reuse before the registration quota.

## Verification — September 3, 2026

The explicit safe regression selection passes 2,187 tests across 97 files.
This selection excludes live socket/server/PTY and restricted timer probes.
Build, strict changed-test typechecking, focused lint and formatting pass. The
post-format focused selection passes 125 tests across six files.

`src/page-animation-frames.test.ts` and `src/page-performance.test.ts` cover order,
receiver identity, shared timestamps, cancellation, next-frame registration,
controlled callback phases, rejection isolation, limits, immutable origin,
coarsening, invalid readings, revocation and cleanup. A 512-callback native batch
uses one alarm and releases all completed records. Production binding tests
verify aliases, an origin predating binding initialization, and document close.

`scripts/check-animation-frames.ts` uses in-memory HTML and production
`PageScripts`/`PageBindings` with the explicitly selected existing experimental
SafeJS core. The first report passes 10 assertions; the expanded report passes
11, including readonly origin/JSON isolation and ordinary guest rejection.
All 11 pass again after the final build. Existing actual-core size, computed-style
and client-geometry probes pass 11, 13 and 13 assertions respectively.
Actual guest callbacks update native measured width and captured blue pixels.
The bounded completion wait is 750 ms; no network, sockets, browser service or
public website is involved. The reports distinguish this from released-SDK
acceptance and from the previously restricted timer/scheduler probes.

See `reports/animation-frames-safejs-2026-09-03.json`,
`reports/animation-frames-safejs-final-2026-09-03.json` and
`reports/animation-frames-focused-2026-09-03.json` for recorded checks. The broader
real-site, frontend, full reference-coverage and low-memory Worker gates remain
open. Upstream release closure does not substitute for local artifact acceptance.

## Design references

- WHATWG HTML: animation frames, ordered callback maps and per-opportunity
  callback snapshots — https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames
- W3C High Resolution Time: the performance interface, time origin and monotonic
  clock — https://www.w3.org/TR/hr-time/#the-performance-interface

These guide the implemented subset; they are not a conformance claim.
