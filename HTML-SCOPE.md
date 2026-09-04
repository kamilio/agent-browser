# Bounded HTML body-scope recovery

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and scope

Reviewed the WHATWG HTML parsing standard, last updated September 3, 2026,
particularly the stack-of-open-elements, implied-end and in-body sections:
`https://html.spec.whatwg.org/multipage/parsing.html`.

This checkpoint replaces selected in-body stack searches, not the complete HTML
tree-construction state machine. Ordinary end tags stop at special elements;
block/list/button recovery uses the appropriate scope rather than merely finding
a matching ancestor. Paragraph recovery respects button boundaries and creates
the missing paragraph for an unmatched paragraph end. Heading ends can match a
different open heading. List starts stop at intervening special elements except
address, div and p. Ruby starts apply the relevant implied-end exception.

## Implementation and ownership

`src/html-scope.ts` contains the bounded search, implied-end, close and list-start
operations. It shares special-element and normal-scope classification with the
existing formatter through functions, without exporting mutable category sets.
Stack index zero remains virtual for close/search operations, including fragment
contexts. Scope follows parser stack entries, not current DOM ancestry: a native
hook moving an element does not silently erase an open scope boundary.

The parser retains separate form-pointer behavior outside templates. It clears
the pointer, checks that the corresponding main-owner form is in scope, generates
implied ends and removes only that form entry. Inside templates, scoped closure
pops the form and descendants. This does not implement parser-created form-owner
overrides for controls.

Recovery synchronizes existing formatting markers and invalidates text insertion
caches when it closes stack entries. Synthetic nodes still use the actual-owner
insertion path, including template contents and table fallback. Native parser
writes exercise these paths without executing a page runtime.

## Resource bounds

Scope scans, ordinary-end searches, list-start searches and implied-end visits
share a per-parser cap of the smaller of 1,600,000 visits and 64 times the node
limit. Each visit checks cancellation. Configuration is copied and frozen; the
work limit must be a positive safe integer. Formatting and table work retain
their separate existing caps. This is not a wall-clock or complete RSS bound.

Synthetic paragraphs consume ordinary native node quotas. Exceptions close the
candidate tree and its template owner; cancellation during a parser write follows
the same cleanup path. No additional runtime dependency is introduced.

## Remaining work

Complete body/html closing and after-body scaffold handling, quirks-dependent
table/paragraph interaction, modern select behavior and other insertion-mode
interactions remain open. The existing formatting fallback has its own end-tag
path; this checkpoint does not replace every parser stack operation. Foreign
construction, framesets, DOM adoption, parser form-owner association and
cross-owner observer/runtime breadth remain separate requirements.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS probe remains unrun. Native fixtures do not close those acceptance gates
or establish general framework/browser conformance.

## Validation

Twelve initial regression fixtures fail before the implementation. The final
70 new tests cover malformed and normal body recovery, scope boundaries,
virtual fragment roots, form pointers, ruby, template/table/formatting integration,
synthetic-node quotas, immutable work limits, bounded scans, parser writes,
native reparenting and cancellation with template-owner cleanup. The focused
run passes 307 tests across eight files.

On September 4, 2026, the explicit native suite passes 8,454 tests / 236 files in
the working tree and 5,694 / 175 available files in an isolated HEAD plus owned
patch. The smaller isolated set excludes pre-existing untracked tests. Production
and new-test typechecks, builds and four-file Biome checks pass in both trees.
Pre-existing pending work is excluded from this checkpoint. Historical reports
retain their original paths and measurements.
