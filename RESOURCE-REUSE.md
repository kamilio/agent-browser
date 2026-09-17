# Opt-in anonymous resource reuse

The native browser can reuse a small set of explicitly fresh public stylesheets
and images between navigations. This reduces unnecessary requests without
changing document content, fabricating network responses, or adding a page-runtime
dependency. It is deliberately not a general HTTP cache.

## Enable through the native API

```ts
const session = new BrowserSession({
  resourceCredentials: "omit",
  createTransport: (cookieJar) => new NodeNetworkTransport({
    cookieJar,
    resourceCache: {},
  }),
  loadDocument: loadBrowserDocument,
});
```

Both settings are explicit. Without `resourceCache`, transport behavior and
metrics remain unchanged. `resourceCredentials` defaults to `"default"`, retaining
existing stylesheet/image credential policies. Choosing `"omit"` changes only
those resources, including the credentials used for stylesheet CORS checks.
Navigation, scripts and page fetch keep their existing credential behavior.
This option alone does **not** make every browser request anonymous; the live
comparison additionally uses a credential-omitting document adapter and empty jar.

The CLI can opt in at host startup with
`AGENT_BROWSER_RESOURCE_CACHE=public-anonymous-v1`; see `CLI-RESOURCE-REUSE.md`
for configuration, daemon lifetime and validation limits. A custom transport
wrapper must forward the native `resourceReuse` capability for the session to
attach resource hints. Wrappers should preserve delivery provenance and metrics.
Ordinary document, script, page-fetch and response-accounting operations are not
silently converted into cacheable resource requests.

## Admission and lifetime

- Only bodyless manual-redirect GETs explicitly marked as stylesheets/images,
  with omitted credentials and a matching same-origin HTTPS document context.
- Only direct HTTP 200 responses with a supported CSS/image MIME type, explicit
  `public` and positive `max-age`, an unambiguous valid Date and optional Age.
- No authorization/cookie/sensitive or conditional request headers, request
  Cache-Control/Pragma, Set-Cookie, Retry-After, range responses, routed replies,
  already-cached replies, private/no-store/no-cache, or unsupported directives.
- Vary is absent or exactly Accept-Encoding. Keys include origin, resource kind,
  full URL/query and all normalized request headers, including actual encoding
  and browser identity headers. Unsupported cases use ordinary transport.
- Freshness accounts for apparent age, Age, response delay and monotonic elapsed
  residence. The local lifetime is capped; there is no stale serving, heuristic
  freshness, revalidation/304 merging or sharing of pending requests.

Defaults are 64 entries, 2 MiB total retained body/metadata, 256 KiB per decoded
body and at most 60 seconds of residence. Configurable maxima are 1,024 entries,
16 MiB total/per body and 300,000 ms residence; the per-body limit cannot exceed
the total limit. Metadata is separately bounded. FIFO eviction, expiry, copied
inputs/outputs and transport closure prevent unbounded or shared mutable state.
Clock rollback disables reuse and leaves ordinary transport available.

URL/header/method/credential policy runs before reuse. Route resolvers still run
for cached deliveries; any fulfilled route clears reuse state. Unsafe methods
clear the cache both when starting and finishing, including failures/aborts, so
overlapping old reads cannot repopulate it after a write. Existing resource owner,
cancellation, CSP, mixed-content, CORS, SRI, decoding and document limits remain
in their normal paths. Pointer geometry requirements are unchanged.

## Honest accounting

A hit returns `delivery: "memory-cache"`, copied decoded bytes, current delivery
elapsed time, an updated Age and zero `encodedBytes`. It does not increment
network requests, transferred bytes or mocked-response counters. Enabled
transports report `cacheHits`, `cachedDecodedBytes`, `cacheEntries` and
`cacheBytes`. Journals preserve the memory-delivery marker while reporting the
delivered body size. Closing the transport clears retained entries/bytes.

## Quoted freshness arguments

