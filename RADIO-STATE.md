# Native radio checkedness ownership

September 3, 2026. Radio selection now belongs to a native checkedness owner,
separate from checked-attribute defaults and the dirty checkedness flag. The
previous control index recomputed a winner from attributes and dirty overrides
at read time, which could resurrect an unchecked default and lose mutation order.
This corrects the reproduction recorded in `FORM-DEFAULTS.md` without rewriting
that checkpoint's historical evidence.

## Shared state

- Setting an input's checkedness selects that radio and unchecks the group's
  previous winner. Automatic peer changes preserve each peer's dirty flag.
- Adding/removing checked attributes updates clean inputs. Merely changing the
  value of an already-present boolean attribute does not reselect an unchecked
  radio. Dirty inputs retain their current state until reset.
- Removing the winner, clearing its checkedness or moving it to another group
  does not resurrect old checked attributes. Reset restores defaults in control
  order and makes the controls clean again.
- Group keys include tree root, form owner and nonempty case-sensitive name.
  Type/name/form changes and structural moves reconcile memberships. Explicit
  form references track first-ID lookup, including masking non-form elements,
  late form insertion and ID changes. Disconnected controls use their nearest
  ancestor form, shared with native form-owner queries.
- Copying/cloning preserves current checkedness and dirtiness. Sparse native
  control overrides preserve clean defaults while representing automatic
  unchecks explicitly. Attached Attr mutation uses the same owner.
- Native setters, page checked/defaultChecked, RadioNodeList value assignment,
  activation and reset use this state. Canceling radio activation restores the
  previous eligible radio without marking that radio dirty.

`DocumentTree.setInputChecked(id, checked, dirty = true)` validates the native
input and boolean arguments. Internal activation restoration uses `dirty = false`
to preserve dirtiness, not clear it. `clearControl` performs reset. Guest code
does not receive these native tree methods.

## Work and lifetime

The owner retains membership, one selected ID per group, dirty input IDs and
explicit-form reverse references, bounded by the native document's nodes and
attribute text. A normal checkedness write updates the target and previous winner
without scanning other group members. A 2,001-radio native fixture independently
instruments private node reads and requires at most six reads for a winner switch.

Topology changes inspect the moved subtree and affected explicit-form references;
ID lookup can scan the relevant root once per reconciliation. This is not a claim
of constant-time structural mutations or linear total cost for repeated explicit-
form construction. Repeated regrouping, parser forms and real-site throughput
remain performance/conformance work. Closing the tree clears all owner maps.

## Evidence and boundaries

All eight initial reproductions failed. Thirty-five new cases cover clean/dirty
transitions, default removal, group moves, form references, frozen snapshots,
selectors, Attr edits, clone/import, reset/submission, script bindings,
RadioNodeList writes, canceled activation, failed allocation and closure. An
independent flat-group model checks 500 deterministic mixed transitions.
Expanded testing caught a batch-regrouping issue when detaching a form: pending
checked peers now receive the first applicable selection's uncheck before their
own transition is processed.

Focused validation passes 196 tests across nine explicit native files. The full
working tree passes 6,505 tests across 199 files. An isolated HEAD snapshot with
only these owned changes typechecks and passes 3,745 tests across 138 available
allowlisted files. It uses the committed native checked-action entry point rather
than depending on an uncommitted helper. Production build and strict new-test
typechecking pass. Seven-source lint/format checks pass with import organization
disabled to preserve pre-existing import order in dirty files.

Specification review used
`https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio)`
and `https://html.spec.whatwg.org/multipage/form-control-infrastructure.html` on
September 3, 2026. These establish the mutation triggers, dirty/default distinction
and form-owner reset rules; native tests are not browser comparison evidence.

No runtime dependency, alternative browser engine or SafeJS modification was
added. Native tests do not close actual SafeJS execution, website/framework,
socket, real TTY/PTY or UI gates. Parser-specific non-ancestor form associations,
shadow trees, full WebIDL/prototype behavior and input type value-mode transitions
are not completed by this checkpoint. No unapproved acceptance probe ran.
