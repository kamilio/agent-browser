# Public callback/source admission gap

## Current evidence

The browser must allow later source evaluation after a callback's synchronous
prefix completes, even while that callback's async result remains pending.
`src/page-runtime.test.ts` covers that requirement with a fake runtime. The
twelfth check in `scripts/check-released-safejs.ts` retains the same expectation
against an explicitly selected public SDK. Waiting for the entire callback can
deadlock page work that is needed to resolve its pending result.

The September 15 isolated `@poe-platform/safe-js@0.1.599` attempt passed eleven
checks before interruption at this boundary. Its original failure remains
`Sandbox object is already running.` The original fixture could mask an operation
error with a finally-close error, so that receipt alone does not prove the exact
throw site. See `reports/safejs-isolated-gate-2026-09-15.md`; it is not rewritten.

A subsequent **source-only** inspection pins the neighboring SafeJS repository
at `3057055465eea7b2017d83cd601c61fb408e8d41`, observed September 15, 2026,
19:42:11 UTC. This is a local committed-source observation, not a verified latest
published release, a source-to-package equivalence claim, or another SDK run.
Unrelated dirty work in that checkout was not pulled, built or modified.

The inspected public contract and maintained source resolve an important
ambiguity: **this denial is intentional in that SDK source**, not simply missing
documentation of a supported browser scheduling operation.

- `packages/safe-js/README.md:207` states that concurrent evaluations reject;
  callback-prefix/result separation is documented at line 220.
- `packages/safe-js/src/realm-callback-phases.test.ts:404` explicitly tests that
  source evaluation rejects with `code: "reentry"` after a suspended callback's
  `synchronous` promise has resolved. That test was inspected, not executed here.
- `packages/safe-js/src/realm.ts:625` lets an externally started callback own
  `perform()` until its result settles. Public `evaluate()` enters `perform()`
  at line 825; the active-operation guard at line 838 rejects overlap.
- Changes to this realm file since the September 14 refreshed source reuse its
  resource context; they do not remove that admission guard. The inspected
  callback-phase tests, extension interface and public core exports are unchanged.

These source paths/line numbers refer to that pinned neighboring checkout, not
files added to this browser. Exact copies, hashes and deltas are retained in
`node_modules/.cache/native-validation/safejs-contract-diagnostics-september15/`.

## Required public capability

The mismatch is between an additional browser requirement and the current public
SDK contract. It needs a supported public scheduling capability or contract
change, with upstream acceptance evidence—not another identical SDK retry.

Required behavior is to admit host-scheduled later source after relevant callback
prefixes, without waiting for those callbacks' async tails, while preserving the
same realm's declarations, object identity, source/budget limits, callback order,
cancellation and cleanup. Ordinary forbidden reentry and overlapping synchronous
execution must remain rejected. The interface and authorization boundary for
that capability are not implemented or established by this document.

Do not simulate support by:

- Waiting for every pending callback result before admitting later source.
- Reporting a completed prefix immediately or after an assumed microtask count.
- Recreating realms, replaying old source or discarding unresolved callbacks.
- Changing SDK private state, using another JavaScript engine, or weakening the
  browser's twelfth check to accept a denial.
- Treating `evaluateNested()` as a general replacement: the inspected public
  documentation restricts it to that extension's authorized host operation,
  with shared scope/budgets and its own reentry restrictions.

## Acceptance sequence

First obtain and review the supported public capability. Then harden the isolated
launcher identified by the earlier review: unconditional exception-safe cleanup,
explicit prerequisite checks that cannot disappear under optimization, and
terminal records for preflight/launch failures. Diagnostic fixes in the core
fixture alone do not repair those launcher gaps.

Any follow-up SDK execution needs its own explicit scope. Keep all nineteen
browser core expectations, the ten page-extension checks and later scripted-site
checks distinct. Native fake-core tests validate browser test machinery only.
Even passing the SDK boundary would not establish that React stream completion,
video feeds, access challenges or complete modern websites work.

No SDK default activation, live scripts, credential/device operation, dependency
replacement or full browser compatibility claim follows from this evidence.
