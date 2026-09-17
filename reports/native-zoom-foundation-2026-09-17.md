# Native Zoom notetaker: first verified prerequisites

September 17, 2026. **Not joined; no audio, recording, transcript or delivery.**
This work advances the requested native-browser use case; it does not replace it
with the existing Chromium bot or claim that a frame codec is Zoom support.

## Fresh native entry-page check

The exact user-supplied Zoom URL received one anonymous native BrowserSession
navigation at 2026-09-17T23:07:16.087Z. HTTP 200 returned 11,539 decoded bytes and the
source title “Launch Meeting - Zoom”, but zero Markdown bytes. The saved source
has three inline scripts, one marked as a module. No script or asset was executed
or fetched. The precise downstream Zoom client/media requirements remain unknown.

An exact synthetic proof completed first with zero network requests. The live
capture and cleanup gates pass, but the content/workflow gate **fails**. Preserve
that distinction: reaching a launch shell is not joining a meeting. There were no
redirects, retries, credentials, cookies, join actions, devices or challenge solver.
The compiled runtime is the previously qualified committed 743ec5a candidate,
not the dirty working tree. The complete receipt and body remain in the private
landing/zoom-entry/live evidence directory; the JSON report pins their hashes.

## Existing notetaker and native gaps

Local source review of ~/automations establishes a reusable orchestration seam:
MeetingDriver → MeetingConnection → MeetingCapture → retained audio/speaker
artifacts → transcription → summary/delivery. The production meeting adapter
currently depends on Chromium/CDP. Launching it would not prove native support.
See packages/zoom-notetaker/src/meeting-types.ts and
apps/meeting-notetaker/src/ports.ts in that repository; detailed source references
are preserved in WORKFLOW-REVIEW.md under this phase's private evidence directory.

The native browser rejects HTTP upgrades without a dedicated transport and does
not currently publish a browser WebSocket, WebRTC or media-capture implementation.
PageMedia handles CSS queries, not audio. Page fetch exposes text/JSON, not a
qualified lossless guest ArrayBuffer bridge. Actual SafeJS/HTML-module, Worker,
Wasm and media compatibility remain separate work; no placeholder constructor or
unrestricted host object is being presented as a working browser API.

## Implemented frame primitives

src/websocket-frames.ts now decodes complete server frames with consumed-byte
counts and encodes masked client frames with caller-supplied four-byte keys.
It checks payload bounds before allocation, copies admitted payloads, preserves
input bytes, handles partial/coalesced input, and rejects reserved opcodes/RSV,
masked server frames, invalid control framing, nonminimal lengths, the 64-bit
high bit and unsafe/over-budget declarations. No runtime dependency was added.

This is **framing only**. A future connection owner must generate fresh random
keys, bound stream/message queues, negotiate and validate the opening handshake,
enforce fragmentation and UTF-8/close semantics, apply origin/address/CSP policy,
manage socket/abort/close lifetimes, and publish a genuine page capability. No
network transport, browser API or Zoom-media compatibility is claimed here.

## Qualification and preserved failures

- Final isolated native gate: **267 passed / 0 failed in 3 files**, including
  **125 new frame-codec cases**, plus existing network/policy cases.
- Final build, test types, formatting and lint all pass; children/groups close
  and private native HOME/TMP remain empty. Source pins: 1641;
  compiled pins: 2424. No socket, SDK, device or TTY test.
- Canonical native manifest: 1,029 entries, with the same 22 absent committed
  paths. This is a selected native run, not a new full-suite result.
- core01 passed native/build/types/format but failed six lint checks in the test
  file; the final overlay corrects those. core02 failed during preparation before
  a native child existed. Their original artifacts and failure note are retained.
- The worker committed the initial two codec files as 7ee726a before parent native
  qualification; the later focused follow-up registers/tests/documents the final
  test overlay. No push is performed and unrelated dirty work stays separate.

## Required end-to-end acceptance

1. Load and execute the real launch/client path in the approved native/SafeJS
   architecture, including genuine binary and realtime APIs actually required.
2. Enter the requested meeting under an identifiable notetaker identity, through
   legitimate authentication, waiting-room and host admission—not spoofing/bypass.
3. Receive and decode real, non-synthetic remote audio, with bounded PCM queues,
   speaker clocks, pause exclusion, gap diagnostics, duration/storage limits,
   final flush and complete cleanup. Keep microphone/camera transmission off
   unless separately requested; preserve recording permission/handoff behavior.
4. Produce the transcript and summary from retained meeting evidence. Verify any
   requested delivery destination by readback/permalink; a local file or a job's
   complete flag is insufficient.
5. Address critically low disk headroom before sustained audio recording.

The broader native-browser goal, varied website coverage, original research and
credential/passkey gates remain open. Historical 100-page 33/67 results are not
rewritten. The separate in-progress selector-reuse changes are not bundled here.
