# Captured MDN background-image abort — September 14, 2026

## Actual outcome

**The captured navigation stops on an uncaptured background SVG; its original
overall verification FAILS.** On committed runtime
`bce6e10f09fbeb5b2c9adbaf7936de8857fbf068`, the native observation runs
**11:49:00.363–11:49:00.726 UTC**. All 19 original responses serve their original
270,288 decoded bytes. Attempt 20 is:

`https://developer.mozilla.org/static/client/high.712917a113e51658.svg`

The ordinary image loader requests it during initial navigation. The closed
fixture adapter denies it before transport and aborts the navigation. There are
**zero wire requests, queries, clicks, destination requests or raster passes**.
The SVG body is neither acquired nor rendered. This is a capture-scope boundary,
not a Cloudflare challenge or evidence of the current click-admission outcome.

The previous letter-spacing observation reached link discovery and failed native
width admission. This observation stops earlier because real background loading
now discovers an asset absent from that historical corpus. No fixture is added,
no request is retried, and no direct-navigation or forced-click fallback runs.

## Failed cleanup snapshot

The unchanged workload takes cleanup metrics immediately after synchronous
`session.close()`. At that instant it records:

| Recorded state | Value |
| --- | ---: |
| Retained document nodes | 2,731 |
| Pending navigation loads | 1 |
| Active request-queue leases | 1 |
| Transport active requests | 0 |
| Session tabs | 0 |

Consequently `cleanupFailure` is true and `observationComplete` is false. The
original verifier passes seven containment/integrity checks but fails native-owner
cleanup; two observation checks pass and one fails. **That failed verifier and
all original result fields remain unchanged.** Image/query owner arrays are empty
because their registration in this workload occurs after successful loading;
they do not prove that the interrupted document had no such owners.

Existing session tests explicitly allow asynchronous settlement after close.
The snapshot therefore proves neither a persistent leak nor successful later
logical cleanup. Separate synthetic regressions confirm the existing contract,
including an uncooperative transport that must remain counted until it settles;
see `BACKGROUND-NAVIGATION-ABORT.md`. They cannot retroactively clean up or pass
this captured observation. No production metrics are reset or runtime code
changed to conceal pending work.

## Containment and evidence

The supervisor runs **11:49:00.240–11:49:00.740 UTC**, exits 1 and emits 41,424
bytes. Process group **1562786** is independently absent. Private HOME/TMP
directories are removed empty; no timeout, output-cap, spawn, stream or integrity
error occurs. OS-process absence is distinct from logical owner-cleanup proof.
JavaScript network/process guard-attempt arrays are empty; kernel denied-syscall
telemetry is not collected. Scripts, SafeJS, credentials and device/TTY probes
remain excluded.

The initial preparer invocation omitted its required `before` mode and failed
before browser execution. The unchanged preparer then runs with that argument.
The preparation error is retained; the single browser observation is not rerun.

An independent fact-only audit passes 11 checks and rehashes 38 sealed artifacts.
Its explicit verdict is `factsVerified:true`, `acceptancePassed:false`,
`cleanupProven:false`, `originalVerificationPassed:false`. Parent rechecking
confirms those hashes. The 23,335-pass native gate is rehashed, not rerun by this
capture; its 2,899 inputs, 2,192 compiled files and 1,372 committed runtime/test/
configuration files are bound to the observation.

Original lane: `/dev/shm/agent-browser-mdn-background-images-september14/`.
Durable copy:
`node_modules/.cache/native-validation/mdn-background-images-september14/`.
Copying artifacts is retention, not another execution.

| Artifact | SHA256 |
| --- | --- |
| `before-RESULT.json` | `18e5d9bcdccfe393f80d9180ffb20dd3270c39d0be790f269cf8a65bf10d7cf3` |
| Failed `VERIFICATION.json` | `96764b0a8ebd06897e9b4bd18ce03a0faeed66f6384fc9a8db0c6bf21a6ba4d7` |
| `PARENT-OBSERVATION.json` | `713754d81aa05c5d88d73ae36865e77fffb21c3e76c04f8974b8ade7a8f500e4` |
| `EVIDENCE.sha256`, 41 entries | `a263e5c1ed780113f084489a0de1183ed73874fa97ffe323ef3ee3f345df4377` |

## Next scope

Use a separately sealed observation with bounded post-close settlement reporting,
without further page actions after its first blocker. Do not alter this consumed
lane or require immediate zero metrics contrary to the asynchronous contract.
Acquiring the missing SVG needs its own bounded authorized scope; the old
19-response corpus remains closed. Then resume meaningful MDN interaction work.
No speed gain, successful image rendering, click, live-site validation or research
completion is established here. The overall browser goal and other gates remain
active; nothing is pushed.
