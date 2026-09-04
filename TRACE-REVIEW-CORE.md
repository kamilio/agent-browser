# Local trace review integration

September 4, 2026. This checkpoint integrates the pending local semantic trace
viewer with the standalone playground and public API. The September 3 report
`TRACE-REVIEW.md` retains its original measurements and paths; this document
records separate native integration evidence, not a new live browser run.

## Local, bounded, inert review

The playground Trace pane accepts an exported `agent-browser-trace-v1` JSON file
without connecting to a session. It displays action/tab metadata, semantic
snapshots and network observations, with previous/next and explicit frame
selection. It neither replays commands nor uploads the file. Strings, including
hostile-looking HTML and URLs, use text content rather than HTML or links.
Recorded page text and URL paths may contain sensitive data.

`parseTraceForReview`, `readTraceFile`, `describeTraceFrame` and their review types
are exported from the standalone entry point. The validator projects and freezes
only reviewed fields, checks identities, ordering, component combinations and
UTF-8, and rejects malformed input. Existing limits include 2 MiB, 128 frames,
256 tabs and snapshot entries per frame, and 64 network entries per frame.
Display indentation is capped at 24 levels. This is a semantic display profile,
not a lossless importer or an executable third-party trace format.

The file reader rejects invalid declared sizes before opening a stream, limits
reads to 4,096 chunks and verifies the actual byte count. JSON decoding/parsing is
bounded but synchronous, not preemptively cancellable. Bounded copies and display
strings are additional allocations; the input limit is not a peak-heap estimate.

The asset loader and command server share the review module paths. Native tests
check the emitted runtime import graph without opening a socket. This does not
establish actual HTTP deployment or real-browser visual compatibility.

## Cleanup corrections

Previously, a bounds failure could wait indefinitely for an underlying stream's
cancel promise. Cleanup now initiates cancellation with rejection handling and
releases the reader without awaiting that potentially unbounded promise. The
original read/validation failure is preserved. Abort also settles and unlocks the
reader when underlying cancellation rejects or remains pending. This guarantees
neither completion of the underlying source's cleanup nor forced reclamation of
resources that an arbitrary source continues to hold.

Closing a mounted viewer now removes all five control listeners as well as
aborting the active read and clearing retained trace data/options. Closing twice
does not affect a later mount. Generation checks still prevent replaced or
closed reads from installing stale results. Playground pagehide invokes this
teardown; disconnecting alone leaves explicit local review available.

## Native evidence

Eight new cases cover pending/rejected cancellation, detached listeners/remounts,
public exports and host-backed playground export/review/pagehide flows. Two
regressions fail before correction. Forty-one pending review/parser cases are
integrated without rewriting their historical evidence. Focused runs pass 128
tests across four files in both the working tree and isolated commit snapshot.
Both trees pass production typecheck/build, strict checks of three affected test
files and ten-file lint. The unchanged explicit native manifest already includes
the two newly integrated test files.

Authorized full native runs pass 9,611 tests across 268 working-tree files and
8,458 across 246 isolated-commit files. Filesystem tests run with actual ownership;
this authorization does not include any of the separately gated probes below.

## Remaining gates

This is not video, pixel reconstruction, continuous-event tracing or Playwright
ZIP compatibility. Real browser interaction, socket delivery, live sites, real
TTY/PTY, released-SafeJS execution and full human/agent arbitration remain open.
No such probe ran; the previously denied SafeJS probe remains unrun. Continue
native compatibility/layout integration without treating fixture evidence as
upstream or real-site parity. The complete seven-day browser objective is active.
