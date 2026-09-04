# Native option disabled boundaries

September 4, 2026 checkpoint in the standalone TypeScript browser.

## Finding and reference

While tracing selectedcontent's selected-option source, the native control index
was found to propagate an outer optgroup's disabled state through every
descendant. That crossed select/hr/datalist/option boundaries and made nested
optgroups inherit a disabled flag they did not own. It could also drop a selected
option from prepared form entries even though native selectedness treated it as
eligible.

The WHATWG HTML option disabled algorithm was reviewed on September 4:
`https://html.spec.whatwg.org/multipage/form-elements.html#the-option-element`.
An option's own disabled attribute wins. Otherwise the ancestor walk stops at
select/hr/datalist/option, or at the nearest optgroup whose own disabled attribute
decides the result. An optgroup's disabled flag is its own attribute, not a
transitively inherited group flag.

## Implementation

- `src/option-disabled.ts` implements the shared bounded ancestor predicate.
  It stops immediately for an own disabled attribute or the first relevant
  ancestor, and does not allocate another document-wide cache.
- `src/controls.ts` removes unbounded-by-boundary optgroup inheritance from the
  cached index. Options use the shared predicate; optgroups use their own flag.
  Existing fieldset handling and other control rules remain unchanged.
- `src/document-selection.ts` uses the same predicate for default-selection
  eligibility. Selection ownership still uses `nearestSelect`; enabledness and
  membership in a select's option list are deliberately separate.

The fix reaches cached control state, enabled/disabled selector matching, native
control selection and successful form entries. Attribute and structural changes
reuse existing control-index invalidation and native eligibility updates.
Ordinary wrappers still permit a group to disable its options; relevant
boundaries and the nearest group stop the walk. Explicitly selected disabled
options remain selected and are omitted from successful entries.

Some regression trees are deliberately built through native DOM operations:
they are not claims about how the HTML parser constructs invalid nested select
or optgroup markup. A separate parser regression covers rich wrappers inside
ordinary groups.

## Validation

Three initial regressions fail before integration: a select boundary, a nested
optgroup, and a successful form value lost across a select boundary. The new
suite also covers all stopping ancestors, own attribute precedence, nearest
groups, mutations, moves, cloning, selectors, native selection, fieldsets,
reflection, reader short-circuiting and closed-owner access.

The host-object factory checks the native binding without loading a page runtime.
Form tests only prepare requests; they do not send network traffic. Native tests
use the explicit `native-tests.json` allowlist.

- 36 new tests and 253 focused checks across seven files pass.
- Full native validation passes 8,926 tests across 246 files.
- The archived-HEAD owned patch passes 6,166 tests across 185 available files;
  pre-existing untracked suites are absent from that tree.
- Production typechecks, builds, strict new-test typechecks and four-file lint
  pass in both trees.
- Pre-existing control-index and task-ledger deltas remain unchanged and excluded
  from the checkpoint. The pending document implementation is untouched.

## Outstanding work

Selectedcontent cloning is still unimplemented. The reviewed algorithm requires
the primary enabled descendant, distinct internal disabled state, post-connection
and removal handling, selection updates and parser option-pop timing. A general
copy-on-every-mutation shortcut would not establish those semantics.

Coordinate implicit-inert targeting, picker behavior, broader user-action
ancestor handling, flat-tree/modal behavior, foreign content, framesets, quirks
layout and cross-owner observer/runtime breadth remain open. No live website,
socket, real TTY/PTY or SafeJS probe ran. The previously denied SafeJS probe
remains unrun; native evidence does not close those independent gates.

The full browser scope and active seven-day goal remain in `TASKS.md` and
`SEVEN-DAY-PLAN.md`. This checkpoint fixes an evidenced control-state discrepancy;
it is not selectedcontent or browser completion.
