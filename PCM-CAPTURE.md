# Native PCM capture buffering

`PcmCapture` is a host-side, dependency-free adapter for **already decoded**
signed little-endian PCM16. It is not a microphone, media decoder, WebRTC stack,
browser MediaRecorder, or Zoom driver. Construction performs no I/O and grants
page scripts no capability. No recording starts implicitly.

## Existing notetaker integration

The automations notetaker uses 16 kHz mono PCM, one-second archive chunks, and a
synchronous `RecordingWriter.append(recordingId, pcm, startMs)` callback. Its
recording store—not the browser—encodes WAV and owns storage/retention. Configure
the adapter with `sampleRate: 16000`, `channels: 1`, `chunkFrames: 16000` and
application-chosen finite input, source-duration and chunk-count limits. Connect
the callback to that writer only in an authorized meeting driver. The generic
adapter also admits mono/stereo at integer sample rates from 8 to 96 kHz.

An application with an existing authorized recording can supply its writer:

```ts
const capture = new PcmCapture(
	{
		sampleRate: 16000,
		channels: 1,
		chunkFrames: 16000,
		maxInputFrames: 16000,
		maxDurationFrames: 16000 * 60 * 60,
		maxChunks: 3600,
	},
	(chunk) => {
		store.append(recordingId, chunk.pcm, chunk.startMs);
	},
);
```

This example accepts at most one hour on the source clock; it neither creates a
recording nor supplies audio. The driver must call the writer's `finish` only
after `capture.finish()` succeeds, and its `fail` path on a capture error.

`push(pcm, sourceStartFrame)` admits complete, nonempty frames on a monotonic
source sample clock. Inputs are copied, including typed-array subviews and Node
Buffers. Shared or detached buffers are rejected. Forward gaps are counted;
overlap and regression fail before admission. No silence is fabricated.
Emitted chunks own exact-length bytes and monotonically increasing sequence
numbers. `startFrame` and `startMs` use the compact retained-audio timeline,
not wall time. Gap counts are diagnostics, not speaker-alignment evidence.

`setPaused(true)` discards the unfinished chunk and excludes subsequent paused
audio, matching the existing automations worklet. Previously emitted chunks
remain valid. Resume starts at the next retained frame, without a silent gap.
`finish()` flushes the final nonempty tail exactly once; successful repeats are
no-ops. Empty capture fails rather than reporting a successful recording.
`close()` discards any unfinished tail without calling the sink.

## Bounds, ownership and failure

All limits are explicit positive safe integers. Chunk/input buffers are each
capped at 16 MiB. A push snapshots at most one bounded input and retains at most
one chunk buffer; a final short chunk briefly needs a second exact-size copy.
Only the current chunk allocation appears in `retainedBytes`. After successful
delivery, the sink owns those bytes; its disk usage and retained memory are not
managed by this adapter. Source duration includes pauses and observed gaps.

There is no asynchronous queue: a synchronous sink supplies backpressure.
Thenable results are rejected terminally, with promise rejection observed.
This cannot cancel work an incorrectly asynchronous sink already started.
Sink exceptions, allocation failures after admission, and chunk-limit failures
terminate capture, release internal buffers and are never retried. A callback
may have persisted data before throwing; failure does not imply rollback.
Counters distinguish admitted frames from successfully acknowledged frames.
`discardedFrames` includes admitted audio without successful acknowledgment,
not a guarantee that a failing sink wrote nothing. Argument/input-limit errors
before admission leave the capture usable. Mutating reentrancy from a sink is
rejected; frozen metric snapshots remain available.

## Still required for Zoom

A genuine native media receiver/decoder must supply the PCM. Meeting admission,
authentication, signaling, sustained incoming audio, speaker clocks, recording
permission, leases, storage headroom, transcript/summary and verified delivery
remain separate requirements. This component neither joins the supplied meeting
nor replaces the existing Chromium driver. Synthetic tests are not live-audio
validation. No devices, credentials or meeting audio were accessed to build it.
