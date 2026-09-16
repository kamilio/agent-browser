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

## Browser work still required

- Add an explicit host-only module capability and bounded immutable in-memory
  source admission. Deny unknown mappings and avoid guest-controlled filesystem
  or unrestricted fetching. Keep classic defaults and bootstrap unchanged.
- Carry source kind, stable entry identity and resolver through the page/runtime
  interfaces. Legacy runtime adapters must reject unsupported module requests,
  not silently execute them as classic scripts. Different inline entries need
  different canonical identities with a defined base mapping.
- Bound dependency count, request identities, total/per-source bytes, in-flight
  work and lifetime; existing page-run counts are not dependency-execution counts.
  Preserve the shared SDK budget, abort/close handling and late-result rejection.
- Define module namespace/result handling explicitly. Do not assume the classic
  return-value copier is valid for live module namespaces or invoke a default
  export as though the module were a harness entry function.
- Qualify native-network source resolution separately, with explicit credentials,
  origin/redirect/CORS policy and effective cancellation. The current classic
  fetch closure includes credentials and cannot simply become a module resolver.
- Then add and qualify HTML module discovery and lifecycle semantics. The current
  loader skips module/importmap/speculationrules, reports classic mode, and uses
  classic currentScript/document-write behavior. A resolver alone changes none
  of those facts. Import maps and unsupported browser-module features stay explicit.

These are integration requirements, not an implemented module feature or a
substitute for the full dynamic-browser goal.

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
