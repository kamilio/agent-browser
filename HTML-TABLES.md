# Bounded HTML table recovery

September 4, 2026 continuation of `HTML-FORMATTING.md`, `TEMPLATE-PARSING.md`
and the seven-day browser plan. Table handling now dispatches through explicit
table, section, row, cell, caption and column-group rules instead of the previous
start-tag-only container heuristic. The browser still has a partial HTML parser.

## Table modes and recovery

`HtmlTables` reads the open-element stack and the enclosing template mode.
Incompatible tokens close real cells, rows, sections, captions or column groups
and are reprocessed in the enclosing context. Missing tbody/tr/colgroup containers
are inserted where appropriate. Virtual fragment/template context frames cannot
be popped or mistaken for real elements in table scope.

Nested table starts outside a cell close the existing table before reprocessing
the token; a nested table inside a cell remains genuinely nested. Unmatched cell
and section ends cannot close unrelated ancestors or escape an inner table.
Document closing tags do not reset a live table's body stack. Cell/caption closure
also clears the associated active-formatting markers.

The existing legacy select handling now closes a table-context select before
reprocessing a matching structural token. This is not full customizable-select
or modern select parser conformance.

Ordinary inputs use foster placement, while ASCII-case-insensitive hidden inputs
retain the table insertion path without trimming invalid type values. A table
form is inserted without remaining on the open-element stack. Existing form
pointers and template table contexts reject inappropriate form starts. These
tree/pointer rules do not implement complete parser-created form-owner overrides.

## Buffered table characters

Consecutive table character tokens remain pending until a non-character token
or EOF determines the whole batch's destination. Whitespace-only batches stay in
the table; a mixed batch, including its whitespace, uses foster processing.
The buffer survives parser-write input boundaries without prematurely publishing
leading whitespace in the wrong document location. Comments and EOF flush it.

Only one pending buffer belongs to the input stream. It is bounded by the
configured text limit, in addition to existing input/token and native retained
text limits. Overflow is checked before retaining the new chunk. Cancellation
closes a candidate even when its buffered text has not yet been inserted.

Fostered text checks its actual adjacent sibling rather than reusing an old
table-to-text identity cache. It can merge with pre-existing adjacent text, and
it cannot append through a cached reference moved by a parser hook. If a live
hook detaches a table, foster insertion uses the preceding stack element instead
of losing subsequent content inside the detached table. Adjacency scans count
toward the table work budget.

## Ownership and raw-text transitions

Insertion retains the existing actual-owner and template-content redirection.
Table repair, formatting markers and foster moves do not transfer template nodes
into an outer live document. Table scripts and CSP hooks in template contents
remain inert; normal main-document hooks still run.

Raw-text/RCDATA handling now consumes the closing token and restores the open
element stack before returning to template/table mode dispatch. This fixes style
and noframes contents absorbing subsequent template text because their closing
tokens were incorrectly sent through in-template handling. Script hook scheduling
retains its existing explicit checkpoint path.

## Bounds and remaining compatibility

Context searches, token reprocessing and foster-adjacency scans share a work cap:
the smaller of 1,600,000 visits and 64 times the native node limit. A single token
can be reprocessed at most 32 times. Work/text limits are positive safe integers,
snapshotted at construction so a native caller cannot increase them afterward.
These are operation/retention bounds, not wall-clock or complete RSS measurements.

Native node/text/depth limits apply to implicit containers and resulting moves.
Parse and cancellation failures close candidates and associated template owners;
fragment-based replacement keeps its existing parse-before-commit boundary.

Complete in-body scope and implied-end handling, parser form-owner association,
modern select behavior and remaining insertion-mode interactions are still open.
Foreign construction, namespaces, framesets, template extensions, DOM adoption
and cross-owner observer/runtime integration remain separate requirements. Passing
table fixtures is not proof of whole-parser or framework conformance.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS probe remains unrun. The independent runtime, live-site, terminal,
portability and release gates remain open.

## Validation

Three initial table-mode regressions fail before integration. Two raw-text
transition regressions and two foster-text regressions also fail before their
respective fixes. The final 54 new tests pass, with 260 focused checks across
eight files. Tests cover fragment/template contexts, malformed structure,
input/form/select distinctions, parser-write batching, hook-driven table/text
movement, cancellation, implicit-node quotas and table work/buffer limits.

On September 4, 2026 the explicit native suite passes 8,384 tests / 235 files in
the working tree and 5,624 / 174 available files in an isolated HEAD plus owned
patch. The smaller isolated set excludes pre-existing untracked tests. Production
and new-test typechecks, builds and three-file Biome checks pass in both trees.
Existing pending work remains outside the checkpoint. Historical reports retain
their original measurements, and the seven-day goal stays active.

## Research

Reviewed the WHATWG HTML Standard's table, table-text, caption, column-group,
table-body, row and cell rules on September 4, 2026, including reprocessing,
table scope, foster insertion and pending character batches. Existing select
compatibility remains explicitly narrower than complete current parser behavior.
