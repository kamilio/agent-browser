# Explicit native source-video search — September 17, 2026

## Result and usage

The browser already exposes bounded public YouTube search source records, but its
generic DOM-oriented command truthfully exits1 when the DOM is empty. A new
explicit source-search command makes those records directly usable by agents
without changing that generic contract or pretending to render videos:

`node dist/scripts/research-video-search.js --query 'local llm hardware'`

Its native-video-search-v1 JSONL report yields source-results-unverified/exit0 only
for eligible nonempty sourceVideos on a successful, unblocked native response.
It preserves nativeOutcome, source response provenance, partial:true,
rendered:false, verified:false and contentSuccess:null. Empty or blocked searches
and native failures exit1 without video records; invalid arguments exit64.

The companion uses existing native researchNavigation, source-video parsing and
cancellable output. A narrowly typed API-only redirectMode:manual option prevents
redirect follow-ups. Generic CLI defaults and DOM content detection are unchanged.
No new dependency, alternate browser/client, script execution or SDK is introduced.
See SOURCE-VIDEOS.md for the complete API, query, source and output contracts.

## Isolated qualification

Baseline:bb22e423a2ac146eca61ddf1fdd04850350a6464 plus exactly owned overlays.
All1,634 source and2,416 compiled pins match the isolated runtime. Unrelated dirty
worktree code is not executed as the qualification candidate.

- Final selected native run:1,417 passed/0 failed across15 explicit manifest files,
  including173 new cases (105 core and68 CLI). Build, selected test types,
  formatter and linter pass. Children/process groups close and private state is empty.
- The command's tests cover source-only versus DOM outcomes, query/path encoding,
  literal metadata/provenance, HTTP/semantic/size exclusions, cancellation, output
  acknowledgement/backpressure and lifecycle cleanup. Manual-mode cases verify
  initial302 responses are not followed, invalid modes reject before setup, and
  unspecified generic behavior remains unchanged.
- Targeted manual-policy negative control:1,362 passed/55 failed, all failures in
  the new core test. It combines the new command/tests with the old research-browser
  lacking manual-mode support; it is not an unchanged baseline for the whole CLI.
- Initial core01 preserves1,396 passed/5 failed. Stale manual-mode and redacted-URL
  expectations, fabricated followed-history data, a spy implementation assumption,
  and confusion between the native20-second and CLI120-second deadlines caused
  those failures. Corrected fixtures do not weaken product restrictions. The
  original formatter findings also remain recorded.
- Canonical manifest:1,024 entries,22 absent committed paths. This change has no
  new full-suite run. The preceding50,057/0 available-suite result belongs to
  bb22e42 and is not claimed as fresh qualification for this command.

## One fresh actual-CLI query

The exact compiled executable runs against the public query with the unchanged
honest AgentBrowser/0.1 identity. Its source envelope records receipt at
2026-09-17T20:08:44.049Z; the native report independently timestamps its
summary at2026-09-17T20:08:44.056Z. Both refer to the same response.

- HTTP200; exactly one anonymous GET, zero redirects/retries/asset requests.
- 1,594,843 decoded bytes and
  317,155 encoded bytes, within unchanged limits.
- Actual CLI exits0 with19 records and nativeOutcome:empty-extraction.
- 13,221 JSONL bytes; total child execution/verification
  takes1.731 seconds. This is one observed workflow,
  not a controlled browser-speed benchmark or server-latency claim.
- Body SHA-256:e0ef50736534184f519d116ee7a7bb28ff1cc91fe7380af414308e96441a3b7a.
- Envelope SHA-256:7be3df96b7cbeae73a996bdca8114009cf30a7fc1b0ed150aaf50dc879505eed.
- Actual stdout SHA-256:6d46d7f1c4e9ff4e926e8e25ee32269d7aa79a05f034d50b6afb704f7ae0e816.

