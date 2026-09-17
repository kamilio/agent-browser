# Explicit native network source modules

`extensionPageRuntime` accepts `networkSourceModules` as an alternative to the
existing in-memory `sourceModules` graph. This adds bounded dependency-source
resolution through an explicitly supplied host policy-fetch capability. It does
not activate SafeJS, discover HTML module scripts or change runtime defaults.

```ts
const factory = extensionPageRuntime(core, {
  networkSourceModules: {
    documentUrl,
    entries: [{ id: entryUrl, source: entrySource }],
    fetchWithPolicy: hostPolicyFetch,
    credentials: "omit",
  },
});
```

The host must obtain and authorize the entry source separately. Its identity
must be a canonical HTTP(S) URL and its exact source must match when evaluated
with `{ sourceType: "module", filename: entryUrl }`. Both registry options cannot
be configured together. Classic evaluation and initialization remain unchanged.

Each `PageNetworkModuleEntry` also accepts optional `baseUrl` metadata for the
entry's import base, for example `{ id: entryUrl, source: entrySource, baseUrl:
entryResponseUrl }`. It defaults to `id` and must be an exact canonical HTTP(S)
URL under the existing mixed-content, credential and length restrictions. Entry
fields are snapshotted from own data properties without executing accessors;
accessor-backed fields are rejected. Later mutations do not change the snapshot.
The base does not register another source identity: evaluation still requires
the exact entry `id` and `source`, not `baseUrl`. The host remains responsible
for obtaining and authorizing preloaded entry source and its response base.

## Host fetch contract

The callback has the existing `ScriptFetchPolicy`/`ScriptFetchResult` contract:
`(url, policy, signal) => Promise<{ response, type }>`. The registry always asks
for `mode: "cors"`. Credentials default to `same-origin`; the host can explicitly
choose `omit` or `include`. The callback and configuration are snapshotted at
factory creation; callbacks must not depend on a receiver.

Inside the native browser, compose this callback with `fetchScriptResource` and
an owned native transport. That helper enforces manual redirect handling,
per-hop CORS, credentials, mixed-content and supplied CSP checks. It strips
credentials from cross-origin requests under the `same-origin` policy. Do not
substitute the older unrestricted classic-fetch closure or a raw global client.
The host still owns network allowlists, deadlines and response/transfer bounds.

The registry rejects opaque responses, unsuccessful status, mixed-content or
credential-bearing URLs, malformed/ambiguous/non-JavaScript MIME, and oversized
source. Header names are case-insensitive. Module bytes decode as UTF-8, not the
response's legacy charset. Cross-origin requested or final URLs require a CORS
result. Host-provided result labels are trusted capability evidence, not an
independent CORS reimplementation or a sandbox for malicious host callbacks.

## Resolution and lifetime

- Only known source identities may be referrers. Relative and root-relative
  dependencies resolve against the referrer's separately retained import base:
  the final response URL for fetched modules, or `baseUrl` (defaulting to `id`)
  for declared entries. Absolute HTTP(S) dependencies are also supported. Bare
  specifiers and unknown referrers are denied without fetching. Import maps and
  package, filesystem, data-URL or executable resolution are not implemented.
- Returned sources are immutable `{ id, source }` records whose identity is the
  canonical requested URL, not the final response URL. Distinct requested aliases
  remain distinct module instances even when they receive the same response URL
  and source; their sources may also differ. A final response URL is not implicitly
  registered as another identity, known referrer or cache hit. Requesting it
  directly requires its own fetch unless that exact identity is already known.
- Request fragments remain part of the requested identity and distinguish cache
  entries. They are not appended to or substituted into the response import base;
  any fragment in the response URL belongs only to that base. For example,
  requesting `/alias.js#first` with response URL `/release/module.js#response`
  retains `/alias.js#first` as the identity, while `./child.js` resolves to
  `/release/child.js`. Requested identities and response bases are independently
  length-bounded. This is not full browser import metadata or module-map conformance.
