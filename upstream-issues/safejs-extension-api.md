## Request

Give SafeJS a small, public, composable host-extension API with persistent realm
lifecycle support. The consumer is a dependency-light TypeScript agent/terminal
browser with its own DOM, not a Chromium/Firefox wrapper. DOM, events, timers,
networking and storage should live outside SafeJS and integrate through supported
APIs rather than patches to the interpreter or imports from internal files.

Current upstream `main` inspected on September 1, 2026:
`1a13eb31dd2671828ed3419d9397d7264b5b6788`.
The lightweight core exports `run`, lint, random and budget facilities, but no
public persistent-realm or unified extension API. Existing `run()` bindings and
registered modules are useful foundations; this request should compose with them,
not create a parallel incompatible registration mechanism.

## Required boundary

- Keep JavaScript grammar, object/prototype semantics, regex matching, intrinsic
  globals and interpreter execution/accounting in the core. They are not plugins.
- Extensions are explicitly registered **trusted host code**, not guest-loaded
  plugins. No automatic discovery, downloads or native browser dependency.
- A versioned manifest declares the extension name, requested capabilities and
  supplied globals/module exports. Hosts explicitly grant capabilities.
- Reject incompatible versions, duplicate registrations, missing grants and
  conflicting global/export names before any factory acquires resources. Do not
  silently override intrinsics, caller bindings or another extension.
- Instantiate per realm, preserve closure/object identity across evaluations, and
  dispose resources predictably. Closing an unused realm should not acquire
  extension resources.
- Expose cancellation, cleanup registration and explicit work charging through a
  narrow context, not mutable VM internals or an unrestricted budget handle.
- All guest-visible values pass through the existing host bridge and accounting.
  Capability declarations do not magically sandbox arbitrary native code; clearly
  document this trust boundary and the need for external process supervision.

## Public building blocks needed

1. Persistent realm `evaluate`/`close`, without replaying earlier scripts.
2. Explicit live host-object properties/methods, stable identity and revocation
   on realm close. No ambient host prototype or constructor access.
3. Lifetime-aware guest callback invocation preserving captured state, receiver
   and arguments, with cancellation, bounded retention and fatal-budget handling.
4. Declarative extension definition/registration, visible capability metadata and
   per-realm setup/disposal. API spelling is open; behavior matters more than names.
5. Consistent integration with `run()` and the module registry. Document any
   snapshot/replay restrictions rather than claiming unsupported parity.
6. Lightweight public exports and TypeScript types, without additional runtime
   dependencies or pulling browser/agent-spawn implementations into the core.

Synchronous factories are sufficient. If asynchronous setup is supported, define
startup cancellation and partial-cleanup behavior explicitly. Disposal should run
in reverse registration order, attempt every cleanup even after a failure, be
idempotent, and settle before close/failure is reported. Bound registrations and
retained callbacks; do not rely only on cooperative native code for hard deadlines.

## Acceptance tests

- Two realms using the same extension receive independent state; repeated
  evaluations in one realm retain state and do not rerun setup or earlier source.
- Manifest validation/capability denial/conflicts have no setup side effects.
- Malformed/accessor-based declarations do not execute getters during validation.
- Partially failed setup releases previously acquired resources; cancellation and
  close revoke host-object access and prevent later callback execution.
- Reverse-order cleanup is awaited, repeated close is harmless, and cleanup
  failures remain observable without skipping other disposers.
- Explicit work charging and guest callbacks cannot hide fatal budget exhaustion
  inside guest catch blocks; retained data remains accounted for.
- A separate consumer package implements a small DOM-like host object and event
  callback entirely through public exports; no SafeJS-internal imports.
- Exercise the actual compiled public SDK, not only mocks.

## Existing experiment / scope note

A local experiment based on repository tag `v13.0.10` already demonstrates
persistent realms, explicit host objects and phase-aware callbacks against an
owned browser document. Those are experimental additions, **not assertions about
the current upstream API**. The goal here is to make the boundary supported and
maintainable upstream before adding more browser APIs. No requirement to embed a
DOM implementation, browser networking policy, Playwright, or a native regex
fallback in SafeJS.
