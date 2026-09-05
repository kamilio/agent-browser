# Native fingerprint and challenge investigation

Reviewed September 5, 2026. This is an implementation investigation, not a live
fingerprint measurement or evidence of defeating a production challenge.
The four topic-research agents used only this repository's native browser.
The parent separately consulted primary upstream documentation for the design
comparison below; those documentation lookups are not native browsing acceptance.

## Reference tools and architectural fit

- Camoufox modifies Firefox and coordinates page-visible properties with network
  headers, fonts, screen/window dimensions and other surfaces. Its README also
  discusses fingerprint inconsistencies and warns that it is under development. The useful lesson
  here is cross-surface consistency, not copying a User-Agent string or assuming
  a marketing claim proves present-day challenge success. Importing its engine
  would violate this repository's native-independence requirement. [1]
- FlareSolverr is a likely match for the challenge-solving tool mentioned by the
  user. Its documented architecture uses Selenium/undetected-chromedriver and
  Chrome, returning resulting HTML/cookies through a proxy. It is not a native
  TypeScript challenge solver that can be added without substituting engines. [2]
- Scrapling's stealth-fetching documentation exposes Cloudflare-related options
  and a bundled Chromium executable. It is another reference design, not an
  approved runtime dependency or evidence of a better native engine. No blanket
  ranking of which tool is currently most effective was established. [3]
- Cloudflare documents JavaScript-dependent challenges and explicitly excludes
  automated browsers/frameworks from supported production challenge solving.
  Its supported testing path includes Turnstile test keys. These are documented
  support boundaries, not proof that every observed denial has one cause. [4]

## Actual native gaps

The local inspection in
`node_modules/.cache/native-validation/browser-research/challenge-diagnostics/REPORT.md`
records source paths and distinguishes implemented rendering from page APIs:

| Surface | Observed implementation boundary | Next useful work |
| --- | --- | --- |
| Page identity | Existing PageBindings has no coordinated navigator identity/profile | Implement a bounded truthful native identity shared with request metadata |
| Language/locale | No demonstrated shared navigator, request-language and locale profile | Use one explicit session configuration rather than independent overrides |
| Screen/window | Native viewport/layout state exists; complete Screen/outer-window behavior is absent | Derive implemented values from the actual viewport and expose missing features honestly |
| Canvas/WebGL/audio | Native screenshot rasterization is not a guest Canvas/WebGL/audio implementation | Add actual API behavior before claiming GPU/audio fingerprint compatibility |
| TLS/HTTP | Node HTTP(S) transport with certificate verification, not a measured Firefox/Chromium handshake | Preserve verification; measure authorized transport behavior separately |
| Challenge execution | Research profiles disable website scripts | Native static extraction cannot execute a JavaScript challenge |

Randomizing each getter independently would make consistency worse and complicate
reproducibility. Copying Chrome branding while retaining missing APIs and a Node
transport would not establish browser equivalence. Neither an IP reputation
diagnosis nor a fingerprint-specific cause follows from a generic 403.

## Implemented diagnostic foundation

`src/browser-challenges.ts` classifies an explicit `cf-mitigated: challenge`
response as confirmed; bounded HTML markers produce only possible barriers.
Login/access-denied states are distinguished from ordinary HTTP failures.
An inconclusive classifier result does not mean successful content access.
The research runner records pre-parser response metadata so an SVG/CSS failure
does not erase the evidence needed to distinguish these cases.

No automatic challenge retries, third-party solver connection, clearance-cookie
import, new browser engine or production challenge-bypass claim is added.
Future authorized workflows should preserve a trusted user-handoff boundary and
test the actual native runtime separately. Improving the native parser and
diagnostics is useful now without pretending it solves all challenges.

## Primary sources

[1]: https://github.com/daijro/camoufox
[2]: https://github.com/FlareSolverr/FlareSolverr
[3]: https://github.com/D4Vinci/Scrapling/blob/main/docs/fetching/stealthy.md
[4]: https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/
