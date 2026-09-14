# Auto-height fieldset content in native tables

## Root cause and focused correction

The captured man7 recheck recorded in
`MAN7-TABLE-WIDTH-RECHECK-SEPTEMBER-14.md` passed the previous percentage table
width guard but stopped at `Percentage cell descendant heights require table
reflow`. Static inspection of the unchanged captured HTML and stylesheets finds
no authored percentage height/min-height/max-height declaration. The search
form instead contains an auto-height fieldset inside a table cell.

The native fieldset formatter formerly manufactured `height:100%` for every
anonymous content wrapper. An auto-height owner's wrapper has no definite height
basis, so that generated percentage already resolves like auto in supported
normal flow. However, the table preflight rejects percentage-height dependencies
before resolving them, including this unnecessary internal one. Synthetic native
fixtures reproduce the exact failure with the same table/div/form/fieldset shape.
The captured census does not identify the individual failing descendant, so the
attribution to this particular man7 fieldset remains a strong static inference
until a new captured observation runs on the adopted fix.

`fieldsetContentStyle` now preserves **auto** for an auto-height owner. Non-auto
owners retain the existing **100%** content representation and definite-height
behavior. Padding transfer, ownership, independent formatting contexts, public
DOM identity and intrinsic sizing remain unchanged. Only one production
condition changes. The table reflow guard is unchanged; this is a correction at
the source of a false dependency, not suppressed validation or invented geometry.

## Native coverage

Two new suites contain **29 cases**:

- `src/fieldset-table-auto-height.test.ts`: 23 layout/helper cases covering
  separate/collapsed tables, taller sibling rows, natural height and transferred
  padding, empty/nested fieldsets, min/max-constrained auto owners, width-driven
  wrapping, frozen prior geometry, style invalidation and retained authored
  percentage-height/min/max/mixed-math guards.
- The same suite covers inline/inline-block fieldsets in table atomic layout,
  plus normal-flow percentage children under constrained auto owners and a
  definite percentage-height owner control. These four cases address both
  specific coverage findings from independent review.
- `src/fieldset-table-interaction.test.ts`: six cases using only synthetic
  in-memory transport, with div/form wrappers, text/hidden/submit controls and
  a following discovered link. Actual geometry, exact raster pixels, hit targets,
  text-control focus, mouse event coordinates/order, ordinary navigation,
  canceled clicks, resize/padding invalidation and owner cleanup are asserted.

The existing fieldset ownership case changes its internal auto-wrapper style
expectation from 100% to auto; all its public geometry/identity assertions stay.
Its case name and status remain unchanged. Existing definite-height, border-box,
legend, table and percentage sizing controls remain part of the native profile.
No new dependency, third-party browser, live request, SafeJS, credential provider,
passkey/device or real terminal probe is introduced.

## Validation record

The clean candidate starts from `74947b5dc88a172eb6bdd12ae36ce4bb4668ca1d`, not
the dirty root worktree. Its explicit native selection extends the previous
audited 480-file profile with these two manifest entries. The same two previously
excluded cases remain excluded; no additional test is silently omitted.

- `red00`: initial layout regression run, 8 pass / 11 fail. Ten positive layout
  cases hit the exact percentage-height guard; the direct wrapper assertion also
  fails. Build, strict checking and formatting pass.
- `green00`: 18 pass / 1 fail after the production fix. The remaining assertion
  incorrectly expected initial min-height 0px, whereas the repository uses auto.
  The expectation is corrected; no production min-height behavior changes.
- `red01`: corrected first 25 new cases against old production, 8 pass / 17 fail.
  `focused00` passes 313 cases across 11 files on the corrected implementation.
- `red02`: all 29 final new cases against byte-identical old production, 10 pass
  / 19 fail: 18 exact table guards plus the direct wrapper-height assertion.
- `focused01`: **317 pass, zero failures/skips**, with build/strict/format pass,
  at **15:11:41.527–15:12:03.516 UTC on September 14, 2026**. Final new-test bytes
  are identical to red02, so the red/green comparison does not weaken assertions.

The earlier runs and incorrect initial test expectation remain in the evidence
lane. The final-source full profile is tracked separately from the earlier
release00 run, which started before four review-driven cases were added.

**Final release01 passes 23,851 tests with zero failures and two unchanged
exclusions**, across 482 selected files / 481 strict roots, with build and
formatting passing. It runs at **15:12:15.777–15:18:52.589 UTC on September 14**;
the native phase is 15:12:36.611–15:18:52.324. All 23,824 previous case occurrences
(including two exclusions) are preserved, with 29 new passes and no case-name
migrations. The source inventory has 2,941 files; the compiled inventory has
2,200. Both new manifest entries are in the clean 834-entry manifest.

The parent audit passes at 15:19:35.571 UTC. Its initial attempt incorrectly
decoded a historical PNG Git blob as UTF-8 when checking unowned files; it stopped
before writing its final audit. Comparing raw blob bytes corrects that metadata
bug without changing the image, native source or test evidence. The final audit
checks all unowned Git files, identical final red/green test bytes, unchanged
baseline case identities and all selected command outcomes.

## Limits and next action

This is not general percentage-height reflow support. Authored percentage
height/min-height/max-height descendants remain guarded in table cells. Explicit
non-auto fieldset heights there still generate the existing 100% wrapper and
remain unsupported. Direct flex/grid-item, floated and out-of-flow fieldset
special formatting is not admitted by this change. Existing rendered-legend
and other layout restrictions remain.

The native tests establish supported geometry, painting and synthetic interaction
behavior, not man7 acceptance, live-site availability, CAPTCHA handling or a
performance improvement. The recorded man7 flow still has its original failed
outcome. Next, authorize one separately bounded recheck of its unchanged captures
against the adopted audited runtime, without retries, forced clicks, fallback
navigation or invented assets. The missing date(1) destination capture remains
an independent limitation. Broader complete-corpus/live coverage, original
research, providers/passkeys, devices and challenge handoff remain open.

## Evidence

Execution lane: `/dev/shm/agent-browser-fieldset-auto-height-september14/`.
Static capture investigation:
`/dev/shm/agent-browser-cell-height-investigation-september14/FINDINGS.md`.
Its exact bytes are also copied into this feature lane as `CAPTURE-FINDINGS.md`.
Native runs retain immutable snapshots, explicit selections, source inventories,
command exit statuses and JSON results. `REVIEW.md`, `REVIEW-RESOLUTION.md` and
`VALIDATION-NOTES.md` retain the independent review and corrections.

The final `release01/AUDIT.json`, adoption and post-commit records are distinct
from the focused run. The durable archive and byte-identical final-release copy
are under `node_modules/.cache/native-validation/fieldset-auto-height-september14/`;
`PERSISTENCE.json` records verification, not a second execution. Historical reports,
42 pre-existing dirty tracked files, the original TASKS/manifest residuals and
697 original untracked file hashes are preserved. This increment is not pushed.

| Final artifact | SHA-256 |
| --- | --- |
| Native JSON results | `307363a3a4aacd0a888e43f1ea440476cbf692d1ed5b561dd427f8f2d20e4997` |
| Source inventory | `553cdcfc6b089962f9f6050eaed9e50c420adc840864a69da325597112b9d8c6` |
| Compiled inventory | `d694aed7a96e06f3c973b239bddbab343f46798042d959a32baf7c1b64a69906` |
