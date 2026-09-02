# Script-visible select controls

The native DOM now exposes common select/option properties to interpreted page
JavaScript. These are live views of the same form state used by native actions,
selectors, snapshots and submission, not a second JavaScript-only form model.
This closes the missing-property failure observed in the action-wait fixture.

## Implemented surface

- Select: read/write `value`, `selectedIndex`, `multiple`, `disabled`, `required`
  and `name`; read-only `type`, `form`, `options`, `selectedOptions` and `length`.
- Option: read/write `value`, `text`, `label`, `selected`, `defaultSelected` and
  `disabled`; read-only `index` and `form`. Detached options retain their own
  current/default state and acquire collection membership when inserted.
- Optgroup: reflected `label` and `disabled` properties.
- Stable live option collections expose indexed reads, `length`, `item` and
  `namedItem`. They refresh with the native document revision and share existing
  collection item/count/cache/work limits. Closing the script DOM revokes saved
  properties and collections.
- `select.remove(index)` removes the indicated option, with out-of-range indexes
  doing nothing. No-argument `select.remove()` retains ordinary element removal;
  previously arguments were ignored and the select itself was removed.

Assigning select value selects the first matching option, including disabled
options; an absent value clears selection. Assigning selectedIndex selects one
option or clears it when outside the list. Option selected writes support single
selection, multiple selection, and the existing dropdown/listbox fallback rules.
Property writes do not generate input/change events. Native select actions still
perform actionability checks and dispatch their existing event sequence.

Option text and fallback values collapse ASCII whitespace and omit script text.
Explicit empty values/labels remain empty. Primitive string/index conversion is
supported; object/function/symbol coercion and BigInt index conversion fail
without executing guest conversion hooks or changing selection.

## Deliberate limits

This is not complete HTMLSelectElement/HTMLOptionElement implementation. There
are no Option constructors/prototype guarantees, options indexed writes,
named-property access, options add/remove methods, select add/item/namedItem
methods, length resizing, selectedIndex on the options collection, full size
reflection, validity API or picker UI. Unsupported select length writes fail
explicitly. Ordinary appendChild/removeChild and indexed collection reads work.

`SELECTION-STATE.md` now fixes common peer-default, dirtiness, repeated-mode and
structural selection-repair gaps through persistent native state. Its mutation,
copy and reset checks do not prove complete select conformance. Modern
customizable-select ownership, template/foreign-content edge cases, exact native
user-interaction dirtiness/task rules and full Web IDL coercion remain open.

## Evidence

- `reports/script-select-focused-2026-09-02.json`: 1,070 passing tests across 49
  files, including nineteen dedicated binding cases, plus native controls,
  command host, action waiting, collections and browser regressions.
- `reports/script-select-safejs-fixture-2026-09-02.json`: eleven actual
  experimental-core checks. Interpreted property writes update native form
  serialization; option construction and saved indexed collections work;
  native selection runs interpreted input/change handlers exactly once.
- `reports/script-select-action-wait-regression-2026-09-02.json`: eight checks
  now using actual interpreted option.value assignment and select.value reads,
  rather than the earlier attribute/native-inspection-only workaround.
- `reports/script-select-target-locators-regression-2026-09-02.json`: eight
  existing interpreted/native locator-action checks.

All transports and fixtures are in memory. No external dependency, SDK change,
public website, live terminal, visual playground, released-SDK or full browser
conformance acceptance is implied. Historical action-wait reports are preserved.

## Specification reference

HTML Standard, select and option elements, inspected September 2, 2026:
https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element
https://html.spec.whatwg.org/multipage/form-elements.html#the-option-element

This is an implementation reference, not an executed upstream conformance suite.
