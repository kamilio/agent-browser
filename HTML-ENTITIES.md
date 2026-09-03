# Complete named HTML character references

September 3, 2026. The native tokenizer now uses all 2,231 spellings in the reviewed
WHATWG named-character table, including 106 legacy spellings without semicolons.
This replaces the former small common-name subset. It adds no runtime dependency,
browser engine, network lookup during parsing or SafeJS modification.

## Parsing behavior

- Match the longest published spelling, preserving case and any unmatched suffix.
  For example, text `&notin;` becomes `∉`, while `&notit;` becomes `¬it;` and records
  a missing-semicolon issue.
- In an attribute, a semicolonless match followed by ASCII alphanumeric text or
  `=` remains literal. Thus an attribute containing `&notit;` stays unchanged.
- Emit both code points for multi-code-point mappings, and retain supplementary
  characters correctly. Decoding does not recursively interpret its output.
- Unknown semicolon-terminated references remain literal and report an issue.
  Bare ambiguous ampersands do not falsely report an unknown named reference.
- Documents, text/attribute tokens, title/textarea RCDATA, contextual fragments,
  dynamic innerHTML and serialization share the same decoded native tree. Script
  and style raw text are not decoded. Split parser input waits for a complete
  decision rather than prematurely accepting a shorter legacy spelling.

The lexical scan remains linear in input size. Each named candidate performs at
most 32 bounded prefix lookups; the maximum table spelling is tested. Unknown long
names cannot cause an unbounded search through the table. Existing document/input
quotas remain unchanged. This is a work bound, not a live-site throughput result.

## Source and reproduction

Primary sources reviewed on September 3, 2026:

- `https://html.spec.whatwg.org/entities.json`
- `https://html.spec.whatwg.org/multipage/named-characters.html`
- `https://html.spec.whatwg.org/multipage/parsing.html#named-character-reference-state`

The downloaded specification data is 145,897 bytes, with SHA-256
`d741d877ac77c4194c4ad526b5b4a19aef8dfe411ab840a466891cdbb9f362e6`.
The generated, frozen TypeScript table is 53,283 bytes. A test independently
reconstructs its name/code-point pairs and checks the canonical mapping SHA-256
`d2bf9e24122990f845d824c5ba48fff235cbc9109ab59ff9091760f16138ace0`.

`scripts/generate-html-entities.ts` accepts only a local file with the reviewed
source hash, verifies character/code-point consistency and prints deterministic
ASCII-escaped TypeScript. It does not download or execute source data. With that
source file already available:

```sh
npm run build
node dist/scripts/generate-html-entities.js /absolute/path/entities.json > /tmp/html-named-entities.ts
cmp /tmp/html-named-entities.ts src/html-named-entities.ts
```

Updating the corpus requires explicit source review and updating its pinned hash,
generated table and independent mapping checksum together.

## Evidence and remaining gates

Twenty initial regressions failed against the former decoder. Fifty new native
cases now cover the complete corpus in text and attributes, every parser-input
split within every spelling in both contexts, all legacy ambiguity classes,
long candidates, numeric regressions and shared document/fragment/innerHTML
behavior. The original parser regression retains its previously unsupported
standard name and now requires the correct character; a genuinely unknown name
keeps the literal-preservation/error check.

Focused HTML validation passes 128 tests across five explicit native files. The
full working tree passes 6,018 tests across 185 files with no unhandled errors.
Production build, strict new-test typechecking and five-source lint/format checks
pass. Regeneration matches the formatted table byte-for-byte; a mismatched input
hash is rejected before generation.
An isolated HEAD snapshot with only this parser/table/test change typechecks and
passes 3,258 tests across 124 available allowlisted files, without the pre-existing
unfinished browser feature work.

This does not complete HTML parsing, template contents, SVG/MathML, formatting
reconstruction, quirks handling, numeric-reference diagnostic conformance or the
browser's application/runtime/UI acceptance gates. Existing numeric conversion
behavior is retained, not newly claimed as fully conformant. No released-SafeJS,
live website, socket or TTY/PTY acceptance probe ran for this change. Downloading
the specification table is research, not a browser acceptance result.
