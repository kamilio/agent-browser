# Top-level framing-only CSP compatibility — September 17, 2026

## Observed problem and fix

The previous native Target homepage capture retained exactly
`frame-ancestors 'self' https://*.target.com;` as its enforced response policy.
The loader nevertheless refused all classic scripts because it treated any
enforced CSP header as unsupported. The preserved source is not a new homepage
request in this checkpoint.

`BrowserSession` now marks its frozen top-level tab loader context explicitly.
`ScriptLoader` only recognizes an empty or framing/reporting-only response policy
when that context is supplied as literal true. The native child and three owned
diagnostics pass the marker. Unknown/false contexts, meta-CSP and all other
directives remain refused; the change does not implement embedded documents or
their ancestor-chain enforcement.

The new bounded classifier considers every own case-insensitive header alias,
comma-separated policy and semicolon-separated directive. It permits only
`frame-ancestors`, `report-uri` and `report-to`, without interpreting their values
or contacting report endpoints. Limits are 64 fields/values/policies, 32,768
combined units and 1,024 directive tokens. Malformed, inherited/non-plain,
accessor-backed and oversized evidence is refused, never partially interpreted.
Whitespace trimming uses linear edge scans.

Session response-CSP checks share the classifier across page-fetch and both
script ports. The legacy script port additionally gains its missing direct
unsupported-policy check; it no longer relies solely on ScriptLoader to block
such a request. Existing CORS/SRI, mixed-content, budget and lifecycle checks
remain in their original paths. No dependency or runtime default changes.

## Qualification and regression control

The final isolated release02 is clean baseline `2f6a612` plus nine explicit
source/test overlays. It passes **845 tests, zero failures, across 20 selected
native files**, including **116 new cases**: 85 classifier cases and 31 loader/
session integration cases. Build, selected types, scoped formatting and lint pass.

The same 31 integration cases against the original runtime produce **5 passes
and 26 failures**, including missing top-level context, denied framing-only
script loads, unsupported-policy fetch discrepancies and invalid-context checks.
This is a regression control, not a live website or SDK result.

The first candidate also passed 845 native tests, but selected type checking
found an intentional-malformed-input cast needing `unknown`, and lint found two
test-only global number constants. Those tests were corrected; release02 reruns
the complete selected gate. Original failing qualification artifacts remain.

All 1,618 source and 2,400 compiled pins match the final candidate. The canonical
1,012-entry test manifest retains 22 paths absent from the isolated committed
tree but present in the dirty workspace. Existing uncommitted work is preserved.
This is not full-suite, dirty-runtime or actual-SafeJS qualification. Native,
regression and quality processes close; private native HOME/TMP remain empty.

## Full-source asset proof and newly identified blocker

The guarded offline proof reconstructs the complete, unchanged 393,778-byte
Target response captured at 12:13:57.980 UTC. The native parser confirms the
literal application `_buildManifest.js` tag outside inert/template/noscript
regions, with `crossorigin="anonymous"`, no integrity declaration, no meta-CSP
and no detected access barrier. The new top-level context allows the policy
script port to retrieve a synthetic 57-byte CORS response. Nothing is executed.

The full navigation nevertheless **fails** during later native document layout
with `Unsupported SVG presentation attribute`. Capture-level booleans are not
overall success: the proof's `passed` and `workflowPassed` remain false. It makes
two mock requests and **zero network requests**; no live allowance is consumed
and no asset GET is authorized by this failed proof. All resources close.

A separate kernel/JavaScript-denied native diagnostic walks all 1,450 parsed
nodes, including 60 SVG nodes. Exactly one presentation adapter failure is
observed: native node 207, an SVG with `viewBox="0 0 24 24"`, `width="24"` and
an empty `color=""` attribute. This is a concrete next renderer fix, not a reason
to strip the original document or relax the proof. Malformed geometry remains
a separate existing rejection. No website or SDK request occurs in diagnosis.

The failed proof is retained in
`node_modules/.cache/native-validation/framing-csp-asset-september17/` and the
diagnostic in the parent evidence lane's `svg-diagnosis/` directory.

## Remaining acceptance

General CSP source enforcement, actual interpreted scripts and SafeJS callback
scheduling remain open. A framing-only exception is not proof of a hydrated
Target storefront, search/shopping interaction, complete content, challenge
handling, credential/passkey/device support or a new 100-site success rate.
The overall browser goal remains active.

Implementation details: `FRAMING-CSP.md`. Private evidence:
`node_modules/.cache/native-validation/framing-csp-september17/`.
