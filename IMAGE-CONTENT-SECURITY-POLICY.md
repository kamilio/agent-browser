# Native image Content Security Policy

## Implemented image behavior

Image loading no longer treats the presence of an enforcing CSP header as an
automatic image denial. `ImageContentSecurityPolicy` compiles immutable header
policies; the document image owner and native session enforce them at selection,
before each manual redirect hop, and against the returned URL. A denied redirect
target is rejected before the native transport callback receives it.

Each enforcing header value is parsed into its comma-separated policy list.
Policies intersect; alternatives within one source list do not. The first
duplicate directive wins. Images use `img-src`, then `default-src` only when
`img-src` is absent. An explicit empty directive denies; non-image directives do
not alone restrict images; report-only headers are not enforced as image policy.

The matcher supports self, network wildcard and scheme sources, domain host
sources, dotted subdomain wildcards, ports and source paths. Scheme upgrades,
default ports and self-origin comparisons follow the captured CSP algorithms.
Path segments are compared after percent decoding; paths are skipped after a
redirect, while scheme/host/port checks remain. A URL-source decision does not
replace native origin/private-address, mixed-content, byte, MIME, decode,
pacing, ownership or cancellation checks.

`DocumentImageOptions.contentSecurityPolicy` accepts enforcing header values for
direct image-owner use. Configuration is copied and cannot be replaced with a
weaker policy on the same document. The legacy `blockedByCsp` option remains a
conservative override. Direct `loadBrowserDocument` use passes response policies
to the same owner. Generic page-fetch and the existing policy-aware stylesheet
fetch branches retain their previous restrictions; they do not use the new
image-only matcher.

## Important limitations

**This is not complete browser-wide CSP enforcement.**

- The native image transport supports HTTP(S), not arbitrary CSP URL schemes.
  Literal IP host sources remain nonmatching because the captured host algorithm
  and its explanatory IP note leave an unresolved compatibility question.
  Same-origin self handling is separate; network address restrictions still apply.
- Meta-delivered image CSP remains unsupported and conservatively blocked.
  The document owner observes metadata synchronously and retains that restriction
  after later edits/removal. This prevents a newly supported header path from
  silently dropping an observed meta restriction; it is not an implementation
  of HTML meta placement, activation timing or nonce/hash processing.
- **Ordinary stylesheet-link CSP is still not enforced correctly.** A retained
  acceptance fixture under `style-src 'none'` fetches and installs its plain
  stylesheet. An exact native15601 control proves this predates the image change.
  The existing restricted import/CORS stylesheet path does not cover ordinary
  links. Full external/inline style enforcement remains an explicit security gate.
- An opaque caller-supplied `ImageFetch` may already have performed I/O before
  returning. Its final URL can be rejected, but that is not proof of before-I/O
  enforcement. The native BrowserSession manual-redirect path supplies that
  stronger boundary. Custom response metadata is not an independent wire audit.
- SVG decoding, other page layout gaps, scripts/SafeJS, providers/passkey devices,
  live website flows and CAPTCHA handling are not made complete by this feature.

## Bounds and lifetime

Header parsing is bounded to 32,768 aggregate code units, 64 policy-list entries,
1,024 directives and 4,096 source expressions. URLs have a 4,096-code-unit bound
before/after normalization; matching has a 262,144-unit local work bound. Invalid
API inputs or exhausted bounds throw; exceptions never become an allow decision.

Metadata observation has a separate two-million-unit bound and fails closed.
An exact pragma-length check precedes case conversion, avoiding repeated scans
of arbitrary long nonmatching attribute values. CSP observation shares the first
image owner's existing native change subscription; the 32-handler ceiling is
not raised. Document close releases the policy and registered observation.

## Validation and retained failures

Three canonical/owner/matcher suites add 256 cases; the scoped lifecycle suite
adds 12, for **268 new image-feature cases**. The original 17-case image policy
fixture produced 8 passes/9 expected failures against clean native15601.
The immutable matcher independently passes 229 cases. Final focused validation
passes **661/661 in ten actual suites**, with strict TypeScript and formatting,
September12 **20:53:03.601–20:53:12.293 UTC**.

The worker's original lifecycle run is preserved as **12/13**, not relabeled as
fully passing. Its stronger plain-stylesheet acceptance case remains in the
private `pending-plain-stylesheet-acceptance.test.ts` and original round03 snapshot.
The 12 image/lifecycle cases enter this feature's root suite; no previously
committed test is removed or newly skipped. The old-runtime stylesheet control
runs once at **20:51:56.270–20:51:56.325 UTC**, with zero HTTP; read-only verification
at **20:55:14.960 UTC** confirms the prior gap and exact retained fixture identity.

Earlier Main failures remain: fixed00 inherited the production test exclusion
and strict checking correctly found no inputs; fixed01 passed647 cases but exposed
an extra change-subscription slot. The strict include configuration was corrected,
then notification sharing restored the original ceiling without weakening that
existing test. Worker type/format/oracle failures remain in their original lanes.

The complete isolated gate, `native-image-csp-september12-round00`, passes
**15,869 tests, 0 failures, 2 unchanged exclusions**, September12
**20:54:07.560–20:57:52.980 UTC**. It selects303 suites from the explicit681-entry
clean manifest and strictly checks302 roots. Production build, strict TypeScript,
scoped formatting and before/after source stability all pass. The snapshot has
1,192 source files,2,004 compiled files and1,182 unchanged tracked inputs.
Nine owned source/test inputs plus the manifest bind the release to its commit.

Source ledger SHA256:
`de97bc2f4bb4abd07042a18f56971052c81a423d062500f519f6c0e4588e7998`.
Compiled ledger SHA256:
`93654a56016cb0ad6f514802609ea1d0c6c57ef15d808045a10785628f5b89d5`.
`AUDIT.json`, the twenty-entry receipt ledger and subsequent
`COMMIT-VERIFICATION.json` retain exact scope and identity. The two exclusions
remain the existing focus host-object ceiling and media fallback cases, not new
CSP skips. Tests use pinned Node22.22.0, the existing compiler/Vitest/Biome,
kernel socket denial and private empty HOME/TMPDIR. This is not a live website,
complete stylesheet/meta CSP, device or SafeJS acceptance result.

## Evidence and follow-up

Primary source evidence is the native-browser capture in `CSP-NATIVE-SOURCE.md`
and the ten complete matching/fallback sections in `CSP-MATCHING-SOURCE.md`.
External HTML/Fetch details and full meta/style processing remain open.
The new implementation/test evidence is under
`node_modules/.cache/native-validation/image-csp-work-september12/`.
`STYLE-SCOPE-DECISION.md` and the original worker counterexample retain the
stylesheet gap rather than obscuring it with the image test count.

The earlier IANA and HN failures are historical evidence, not rerun successes.
Any post-change native website test needs a distinct bounded run and must retain
the next real failure. No browser dependency, credential access, challenge bypass,
blanket policy removal or resource-cap increase is part of this change.
