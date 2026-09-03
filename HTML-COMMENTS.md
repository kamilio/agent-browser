# Native HTML comment recovery

September 3, 2026. The native tokenizer now follows explicit comment states instead
of searching only for `-->` or `--!>`. Previously, an abrupt empty comment such as
`<!-->` or `<!--->` could swallow the rest of a document, including visible content
following a parser-inserted write. The same fix reaches documents, contextual
fragments and dynamic innerHTML through the shared tokenizer.

## Behavior

- Abrupt empty comments emit empty comment nodes and leave subsequent markup
  available to the parser.
- Normal comment start/end, less-than/bang/dash transitions, nested-comment
  diagnostics and incorrectly closed comments retain the correct data.
- At actual EOF, unfinished delimiter bytes stay out of comment data. At a
  temporary input boundary, the token and its diagnostics stay pending instead.
- Null code units passed directly to the comment tokenizer become replacement
  characters. The document parser's existing input normalization remains separate.
- Bogus `<!...>` declarations and invalid end-tag openings become comments that
  end at the first `>`, even inside quote characters. Bogus comments may end at EOF
  without an extra unterminated-comment diagnostic.
- Comment contents remain inert: character references and embedded markup are
  literal data. Script/style raw-text handling remains separate and unchanged.

The scanner tracks the length of the committed source prefix rather than building
one string fragment per character. Each input character takes a bounded number of
state transitions. Incomplete rescans advance the work counter before rolling back
the input position, retaining the parser's existing cumulative work/input quotas.
This is native bookkeeping evidence, not a live-page timing or memory benchmark.

## Reference and limits

Primary reference reviewed September 3, 2026:
`https://html.spec.whatwg.org/multipage/parsing.html`, sections for the bogus
comment state and comment start, dash, less-than, bang and end states.

Existing public diagnostic names `unterminated-comment` and `bogus-declaration`
are retained. New specific diagnostics describe abrupt empty closures, incorrect
closures, nested comments and invalid end-tag name starts. Temporary input reads
do not publish diagnostics until the token is accepted.

This does not implement every tokenizer state, processing-instruction handling,
all malformed tags/attributes, template contents, foreign namespaces, full tree
construction or the browser's real-site/runtime/UI acceptance gates. The existing
`<?...>` handling is not changed or claimed conformant by this work.

## Validation

Nineteen initial native regressions failed against the old ordinary-comment
scanner. Eight further bogus-comment cases failed before their correction.
Two rescan-budget assertions also caught an intermediate accounting omission;
the final scanner charges those reads before suspension.

Seventy-seven new native cases cover comment states and EOF transitions, every
input split in the recovery corpus, repeated insertion and diagnostic ordering,
large comments, input limits, raw-text separation, documents, fragments, dynamic
HTML and a parser-write hook. Hooks are trusted native fixtures, not guest-code
execution or a released-SafeJS probe. No network, socket or real TTY/PTY is used.

Focused HTML regressions pass 205 tests across six explicit native files. The full
working tree passes 6,095 tests across 186 files with no unhandled errors.
Production build, strict new-test typechecking and two-source lint/format checks
pass. The earlier reports retain their original contents and measurements.
An isolated HEAD snapshot with only the tokenizer, new tests and allowlist change
also typechecks and passes 3,335 tests across 125 available allowlisted files,
without the pre-existing unfinished feature work.
