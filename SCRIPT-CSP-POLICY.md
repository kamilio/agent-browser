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
integration still needs trusted parser nonceability, loader admission and all
resource-destination enforcement; do not strip or ignore a publisher's policy
to activate this evaluator.

## Document ownership and nonce hiding

`bindDocumentScriptCsp(tree, headers, limits?)` binds immutable response policy
to one native document. Verified dynamic script nodes can be checked through
`allowsScript(id)`. Parser, unknown, inert, cloned and detached eligibility is
refused until trusted creation and nonceability metadata is available. Meta
policies, missed mutations, exhausted work and close cause sticky refusal.

Bound documents hide connected HTML nonce attributes before mutation observers
run. Generic node/Attr reads, selectors, serialization and mutation old values
cannot expose the stored nonce; script nonce IDL still uses the private native
value. Cloning preserves hidden state without granting script eligibility.
Stored values remain charged to native text limits. Unbound behavior and prior
immutable snapshots remain unchanged. Base selection respects the bound policy,
including cache invalidation when policy state changes.

The parent integration passes 1148 tests in 34 explicitly selected native files,
plus production build, selected-test typecheck, formatting and lint. Earlier
missing-fixture and test-type failures remain preserved; the latter required an
explicit response type in a new cookie-redirect test, not a runtime behavior
change. This gate includes Image and cookie-redirect regressions, but no actual
SDK, publisher, network or meeting execution. Live loader refusal remains intact.
