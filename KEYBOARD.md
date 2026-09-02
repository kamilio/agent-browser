# Focus and keyboard actions

Checkpoint: September 1, 2026. This is a bounded native-control subset on our
own document model, not a full keyboard implementation or website JS runtime.
No dependency was added. Controls in the integration probes are constructed by
trusted host code. The later `HTML.md` checkpoint also exercises these actions on
a parsed public form, with no inserted controls or validation bypass.

`NATIVE-SCRIPT-ACTIONS.md` records the later async keyboard/focus paths and actual
SafeJS listener probes. CLI type/press/fill commands use those paths while retaining
their syntax. This still does not enable automatic website scripts.

## CLI and SDK

- `click ref` focuses an eligible control; clicking supported text controls places
  the caret at the end. This is not coordinate-based caret placement.
- `fill ref text` focuses, emits cancelable replacement `beforeinput`, updates
  the value, collapses the caret to the end and emits `input`.
- `type text` inserts printable characters into the focused text control through
  individual key/input events. Existing text is not implicitly selected.
- `press key` executes a supported key or chord and follows supported form/link
  defaults through the owned session navigation pipeline.
- `fill ref text --submit` fills and then presses Enter; it does not call a
  validation-bypassing form method. A canceled fill does not send Enter.
- `snapshot` includes `focused: true` on an emitted focused entry; text output
  carries the same state. `:focus` and `:focus-within` query live focus.

The SDK uses `page.interactions.focus`, `.keyboard.type(text)`,
`.keyboard.press(key)` and `session.press(tabId, key, { signal? })`. Low-level
keyboard results contain intents; only the session layer performs I/O. `press`
CLI data contains `keyboard` and optional `form`/`navigation`; `fill --submit`
also contains `interaction`. Canceled `fill --submit` returns only `interaction`.
Ordinary `fill` retains its existing direct interaction-result shape.

Supported text editing targets are textarea and text/search/url/tel/password
inputs. Supported named keys are Enter, Tab, Space, Escape, Backspace, Delete,
ArrowLeft, ArrowRight, Home and End. Shift supports range selection and reverse
Tab; Control+A and Meta+A select all. Named keys are case-insensitive. Other
modifier combinations and key names fail explicitly before dispatch. Shift
uppercases Latin letter keys; this is not a keyboard-layout translation service.

## State and event boundary

Focus tracks one connected element and one bounded baseline value. Focus/blur
events expose related internal target IDs; focusin/focusout bubble. Changed text
edited through these actions emits `change` on blur. Untouched/canceled/restored
values do not emit a spurious commit. Reentrant focus handlers can redirect the
pending transition. Removal, disabling, hidden/inert ancestors and closure clear
effective focus. Tab order honors positive/zero/negative tabindex and one eligible
radio per group; traversal cycles within the document, not browser chrome.

Typing dispatches keydown, keypress, beforeinput, input and keyup for inserted
characters. Cancellation suppresses the corresponding default. Keyup still runs
after a canceled event or editing failure unless the dispatcher was closed.
Focus/value changes during beforeinput are not overwritten. A focus change
between characters stops the remaining type operation; earlier edits are retained.
Space checkbox/button activation occurs after keyup and respects cancellation.

Caret offsets are UTF-16 indices, with movement/deletion at code-point boundaries.
They are not grapheme-aware or visual/bidi positions. Textarea Home/End use logical
lines. Typed maxlength insertion is bounded; this does not implement complete
maxlength validity state. Readonly controls allow focus/selection, not editing.
Type input is limited to 4,096 code points and 16,384 UTF-16 units; control characters
and unpaired surrogates fail before editing. Use fill for multiline values.

Enter activates the first associated submit button, including an explicitly hidden
default, without moving focus away from the field. A disabled first submitter does
not fall through to another. With no submit button, at most one blocking text-like
input permits implicit submission. Textarea Enter inserts a line break instead.
Validation, submit cancellation, current successful values and GET/POST behavior
use `FORM-NAVIGATION.md`. Unsupported constraints or navigation targets still fail.

The current synchronous keyboard layer returns its submit intent after keyup;
the session then dispatches validation/submit and navigates. Thus the observed
Enter sequence is keydown, keypress, click, keyup, submit, not a claim of native
browser task/event timing. Event objects are untrusted host SDK objects, not page
DOM instances. There is no IME/composition, clipboard, contenteditable, native
selection API, keydown/keyup command state, repeat/lock-key handling, layout-aware
movement, select/radio arrow behavior, iframe/shadow focus or focus-visible.
Legacy keyCode/which/charCode and getModifierState are not implemented.

## Evidence and references

The checkpoint has 714 passing Node tests across 36 files, including a real CLI
subprocess workflow preserving focus/caret between invocations and navigating
through both Enter and fill --submit. The 65 focused portable tests pass on Bun;
this does not enable Bun networking.

`reports/keyboard-navigation-node-2026-09-01.json` records two successful public
httpbingo POSTs after loading real JSON. The command host types, selects, replaces,
deletes a Unicode code point, snapshots focus and presses Enter. Both URL-encoded
and multipart echoes match synthetic values and the default submitter. No raw
response bodies, headers or credentials are retained. Whole-process RSS samples
were 71.6–73.6 MB, not peak/browser memory benchmarks. See `reports/README.md`.

Reference sources inspected September 1, 2026:

- https://github.com/microsoft/playwright-cli — type, press and fill --submit syntax.
- https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission

These references define targets, not proof of conformance. K09/P03/P08 remain
incomplete and `fullPlaywrightCliSuperset` remains false.
