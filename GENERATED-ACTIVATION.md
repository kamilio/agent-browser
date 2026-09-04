# Native generated disclosure activation

September 4, 2026 continuation of `GENERATED-SUMMARIES.md` and
`SEVEN-DAY-PLAN.md`.

## Activation and target separation

Generated fallback references now work with native `DocumentInteractions.click`
and `clickAsync`. Primary mouse presses/releases on the generated header also
activate it. The existing real `open` attribute, named-group enforcement and
owned asynchronous toggle queue remain authoritative; no separate disclosure
state or fake DOM summary is introduced.

Native action results retain the generated reference. Page-facing mouse/click
events and the outer mouse result retain the real host target. Ordinary synthetic
host clicks do not implicitly activate the fallback; an actual pointer sequence
whose point hits the header can do so. This distinction prevents whole-body
aliasing. Open-body clicks and header/body drags do not toggle the fallback.
Auxiliary buttons and release-without-press do not activate it either.

`resolveVisualTarget` resolves a generated target to its host plus generated
identity without changing ordinary DOM reference resolution. The default-action
path keeps that identity through click dispatch, honors click cancellation and
revalidates fallback availability and actionability before toggling. A handler
that inserts a direct summary, detaches the host, hides it or makes it inert
prevents the pending generated default. Controlled asynchronous listener prefixes
complete before that decision. The existing recursion guard prevents duplicate
activation, and quota failure releases it for a later retry.

## Pointer safety and receiving points

Mouse state records the generated press origin separately from its retargeted
host. Generated activation requires matching press/release identities and a
still-receiving header after mouseup handlers. Two reproduced regressions showed
that falling back to ordinary host activation at this point could instead
navigate an ancestor link. A matched generated press invalidated by mouseup now
ends before click dispatch rather than choosing that unrelated default.

Targeted sequences recheck the generated reference and header hit during pointer
events. `findGeneratedClickPoint` and `findGeneratedHoverPoint` sample only the
generated header rectangles using existing point/rectangle budgets, clipping and
hit testing. They never search an uncovered part of the body to bypass a covered
header. Generated click actionability checks inherited aria-disabled state;
hover remains allowed. Abort, release and close clear generated press bookkeeping.

## Native evidence

The final 37-case file produces 27 failures and ten passes on isolated prior
HEAD. Two additional intermediate regressions reproduce ancestor navigation
after mouseup moved/replaced a matching header; both pass after the guard fix.
Matching focused runs pass 277 tests / eight files in both working and isolated
trees. Both pass types/builds, strict checking of the new file and five-file
Biome checking. `native-tests.json` explicitly includes the new file. Authorized
full native runs pass 9,270 tests / 265 isolated files. The working run reports
10,415 passes and the one unchanged pending Window-onload assertion failure /
287 files, with no additional failures. The isolated snapshot contains only
this checkpoint on prior HEAD.

Native 280-by-160 before/after PNGs were generated through an actual targeted
mouse sequence and visually inspected:

- `node_modules/.cache/native-validation/generated-activation-fit-before.png`
- `node_modules/.cache/native-validation/generated-activation-fit-after.png`

The sequence reports uncanceled generated activation and an open host; native
mousedown, mouseup and click events target the real host. An earlier fixed-height
fixture visibly overflowed its body and remains at the original non-`fit` paths;
the inspected final pair uses auto-height content. These ignored local artifacts
are native evidence, not reference-browser screenshots, released-SafeJS execution
or live-site/CLI-process acceptance runs.

Read-only primary research on September 4 used:

- `https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element`
- `https://html.spec.whatwg.org/multipage/interactive-elements.html#the-summary-element`
- `https://w3c.github.io/uievents/#event-type-click`

## Remaining acceptance gates

Next: distinct generated focus/tab order, keyboard activation, semantic snapshots
and agent/locator publication. Native pointer/direct activation is not proof of
complete keyboard or accessible fallback operation, nor of general CLI generated
reference support. Complete UA/shadow retargeting, localization, event interfaces,
released-runtime and original browser gates remain open. The pending Window-onload
object-to-null assertion conflict stays unchanged. No live-site, socket, real
TTY/PTY or SafeJS probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated work remain separate. The seven-day browser goal is active.
