# Native public-form rendering prerequisites

September 13, 2026. Implements groove borders and a distinct software time-value
appearance, motivated by the captured HTTPBin form. These are prerequisites,
not completion of the form: visible legend layout and border interruption remain
unsupported. No guard is removed without its corresponding rendering behavior.

## Groove borders

The native CSS parser, declaration support checks, border geometry and rasterizer
accept `groove`, including physical-side styles and border shorthands. Actual
border widths participate in box sizing and hit testing. The existing fieldset
profile can therefore admit its default 2px groove border when no visible legend
or other unsupported descendant prevents layout. Existing anonymous content-box
ownership and fieldset sizing remain in use.

The explicit native appearance divides each side at half its used width. Outer
top/left halves are dark; outer right/bottom halves are light; inner halves reverse
those shades. For each RGB channel, dark is `floor(channel / 2)` and light is
`floor((channel + 255) / 2)`, preserving the specified alpha. Pixel centers use the
existing normalized nearest-side ownership, with top/right/bottom/left tie order;
the midpoint belongs to the outer half. A corner pixel is composited only once.
Transparent owning sides do not borrow an adjacent side's color.

This is an explicit native/UA shading and midpoint policy, not a claim that the
specification mandates these coefficients or that other browsers share identical
pixels. Native primary-source extraction of the CSS Backgrounds and Borders
definition confirms the carved-in relief and lighter/darker-color technique. It
does not establish a universal shading algorithm; its corner note specifically
concerns joins of different border styles. The native excerpts and seals are in
`node_modules/.cache/native-validation/native-groove-source-september13/`.

Solid/dashed behavior and dash offsets remain unchanged, including mixed-style
sides. Work is charged before pixel writes over the clipped raster rectangle:
10 units per candidate pixel for solid, 16 with dashes, plus four when groove is
present. Offscreen, zero-width and transparent behavior retain bounded handling.
Rounded/image borders, unsupported styles such as ridge, outlines and collapsed
table-border rendering are not added by this change.

## Time value appearance

HTML `input[type=time]` has its own `SoftwareControl.kind` rather than pretending
to be a text input. It displays the existing sanitized 24-hour value, including
seconds/fractions when present, or the empty marker `--:--`. Its intrinsic width
is twelve AgentMono advances plus twelve pixels: 84 by 16 pixels at font size 8,
and 156 by 24 at font size 16. CSS sizing still controls the painted rectangle.

The caption path supplies existing focus/disabled appearance without a text
caret, selection, placeholder, segmented keyboard editor, spinner or picker.
Native agent fill, validity, min/max/step checks, reset, mutation and form
serialization use their existing value model; out-of-range actual values are
not replaced by invented clamped display values. Inert/read-only/disabled behavior
retains existing action restrictions.

Inapplicable size/rows/columns and placeholder text do not enlarge this control.
The existing document-level HTML `width`/`height` presentation-hint rejection is
deliberately retained and tested separately, even though its software descriptor
does not use those attributes. This remains a compatibility limitation, not a
claim of complete HTML attribute handling. Other unsupported calendar, range and
color appearances remain outside this change, as do locale-aware or OS controls.

## Focused verification

Three new suites contain 119 cases: groove raster 34, groove document 23 and time
control 62. They include independent pixel literals, actual document geometry,
mixed border ownership, clipped work budgets, CSS parsing/mutation, native pointer
focus and a legend-free fieldset form submission through a mocked transport.
That unit fixture is not evidence of a live HTTPBin submission.

The initial green 20-file pair on old production records **844 passed / 98 failed /
zero skipped**; candidate production records **942 passed / zero failed / zero
skipped** across 20 files. All 119 new cases pass; 98 fail on old production and
21 exercise preserved negative/invariant behavior. Build, strict test compilation,
scoped formatting and immutable-source verification pass for both focused lanes.
The candidate ran September 13, 2026, 19:20:57.289–19:21:16.013 UTC.

The earlier executed pair is retained: old production 844/96, candidate 935/5.
All five candidate failures were new document assertions that combined time sizing
with unsupported HTML width/height hints. Final tests separate those expectations
and add two explicit document-rejection cases; no production guard was relaxed.
Earlier baseline00/fixed00 preparations failed before any build/test command
because two pre-existing untracked suites were absent from the clean snapshot.
Those files were not imported into the patch, and the failed preparations remain.

Four existing suites also join the broader validation selection: control pointer,
calendar fill, calendar value sanitization and pointer activation. The existing
fieldset unsupported-style case now uses ridge instead of the implemented groove;
it remains an unsupported-style rejection test.

The first broader run, round00, is preserved as incomplete: build, strict types
and formatting pass, but the runner's 6,000,000-byte subprocess buffer cannot hold
the native JSON result. It records `SIGKILL`/`ENOBUFS` and 6,029,312 truncated output
bytes, not a complete test result. The fresh round01 harness permits a bounded
10 MiB subprocess output without changing production behavior, browser work limits,
selection, guards or timeouts. This is a harness capacity correction, not a
browser performance improvement or grounds for claiming the failed run passed.

Round01 produces a complete result: **20,947 passed / five failed / two unchanged
skips**. Its five failures are existing assumptions that every default fieldset
must defer. Four negative fixtures now exercise genuinely unsupported visible
legends, preserving centered-layout, hover, advisory-media and clearance guards.
The intrinsic-profile case instead checks supported default fieldset/content
ownership. No production code or guard changes to accommodate these five tests.

The expanded final focused pair uses identical sources across 25 files: old
production **1,070 passed / 99 failed / one unchanged skip**, candidate **1,169
passed / zero failed / one unchanged skip**. The one additional old-production
failure is the updated positive fieldset case; all 119 new cases still pass.
Build, strict types, scoped formatting and immutable-source checks pass. The
candidate ran 19:34:17.811–19:34:40.088 UTC. The retained skip is the already
excluded advisory-media unsupported-display case, not a new exclusion.

## Broader native gate

The final isolated round02 run records **20,952 passed / zero failed / two
unchanged skips**, September 13, 2026, 19:35:05.248–19:39:58.997 UTC. Build, strict
types, scoped formatting and source integrity pass. It selects 409 files and 408
strict roots from 763 manifest entries, leaving 354 unselected. The existing
host-object-ceiling and advisory-media display exclusions remain explicit;
all executed tests pass, not every selected case.

The audited snapshot contains 1,304 source and 2,124 compiled files. Its 1,289
unowned tracked inputs match parent `2ed8556f76ee78eb36aed604530a889c522e0600`.
The final ownership scope includes the five related existing-test corrections.
Audit and receipt ledgers are retained in
`node_modules/.cache/native-validation/native-public-form-rendering-september13-round02/`.
Earlier failed/incomplete lanes are preserved separately. This is isolated native
validation of the owned patch, not acceptance of unrelated uncommitted work.

## Acceptance boundaries

The captured page must still pass genuine whole-document layout, visible legend
ownership/positioning, interrupted border paint and native pointer submission.
No semantic-submit fallback, invented rectangle, stripped stylesheet or fabricated
echo response is acceptable. Standalone deterministic checks do not demonstrate
fresh website access, broad browser compatibility or repeatable performance.

No Chromium/Firefox/remote engine, new runtime dependency, page SafeJS execution,
credential/provider access, passkey-device operation, real TTY or network service
is introduced. The overall goal and remaining acceptance gates stay in TASKS.md.
