# YouTube search source-video validation — September 16, 2026

## Result

The native reader now exposes bounded, explicitly unverified primary video
metadata from eligible YouTube search pages without running their JavaScript.
A fresh compiled CLI navigation returned **19 source-video records**. It still
reported `empty-extraction` and exit 1 because there was no substantive DOM
content. This is useful source-data recovery, not a rendered-page success.

This follow-up does not change any verdict in the complete 100-entry checklist
at `reports/agent-citation-revalidation-v2.md`. That corpus is a citation-frequency
proxy for agent-relevant sites, not measured worldwide agent traffic; its roots
are not the same as the pages cited by agents. In particular, the anonymous
YouTube root has no recovered videos and remains a separate test.

## Two separate native navigations

Both used the explicitly constructed public query
`https://www.youtube.com/results?search_query=local+llm+hardware`, not a ranking
source link. They were separate pre-fix investigation and post-fix validation
requests, with no automatic retries or redirects.

| Run | UTC request time | HTTP | Decoded body | Operation | Result |
| --- | --- | ---: | ---: | --- | --- |
| Investigation | 01:15:47–01:15:48 | 200 | 1,624,775 bytes | long-v1 capture and headings | Empty nontruncated heading outline |
| Candidate | 01:36:23 | 200 | 1,623,908 bytes | Default reader, JSON document extraction | 19 source records; DOM empty; exit 1 |

The candidate metadata is 11,914 serialized UTF-8 bytes; the complete extraction
is 17,407 bytes. It preserves primary source order, source offsets/JSON paths and
literal title, author, duration, publication, views and snippet fields. Canonical
watch URLs omit tracking parameters. An independent static inventory of the new
body matches all 19 records and their whitelisted fields exactly.

Both runs used the existing honest `AgentBrowser/0.1` user agent, one GET each,
no credential headers and no alternate browser or HTTP client. Request/socket
closures, zero active requests, transport closed state and reaped child/process
groups are recorded. Each had a 45-second outer deadline and 256MiB heap; neither
timed out or received a termination signal. No scripts, SafeJS, sign-in, forms,
subresources, playback, continuation or transcript requests were used.

## Same-body control and privacy boundary

The investigation body contains 19 direct primary records, versus 20 occurrences
of `videoRenderer` anywhere in its app data. Only the primary path is extracted.
Using the exact saved body plus the separately recorded original request URL,
baseline extraction has no video metadata; the candidate recovers all 19 records.
Both have zero Markdown content bytes. This comparison is offline and does not
claim another website visit or a changed response.

The original receipt redacts its query to `?redacted`. Unmodified receipt replay
and loading with that redacted context continue to produce no video metadata.
No URL/hash rewriting, query guessing or widened replay admission was added.
Explicit saved-body request context is not ordinary receipt-replay support.

The earlier saved TikTok homepage hydration data was also inspected offline. No
identifiable public video IDs, captions, authors or primary video records were
established there; no TikTok recovery or fresh TikTok browsing is claimed.

## Implementation and verification

See `SOURCE-VIDEOS.md` for the exact route, parser, field and output bounds.
Changes are confined to the new collector, research-loader attachment, extraction
metadata integration, two native test files, manifest registration and docs.

- Clean archived baseline: 801 tests passed across 12 selected manifest files.
- Final clean candidate: **1,168 passed, zero failed**, 14 selected files,
  including **367 new tests**. Build, selected test types, format and lint pass.
- Integration-negative control: the final collector/tests over unchanged
  loader/extraction give 216 passes and 151 expected failures, all in the new
  reader integration suite. Selected test types also reject the absent API.
- The initial candidate passed behavioral tests but failed three TypeScript
  diagnostics and one lint finding; both were corrected and evidence retained.
- Static review found quadratic trailing-whitespace regex work. A monotonic
  backward scan fixes it; five adversarial cases exercise large internal and
  trailing whitespace. Static follow-up found the specific issue resolved.
- One local adversarial sample with 65,536 internal spaces took 1,557ms before
  the trim fix and 0.063ms afterward. These are illustrative single-process
  samples, not general browser benchmarks or a statistical performance claim.
- Three saved-body comparison processes and one performance process ran under
  kernel-denied networking with zero observed I/O attempts and closed groups.

The first candidate live-wrapper preparation had a Python path-concatenation
error before any browser was spawned; it made no request. Its preflight remains
preserved. The later candidate run used the corrected wrapper and final build.

## Evidence and remaining limits

Machine-readable hashes, measurements, controls and validation history are in
`reports/source-videos-2026-09-16.json`. Local detailed evidence is in
`node_modules/.cache/native-validation/video-search-reader-september16/`.
Original captures and earlier reports are unchanged. The final audit independently
recomputes Markdown bytes from `content`, correcting a helper field-selection
mistake without rewriting prior outputs; all recorded zero-byte values agree.

This is not a full-manifest pass, cross-session compatibility guarantee, passkey,
credential-provider, SafeJS, real TTY/PTY or challenge-solving acceptance. Source
layout changes can stop recovery. Heading discovery and redacted receipt replay
do not expose these records. The overall browser goal and unrelated gates stay
open; no push is included.
