# Native PCM source clocks — September 18, 2026

**The requested Zoom meeting is not joined. No participant audio, recording,
transcript or delivery is produced by this change.**

## Concrete notetaker compatibility improvement

PcmCapture now emits sourceEndFrame: the exclusive source-frame endpoint of the
last retained sample in each chunk. A single push can produce several chunks;
the aggregate sourceFrames counter already points to the end of that input and
cannot stand in for their individual endpoints. Tracking the copied position
fixes that missing information without changing PCM bytes, retained timestamps,
sequence numbers, bounds, buffering, acknowledgment or failure semantics.

Local review of ~/automations confirms that its recording callback publishes
retained chunk-end/page-clock anchors after successful append. The new endpoint
is the missing native source coordinate, not a complete clock bridge. A future
driver must establish a real source/page clock relationship and preserve speaker
observer pause/discontinuity handling. Source gaps mean the chunk's source start
cannot be inferred by subtracting its length from this endpoint.

Pending endpoints clear on flush, discard, close and failure. Metadata stays
frozen; endpoint tracking retains one number, not per-frame provenance history.
No new dependency, I/O, page capability, decoder, wall clock or driver is added.
See PCM-CAPTURE.md for the public field and its integration limitations.

## Verification

- Final isolated native selection: **975 passed / 0 failed in 17 files**.
- The new assertions on old production: **149 passed / 51 failed**.
- Build, test types, formatting and lint pass; all supervised children/groups close.
- Native HOME/TMP are empty. Quality checks may create ordinary compiler caches.
- Only the two clean PCM source/test files overlay the previous pinned runtime;
  unrelated dirty work is not used as a qualified runtime or bundled into the commit.
- Static independent source review found no endpoint defect; it did not execute code.

The first candidate also passed 975 native tests, build, types and lint, but the
test file needed formatting. Its original formatter failure remains intact.
The final candidate changes only test formatting: parsed syntax trees and
production source hashes match the first candidate, whose test bytes match the
baseline. No assertion or production bound was relaxed. All 51 newly added cases
fail on old production and pass after the endpoint addition.

An initial proof incorrectly expected identical lexical tokens despite the
formatter adding trailing commas. That harness failure and original script are
retained; the corrected proof compares syntax nodes, excluding source positions,
trivia and trailing list punctuation. It does not execute the test code.

The selection includes the explicitly listed PCM tests and the preceding
extraction/document regression selection. This is not a full-suite, SafeJS,
socket, website, device, recording or real-clock qualification. Original failed
runs, if any, remain in the sealed phase; no historical report is rewritten.
Exact counts, subprocess results, hashes and the runtime path are in the JSON
companion and /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-pcm-source-timeline-september18.

## What still prevents native Zoom notetaking

The real client still needs qualified native/SafeJS execution and native incoming
media reception/decoding. Existing isolated SDK proposals are not activated by
this change. Legitimate admission, permitted recording, calibrated speaker
clocks, a genuine MeetingDriver, durable storage, transcription and verified
summary delivery remain separate gates. The automations daemon and its current
browser driver are unchanged. No alternate browser engine or challenge bypass
is used, and no push is performed. The overall browser/Zoom goal remains open.
