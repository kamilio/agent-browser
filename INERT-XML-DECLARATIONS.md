# Leading XML declarations in HTML research input

Some HTML responses begin with an XML declaration even though their actual MIME
type is `text/html`. The native reader can omit a bounded, complete declaration
as an inert HTML comment rather than rejecting the entire response. It does not
switch to XML parsing or use the declaration to choose a character encoding.

## Accepted syntax

- The declaration begins at normalized source offset zero and is at most 256
  normalized UTF-16 code units, including its delimiters.
- Lowercase `<?xml`, required quoted version `1.0` or `1.1`, then optional quoted
  `encoding`, then optional quoted `standalone` with value `yes` or `no`.
- Encoding labels are syntactically limited to an ASCII letter followed by ASCII
  letters, digits, period, underscore or hyphen. The label is not acted upon.
- Quotes must match. Space, tab and line feed are allowed between fields and
  around equals signs; existing CR/CRLF normalization runs before the check.
- The declaration must end with `?>`; extra/duplicate/out-of-order attributes,
  entities or markup inside values are not accepted.

Declarations after text, whitespace, another token or inside a subtree remain
rejected, as do overlong declarations, generic processing instructions, CDATA and
malformed input. This is not general XML conformance. Actual response decoding
still uses the existing BOM, HTTP charset and HTML metadata behavior before
sanitization. The direct string sanitizer does not add BOM stripping.

## Accounting and safety

The declaration emits no body text and cannot open or close an omission stack.
The existing tokenizer issue is retained in `tokenizerIssues`; the comment token
and its omission are counted. Source/token/text/output/depth/raw-work limits and
abort checks are unchanged. The extra matcher inspects at most 256 normalized
code units. No XML entity expansion, external DTD/resource fetch, page script,
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
existing test-vector update: the formerly rejected leading declaration is now
covered as accepted, while its misplaced equivalent remains rejected.

Results and limitations: reports/multilingual-content-2026-09-15.md and its JSON
companion. The overall browser goal and separate runtime/provider/interactive
acceptance gates remain open.
