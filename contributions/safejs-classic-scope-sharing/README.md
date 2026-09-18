# Experimental classic-Script scope sharing

This is an incremental source contribution, **not an installed SDK update** or
a working Zoom client. It targets the qualified private responsiveness candidate
at `/tmp/agent-browser-sdk-deadline-root-2v6FLh/candidate`, not arbitrary upstream
main. `sdk-empty-module-scope.patch` has SHA-256
`1d78268f24edbc4640522e4395c1b1bab3435a2888d9b335dcbc395dabf5eb9d`.

## Change

Classic realms were always attaching a module environment, even when their
private registered/converted module collections were empty. Its presence
disabled existing revisioned whole-scope root sharing. The patch creates a
privately identified, frozen empty environment and permits existing sharing
only on the corresponding classic-global scope. Mutable or generic frozen
environments do not qualify. Runtime reattachment and source-loader attachment
revoke eligibility.

This changes four production files and adds 19 tests. It does not cache guest
graphs or totals, skip root providers or reconciliation, alter data/step/depth
limits, or change host capabilities. Actual classic diagnostics retain exactly
48,595 outer root-provider calls and 1,458 reconciliations; internal ancestor
recursion falls from 195,079 calls to 48,742, with identical final accounting.

## Qualification and tradeoffs

The final candidate passes 1,570 tests in 105 selected files, including the
original 104-file union, in 99.184 seconds. Strict test types and emitted core/node
build pass. The failure-first baseline returns three roots where the new
sharing contract expects one; that failure remains preserved.

Final paired emitted-build results are workload-dependent:

| Fixture | Median wall-time change |
| --- | ---: |
| Actual classic nested closures, depth 4 | 15.62% faster |
| Actual classic nested closures, depth 8 | 34.53% faster |
| Shallow classic host-expando closures | 0.85% faster; CPU time regresses |
| Nonclassic actual realm | 11.85% slower |
| Scope-only comparator | 16.86% slower |

The regression causes are not isolated. Concurrent machine activity was recorded;
these figures are not confidence intervals or promised Zoom improvements. Earlier
variants are excluded from the final paired figures and remain in private evidence.
Use this candidate only for explicit classic-browser experiments, not a general
SDK upgrade. No publisher source executes in this qualification, and no actual
Zoom deadline is shown to pass. Native integration and live application behavior
are separate gates.

Evidence: `/tmp/agent-browser-sdk-empty-module-ClrIn4/HANDOFF.md`,
`PERFORMANCE.json`, `DIAGNOSIS.json`, `FINAL-VERIFICATION.json`, candidate/build
pin manifests and `union01`. Parent independently verifies 1,946 candidate,
684 emitted-file and 18,356 execution-time hashes before experimentation.
