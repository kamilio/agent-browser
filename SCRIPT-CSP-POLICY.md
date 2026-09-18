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
nonceable. External URL-source matching additionally requires both `url` and
`redirectCount`, checked for each actual hop. HTTP(S) URLs must be absolute,
bounded and credential-free. Never accept insertion provenance or nonceability
from guest input. Existing four-field external metadata cannot obtain a URL-source
allowance, but can still satisfy a valid nonce or strict-dynamic decision.
`allowsBase` independently checks the supported empty/none/self base-uri subset.
Report-only headers do not enforce restrictions; malformed or excessive enforced
input denies admission without invoking property getters.

URL sources reuse the existing bounded native source matcher, with strict-dynamic
taking precedence over URL allowlists. `stringCompilation` independently derives
an immutable allow/deny decision from script-src or default-src, never
script-src-elem. Multiple policies intersect; a nonce does not permit eval.
Unsafe-eval grants JavaScript string compilation; wasm-unsafe-eval is recognized
as element-inert metadata only. Blob source tokens are recognized, but blob
requests and WASM execution remain unsupported. Hashes and other unsupported
security directives fail closed. This is not full Zoom CSP support. Real
integration still needs loader admission and all
resource-destination enforcement; do not strip or ignore a publisher's policy
to activate this evaluator.

## Document ownership and nonce hiding

`bindDocumentScriptCsp(tree, headers, limits?)` binds immutable response policy
to one native document. Verified dynamic script nodes can be checked through
`allowsScript(id)`. Parser scripts require authentic completed-token provenance;
unknown, inert, cloned and detached eligibility is refused. Meta
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

## Trusted parser metadata

The script-capable HTML parser now records privately branded, one-use start/end
token metadata. It retains duplicate-attribute and raw/decoded dangling-markup
evidence before attribute deduplication, and requires the same tokenizer owner
to complete an eligible script. Forged, copied, modified or unfinished tokens
cannot establish trust. Additional scans count toward tokenizer work limits.

Parser nonce eligibility is independent of origin, async and already-started
state. Inert parsing, fragments, templates, foreign elements and clone/import
paths do not mint admission trust. The document owner checks current connection,
attributes and hidden nonce before admitting an eligible, unstarted script.
This does not itself enable the live loader or support additional CSP directives.

The focused worker passes1681 native tests in40 files, including28 new cases.
Parent integration with URL and CLI startup controls passes2187 in49 files;
build, selected-test types, format and lint pass. Earlier missing-vendor,
test-nullability and formatter-wrapper failures remain recorded separately.
No actual SDK, publisher policy activation or meeting execution is claimed.

## Guest string-compilation control

The extension adapter and serializable `runtimeOptions` now accept an explicit
`stringCompilation: "allow" | "deny"`. Absence leaves existing behavior unchanged;
the legacy adapter rejects either explicit selection. This is a realm setting,
not automatic document CSP activation or a new CLI environment variable.

The adapter forwards a primitive snapshot to the public SDK. Before evaluating
bootstrap or page source, it requires the returned realm to expose a matching
own, non-writable, non-configurable data property named `stringCompilation`.
Missing, mismatched, mutable or getter-backed echoes close the realm and refuse
execution; an older SDK cannot silently ignore requested denial. Configuration
getters/inherited entries are rejected without invoking the getter.

Parent native/mock integration passes2320 tests in51 selected files, with build,
types, format and lint passing. The unchanged-production red gate retains21
failures. The first green attempt retains five mock cleanup-call-count failures;
corrected checks verify one actual disposal despite idempotent repeated close
calls. This gate verifies forwarding/refusal, not real guest eval enforcement.
The SDK interpreter restriction, actual SDK qualification, eval/Function coverage
and policy-to-document wiring remain separate requirements. No WASM support or
publisher CSP admission is implied.

## Actual SDK and per-page requirements

The qualified private SDK now has actual native integration evidence for
default/allow/deny, eval and Function constructor families, native event callbacks,
page isolation, cancellation and owner cleanup: three tests and86 checks pass at
`/tmp/agent-browser-native-string-policy-APzef5/stage02`. That gate predates the
per-page forwarding change; it is not a new live browser or CSP admission pass.

`PageRuntimeOptions.stringCompilation` adds an independent per-page requirement.
The extension factory combines it with its immutable factory selection: deny
wins, and a page cannot weaken a factory restriction. Each page snapshots its
own requirement before SDK/module/window allocation, forwards the resulting
constant and verifies the same immutable SDK echo before bootstrap. Absence of
both requirements preserves old SDK compatibility. The legacy factory rejects
explicit requirements before allocation; malformed, inherited or accessor-backed
page settings reject without invoking getters.

The focused per-page native suite passes412 tests in10 files, and source matching
passes549 tests in5 files. Parent integration passes3074 in62 selected files,
with build/types/format/lint passing. Original red, harness and formatting failures
remain preserved. Document policy computation, PageScripts/loader forwarding and
all active resource-destination checks remain separate work; the captured full
Zoom policy still does not pass live admission.
