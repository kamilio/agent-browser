# Five-hour browser integration sprint

The user authorized up to twenty subagents on September 4, 2026 at approximately
14:10 UTC and stated that five hours remain. The current execution deadline is
therefore approximately **19:10 UTC on September 4, 2026**. This compresses the
schedule; it does not redefine the browser outcome or prove any acceptance gate.
`TASKS.md` retains the original scope and `SEVEN-DAY-PLAN.md` retains its history.

## Active work

| Lane | Assignment | Integration boundary |
| --- | --- | --- |
| Main | Integrate focus and upload lifecycle review fixes | Caret painting passes 10,934 / 322 isolated native tests and combined host pixel comparisons. |
| DOM worker | Paragraph merging delivered; worker closed | Native merging is integrated; original paragraphs and worker evidence are preserved. |
| Focus-bridge worker | Native provisioning/resource/revocation stress | Both deliveries are integrated natively; public/runtime limits and URL constructor blockers remain explicit. |
| Focus delivery | Native focus/blur options, indication and scrolling | Public-contract bridge is integrated natively; released guest execution remains unverified. |
| Cookie delivery | Cookie list/get/set/delete services | Production wiring and actual CLI tests integrated; 9,765 isolated native tests pass. |
| White-space delivery | Native pre-wrap formatting and hanging spaces | Integrated, with fresh editable captures and 9,854 passing isolated native tests. |
| Double-click / upload-server worker | Upload host/session delivery complete; worker closed | Native dispatch is integrated; actual socket authentication remains gated. |
| Positioning / range-geometry worker | Geometry/break mappings delivered; worker closed | Parent normalized only cross-tree refs in the flex regression; native command interactions pass. |
| Runtime / upload-client worker | CLI and six cross-boundary cases complete; worker closed | Actual native client/host path passes with injected transport and real private files. |
| Playground delivery | Extraction/snapshot downloads and honest example discovery | Integrated export guards/cards pass 9,882 isolated native tests; live UI/framework gates remain open. |
| File-selection / rendering worker | Terminal preserved-break caret follow-up | Initial glyph-edge integration validated; exact source metadata/paint-order proof required for expansion. |
| Independent upload reviewer | Reservation and manager/retained-owner closure defects reproduced; worker closed | Replacement v2 guards and four regressions remain pending parent integration. |
| Independent focus reviewer | Final-registration teardown defect reproduced; worker closed | Narrow guard and native reproducer delivered; parent integration pending. |

Workers use isolated snapshots at their explicitly recorded bases, not the dirty primary tree.
They return code, explicit tests, source paths and integration notes. Main reviews
and merges bounded deltas, validates combined behavior, and commits only new work.
Additional workers are permitted up to the user's cap when their assignments are
independent and advance the browser, not merely to maximize agent count. The
environment accepted six concurrent agents and rejected a seventh with its thread
limit; one slot is currently active after completed workers were closed. The initial source audit queued cookie
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
