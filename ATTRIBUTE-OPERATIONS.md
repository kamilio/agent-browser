# Native attribute operations

September 3, 2026 continuation of the JavaScript-application plan. Element
capabilities now expose `toggleAttribute()` and `hasAttributes()`. Basic
name-based attribute methods share the existing bounded attribute owner, including
mandatory-argument checks and an own-property-only getter. No runtime dependency
or alternative browser engine is added.

## Behavior

- `toggleAttribute(name)` adds an empty-valued attribute when absent and removes it
  when present, returning its resulting presence. Optional force uses boolean
  conversion; explicit undefined is treated as omitted, not false.
- Forced true preserves an existing attribute's value and Attr identity. Forced
  false on an absent attribute is a no-op. Neither case increments the native
  revision or allocates a node. Toggle names are validated even for no-op requests.
- `hasAttributes()` reports whether any own attribute exists, including empty
  values and prototype-like names. These methods are exposed only on elements.
- `getAttribute`, `hasAttribute`, `removeAttribute` and `toggleAttribute` require
  a name; `setAttribute` requires a name and value. Missing arguments fail before
  mutation. Explicit undefined still undergoes DOM-string conversion when it is
  passed as a required argument. Additional arguments are ignored.
- Reads only return own attribute values. An inherited `constructor` or
  `__proto__` property on a readonly native node view is not an attribute value.
  Actual attributes with those names remain readable, writable and removable.
- Looking up an invalid but absent name returns null/false. Removing it is a
  no-op rather than attempting to validate a new attribute. Native creation and
  toggle paths still apply the existing attribute-name validator.

Names use ASCII-only case folding, preserving the preceding dataset checkpoint's
non-ASCII distinctions. The methods share the existing 65,536-code-unit name
request limit. Object/function/symbol DOM-string coercion remains explicitly
unsupported; converting an object force to boolean does not invoke its coercion
hooks. Tree or binding closure revokes retained methods.

## Native integration

The new `DocumentTree.toggleAttribute` primitive validates its optional native
boolean argument and delegates actual changes to existing set/remove operations.
It preserves text-budget failure atomicity, attached Attr detachment, revision
notifications, selectors and native control state. Tests verify disabled/enabled
queries, hidden styling and default checked state without overwriting dirty
checkbox state. No-op calls also work at the native text quota.

## Evidence

Ten of eleven initial reproductions failed. Two additional regressions then
demonstrated inherited-property leakage in the former getter; own-property
checking fixes both. The final suite has forty-four cases covering argument
presence, primitive/boolean conversion, no-ops, shared state, Unicode names,
prototype-like names, limits, closure and failure recovery. Focused validation
passes 121 tests across five explicit native files.

Final September 3 validation: the full working tree passes 6,343 tests across 195
explicit native files with no unhandled errors. The isolated HEAD-plus-owned-patch
snapshot passes typechecking and 3,583 tests across 134 available allowlisted
native files. Production build, strict new-test types and targeted source/test
lint and formatting pass. The isolated snapshot excludes pre-existing unfinished
browser work.

The fixtures use native host-object mocks and offline documents. No guest script,
real website, network socket or terminal probe is run by these tests.

## Remaining gates

Actual SafeJS binding behavior, framework/site compatibility, real transport and
terminal/playground acceptance remain open and separately authorized. Attribute
enumeration/order, including integer-like names, namespace APIs, guest object
coercion and exact WebIDL/DOMException/prototype parity remain unfinished. Native
name validation remains stricter than the full DOM standard for some characters.
This checkpoint does not claim complete attribute or browser compatibility.

Primary references reviewed September 3, 2026:
`https://dom.spec.whatwg.org/#dom-element-toggleattribute`,
`https://dom.spec.whatwg.org/#dom-element-hasattributes` and
`https://webidl.spec.whatwg.org/#es-overloads` for optional-argument handling.
