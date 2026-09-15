# Inert XML declarations in HTML research input

Some HTML responses include leading or inline XML declarations even though their
actual MIME type is `text/html`. The native reader omits a bounded, complete
declaration
as an inert HTML comment rather than rejecting the entire response. It does not
switch to XML parsing or use the declaration to choose a character encoding.

## Accepted syntax

- Each declaration is at most 256 normalized UTF-16 code units, including its
  delimiters, measured from its own token start rather than the document start.
- Lowercase `<?xml`, required quoted version `1.0` or `1.1`, then optional quoted
  `encoding`, then optional quoted `standalone` with value `yes` or `no`.
- Encoding labels are syntactically limited to an ASCII letter followed by ASCII
  letters, digits, period, underscore or hyphen. The label is not acted upon.
- Quotes must match. Space, tab and line feed are allowed between fields and
  around equals signs; existing CR/CRLF normalization runs before the check.
- The declaration must end with `?>`; extra/duplicate/out-of-order attributes,
  entities or markup inside values are not accepted.

When tokenized as markup, complete declarations may follow text, whitespace,
another token or occur inside a subtree, including an omitted subtree. They remain
inert comments and cannot
change the surrounding stack. Overlong declarations, generic processing
instructions, CDATA and malformed input remain rejected. This is not general XML
conformance. Declaration-looking raw/RCDATA, attribute and entity-decoded text
is not retokenized by this rule. Actual response decoding
still uses the existing BOM, HTTP charset and HTML metadata behavior before
sanitization. The direct string sanitizer does not add BOM stripping.

## Accounting and safety

The declaration emits no body text and cannot open or close an omission stack.
The existing tokenizer issue is retained in `tokenizerIssues`; the comment token
and its omission are counted. Source/token/text/output/depth/raw-work limits and
abort checks are unchanged. The extra matcher inspects at most 256 normalized
code units; this does not bound the tokenizer's preceding scan. No XML entity
expansion, external DTD/resource fetch, page script,
SDK runtime, credential access or new dependency is introduced. Existing complete
empty `<?>` markers and raw/escaped text keep their previous handling.

## Observed case and validation

On September 15, 2026 a native Aozora navigation returned HTTP 200, `text/html`
without an HTTP charset and 124623 body bytes. Existing native HTML metadata
sniffing correctly selected `shift_jis` and decoded the Japanese title. The
initial XML declaration then triggered the reader's malformed-input rejection
under all three visibility policies. No charset fallback needed changing.

The original live failure remains unchanged and inadmissible to ordinary
successful-capture replay. Candidate recovery is checked by controlled native
saved-response substitution, not by rewriting the receipt or repeating the live
request. New declaration/encoding regression tests accompany one intentional
existing test-vector update. That initial change accepted declarations only at
offset zero; the original report retains those historical bounds and measurements.

A subsequent September 15 Framework Desktop response contains a complete
declaration before a footer SVG, after the main product content. Rejecting that
inline declaration loses the entire 211555-byte HTML response. The matcher now
uses token-relative bounds at any HTML token position, with exactly the same
syntax requirements. Existing nonzero-offset negative vectors now use an invalid
XML version; focused inline regressions cover the newly accepted positions,
local length boundaries, omitted subtrees, decoding and resource accounting.

Historical leading-declaration results: reports/multilingual-content-2026-09-15.md.
Inline-declaration results: reports/hardware-reader-2026-09-15.md. Both have JSON
companions. The overall browser goal and separate runtime/provider/interactive
acceptance gates remain open.
