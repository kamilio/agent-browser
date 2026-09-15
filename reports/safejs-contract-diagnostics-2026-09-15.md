# SafeJS contract diagnostics — September 15, 2026

**Progress: the browser's maintained release probe now preserves operation
failures and identifies interrupted checks. SDK compatibility remains unverified.**

## Why this work matters

The preceding source survey identified client/deferred rendering as a concrete
limitation on several candidate websites. The earlier isolated SafeJS gate stops
after eleven checks, around fresh source evaluation during a suspended callback,
but its original finally-close can replace the operation error. An awaited
predicate also runs before the old check recorder, leaving that attempted check
absent from the receipt. Neither ambiguity is useful when deciding how to repair
the browser/runtime integration.

The original SDK receipt and all website results remain unchanged. No actual SDK
retry, website navigation, dependency replacement or default activation occurs
in this follow-up.

## Maintained fixture fix

`scripts/check-released-safejs.ts` now registers a failed-by-default check before
its operation starts. It awaits the operation, records its final boolean or
bounded failure message, and retains the failing label in `failure.label`.
Preparatory evaluation/callback work is included in its corresponding check.
`--trace` emits the final PASS/FAIL for each attempted check, including throws.

Each fixture's cleanup runs after success or failure. A primary operation failure
survives a secondary cleanup failure, including when the original thrown value
is not an Error. Cleanup problems are separately attributed in
`cleanupFailures: [{ fixture, message }]`; successful runs contain an empty array.
Cleanup-only failures still stop the run and set a nonzero exit status. Messages
retain the existing 512-code-unit bound. Unattempted checks are not invented.

An independent TypeScript AST comparison verifies the **same nineteen labels,
boolean predicates and their order**, plus all **fourteen literal guest-source
strings**. Deadlines, budgets and fail-fast behavior remain. The twelfth check
still requires later source progress without settling the earlier async tail;
tests explicitly reject a wrong return value or an already-settled tail.

This changes probe diagnostics, not the SDK scheduler, browser adapter or page
runtime. It does not fix the separate historical Python launcher's cleanup and
terminal-record gaps.

## Native-only regression evidence

The new `src/released-safejs-check-diagnostics.test.ts` runs the actual script
entry in-process with a mocked loader and a deliberately fake core. Guest source
is matched as fixture input, not interpreted. The tests restore environment,
argv, exit status, console mocks and timers. No real SDK is imported.

| Clean validation | Suites | Passed | Failed |
| --- | ---: | ---: | ---: |
| Original parent baseline | 3 | 67 | 1 |
| Original script plus final new tests, red | 4 | 67 | 21 |
| Fixed script plus identical new tests | 4 | 87 | 1 |

All **20 new regressions fail against the original script and pass against the
fix**, using the same test-file hash. Coverage includes fake nineteen-check
success, thrown/rejected operations, primary/cleanup attribution, non-Error
failures, operation and cleanup deadlines, cleanup-only failures, preparatory
failures and unchanged fresh-source requirements.

The one unchanged failure is
`src/page-scripts.test.ts:292`, “creates one persistent realm with live
document/window aliases and explicit lifetime limits”: 26 globals versus an
expected 25. Its source, assertion identity and failure summary are identical
between baseline and candidate. It is not repaired or hidden by this change.
The selected-suite command therefore still exits 1; this is not a full native
suite pass.

Build, selected-test type checking, configured formatting and lint all pass in
the final baseline/red/candidate lanes. The initial 14-case red snapshot and its
format/useConst lint failures remain archived; the final test set has 20 cases.
The new suite is added to the explicit native manifest, not to an SDK acceptance
gate. Clean overlays exclude all unrelated dirty work.

## Source-level contract finding

The neighboring repository is independently pinned at local commit
`3057055465eea7b2017d83cd601c61fb408e8d41`, observed at **19:42:11 UTC** on
September 15. Its unchanged callback-phase test explicitly expects source
evaluation to reject after a suspended callback's prefix completes. The current
public source's active-operation guard agrees. The inspected changes since the
September 14 refresh do not supply the required admission capability.

This resolves the earlier uncertainty about intent: the checked source
deliberately rejects this overlap. The browser needs an additional supported
public scheduling capability, not a private-state workaround or weaker test.
`SAFEJS-CALLBACK-ADMISSION.md` records the exact sources, required behavior and
remaining acceptance sequence. These upstream tests were read, not run. No
latest-registry lookup, source-to-published-package equivalence, new upstream
pull/build or SDK-conformance result is claimed.

## Preservation and remaining gates

Private evidence:
`node_modules/.cache/native-validation/safejs-contract-diagnostics-september15/`.
`VERIFIED.json` checks source/compiled pins, identical red/green test bytes,
unchanged existing outcomes and the nineteen-predicate comparison. The companion
public JSON records exact hashes and summarized results. The source checkout's
unrelated changes and browser's original 42 dirty tracked/697 untracked files
are preserved. No push.

A compatible public admission contract, hardened launcher and explicit follow-up
scope are prerequisites to another SDK gate. Page-extension, scripted-site,
access/challenge, credentials/passkeys, real interaction and broader performance
work remain open. The overall browser goal remains active.
