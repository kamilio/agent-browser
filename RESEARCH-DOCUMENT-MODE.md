# Reader document-mode preservation

The reader retains the effective initial HTML doctype instead of discarding every
declaration. This preserves the native parser's source compatibility mode and
fixes a concrete content failure: an HTML5 paragraph followed by a table must not
be reparsed as a quirks-mode paragraph containing that table.

The change does not force standards mode, flatten invalid table structure, execute
scripts, fetch external declarations or add a parser-mode override API. Genuine
quirks documents keep their existing table behavior and extraction restrictions.

## Original-token eligibility

The sanitizer tracks initial eligibility before filtering any original token.
Comments and HTML ASCII whitespace leave it open. The first effective doctype
consumes it; any other significant token closes it without a declaration.
Removed scripts/styles/links, hidden subtrees, unwrapped elements and ignored end
tags therefore cannot promote a later doctype. Apparent declarations inside raw
script/style text are not independently tokenized as document declarations.

Retain the exact span from the existing CR-normalized source buffer through the
bounded output emitter. Do not rebuild a declaration from its name or escape its
markup. The native tokenizer and classifier continue to decide public/system
identifier and malformed force-quirks behavior. Comments and later declarations
remain omitted; original native parse-diagnostic logs are not reproduced in full.

For initial eligibility, ignore exactly one literal BOM at offset zero in the
sanitizer's input. Do not treat a second BOM, entity-decoded BOM, BOM after a
comment or other Unicode whitespace as HTML ASCII whitespace. Network decoding
already consumes a response BOM; raw string and decoded response behavior are
tested separately. This change does not alter decoder policy or source offsets.

## Accounting and compatibility

- Original source and token accounting remain bounded. The retained declaration
  consumes output code units and no longer increments omitted-token accounting.
- Native parsing allocates and charges an additional DocumentType node and its
  identifier text. Existing limits are not enlarged; exact-boundary behavior can
  change, and opaque node references/revisions can shift.
- Main-content discovery counts the retained node. Whole-document structured
  extraction represents it using the existing empty-container convention; this
  is not an invented body paragraph or table. Selected main/article extraction
  does not include a root-level doctype container.
- Saved body bytes and capture hashes do not change. Reader source offsets,
  raw-text omission, access classification and metadata policies remain intact.

## Evidence and limits

The focused regression covers explicit no-quirks, limited-quirks and quirks modes,
malformed and duplicate declarations, significant omitted prefixes, BOM layers,
exact Markdown, and output/token/source/node limits. Independent review checks
the source-span and initial-token implementation. Exact executed counts and
saved-response/live evidence are in the dated document-mode report.

The Node.js stream-documentation failure is preserved in its original receipt.
The corrected native CLI retrieves the same public body and emits complete
bounded Markdown without a text-prefix fallback. Whole structured extraction
still exceeds its existing budget; success does not mean every interaction,
example execution or website feature is supported.

The existing section selector provides bounded structured access without another
GET. An actual native CLI saved-body check selects
`h4:has(a#streampipelinestreams-callback)` with `--section` and `--format json`.
It returns 36,937 JSON bytes and 699 nodes; both selected code examples exactly
match the full Markdown. This is section recovery, not a higher global budget.

The original full browser goal remains open: dynamic-site/SafeJS integration,
access/CAPTCHA handling, rendering, credentials, passkeys/devices/TTY and research
completion are separate obligations. Source-only review also identifies useful
follow-up tests for quota-failure cleanup, combined collector offsets/raw capture,
and malformed non-force-quirks declaration tails.
