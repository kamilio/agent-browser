# Script CSP policy foundation

`createScriptCspPolicy(documentUrl, headers, limits?)` parses a bounded,
conservative subset of enforced Content Security Policy into an immutable
script-element/base capability. This module is not yet connected to the live
loader or session resource ports. The existing execution refusal remains intact.

Supported behavior includes policy intersection, first duplicate directive
precedence, script-src-elem/script-src/default-src fallback, exact nonces,
unsafe-inline suppression, and strict-dynamic's non-parser **external** script
allowance. Dynamically inserted inline scripts do not gain permission merely
from strict-dynamic: they still need an applicable nonce or inline permission.

`allowsScript` requires trusted native metadata: kind, nonce, parserInserted and
nonceable. Never accept insertion provenance or nonceability from guest input.
`allowsBase` independently checks the supported empty/none/self base-uri subset.
Report-only headers do not enforce restrictions; malformed or excessive enforced
input denies admission without invoking property getters.

Hashes, script URL sources, eval/wasm keywords and other security directives are
currently unsupported and fail closed. This is not full Zoom CSP support. Real
integration still needs document ownership, nonceability/hiding, base selection,
meta-policy lifecycle and all resource-destination enforcement; do not strip or
ignore a publisher's policy to activate this evaluator.
