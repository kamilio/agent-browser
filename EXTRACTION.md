# Live document extraction

`extract` reads the browser's current document, not a downloaded source copy. It
does not fetch a page, replay scripts, activate controls or consume snapshot diff
baselines. JavaScript-created nodes and later callback changes participate in the
same extraction as parser-created nodes. This is an additive agent command, not
a claim of complete browser or Markdown conformance.

## CLI and SDK

With the existing foreground service and named session:

Here `agent-browser` means the built package binary, invoked from the repository
as `node packages/browser-agent/dist/src/cli.js` if no bin link is installed.

```sh
agent-browser -s=research extract
agent-browser -s=research extract main --format=markdown
agent-browser -s=research extract '#article' --format=json --json
agent-browser -s=research extract e42 --max-bytes=65536 --max-nodes=2000 --depth=64
```

The target is optional; references and the existing bounded selector resolution
are supported. Markdown is the default format. Human-mode CLI output is the
Markdown body; `--json` preserves the command envelope and extraction metadata.
`--format=json` selects the structured content tree, independently of envelope
formatting. `capabilities` reports `extract` as partial, not unsupported or fully
complete. Named-session ownership and normal command ordering still apply.

The portable package exports `extractDocument`, `DocumentExtraction`,
`ExtractedNode`, `ExtractionType` and `ExtractionOptions`. SDK `root` is an
attached document reference, not a CSS selector:

```ts
const result = extractDocument(tree, {
  format: "json",
  root: tree.reference(articleId),
  maxBytes: 65536,
});
```

Both formats include the live document/scope references, document URL, normalized
title, revision and `partial: true`. `partial` describes implementation coverage;
it does **not** mean a size-truncated response was silently returned.

Structured content contains a typed tree with stable `ref` values. Types cover
containers, inline containers, text, paragraphs, headings, lists/items, quotes,
preformatted/inline code, emphasis, links, images, breaks, separators and table
rows/cells. Optional fields include text, heading level, ordered-list start and
safe resolved link URL. This is HTML-structure extraction, not a replacement for
the accessibility-oriented `snapshot` command or a complete copy of DOM attributes.
Returned data is detached; mutating it does not mutate the document.

## Content and safety

- Current CSS `display`/`visibility` support and hidden/inert/aria-hidden ancestry
  determine inclusion. Visible descendants can override inherited visibility;
  they cannot override a pruned display-none or hidden subtree. Scoping does not
  bypass hidden ancestors.
- Script/style/head/template/embedded-renderer content is excluded. The title is
  read separately. Noscript inclusion follows the parser's scripting mode.
- Form field values are intentionally excluded, including text inputs, passwords,
  textarea and select contents. Use `snapshot` and explicit form commands for
  interaction state. This prevents raw initial values from being mistaken for
  current controls or leaking protected values through this export.
- Links resolve against the live document base URL. Only HTTP(S) destinations
  without embedded credentials are emitted. Other destinations keep their label
  and a structured `blocked: true` flag, but not their raw target. URL userinfo is
  also removed from document metadata. URLs may still contain sensitive query
  parameters; extraction is not a general-purpose secret scrubber.
- Image alternatives are text, not auto-loaded Markdown images. No image source
  URLs are exported and no asset requests are made.
- Literal source Markdown punctuation and raw HTML delimiters are escaped.
  Destination ampersands are escaped without changing the structured URL.
  Code fences exceed the longest source backtick run. Code contents retain their
  text rather than becoming executable markup. Terminal and bidi control
  characters are represented visibly, except preserved line feeds/tabs.

Markdown keeps paragraphs, headings, safe links, loose/nested lists, block quotes,
line breaks, separators and code. Inline emphasis is currently normalized to
plain text in Markdown but retained as typed nodes in JSON. Tables are flattened
to cell paragraphs in Markdown; JSON retains row/cell structure. Empty list items
remain present. Negative or over-nine-digit ordered labels use bullet labels in
Markdown instead of pretending they are ordinary ordered markers. Full HTML
integer-attribute reflection, list-item value/reversed behavior, table spans,
ARIA names, typography, layout and general Markdown conformance remain open.

## Bounds

| Option | Default | Accepted range |
| --- | --- | --- |
| `maxBytes` / `--max-bytes` | 262144 | 256–1048576 |
| `maxNodes` / `--max-nodes` | 10000 | 1–50000 |
| `maxDepth` / `--depth` | 256 | 0–1024 |

The byte limit applies to the UTF-8 serialization of the complete extraction
result, including metadata and JSON escaping. Intermediate structured data has
an additional fixed 4 MiB accounting cap. The existing document and CSS work
limits still apply. These are structural/output limits, not hard preemption of
each native operation. A limit failure returns `resource-limit`, not an invalid
cut-off code fence, a partial tree or a misleading successful truncation.

Unknown formats reject with `unsupported`; invalid limits reject with
`invalid-input`; detached/stale references retain the existing reference errors.

## Evidence and remaining gates

September 2, approximately 04:32 UTC: 95 focused tests pass across five files,
including 14 extractor cases. Strict package and changed-test compilation pass;
Biome checks 161 files. `reports/extraction-focused-2026-09-02.json` records the
focused run. Two simple public-core extraction checks also pass on Bun; they do
not establish whole-browser, CLI or SafeJS portability on that runtime.

Unit and shared-command tests cover scopes, stable refs, mutations, current style
visibility, code/list output, prototype-shaped element names, protected values,
unsafe URLs, UTF-8 boundaries, deep trees and independent result data. Tests also
check that extraction does not fetch again or consume agent diff baselines.

`scripts/check-extraction.ts` runs the selected real SafeJS interpreter entirely
in memory, using the local candidate described in `SAFEJS-EXTENSIONS.md`.
Seven checks pass: initial extraction, script-created HTML, structured
refs, native-action callback mutations, retained identity, password omission and
repeatable reads without script replay. It creates no HTTP server, PTY, child
process or browser service. Its report is
`reports/extraction-safejs-fixture-2026-09-02.json`.

This does not replace public-site, separate-CLI or playground-download acceptance.
The real terminal/site gate remains denied pending explicit permission; it was
not rerun through this fixture. No dependency, installed SDK, upstream package,
daemon, commit or push changes are needed.

Syntax reference checked September 2, 2026:
`https://spec.commonmark.org/0.31.2/`. No Markdown parser dependency or conformance
percentage is claimed.
