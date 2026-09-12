# Native external-stylesheet Content Security Policy

This change addresses the ordinary-link stylesheet CSP bypass retained in
`IMAGE-CONTENT-SECURITY-POLICY.md`. It implements bounded **HTTP(S) URL-source
authorization for supported external stylesheet requests**, not browser-wide CSP.
The old failing captures remain unchanged. A native test pass is not website,
SafeJS, credential-provider, passkey-device, socket, or terminal acceptance.

## Supported boundary

- `ContentSecurityPolicy(documentUrl, headers, "style")` selects the first present
  directive in `style-src-elem`, `style-src`, `default-src` order. Empty and
  unsupported-token-only directives remain restrictive. Multiple enforcing
  policies intersect; source expressions within one directive are alternatives.
- Image and stylesheet matching share the bounded source compiler. The existing
  `ImageContentSecurityPolicy` API remains an image-specific wrapper, with its
  original matching tests retained. Style directives do not grant image access.
- Ordinary links, crossorigin/integrity links, and imports from external sheets
  check the protected document's policy before dispatch and before CSS use. The
  policy origin is not replaced by a base element or an imported stylesheet URL.
- Both native stylesheet transports use the existing manual-redirect helper.
  Every hop is checked before transport; returned responses are checked again.
  A redirect skips source-path comparison only, not scheme, host, port or policy
  intersection. The helper captures its checker for the request lifetime and
  rechecks abortion immediately after synchronous checker callbacks.
- CORS, response readability, SRI, MIME, mixed content, network/origin admission,
  resource accounting, cancellation and cleanup remain independent checks.
  Policy denial is recorded as `stylesheet-policy-denied`; existing unresolved
  external-sheet diagnostics remain visible rather than being suppressed.
- Images and styles share the existing document metadata observer. Observed meta
  CSP remains unsupported and latched fail-closed, even after synchronous removal
  or mutation. No extra observer slot or increased handler ceiling is required.

The URL-source implementation retains the image matcher's limits: 32,768 policy
code units, 64 policy tokens/header entries, 1,024 directives, 4,096 source
expressions, 4,096 URL code units before/after normalization, and 262,144 local
matching-work units. HTTP(S)-only and the documented literal-IP source limitation
remain unchanged. Report-only headers do not impose enforcing policies.

## Explicit limitations

**This is not complete untrusted-page CSP isolation.** Inline style blocks and
style attributes do not have complete CSP authorization. Existing inline CSS
behavior is not certified by these external-resource tests. To avoid opening a
new request path through an unauthorized inline parent, imports originating in
an inline style block remain fail-closed whenever any enforcing header exists.
Without such a header, existing inline import behavior is preserved; observed
meta policy still independently denies image/style requests.

External stylesheet nonce grants are not implemented: a nonce-only directive
does not fall through to a permissive fallback. A separately authorized URL
alternative may still match. The captured external-style pre/post algorithms do
not use the generic integrity-metadata grant helper; an SRI attribute is not
treated as CSP permission. Inline nonce/hash semantics, HTML meta activation
timing, policy-container inheritance and full HTML/CSS/Fetch integration remain
open. Dedicated current stylesheet paths model ordinary, non-prefetch/prerender
style requests; the matcher is not a generic request-destination classifier.

Opaque caller-owned fetch callbacks can already have performed hidden I/O when
their returned URL is rejected. The stronger before-every-hop guarantee belongs
to this native session's own transport, not arbitrary custom fetch code. No
alternate browser, SafeJS execution, credential access, challenge bypass, source
rewriting, fabricated missing resource, runtime dependency, or cap increase is
introduced.

## Primary-source review

The earlier native-captured W3C CSP response at
`native-csp-source-september12/response-1.body` remains unchanged: captured
September 12, 2026 at 18:53:36.513 UTC, 1,010,768 bytes, SHA-256
`a28120328f5265dbf2028d8a7272bece363016915b3d6e53641643c270ac65b2`.
There was no new HTTP retrieval for this review.

