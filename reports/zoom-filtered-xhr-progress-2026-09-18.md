# Native Zoom now executes the CSRF request and fifteen scripts

September 18, 2026. This fresh filtered run uses native core37 and the unchanged
qualified experimental ClrIn4 SafeJS package. It does not establish unfiltered
compatibility, usable meeting UI, admission or notetaking.

## Result

The zero-network rehearsal passes in 1.173 seconds. One fresh live navigation
then exits with failure in 20.860 seconds, without timeout or cleanup signals.
Scripts 1–15 execute successfully. Script 11, the previously failing 15,722-byte
CSRF middleware, now passes in 1,079.000 milliseconds. Its unchanged SHA256 is
`02f01a8ee7005d232675e4868311effe221225601fba81934fb54333ea9b5a2f`.
One native same-origin POST completes with HTTP200 during that evaluation.
The journal labels it `fetch`; attribution to synchronous XMLHttpRequest also
uses request timing and the captured source's statically established contract.
No token, request-header, response-header or response-body values are published.

Script 16 is the next failure: external JavaScript, 26,961 bytes, `script-error`
after 1,905.455 milliseconds, SHA256
`3258940d51f736d6d58b6b98af4617a0450545f16e307c3e72d308c7ff6b3d8e`.
The runner does not expose its original guest exception. Static inspection finds
a CustomEvent polyfill accessing `window.Event.prototype`, plus window event
dispatch; those native page capabilities are absent in this candidate. This is
a concrete compatibility gap, not a dynamically proven sole cause. A subsequent
single offline replay matches thirteen source hashes, then stops at its strict
source-order guard before evaluation fourteen. It does not recover the error;
asynchronous readiness and incomplete captured header/cookie state limit replay.

## Scope and closure

Exactly one explicit origin remains blocked: `https://file-paa.zoom.us`.
Its optionality remains unknown. No other filter, source/CSP rewrite, browser
substitution, credential access, click, admission, recording or media operation
is used. Earlier unfiltered timeouts and the earlier filtered failure remain
unchanged.

Final document: HTTP200, one redirect, 158,521 bytes. The loader discovers47,
executes15, skips30 and fails2 scripts, including the explicit policy denial;
six external scripts are counted. Parsed481 nodes, one form, four buttons and29
inputs are not usable-UI evidence. Sixteen actual HTTPS responses transfer
254,420 encoded and1,086,822 decoded bytes; all sixteen wire handles close.
Session, transport and SDK owners close; remaining SDK data/retained values,
cookies and storage are zero. Process/group are absent and private HOME/TMP
are empty. Separate XHR-owner/timer counters are not exposed by this runner.

Parent independently verifies7,097 input pins and71 artifact pins. Live evidence:
`/tmp/agent-browser-full-zoom-xhr-september18-GgKT64/HANDOFF.md`.
Unsuccessful offline diagnosis:
`/tmp/agent-browser-zoom-script16-offline-MePst3/HANDOFF.md`.
Private captures remain private; the exact source is not copied into this report.

Next gates: genuine native Event/CustomEvent and dispatch integration, isolated
actual-SDK verification, another fresh Zoom run, usable UI, legitimate admission,
native incoming audio, permitted recording, transcription and verified delivery.
