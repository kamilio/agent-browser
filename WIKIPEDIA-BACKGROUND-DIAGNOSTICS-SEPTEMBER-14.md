# Wikipedia: current background-capable engine diagnostics

On September 14, 2026, **12:25:23.897–12:25:24.219 UTC**, the native engine
rechecks the original 119,573-byte Wikipedia portal capture. Diagnostic
verification passes; **search-input geometry still fails**. No live request,
search interaction, successful navigation or missing sprite rendering is claimed.

Runtime commit: `b5d2efdadf208457ca04345ced94ec093ab5fa35`, from the immutable
`/dev/shm/agent-browser-background-abort-september14/release00/snapshot/dist`.
HEAD at execution is the docs-only successor `a634556`. All 1,373 committed
runtime-source paths match. The 23,340-pass native gate is rehashed, not rerun.

## Current observation

The workload uses native `loadBrowserDocument`, not `BrowserSession` navigation:
one load without resource callbacks, one formatting build, one cached diagnostic
read, one `#searchInput` lookup and one geometry attempt. No clicks, typing,
scripts, rasters, resource callbacks or wire requests. The workload and guards
are unchanged from the prior portal probe except for the tab provenance name.

Input `e239` exists with a formatting node, but `getBoundingClientRect` throws
`AgentBrowserError`, code `unsupported`, and returns no rectangle. The width
guard remains intact; missing behavior is not replaced with syntax acceptance.

There are 2,708 DOM nodes, 2,250 formatting boxes, 2,114 visited nodes, 5,016 text
code units, 20,977 formatting-work units and three deferred subtrees. These
formatting metrics match the previous September 14 08:07:54 portal observation
recorded in WIKIPEDIA-CURRENT-DIAGNOSTICS-SEPTEMBER-14.md.

| Diagnostic occurrences | Previous | Current |
| --- | ---: | ---: |
| Applicable invalid/unimplemented CSS values | 24 | 2 |
| Applicable unimplemented CSS properties | 64 | 64 |
| Raw invalid/unimplemented CSS values | 37 | 4 |
| Total overlapping formatting issues | 160 | 138 |

All other formatting issue counts are unchanged. The total is not a count of
distinct broken elements or a completeness score. Multiple runtime changes
separate the observations; no isolated causal or performance claim follows.

Cached diagnostics do not change style metrics: two cascade builds, 372,664
style-work units, 8,500 generated-content work, 406 rules and 1,703 declarations.
Earlier values were one build, 367,271 and 8,468 work respectively. This is not
evidence of a speedup. The sample now retains 109 entries with zero omissions,
but seven values are text-truncated; `exhaustive` remains false.

## Remaining actionable gaps

Native-produced applicable samples still include:

- `.sprite` using a transparent gradient plus an SVG URL in layered
  `background-image`; single-layer support does not implement that stack.
- `.search-container fieldset` with **`word-spacing: -4px`**.
- `opacity: 0`, `1` and `.5` across the select and overlay controls.
- `.sr-only` using `clip-path: inset(50%)!important`.
- Appearance, transitions, transforms and other unsupported properties.

These are matched diagnostic samples, not proof of winning declarations or that
one fix will make the input usable. Negative word spacing is a concrete next
native text-layout target; opacity requires real group compositing and stacking,
not a parser-only exception. Missing SVG assets remain outside this corpus.

## Evidence and limits

Supervisor: 12:25:23.852–12:25:24.311 UTC, PID/group 1588771, exit 0, 57 aggregate
stdout/stderr bytes. Detailed results are in RESULT.json. Document nodes become
zero and query/tree cleanup reports no error; private directories are removed
and the process group is absent. Do not infer unrecorded image-owner metrics.
Existing JS guard attempts are empty; kernel-denied-syscall telemetry is absent.

The worker verifier and final checks pass. Parent independently verifies all 32
final sealed artifacts, original fixture hashes, workload/guard identity, exact
`e239` geometry failure, cached metrics, issue comparison and process absence.
No older report, path, failure or measurement is rewritten.

Original lane:
`/dev/shm/agent-browser-wikipedia-background-review-september14/`.
Durable byte-identical copy:
`node_modules/.cache/native-validation/wikipedia-background-review-september14/`.
REPORT.md and OBSERVATION.json retain the full sampled diagnostics and comparison.
The original body and receipt remain under
`node_modules/.cache/native-validation/native-wikipedia-form-flow-september13/`.

| Artifact | SHA-256 |
| --- | --- |
| Original response-1.body | 6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c |
| RESULT.json | e107b71bd6b8653fbd456add4b29124112b3c9fee73b10bad640fa20d3b01dab |
| VERIFICATION.json | e0fbfc228795a1470f3aacc0c88746e691ca866f6e816d203052cffa6f6f0eaa |
| FINAL-EVIDENCE.sha256 | 5f3808a3c98c3081e3e4e33d734faf2b625f836583ea67929ff0f896d5c2ac28 |

Broader sites/forms, original research, live resource capture, credentials,
passkeys/devices, SafeJS and socket/TTY/challenge gates remain open. No push.
