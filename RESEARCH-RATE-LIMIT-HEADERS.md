# Header-time research rate limits

Research retains HTTP 429 rate-limit evidence from validated real response
headers, even when the body later fails, exceeds its limit or is cancelled.
The existing `rateLimit` report shape and stop-without-retry action remain.
Missing, malformed or out-of-bound Retry-After advice does not weaken a 429 stop.

## Native observation

`NodeTransportOptions.captureRateLimit` is an optional boolean, default false.
`NodeNetworkTransport.rateLimit()` exposes the first observed real HTTP 429 as
a frozen record containing `status`, `url`, `receivedAt` and optional frozen
`retryAfter`. Capture occurs after header admission and before body consumption
or the existing pacing callback. Other response headers and body bytes are not
retained. Close clears the record; later responses do not overwrite it.

Observation is independent of request pacing. Enabling it does not cause waits,
retries or new scheduling. Fully routed responses and cache hits do not generate
real HTTP header observations. `captureServiceBackoff` and `serviceBackoff()`
continue to describe 503 with accepted advice; the two observations are separate,
bounded to one record each per transport lifetime.

## Research behavior

The runner enables both observation options and reads them before starting a
request, whenever it settles and when outer navigation fails before cleanup.
This covers failed primary bodies, tolerated subresource failures and the session
cancellation race. Once rate-limited, research refuses subsequent requests and
extraction. Batch stopping remains decided before its mutable report is yielded.
All remaining batch URLs are skipped; independent processes are not coordinated.

The native observation contains the native URL. Research applies its existing
userinfo, query-value and fragment redaction before reporting it. For real
header observations, `receivedAt` denotes header receipt rather than completion
of body consumption. Returned-response detection remains as a fallback, including
routed fixtures, using its existing completed-response receipt time.

Original network/resource/cancellation errors remain in the failure record.
If a body is incomplete, no complete primary response or body capture is
fabricated. The outcome is `http-failure`, with a separate `rateLimit` record.
Completed primary captures still retain explicit header-challenge precedence;
header-only observation does not claim a complete challenge diagnosis after
body failure. No body challenge parsing is needed to respect a 429.

Ordinary replay admission now rejects an own `rateLimit` field even if other
caller-pinned fields inconsistently describe successful content. Specialized
output-limit and empty-outline recovery already reject that field. Existing
content wrappers continue to propagate the stop and refuse automatic recovery.

## Limits

Unadmitted headers or failures before headers arrive cannot establish observed
rate-limit status. Already-started exchanges are not recalled. No fingerprint
spoofing, alternate identity, proxy rotation, credential use or CAPTCHA solving
is introduced. Reduced real-site blocking and rendered JavaScript functionality
require their own evidence. See `reports/rate-limit-headers-2026-09-17.md` for
the isolated tests and separately scoped native website work.