An otherwise eligible `Cache-Control` response can use `max-age="60"` as well
as `max-age=60`. Quoted decimal values may contain HTTP quoted-pair escaped
digits; for example, `max-age="\6\0"` also decodes to sixty seconds. The decoded
value still must be a positive safe integer with safe millisecond conversion.
Malformed quoting/escaping, nondecimal values, zero, overflow and duplicate
max-age directives remain ineligible. This is not JavaScript string decoding.

This change does not admit quoted `Age` fields, additional cache directives,
private/no-store/no-cache responses, new resource types or credentials. Request
eligibility, copying, freshness accounting, local caps and expiry are unchanged.
The quoted-argument check uses mocked native transport exchanges, not a new
live request-reduction benchmark. See `reports/cache-quoted-age-2026-09-17.md`.

## September 14 live comparison

Two separate native Lobsters flows load Search, select Stories with Space, fill
the public constant `local llm`, press Enter, and extract the actual results.
Both use the same pinned candidate, explicit credential omission, scripts off,
truthful identity and 250 ms network pacing. They are new observations, not
rewritten versions of the earlier search tests.

| Observation | Cache disabled | Cache enabled |
| --- | ---: | ---: |
| Real HTTP requests | 10 | 8 |
| Document GETs | 2 | 2 |
| CSS/image HTTP GETs | 8 | 6 |
| Memory deliveries | 0 | 2 |
| Result Markdown bytes | 11,560 | 11,560 |

The result files are byte-identical. The reused hashed stylesheet and SVG retain
their original body hashes: 4,309 decoded bytes, representing 1,765 encoded asset
body bytes in the skipped control transfers. The unversioned stylesheets lack
explicit freshness and are fetched again. This is **20% fewer HTTP requests in
one paired search flow**, not a general latency or website-success guarantee.

The control runs 22:47:40–22:47:43 UTC; treatment runs 22:48:26–22:48:28 UTC on
September 14, 2026. All responses are HTTP 200, with no redirects, mocks or accepted
cookies. Both processes exit 0 without timeout or surviving process group, with
empty private HOME/TMP. Documents, active requests and retained cache state are
cleared at cleanup. No posting, voting, credentials or challenge solving occurs.

A separate native-reader visit retrieves RFC 9111's actual age/invalidation text:
153,459 Markdown bytes in 263 ms. The cache uses a conservative subset informed
by that specification; it does not claim complete RFC 9111 implementation.

## Validation and remaining gates

805 tests pass across fourteen explicitly manifest-listed files, including real
stream-accounting tests with mocked HTTP entry points, cache admission/expiry,
route policy, resource credentials/CORS, cancellation, zero-byte caller caps,
overlapping writes, image/style policy, SRI and the native keyboard search path.
The socket-denying guard remains active; production compilation, fourteen strict
test roots, nine-file formatting and new-file lint pass. Two unchanged lint
findings in `src/session.test.ts` are reproduced against the preceding baseline.
The complete native release suite is not rerun.

Earlier failures are retained: a HEAD fixture's Buffer/Uint8Array comparison and
the cache's initial zero-byte-cap mismatch. Static review also catches unhinted
route invalidation and reads overlapping an unfinished unsafe request; both
receive corrections and regression coverage before the live candidate launch.

Evidence is under `/dev/shm/agent-browser-<name>-september14/` with byte-verified
durable copies under `node_modules/.cache/native-validation/<name>-september14/`:

- `resource-reuse`: pinned source/compiled hashes, native tests, reviews,
  typecheck/build/format logs, live comparison and preservation audits.
- `resource-reuse-control` and `resource-reuse-live`: individual scopes,
  supervisors, native action results, response hashes and extracted content.
- `cache-standard`: the independent RFC reader observation and original receipt.

Native tests do not prove live/socket/TTY/SafeJS/device gates. Broad website and
research coverage, pointer/rendering compatibility, scripts, credentials/passkeys,
CLI exposure and the full release remain open. Caching does not bypass access
restrictions; challenged or rate-limited browsing still requires a stop/handoff.
