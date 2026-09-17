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

- Only known source identities may be referrers. Relative, root-relative and
  absolute HTTP(S) dependencies resolve against that identity; bare specifiers
  and unknown referrers are denied without fetching. Import maps and package,
  filesystem, data-URL or executable resolution are not implemented.
- Returned sources are immutable and use the canonical final URL. Requested
  fragments are retained in that identity and checked against the identity
  bound. This is not full browser import metadata or module-map conformance.
- Repeated/in-flight requests share one promise. Failed attempts remain failed
  for the scope, without retry. A later redirect alias cannot replace a prior
  requested URL's success identity or cached rejection. Reusing a final identity
  with different source is rejected.
- A canceled caller stops waiting without canceling another caller's shared
  request. Owner/realm closure aborts the shared fetch signal, rejects queued
  work, clears scope caches and prevents publication of late results. The host
  fetch must honor cancellation/deadlines for its own underlying resources.
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
These are host-source bounds, not whole-process or SDK execution-memory limits.

## Evidence and remaining gates

The September17 native gate passes362 tests across11 selected files, including
80 new registry/integration cases. It covers native policy-fetch composition
with mocked requests, not real SDK evaluation. A separate single live MDN module
acquisition resolves the same URL twice with one anonymous GET, preserves19,705
source bytes, and verifies closure/revocation. Downloaded source is not executed.
See `reports/network-source-modules-2026-09-17.md` and its JSON evidence.

Actual SafeJS source-module execution, namespaces/cycles/top-level await,
callback-tail scheduling, HTML module discovery/order/lifecycle, and scripted
websites remain separate gates. The HTML loader still reports modules as
unsupported. No claim of working MDN application scripts, general challenge
avoidance, credentials, passkeys or full browser compatibility follows.
