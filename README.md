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
Video, WebRTC, full constraints and full EventTarget behavior remain incomplete.

HTTPS and loopback HTTP pages also expose a partial `navigator.mediaDevices`.
After page initialization, `page.mediaDevices.registerAudioInput(...)` grants that
page access to an explicitly supplied input:

```ts
const registration = page.mediaDevices.registerAudioInput({
  deviceId: "supplied-microphone", groupId: "supplied-audio", label: "Audio input",
  sampleRate: 48000, channels: 1,
  open: async (signal) => openSuppliedAudioSource(signal),
});
```

The factory returns an `AudioRecordingSource` and must settle when its signal is
aborted. `getUserMedia` opens a source for each successful audio request, and
`enumerateDevices` lists registered inputs. Basic exact/ideal device and group IDs,
sample rates and channel counts are supported, including numeric min/max bounds.
Track settings and clones preserve device identity. Unconfigured audio and video
requests fail with `NotFoundError`; unsatisfied required constraints reject with
`OverconstrainedError`. Advanced constraint sets, `devicechange`, display capture,
physical-device discovery and full MediaDeviceInfo/EventTarget facades remain
unsupported. Registration does not automatically access a physical microphone.

There are at most 16 registered inputs and eight pending acquisitions per page.
Opening and attaching a source share a 10 s deadline. Timed-out factories continue
to occupy their slot until they settle; late sources are closed. Page shutdown
waits for source cleanup acknowledgement. `registration.unregister()` removes the
input and cancels pending acquisitions; already acquired tracks keep their source
until stopped or the page closes. Existing stream and source lifetime limits apply.

Page `AudioContext` supports sine oscillators, gain, step parameter scheduling,
`createBuffer`, `createBufferSource`, and `createMediaStreamDestination()` for the
notetaker's virtual microphone and PCM playback graph. Buffer sources copy channel
data at start, linearly resample mono/stereo PCM, support scheduled start/stop,
offset and duration, and notify an `onended` handler after the final audio quantum.
Finished sources release their native sample storage and active graph slots.
Destination tracks provide clocked 128-frame stereo packets through the same
recording readers. Contexts support suspend/resume/close; delayed readers receive
the latest completed packet with frame gaps. Limits are four contexts per page,
128 active nodes, 4096 created nodes and 256 connections per context, 16 active
outputs, 512 automation events per parameter, and one hour of source frames at
8–96 kHz. Native PCM copies are limited to 32 MiB per context and clips to 300 s;
guest buffers also consume the SafeJS data quota. Compressed audio decoding,
looping, variable playback rates, full audio EventTarget behavior, hardware media,
WebRTC, AudioWorklet, feedback graphs and other oscillator types remain unsupported.
This graph does not establish working Zoom microphone audio.

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
