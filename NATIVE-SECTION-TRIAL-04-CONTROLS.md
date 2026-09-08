# Trial04 isolated native controls

## Authorization and scope

On September 8, 2026, the user explicitly approved the isolated 23-case
native-control check, excluding website browsing and credential access. The
earlier denial remains preserved in
`node_modules/.cache/native-validation/native-section-trial-04/NATIVE-CONTROLS-DENIED.md`.
The fresh approval-service request timed out; its one identical retry was
approved. The actual check ran once, with the unchanged reviewed command.

Only owned synthetic fixtures were exercised. No source extraction, independent
source-verifier main, historical source receipt access, website browsing,
credential access, real device, SafeJS, TTY, or full-suite acceptance is claimed.
The intentional network-negative case was intercepted, not forwarded.

## Observed result

- Runner: September 8, 2026, 21:40:45.685–21:40:47.455 UTC; 1769.868545 ms.
- All 23 planned cases were attempted, completed and passed; none failed,
  remained unrun, or lacked a record.
- Recorder: 21:40:44.413–21:40:47.588 UTC; passed, unchanged identities,
  not interrupted. Payload exit 0, null signal/reason, zero-byte streams.
- Bootstrap, recorder and launcher exit codes were 0.
- Parent namespace: `net:[4026531840]`; active namespace: `net:[4026532853]`.
- Recorded historical-read attempts and forwarded network calls were zero.
  These instrumentation observations are not a global syscall trace or a
  complete hostile-host sandbox guarantee.

## Evidence and audit

Evidence is under `node_modules/.cache/native-validation/native-section-trial-04/`:

- `native-controls-validation-01/action-01/RESULT.json`:
  SHA256 `73b42dc0411cbf08d20d234b3baeb68904bea8fe2768a1d58870f4b0289967c3`.
- `controls/execution-HVD0EG/SUMMARY.json`:
  SHA256 `ac8aaec1e8a4b2f692eee33548faa54ce44d716b7f8c0b934b724d158e4d7f98`.
- The 31-entry authority and recorder PRE/POST inventories agree:
  SHA256 `8baa32626c7951f66589f0423702b375b708c781cd646a0d08fa9e67077c0431`.
- Both 1748-entry engine inventories agree with the reviewed frozen inventory:
  SHA256 `9d23cc14500ec63d575f8c9a97fb3baab36f36aef3d13fb767c05a6cb4251bf7`.
- Runner INPUT/FINAL-INPUT inventories agree across 1765 entries:
  SHA256 `f79774b95cc16aedc4d72b5252417848d67f2ddbc3ab6320cc3935e59bc8d074`.

A post-run data-only audit checked all 23 distinct case records, their ordered
membership, successful statuses and fixed input/namespace observations. It
compared the paired inventories and rehashed all 31 ordinary authority inputs;
the latter log is `/tmp/native-section-trial-04-native-parent-input-audit.log`.
This audit did not rerun tests or read any historical receipt.

The reviewed limits remain: 8 seconds per case, 110 seconds aggregate,
125+5 seconds namespace launcher, 140+5 seconds capture, 150+5 seconds outer.
Startup/final publication outside the outer timer and monitor overshoot remain
limitations; no hard-real-time or escaped-descendant guarantee is inferred.

## Outstanding gates

This result closes only the approved synthetic native-control prerequisite.
Trial04/trial05 source extraction and independent source verification remain
unrun; neither new section's prose is admitted. The provisional passkey
projection is not thereby integrated or qualified. Website, credential, device,
vault and other separately gated acceptance work remains unauthorized by this
approval. The overall browser goal is not complete.
