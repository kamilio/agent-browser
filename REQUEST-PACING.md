# Native per-origin request pacing

The native Node transport can pace admission to outgoing exchanges to reduce bursts
when testing websites. This is an explicit opt-in, not a CAPTCHA solver or an
identity/fingerprint change. It does not override login, access restrictions,
network policy or a website's decision to refuse traffic.

```ts
const transport = new NodeNetworkTransport({
  minRequestIntervalMs: 250,
  allowedOrigins: ["https://example.com"],
});
```

Pass this transport through the browser's existing createTransport hook. The
research helper also exposes `--min-request-interval-ms`, with additional batch
navigation-start pacing described in RESEARCH-WORKFLOW.md. General browser
defaults remain unchanged. The transport option accepts integer milliseconds
from 0 through 60,000; undefined and zero disable pacing and preserve the existing
request path. Invalid values reject.

## Scheduling behavior

- Each transport has independent queues keyed by normalized URL origin.
- The first eligible exchange is immediate. Further queued exchanges for that
  origin receive FIFO grants separated by the configured interval. FIFO begins
  after address resolution, not at the public request-call boundary. Other origins
  do not share that queue. Redirected real exchanges use their target origin.
- Spacing is measured from actual grants using a monotonic clock. A delayed timer
  does not release a backlog of accumulated grants in a single catch-up burst.
- Waiting counts against the existing whole-request deadline and active-request
  cap. Abort and close remove pending work; timed-out work must not begin an
  exchange. Large intervals can therefore cause requests to time out.
- DNS/address policy checks precede pacing, and the existing TLS checks remain.
  Jar cookies are refreshed after waiting so a cookie that expired during the
  wait is not copied from the earlier hop preparation into the outgoing request.
- Fully routed responses bypass pacing because no real exchange is started.
  Existing attempted-request and byte accounting remains unchanged.

The scheduler retains at most 256 origins and 128 pending grants. Expired idle
origin entries can be reclaimed; unexpired cooldowns are not evicted to admit
new origins. Capacity exhaustion reports resource-limit rather than silently
removing spacing. Closing the transport clears pacing timers and retained state.

## Limits

Pacing local admission grants cannot guarantee exact exchange-call timestamps:
promise continuations and synchronous cookie preparation follow a grant. It also
cannot guarantee spacing of arrivals observed by a remote server: DNS, TLS,
network delays and server processing still vary.
It does not coordinate separate transports, processes or agents, queue beyond
the existing concurrency cap, retry failed requests, interpret Retry-After,
cache responses, obey a newly added robots policy or automate human challenges.
Existing challenge detection and human-handoff behavior remain unchanged.

Deliberate spacing adds latency. No throughput, end-to-end speedup, reduced block
rate or real-site compatibility improvement is claimed without measurement.

## Validation status

On September 11, 2026, the isolated production build, strict two-test-root
TypeScript check and unrestricted four-file lint pass at 03:17 UTC. The two
explicitly selected native files pass all 59 tests at 03:18 UTC: 24 scheduler
cases and 35 transport cases, with no failed, skipped or todo cases. The runner
verifies all 4408 native inputs unchanged before and after execution. Validated
source is integrated into the working tree without unrelated dirty changes.

Coverage includes bounded FIFO queues, independent origins, delayed timers,
abort/close/deadlines, redirects, routed responses and cookie expiry/replacement.
An additional activity check after synchronous cookie refresh prevents exchange
when a cookie clock aborts, closes or reaches the request deadline. All three
regressions pass. Tests use fake clocks, injected DNS, mocked exchanges and a
network guard; no real sockets, websites, secrets or page runtime are exercised.

Evidence is in `node_modules/.cache/native-validation/native-origin-request-pacing-round03/`.
The original lint failure, round02 launcher preflight failure and earlier denied
request remain historical evidence in their original lanes. No performance
measurement, live compatibility or reduced-block/CAPTCHA result is claimed.
