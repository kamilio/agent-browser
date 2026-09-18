# Public classic-Script realm proposal

This is an **unactivated source contribution**, not an installed SDK update or a
working Zoom client. It targets the pristine SafeJS snapshot at upstream commit
`0bafd4f3849f0450481db0f02349c3506c4ab168`. The snapshot's private package version
is not a claim about the latest or installed release.

## Motivation

The captured Zoom webim asset starts with a cold Webpack chunk registration
through top-level `this`. Source review found that the browser's current public
extension path supplies neither a classic-Script receiver/global environment nor
an identity-preserving writable browser window registry. These are distinct
problems. This proposal exposes the SDK's existing internal Script machinery;
it does not solve the window capability/alias problem.

## Proposed contract

`createRealm({ classicScripts: true })` selects classic Script grammar and
semantics for ordinary and nested source evaluation. The realm retains a global
lexical environment across evaluations. Top-level `this` initially refers to
the intrinsic `globalThis` object, `var` and function declarations create global
properties, and lexical declarations remain separate from object properties.
The implementation reuses existing parsing, declaration, interpreter, budget and
cleanup paths rather than wrapping source or using an eval trampoline.

Omitting the option or setting it to `false` preserves the previous executable
source path. Explicit `evaluate(source, { sourceType: "module" })` continues to
use module parsing and its own undefined module receiver. Invalid option types
are rejected. The option is deliberately a persistent-realm option, not a new
one-shot `run` mode.

Source review also identified shared prerequisites: retained Script source must
remain charged across host bridge remeasurement, and a global environment must
remember declared names independently of current property descriptors. The
proposal includes corrections and regression contracts for those paths. Keeping
the legacy grammar does not mean every shared accounting/declaration code path
is untouched; existing modes need regression qualification too.

`sourceResolver` continues to apply only to explicit source modules. The new
Script path's `import(...)` uses the registered host-module environment, not
source resolution. Source-resolved Script imports, per-Script referrers and
retained-function import attribution are deliberately unsupported in this
proposal and must be integrated before claiming that browser capability.

Injected host bindings remain immutable lexical capabilities, not writable
global-object properties. In this mode, caller and extension bindings named
`this` or `globalThis` are rejected rather than silently overriding the Script
receiver. Ordinary guest mutation/shadowing of the standard mutable `globalThis`
property follows existing Script semantics. No host capability grants change.

## What this does not establish

- The browser's `window`, `self`, top-level `this` and intrinsic `globalThis`
  are not unified by this proposal. No copied host-array registry is substituted
  for a guest array, and no page adapter is switched on.
- The separate callback-scheduling proposal is neither included nor activated.
  Its historical released-SDK failure and qualification requirements remain.
- No captured Zoom asset or authored SDK test is executed. Source review and
  no-emit TypeScript checking are not runtime or security acceptance.
- Native realtime media receive/decode, legitimate meeting admission, permitted
  recording, transcription and summary delivery still need implementation and
  end-to-end evidence. No meeting has been joined by this browser.

See `QUALIFICATION.md` for the next isolated execution and browser-integration
gates. The patch is relative to the pinned pristine tree, independently of the
scheduling patch; stacking both proposals requires a fresh review and tests.
