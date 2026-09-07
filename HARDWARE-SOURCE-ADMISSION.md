# Native hardware-source admission checkpoint

September 7, 2026. The bounded hardware-guide operation fails **before any
counted network request**. No hardware source, current revision or research
finding is obtained. The failure and successful synthetic checks remain distinct.

## Preparation and header correction

The candidate is the historical native README link to
`https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/multi-gpu.md`.
`master` is mutable; this checkpoint does not establish present content or
availability. The wrapper uses the frozen `research-long-cli-verified` native
session, transport, default plain-text reader and extractor, not another browser.

It retains one request, zero redirects, 2,000,000-byte response/total limits,
50,000 document nodes, 1,000,000 reader text units and 256,000 extraction bytes.
Only HTTP 200 with one `text/plain` MIME value is admitted. The process has a
125-second external deadline with five-second kill grace. No body capture,
host response-text fallback, credential or page-runtime operation is requested.

Independent review found that an unrelated 4,097-unit header could make the
frozen challenge classifier return null despite an explicit challenge marker.
The corrected wrapper first admits the **full original header record** against
the classifier's narrower limits, rejecting invalid/ambiguous input before
loading. This is conservative admission, not comprehensive challenge detection
or challenge solving. No frozen engine or previous source receipt is modified.

Five synthetic supervisor controls pass at 21:35:43.708–21:35:50.487 UTC, covering
success, failure, timeout and two collision states. Ten separately authorized
header-operation fixtures pass at 21:37:40.846–21:37:41.842 UTC, with zero
forwarded network requests and 1,740 inputs checked before/after. The fixtures
exercise actual native session/reader/extraction/emission but replace transport
request handling and supply explicitly synthetic network metrics.

Within that synthetic context, the retained earlier padded-header operation
reaches extraction, while the corrected one rejects before loading. Ordinary,
short/boundary challenge, wrong-MIME, empty-text and header-budget cases retain
their expected outcomes. Every case writes once. These fixtures **do not exercise
native request admission**, which explains the separate failure below; their
pass is not evidence of real HTTP, source success or challenge compatibility.

## Actual source-operation failure

| Observation | Recorded value |
| --- | --- |
| Native interval | 21:39:27.232–21:39:27.295 UTC |
| Reported elapsed | 63.239202999999996 ms |
| Failure | `invalid-input`, stage `network` |
| Requests / redirects / mocks | 0 / 0 / 0 |
| Encoded / decoded bytes | 0 / 0 |
| Transport | Closed, zero active requests |
| Response / final URL / extraction | Absent / null / absent |
| Receipt | 2,335 bytes |
| Final / pre-final / native / timeout statuses | 1 / 1 / 1 / 1 |
| Native availability | `completed` |
| Input / frozen checks | 0 / 0 |
| Stderr | Empty |

Static inspection identifies an unconditional request-admission mismatch: the
wrapper supplies `cookieContext` to a transport constructed **without a cookie
jar**. The pinned native transport rejects that combination even when credentials
are `omit`, before incrementing its request counter or resolving the host.
Adding a jar is unnecessary and would widen the intended no-cookie design.
The proposed correction removes that single context property instead.

The original operation is not patched or retried. A fresh `hardware-multi-gpu-source-02`
preparation retains the actual earlier bytes and removes only that line. Its
planned fixture path delegates to actual native `requestWithRoutes` admission,
with an always-returning in-memory response before DNS/HTTP. This must prove the
old failure and corrected native loading while explicitly labeling any projected
mock metrics. That probe, new controls and any new source request remain unrun
at this checkpoint and require separate authorization.

## Evidence and limits

Separate zero-GET verification at 21:43:57.876–21:43:58.237 UTC checks all 1,732
compiled files and 40 RUN artifacts. It preserves `native-failure`, process exit
1, no extraction and null body/extraction identities. No source, capture decode
or native runtime import is performed by that verifier.

The verifier's final static handoff identifies a limitation in generic nonzero
status-transition validation. The actual all-1 row was separately inspected and
does not exhibit it; this failure-only check must not be generalized to arbitrary
nonzero combinations, successful exports or malformed-input controls. The frozen
script/result remain unchanged. A later version needs its own correction/tests.

Frozen evidence is under
`node_modules/.cache/native-validation/hardware-multi-gpu-source/`:

- `FINAL-SHA256SUMS`: 298 files, SHA256
  `567498bb247774c9a221fe03525d273d88d96bacf89f21a9a74b8f6d1d335800`.
- `stdout.jsonl`: SHA256
  `fe9564c440c42847b7f2caed4e0419b2fc233f3a2691d2a11e843d2dcb2bbad8`.
- `INTEGRITY.json`: SHA256
  `271c2fefac80e72d2387288077b556d7c85445b63a511ec64b2a94085e15454e`.
- Original operation: SHA256
  `3b2afdcd44fe84f545da3aaa7a38ecf9006bfb6d096fe356370d21f92d586012`.
- Unexecuted corrected operation: SHA256
  `1543c1c083de13d384a32d348895967dc997f12fb306e1b9bce47edd976e263d`.

The initial syntax/control approval review timed out; one identical retry was
approved. No denied gate is reopened. Hardware rankings, benchmarks/current
sources, published WebAuthn privacy, real password-provider and passkey/device/
page/consent acceptance remain outstanding. The full browser goal stays active.
