# Native classic-script CORS and integrity

September 17 framing update: `FRAMING-CSP.md` describes the explicit top-level
exception for empty or framing/reporting-only response policies. Script/source,
sandbox, unknown and meta-CSP refusals remain; actual SafeJS is still separate.

`ScriptLoader` can now admit external classic scripts declaring `crossorigin`
and/or `integrity` when a policy-aware fetch provider is supplied. It previously
skipped these declarations even when their resources could be fetched safely.
This removes an explicit native-loader gap; it does not qualify SafeJS execution,
module scripts, a rendered website or full browser security-policy conformance.

## Wiring

`DocumentLoaderContext.fetchScriptWithPolicy(url, policy, signal)` is supplied by
`BrowserSession`. Pass it as the loader's optional `fetchWithPolicy` alongside the
existing `fetch` option. The owned-process child and supported script diagnostics
wire this provider explicitly. Existing hosts without it keep the historical
`integrity-or-cors-not-supported` skip; there is no unsafe fallback.

Ordinary external scripts without either attribute keep the existing fetch path.
Inline scripts retain their current behavior. This does not enable scripts in
reader mode or change default runtime selection.

## Policy mapping

| Declaration | Fetch mode | Credentials |
| --- | --- | --- |
| Integrity only, no crossorigin | no-cors | include |
| crossorigin absent, no integrity | existing legacy path | existing behavior |
| crossorigin="use-credentials", case-insensitive | cors | include |
| Any other present crossorigin value, including empty | cors | same-origin |

Values are not whitespace-trimmed for this enumeration. The session's explicit
resource-credentials `omit` policy overrides requested credentials on the new
path. In a cross-origin-tainted chain, `same-origin` is reduced to `omit`.

`fetchScriptResource` uses the native request port with manual redirects,
`Accept: */*`, document-origin CORS headers and cookie context. It validates CORS
before following cross-origin responses, tracks origin/credential taint across
redirects, rejects mixed content and hidden adapter-followed redirects, and
retains the native transport's DNS/address/TLS/timeout/body limits. Redirect
count is bounded by the supplied transport policy, capped at 20 by the helper.
It is not a bypass for access restrictions or a credential provider.

## Before evaluation

- Require a successful HTTP status and one explicitly supported JavaScript MIME.
- Reject an opaque response in CORS mode or when usable integrity metadata exists.
- Parse integrity metadata with the existing bounded SRI helper. Verify the
  strongest supported SHA256/384/512 algorithm against the original response
  bytes, before character decoding or submitting source to the runtime.
- Preserve response-body and cumulative submitted-source limits. Integrity
  mismatch, malformed policy response, mixed-content final URL and fetch errors
  produce failure/error-event reporting; they never retry through plain fetch.
- Snapshot source attributes at preparation; preserve classic blocking/async/
  defer scheduling, currentScript and source/error accounting.

Unknown integrity algorithms retain the existing parser's ignore behavior.
Unsupported or oversized metadata is not a grant to skip verification. The
response byte count and submitted UTF-8 source count are different measurements.

## Lifetime and outstanding gates

The loader supplies its abort signal. The session combines it with document
bootstrap/navigation lifetime, cancels the native request and rechecks ownership
after awaits. Policy and legacy script requests share the existing 16-resource
admission budget; redirect hops remain separately bounded. Loader limits remain
64 discovered scripts, 16 external scripts, four concurrent fetches and 1 MiB
source-byte limits by default.

Enforced response or encountered meta CSP still conservatively prevents script
execution. Nonces, script-src semantics and CSP hash authorization are not added.
The new session policy-fetch entry also refuses enforced response CSP. Modules,
import maps and speculation rules remain unsupported by the HTML script loader.

Constructed HTML, fake-runner, mocked-transport and owned-process wiring tests
are separate from real SDK and live-script acceptance. SafeJS 0.1.640 execution
still requires its own authorized scope and a qualified isolated launcher. This
feature neither changes the callback/source-admission requirement nor resolves
the recorded SDK reentry mismatch. No website JavaScript is enabled by these
native tests; the broader dynamic-browser and website-content goals remain open.
