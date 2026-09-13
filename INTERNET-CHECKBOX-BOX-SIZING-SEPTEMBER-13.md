# Internet checkbox replay after native box-sizing aliases

**Three applicable CSS property guards are resolved; the genuine native pointer
click still fails.** This retest uses implemented parser/cascade/CSSOM aliases,
not removal of stylesheet diagnostics or a substituted semantic action.

## Scope and provenance

September 13, 2026, 18:33:38.576–18:33:38.993 UTC: one native BrowserSession
navigation, two semantic actions (inverse and restore), one genuine `session.click`,
two queries and one formatting inspection. Exactly four original resources are
replayed through the normal native loader: HTML 2,008 bytes, application CSS
353,394 bytes, font-awesome CSS 28,747 bytes and PNG 7,660 bytes; total **391,809**.
No asset is edited, dropped or replaced. No fake geometry or fallback action.

This is **zero HTTP**, using September 11 captures. The preceding September 13
HTML-only native GET proved that HTML unchanged at that observation, not current
CSS/image equality or a fresh full-page interaction. Historical measurements and
paths remain unchanged in `INTERNET-CHECKBOX-REPLAY-SEPTEMBER-13.md`.

The runtime comes from the new audited native alias snapshot: 20,672 passed,
zero failed, two unchanged skips; 402 selected files, 401 strict roots, 760 manifest
entries. The replay runner, action implementation, fixtures, process/network guard
and sealed launcher are byte-identical to the previous replay. Only the runtime
pins in its common module and its authorization description change.

## Actual result

| Observation | Previous runtime | Alias runtime |
| --- | ---: | ---: |
| Applicable unsupported-property guards | 11 | 8 |
| Raw unsupported-property diagnostics | 374 | 359 |
| Applicable at-rule / selector / media guards | 8 / 2 / 2 | 8 / 2 / 2 |
| Formatting nodes / visited DOM nodes | 72 / 54 | 72 / 54 |
| Formatting work / deferred subtrees | 695 / 6 | 695 / 6 |
| Stylesheet work | 176,371 | 176,562 |
| Actual pointer clicks attempted / accepted | 1 / 0 | 1 / 0 |

Native `e56` is enabled and initially unchecked; `e60` is enabled and checked.
The semantic calls change `e56` false→true→false and emit six ordered, untrusted
click/input/change events. The separate genuine pointer click then emits **no
events** and leaves it unchecked. Its exact failure is:

```text
Document width resolution requires an issue-free supported formatting profile: css:unimplemented-css-at-rule (8), css:unimplemented-css-property (8), css:unimplemented-or-invalid-css-selector (2)
```

The recorded formatting metrics, inspected existing boxes, six generated table
shells, image state and document revisions are identical. Alias declarations
already had equivalent canonical declarations on the inspected boxes; fewer
guards do not prove a layout change or complete interaction support. Independent
native tests, rather than this still-blocked page, establish real alias geometry.

The remaining property occurrences identified by the prior native attribution
are two text-size-adjust vendor declarations, appearance on a conservatively
unknown pseudo match, cursor, image interpolation mode, legacy `*zoom`, direction
and text-rendering. The at-rule and selector guards remain. The full formatting
profile also retains six unsupported-display, two float, one positioned-layout
coordination and four clearance issues. None is bypassed by this change.

## Resources and containment

One instrumented offline run: **0.41 seconds elapsed, 137,584 KiB / 134.36 MiB peak
RSS**. The prior run was 0.41 seconds and 131.5 MiB. These are single observations,
not a repeated benchmark or evidence of speed/memory improvement; both exceed the
provisional 100 MiB small-page target. Stylesheet work increases by 191 units.

Native queue concurrency remains one, with the same frozen request capacities,
250 ms pacing configuration, 16 adapter-attempt ceiling, one use per fixture,
30-second watchdog plus 5-second termination grace and 10 MiB output cap.
Actual output is 35,448 bytes. No retry, redirect, unexpected resource, new socket,
child-process attempt, page script, SafeJS, credentials, passkey device or real
TTY/PTY access occurs. Seccomp/no-new-privileges guards are active. The supervisor
exits zero because the bounded observation completes, **not because the click
passes**. Its process group is absent after reaping and independently rechecked.
Empty private HOME/TMP directories are removed; session, documents, queues,
cookies, storage, events and images close cleanly.

## Evidence

New replay lane:
`node_modules/.cache/native-validation/native-internet-checkbox-box-sizing-alias-september13/`.
Its 28-entry `EVIDENCE.sha256` is
`479fc80c20a937ec1c1b67babaa8e403dcc6ae7933f5b4214b05e5fb593d1543`.
Parent verification:
`node_modules/.cache/native-validation/box-sizing-alias-work-september13/REPLAY-VERIFICATION.json`.

The parent checks the old sealed replay, fixture/metadata hashes, unchanged
action harness, source/compiled inventories, native release receipts, exact
before/after diagnostic differences, process absence and cleanup. The first
parent seal attempt used the framework-pin shape for fixture records; it failed
before creating a seal. Correcting that verifier requires no runtime change or
website rerun. The sole website observation remains intact.

Native audit SHA-256:
`9d535bc4a245f2b7dad410c89b311b33b98b7b15e6cfbdf7625fd3cd3966a74a`.
Source inventory:
`06efdf06f9dbd414b70f3be9120dbcb4ddf7d2e5ded0fa9ed7aff616f142d7f8`.
Compiled inventory:
`7bac0466ffef4a6488a2bf0f62129e8f99a778eca9473986a0b4bccdaf79c4c1`.

The overall browser goal remains **ACTIVE**: full website interactions,
compatibility, repeatable performance, research and separately authorized device,
credential, SafeJS, socket and TTY acceptance gates are not completed here.
