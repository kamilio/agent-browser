# Native select-button inertness

September 4, 2026 checkpoint in the standalone TypeScript browser.

## Reference and scope

Reviewed WHATWG HTML's button definition and inert subtree behavior on September 4:

- `https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element`
- `https://html.spec.whatwg.org/multipage/interaction.html#inert`

The first element child of a select is inert when it is a button. This is not
the first button anywhere in the select, and it is not conditional on the
button's type. Earlier text/comments do not displace it; an earlier element,
including a hidden element, does. Button Auto submission classification remains
a separate question, implemented in `BUTTON-AUTO.md`.

This checkpoint integrates implicit inert roots into native reference targeting,
focus and semantic output. It does not establish complete pointer hit-testing,
customizable select rendering or runtime parity.

## Implementation

- `src/inertness.ts` recognizes explicit inert attributes and the first direct
  select-child button. It identifies roots; callers retain their existing
  ancestor traversal or parent-inclusion propagation for descendants.
- `src/focus.ts` excludes those roots and descendants from direct and sequential
  focus, including stale active focus and event-time target rechecks.
- `src/interactions.ts` rejects inert reference targets and suppresses user label
  forwarding into the inert subtree. Existing hidden allowances do not bypass
  inertness. No inert attribute is manufactured or disabled flag changed.
- `src/snapshot.ts` excludes the subtree from ordinary, expanded locator and
  scoped snapshots, using the same inclusion propagation as explicit inertness.
- Extraction already excludes selects, including scoped descendants through
  ancestor checks; its implementation is unchanged and a regression retains that
  boundary.

The first-element lookup is cached by the select's immutable native node view
in a weak map. Child-list changes publish a new view; insertion, removal,
reordering, replacement and cloning therefore use current parentage. The map
holds no strong document reference. Scanning stops at the first element and is
bounded by the existing native node quota. Repeated sibling queries share the
scan instead of multiplying a long text/comment prefix by the button count.

Inertness does not change native form ownership, explicit submit classification,
constraint-validation eligibility or successful entry collection. Explicit
synthetic event dispatch still reaches the native event path. These checks do
not claim that user input can activate inert content or that a page runtime was
executed.

## Validation

Three of four initial regressions fail before integration: direct focus,
reference activation and semantic exposure. Scoped extraction already passes.
The expanded suite covers first-element rules, explicit/implicit distinctions,
descendants, focus traversal, asynchronous actions, focus-handler mutations,
label forwarding, direct event dispatch, form preparation, snapshots, sibling
changes, replacement, clones, scan sharing and closed owner checks.

The scan-sharing test constructs 200 comment-prefix nodes and 200 buttons. Its
first pass requires no more than 601 native reads, and the unchanged second pass
requires 400 reads. These are deterministic native method-call counts, not a
live browser performance measurement.

- 45 new tests and 209 focused checks across eight files pass.
- Full native validation passes 8,890 tests across 245 allowlisted files.
- The archived-HEAD owned patch passes 6,130 tests across 184 available files;
  pre-existing untracked suites are absent from that tree.
- Production typechecks, builds, the new test's strict typecheck and five-file
  lint pass in both trees.
- The owned interaction patch reverses exactly to both original worktree and
  HEAD baselines. Pending interaction and task-ledger changes remain excluded
  from the commit. No new runtime dependency was added.

## Remaining work and gates

- Coordinate hit-testing and mouse event targeting still need the same implicit
  inert rule. Their pre-existing untracked implementation is not bundled into
  this commit; reference actionability coverage is not coordinate-target parity.
- Selectedcontent cloning, picker interaction/rendering and broader select
  behavior remain unfinished.
- Flat-tree/shadow behavior, modal-dialog escapes and CSS-driven inertness are
  not implemented by this ordinary native-tree helper.
- Native synthetic event dispatch is not evidence for page `.click()` runtime
  behavior, default-action equivalence or SafeJS acceptance.
- No live website, socket, real TTY/PTY or SafeJS probe ran. The previously
  denied SafeJS probe remains unrun and independent gates stay open.

`TASKS.md` and `SEVEN-DAY-PLAN.md` retain the full browser goal and outstanding
acceptance gates. This is an incremental checkpoint, not completion of the
browser or of the seven-day work window.
