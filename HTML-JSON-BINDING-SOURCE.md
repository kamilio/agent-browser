# Explicit inert JSON binding selection

`selectHtmlJsonBindingSource(decodedHtml, { scriptId, binding, pointer })`
selects an exact JSON value from an initial `const` object/array literal inside
one uniquely identified inline classic script. It reads source text; it never
executes the declaration, trailing JavaScript, embedded URLs or page scripts.

```ts
const result = selectHtmlJsonBindingSource(decodedHtml, {
  scriptId: "news-data",
  binding: "newsData",
  pointer: "/stories/0/description",
});
```

The operation is exported from the native library. Its selection validator and
limits are also exported. It is separate from `selectHtmlJsonSource`, whose
`application/json`-only contract remains unchanged. Ordinary reader extraction
still omits scripts; no automatic source-data or JavaScript fallback is added.

## Admitted source grammar

After optional JSON whitespace, the script must begin with `const`, whitespace,
the exact requested ASCII binding, `=`, an object/array JSON literal, and a
terminating semicolon. Whitespace is allowed around the binding, equals sign
and semicolon. The entire literal undergoes existing strict JSON validation,
including duplicate decoded member names outside the selected pointer.

The binding is limited to 256 code units and ordinary ASCII identifier
characters. Reserved and conservatively context-restricted names are rejected,
including `let`, `await`, `yield`, `eval`, `arguments` and strict/future-reserved
names. This is a deliberately limited source grammar, not a JavaScript parser
or a promise to accept every name valid in some script context.

Comments, destructuring, escaped identifiers, other declaration forms, primitive
initializer roots, calls/operators, multiple declarators and missing semicolons
are not accepted. Strings within the literal may contain JSON escapes and brace
characters. Exact selected spelling is retained, including large numbers and
escapes; the API does not round values or serialize them again.

Source after the terminating semicolon is **not evaluated or interpreted**.
Its source span is reported as omitted/unevaluated. It may change the binding,
throw, or be invalid JavaScript: none of that changes the fact that this result
is a selected initial source literal, **not the script's runtime value**.

The script must have no `src`, no self-closing marker, and either no type or
`text/javascript` / `application/javascript`. Module, JSON-LD, application/json
and other explicit types are outside this operation. Duplicate matching IDs,
matching IDs on other elements, duplicate candidate attributes and missing
closing tags reject. Scanning continues after the candidate to detect ambiguity.

## Source identity and bounds

Results explicitly disclose lexical HTML source scope, disabled scripting,
`valueBasis: "initial-const-json-literal"`, `rendered: false` and `verified: false`.
The following offsets use decoder-output UTF-16 units before parser normalization:

- `scriptStart` locates the opening script token; `start`/`end` delimit its body.
- `literal.start`/`end` delimit the JSON initializer in that decoded HTML.
- `json.start`/`end` are relative to the literal; add `literal.start` to locate
  the selected value in the decoded HTML. `jsonOffsetBasis` states this relation.
- `trailingSource.start`/`end` delimit text after the semicolon; `evaluated` is false.

Existing caps remain: 2,000,000 source units, 524,288 selected-script units,
65,536 selected-output UTF-8 bytes, 100,000 HTML tokens, bounded tokenizer work
and time, and strict JSON depth/node/pointer limits. Selection is validated as
own data descriptors without invoking property getters. Checkpoints and cursor
cleanup cover success and failure; this is not a sandbox for arbitrary host
callbacks or proxies. Existing lexical HTML distinctions and RCDATA-window
limits from `HTML-JSON-SOURCE.md` still apply. No source-literal cap is enlarged.

## Offline CLI

### Multiple fields in one scan

Use `selectHtmlJsonBindingSources(decodedHtml, { scriptId, binding, pointers })`
when several values are needed from the same initializer. The ordered `pointers`
list must be a dense ordinary array of 1..32 unique valid JSON pointers. Its
data indices are copied and frozen without invoking getters or custom iterators;
holes, extra properties and duplicate pointers reject. A missing pointer fails
the whole operation rather than returning an apparently complete partial batch.

The result has shared `metadata` and ordered `values` entries containing
`pointer`, exact JSON-source `text`, and relative `json` span metadata. Add shared
`metadata.literal.start` to each entry's `json.start`/`end` for decoded-HTML
coordinates. HTML and the complete strict JSON literal are scanned once, not
once per requested value. All selected UTF-8 text counts toward a single
65,536-byte aggregate limit, including overlapping selections. Existing input,
script, JSON, tokenizer, cancellation and cleanup limits still apply.

In the CLI, replace `--json-pointer` with an explicitly quoted JSON array:

```sh
node dist/scripts/research-html-json.js \
  --url https://source.fixture.invalid/document \
  --content-type 'text/html; charset=utf-8' --sha256 "$BODY_SHA256" \
  --script-id news-data --binding newsData \
  --json-pointers '["/stories/0/title","/stories/0/description"]' < body.html
```

Batch mode requires `--binding`; the two pointer flags are mutually exclusive.
The existing 8,192-code-unit per-argument cap also applies to the JSON array.
Output uses `html-json-binding-source-batch-selection-v1`,
`format: "json-source-batch"`, and a `content` array of the selected entries.
The single-pointer APIs, limits and output envelopes remain unchanged.

See `reports/json-binding-batch-2026-09-17.md` for a same-body field comparison,
actual compiled CLI validation, and a scoped local API timing experiment.

### One field

Add the explicit `--binding` flag to the existing raw-body command:

```sh
node dist/scripts/research-html-json.js \
  --url https://source.fixture.invalid/document \
  --content-type 'text/html; charset=utf-8' \
  --sha256 "$BODY_SHA256" \
  --script-id news-data --binding newsData \
  --json-pointer /stories/0/description < body.html
```

The exact body hash is mandatory. The input is captured raw response bytes, not
an HTTP-success receipt. The caller remains responsible for source provenance
and authorization. The result uses the distinct
`html-json-binding-source-selection-v1` envelope; its `content` is the selected
JSON source string. Without `--binding`, existing CLI behavior and envelope stay
unchanged. Invalid flags reject before body consumption. There is no network or
alternate-browser fallback.

Select only authorized public content fields. Source data can contain private
configuration, telemetry or hostile text; do not dump whole objects unnecessarily
or treat returned strings as instructions. Password-provider boundaries are
unchanged. `reports/source-json-binding-2026-09-17.md` records exact saved-source
content recovery and its limitations, not rendered-page or general JS support.
