## Request

Provide an explicit, host-authorized way for a realm extension to replace the
builtin `console` with an owned host object. Preserve default collision rejection
and do not silently override intrinsics, caller bindings or another extension.
API spelling is open: a narrowly scoped builtin-console option or a validated
override declaration/grant would both address the consumer requirement.

The consumer is a dependency-light TypeScript browser with its own document,
Window and bounded console journal. Its console includes log/error/warn/info,
groups, counters, timers and safe DOM labels. We need `console === window.console`
and `console === self.console`, with the same methods, identity, accounting and
revocation, constructed through the extension context.

## Source evidence and scope

Inspected September 2, 2026, at commit
`c458b92d312580a2f9b32c9aa5e84b3aed77ea5e`:

- `packages/safe-js/src/realm.ts`: `RealmState` seeds occupied global names from
  both builtin bindings and caller bindings, then rejects any matching extension
  global before setup. Declaring `console` therefore conflicts.
- `packages/safe-js/src/interp/globals/console-json.ts`: the builtin console has
  log/error methods; the sink receives these calls but cannot supply the browser's
  full console object or shared Window identity.
- `packages/safe-js/src/extensions.ts`: owned host objects are created through
  the setup context. Preconstructing a caller binding is not a substitute for
  this realm-owned setup contract.

This is an enhancement to the intentionally strict conflict policy requested in
#540, not a regression claim, a request to reopen that issue, or a defect claimed
against an installed release. #547 and #549 remain resolved. The new published
artifact has not been run by this consumer; source inspection is the evidence.
Recent issue bodies were checked for a duplicate console-override request.

## Desired public-consumer behavior

Using only the public core entrypoint:

1. Register one extension whose setup creates a console host object and a Window
   host object exposing that exact console. Export console, window and self.
2. Explicitly authorize replacement of builtin console at realm construction.
3. Evaluate identity and method checks across multiple evaluations. Calls through
   any alias reach the same owned journal, with no host prototype access.
4. Close the realm; revoke all aliases and run extension cleanup exactly once.

Without the explicit replacement authorization, the same registration must still
fail before setup runs. Two extensions claiming console must conflict even when
builtin replacement is allowed. Caller-supplied console must not be overwritten
implicitly. Invalid/unknown override names, accessors and missing grants must
fail without acquiring resources. Leave JSON and other intrinsics protected.

Please include an installed-package Node/Bun consumer test, independent realm
isolation, lazy setup/unused close, failed setup, abort and cleanup coverage. Keep
this a generic owned-host capability; the browser console implementation itself
belongs outside SafeJS and requires no additional runtime dependency.

## Deliberately avoided alternatives

We have not imported interpreter internals, patched the SDK, mirrored state into
a second console, or prefixed guest programs with lexical/global rewrites. A
sink-only adapter would lose method parity and identity; a hidden lexical alias
would change user declarations. Neither is being presented as browser support.
