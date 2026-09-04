# Generated disclosure focus and keyboard

September 4, 2026. This native checkpoint extends `GENERATED-ACTIVATION.md`;
it does not rewrite that checkpoint's evidence or establish browser parity.

## Contract and implementation

Generated fallback headers have a canonical focus reference distinct from the
ordinary details host. `DocumentFocus.activeReference()` returns the generated
reference while `active()`, page `document.activeElement`, and dispatched focus
and keyboard event targets expose the real host. No fake DOM node is inserted;
ordinary details focus eligibility and its default reflected `tabIndex` stay
unchanged. An explicitly focusable host and its generated header remain distinct
native stops. Switching between them clears held-key intent without dispatching
externally identical host-to-host focus events.

Default Tab/Shift-Tab traversal includes fallback headers and eligible visible
body controls. A negative host tabindex skips the generated sequential stop but
still permits direct generated focus. This uses the existing global ordering;
full shadow-scoped positive-tabindex flattening remains unimplemented.

Direct activation and uncanceled primary mousedown focus the generated header.
Enter activates on keydown; Space arms on keydown and activates on keyup, without
scrolling the viewport. Activation keeps the generated identity while sharing
the existing host's open/group/toggle operations. Keyboard cancellation and
awaited listener redirection retain their native event-action behavior.

Direct authored-summary insertion, disconnection, inertness, enclosing disclosure
closure and canonical registry/document close invalidate generated focus.
Removing the authored summary or reinserting the host does not restore focus.
Hidden/style eligibility is checked through existing focus reads and held-key
change handling; this is not a new eager style-wide focus invalidation system.
Low-level generated focus assignment validates the canonical reference and host
before changing state. Independent registry close cannot clear canonical focus.

Held Space stores both the host and generated/ordinary reference. Same-host
identity changes therefore cannot reuse an armed default. Focus eligibility
reads can themselves clear focus and reenter keyboard change handling; capture
the armed reference before those reads and revalidate any restoration afterward.

## Native evidence

The 49-case file fails all 49 cases on isolated prior HEAD and passes with this
checkpoint. Matching focused runs pass 310 tests across eight explicit files in
both working and isolated trees. Existing keyboard-activation tests reproduced
three intermediate reentrant cleanup crashes (disabled, hidden and style); all
pass after the guard fix, with generated hidden/style regressions added.
Both trees pass types/builds, strict checking of the new test and eight-file
Biome checking. The new file is explicitly registered in `native-tests.json`.

Authorized full native runs pass 9,319 tests / 266 isolated files. The working
run reports 10,464 passes and the one unchanged pending Window-onload assertion
failure / 288 files; no additional failures remain. The isolated snapshot has
only this checkpoint on prior HEAD. Logs are retained under
`node_modules/.cache/native-validation/generated-focus-` with suffixes
`red-49.log`, `focused-working-final.log`, `focused-isolated-final.log`,
`native-working.log` and `native-isolated.log`.
No live website, socket, real TTY/PTY or SafeJS probe ran as part of this
checkpoint; the previously denied SafeJS probe remains unrun.

## Research and remaining gates

Reviewed the HTML Living Standard on September 4, 2026: focusable areas and DOM
anchors, focus navigation scopes, active-element retargeting, and generated
details fallback rendering. Primary references:

- `https://html.spec.whatwg.org/multipage/interaction.html#focus`
- `https://html.spec.whatwg.org/multipage/rendering.html#the-details-and-summary-elements`

The native identity is an implementation boundary, not a full UA shadow tree.
Next: semantic snapshot exposure and agent/locator publication. General CLI
generated-reference routing, accessibility-tree/platform integration, generated
focus rings, full scoped ordering, localization and real-runtime/real-browser
acceptance remain open. The unchanged pending Window-onload assertion conflict
also remains open. Preserve historical evidence, unrelated pending work and the
full browser scope in `TASKS.md`; the seven-day continuation stays active.
