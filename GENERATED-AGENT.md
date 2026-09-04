# Generated disclosure snapshots and agent actions

September 4, 2026. This checkpoint connects the generated control identity from
`GENERATED-SUMMARIES.md`, `GENERATED-ACTIVATION.md` and `GENERATED-FOCUS.md` to
native semantic snapshots, locator resolution and session/command actions.
It does not establish complete accessibility or browser compatibility.

## Published contract

- Visible fallback headers appear as separate `button` entries named `Details`,
  with their canonical generated reference, expanded state and generated focus.
  They precede visible body entries and inherit the existing semantic parent
  depth. The host is not falsely marked focused when its generated header owns
  focus. The host's naming attributes do not rename its distinct generated child.
- Generated entries share snapshot byte, entry, depth and string limits, diff
  identities, scanning and `find` search. A snapshot scoped to a generated ref
  includes only that header, not the details body. Existing leaf-role projection
  and expanded role-locator traversal remain distinct partial profiles.
- Direct generated references and unique `getByRole` targets resolve through the
  canonical registry. `generate-locator` returns a role locator only if it round
  trips to the same generated ref. Ambiguity is explicit: it never substitutes a
  host test ID, CSS path or ordinary element reference for the generated child.
- `click`, `hover`, `press --target` and `scroll-into-view` accept generated refs.
  Command readiness and execution both use header-only geometry and hit points;
  a covered header cannot be bypassed by choosing exposed body space. Root-only
  instant scrolling aligns the header's bounds, not its potentially tall body.
- Targeted key dispatch verifies the complete focus reference after focus events,
  including awaited handlers. Same-host generated/ordinary focus redirection is
  not accepted as successful targeting. Scroll events similarly revalidate a
  replaced header or one whose box disappears before action continuation.
- A shared bounded ARIA-disabled ancestry check keeps generated snapshot state,
  click readiness and execution aligned. Hover remains allowed for disabled
  targets, and readiness retries only through the existing bounded wait owner.

No DOM child, text content, page selector alias, reflection or runtime dependency
is added. CSS/text/test-ID locators retain DOM semantics. DOM-only editing,
style/geometry inspection and element-cropped capture commands are not silently
retargeted to the host; generated support for the latter inspection/capture paths
remains a follow-up. Full-page captures include the generated rendering.

## Native evidence

The 51 new cases produce 40 failures and 11 passes on isolated prior HEAD.
Matching focused runs pass 334 tests / 12 files in both working and isolated
trees. Both pass types/builds, strict checking of both new tests and ten-file
Biome checks. Both test files are explicitly registered in `native-tests.json`.
The command fixtures use injected in-memory transport, not live websites or
real session sockets. Authorized full native runs pass 9,370 tests / 268 isolated
files. The working run reports 10,515 passes and the one unchanged pending
Window-onload assertion failure / 290 files; no additional failures remain.
The isolated snapshot contains only this checkpoint on prior HEAD.

An actual native command sequence used a role locator to click the fallback,
then fetched full-page screenshot artifacts through `artifact-read`. The
280-by-160 before/after PNGs were visually inspected: the marker changes and the
green body appears, while snapshots keep the same generated ref and report
expanded/focused state. The captures are 3,434 and 4,940 bytes respectively.
Artifacts, script and snapshot/capture metadata are retained under
`node_modules/.cache/native-validation/generated-agent-capture` with suffixes
`-before.png`, `-after.png`, `.mjs` and `.json`. Test logs use the same directory's
`generated-agent-` prefix. This is native rendering evidence, not a live run.

## Research and remaining gates

Reviewed the current HTML rendering fallback and HTML-AAM summary mapping/name
rules on September 4, 2026:

- `https://html.spec.whatwg.org/multipage/rendering.html#the-details-and-summary-elements`
- `https://w3c.github.io/html-aam/#el-summary`
- `https://w3c.github.io/html-aam/#summary-element-accessible-name-computation`

The browser's existing `button` snapshot profile is intentionally partial; the
current HTML-AAM computed-role entry is `html-summary` and platform mappings vary.
Full platform accessibility, localized labels, UA shadow trees, generated focus
rings, scoped tab ordering and original browser/runtime acceptance remain open.
Next: generated geometry/capture inspection and visible focus feedback, without
turning generated controls into fake DOM nodes. No live website, socket, real
TTY/PTY or SafeJS probe ran; the denied SafeJS probe remains unrun. Preserve the
historical evidence and full seven-day browser scope in `TASKS.md`.
