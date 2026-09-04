# Five-hour browser integration sprint

The user authorized up to twenty subagents on September 4, 2026 at approximately
14:10 UTC and stated that five hours remain. The current execution deadline is
therefore approximately **19:10 UTC on September 4, 2026**. This compresses the
schedule; it does not redefine the browser outcome or prove any acceptance gate.
`TASKS.md` retains the original scope and `SEVEN-DAY-PLAN.md` retains its history.

## Continued execution

On September 4, after the audited checkpoint, the user requested continued work
until explicitly told to stop. The original 19:10 UTC deadline remains a historical
sprint target, not the current stop condition. The overall seven-day browser scope
and separate probe authorizations are unchanged. Two original workers resumed for
mixed-node highlighting and a reproduced exhausted-fetch-budget admission defect;
main has integrated scoped native editing Range cleanup. Standard XHR still needs
the missing public runtime construction/live-property capabilities, not a renamed
internal factory. Original checkpoint measurements and then-closed lane states
below remain historical.

The scoped Range checkpoint passes 11,016 native tests / 327 isolated files and
reports 12,147 passes with the same fifteen pending failures / 349 working files.
The two manifests are identical; 22 preexisting uncommitted files exist only in the
working tree. EDITABLE-RANGE-LIFETIME.md records nine new tests, verified compiler
and focused-suite runs, failure cleanup and byte-identical eleven-phase captures.

## Delivery checkpoint — September 4, 17:48 UTC

The integrated native checkpoint is committed through `6a29502`, before the
19:10 UTC deadline. Eight distinct subagents contributed across delivery and
independent review, with at most six concurrently; all are closed. Twenty was
the user's ceiling, not a worker-count target. Twenty-four focused commits since
the 14:10 UTC acceleration request contain only reviewed new deltas; no push.

- Editing: shared live Range/Selection, editable fill/type/delete, paragraph
  split/merge, focus options/scrolling, bounded Range geometry, glyph/terminal
  carets and same-text selection backgrounds.
- Layout: preserved pre-wrap text, bounded absolute/fixed positioning and reuse
  of equivalent static-position anchors without raising layout budgets.
- Commands: native cookies and double-click; owned file selection and visible
  controls; private CLI upload through protocol/host/session with injected
  transport, capacity cleanup and guarded acknowledgement lifetimes.
- Integration: explicit runtime adapter selection and public-contract focus
  registration, with native reentrant teardown regressions; playground extraction
  downloads and example discovery. Real runtime and playground acceptance remain
  separate, open gates.

Final explicit native suites report **11,007 passes / 326 isolated files** and
**12,138 passes with fifteen pending failures / 348 working files**. Both trees
use the same 348-entry native-tests.json: 22 preexisting uncommitted test files
exist only in the working tree. No test name is removed to obtain a green archive.
The fifteen failures are thirteen old positioning expectations, one pending
command-capability assertion and the unchanged Window-onload assertion. They are
not represented as a green working run or bundled into unrelated commits.

The final audit compares all 987 non-report committed files byte-for-byte with
the tested archive, verifies the unchanged package/lockfiles, preserved onload
test and empty index, and records the exact failure names. It excludes 620
historical report paths from that archive comparison rather than rewriting them.
Evidence is at node_modules/.cache/native-validation/browser-sprint-final-audit.json.
The eleven-phase host comparison and ten new module images are described in
EDITABLE-SELECTION.md; earlier capture paths and measurements remain intact.

This is a tested native improvement checkpoint, **not a completed browser or
seven-day acceptance pass**. Priorities after this checkpoint are policy-preserving
XHR, broader rich/control/visual selection and the original runtime, real service,
socket, live-site, real TTY/PTY and framework/playground gates. The gated probes
need separate authorization; the previously denied SafeJS probe remains unrun.
TASKS.md and COMPATIBILITY.md retain the full outstanding outcome.