- Repeated/in-flight requests for the same canonical requested URL share one
  promise. Failed attempts remain failed for the scope, without retry. A later
  redirect alias cannot replace a prior requested URL's source, import base or
  cached rejection, including when its response URL matches a declared entry.
- A canceled caller stops waiting without canceling another caller's shared
  request. Owner/realm closure aborts the shared fetch signal, rejects queued
  work, clears scope caches and retained import bases, and prevents publication
  of late results. The host fetch must honor cancellation/deadlines for its own
  underlying resources.
- Changing source graphs or recovering a cached failure requires a new owning
  scope. There is no hot reload or eviction of already evaluated SDK modules.

`PageNetworkModuleRegistry` is also exported for explicit host composition.
Its `createScope(signal, maxSourceCodeUnits)` supplies the same entry validation
contract and an asynchronous resolver. Using that API alone does not execute
source or instantiate a SafeJS realm.

## Bounds

| Resource | Maximum per scope |
| --- | ---: |
| Declared and fetched sources | 128 |
| Resolver calls, including cache hits and denials | 1,024 |
| Distinct fetch attempts, including failures | 128 |
| Concurrent host fetches | 4 |
| Decoded response bytes | 1,048,576 |
| Source UTF-16 code units | 262,144 |
| Total retained source UTF-16 code units | 1,048,576 |
| Identity/specifier UTF-16 code units | 4,096 |

Entry sources count toward the retained-source budgets. Page-specific smaller
source limits apply to dependencies too. Pending requests reserve source slots;
failed reservations release their slots but not their consumed fetch attempt.
Distinct requested aliases each consume a fetch attempt, source slot and retained
source budget, even when they share a response URL or identical source text.
Entry bases and final response bases independently obey the 4,096-code-unit URL
bound; they do not themselves register or charge another source identity.
These are host-source bounds, not whole-process or SDK execution-memory limits.

## Evidence and remaining gates

The earlier September 17, 2026 native gate recorded 362 passed tests across 11
selected files, including 80 new registry/integration cases. It covered native
policy-fetch composition with mocked requests, not real SDK evaluation. Its
separate single live MDN module acquisition resolved the same URL twice with one
anonymous GET, preserved 19,705 source bytes, and verified closure/revocation.
Downloaded source was not executed. These remain historical results, not live
validation of the request-identity change. The original report and JSON evidence
remain at `reports/network-source-modules-2026-09-17.md` and its companion paths.

The subsequent isolated request-identity qualification on September 17, 2026
recorded **387 passed / 0 failed across 11 selected files**, with build, selected
strict test types, format and lint passing. Existing evidence is in
`node_modules/.cache/native-validation/module-request-identity-september17/native-release02/EXECUTION.json`
and `node_modules/.cache/native-validation/module-request-identity-september17/CHECK-release02.json`.
This qualifies the selected native registry and fake-core integration cases,
not a full-suite, actual SDK or HTML module execution result.

A separate native live check at September 17 18:17:47.854 UTC follows the public
`https://unpkg.com/lit` alias through one server redirect to
`https://unpkg.com/lit@3.3.3/index.js`. The two anonymous GETs retain 157 source
bytes, keep the requested alias as the module identity, and reuse the immutable
result on repeated resolution without another request. Both responses and TLS
sockets close; owner revocation and empty cookies are verified. The source is
not executed and its dependencies are not fetched. The synthetic proof's three
mock requests are separate from these two real requests. See
`reports/module-request-identity-2026-09-17.md` and its JSON evidence.

Actual SafeJS source-module execution, namespaces/cycles/top-level await,
callback-tail scheduling, HTML module discovery/order/lifecycle, and scripted
websites remain separate gates. The HTML loader still reports modules as
unsupported. No claim of working MDN application scripts, general challenge
avoidance, credentials, passkeys or full browser compatibility follows.
