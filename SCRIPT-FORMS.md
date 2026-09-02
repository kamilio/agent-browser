# Script-visible forms and controls

Interpreted page scripts can discover forms, inspect their associated controls,
set radio-group values and configure native form request preparation. This uses
the existing document, control indexes and bounded host collections, without a
separate JavaScript form model or additional dependencies.

## Implemented surface

- `document.forms`: stable live indexed collection with `length`, `item` and
  `namedItem`. Form removal and ID/name changes are visible through saved views.
- `form.elements` and `form.length`: listed native controls in tree order,
  including external `form` associations and fieldsets, excluding image inputs.
- `form.elements.namedItem(name)`: null, one matching element, or a fresh live
  radio-node-list-style group for multiple exact ID/name matches. A saved group
  remains live even when it shrinks to one or zero members.
- Group `value`: reads the first checked radio's value, with `on` as the missing
  value fallback. Assignment checks the first matching radio through native
  group state. Non-radio matches are ignored; absent values leave state alone.
- Form properties: `name`, `action`, `method`, `enctype`/`encoding`, `target`,
  `autocomplete`, `acceptCharset` and `noValidate`. URL/enum getters use the
  implemented reflected-value rules; setters change native attributes.
- Associated controls expose `form` and `name`. Applicable input/textarea/button/
  fieldset bindings add reflected disability, readOnly, required, placeholder,
  multiple and type properties; buttons also expose attribute-backed value.

Property writes do not dispatch input/change events. Native agent actions still
perform actionability checks and event dispatch. Form metadata and group values
feed real native GET/POST request preparation, including external controls.
Resolving or assigning an action URL does not itself navigate or fetch it.

## Ownership, bounds and limitations

Collection views share the existing item, work, text-query and cached-entry
budgets. Every multi-match named lookup creates a new group and consumes one of
the default 256 collection slots; groups are not silently reused to fake fresh
identity. They remain owned until script-document closure, which revokes saved
collections and groups. There is not yet guest-GC-aware reclamation.

Names are compared directly as data, not embedded in selectors. Primitive
conversion is supported; object/function/symbol coercion is rejected without
running guest hooks. The implementation does not promise full Web IDL coercion.

Direct named-property access (`elements.color`, `form.email`), form numeric
indexing, past-names maps, constructors/prototypes, NodeList helpers beyond the
implemented indexed/item surface, custom form-associated elements and fieldset
elements collections remain open. Full radio/default-checked dirtiness and input
type-transition rules remain incomplete. Existing form-owner semantics are not
proof of complete parser/reassociation conformance.

Guest `submit()`, `requestSubmit()`, `reset()` and validity methods are still
missing; native form actions are separate. No success stubs or promise substitutes
were introduced for those synchronous/eventful browser APIs. Dialog submission,
full validation and general browser form conformance are not certified here.

## Evidence

- `reports/script-form-focused-2026-09-02.json`: 1,144 passing tests across 54
  files, including sixteen new form/collection/group/reflection/boundary cases.
- `reports/script-form-safejs-fixture-2026-09-02.json`: nine actual experimental-
  core checks of interpreted collections, fresh live groups, reflected metadata,
  native radio events and native GET/POST preparation using actual script values.
- `reports/script-form-selection-state-regression-2026-09-02.json`: ten existing
  interpreted/native selection-state checks.
- `reports/script-form-action-wait-regression-2026-09-02.json`: eight actual-core
  command-host waiting/cancellation checks.

Fixtures are entirely in memory. POST preparation is not a network POST or a
real-site pass. No new public-site/live-PTY, visual playground, released-SDK or
full browser conformance acceptance is claimed.

Specification references inspected September 2, 2026:
https://html.spec.whatwg.org/multipage/common-dom-interfaces.html#htmlformcontrolscollection
https://html.spec.whatwg.org/multipage/forms.html#the-form-element
These are implementation references, not an executed upstream parity suite.
