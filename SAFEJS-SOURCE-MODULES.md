# SafeJS source-module integration status

## Available package, not activated browser support

On September 16, 2026 at23:44:29.022 UTC, an anonymous native-browser request to
the registry's latest metadata reports `@poe-platform/safe-js@0.1.640`. Its exact
archive is separately retrieved, SHA512/SHA1 checked, and passively unpacked into
a private temporary directory outside project dependency resolution. All380 files
and43,728,393 unpacked bytes match the published counts and a retained inventory.
No package code, SDK, build or install script is executed. No dependency or
runtime-selection default changes. Its dependency closure is not yet staged.

The package's public declarations expose source-module parsing, a host-owned
`sourceResolver`, and `realm.evaluate(..., { sourceType: "module" })`. Three
source-map entries—realm, source graph and extension interface—are byte-identical
to neighboring committed source at `5da5de84dfbb25cd6410bec999a2d41e8146175f`.
This is selected-source correspondence, not whole-package parity or SDK execution.
See `reports/safejs-published-module-2026-09-16.md` for acquisition evidence.

## Public capability

The resolver receives a specifier, referrer and cancellation context, and returns
an authorized `{ id, source }` or `undefined` to deny. It supplies dependencies,
not entry source, and does not itself resolve URLs or fetch them. Host modules
take precedence. The per-realm graph caches requests, including denials, and
shares canonical returned identities; reusing an identity with different source
fails. The graph owns linking, evaluation and dependency retention.

Module support is not the extension `source:nested` capability. Nor is a resolver
permission for arbitrary network/filesystem/package access. A standalone source
module needs no dependency resolver, but that does not make every module source
safe to grant or every website compatible.

## Explicit in-memory adapter

The extension adapter now accepts a host-supplied source graph. This is explicit
opt-in to the new public SDK contract, not runtime version detection or proof
that the installed SDK implements modules. Automatic runtime selection and CLI
defaults do not enable it. Use only with a separately qualified public core.

```ts
const source = 'export { answer } from "answer";';
const factory = extensionPageRuntime(core, {
  sourceModules: {
    sources: [
      { id: "app:entry", source },
      { id: "app:answer", source: "export const answer = 42;" },
    ],
    imports: [
      { referrer: "app:entry", specifier: "answer", id: "app:answer" },
    ],
  },
});
const scripts = new PageScripts(page, factory);
try {
  await scripts.evaluate(source, {
    sourceType: "module",
    filename: "app:entry",
  });
} finally {
  await scripts.close();
}
```

This illustrates the browser API, not an executed SDK example. Source kind and
entry identity are snapshotted before asynchronous initialization. Initialization
itself remains classic. A module entry must match a declared ID and exact source;
legacy or unconfigured runtimes reject module mode rather than silently running
it as classic. Omitting sourceType preserves classic evaluation.

Sources and import mappings are snapshotted at factory creation; mutations of
caller arrays/records do not affect later realms. IDs/specifiers are opaque exact
strings, not paths or URLs. Only explicit referrer/specifier mappings resolve;
unknown pairs are denied. Targets and referrers must name declared sources.
Duplicate source IDs or mapping pairs are rejected. There is no filesystem,
package, network, fallback, normalization or import-map lookup.

`pageSourceModuleLimits` bounds 128 sources, 512 import mappings, 262,144 code
units per source, 1,048,576 total source code units and 4,096 code units per
identity/specifier. Page-specific smaller source limits apply to dependencies
as well as entries. Each realm additionally allows at most 1,024 resolver
invocations, including denials/repeats; the host keeps no unbounded request log.
The SDK's own cache may satisfy repeated imports without invoking the resolver.
Existing SDK execution/data budgets and page run/deadline limits still apply.
These are separate host-source bounds, not browser-wide memory guarantees.

Returned dependency records are frozen. Cancellation and runtime/owner closure
revoke captured resolvers. Graph updates require a new factory and realm; there
is no loaded-module eviction or revocation API. Input records are data-only;
this validation does not sandbox arbitrary host Proxies or the supplied core.

Public SDK results continue through bounded JSON conversion. Plain copied
namespace exports can be returned; callbacks, accessors and other non-JSON values
are rejected rather than invoked or silently dropped. Existing explicit
`discardResult: true` suppresses browser result conversion, not the SDK's own
namespace export/conversion work. No default export is invoked automatically.
Real SDK namespace behavior remains an independent acceptance gate.

## Browser work still required

An explicit `networkSourceModules` alternative now supplies bounded dependency
resolution through the native policy-fetch contract. It preserves immutable
sources, shared requests, cached failures, CORS/credential policy and scope
cancellation. Its selected native tests and one inert live module acquisition
are documented in `NETWORK-SOURCE-MODULES.md`; no SDK/source execution or HTML
module lifecycle acceptance is claimed.

- Execute and qualify the adapter against the published SDK, including module
  namespace exports, cycles, static/dynamic imports, top-level await, failures,
  cancellation, retained graphs and all existing callback/lifecycle expectations.
- Extend native-network source-resolution coverage beyond the single anonymous
  same-origin asset and mocked redirect/CORS cases. Cross-origin live graphs,
  real cancellation/deadlines and complete module semantics remain unverified.
  The older classic-fetch closure cannot simply become a module resolver.
- Then add and qualify HTML module discovery and lifecycle semantics. The current
  loader skips module/importmap/speculationrules, reports classic mode, and uses
  classic currentScript/document-write behavior. A resolver alone changes none
  of those facts. Import maps and unsupported browser-module features stay explicit.

The in-memory adapter is a prerequisite, not completed HTML module support or a
substitute for the full dynamic-browser goal. Native fake-core tests do not prove
that source modules execute in the actual SDK or on websites.

## Scheduling and acceptance remain separate

The mapped realm source still rejects external evaluation during an active
operation. Source modules do not establish the browser's required later-source
progress while a callback tail is pending. Preserve the historical0.1.599 failure
and all nineteen core/ten page-extension expectations in
`SAFEJS-CALLBACK-ADMISSION.md`. No0.1.640 compatibility pass or failure is measured.

Native adapter tests, actual SDK source-module checks, HTML-module loading and
live scripted websites are distinct gates. Stage and verify the required package
closure, harden the isolated launcher, and obtain a precise execution scope before
the next actual SDK probe. No private-state workaround, fake prefix completion,
alternate engine or default activation follows from this package refresh.

Public source also lacks complete browser import metadata/import-map semantics
and general module-cache eviction. Closing the owning realm is not equivalent
to revoking one loaded module. The broader performance, dynamic-site, access/
CAPTCHA, authentication and research goals remain open.
