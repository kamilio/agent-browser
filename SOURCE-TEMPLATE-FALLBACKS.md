# Template no-script source fallbacks

The research reader can retain meaningful authored `noscript` HTML inside an
otherwise omitted HTML `template`. This is document-source metadata only. It does
not activate templates, implement declarative shadow DOM, run scripts, fetch
embedded resources or make the fallback part of rendered/visible Markdown.

For example, a captured MDN compatibility widget contains the source notice
“Enable JavaScript to view this browser compatibility table.” inside a declarative
template. Retaining that notice explains missing content; it does not supply the
browser-support matrix that was absent from the response.

## Output

Markdown and JSON extraction envelopes may include `sourceTemplateFallbacks`:

```json
{
  "kind": "html-template-noscript-source-v1",
  "scope": "document-source",
  "partial": true,
  "rendered": false,
  "verified": false,
  "textFormat": "html-source",
  "truncated": false,
  "entries": [
    {
      "template": {
        "offset": 120,
        "attributes": { "shadowrootmode": "open" }
      },
      "source": {
        "offset": 166,
        "offsetBasis": "lf-normalized-utf16"
      },
      "html": "Enable JavaScript to view this browser compatibility table."
    }
  ]
}
```

Offsets identify opening tags in the LF-normalized response text; they are not
byte offsets or DOM references. `html` preserves the exact inner source markup,
entities and whitespace. Only bounded `id` and `shadowrootmode` template attributes
are copied; their values are source claims, not validated shadow-DOM state.

Metadata remains document-scoped even when extraction selects a heading or
subtree. It is not evidence that the selected subtree contains the fallback.
Ordinary extracted Markdown, DOM structure, diagnostics and access/challenge
classifications remain separate. A fallback-only document still has no ordinary
useful content for the existing content predicate.

## Eligibility and limits

- Collection starts only at an eligible omitted template outside head, ordinary
  noscript and other omitted/foreign or source-hidden ancestors.
- Explicit hidden/inert, aria-hidden and inline display-none roots/ancestors are
  excluded. Nested templates and embedded/foreign/control content are not mined.
- A complete, matched noscript needs a nonblank tokenizer text token. Tracking
  images alone, comments alone and raw script/style contents do not qualify.
- A hidden or forbidden subtree inside a fallback invalidates the whole entry;
  the collector does not splice HTML into an apparently complete statement.
- Each inner HTML entry is limited to8,192 UTF-16 units; at most16 entries and
  32,768 serialized UTF-8 bytes are retained. Excess entries are dropped whole and
  marked with `truncated`, never silently clipped or executed.
- Optional metadata fits after existing extraction fields within the total JSON
  byte budget. If no metadata envelope fits, it is omitted; ordinary content has
  priority. An empty truncated envelope may report that entries did not fit.
- Collection reuses the reader tokenizer and its existing source/token/depth/raw
  limits. There is no additional page-runtime dependency or fallback reparsing.

Snapshots are copied and deeply frozen. Closing the document releases its stored
metadata. The ordinary HTML parser does not add this research-reader metadata.

## Validation status

The isolated native gate passes3,316 cases in38 selected files, including198 new
cases. Build, selected types, formatting and lint pass. Differential replay of114
saved bodies preserves all prior extraction content, counters and classifications:
111 successful pairs and3 matching non-HTML failures. MDN gains one exact source
notice; the other113 captures gain no template metadata. Three actual native CLI
saved-response checks pass for Python, MDN and GitHub.

No new live website visit, full native-suite pass, rendered compatibility widget
or actual SafeJS acceptance is claimed. Historical reports retain their original
verdicts. Detailed evidence is in `reports/template-fallbacks-2026-09-16.md` and JSON.
