# Truthful native identity defaults

## Headless display values

The native page now exposes `devicePixelRatio`, `outerWidth` and `outerHeight`
on its Window host capability and in its declared scalar globals. The internal
frozen `nativeHeadlessDisplay` model contains exactly three values:

| Value | Native default | Meaning |
| --- | ---: | --- |
| `devicePixelRatio` | 1 | No attached output device; CSSOM's headless fallback, not a measured monitor ratio |
| `outerWidth` | 0 | No native client window; not the configured layout viewport width |
| `outerHeight` | 0 | No native client window; not the configured layout viewport height |

The source contracts are preserved in `CSSOM-IDENTITY-2026-09-05.md`. An external
terminal or web frontend is not a native page client-window object, and these
values make no claim about that frontend's window or the user's display. There
is no hardware/environment probe, device-emulation option, new runtime dependency
or configurable output device. Screen, VisualViewport, page zoom and full
display-device modeling remain separate work.

CSS resolution matching and `BrowserSession.viewport().deviceScaleFactor` now
use the same frozen DPR rather than independent literal ones. Their existing
values do not change. Window inner dimensions remain driven by the independent
logical CSS viewport; resizing it updates width/height/orientation without
inventing a client window or changing fixed DPR. Existing screenshot/PNG scale
metadata remains its own explicitly bounded artifact contract, not a physical
display measurement or an output-device attachment.

Window getters use the existing binding/document/lifecycle checks and reject
after closure. Global primitives are copied public values, not revocable object
capabilities: retained numbers survive closure, and replacing an entry in the
host globals dictionary does not mutate the frozen model or Window getters.
Getter-only native host descriptors do **not** establish full WebIDL replaceable
property semantics, globalThis/Window identity or actual guest mutation behavior.
The separately denied SafeJS identity probe remains unexecuted; no actual guest
or device acceptance is claimed by these synthetic bindings.

September 5, 2026 validation: **44 new cases pass in each tree**. Seven named
suites produce **253 passes plus three baseline failures** in the isolated tree
and **258 passes plus four baseline failures** in the working tree. Project
types/builds, strict touched-test types, scoped Biome and touched production/test
formatting pass. The candidate manifest has 439 entries; the working manifest has
441 because two pending parent-RP tests remain excluded from this commit and
matrix. No full manifest, auth, SDK, live, socket, TTY or real-device probe ran.

The unchanged failures were reproduced before applying this feature: clean HEAD
has two cleanup assertions assuming the first host object is performance, plus
an exact-global-list expectation missing the pre-existing navigator. A separate
HEAD snapshot with preserved base64/onload test/source overlays reproduces those
three plus the working-only non-callable onload-object failure. The global-list
test adds only the three newly introduced names; unrelated missing-navigator
and cleanup/onload expectations remain unfixed and visible. These are not green
full-suite results or evidence that the failed assertions are validated.

Evidence is retained under `node_modules/.cache/native-validation/` with prefixes
`headless-display-clean-baseline-tests`, `headless-display-pending-baseline-tests`
and `headless-display-final-`. `headless-display-final-validation.json` records
`allTestsPassed: false`, actual test exit codes and exact unchanged failure names.
The clean candidate path is in `/tmp/headless-display-integrated-path` and the
pending-overlay baseline in `/tmp/headless-display-pending-baseline-path`.
Worker initial/final checks remain in `headless-display-tests/`; independent
source review and its limits remain in `headless-display-review/REPORT.md`.

## Geometry source followup

`CSSOM-IDENTITY-2026-09-05.md` records a new native-only successful CSSOM View
read at September 5, 2026, **06:10:29.253 UTC**. The already committed reader
loaded the same 1,196,447-byte body previously rejected by an older loader;
the old failure and its measurements remain unchanged. One request and bounded
live/offline native scopes yielded the actual DPR, Screen, viewport and window
dimension definitions, not measured device identity or challenge acceptance.

Those contracts distinguish no-output-device DPR 1, absent-client-window outer
dimensions 0, layout/visual viewports and privacy-exposed Screen areas. They do
not justify presenting the layout viewport as a physical monitor measurement.
The document defines future implementation and validation requirements; no new
geometry API is enabled here. Both denied identity probes remain unexecuted
pending explicit approval. The parent independently verified 23 evidence
artifacts and the 1,584-entry fixed-build inventory; repeated inventory checks
are neither unique artifacts nor native/guest test counts.

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

### Separate native HTTP wire gate: not executed

On September 5, 2026, a six-request loopback-only identity probe was prepared and
statically reviewed. It would inspect actual receiver-observed UA/language
headers for navigation, a same-origin redirect and a supported host-fetch
language override, then verify owned-handle cleanup. No guest navigator, SDK or
external site belongs to that scope. Syntax and 300 pinned compiled-input hashes
are preparation evidence only; they do not establish any on-wire behavior.

The execution permission review **denied this new real socket/listener gate
pending explicit user authorization**. The command did not run and no attempt
directory was created. The parent asked the user about that exact bounded scope;
do not retry, change runners/attempt numbers or infer consent from the broader
fingerprinting request. The separately accepted reader CLI service probe does
not authorize this probe, and the earlier actual SafeJS identity denial remains
independently in force.

The prepared plan/harness remain under
`node_modules/.cache/native-validation/native-identity-wire/`; the denial is
recorded in `node_modules/.cache/native-validation/native-identity-wire-EXECUTION-DENIED.md`.
Explicit UA equals the truthful default in the proposed fixture, so even a future
pass could not distinguish default injection from preservation of that identical
UA. A differing language value would test language override preservation only.

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
