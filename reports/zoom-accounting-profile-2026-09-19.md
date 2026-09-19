# Zoom initialization: accounting hotspot identified

September 19, 2026. Zoom is not joined. One isolated replay of the exact captured
417,914-byte vendor asset reproduces the unchanged 120-second script timeout.
Native core50 and experimental SafeJS K9Y732 are unchanged. This uses a minimal
document and synthetic transport, not the complete application or a live meeting.

## Profile

Evidence: `/tmp/agent-browser-zoom-tick-profile-8gFKED`.
The V8 tick log contains 23,860 samples and occupies 14,290,616 bytes, below the
unchanged 16 MiB file limit. Of those samples:

- 22,776 include `reconcileCompiledValues` in the attributed stack.
- 22,420 include `measureSandboxData`.
- 14,977 have its `visit` helper as the first attributed trusted JS frame.
- 1,639 have `Scope.retainedDataRoots` as the first attributed trusted JS frame.

The sequential analyzer follows code creation/moves/deletion and stack records.
It does not resolve native symbols or reconstruct inlined frames. There are
6,132 unmapped program-counter leaves, no unknown code moves and no reported
stack-overflow records. These are sampled stack observations, not exact CPU
percentages. They identify repeated retained-data accounting as the optimization
target without attributing unknown native frames to specific functions.

Navigation takes 120.282 seconds. Final SDK progress is 825,090 steps and
799,948 peak data units. All owners/realms close; retained data, pending callbacks,
requests and cleanup rejections return to zero. No outer timeout or signal occurs.
Parent verifies all 7,085 input hashes/modes and seals 26 artifacts. No website,
credentials, device or media access occurs.

## Profiler control and limitations

Two 200ms owned arithmetic controls under the same Node permission model and
kernel no-network guard distinguish profiler mechanisms. `--cpu-prof` produces
no output; standard `--prof` produces a private 242,426-byte log identifying the
owned arithmetic function. Neither control executes SafeJS or publisher code.
Control evidence: `/tmp/agent-browser-profiler-parent-x0vm6t`.

The vendor run explicitly changes only the observer to V8 tick profiling at
5,000 microseconds, with source-code logging disabled. The copied supervisor's
`profilePresent` field still tests the old CPU-profile filename and is false;
it is not a test for the separately verified V8 log. Original receipts are not
rewritten. The original no-profile runs remain preserved.

A narrow scope-cache allocation contribution passes focused and related tests;
object-literal descriptor reuse is being tested separately. Neither is yet a
verified Zoom speedup. Meeting UI, legitimate admission, incoming audio,
recording, transcription, summary and verified delivery remain open.
