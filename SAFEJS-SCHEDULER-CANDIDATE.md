# Public SafeJS scheduler candidate

## Status and evidence

September 16, 2026: **static feasibility only; not implemented, executed or
established as a supported complete browser solution.** The existing browser
adapters still forward source to external `realm.evaluate`. Its rejection while
a callback tail remains pending is intentional, including after the callback's
actual synchronous prefix has completed. Keep the requirement and historical
failure in `SAFEJS-CALLBACK-ADMISSION.md` unchanged.

The review pins neighboring SafeJS source at
`4f6988bededc4c663682d6be8f5f7408ee4230e7`. Ten source/document/test files match
that commit byte-for-byte. No SDK import, execution, dependency replacement,
page script or new website request occurs. Tests are read, not run. This is not
evidence about a latest published package or source/package equivalence.

Exact review, source hashes and browser-adapter hashes are retained in
`node_modules/.cache/native-validation/safejs-scheduler-review-september16/`:
`feasibility.md`, `feasibility.json` and `SOURCE-VERIFICATION.json`.

## Conditional construction

One persistent outer guest evaluation would start **before** callbacks. A
bounded host-owned inbox would supply serialized work, and idle turns would
return to a genuine guest `await`. Each source turn would enter a setup-registered
`nestedOperation` with declared and granted `source:nested` authority. Calling
its JavaScript implementation directly does not establish that authority.

Inside the genuinely owned active host phase, start a callback, retain and
observe its result, await its actual `synchronous` handle, and serialize/await
later `evaluateNested` source. A completed nested source need not drain an
independent suspended callback tail. Scope, compilation owner, budget, signal
and queue remain shared; no function wrapper, source replay or new realm is
part of this candidate.

Return to real guest-await boundaries between turns. Waiting in native host
code alone can retain the execution token and starve callback continuations.
The phase's nested-evaluation guard lasts until its entire nested source settles:
prefix completion does not authorize parallel nested sources or arbitrary
admission while a prior source itself remains suspended. Nor can this driver
be bootstrapped by external evaluation during an already-active callback.

These conclusions derive from the pinned `packages/safe-js` sources:
`src/realm.ts:692` and `:794` (owned phase and nested lifetime),
`src/realm-callback-phases.test.ts:404` (external denial),
`src/interp/interpreter.ts:520` (nested job-drain distinction), and
`src/interp/jobs.ts:276` and `:296` (execution ownership and guest suspension).
They do not prove the combined driver lifecycle works.

## Outstanding acceptance obligations

- Obtain upstream confirmation and public composite coverage for admission,
  pending-tail progress, callback ordering and genuinely owned host turns.
- Establish a supported source-result and per-source options/error channel.
  `evaluateNested(): Promise<void>` currently discards the evaluated value and
  uses the fixed nested filename; it cannot directly replace browser evaluation.
- Preserve top-level declarations and object identity without wrapping source;
  preserve source-size/evaluation limits and account for driver work within
  cumulative budgets. State the limits on suspended source/top-level await.
- Isolate the host inbox and its authority from untrusted page code. Bound queued
  work and retained references, observe callback-tail errors, and preserve native
  event/default-action order. None of these properties is established here.
- Prove queued and active cancellation, close, pending-result rejection and
  resource cleanup, including idle and error paths. Do not turn tail settlement
  into a prerequisite that can deadlock later source.
- Keep all nineteen browser core expectations, ten page-extension checks and
  later scripted-site gates separate and unweakened. External-overlap support
  still needs a public contract change if that exact SDK API must admit it.

Next work is contract/design review, not another identical SDK retry. Actual
SDK execution needs its own explicit scope and the isolated-launcher hardening
recorded in `SAFEJS-CALLBACK-ADMISSION.md`. No private-state workaround, alternate
engine, fake prefix completion or acceptance-by-mock is justified by this review.
