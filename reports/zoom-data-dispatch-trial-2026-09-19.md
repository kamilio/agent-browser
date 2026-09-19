# Retained-data dispatcher experiment: not promoted

September 19, 2026. This is an isolated SafeJS performance experiment, not a new
live Zoom test. The latest qualified vendor replay still times out at120.278s,
as documented in `zoom-accounting-trials-2026-09-19.md`.

The experiment splits the visitor's primitive and already-seen checks into a
small dispatcher before an otherwise unchanged object traversal body. It keeps
per-measurement weak identity sets, statement/provider order, charges, compile
tickets and graph-depth checks. The profile does contain optimized visitor code;
this experiment does not establish that the original function failed to optimize.

Private candidate: `/tmp/agent-browser-sdk-data-dispatch-uauc6k3a/candidate`.
Baseline: `/tmp/agent-browser-sdk-absent-captures-P8S12x/candidate`. Only
`interp/values.ts` and the new `interp/data-dispatch.test.ts` differ. Six new
correctness cases pass before and after the split,155 related tests across18
files pass, and strict types/core-node build pass. Parent re-verifies4,591 input
hashes in each of the five lanes. No candidate imports execute outside the
guarded harnesses. Compiler TMP contains its isolated Node compile cache.

## Owned benchmark

Two separately guarded, finite helper processes execute the same fixture bytes
with different package paths. No realm, page, publisher source or network is
used. The owned graph contains400 closures, shared/cyclic scope references,
tracked records, primitive values and aliases. After25 warmup walks, each process
records seven samples of150 walks. Every walk measures19,966 units; both complete
with checksum21,463,450 and all observed resources closed.

- Baseline median:169.104ms per150 walks. Evidence:
  `/tmp/agent-browser-data-dispatch-benchmark-wqj0cis1`.
- Split median:167.100ms per150 walks. Evidence:
  `/tmp/agent-browser-data-dispatch-benchmark-rpj_f5h4`.

This approximately1.2% difference in one pair of process runs does not establish
a useful improvement. It is not an end-to-end or statistically robust benchmark.
Both runs preserve all seven samples and input pins; no favorable reruns are
selected. The experimental package is
`/tmp/agent-browser-data-dispatch-sdk-FkoP3v/package`.

## Decision

Do not promote this change, activate it by default or spend another full vendor
replay on this evidence alone. Independent review also identifies added host
stack frames as a risk: the tested ordinary-object depth boundary passes, but
repeated closure/provider and transparent-wrapper chains are not exhaustively
qualified. No native/runtime nine-case gate is run for this experimental package.

Keep the private experiment and failing Zoom evidence intact. The last qualified
SDK remains2x8YPp, not FkoP3v. Real meeting UI, legitimate admission, incoming
audio, permitted recording, transcription and delivery remain open.
