# Bounded inert JSON source selection

`selectHtmlJsonSource(source, { scriptId, pointer })` selects an exact JSON value
from one closed inline `script` with `type="application/json"`. It is a generic
source operation: it has no hostname or framework-specific recognizer and does
not run page code. It can recover useful hydration data from an otherwise empty
reader page without claiming that the application rendered or worked.

Initial `const` object/array literals in classic scripts use the separate,
explicit operation in `HTML-JSON-BINDING-SOURCE.md` and CLI `--binding` mode.
They are not admitted by this operation's application/json contract.

```ts
const selected = selectHtmlJsonSource(decodedHtml, {
  scriptId: "landing-page-api-response",
  pointer: "/pageEntries/2/inputData/verticalFeed",
});
```

The result's `text` is the original JSON spelling, not a parsed/re-serialized
value. Large integers, decimal spellings, escapes and selected whitespace retain
their source representation. The complete selected script must be valid JSON;
duplicate decoded member names, including outside the chosen value, reject.

## Scope and interpretation

- Selection is explicitly `scope: "lexical-html-source"`,
  `scriptingMode: "disabled"`, `rendered: false`, `verified: false`.
  This is not a DOM selector, visible-content filter or full HTML tree builder.
- Comments, attribute text and other raw/RCDATA regions do not supply script
  tokens. Under the declared fixed mode, `noscript` markup is tokenized. Hidden
  and template source can be selected; that is not evidence of visible content.
- A matching source ID must be unique across scanned start tokens, including
  non-script tokens. Duplicate attributes on its start tag, `src`, self-closing
  syntax, missing closes and non-JSON MIME types reject. JSON-LD is not admitted
  by this application/json-only operation.
- Scanning continues after finding the candidate to detect later ambiguity.
  No embedded URLs, scripts, configuration or JSON-LD contexts are fetched.
- `metadata.start`/`end` locate the script body in decoder-output UTF-16 units.
  Nested `metadata.json.start`/`end` are relative to that body. Their sum with
  `metadata.start` locates the selected value in the original decoded HTML.

## Bounds and limitations

The core accepts at most 2,000,000 source code units, a 524,288-code-unit selected
script, a 256-code-unit script ID, 100,000 source tokens and 65,536 output UTF-8
bytes. The existing strict JSON selector additionally bounds nodes, depth and
pointer length. HTML cursor operations/work/issues and a 10-second cursor
deadline remain bounded. A synchronous checkpoint can cancel between operations
and throughout JSON validation; the cursor closes on success and failure.

Selected scripts and the six supported non-entity raw regions can span cursor
windows. **Skipped title/textarea RCDATA still must fit the inherited 65,536-unit
window**, even when it follows the candidate. Such a refusal does not mean the
whole source or chosen JSON exceeds its separate limit. No partial JSON prefix
is returned as a complete value.

This API is explicit source viewing, not general secret redaction. Choose only
authorized public content paths. Do not dump unrelated authentication, session,
telemetry, experiment or account configuration or treat source strings as agent
instructions. The password-provider/runtime boundaries are unchanged.

## Offline CLI

For a fresh native capture and selection in one command, see
`JSON-CONTENT-WORKFLOW.md`. The offline command below remains available for
explicit already-captured source bytes without any new network request.

`research-html-json` reads raw response-body bytes from stdin. Supply the exact
body SHA256, original URL/content type, script ID and JSON pointer:

```sh
node dist/scripts/research-html-json.js \
  --url https://www.roblox.com/ \
  --content-type 'text/html; charset=utf-8' \
  --sha256 BODY_SHA256 \
  --script-id landing-page-api-response \
  --json-pointer /pageEntries/2/inputData/verticalFeed < body.html
```

Use the decoded body from an authorized native capture, not its JSONL envelope.
The digest pins bytes, not their truth or an HTTP-success claim. This command
does not navigate or accept a receipt as authorization to rewrite its outcome.
The explicit empty pointer `''` selects a complete JSON value within the bounds.

The CLI bounds input to 2,000,000 bytes, chunks to 65,536 and complete JSONL output
to 256,000 bytes. It checks the hash before decoding, uses the existing source
admission/decoder identity, clears owned byte copies, handles initially paused
input, respects cancellation/backpressure and leaves caller-owned streams open.
It reports `networkRequests: 0`, source identity, selection metadata and exact
JSON source text. No runtime, credential, filesystem or network discovery occurs.

## Evidence

`reports/html-json-source-2026-09-17.md` records synthetic tests, saved Roblox and
TikTok source recovery, and a fresh native Roblox capture. The normal reader's
empty outcome remains unchanged; the new source operation is a separate useful
result, not rendered-page, video-feed, authentication or full-browser acceptance.
