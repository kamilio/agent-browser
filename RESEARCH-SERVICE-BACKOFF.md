# Research service-backoff handling

Research navigation stops when HTTP 503 includes advice accepted by the existing
bounded `parseRetryAfter` parser. It records `serviceBackoff` separately from
HTTP 429 `rateLimit`: a service response is not relabeled as a rate limit or a
CAPTCHA. This applies with pacing disabled as well as enabled.

The report field has kind `http-service-backoff`, status `503`, a redacted source
URL, receipt time, action `stop-without-retry`, and required parsed `retryAfter`
advice. The source can be the primary document or a source subresource. Query
values, user information and fragments are not copied into the diagnostic URL.

## Why research needs its own stop

Each research navigation owns and closes a native transport. The transport's
existing opt-in per-origin cooldown consequently cannot coordinate later batch
navigations. Previously a batch could receive a 503 with accepted Retry-After,
close that transport, and start another URL after only the configured interval.
The research batch now terminates instead of ignoring that server advice.

After receipt, the navigation refuses new research requests and does not extract
the response as successful content. A post-navigation latch also stops extraction
when a document loader tolerates a failed subresource. Already-started exchanges
cannot be recalled. No automatic retry, sleep, cross-process scheduler, identity
change or challenge solver is introduced.

## Diagnostics and precedence

- Without an explicit header challenge, the outcome is `http-failure`, with
  failure category `policy-denied` and stage `service-backoff`. This is the
  research runner respecting server advice, not an additional user approval gate.
- Primary response metadata and an explicitly requested bounded body capture are
  retained. Existing capture/resource errors retain their own diagnostics.
- Explicit header challenge classification retains precedence. Structural/body
  challenge parsing is not needed after accepted service advice, just as for an
  existing 429 stop. `serviceBackoff` still records the received advice.
- Batch termination is decided before yielding its mutable report. Altering the
  report cannot cause the generator to continue. All remaining URLs are skipped,
  including other origins, consistently with existing research barrier/429 stops.
- Long-content and JSON-source wrappers preserve the field and refuse automatic
  source recovery. Ordinary replay, output-limit and empty-outline recovery
  admission also reject a declared service backoff in otherwise successful data.

## Header observation

Research enables the native transport's opt-in `captureServiceBackoff` option.
`serviceBackoff()` returns the first accepted real HTTP 503 observation: status,
URL, header receipt time and parsed advice, frozen without response content or
other headers. The observation survives body failures and is cleared on close.
Research reads it before starting a request and whenever a request settles,
including rejection. A failed or oversized body therefore cannot erase advice
and allow the batch to advance. The original network/resource failure remains
reported; a complete primary response/body capture is not fabricated.

Ordinary native transports default to capture disabled. Enabling observation
alone does not enable request pacing, wait or retry. First-advice retention is
bounded to one record per transport lifetime; independently enabled native
cooldowns still use their existing later-deadline rule. Fully routed mock
responses and cache hits do not generate real HTTP header observations. Research
also handles accepted advice in returned responses, including routed fixtures.

## Bounds and remaining limitations

The existing parser admits bounded delay seconds or supported HTTP dates, up to
86,400 seconds. Accepted zero or stale advice still causes this research stop;
the runner does not decide to retry immediately. Missing, malformed, ambiguous
or out-of-bound advice leaves ordinary 503 behavior unchanged. Other status
codes do not gain this field, and existing 429 behavior is unchanged.

Headers rejected by native validation do not establish trusted advice. Advice
cannot be observed before headers arrive, and already-started work is not recalled.
The observation does not preserve a complete challenge-header diagnosis across
body failure; it preserves the service advice and original failure instead.
Independently created research calls, processes and agents do not share stop state.

This is access-friendly request control, not proof of fewer real-site blocks,
general browser compatibility, rendered JavaScript, or successful CAPTCHA access.
See `reports/research-service-backoff-2026-09-17.md` for scoped validation.
