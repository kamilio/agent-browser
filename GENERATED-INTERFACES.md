# Generated disclosures in terminal and playground interfaces

September 4, 2026. This checkpoint follows `GENERATED-INSPECTION.md` and verifies
the generated-control path through the native interface layers. It does not
close the real terminal, socket, browser or released-runtime acceptance gates.

## Correction

Terminal rows previously omitted snapshot `expanded` and `focused` state, so
opening a disclosure could change the document without showing the control's
new state. Rows now show `collapsed` or `expanded` when that state is present,
and `focused` only for actual document focus. The terminal's selected-row marker
remains separate. This applies to authored summaries as well as generated ones.
Existing ASCII escaping, wrapping, disabled controls and private-value handling
remain unchanged. Playground text already rendered those states; its production
code is unchanged in this checkpoint.

## Integration evidence

Ten new native cases cover generated and authored state display, stable selected
refs across expansion, disabled activation, narrow reflow, focus removal, backend
search-to-scope behavior, replacement invalidation and control-character safety.
Two cases run the actual terminal loop against a native command host using
PassThrough streams with mocked TTY methods, including targeted Space, scoped
search invalidation, polling refresh and teardown. These are not real TTY/PTY
devices or evidence of terminal-emulator compatibility.

Five additional mounted-playground cases use its existing DOM fixtures and
in-memory fetch/command transport. They exercise click and guarded targeted-key
forms, generated screenshot artifact download/decoding, stale capture cleanup,
and the distinction between generated snapshot scope and DOM inspection. They
do not load the UI in a desktop browser or use HTTP/session sockets.

On isolated prior HEAD all ten new terminal cases fail; all five new playground
cases already pass, establishing coverage rather than a claimed playground fix.
The red two-file run reports ten failures and 69 passes, including 64 unchanged
playground cases. Matching focused runs pass 145 tests / six files in both trees.
Both pass types/builds, strict checking of both changed test files and three-file
Biome checks. The new file is explicitly registered in `native-tests.json`.
Authorized full native runs pass 9,422 tests / 271 isolated files. The working
run reports 10,567 passes and the one unchanged pending Window-onload assertion
failure / 293 files; no additional failures remain. The isolated snapshot
contains only this checkpoint on prior HEAD.

Inspected native projection frames retain the same generated ref while changing
from `button: Details [collapsed]` to `button: Details [expanded focused]`, with
the body action appearing below. The evidence lives under
`node_modules/.cache/native-validation/generated-interfaces-`:
`before.txt`, `after.txt`, `frame.json` and `frame.mjs`. These are native view
projections, not terminal screenshots. Test logs use the same prefix.

## Remaining work

Generated style inspection, full outline/focus-visible behavior, authored visual
focus feedback, localization, scoped ordering and UA/shadow/platform accessibility
remain open. Actual terminal/playground usability, real TTY/PTY and socket flows,
live website validation and released SafeJS execution still need their own
authorization and evidence. No gated probe ran; the denied SafeJS probe remains
unrun. Preserve historical reports, unrelated pending work and the original
seven-day browser goal in `TASKS.md`.
