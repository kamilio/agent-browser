# Live native validity state

September 3, 2026. Supported form controls now expose a stable, readonly page
`validity` object. A shared native flag evaluator drives both that object and
existing form validation, rather than converting a single prioritized error
into an incomplete set of flags.

## Implemented behavior

- All eleven ValidityState property names are exposed through live getters.
  Custom errors can coexist with missing values or syntax failures; numeric
  underflow, overflow and step mismatch are evaluated independently. Submission
  still reports one prioritized reason and dispatches one invalid event per
  control. The earlier canonical-decimal numeric policy remains unchanged.
- Validity state is distinct from validation candidacy. Disabled/read-only
  scalar controls are not missing required values when immutable, while required
  checkboxes, file controls and selects retain their missing-state semantics.
  Barred controls can retain a custom error; read-only email syntax errors remain
  visible even though those controls do not participate in submission validation.
- Required radio-group checks now require a nonempty group name. Unnamed/empty-name
  radios do not become singleton required groups. Named groups share the existing
  native peer-state owner and the per-form validation cache.
- Held objects update across value, peer selection, default, type, attribute and
  custom-message changes. Clones and different script owners receive distinct
  capabilities. Flag reads do not dispatch invalid events or mutate the document.
- Successful full flag snapshots are cached per document revision. Reading all
  properties fifty times in the fixture performs one evaluation, not 550; the
  next document mutation causes a fresh evaluation. Snapshots contain booleans,
  not retained copies of input values or custom error text.

## Capability ownership

Each script owner admits at most 1,024 validity objects, allocated lazily. Creation
reserves a slot before calling the host-object factory; same-node reentrancy fails
explicitly and other-node reentrancy cannot bypass the cap. Failed creation releases
the slot. A reproduced regression showed a getter leaked by a failed factory could
revive after a retry; getters now bind to their original state identity and cannot
read a replacement object's state. Factory-triggered closure cannot retain a zombie
capability. Closing the owner/document releases cached state and revokes held getters.

## Native evidence

All four initial page regressions fail before implementation. Forty-five new cases
cover live identity, simultaneous flags, immutable versus barred controls, radio
and select peer changes, native external-upload separation, unsupported profiles,
read-only properties, caching, quota admission, failed/reentrant creation, escaped
getter revocation, cloning, multiple script owners and closure.

Focused validation passes 324 tests across seven explicit native files. Production
build, strict new-test types and seven-source lint/format checks pass, preserving
pre-existing import order in the dirty page adapter.
The full native run passes 6,938 tests across 207 explicit files. An isolated HEAD
snapshot with only the owned evaluator, capability, adapter and test patch typechecks
and passes 4,178 tests across 146 available allowlisted files. Runs use Node v22.22.0
and Vitest v4.1.10 on Linux x86_64.

## Limits and acceptance gates

This is the supported native constraint profile, not complete constraint-validation
conformance. Existing unsupported pattern/length/calendar/range/color profiles still
throw instead of manufacturing successful flags. `customError` remains readable
for such profiles, and a known custom error makes `valid` definitively false; clearing
it does not imply the other constraints are implemented. Other property reads can
still throw for an unsupported profile, even if a particular flag is independently
decidable. These broader per-flag queries remain open.

Pattern/length flags are false only within supported profiles without those
unimplemented constraints. `badInput` is false for the representable native state;
there is no UI invalid-edit buffer or locale-dependent number editing here.
The page object does not gain checkValidity/reportValidity methods. Synchronous
guest callback semantics, reporting/focus UI, complete WebIDL behavior, real FileList
selection, precision parity and actual SafeJS/site/socket/TTY/UI acceptance remain
open. No separately authorized runtime or live acceptance probe runs here.

Primary references reviewed September 3, 2026:

- `https://html.spec.whatwg.org/multipage/form-control-infrastructure.html`
  Live validity objects, readonly flags and their independence from candidacy.
- `https://raw.githubusercontent.com/web-platform-tests/wpt/master/html/semantics/forms/constraints/form-validation-validity-valueMissing.html`
  Missing-value distinctions for immutable controls and unnamed radios. The
  upstream browser test suite was not executed; these informed native fixtures.
