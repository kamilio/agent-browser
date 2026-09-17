# Isolated gate lifecycle supervisor — September 17, 2026

## Implemented prerequisite, not SDK acceptance

The new host-owned `runSafeJsGate` supervisor requires explicit prerequisite,
guard, pin and acceptance callbacks. It cleans registered process handles across
normal exit, timeout, interruption and exceptions, and separates primary,
cleanup and evidence failures. It supplies no process launcher, SDK loader or
permissive guard implementation by default.

Review found and addressed hostile error accessors, unsafe process-not-found
classification, skipped cleanup when deadline scheduling fails, lost errors
during timer teardown, and cancellation during terminal publication. Cleanup
remains best effort when its clock fails and cannot report unverified absence
as success. Acknowledged persisted snapshots remain distinct from the final
supervisor verdict; writes are not automatically retried.

## Qualification

Clean commit `3adcb07b78eb3682e5aa0810997bd16a7010c63f` plus only the new
supervisor and test file passes **197 native tests, zero failures, across seven
selected files**. The unchanged six-file baseline passes 152 tests. The 45 new
cases use fake processes, deadlines and persistence; they do not launch an SDK
or a real process-group fixture. Final build, selected types, format and lint
pass. All native and quality children/groups close normally; native HOME/TMP
remain empty.

The preliminary candidate also passes 197 tests and build/types, but fails
formatting and three lint checks. Those original artifacts remain; the final
candidate independently reruns all selected checks after corrections.

The canonical 1,014-entry manifest still contains 22 absent committed paths.
This selected gate is not full-manifest, real-process, actual-SDK, live website,
credential, device or TTY acceptance. The separate broader pre-supervisor run
and its failed attempts are not upgraded by these results.

## Public scheduling still unresolved

Three immutable local source files were captured from neighboring SafeJS commit
`8356115f1e56460f83cabc546633beadfafe8371`, committed at 13:08:23 UTC on
September 17. External evaluation still rejects while an earlier callback's
async tail owns the realm. Nested evaluation lacks the required source-result
and per-source options contract. This is a local-source observation, not a
published-version check or another SDK execution.

The historical isolated Python runner and its failed SDK evidence are unchanged.
A concrete reviewed guarded-process adapter, verified dependency closure and a
separately scoped actual-SDK attempt are still needed. The nineteen core and ten
page-extension expectations remain intact; neither fake callbacks nor module
support establish working dynamic websites.

Details: `SAFEJS-GATE-LIFECYCLE.md`. Private evidence:
`node_modules/.cache/native-validation/safejs-launcher-lifecycle-september17/`.
The overall browser, performance, content, access/challenge, authentication and
research objective remains active.
