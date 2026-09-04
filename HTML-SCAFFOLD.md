# Native parser scaffold publication

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and behavior

Reviewed the WHATWG HTML before-html, before-head and after-head insertion modes:
`https://html.spec.whatwg.org/multipage/parsing.html#the-before-html-insertion-mode`
`https://html.spec.whatwg.org/multipage/parsing.html#the-before-head-insertion-mode`
`https://html.spec.whatwg.org/multipage/parsing.html#the-after-head-insertion-mode`.
Scaffold elements are created when their explicit or implied start is processed,
not before the first token. Comments before html belong to the document; comments
before head belong to the html element. An explicit element token supplies its
attributes before insertion.

The native parser now stores lazy html/head/body identities in `HtmlScaffold`.
The asynchronous startup hook receives a document with no parser-allocated
scaffold elements; a custom initializer may still add its own nodes. The normal
before-html and head-mode dispatch creates the
elements as needed. Missing elements are completed at EOF, after initial mode
selection. Leading comments, doctypes, ignored end tags and whitespace no longer
require allocating later document elements in advance.

In particular, head scripts and late-head scripts do not retain a detached,
preallocated body. Explicit html/head/body attributes are visible in the native
insertion record's node state, rather than being merged in after publication.
Later duplicate start tags still merge missing attributes without replacing the
original values or republishing the element.

## Identity and lifecycle

Saved parser identities survive detachment by native mutation hooks. The parser
does not reattach or recreate a removed html, head or body, and late metadata
continues to use the saved head. Initial attributes are not reapplied after an
insertion callback removes them. This fixes a duplicate-merge path independently
of ordinary repeated start-tag handling.

Existing native host document getters reflect the empty startup document, the
published head at a script checkpoint and a body created synchronously through
the parser-write context. These tests use native factories and hooks, not a
JavaScript page runtime or an actual MutationObserver delivery cycle.

The helper stores at most three native identities. Element allocation, text
charges and tree-depth validation still use `DocumentTree` limits. Startup can
run before a later node-limit failure; startup cancellation, hook failure and
EOF scaffold quota failures close the candidate. Fragment parsing retains its
virtual context and html-fragment result contract without invoking the full-
document initializer.

## Validation and open requirements

Three initial publication regressions fail before the implementation. Two more
attribute-removal regressions fail before eliminating the duplicate initial
merge. The final 33 new tests cover startup allocation, token attributes,
comments, nine EOF paths, mode selection, head scripts, detachment, saved-head
identity, repeated tokens, quotas, startup failure/cancellation, fragments and
retained host getters. The focused native run passes 374 tests across nine files.

Full native validation passes 8,686 tests across 241 files. The isolated archived-
HEAD tree with only this checkpoint passes 5,926 tests across its 180 available
files. Production and new-test type checks, builds and three-file lint pass in
both trees. Pre-existing uncommitted work is excluded from the isolated patch
and this checkpoint's commit. These results do not establish runtime timing or
memory measurements.

This is not full HTML parser, WPT or framework conformance. EOF diagnostics,
modern select, foreign content, full quirks layout, arbitrary callback reentrancy
and cross-owner observer/runtime breadth remain open. No SafeJS, live website,
socket or real TTY/PTY probe ran. The previously denied SafeJS probe remains
unrun; independent acceptance gates and the seven-day browser goal remain open.
