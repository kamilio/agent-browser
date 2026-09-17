# Empty SVG color and Target source-asset validation — September 17, 2026

## Outcome

The native renderer no longer aborts on an empty SVG `color` presentation
attribute. The change omits that declaration after the existing length check
and work charge; it preserves inherited/author color and does not sanitize the
source document. Nonempty unsupported colors and malformed geometry still fail.

An isolated candidate based on `3a1192d4da40877cbec72b3d01259ce6119ea03b`
passes **872 tests, zero failures, across 13 selected native files**, including
17 new cases. Build, selected type checking, formatter and linter pass. The same
17 new cases against the original runtime give **five passes and twelve
failures**, confirming the regression coverage. Native children/groups close
and private HOME/TMP remain empty.

All 1,619 source and 2,400 compiled pins match the qualified runtime. Its
1,013-entry canonical manifest retains 22 paths absent from the committed tree
but present in the dirty workspace. This is not full-manifest or dirty-worktree
qualification. The 42 pre-existing modified tracked files and 697 untracked
files are preserved rather than included in this fix.

## Exact source and native request

The full, unchanged Target homepage response is reused from its earlier
**12:13:57.980 UTC** capture: 393,778 HTML bytes, SHA256
`73ed579e75211dce557de5bf02344c1b2e86677b618be8bb753465369203809b`.
Its retained enforced CSP is `frame-ancestors 'self' https://*.target.com;`.
The parser confirms the original active classic `_buildManifest.js` tag with
anonymous CORS outside inert/template/noscript content. The framing-only policy
exception from the preceding commit applies; general CSP is not bypassed.

The full native navigation previously failed at SVG node 207, one of 60 SVG
nodes among 1,450 parsed nodes. With the empty-color fix, saved-response
navigation and final layout complete. The homepage itself is one mock response
from the captured original bytes, **not a fresh homepage GET**.

At **12:59:00.768 UTC**, one actual native asset GET returns HTTP 200 and a CORS
response allowing `https://www.target.com`. The gzip response contains 1,632
encoded bytes and **4,760 decoded bytes**, SHA256
`961a00e88e297a2693444dbb6a7d2fb6e983004e24cc95dd7d8eb65855d4a87a`.
There are no redirects or retries. The bytes are captured, **never executed**.
The workflow passes, the transport reports zero active requests, and the
session, document, request queue, child and process group close normally.

The request uses the BrowserSession-provided in-memory cookie jar with resource
credentials omitted. No real credentials, vaults, device, TTY, website JavaScript
or SDK are accessed. There is no alternate browser or challenge-solving path.
The scope limits this workflow to the exact source-declared asset and does not
load other scripts or resources. `contentAvailable` in its private result means
an admitted asset body, not complete or meaningful rendered storefront content.

## Preserved attempts

1. The earlier framing-CSP offline proof fetched a synthetic 57-byte asset but
   failed final SVG layout. It made zero wire requests; its original report and
   sealed evidence are unchanged.
2. The initial SVG harness passes its full-source offline proof, then fails its
   live attempt before any wire request: `Cookie context requires a jar and
   valid credentials mode`. The wrapper omitted the session-provided jar when
   constructing the native transport. This is a harness failure, not a CDN or
   website failure. Its spent allowance and failure remain intact.
3. A separate corrected harness constructs its transport using that provided
   jar, passes a fresh zero-wire offline proof, and performs the single successful
   asset GET above. Both live allowances remain spent; neither is rerun.

Runtime/source/harness pins and evidence are checked before publication. The
private evidence directories are
`node_modules/.cache/native-validation/svg-empty-color-september17/`,
`node_modules/.cache/native-validation/svg-empty-color-asset-september17/`, and
`node_modules/.cache/native-validation/svg-empty-color-asset-september17-v2/`.

## Remaining work

Source-asset retrieval does not prove script evaluation, dynamic-page content,
search/shopping actions or challenge handling. Actual SafeJS scheduling and
scripted-site gates remain open, as do general CSP support, real credentials,
passkeys/devices and unfinished research. The historical 100-entry content
verdicts remain 33 useful and 67 other outcomes; this is not a new corpus run.
The overall browser goal stays active.
