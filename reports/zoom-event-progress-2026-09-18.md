# Native Zoom progresses through Event dispatch

September18,2026, one fresh native/SafeJS navigation with the existing explicit
`file-paa.zoom.us` exclusion. No Chromium/Firefox/remote browser, publisher source
rewrite, CSP alteration, added exclusion, credential access, clicks or media.
The same-origin native CSRF request continues to succeed.

## Observed result

- Zero-network rehearsal PASS in1.217 seconds, followed by one live attempt.
- Live exits1 in28.776 seconds, without timeout or signals.
- Scripts1–16 pass. The previously failing26,961-byte script16 now passes.
- Script17 fails:417,914 bytes, SHA256
  `a67394b5849e496a457bc375c14f7441043cee097ae620482f404f9de6116828`.
- A public SDK Promise rejection is captured as TypeError; the subsequent
  native wrapper reports `closed`. These are separate observed error layers.
- The exact private error span identifies a `document.createEvent` call in the
  matching captured source. Diagnosis does not reexecute or rewrite the source.
- Parsed counts remain481 nodes,1 form,4 buttons and29 inputs. This is not
  usable meeting UI, admission, audio or notetaking.

Native Event/CustomEvent and capability dispatch use qualified core44. The
explicit experimental K9Y732 SDK package fixes completed synchronous callback
reuse; its only emitted difference from the former ClrIn4 package is `realm.js`.
The preceding unchanged six-case synthetic Event gate passes with full observed
closure. This is not unchanged-SDK validation or default/full SDK acceptance.

## Closure and evidence

All17 wire requests close; pending exchanges, active/queued requests, callbacks,
cookies/storage and SDK retained data reach zero. Owners/session/transport close,
process/group are absent and execution HOME/TMP are empty. There are no mocked
live responses. Separate timer and XHR-owner counters are not exposed by this
runner; no stronger per-owner closure measurement is claimed.

Parent independently verifies9,775 input pins and76 artifact hashes/sizes/modes.
Original private captures remain0600. Raw tokens, query values, headers, bodies
and error fields are not reproduced in this report. The diagnostic observer uses
the public API, preserves the original Promise and records only actual errors.

Evidence root:
`/tmp/agent-browser-event-prefix-live-september18-IR99w2`.
See `HANDOFF.md`, `RESULT.json`, `SCRIPT-ORDER.json`, `NEXT-SOURCE.json`,
`CLOSURE.json` and `ARTIFACT-PINS.json` there. Parent receipt:
`node_modules/.cache/native-validation/zoom-runtime-september18/IR99W2-PARENT-VERIFIED.json`.

The next focused change is genuine legacy Event/CustomEvent creation and
initialization, with uninitialized-dispatch rejection and retained-owner cleanup.
Its native tests, actual SDK integration and subsequent live navigation remain
separate acceptance gates. Earlier filtered and unfiltered failures retain their
original paths, measurements and outcomes. Zoom is not joined.
