# Explicit source-module admission: native adapter validation

## Delivered

The page extension adapter now accepts an explicit host-owned graph through
`extensionPageRuntime(core, { sourceModules: { sources, imports } })`.
`PageScripts.evaluate(source, { sourceType: "module", filename })` carries the
exact mode and declared entry identity through to the public SDK contract.
Legacy, unconfigured and old custom runtime adapters reject module requests
rather than silently executing them as classic scripts. Default selection,
classic initialization, execution budgets and callback scheduling are unchanged.

The registry snapshots data-only records, rejects duplicate/unknown graph
references, freezes returned sources and resolves only exact authorized
referrer/specifier pairs. It performs no URL normalization, filesystem/package
lookup, automatic fetching or credential access. Fixed source/mapping/identity
bounds and per-realm resolver-invocation budgets prevent unbounded host graph
retention. All dependencies also obey smaller page-specific source limits.
Captured resolvers stop working on cancellation or owner/runtime closure.

Module results retain bounded JSON conversion; functions and accessors are not
invoked or silently omitted. Explicit discardResult retains its existing meaning
and does not skip the SDK's own prior namespace conversion. The API and complete
bounds are documented in `SAFEJS-SOURCE-MODULES.md`.

## Executed evidence

- **1,025 passed / 0 failed in 41 explicit native test files**, including all
  **53 new tests**: 25 registry cases and 28 adapter/integration cases.
- Unchanged adapters with the standalone registry present but not integrated:
  the same 28 integration case names produce **25 failures / 3 passes**.
  This is an old-adapter control, not an old implementation of the new registry.
- Earlier focused candidate: 166/0 across seven files. Final broader coverage
  includes classic script loading, DOM/event bindings, namespace collections,
  source-selection defaults, focus/idle/scrolling, session-host mocks, noscript,
  and synthetic released-core loader/diagnostic fixtures.
- Build, strict selected-test types, formatting and lint pass. Initial core01
  stopped before tests on three new mock typing errors; explicit annotations
  fix those errors without changing assertions. Its original logs are retained.
- Final source/compiled inventories are rehashed: 1,559 source/config/test files
  and 2,332 compiled entries. Focused and final compiled inventories match.
  All native/quality child processes and groups close; HOME/TMP are empty.
- Independent static review finds no actionable blocker and checks selected
  published declarations/source passively. Its native-validation prerequisite
  is satisfied by the separate final run, not by the static review itself.

Validation uses protected snapshots of baseline commit
`8f43d495f5f9e7007631327a0983697b30058796` plus the owned changes, not the dirty
working runtime. The explicit canonical manifest has 970 entries: 948 available
and 22 missing. Only the selected 41 files ran; **this is not a full-suite pass**.
Pre-existing changes in 42 tracked files and 697 untracked files are preserved.
Only the new index exports, manifest entries and task section belong to this
change; unrelated edits in those same files are not included in its commit.

## Not established

**No actual SafeJS SDK code or website scripts were executed. No live website
requests, real credentials, passkey devices or terminal probes occurred.**
Native fake-core tests prove adapter admission/forwarding and lifecycle behavior,
not module parsing, execution, real namespace copying, or website compatibility.
Configuring the graph is host opt-in to a separately qualified SDK contract;
it is not automatic runtime version/capability detection.

SafeJS0.1.640 still needs its verified dependency closure and a separately scoped,
hardened execution gate for imports, cycles, top-level await, namespaces, failures,
cancellation, retained graphs and callback lifecycle. The historical callback-tail
admission failure remains unresolved. Network resolution needs origin/redirect/
CORS/credential policy; HTML discovery/order/lifecycle and import maps remain
unimplemented. The existing HTML loader still skips module scripts explicitly.

The broader native-browser goal remains active: real-site functionality and
performance, avoidable access/CAPTCHA friction, credentials/passkeys, missing
tests and the original research topics are not completed by this adapter change.

Evidence: `node_modules/.cache/native-validation/source-modules-september17/`.
Raw receipt timestamps and historical failures retain their original values.
