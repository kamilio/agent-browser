# Five-hour browser integration sprint

The user authorized up to twenty subagents on September 4, 2026 at approximately
14:10 UTC and stated that five hours remain. The current execution deadline is
therefore approximately **19:10 UTC on September 4, 2026**. This compresses the
schedule; it does not redefine the browser outcome or prove any acceptance gate.
`TASKS.md` retains the original scope and `SEVEN-DAY-PLAN.md` retains its history.

## Active work

| Lane | Assignment | Integration boundary |
| --- | --- | --- |
| Main | Editable keyboard integration, then absolute/fixed layout | Cookie commands, Range/Window, pre-wrap and playground exports are committed. |
| DOM worker | Owned Enter/Shift+Enter and paragraph insertion | Initial editing integration passes 9,951 isolated native tests; paragraph follow-up is active. |
| Focus-bridge worker | Public nested-operation page focus/blur | URL constructor blockers remain explicit; do not publish internal factories as standard globals. |
| Focus delivery | Native focus/blur options, indication and scrolling | Integrated with an additional parent reentrancy fix; synchronous guest methods remain open. |
| Cookie delivery | Cookie list/get/set/delete services | Production wiring and actual CLI tests integrated; 9,765 isolated native tests pass. |
| White-space delivery | Native pre-wrap formatting and hanging spaces | Integrated, with fresh editable captures and 9,854 passing isolated native tests. |
| Double-click worker | Production command/default integration | Initial gesture delivery is preserved; worker now owns command-host/session wiring. |
| Positioning worker | Static-position fallback performance | Main integrates v2 correctness; fresh follow-up targets repeated hypothetical reflow. |
| Runtime worker | Production process/CLI adapter selection | Legacy remains default; explicit extension opt-in and truthful metadata, no actual SDK probe. |
| Playground delivery | Extraction/snapshot downloads and honest example discovery | Integrated export guards/cards pass 9,882 isolated native tests; live UI/framework gates remain open. |
| File-selection worker | Bounded server upload staging and client protocol adapter | Initial selection/private-read delivery is preserved; main integrates shared command/form/CLI hooks later. |

Workers use isolated snapshots based on `c4cf3d9`, not the dirty primary tree.
They return code, explicit tests, source paths and integration notes. Main reviews
and merges bounded deltas, validates combined behavior, and commits only new work.
Additional workers are permitted up to the user's cap when their assignments are
independent and advance the browser, not merely to maximize agent count. The
environment accepted six concurrent agents and rejected a seventh with its thread
limit; all six available slots are in use. A completed source audit queued cookie
commands, double-click, file selection and policy-preserving XHR for freed slots.
Fresh capture evidence also queued white-space:pre-wrap support. These are planned
assignments, not completed features or proof that twenty agents are running.

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
