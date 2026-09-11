# Bing malformed-attribute diagnosis

On September 11, 2026, a bounded offline investigation identified the input
rejected by the native Bing Poe-search capture. This is diagnosis, not a parser
fix, a new website visit or a successful extraction of Reddit opinions.

## Finding

The rejected attribute name is one double quotation mark, `"` (U+0022), on a
`div` start tag. Its zero-based UTF-16 interval is [97888, 97889). Native tokenizer
call 963 begins at 97862 and throws at 97889 with code `unsupported` and message
`Malformed HTML attribute name is not implemented`.

The minimal complete start-tag fixture used in the investigation is:

```html
<a ">
```

Eight native synthetic checks reproduce the same failure for `<div ">`,
`<a ">` and `<a x">`; nearby valid names and a properly quoted assigned value
continue to tokenize. All eight checks behave as expected. This does not prove
how malformed names should be represented by the native document model.

## Qualification and provenance

The single loader diagnostic runs at **06:35:53.048Z–06:35:53.058Z UTC**.
It retains the original native error, but the observer mistakes an initial
doctype-probe slice for a tag-name slice and fails its own assertion. The outer
invocation exits **2**, not a clean diagnostic success. That failure is preserved.

A separate recovery runs at **06:38:15.083Z–06:38:15.129Z UTC**, exit **0**.
It uses the native UTF-8 decoder, recorded native offsets and attribute-name
delimiter predicate to reconstruct the rejected name from a 27-code-unit window.
The attribution is bounded source-boundary reconstruction, not an observed
tokenizer local variable. No second loader call or captured-page tokenization
occurs; the only additional tokenizer calls are the eight tiny synthetic checks.
Unrelated page text and attribute values are not emitted.

Both invocations record zero network attempts, use private empty HOME/TMPDIR
directories and leave source/build identities unchanged: 995 source files and
1,784 compiled files from the validated link-discovery build. They neither run
page scripts nor access credentials. The original failed receipt remains failed
and ineligible for admitted replay.

- Original receipt SHA-256:
  `912f6124665416b8b75fce99d94825d5dea864bfe9883a53f1d1f321a27a35cf`.
- Body: 116,600 bytes, SHA-256
  `89c7015829644ec811b3ba92246ea164afb9a594e3733b0bd0c0695a9226d242`.
- Evidence, retained failures and final filesystem verification:
  `node_modules/.cache/native-validation/native-bing-attribute-boundary-september11/`.

## Next implementation gate

Investigate attribute-name recovery and the native document/serialization
boundary before changing the tokenizer. Simply deleting the rejection predicate
or silently dropping the offending attribute is not a demonstrated fix. Add
focused malformed-name regressions, retain token/work/attribute budgets, and
separately validate a fresh website capture after implementation. SVG support,
access challenges and the broader research tasks remain independent open work.
