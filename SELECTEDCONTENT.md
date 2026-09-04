# Native selectedcontent cloning

September 4, 2026 checkpoint in the standalone TypeScript browser.

## Reference and triggers

Reviewed the WHATWG HTML selectedcontent, select and option algorithms on
September 4:

- `https://html.spec.whatwg.org/multipage/form-elements.html#the-selectedcontent-element`
- `https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element`
- `https://html.spec.whatwg.org/multipage/form-elements.html#the-option-element`

The first descendant selectedcontent is the candidate. A multiple select or an
internally disabled candidate has none; lookup does not skip a disabled first
candidate for a later one. The internal disabled flag starts false and is
recomputed during connection. It is not the element's disabled attribute.
Nested select, option and selectedcontent ancestry have distinct handling.

The implementation copies option children, not option label/value attributes,
using these native integration points:

- Explicit select-selection transactions, including existing native host value
  and selectedIndex setters and `DocumentInteractions.select`.
- Selectedcontent connection and removal, including primary promotion, subtree
  moves, fragment insertion, same-position reinsertion and non-primary clearing.
- Actual parser option closure, including implied ends and final EOF, but not
  transient document-write input boundaries.

The reviewed selectedness-setting algorithm does not itself request a clone.
Option selected setters/attributes, unrelated option insertion, form reset and
ordinary text/attribute mutations therefore do not acquire a new blanket
refresh hook. Copies can retain their previous contents until an explicit
trigger. This distinction is tested; it is not a claim of measured browser
interoperability for those cases.

## Implementation

- `src/document-selectedcontent.ts` owns native disabled flags and lifecycle
  work. It uses the existing option-ownership rule, tree cloning and fragment
  replacement, rather than serialization/reparsing or a new page dependency.
- `src/document.ts` registers allocated selectedcontent nodes and invokes
  connection/removal hooks at native insertion/removal seams. Fragment
  connection follows its option insertion steps. A parser-close entry point
  checks the owning document before notifying the lifecycle component.
- `src/document-selection.ts` notifies only at explicit select-selection
  transaction completion, not from every selectedness reset.
- `src/html-parser.ts` tracks open options by native identity and stack position.
  Stable positions avoid rebuilding the entire active stack for every token;
  stack repairs fall back to locating the original identity. Removed options
  notify before subsequent element insertion or token work; final input closes
  remaining records. Virtual fragment contexts are not registered as real options.
- `src/modern-select.test.ts` updates its current expected tree to include cloned
  content. Historical checkpoint documents and validation reports are unchanged.

Copies have distinct identities and retain native template-content ownership.
Parser script hooks do not execute cloned scripts. A fragment is staged before
replacing the destination, so clone quota failure leaves the old destination
children in place; this is not a promise of rollback for selection state or
all intermediate allocations. Native node/text/depth quotas still apply.
Reentrant explicit updates are replayed with a per-select turn bound of at most
1,024, additionally bounded by the configured node limit. Closing the native
owner clears lifecycle state.

## Validation

Three initial regressions fail before integration: parsed rich children,
explicit selection changes and promotion after removing the primary. Three
additional regressions expose an over-broad reset hook in the initial draft;
removing that hook preserves the specification's explicit trigger boundaries.

Coverage includes parser pop/EOF/write timing, native host setters, disabled and
multiple distinctions, subtree lifecycle, non-primary clearing, detached trees,
option-containing clones, template owners, node identity, atomic child-list
replacement, reentrant selection, event-time contents, closed owners and quota
failure. Host factories and parser callbacks are native code, not a page runtime.

- 44 new tests and 323 focused checks across eight files pass.
- Full native validation passes 8,970 tests across 247 allowlisted files.
- The archived-HEAD owned patch passes 6,210 tests across 186 available files;
  pre-existing untracked suites are absent from that tree.
- Production typechecks, builds, strict new-test typechecks and six-file lint
  pass in both trees.
- Pending document and task-ledger deltas remain unchanged and excluded from
  the checkpoint; pending keyboard and pointer implementations are untouched.

## Remaining gates

- The pre-existing untracked select-keyboard path changes option selectedness
  and emits events separately; its select-update notification integration still
  needs this explicit cloning step. It is not bundled into this checkpoint.
- Coordinate implicit-inert targeting, customizable picker/rendering, fallback
  button text, shadow/flat-tree behavior and XML parser hooks remain open.
- Broader mutation/custom-element timing, cross-owner runtime observation and
  adversarial lifecycle/performance breadth need additional coverage. Native
  synchronous interaction checks do not establish user-interaction task ordering.
- No live website, socket, real TTY/PTY or SafeJS probe ran. The previously denied
  SafeJS probe remains unrun; native passes cannot close those independent gates.

`TASKS.md` and `SEVEN-DAY-PLAN.md` retain the full browser goal and unfinished
acceptance gates. This is native lifecycle progress, not full browser or
selectedcontent interoperability completion.
