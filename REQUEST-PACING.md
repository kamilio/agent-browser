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
- Synchronous exchange startup runs inside its grant. The next cooldown starts
  after that invocation returns, using a monotonic clock, so cookie preparation
  and request construction cannot consume the following request's spacing.
  The scheduler does not wait for the response promise to settle. A delayed timer
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

### Server-directed cooldowns

When pacing is enabled, validated headers from real HTTP 429 or 503 responses
also establish an origin cooldown from accepted `Retry-After` advice. The existing
bounded parser accepts delay seconds or supported HTTP dates, at most 86,400
seconds. Invalid, ambiguous, oversized and unsupported values are ignored.
Other response statuses, including redirects, do not establish this cooldown.
This is rate/service backoff handling, not complete `Retry-After` semantics.

The cooldown is recorded at header arrival, before the response body completes.
It delays exchanges that have not started; it cannot recall in-flight requests.
The original response is not retried. A zero, stale or shorter delay cannot
shorten the configured interval or a longer existing cooldown. Accepted wall-clock
advice becomes a monotonic deadline; later clock changes do not move it.

Queued work remains FIFO and subject to existing abort, close, concurrency and
whole-request deadlines. A long server delay can cause a waiting request to time
out without starting its exchange. The cooldown remains if body reading later
fails. Other origins are independent. Fully routed responses and cache hits do not
establish server cooldowns; disabled pacing retains its previous behavior.

Origin/pending capacities are unchanged. If a late response needs a reclaimed
origin slot and all slots are occupied by unexpired state, recording the cooldown
fails with resource-limit rather than evicting another origin or silently sending
premature traffic. This can fail response handling before body completion.

### Remaining limits

Pacing separates synchronous native exchange startup invocations; it does not
guarantee exact packet transmission or arrival spacing observed by a remote
server. Runtime scheduling, DNS, TLS, network delays and server processing still
vary. Slow synchronous startup can increase the interval, and asynchronous
responses may overlap. The earlier grant-only limitation and the September 12
startup-coordination validation are recorded in REQUEST-START-PACING.md.
It does not coordinate separate transports, processes or agents, queue beyond
the existing concurrency cap, retry failed requests, interpret cooldown advice on
other statuses, cache responses, obey a newly added robots policy or automate
human challenges.
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

### September 15 server-cooldown validation

The clean base has 1042 passing selected native cases across 16 files. The owned
cooldown candidate has 1125 across 18 files, including 83 new scheduler/transport
cases; all baseline outcomes are preserved. Build, strict selected-root types,
format and lint pass. Fake clocks and mocked HTTPS cover header-time recording,
synchronous startup, slow bodies, FIFO, deadlines, independent origins, capacity,
disabled/routed/cache behavior and cookie refresh. These are not real sockets or
server-rate-limit measurements.

Separately, the pinned candidate made three public native navigations and three
GETs, with no retries: GOV.UK and ESA returned text; Library of Congress returned
a Cloudflare challenge and remained a failure. All three bodies and cleanup were
verified. No 429/503 occurred, so these observations do not establish real-site
cooldown effectiveness or reduced blocking. GOV.UK's default reader also exposed
hidden cookie-confirmation messages without any consent action; visibility remains
an explicit extraction limitation.

Details: `reports/retry-after-cooldown-2026-09-15.md` and the private evidence lane
`node_modules/.cache/native-validation/retry-after-cooldown-september15/`.
