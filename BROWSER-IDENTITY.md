# Truthful native identity defaults

September 5, 2026. Managed native sessions now share one immutable identity
profile across request defaults and page bindings. This improves consistency;
it is not a Chrome/Firefox fingerprint, a physical-device profile, a measured
TLS fingerprint or evidence of defeating a production challenge.

## Session configuration

`BrowserSessionOptions.identity` accepts only optional `languages`. For example,
an embedding application may supply `{ languages: ["pl-PL", "en-US"] }` when
constructing its session. The resulting public `session.identity` contains:

- Fixed native `userAgent`: `AgentBrowser/0.1`, matching the existing transport
  default. This profile API does not accept a replacement brand, vendor,
  platform, hardware inventory or Chrome client hints.
- `language`: the first canonical preference.
- `languages`: a copied, frozen, ordered native array.
- `acceptLanguage`: the first preference without a weight, then descending
  tenths from `q=0.9` to `q=0.1`, at most ten preferences.

Absent or undefined languages use the explicit browser default `["en-US"]`,
not the host's environment or locale. Empty lists, duplicate canonical tags,
malformed/oversized tags, sparse/decorated arrays, accessor properties and unknown
options reject. Canonicalization uses the host's standard
`Intl.getCanonicalLocales`; it does not configure guest SafeJS Intl or Date.
Portable validation cannot promise to detect every JavaScript proxy or prevent
host-proxy traps, and assumes trusted, unmodified host builtins.

`createBrowserIdentity`, `defaultBrowserIdentity`, `browserIdentityHeaders`,
their public types and bounds are exported from the core entrypoint. Constructed
profiles are privately branded: reconstructed or serialized lookalikes are not
accepted by the header helper. An embedding process can reconstruct a profile
from validated language options, not trust a mutable serialized profile object.
CLI and session-process configuration now carry these language options explicitly;
the child reconstructs and validates a profile rather than trusting a serialized
identity object. The actual runtime gate remains separate and unaccepted.

## Explicit CLI and child configuration

`AGENT_BROWSER_LANGUAGES` is an optional strict JSON array, for example
`["pl-PL","en-US"]`. Its raw value is bounded to 4096 UTF-16 code units before
parsing, and the existing profile rules apply afterward. An unset value explicitly
uses `en-US`; ambient `LANG`, `LC_ALL` and `LANGUAGE` do not select the profile.
Malformed, empty, duplicate or oversized preferences fail before host creation
or credential configuration loading. There is no new User-Agent override.

The CLI passes the same canonical frozen language options to native sessions and
process-backed hosts. `SessionProcessOptions.identity` exposes the same optional
host API. Parent-side validation snapshots options before asynchronous root
resolution and before spawn; only language options cross the initialize frame.
The child revalidates those options before runtime loading or session/resource
creation. Existing requests to a separately running service do not reconfigure
that service: configure the environment when starting its host.

Synthetic configuration tests mock spawn, SDK loading, stdin/stdout, process exit
and resource constructors. They verify data flow and rejection order only, not
actual guest language-array behavior, process permissions or runtime isolation.
The denied identity-runtime probe remains denied pending explicit user approval.

September 5, 2026 configuration checkpoint: **45 new cases pass** (24 pure
configuration and 21 mocked CLI/child-flow cases). Seven named suites produce
**203 passes in each tree**, with working/isolated project types/builds, strict
changed-test types and scoped Biome passing. The native manifest has 431 entries;
it was not run in full. Evidence is retained under
`node_modules/.cache/native-validation/identity-plumbing-final-*`, with worker
baselines and intermediate mock-cleanup failures under `identity-config/` in
that cache. Existing CLI selection assertions now include the explicit default
language options. No actual SDK or browser child process is exercised.

## Requests and documents

Session identity is validated before transport/resource setup. The managed
request choke point creates a new header record and adds User-Agent and
Accept-Language defaults before both route interception and transport dispatch.
Navigation, form submission and resource/page fetches use that same path.
Explicit caller headers, including mixed-case identity overrides, are preserved.
Consequently a deliberately overridden request can differ from navigator defaults;
this is not a promise that every arbitrary request has identical identity headers.

The helper rejects case-insensitive duplicates, accessor/symbol fields, CR/LF/NUL
injection and excessive header count/bytes without mutating caller records.
Existing transport token, controlled-header, URL, Host/SNI, TLS, cookie and redirect
policies still apply. The profile adds no Host, Origin or client-hint headers.
Raw standalone transports retain their existing defaults; consistency here
describes managed sessions and explicitly configured embedding applications.

The loader binds the profile to its owned document after final-URL validation and
before script hooks can observe it. A document's bound profile cannot be replaced;
first lookup on a standalone document pins the default. Lookup and binding reject
closed documents. New tabs, navigation and retained history use the same session
profile rather than independently randomizing values.

## Page surface and runtime gate

PageBindings now exposes one shared global/Window navigator even without passkeys.
Its read-only `userAgent`, `language` and `languages` getters use the document's
profile and enforce owner lifetime. An explicit passkey provider still controls
whether `navigator.credentials` exists. No platform/GPU/plugin/Screen/outer-window
surface or fictitious authenticator is added.

The native host binding returns stable frozen language data. **Actual guest-array
identity and immutability remain unverified.** Read-only inspection of the existing
experimental SafeJS copier suggests that host arrays may become fresh mutable
guest arrays; that is a source-based risk, not an executed identity-probe result.
Synthetic host-factory tests do not establish guest FrozenArray conformance.

`scripts/check-browser-identity-runtime.ts` is a separate bounded manual gate. It
uses an explicitly selected native factory, three synthetic evaluations, exact
value/alias checks, array identity across getters/evaluations, reflection,
mutation attempts and owner cleanup. All checks must pass for `verified: true`.
It is intentionally outside `native-tests.json` and performs no website request,
login, key creation or real-credential access.

The parent requested the actual local identity probe, but the permission review
**denied execution pending explicit user approval**. No SDK was imported by that
denied attempt and no actual identity result is claimed. Do not retry it, switch
adapters/SDKs or substitute another execution path without that approval. After
approval, a bounded invocation is:

```bash
timeout --signal=TERM --kill-after=2s 25s node dist/scripts/check-browser-identity-runtime.js --runtime-root /absolute/approved/sdk --adapter legacy --authorize-synthetic-identity-runtime
```

The authorization flag is only an accidental-execution guard. Existing passkey
runtime failures remain separately recorded in `PASSKEYS.md`; this identity
integration neither resolves nor reclassifies those failures.

## Validation and research

The three new suites add **111 passing cases**: 79 pure profile/header, 12 native
document/page-binding and 20 managed-session tests. Ten named manifest-listed
files produce **328 passes in each working/isolated tree**. Types/builds, strict
changed-test typing, scoped Biome and touched-production format checks pass.
Both manifests contain 426 entries; the full manifest was not executed.
Parent evidence is `node_modules/.cache/native-validation/browser-identity-final-*`.
Worker and first-pass results remain in `browser-identity/`, `session-identity/`
and `browser-identity-parent-*` under that same directory, including initial
formatting findings and a corrected form-fixture expectation.

The browser-only research handoff is
`node_modules/.cache/native-validation/browser-research/fingerprint-identity/REPORT.md`.
Seven attempts across six URLs yielded three reviewed primary document bodies:
WHATWG navigator/language guidance and Cloudflare support/challenge-header docs.
Three CSSOM documents returned HTTP 200 but exceeded native loader limits; they
were not reviewed as successful source access. Original raw outcomes, timestamps,
hashes and the sandbox failure are retained. No live website was retested after
these identity changes, and earlier research measurements remain historical.
