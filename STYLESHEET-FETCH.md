# Native stylesheet resource fetching

## Agreed integration API

`src/stylesheet-fetch.ts` exports:

```ts
interface StylesheetFetchPolicy {
  readonly mode: "cors" | "no-cors";
  readonly credentials: FetchCredentials;
}
interface StylesheetFetchContext {
  readonly documentUrl: string;
  readonly signal: AbortSignal;
  readonly maxRedirects: number;
  readonly request: (input: NetworkRequest) => Promise<NetworkResponse>;
}
interface StylesheetFetchResult {
  readonly response: NetworkResponse;
  readonly type: "basic" | "cors" | "opaque";
}
function fetchStylesheetResource(
  url: string,
  policy: StylesheetFetchPolicy,
  context: StylesheetFetchContext,
): Promise<Readonly<StylesheetFetchResult>>;
```

`FetchCredentials` comes from `cors.ts`; network types come from `network.ts`.
The caller supplies the original document URL, shared session request function,
lifetime signal, and existing redirect budget. No default transport, queue,
retry, cookie store, headers, or independent resource budget is created.
The policy, document URL, request function and redirect limit are captured before
awaiting, so later caller mutation cannot relax the in-flight policy.

## Native behavior

- Every request is GET, `Accept: text/css`, manual redirect, original signal and
  original document cookie context with `topLevelNavigation: false`.
- Targets resolve relative to the current URL, drop fragments, and pass
  `parseNetworkUrl`. Non-HTTP(S), URL credentials, invalid/oversized URLs and
  HTTPS-document mixed content fail before dispatch. Cancellation is checked
  before each dispatch and after its response; the supplied request function
  remains responsible for settling pending work on lifetime cancellation.
- Sticky cross-origin taint changes anonymous `same-origin` credentials to
  `omit`, including a return to the document origin. Explicit `include` and
  `omit` remain unchanged. `crossSiteRedirect` uses existing `cookieSameSite`
  between adjacent hops, independently of origin comparisons.
- Tainted CORS requests send Origin and require `checkCors` on each response,
  including redirect responses, before any next dispatch. Leaving a foreign
  origin taints subsequent Origin to `null`, following native `PageFetch`.
  Header names are case-insensitive; repeated CORS values are combined, never
  reduced to a first-wins authorization. Native PageFetch's 16 KiB normalized
  response-header bound is retained; cookie response fields are not inspected.
- No-CORS crossing yields `opaque`, even if the final URL returns to the document
  origin; it sends no Origin header and does not manufacture a CORS permission.
  Untainted same-origin is `basic`; successfully checked tainted CORS is `cors`.
  These types describe eligibility for the parent's later checks, not page-
  exposed filtered Response objects. The native body and headers remain intact.
- Only 301/302/303/307/308 with one Location field value are followed. Duplicate
  values, including case-variant names, fail closed; a comma within one URL is
  not treated as a list delimiter. Missing Location returns the response to the
  loader. Redirect loops consume the caller's integer limit, validated in 0..20;
  no caller limit is raised. Hidden transport-followed URLs/history are rejected.
- The final response is a fresh record with summed per-hop `encodedBytes` and
  `elapsedMs`, and frozen actual redirect records. Input responses, headers,
  bodies and histories are not mutated. Final body/status/route metadata are
  preserved; response status, MIME and integrity acceptance belong to the loader.

## Boundaries and source status

The parent owns session/loader integration, explicit capability forwarding,
legacy callback separation, shared scheduling/accounting and manifest changes.
The disjoint SRI worker owns integrity logic. This helper neither verifies a
digest nor makes an opaque response eligible for integrity acceptance.

`STYLESHEET-CORS-SOURCE.md` extracted HTML's potential-CORS mapping: missing
crossorigin is no-cors/include, anonymous is cors/same-origin, use-credentials is
cors/include. That is consistent with this API; attribute parsing is the caller's
responsibility. Its Fetch extraction failed at the original document-node cap.
Consequently redirect/CORS/digest-byte-stage conformance remains unverified from
that source. This implementation deliberately follows local `PageFetch`,
`checkCors`, `parseNetworkUrl`, and `cookieSameSite`, not a substitute specification
or a claim that the loader guard can already be removed.

## Validation

Scoped validation on September 11, 2026 passes in the new private
`node_modules/.cache/native-validation/stylesheet-fetch-worker-september11/` lane:

| Check | Result | Receipt prefix |
| --- | --- | --- |
| New helper, one selected suite | 99 passed, 0 failed/skipped | `tests-confirmed` |
| Listed CORS preflight cache regression | 36 passed, 0 failed/skipped | `regressions-confirmed` |
| Strict helper/test compilation | Exit 0 | `strict-final` |
| Existing formatter, both new files | Exit 0 | `format-final` |

It uses clean archive `372e8a3d9e94f3d0c30b09cbb49606bda84adc9e`, overlaying only
the two new source/test files and appending this test to the archived manifest.
No dirty shared source or SRI-worker files enter that snapshot. Guarded native
fake-transport tests, strict compilation and existing formatting tools use
single-thread Vitest, tool-child socket seccomp, private HOME/TMP and 120-second
plus 5-second grace / 6 MiB caps. No live request, credential store, page runtime,
integration acceptance or broad parent gate is claimed.

Confirmed test guards record seccomp mode 2, no-new-privileges 1, file cap
6,291,456 bytes, core cap 0, and zero network/native-addon guard attempts.
Every bounded child process group is absent and its snapshot source hashes are
stable. Private HOME/TMP caches are inventoried and removed after validation.
`AUDIT.json`, `CLEANUP.json`, `source-final.sha256` and `RECEIPTS.sha256` bind
the clean-base overlay, source/report hashes, execution records and original
failed attempts. This is scoped worker validation, not the parent's broad gate.

Preserved failures: initial preparation did not create its harness files;
initial strict compilation found two test-fixture typing errors, then passed
after correction; initial supplementary selection rejected an unlisted CORS
suite before running tests; later setup assertions rejected trailing kernel
whitespace in `/proc/self/limits`, again before tests. Named original receipts
and `PREPARATION.md` retain these outcomes. No helper behavior was weakened to
pass them; no exclusions or manifest additions beyond the agreed test were made.
