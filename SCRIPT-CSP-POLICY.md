# Script CSP policy foundation

## Native resource-backed policy — September 18, 2026

The native document owner now composes script/base admission with destination
enforcement for image, stylesheet/import, fetch/preflight and WebSocket requests.
It retains the complete response policies, checks actual targets and redirects,
and refuses unsupported policies before activating a resource-backed document.
The standalone `createScriptCspPolicy` factory cannot borrow these permissions;
only a matching native-bound resource owner enables the composed evaluator.

Inline style elements and attributes have separate intersected permissions,
including `default-src` fallback when no resource directive is present. Dynamic
style insertion, attribute mutation and owner invalidation use the same guards;
closure removes cached author presentation and aborts pending resource work.
Effective style nonce/hash restrictions remain unsupported and fail closed.
Generic fetch never gains script nonce/trust, and CORS, origin, credential,
mixed-content and resource-budget restrictions still apply independently.

`upgrade-insecure-requests` uses an explicitly stricter subset: native requests
must already be HTTPS/WSS. HTTP URLs are rejected, not rewritten. Secure
navigation redirects use the bounded checked path described below; this is not
standards-equivalent upgrade support. Data/blob
and custom-scheme resources are unavailable even when their scheme-only source
expressions are valid. Recognizing that syntax does not add a protocol handler.

Font, media, frame and object destinations remain inactive: no native font URL
loader, audio/video receive/decode, child runtime, object execution, WebAssembly
or guest `window.open` is introduced. Only `object-src 'none'` is accepted as an
explicit object directive. Any future destination capability must gain its own
owner checks before it can activate. Unknown execution directives still refuse.

The focused native worker passes1733 tests in35 files, with strict build/types,
format and lint. The unchanged captured Zoom header separately passes offline
native classification at
`/tmp/agent-browser-resource-policy-september18-U6aa44/static-policy04`; no
captured source, SDK or website runs in that check. The first scheme-recognizer
failure and default-only-style regression runs remain preserved.

Parent integration passes4115 native tests in90 files at
`/tmp/agent-browser-resource-csp-union01-Ojz8V9/candidate`,44.112s, with strict
build/types/format/lint passing. Actual-SDK integration separately passes6/6
controls at `/tmp/agent-browser-native-resource-csp-sdk-control-asH0eH/stage02`,
7.516s. These use real native session/loader/PageScripts and unchanged BqM3JX SDK,
with synthetic eleven-directive policies and transport only. They verify nonce
and eval-policy behavior, external script redirects, real guest fetch allow/deny
and removal of dynamic inline presentation on owner closure. All six SDK realms
finish with zero retained values/data; native owners/transports and processes
close. Stage01's5/6 result is preserved: its harness omitted the fetch binding;
stage02 supplies the production context.fetch binding, without production edits.
No publisher executes and no Zoom admission or incoming audio is claimed.

The subsequent owned-process control passes12/12 public commands in2.068s at
`/tmp/agent-browser-owned-resource-csp-corrected-september18-arChiH`. The actual
core30/BqM3JX child automatically runs the nonce script, blocks its nonnonce peer,
changes native DOM and permits indirect eval under the synthetic policy. Three
guest fetches return one allowed response and two denials; only the document and
allowed response reach route delivery. Public close succeeds, actor commands
finish pending0 and processes are absent. Final process disposal uses production
SIGKILL; no private in-child SDK retained-value claim is made. The first harness
failure is preserved: routes needed URL-free public open to create the session.
This is programmatic owned/public-protocol evidence, not real CLI environment
startup, publisher execution, future secure redirects or a meeting join.

## Secure navigation redirects

For navigation initiated by a secure-only document policy, each HTTPS redirect
now passes through native manual requests with destination checks before the
next dispatch. The transport still owns origin/IP restrictions, cookies, header
validation and byte/request limits. HTTP, credentials, invalid or ambiguous
Location values, hidden adapter redirects, loops and hop-limit overflow refuse.
POST301/302 and non-GET/HEAD303 rewrite to GET;307/308 preserve copied body bytes.
Cross-origin hops strip sensitive headers; sticky cross-site cookie taint remains.
The final document retains inherited fragments and aggregate redirect history.

A single network deadline covers the chain, alongside the existing navigation
deadline. Owner/history checks precede requests and follow responses. Consumer
cancellation does not prove an arbitrary adapter settled: its live queue lease
remains counted until settlement. Regression tests verify both compliant abort
cleanup and a deliberately nonsettling provider that later completes without
dispatching its late redirect. No lease is silently discarded to report success.

Parent integration passes4452 native tests in102 files at
`/tmp/agent-browser-secure-navigation-union01-mbvii9/candidate`,47.321s, with
build/types/format/lint passing. The worker's final02 passes740/23; its audit and
preserved failures are at
`/tmp/agent-browser-secure-navigation-september18-RzW3dm/REPORT.md`.
This is native/mock and routed-transport evidence, not a socket, actual-SDK
redirect, owned-process redirect, publisher or Zoom admission gate.

The earlier loader/foundation milestones below retain their original evidence
and describe the support available at those points.

## Native loader integration — September 18, 2026

The native loader now activates the already-supported script/base policy subset
instead of blanket-refusing it. This does not admit the complete captured Zoom
policy: unsupported directives still fail closed, without removing response
headers or borrowing permission from another resource destination.

The session snapshots enforced headers and binds an authentic document owner
before runtime creation. Prepared-script admissions retain immutable native nonce
and parser provenance, are branded to that owner, and are checked before fetch,
on every manual redirect hop, and before evaluation. Raw-only fetch adapters and
active-policy module loading remain conservative. The bound string-compilation
decision reaches PageScripts before factory allocation; a factory deny cannot
be weakened. Policy failure/closure invalidates admissions and closes the runtime;
unsupported meta insertion remains sticky even when the element is removed.

Post-commit dynamic script requests use the live document's cancellation scope;
bootstrap requests retain navigation cancellation. Generic fetch does not inherit
script permission. Image/style owners receive all immutable enforced headers.
The top-level framing/report-only exception remains limited to its original
context; combining frame-ancestors with execution directives is still unsupported.

Parent integration passes3422 native tests in72 files at
`/tmp/agent-browser-csp-loader-union01-glcJNn/candidate`,36.237s. Build, selected
types, format and lint pass. The worker's738/14 focused run, earlier failures and
exact patches remain at `/tmp/agent-browser-csp-loader-september18-jNe8bL`.
Original dirty page-scripts.test.ts bytes are unchanged. These are native/mock
results, not an actual SDK, full-policy Zoom navigation or meeting acceptance.

The sections below retain the earlier foundation and isolated policy-gate
milestones; their statements about then-unactivated loader wiring are historical.

The subsequent actual-SDK control passes4/4 cases in5.858s at
`/tmp/agent-browser-native-csp-sdk-control-GiNBmn/stage02`, using this qualified
native candidate and unchanged BqM3JX SDK. It verifies nonce admission/rejection,
native document mutation, unsafe-eval/factory-deny intersection, redirect denial
before transport and direct policy-close runtime invalidation. All four SDK
realms finish with zero retained values/data; all native owners, transports and
process groups close. Transport/source/URLs are synthetic and no publisher is
executed. Full Zoom resource-policy admission and meeting acceptance remain open.

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
