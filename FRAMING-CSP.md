# Framing-only CSP in top-level tabs

The native tab loader no longer treats every enforced response CSP header as an
unsupported script policy. A bounded classifier recognizes empty policies and
policies containing only `frame-ancestors`, `report-uri`, and `report-to` when the
host explicitly identifies the document as top-level. This addresses the
framing-only header captured from Target on September 17, 2026.

## Explicit context

`BrowserSession` supplies `DocumentLoaderContext.topLevelDocument: true` in its
frozen loader context. These sessions own top-level tabs. The owned-process
child and three committed script diagnostics pass this marker to `ScriptLoader`.
Standalone hosts can supply the loader's optional `topLevelDocument` boolean;
its default is unknown, not an assumption that every document is top-level.

Without literal `true`, any enforced response-header presence remains refused.
An explicit false value also refuses it. Invalid loader-option types are rejected.
Future embedded documents must not inherit a parent's top-level marker. This
change does not implement frame navigation or ancestor-chain enforcement.

## Conservative classification

The classifier reads every own enforced-header alias, case-insensitively, and
checks every comma-separated policy and semicolon-separated directive. Directive
values are opaque; the classifier does not match origins, nonce/hash sources,
framing ancestors or reporting endpoints. Reporting does not create requests.

Any other directive retains the unsupported refusal, including `script-src`,
`script-src-elem`, `script-src-attr`, `default-src`, `connect-src`, `sandbox`,
`base-uri`, `form-action`, Trusted Types and unknown names. Even permissive
source policies are not treated as fully supported. A second restrictive policy
cannot be hidden behind a framing-only first value or differently cased header.
Report-only response headers remain non-enforcing, as before. Meta-CSP keeps the
existing conservative refusal, including framing-only meta declarations.

The classifier bounds enforced fields, values and policy instances at 64 each,
combined serialized text at 32,768 UTF-16 units, and directive tokens at 1,024.
Empty split tokens count toward work limits. It validates all input before
splitting, trims ASCII policy whitespace with linear scans, and refuses malformed,
inherited/non-plain header records, accessors, sparse arrays, controls and excess
work rather than interpreting a permissive prefix.

## Resource and runtime boundaries

Both script-fetch ports and the document-fetch port use the same response-CSP
classification. The legacy script port now also refuses unsupported response
policies before requesting a resource, rather than relying only on its caller.
Existing CORS, integrity, mixed-content, count/size, cancellation and ownership
checks remain in their respective paths; no new fallback is added. This does not
claim to fix all pre-existing legacy-fetch differences documented elsewhere.

The feature does not enable automatic scripts by default, execute SafeJS,
implement general CSP source enforcement, solve a challenge or authorize access.
Mock-runner/native tests, source-asset retrieval and actual interpreted website
execution remain distinct acceptance checks.
