# Read captured articles without another website request

Use a successful native HTML capture to select the article and emit readable
Markdown inside a bounded JSONL provenance report. This avoids reloading a page
just to change extraction format or remove navigation from the selected scope.

After building, pin the original complete receipt and decoded body, inspect its
source/outline for a unique article container, then run:

```sh
node dist/scripts/research-replay-cli.js --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" --selector "$ARTICLE_SELECTOR" \
  --format markdown < captured-page.jsonl > article.jsonl
```

`article.jsonl` is still JSONL, not a bare Markdown document. Read its
`extraction.content` string; `extraction.format` identifies Markdown. The envelope
keeps source hashes, selection, partial-content status, challenge classification
and `networkRequests: 0`. Its existing `native-research-json-replay-v1` kind names
the JSON serialization. Omitting `--format`, or explicitly choosing `json`, keeps
structured JSON extraction. Markdown is produced by the existing native formatter.

## Selection and recovery

- `--selector` must match exactly one native reader element. Prefer a semantic
  container or ID observed in this receipt; do not invent a site's selector.
- `--section` starts at a native heading and ends at the next visible heading of
  equal or higher level. It is not necessarily confined to the heading's parent.
- Normal replay supports admitted default and `long-v1` HTML captures. Default
  output-limit recovery also accepts `--format markdown` with the existing
  `--recover-output-limit --section` workflow. Original failed receipts are not
  relabeled; the recovery report retains their failure provenance.
- Link discovery, heading discovery and `--table-metadata` remain JSON-only.
  Unsupported combinations fail before the CLI consumes input.
- Markdown source, CSV, XML or arbitrary local files do not become admitted HTML
  replay inputs. This option does not bypass receipt, MIME, source or output caps.
- Whole-document challenge checks still precede selected extraction. A selector
  cannot hide an access barrier. Nothing retries, changes identity or solves a
  challenge; replay has no transport or page runtime.

The API accepts a fifth format argument after the optional signal:
`extractResearchReplayJson(receipt, trusted, selection, signal, "markdown")`.
`recoverResearchOutputLimitSection` accepts the same argument. Four-argument calls
retain their existing JSON return types; explicit Markdown infers the Markdown
content type. Receipt/body ownership, cleanup and bounded JSONL output are shared.

## Observed targeting limits

The captured MDN content-negotiation page has a unique native `main` element.
The Python control-flow tutorial instead uses a source `div` with `role="main"`
and a nested `section` with `id="more-control-flow-tools"`. The reader currently
retains that ID but drops the div's role and class. Use the observed ID rather
than assuming `[role="main"]` works in the sanitized reader document.

Reader output remains partial: no scripts, styling, visual or hidden-content
fidelity is claimed. Article scoping intentionally omits surrounding material;
check the selected paragraphs, code, headings and tables. The fortieth website
inventory records actual replay measurements and the remaining compatibility
and performance work.