Native15869/`04bc6968a7428dc8bfe1d2c361eb8e80ed53fd8c` extracted 14 complete sections
at 21:10:08.292–21:10:08.640 UTC using bounded native tree/heading indexing. The
46,178-byte extract contains 15,667 semantic-text bytes, 28,732 document nodes,
32,769 selection debits, no selected-section gaps and 64 unfollowed references.
Its SHA-256 is `15aefb51cef6e7ec2c5c6e603095e01b378cb242920480a06b95847cf36bf3b4`.
Exact sections cover style pre/post checks, request qualification, directive
fallback, nonce matching, and URL-source matching. CSS/Fetch's construction of
request metadata remains an external dependency, not established by a filename.

Private review:
`node_modules/.cache/native-validation/image-csp-work-september12/style-source-review/`.
The first attempt failed in its synthetic header adapter before parsing; the
second retained one section before hitting the unchanged query-work limit.
Both remain preserved. A separately scoped walk/index extraction succeeded
without raising limits or resetting query owners. Main's read-only verification
at 21:15:44.008 UTC checks original source byte/code-unit spans, text hashes,
1,192 source/2,004 compiled files, cleanup and 18 receipts. Receipt SHA-256:
`acf7510b939c19ffea6611248d7daf6f216c399b5086ec842e6a39a4a753f372`.

## Validation status

Private work: `node_modules/.cache/native-validation/stylesheet-csp-work-september12/`.
The committed15869 baseline passes strict checking but fails 12 of the 21 new
canonical fixtures: nine denied URL policies still fetch ordinary CSS, an allowed
CORS sheet is overblocked, and two manual-redirect expectations are absent.
The memory transport deliberately does not perform hidden redirects; those last
two failures are not measured requests to an external host.

Candidate fixed00 preserves 621 passes/four failures: one real malformed-URL
regression and three obsolete CSP-presence/diagnostic assertions. The original
absolute-URL boundary is restored without changing its existing test. Three
legacy assertions now reflect header authorization and accurate denial codes;
none is removed or skipped. Fixed01 preserves a further exact-diagnostic fixture
failure, then fixed02 and fixed03 each pass 657 cases across 11 suites. The worker
adds 24 passing lifecycle cases; Main's fixed04 passes 681 cases across 12 suites.
The first release run retains 15,944 passes, two failures and two unchanged
exclusions. Its two failures are additional legacy import-loading expectations
of blanket header denial, not new production failures. Those cases now assert
the exact admitted root/import request modes and retained meta denial; five
legacy cases in total are updated, none removed or skipped. The existing
import-loading suite is also added to Main's focused scope. Final release round01 passes **15,946 cases, zero failures and two unchanged
exclusions**, with build, strict TypeScript, formatting and source stability all
passing. It runs 2026-09-12T21:25:49.988Z–2026-09-12T21:29:36.666Z; the independent
tracked-input audit completes 2026-09-12T21:29:59.165Z. Main's final focused
run passes 734 cases across 13 suites; the three new suites add 77 cases.

This release gate selects **306 suites from the clean 684-entry native manifest**;
the other 378 manifest entries are not executed here. Strict checking selects
305 roots. The snapshot contains 1,196 source and 2,008 compiled files, with
1,183 unchanged tracked inputs, 12 owned source/test files and the manifest.
The two pre-existing exclusions remain the total host-object-ceiling case and
unsupported-display/advisory-media case; neither is claimed passing.

Exact private release: `node_modules/.cache/native-validation/native-stylesheet-csp-september12-round01/`.
Source ledger SHA-256: `3e0f96ccd77dc7a2b3331b7df6da5b7e048aa45df2066775939dce91767bcfb5`.
Compiled ledger: `e39e030f44e6e6786fc01f4da4bd2f4f9c76cf719c2c2225faaf831e3c10ab7a`.
Native results: `82e22dda9393dcdbb6573a8a59bd10d684be977f796725d9263fab9120479f5e`.
Audit: `0fd87c51fba6215dc07325456e346b3116207f5efe06ac26188b28963a5679df`.
The actual committed-input proof is generated after the atomic commit; live
website, inline-CSP and device/runtime gates are not inferred from these tests.

`IANA-IMAGE-CSP-NATIVE-CHECK.md` is an independent fresh run on the earlier
committed image-CSP runtime, not this stylesheet candidate. It advances from
image policy denial to unsupported SVG decoding after three HTTP 200 responses,
with no committed page, click or layout acceptance. No working-website or new
attempted-host count is inferred from this change.
