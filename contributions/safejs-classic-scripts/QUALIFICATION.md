# Pending classic-Script qualification

The proposal is source-only. Do not enable it in the browser or interpret static
checking as permission to execute the SDK. The next runtime gate requires
explicit isolated SDK authorization, without websites, sockets, credentials,
devices, real TTY, captured third-party source or meeting actions.

Stage distinct pristine and patched source copies with exact hashes, finite
heap/output/time bounds, empty task-owned HOME/TMP, existing offline guards and
process-group cleanup. Pin the source, generated declarations, compiler, runner
and test selections. Do not install packages, modify the upstream checkout,
replace the installed package, relax historical assertions or rerun a spent
failure unchanged.

## Public API regression gate

Execute the authored public-realm tests on the patched candidate. Keep expected
old-API failures separate. Then run existing public realm lifecycle, capability,
callback, budget, source-module, internal Script/eval and parser regressions
covering the changed paths. Require actual runtime evidence for:

- Sloppy and strict Script receivers, nondeletable variable/function properties,
  persistent lexical bindings and declaration conflicts across scripts.
- A cold registry expression retaining array and factory identity across source
  evaluations, without executing the registered factory.
- Script grammar and completion values, including function-declaration identity
  and later redeclarations; source diagnostics retain the supplied filename.
- Immutable injected capabilities, rejected receiver replacement, unchanged
  omitted/false mode and independent realm ownership.
- Explicit source-module grammar, receiver and lexical isolation while reading
  the containing realm's Script globals.
- Source-resolved `import(...)` within Scripts is not implemented by this patch;
  verify the documented boundary and separately qualify referrer/identity/lifetime
  handling before enabling it for browser use.
- Finite step/data/source budgets, nested source ownership, abort, close and
  exactly-once cleanup without leaked jobs, guest references or compiled data.
- Active-source charging inside callback/retained-argument host boundaries,
  source retention/release for functions, classes and generators, and template
  cache ownership until close. Include the unchanged legacy bridge paths.
- Global declaration history for configurable properties, identifier versus
  explicit/with-environment deletion, eval-origin names, retained-name accounting
  and backward-compatible snapshot roundtrip/validation.

The source-only typecheck cannot demonstrate any of those runtime behaviors.

## Browser integration gate

Only after SDK qualification, use the supported public API in an explicit
opt-in browser adapter. Preserve the production default. Unify browser aliases
with real page capabilities and identity-preserving guest-owned properties;
assigning a copied host array is not a sufficient registry implementation.

Require `this === window === self === globalThis`, unchanged cold-chunk source,
cross-script array/factory identity, retained document/timer/host capabilities,
and separate function execution tests. Then qualify composition with the
callback-scheduling proposal, retaining all historical core, extension and module
expectations. Do not count either standalone proposal as combined acceptance.

Execution of captured publisher scripts, live resources, Zoom admission, native
audio reception/decode, permitted recording, transcription and verified delivery
remain distinct subsequent gates. No alternate engine or challenge bypass is
part of this work.
