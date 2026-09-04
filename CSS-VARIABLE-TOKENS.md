# CSS variable token boundaries

September 4, 2026. This checkpoint corrects native custom-property token handling;
it does not introduce another page runtime or change the existing cascade owner.

## Failure and correction

The component reader previously treated an identifier immediately following `#`
or `@` as a possible function name. Consequently, `#var(--self)` and
`@var(--self)` created false variable dependencies. Their custom values became
invalid, and ordinary properties incorrectly selected otherwise-unused fallbacks.
Likewise, `#url(var(--value))` and `@url(var(--value))` were incorrectly passed
through the special unquoted-URL reader.

The reader now consumes hash and at-keyword names before examining a following
parenthesis. Such a parenthesis starts an ordinary component block, not a `var`
or `url` function. Authored case and escaped names are preserved. Real `var()`
functions nested inside that block still substitute, as do real functions after
a delimiter separated by whitespace or a comment.

A valid custom value that is unsuitable for an ordinary property's grammar must
not select that property's variable fallback. The corrected path reaches the
existing invalid-at-computed-value behavior instead. Native fixtures verify
inherited color, transparent background, automatic block width, inline custom
property edits, and shared geometry/raster invalidation and restoration.

## Specification review

Read-only specification research on September 4 used these primary sources:

- `https://www.w3.org/TR/css-syntax-3/#consume-token` distinguishes hash and
  at-keyword tokens from ident-like/function tokens.
- `https://drafts.csswg.org/css-variables-2/#using-variables` defines substitution
  of the reference argument and evaluation of a fallback only when needed.

The current variables draft was checked before changing cycle handling. Its
evaluated-reference behavior is retained; the older published static dependency
graph was not substituted for it. Draft alignment is not proof of behavior in
every deployed browser, and no upstream browser harness was executed.

## Native evidence

Sixteen new cases cover literal and escaped token names, false self-cycles,
nested real functions, separated delimiters and layout/paint consequences.
Twelve fail before correction. Focused runs pass 117 tests across three files in
both the working tree and isolated commit snapshot. The working tree additionally
passes 110 cases across the core and pending custom-property test files.
Production typecheck/build, strict checking of the changed test file and
two-file lint pass in both trees. The explicit native test list is unchanged.

Authorized full native runs pass 9,627 tests across 268 working-tree files and
8,474 across 246 isolated-commit files. Filesystem checks use actual ownership;
this is not authorization or evidence for any of the gated probes below.

## Remaining work

This is a focused correction, not a complete CSS tokenizer or CSSOM conformance
claim. Existing source/depth/expansion/retention limits remain in force. Pending
shorthand CSSOM limitations, broader layout compatibility and original browser
acceptance gates stay open. Historical reports and pre-existing uncommitted work
remain separate. No live site, socket, real TTY/PTY, browser or SafeJS probe ran;
the previously denied SafeJS probe remains unrun. Continue native style/layout
compatibility work without treating native fixtures as real-site parity. The
complete seven-day browser objective remains active.