## Delivery lanes

| Lane | Assignment | Integration boundary |
| --- | --- | --- |
| Main | Selection integration and native regression review complete | Combined native tests pass 11,007 / 326 isolated files; working tree retains fifteen pending failures. |
| DOM worker | Paragraph merging delivered; worker closed | Native merging is integrated; original paragraphs and worker evidence are preserved. |
| Focus-bridge worker | Native provisioning/resource/revocation stress | Both deliveries are integrated natively; public/runtime limits and URL constructor blockers remain explicit. |
| Focus delivery | Native focus/blur options, indication and scrolling | Public-contract bridge is integrated natively; released guest execution remains unverified. |
| Cookie delivery | Cookie list/get/set/delete services | Production wiring and actual CLI tests integrated; 9,765 isolated native tests pass. |
| White-space delivery | Native pre-wrap formatting and hanging spaces | Integrated, with fresh editable captures and 9,854 passing isolated native tests. |
| Double-click / upload-server worker | Upload host/session delivery complete; worker closed | Native dispatch is integrated; actual socket authentication remains gated. |
| Positioning / range-geometry worker | Bounded same-text selection highlighting integrated; worker closed | 31 worker tests plus parent actual-host coverage; superseded caret assertion now checks highlights and exact blur restoration. |
| Runtime / upload-client worker | CLI and six cross-boundary cases complete; worker closed | Actual native client/host path passes with injected transport and real private files. |
| Playground delivery | Extraction/snapshot downloads and honest example discovery | Integrated export guards/cards pass 9,882 isolated native tests; live UI/framework gates remain open. |
| File-selection / rendering worker | Terminal preserved-break carets delivered; worker closed | Helper-only extension and 33 native tests pass combined native validation. |
| Independent upload reviewer | Reservation and manager/retained-owner closure defects reproduced; worker closed | Replacement v2 guards and four regressions pass combined native validation. |
| Independent focus reviewer | Final-registration teardown defect reproduced; worker closed | Guard integrated with four first/final document/runtime teardown reproductions. |

Workers use isolated snapshots at their explicitly recorded bases, not the dirty primary tree.
They return code, explicit tests, source paths and integration notes. Main reviews
and merges bounded deltas, validates combined behavior, and commits only new work.
Additional workers are permitted up to the user's cap when their assignments are
independent and advance the browser, not merely to maximize agent count. The
environment accepted six concurrent agents and rejected a seventh with its thread
limit; all workers are currently closed after delivery. The initial source audit queued cookie
commands, double-click, file selection and policy-preserving XHR; fresh capture
evidence also queued white-space:pre-wrap. Current delivery state is tracked above.
XHR remains queued, and agent authorization alone proves no acceptance gate or
twenty-agent concurrency.

## Time allocation

- First 60–90 minutes: deliver independently tested feature patches and finish
  the in-progress editable-fill checkpoint.
- Middle window: integrate shared ownership boundaries, test actual command and
  in-memory page-binding paths, inspect native captures and resolve regressions.
- By approximately 17:45 UTC: prioritize integration over starting large new
  lanes; reserve remaining time for explicit native suites, failure paths,
  resource/lifetime checks and an honest release assessment.

## Non-negotiable boundaries

The TypeScript browser remains independent of Chromium, Firefox and remote
engines. SafeJS remains the only approved page-runtime dependency. No additional
dependency, broad dirty-work commit, push, fabricated browser API stub or altered
historical measurement is authorized by the acceleration request.

Live-site, socket, real TTY/PTY and SafeJS probes still need separate permission.
The previously denied SafeJS probe must not be retried. Native fixture success
does not establish those gates or synchronous guest-runtime compatibility. The
existing pending Window-onload assertion failure remains separate from new work.

Completion remains unproven until the full requested outcome has appropriate
evidence. The deadline is not permission to mark incomplete browser requirements
complete or to replace them with a smaller project.
