# Zoom initialization timeout: isolated vendor reproduction

September 18, 2026. Zoom is not joined. This diagnostic isolates a captured
application asset; it is neither a live meeting test nor full application replay.

## Result

The corrected isolated run reproduces the 120-second timeout with unchanged
native core50, experimental K9Y732 SafeJS package and application-unicode-v1.
The exact 417,914-byte asset is delivered once through a synthetic transport;
there are no website requests or fabricated application globals. Its SHA256 is
`a67394b5849e496a457bc375c14f7441043cee097ae620482f404f9de6116828`.

- Evidence: `/tmp/agent-browser-zoom-vendor-corrected-YX53vE`.
- Navigation: 120.287 seconds; one script execution timeout, zero executed scripts.
- Final SDK metrics: 818,808 steps, 797,262 peak data units, peak call depth 18.
- Process CPU: 164.446 seconds user plus 1.961 seconds system. This includes
  background threads, so it is not a main-thread utilization percentage.
- All 396 active progress samples advance steps: this is not an idle-only wait.
- No CPU profile was emitted despite the recorded flags and normal shutdown.
  Function-level hotspots and the exact live timeout location remain unknown.

The minimal document may take different branches from the live page. These
measurements must not be presented as a full-context replay or a performance fix.
The script deadline, allocation limits and isolation guards are unchanged.

## Preserved harness failure

The first attempt, `/tmp/agent-browser-zoom-vendor-offline-TpFaUn`, passes a tab
object where navigation requires its identifier. It fails before any SDK realm
or vendor execution. Its exit zero describes infrastructure cleanup, not success.
The corrected attempt changes this call to use the tab identifier; the original
attempt and its artifacts remain intact.

## Verification and next gate

Parent verification checks all input hashes and modes and all sealed artifact
hashes, sizes and modes: 7,084 inputs / 21 artifacts for the first attempt and
7,086 inputs / 24 artifacts for the corrected attempt. All match. Both processes
and their groups are absent; owners and realms close, retained data returns to
zero, and private HOME/TMP directories are empty. No network, credentials or
media are accessed.

A tiny owned-workload control is checking profiler output under the same Node
permission model before another expensive vendor diagnostic. No runtime limits
are being increased. Usable meeting UI, legitimate admission, incoming audio,
recording, transcription, summary and verified delivery remain open.
