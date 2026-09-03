# Playground viewport controls

The September 3 checkpoint adds confirmed logical viewport inspection and explicit
size editing to the shared-session playground. It uses the same agent command API
as the CLI, rather than changing a preview element's CSS size or fabricating a
device screenshot. No dependency, browser engine, service or default runtime changes.

## Interface

- Width and height are decimal whole CSS pixels, from 1 through 16,384. The bar
  displays the most recently confirmed engine dimensions and scale 1, separately
  from any draft edits.
- Desktop 1280×720, tablet 768×1024 and phone 390×844 presets populate drafts.
  Swap exchanges draft dimensions. Neither changes the engine until Apply size.
  Restore discards edits and fills the last confirmed dimensions.
- Applying sends one guarded `resize` command, then reads the actual viewport.
  Same-tab refreshes preserve unsubmitted edits. Session/tab changes and new
  session incarnations reset the draft. Disconnect clears and disables controls.
- Refresh observes sizes changed by another client. Changed confirmed dimensions
  invalidate the old PNG preview, including revoking its Blob URL. A failed local
  validation does not send a command or discard an otherwise valid capture.
- Controls require a valid confirmed response. Malformed/stale responses disable
  viewport writes without disabling unrelated inspectors. Late responses cannot
  repopulate controls after disconnect or a generation change.
- Empty tabs have inspectable/editable logical dimensions without a fabricated
  document. Their dimensions apply when a real document is subsequently committed.

These presets are **not device emulation**. They do not change device scale,
user agent, touch/pointer support, fonts, color preferences, screen metrics or
network identity. Render/export remains explicit. The existing native capture
axis/pixel/CSS limits still apply; accepting a large logical viewport does not
guarantee that a PNG/PDF of that size fits its resource budget.

## Agent API and stale-target protection

```sh
node packages/browser-agent/dist/src/cli.js viewport
node packages/browser-agent/dist/src/cli.js resize 390 844 --expected-viewport=KEY
```

`viewport` is a read-only additive command returning the selected `tabId`, an
opaque `key`, current document reference or null, width, height, deviceScaleFactor
1, `partial: true`, and profile `logical-css-viewport`. It does not force layout,
execute page JavaScript or mutate the document revision. The key is public target
identity, not an authorization secret or a replacement for the service token.

`resize width height` keeps its original behavior. Optional guards are checked
synchronously before any viewport mutation:

- `--expected-tab=ID` rejects a changed selected tab within the addressed session.
- `--expected-viewport=KEY` additionally rejects another session or a recreated
  session with a reused tab ID. The playground uses this stronger guard.

Tab IDs are session-local and can repeat. Each BrowserSession therefore owns a
fresh platform-generated UUID, combined with the tab ID to produce its viewport
key. Recreating the same named session does not revive the old key. The key stays
stable across ordinary resize/navigation in the same tab: it guards the target,
not the previously read dimensions. This is not a lock against another client
intentionally resizing the same valid target afterward.

Rejected guards return `stale-reference`. No wrong-tab/session write is performed.
The UI also clears state immediately on explicit session switching, so a draft
cannot be submitted while the new session's initial read is pending.

## Evidence and boundaries

- `reports/viewport-controls-focused-final-2026-09-03.json`: **2,318 passes
  across 103 explicit safe files**, including 14 new viewport/API/UI cases.
  The earlier focused report has 2,315 passes before the three cross-session
  protection cases were added. Package compilation, strict changed-test checks,
  lint, formatting and diff-whitespace validation pass.

- `src/playground-capture.test.ts` runs the frontend with a mocked browser DOM and
  fetch transport backed by the actual BrowserCommandHost and native engine.
  It covers Apply, draft-preserving refresh, presets/swap/restore, invalid input,
  external resize, actual resized PNG headers, Blob revocation, tab changes,
  session changes/recreation, disconnect, delayed replies and malformed responses.
- `src/command-host.test.ts` verifies read-only document revision, empty-tab state,
  valid guarded writes, unchanged state on rejection, tab isolation, inherited
  dimensions on navigation, and same-ID cross-session/recreated-session guards.
- CLI parsing and response-validation tests cover the additive command, both optional guards,
  bounded integer input and validated response shape.
- `reports/viewport-commands-safejs-2026-09-03.json` records the initial ten-check
  actual-core agent flow with viewport inspection and the tab-only guard.
  Subsequent final evidence uses the stronger opaque viewport key. The script
  proves responsive interpreted callbacks, agent snapshots, chunked native PNG
  changes/restoration and session cleanup over an in-memory transport.
- `reports/viewport-commands-safejs-final-2026-09-03.json` and
  `viewport-commands-safejs-repeat-2026-09-03.json`: all ten actual-core checks
  pass twice after the stronger viewport-key guard and final compilation. The
  largest serialized command frame is 1,347 bytes in each run. These runs do not
  claim visual playground inspection or resolve the separate alias-identity gap.

No live browser/visual acceptance, new real-website run, Worker deployment or
released-SDK migration is claimed. The separate experimental-runtime global/Window
function-identity failure in `MEDIA-QUERIES.md` remains open. These controls do not
complete the Kitesurf playground or Playwright CLI superset goal.
