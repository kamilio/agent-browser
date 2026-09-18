# Zoom reaches a Unicode regexp compilation quota

September18,2026. One explicitly authorized retry after the response-less entry
timeout uses unchanged core48, K9Y732 SDK, source/CSP handling, origin exclusion
and all limits. Rehearsal passes in1.217 seconds. Live receives the document and
exits1 in43.841 seconds, without timeout/signals. Scripts1–16 pass.

Script17 is the same417,914-byte bundle, SHA256
`a67394b5849e496a457bc375c14f7441043cee097ae620482f404f9de6116828`.
Its new private SDK rejection is `SandboxError`, code `budgetExceeded`, labeled
`dataSize`:34,722 attempted logical allocation units exceed32,768. The span now
identifies a7,978-byte Unicode regexp literal at offsets109484..117462, rather
than the earlier `document.createEvent` call. The literal SHA256 is
`05c90417e282381c3dbb84481c363ce4e545424dc19970fecc1f799ed0104117`.

Inspection of the selected SDK's `RegexCompileGuard.allocate` confirms that its
separate per-pattern `regexCompileAllocations` quota uses the `dataSize` error
label. This is not evidence of exhausting the browser's16MiB overall logical
data allowance. No budget is changed in this attempt. A private bounded exact-
literal diagnostic is next; any larger allowance needs explicit policy selection
and proof that owner-data, source, steps, depth and matching guards remain active.

All17 wire requests close, with no forbidden attempts, pending exchanges or
queued/active requests. Realm/owners/session/transport close; SDK retained data,
callbacks, cookies/storage and cleanup errors reach zero. Process/group are
absent, HOME/TMP empty. Separate timer/XHR counters remain unavailable here.
The parsed481-node tree is not usable meeting UI or admission.

Parent verifies9,900 input hashes and76 artifact hashes/sizes/modes. Evidence:
`/tmp/agent-browser-legacy-event-retry-september18-TwavUd/HANDOFF.md`, with
`RESULT.json`, `NEXT-SOURCE.json`, `SCRIPT-ORDER.json`, `CLOSURE.json` and
`ARTIFACT-PINS.json` there. Private source/error remain0600 and are not reproduced.
Parent receipt:
`node_modules/.cache/native-validation/zoom-runtime-september18/TWAVUD-PARENT-VERIFIED.json`.

The original initial timeout remains separately preserved. No further retry,
source rewrite, added exclusion, timeout increase, credentials, clicks, media or
alternate browser is used. Native/SDK Event acceptance remains separate from
this still-failing application load. Zoom is not joined.
