# Native navigation failure settlement

September 11, 2026: two isolated regression cases verify cleanup after a loader
initializes a partial document and then fails with a resource-limit error. One
case throws directly; the other aborts the caller signal before throwing.
Both eventually settle pending loads to zero, close the partial document,
leave no committed document, and close the session and transport cleanly.

This is not a production counter reset. `BrowserSession` retains pending jobs
until the underlying task actually settles. A promptly rejected outer navigation
can therefore still have a pending job, as the existing deferred-loader tests
require. The historical MDN live run's immediate count of one remains unchanged
and lacks a later sample; these tests do not retroactively prove its settlement.

## Validation

The clean HEAD `3425323` snapshot overlaid only `src/session.test.ts` in
`node_modules/.cache/native-validation/native-navigation-failure-settlement-september11-round01/`.
Build, strict checking, format checking, and the explicit 111-file native suite
passed from 09:40:30.475 to 09:42:09.838 UTC: **6591 passed, zero failed, one
baseline assertion excluded**. All 48 session cases passed, including both new
cases. The manifest stayed at 549 entries; 1006 source files remained unchanged.

Strict checking covers 110 roots, retaining the previously documented
`src/snapshot.test.ts:83` typing exception while including that file at runtime.
The single runtime exclusion remains the independently reproduced
focus-provisioning-pressure total-host-object assertion (expected 6, actual 8).
These exceptions are not new passes. The suite denies networking and performs
no live-site, real credential, TTY/PTY, or SafeJS acceptance probe.