Native transport/session/document, request/socket and child/process-group closure
checks pass. Private HOME/TMP remain empty. There are no credentials, source
scripts, SDK, devices/TTY, watch-page/transcript/continuation requests, proxy,
spoofed client identity or challenge solver. The observer does not archive a
secureConnect event; none is claimed. Returned source claims remain unverified.

## Exact-source review and offline comparison

Independent review checks all19 distinct primary videoRenderer records against
the separately captured source: every ID/canonical watch URL, literal title,
author, duration, publication label, view label, snippet and source location.
The admitted initial-data script has836,092 UTF-16 units and starts at
LF-normalized UTF-16 source offset753013. All19 exported source paths match.
Relative dates, source spelling and author whitespace are preserved, not repaired
or converted into independently verified publication dates or identities.

The item section also contains one lockupViewModel and two gridShelfViewModel
items, followed by a continuation outside that section. Those are not eligible
primary videoRenderer records. All19 eligible records fit and report truncated:false;
this is not a claim that the entire website result set is complete.

Structured result URLs contain only the matching canonical watch ID; tracking
parameters and opaque playback/navigation objects are not exported. Seven snippets
contain URL-like literal text, including promotional/shortened links and one other
watch URL. Those are not validated navigation fields or visited links, and their
tracking/safety properties are unknown. Consumers must treat snippets as untrusted
text. No hardware claims, recommendations or video contents are verified here.

Two separate actual-CLI executions reuse the exact captured response under kernel
and JavaScript network denial, with independently recorded original query context:

| Executable | Outcome | Child exit | JSONL bytes | Source records |
| --- | --- | ---: | ---: | ---: |
| Generic research-browser | empty-extraction | 1 | 18019 | 19 |
| Explicit research-video-search | source-results-unverified | 0 | 13194 | 19 |

Every sourceVideos field in both outputs is identical to the live output, not just
the record count. The new report uses4825 fewer bytes by choosing a
different report schema, not by shortening those records. It is not a lossless
replacement for all generic navigation/DOM metadata. Both replay processes close
with one mocked request and zero network requests.

These are routed saved-response checks, not ordinary receipt-replay admission:
the source envelope independently preserves the explicit request URL. Original
query-redacted receipts and their replay restrictions are never rewritten.

## Preserved harness incidents

The original harness and its first revision stop before spawning any child:
Python3.8.10 lacks hashlib.file_digest and Path.is_relative_to. Separate revisions
use incremental SHA-256 reads and equivalent relative_to/ValueError containment.
No browser production code or security boundary changes for those corrections.

The third-lane proof closes with zero network but fails because its instrumentation
rejects every User-Agent, including the native honest AgentBrowser/0.1 identity.
The fourth lane checks that exact identity instead; its actual executable proof
passes with one synthetic record, empty native DOM and zero wire requests before
the sole live allowance is spent. No failed proof is relabeled as a successful one.

The first generic offline comparison also closes with no network but expects an
explicit redirect:follow field; the generic API omits it and native transport
defaults to follow. A separate corrected replay lane checks that effective default
while retaining the explicit manual requirement for the source command. Its two
executables pass independently. Original failed artifacts, authorizations and
measurements remain unchanged in their original lanes.

## Remaining work and evidence

This adds usable video-search discovery, not rendering, playback, transcripts,
homepage recommendations, verified ranking or completed local-LLM hardware research.
Source schema/size/visibility exclusions and query-redacted receipt limitations
remain. Historical100-entry results stay33 useful/67 other; there is no general
CAPTCHA/crawler-block solution or overall performance claim. Actual SDK/HTML modules,
real credentials/passkeys/devices and the original research tasks remain open.

The paired JSON report pins the source, tests, reviews, actual CLI results and
immutable evidence manifests. Main lane:node_modules/.cache/native-validation/
video-search-command-september17; successful live lane:video-search-live-september17-r4;
successful replay lane:video-search-replay-september17-r2. Earlier attempts are
retained alongside them. The publication audit preserves42 pre-existing tracked
modifications and697 untracked files. No push is made. The full goal remains active.
