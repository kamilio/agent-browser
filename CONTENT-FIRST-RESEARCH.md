# Get content before polishing rendering

Use the native reader for read-only text when layout or scripting is unnecessary.
Its output is deliberately partial, not proof of visual or interactive fidelity.
Check substantive paragraphs, links or cells rather than treating HTTP 200,
nonempty navigation or a heading alone as success.

## Large public HTML pages

The default response limit remains 2,000,000 decoded bytes. For an authorized
page known to need more, explicitly choose the existing `long-v1` profile; do not
raise global defaults or blindly retry a failed request. It admits at most
4,000,000 decoded bytes and requires one reader capture with heading discovery.
After building the current source, the workflow is:

```sh
node dist/scripts/research-browser.js --reader --capture-body \
  --reader-raw-policy separate-omitted-raw-v1 \
  --document-profile long-v1 --headings "$PUBLIC_URL" > captured-page.jsonl
```

Inspect the result before continuing. A challenge, rate limit, unsupported type
or absent capture is not permission to try another access route. The raw policy
separates accounting for omitted script/style source; it does not execute scripts
or remove source, parser, network or output limits.

For a successful capture, independently pin the full receipt bytes and decoded
body size/SHA-256. Select an untruncated, unique heading from this receipt's native
outline; use its exact selector, not a guessed selector or one from an older page.
Then extract a bounded section without requesting the website again:

```sh
node dist/scripts/research-replay-cli.js --expected-profile long-v1 \
  --receipt-sha256 "$RECEIPT_SHA256" --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" --section "$HEADING_SELECTOR" \
  < captured-page.jsonl
```

These are workflow examples, not automatic retries. On September 14, a new
SWE-bench visit loaded 2,392,125 decoded bytes and eleven headings. Six bounded
API replays then recovered benchmark-description sections with zero additional
HTTP requests. The earlier default-limit failure remains a separate failure.
See the thirty-seventh website inventory for the exact evidence and limitations.

## Avoid unnecessary requests

For ordinary public article HTML, explicit main-content focus can remove much of
the surrounding navigation while keeping a whole-document capture for later
questions. After building, an authorized one-navigation example is:

```sh
node dist/scripts/research-browser.js --reader --capture-body \
  --reader-raw-policy separate-omitted-raw-v1 \
  --content-focus main-content-v1 --table-rows "$PUBLIC_URL" > captured-page.jsonl
```

Focus is a source-landmark selection, not an article-quality detector. Inspect
`extraction.contentSelection`: ambiguous landmarks fall back to the document.
Keep `title`, source metadata and the original capture; RunRepeat's tested main
starts below its page title. A focused Consumer Reports article retains public
testing/FAQ text but not the missing ranked product details, and its source-access
declarations remain `false`. Do not treat headings or focus as subscription access.

Five September 15 article/review captures validate main focus and five actual
offline section-replay CLI invocations. Focus plus row lists reduces CNET Markdown
from 48,500 to 26,686 bytes and RunRepeat from 48,718 to 19,688 bytes. A selected
CNET comparison section is 1,641 bytes; a RunRepeat measurement section is 613.
These are scoped outputs, not equivalent full-document summaries. Exact URLs,
cell/source checks, timing scope and caveats are recorded in
`reports/review-content-tasks-2026-09-15.md`. No new website request is needed to
ask a follow-up question from these successful retained captures.

- Read a successful saved HTML capture with a unique article `--selector` and
  `--format markdown` in the replay CLI, instead of navigating again to remove
  surrounding menus. See `CAPTURED-ARTICLE-MARKDOWN.md`; output remains a JSONL
  provenance envelope containing native Markdown, with zero replay requests.
- For publishers supporting content negotiation, opt in to
  `--reader --prefer-markdown` at the same public URL. This asks for Markdown while
  retaining HTML fallback in the same response, not an automatic second
  navigation. See `MARKDOWN-NEGOTIATION.md` for compatibility and measured limits.
- Keep successful captures and use admitted local replay for HTML sections.
- Inspect preserved source IDs, classes and roles for an exact article target;
  use `READER-ARTICLE-SELECTORS.md` rather than assuming every site has `main`.
- Markdown omits empty hyperlink wrappers, not source anchors or JSON/discovery
  records. See `EMPTY-MARKDOWN-LINKS.md` when inspecting icon-only navigation.
- Add `--table-rows` to Markdown article extraction for readable physical row/cell
  lists instead of per-cell boundary noise. Replay also needs explicit
  `--format markdown`. Complex tables fall back without dropping content or
  inferring headers; defaults and budgets stay unchanged. See `TABLE-ROWS.md`.
- The reader keeps explicit MathML `alttext` as labeled inert source code instead
  of losing formulas inside prose or cells. It does not render or evaluate math,
  infer missing alternatives or load a dependency. See `MATHML-ALTERNATIVES.md`.
- For plain text, Markdown source, CSV, JSON and the literal XML/feed types,
  native `--find` and `--lines` locate source text. Separate research-CLI invocations navigate again;
  the HTML replay admission is not a generic XML or arbitrary-file reader.
- Record final canonical URLs for later authorized visits instead of repeatedly
  entering a redirecting legacy path. Do not guess alternate URLs to evade blocks.
- A successful HTTP status may contain only a client-side redirect stub. Inspect
  its actual public continuation link rather than claiming article content was
  retrieved. A separate authorized native navigation can follow a validated link
  without executing page scripts; count it as another request, not an HTTP
  redirect. Stop on access restrictions or another unresolved stub. A versioned
  destination is an observed URL, not proof of the latest software release.
- Count actual HTTP requests, not just launcher invocations. One navigation can
  follow redirects. State that allowance explicitly in a scope; a strict
  single-request gate needs an enforceable redirect restriction before launch.
- Stop at access restrictions. Pacing and optional public-resource reuse can
  reduce avoidable traffic; neither is a CAPTCHA solver or permission bypass.

Preserve original receipts, failures, hashes and partial-content flags. A new
verification report supplements evidence rather than rewriting historical status.
