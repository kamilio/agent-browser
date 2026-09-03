# Numeric HTML character-reference diagnostics

September 3, 2026. The native decoder now reports digitless numeric references,
disallowed numeric controls and Unicode noncharacters while preserving their
existing output behavior. Discarded duplicate attribute values also pass through
the decoder so their reference diagnostics are no longer silently lost. The first
attribute value still wins. No dependency or page-runtime change is introduced.

## Behavior and scope

- Digitless forms such as `&#;`, `&#x;` and `&#xG;` remain literal and report
  `missing-numeric-entity-digits`, without an extra missing-semicolon diagnostic.
- Non-null numeric C0 controls other than TAB, LF and FF, plus DEL, are preserved and report
  `control-numeric-entity`. Numeric carriage return is preserved after source-input
  normalization rather than normalized a second time.
- All 66 Unicode noncharacters are preserved and report
  `noncharacter-numeric-entity`.
- Null, surrogate and out-of-range values still become the replacement character
  with `invalid-numeric-entity`. All 32 C1 inputs retain the existing conversion
  table and `legacy-numeric-entity` category, including unchanged C1 controls.
- Missing semicolons precede numeric-end diagnostics. Input boundaries delay
  undecidable references and do not duplicate issues when a token is retried.
- Text, attributes, title/textarea RCDATA, fragments and dynamic HTML insertion
  share decoding. Script/style raw text stays literal; decoded markup is not
  reparsed, and emitted ampersands are not recursively decoded.

These are repository diagnostic names, not a claim of identical WHATWG error
labels. The primary reference reviewed on September 3, 2026 is
`https://html.spec.whatwg.org/multipage/parsing.html`, specifically numeric
character-reference start/end states and named-reference attribute handling.

## Evidence

The initial 23 regression cases failed before the decoder change and passed after
it. Expanded checks exposed missing diagnostics from discarded duplicate values.
One named-reference fixture was corrected from the deliberately literal attribute
form `&notit;` to the actual missing-semicolon case `&copy`; the implementation's
existing attribute ambiguity rule was not changed to satisfy an incorrect test.

The 58 new allowlisted cases include every noncharacter, all C0/C1 inputs,
scalar boundaries, malformed syntax, long references, every split in representative
text/attribute tokens, exactly-once duplicate-attribute diagnostics, document and
fragment behavior, dynamic insertion and serialization. Long-input checks are
correctness fixtures, not throughput measurements. Existing parser quotas remain.

Focused validation passes 185 tests across six explicit native files. Production
build, strict new-test typechecking and targeted lint/formatting checks pass.
The full working tree passes 6,426 tests across 197 explicit native files. An
isolated HEAD snapshot containing only this decoder/tokenizer/test patch and the
updated allowlist typechecks and passes 3,666 tests across 136 available native
files, independently of the pre-existing unfinished browser work.

## Remaining gates

This does not complete tokenizer error recovery, source-input diagnostics,
template contents, SVG/MathML, formatting reconstruction or all parser error
categories. Historical `HTML-ENTITIES.md` evidence is unchanged. Actual SafeJS,
live websites, sockets, real TTY/PTY and UI acceptance remain separate open gates;
none of those probes ran for this checkpoint.
