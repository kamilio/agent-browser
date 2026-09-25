# Agent browser

An in-progress, standalone TypeScript browser for agents. The native engine is
independent of Chromium, Firefox and remote browsers. SafeJS is the only approved
page runtime.

The browser provides structured navigation, document snapshots, element references,
extraction, forms and shared sessions. Browser compatibility and scripting remain
partial. Zoom initialization currently times out; joining, audio and notetaking
are not yet working.

The extension page runtime can opt into bounded WebAssembly with
`runtimeOptions.webAssembly: "bounded-v1"`. Pages and classic Workers share
metered execution and memory limits, and enforce WASM compilation CSP separately
from string eval. This currently requires Node24 with modern JSPI explicitly
enabled; the default Node22 runtime reports unsupported. Streaming, Table/Global
wrappers and full Zoom/media compatibility remain incomplete.

The SDK's `PcmResampler` converts supplied planar Float32 audio into bounded
PCM16 packets, with sample-rate conversion, mono/stereo mixing and source-frame
offsets. Its synchronous sink can feed `PcmCapture.push`. Call `reset()` when
discarding pending audio for a pause, and finish the resampler before finishing
the recording. Device capture, Web Audio and meeting transport remain incomplete.

`AudioRecording` connects an existing asynchronous audio source to the converter
and recorder. It supports an owner abort signal and pause controls; `stop()` flushes
accepted audio, while `close()` discards pending audio. Completion waits for both
the pending read and source cleanup to settle.

`AudioSourceHub` shares an existing source among independent recording readers.
Each `open()` starts at the next packet with its own audio buffers. A slow reader
fails at its queue limit. Closing the last reader releases the source unless a
`retain()` hold keeps it available for an idle live track. Explicit owner shutdown
always releases the source.

Pages with initialization support expose audio `MediaStream` and
`MediaStreamTrack` objects. After initializing a `PageScripts` instance, its
`mediaStreams` owner can adopt an existing audio source with `createAudioStream`
and open recording readers by track ID with `openAudioReader`. Tracks support
cloning, independent enable/stop controls, settings and source-ended events.
Device acquisition, Web Audio, video, WebRTC, constraints and full EventTarget
behavior remain incomplete.

## Development

```bash
npm run build
npm run typecheck
```

Use the explicit test membership in `native-tests.json` for native validation.
Live websites, SafeJS, sockets and TTY/PTY checks are separate acceptance gates.

See `CLI.md` for service usage and `TASKS.md` for current priorities. Preserve
existing source changes, keep validation artifacts temporary, and do not accumulate
run logs, research inventories or per-change documents.
