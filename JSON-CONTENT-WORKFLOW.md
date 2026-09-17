# One-command native JSON-source retrieval

Use `research-json-content-cli` when useful public page data is in a known inline
`application/json` script. One command performs native reader navigation, checks
the response/capture, then selects an exact JSON value from the same response:

```sh
node dist/scripts/research-json-content-cli.js \
  --script-id landing-page-api-response \
  --json-pointer /pageEntries/2/inputData/verticalFeed \
  https://www.roblox.com/
```

No manual raw-body export, digest calculation or second request is required.
This is generic explicit source selection, not automatic script discovery or a
Roblox-specific implementation. Supply exactly one HTTPS URL, one `--script-id`
and one `--json-pointer`. The explicit pointer `''` selects the entire JSON value
within the bounds; prefer narrow public content paths over application configs.
URL fragments, credentials and unsupported network destinations are rejected by
the wrapper and existing native navigation policy. `--help` does not navigate.

## Result and provenance

The CLI emits one bounded JSONL record. Successful source selection returns exit
0 with `outcome: "source-extracted-unverified"`, `contentSuccess: null`, and
`rendered: false`, `verified: false`. The selected value is in
`extraction.content`, retaining its original JSON spelling, including large
integers and escapes. Decode the JSONL envelope without reserializing the nested
source string if exact spelling matters.

`capture` preserves the native reader's original outcome, classification,
response identity and closed-resource metrics. It also records the in-memory
native report's digest, byte count and complete/output-limit disposition. It
does not include the raw response, unselected source JSON or reader extraction.
An empty native reader result stays `capture.outcome: "empty-extraction"` even
when the separately labeled source selection succeeds. The source operation
itself reports `networkRequests: 0`; navigation requests belong to capture metrics.

Source selection requires a complete capture, HTTP 200, HTML content type, no
classified access barrier/rate limit/native failure, closed inactive resources,
and matching captured-body length/digest. Only `empty-extraction` and
`extracted-unverified` native outcomes are eligible. Failure reports return exit
1, no selected content, and a capture/source stage. Supported native error
categories are retained; unrecognized internal categories map to `invalid-input`
while the original native category remains in `capture.failure`.

Invalid arguments, cancellation or output failure can return exit 1 without a
JSONL record; the executable gives a generic stderr diagnostic without echoing
private exception text. Require a complete record and successful exit before
consuming content. Cancellation cannot retract bytes already handed to a stream.

## Runtime and limits

- Native reader only: no Chromium, Firefox, remote browser, SafeJS or page code.
  No supplied credentials, credential-provider discovery, cookies or accounts.
- Exactly one navigation call, no retry loop. Existing bounded native redirects
  remain in production. Pacing is 2,000 ms within that navigation; separate CLI
  invocations do not share a global host scheduler.
- Existing default capture limits apply, including 2,000,000 decoded body bytes.
  Source/script/JSON-pointer limits are documented in `HTML-JSON-SOURCE.md`.
  The chosen script must be valid unambiguous JSON, including unselected members.
- Entire output is capped at 256,000 UTF-8 bytes, including JSON escaping and the
  newline. Selected JSON is separately capped at 65,536 UTF-8 bytes.
- The CLI owns a 30-second cooperative deadline, waits for native cleanup, and
  handles output acknowledgement/backpressure without ending caller streams.
  Cleanup completion is not guaranteed at exactly 30 seconds. The API checks
  elapsed time between stages and accepts caller cancellation.
- Owned decoded byte and serialized-receipt buffers are cleared. This is not a
  guarantee of erasing immutable strings or caller/output copies from memory.

The programmatic entry points are `researchJsonContent(args, signal?)` in
`scripts/research-json-content.ts` and
`runResearchJsonContentCli(args, output, signal?)` in
`scripts/research-json-content-cli.ts`. These are research helpers, not additional
package exports. Build them with the repository's existing TypeScript build.

## Content boundaries

Select only authorized public content. This tool does not redact arbitrary JSON
secrets or turn page strings into trusted agent instructions. It does not solve
CAPTCHAs, bypass login/consent/rate limits, execute apps, or verify facts. A script
can be selected in the explicitly documented lexical source mode without being
visible in a rendered page. Site markup and pointers can change.

`reports/json-content-workflow-2026-09-17.md` records successful fresh one-command
Roblox catalog and TikTok navigation retrieval, saved-response equivalence and
isolated native checks. TikTok navigation is not a functioning video feed.
