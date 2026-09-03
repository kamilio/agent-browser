# Native element dataset

September 3, 2026 continuation of the JavaScript-application work in the seven-day
plan. Native element capabilities now expose a readonly, stable `dataset` object
backed directly by their `data-*` attributes. No runtime dependency is added.

## Shared state and naming

- `element.dataset.userId` reads and writes `data-user-id`; property deletion
  removes the corresponding attribute. Missing properties read as undefined.
- Names are enumerable in attribute-list order, including empty names and numeric
  names. Only a hyphen followed by a lowercase ASCII letter becomes a camel-case
  letter. Other punctuation, hyphens and non-ASCII characters remain intact.
- Setter names containing a hyphen followed by a lowercase ASCII letter are
  rejected. Reading or deleting such an unsupported property does not accidentally
  alias a valid camel-case property.
- Primitive values use the existing DOM-string conversion, so null and undefined
  become the strings `"null"` and `"undefined"`. Guest object/function/symbol
  conversion remains explicitly unsupported rather than executing guest coercion
  on the native call stack.
- Direct attribute changes, attached Attr value changes and dataset operations
  share the same native tree, revision notifications, selector state and HTML
  serialization. Dataset identity survives content edits and detachment; clones
  and separate document owners have independent capabilities.

Implementing this exposed a prerequisite bug: native attribute creation,
mutation, lookup and parsing used Unicode-wide lowercasing. The shared
`htmlAttributeName` helper now folds only ASCII uppercase letters. For example,
`data-Ü` and `data-ü` remain distinct, while `DATA-VALUE` still becomes
`data-value`. Attr identity and streamed tokenizer tests cover this correction.

## Ownership and bounds

`ScriptDatasets` uses the existing host capability interface's named getter,
setter and deleter operations. The local definition now includes the optional
setter/deleter fields already declared in the released-runtime contract types;
no private runtime implementation is imported or modified.

Default limits per owner are 256 retained dataset maps, 4,096 keys per map,
65,536 total enumerated key code units and 250,000 attribute-name work units per
enumeration or setter preflight. Individual property requests are also bounded
by the key-code-unit limit. Names are not retained in a second revision cache.
All attributes, including non-data attributes, count toward traversal work.

Key/count preflight and the existing native text quota run before attribute
mutation. Failed updates leave the old value, attached Attr record and revision
unchanged. Deletion can recover an over-limit map after external attribute writes.
Failed host construction does not consume map capacity. Closing the binding or
tree revokes retained reads, enumeration, writes and deletions.

## Native evidence

All sixteen initial reproductions failed before the changes. The expanded suite
contains forty-six cases covering name mapping, Unicode preservation, primitive
conversion, invalid names, prototype-like names, property order, streamed input,
Attr identity, shared selectors/serialization, detachment, cloning, closure and
resource-failure recovery.

The initial six-file regression command ran only four files because the attribute-tree and
tokenizer-input files were missing from the explicit native allowlist. Those two
files were reviewed as offline native fixtures and their nine existing cases were
restored. Historical reports and counts are unchanged. The final focused run
passes 132 tests across the requested six files.

The full working tree passes 6,268 tests across 193 explicit native files, with no
unhandled errors. An isolated HEAD-plus-owned-patch snapshot passes typechecking
and 3,508 tests across 132 available allowlisted native files, independently of
pre-existing unfinished work. Production build, strict new-test types and targeted
source/test lint and formatting pass. Test lint initially rejected unused delete
expressions; equivalent checked `Reflect.deleteProperty` calls retain deletion
coverage without changing it to assignment.

## Limits of this checkpoint

Native mock-host tests do not prove actual SafeJS named-property execution,
reserved-property handling, framework/site compatibility, real socket behavior,
or terminal/playground acceptance. Those gates remain open and separately
authorized. This does not supply DOMStringMap prototype/WebIDL completeness,
namespace-aware SVG/XML behavior, guest object coercion or exact DOMException
classes. Invalid names use the existing AgentBrowserError profile and native
attribute-name validation remains stricter than the full standard in some cases.

Primary references reviewed September 3, 2026:
`https://html.spec.whatwg.org/multipage/dom.html#dom-dataset` and
`https://dom.spec.whatwg.org/#dom-element-setattribute`. The former defines the
name/value conversion and property operations; the latter requires ASCII-only
attribute-name folding for HTML elements in HTML documents.
