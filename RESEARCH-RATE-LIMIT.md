# Early research rate-limit handling

## September 17, 2026 update

Header-time observation now retains429 evidence across body failures and outer
navigation cancellation. See `RESEARCH-RATE-LIMIT-HEADERS.md` for the current
contract. The original completed-response boundary and historical measurements
below are retained; its response-size limitation is superseded by that update.

## Original September 11 behavior and evidence

The native research runner stops on an HTTP 429 returned by its transport. This
extends the earlier batch-only stop to primary documents and stylesheet fetches.
It does not bypass restrictions, change browser identity, or retry requests.

## Response handling

- A primary 429 is not passed to the native HTML loader or reader sanitizer.
  No headings, text-line discovery or selected-content extraction follows.
- Primary response metadata and an explicitly requested, bounded body capture
  remain available. Existing transport and capture ceilings still apply. Capture
  errors retain their own failure stage; failed reports are not replay-admitted.
- A header-confirmed primary Cloudflare challenge retains semantic-barrier
  precedence after capture succeeds. A plain 429 uses outcome `http-failure`,
  failure category `policy-denied` and stage `rate-limit`. The body is not scanned
  to infer challenge markers after the early stop.
- A stylesheet 429 blocks subsequent calls through the research transport
  wrapper. Even when the document loader catches that stylesheet failure,
  navigation is checked again before extraction. Earlier DOM work may already
  have happened; this is not rollback or cancellation of in-flight requests.
- The batch yields the terminal report, then stops, including when a stylesheet
  returned 429 under a primary HTTP 200. Later requested URLs are not visited.
  Ordinary unclassified 404/503 responses retain their previous behavior.

Stopping happens after a transport response returns, not at header arrival.
Network response-size limits can therefore fail before a 429 is reported. No
claim is made that large error bodies are avoided at the network layer.

## Report metadata

An observed 429 adds `rateLimit` with `kind: "http-rate-limit"`, `status: 429`,
the redacted responding `url`, UTC `receivedAt`, and
`action: "stop-without-retry"`. Optional `retryAfter` contains `kind`
(`delay-seconds` or `http-date`), integer `delaySeconds`, and UTC `retryAt`.
Response header contents are not copied into this metadata. Existing explicitly
requested body captures are unchanged and are not represented as sanitized text.

`src/retry-after.ts` parses advice using the explicitly supplied receipt time:

- Decimal nonnegative seconds or IMF-fixdate, RFC850 and asctime HTTP dates.
- Case-insensitive header names, surrounding SP/HTAB and identical trimmed
  duplicate values; conflicting values or unsupported syntax are ignored.
- At most 128 own header names, 16 values and 128 code units per value. Accessor
  properties are not invoked; values are not coerced into strings.
- Calendar and weekday validation; RFC850's strictly-more-than-50-years rule;
  `23:59:60` normalizes to the next representable UTC second.
- Expired dates report zero delay. Fractional future seconds round upward.
  Advice beyond 86,400 seconds is ignored, never shortened to the ceiling.

Missing, malformed or over-limit advice does not prevent the 429 stop. This
metadata is advisory: there is no sleep, automatic retry, persistent cooldown,
cross-agent scheduling or deadline extension. A later independently requested
navigation is not automatically suppressed. Other status codes do not acquire
Retry-After handling through this change.

## Source and validation scope

The native browser retrieved RFC 9110 on September 11, 2026, once, with HTTP200.
Native excerpts cover sections 10.2.3 and 5.6.7; no alternate browser or HTTP
client supplied the research. Evidence is under
`node_modules/.cache/native-validation/native-http-retry-after-rfc-september11/`.
The original local Retry-After extraction emitted text but its harness exited1
on an incorrect assertion about an absent property. That failure is preserved;
the two separately authorized, zero-network HTTP-date followups exited0.

The successful isolated run on September 11, 2026 spans
**05:55:17.343Z–05:56:25.470Z**. Production build, strict checking of 25 selected
test roots, scoped lint of five changed TypeScript files, and **3,060/3,060**
tests in 25 explicit native-manifest files all pass. Its 991 source inputs remain
unchanged. The new coverage comprises 66 Retry-After unit cases and 48 research
integration cases; 123 existing challenge cases also pass. All 2,823 case names
and outcomes from the preceding reader-policy run match. The existing long-reader
429 outline assertion intentionally changes to expect the early stop.

Evidence is retained in
`node_modules/.cache/native-validation/native-rate-limit-september11-round02/`,
including `results/SUMMARY.json`, JSON test output and before/after source hashes.
The snapshot starts at commit `503a83f` and overlays only this feature's five
TypeScript files and two native-manifest entries, excluding unrelated dirty work.

The first isolated attempt, **05:52:44.121Z–05:53:51.116Z**, remains under
`node_modules/.cache/native-validation/native-rate-limit-september11/`.
Build/types/lint passed, but 48 integration fixtures were rejected before
navigation because their input URL contained a fragment. The result remains
3,011 passed / 48 failed, not a successful rate-limit check. The fixtures now use
an admitted input URL; production URL validation was not weakened. A final unit
case also covers leap-second normalization at the RFC850 50-year boundary.

The final run uses synthetic responses and an API-level network guard; it is not
an OS sandbox or a full native-suite run. Known unrelated selector-suite failures
remain outside this selected scope. No live website, real credential, socket,
TTY/PTY or SafeJS probe is performed by these checks. They are not evidence of
live-server throttling behavior, improved fingerprinting, CAPTCHA solving, or
credential/passkey acceptance.
