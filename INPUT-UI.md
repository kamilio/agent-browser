# Native keyboard and wheel UI integration

September 4, 2026. This integrates the pending terminal targeted-key prompt and
playground key/wheel controls with the native input engine. It also closes a
wrong-document selector race in playground key input. No runtime dependency or
alternative browser engine is added.

## Keyboard ownership

`press` accepts optional `--expected-viewport` and `--expected-document` flags,
alongside `--target`. They use the existing opaque tab key and root document
reference from tab metadata. Checks run inside the serialized command, before
target resolution, focus or key dispatch. A mismatch rejects with
`stale-reference`, rather than resolving the same CSS selector in a replacement
tab, document or named session. A missing session/document can still fail before
these checks with its ordinary missing-owner error.

```sh
agent-browser press --target='#pick' --expected-viewport=TAB_KEY --expected-document=DOCUMENT_REF -- ArrowDown
```

The uppercase values are placeholders for observed metadata. Either guard may
be supplied independently. Resizing the same tab does not change its identity;
the flags are not size/revision locks, credentials or an exclusive input lease.
Unguarded targeted/focused-key commands retain compatibility. Held `keydown` and
`keyup` do not gain these flags or a new retargeting behavior.

The playground key button sends both guards from its displayed tab and inspected
document. It rejects activation without that retained owner, including during a
session switch or after failed inspection. An observed document replacement
clears target/value drafts rather than carrying an old selector/key into the
new document. Key arguments follow `--`, so option-looking input is not parsed as
a command flag. The native action still determines focus, selection, cancellation
and default behavior; there is no click/fill fallback.

## Human controls

- Terminal: choose an enabled control/link, press `p`, enter a key/chord and
  confirm with Enter. The draft is bounded to 128 code units; Escape or document
  replacement cancels it. It sends the shown native reference, not a fresh CSS
  lookup. Ordinary terminal navigation keys stay frontend controls.
- Playground: choose a reference or unique selector, enter a key/chord in the
  value field, then use the key button. Validated tab metadata supplies its owner;
  keyboard ownership does not depend on obtaining viewport dimensions.
- Wheel: supply finite horizontal/vertical CSS-pixel deltas within ±1,000,000.
  The form sends both tab/document guards through `mousewheel`. It uses the
  engine's shared pointer and does not synthesize a move, focus or modifier reset.
- Input invalidates old capture previews; rendering again is explicit. Invalid
  wheel drafts are rejected before destroying a valid preview. Busy/disconnected
  wheel controls do not queue replacement actions.

## Native evidence

Twelve new command-owner cases cover matching/independent guards, replacement
tabs/documents/sessions, validation before selector resolution, queued navigation,
same-owner resize and legacy/held-key compatibility. Isolated prior HEAD fails
ten and passes two. Six new playground cases reproduce unguarded selector races,
post-failure activation, session-switch activation and stale draft retention;
all six fail before correction. All eighteen pass with the integration.

The thirteen pending playground wheel/key cases and four terminal key cases are
integrated. Two playground command expectations now include the ownership flags.
Native session-backed UI tests retain geometry/PNG differences, stale wheel
rejection, shared-pointer behavior, key effects, error handling and capture cleanup.
Terminal tests use PassThrough streams, not a real TTY/PTY. Frontend tests use
injected DOM/HTTP responses, not a live browser or socket.

Focused validation passes 139 tests across six files in both working and isolated
trees. Both pass build, typecheck, strict checking of four affected test files
and nine-file lint. The explicit native manifest adds only the new key-owner test
file; historical input reports and their measurements are unchanged.

Authorized full native runs pass 9,575 tests across 267 working-tree files and
8,335 across 241 isolated-commit files. These runs use actual filesystem ownership
for the native private-file tests; that authorization does not cover live probes.

## Remaining gates

These controls are not native OS input, IME/clipboard parity, a live wheel surface,
automatic rendering or complete human/agent arbitration. Dynamic same-document
state remains shared, and the manual command box does not add guards for callers.
Real-browser, real TTY/PTY, socket, site and SafeJS acceptance remain separate.
No gated probe ran; the denied SafeJS probe stays unrun. Pending tracing/capture
work remains separate. Next continue capture/export and observability integration
while keeping the complete compatibility ledger and seven-day goal active.
