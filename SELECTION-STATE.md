# Persistent native selection state

Option selectedness is now stored in the native document rather than recomputed
from attributes on every control-index rebuild. A separate document-owned dirty
set records which options have explicitly changed state. This fixes the common
mutation/default/reset gaps documented at the first `SCRIPT-SELECT.md` checkpoint.

## State and mutation behavior

- Automatically selecting or deselecting an option no longer makes its default
  attribute authoritative forever or incorrectly dirties every peer. Select
  value/index assignments dirty their selected target while preserving clean
  peer defaults. Explicit option.selected assignments dirty that option.
- Selected attributes, including attribute-node changes, synchronize clean
  options. Dirty options keep their current state until reset clears dirtiness.
- Removing or reparenting selected options repairs the old owner and updates
  the new owner's selection. A newly inserted selected option takes precedence
  in a single-select, even when inserted before an existing selected option.
- Turning multiple off normalizes selectedness persistently; turning it back on
  does not resurrect discarded selections. Increasing display size preserves
  an existing selection rather than recomputing it away.
- An explicit empty selection survives reads, unrelated attributes, style
  invalidation and moving an entire select. An option insertion can request
  selection repair. Disabled fallback options and optgroups are skipped.
- Fragment insertion, native replacement imports, text replacement, detached
  option moves, cloning and cross-document copies share this state machinery.
  Copies retain independent current selection and dirtiness.
- Native form reset restores defaults and clears dirtiness through the same
  document state, without generating extra input/change events. Existing reset
  event cancellation and recursion protection remain in the form-action layer.

Native control indexes, form preparation, live script collections, selectors and
snapshots now consume current selectedness. Raw DOM inspection consequently sees
explicit true/false option control state, including an untouched option's false
state. Waiting remains read-only; its tests compare both state and revision.

## Ownership and bounds

`src/document-selection.ts` is owned and closed by DocumentTree. It tracks option
owners, selected members, fallback eligibility and dirtiness within the native
node budget. It does not register guest callbacks or create a second document.
Eligibility is updated for option/optgroup disability changes and subtree moves.
An all-disabled growing list can therefore skip repeated full-prefix searches.

The deterministic work test builds 5,000 disabled options and asserts fewer than
30,000 state-machine node reads. This checks that particular incremental path,
not a universal performance bound or public-site latency claim. Structural
subtree traversal and selection normalization still depend on document size.
Existing allocation/depth checks run before structural mutation and state repair.

## Remaining limits

The engine's option ownership traversal is still a subset: modern customizable
select exclusions, nested optgroup/option/datalist/foreign-content edge cases and
complete size parsing are not certified. Full browser user-interaction task
timing, native batch-action dirtiness conformance, validity/picker behavior and
the missing script APIs in `SCRIPT-SELECT.md` remain open. This checkpoint does
not claim complete HTML select conformance or general framework compatibility.

## Evidence

- `reports/selection-state-focused-2026-09-02.json`: 1,128 passes across 53 files,
  including 22 new mutation/state/resource cases and native control, fragment,
  form, script, waiting, command-host and browser regressions.
- `reports/selection-state-safejs-fixture-2026-09-02.json`: ten actual
  experimental-core checks. Interpreted reparenting, removal, default changes,
  multiple-mode transitions and cloning agree with native selection; native
  form preparation and reset observe the same repaired state.
- `reports/selection-state-script-select-regression-2026-09-02.json`: eleven
  prior property/collection/native-action checks.
- `reports/selection-state-action-wait-regression-2026-09-02.json`: eight
  actual-core command-host waiting and cancellation checks.

All fixtures are in memory. No dependencies or SDK changes, real-site/live-PTY
acceptance, visual playground acceptance or released-SDK acceptance are included.

Specification reference inspected September 2, 2026: HTML Standard, select
selectedness/reset and option dirtiness algorithms:
https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element
https://html.spec.whatwg.org/multipage/form-elements.html#the-option-element
This is not an executed upstream browser-conformance suite.
