# Script document import

Native checkpoint, September 4, 2026. `document.importNode` now connects script
node capabilities to the existing `DocumentTree.copyFrom` primitive. The native
engine and SafeJS dependency boundary are unchanged.

## Connected behavior

- Imports elements, text, comments, document fragments and Attr capabilities
  from this or another open script owner. Every result is a new destination-owned
  node; descendants and materialized attributes use the destination owner too.
- Imports copy rather than adopt. The original parent, children, attributes and
  control state remain intact. Returned roots are detached; inserting an imported
  fragment consumes only its copied children, not the original fragment.
- Relative attributes retain their text, while reflected URLs and `baseURI` use
  the destination document. Imported copies remain usable after source teardown
  and are revoked when their destination script owner closes.
- Existing native cloning state is reused: input current values/dirty flags,
  checkedness, native indeterminateness, option selectedness/dirtiness and textarea
  current values. Custom validity messages and registered event listeners are not
  transferred. This does not add missing control properties to the script API.
- Copy construction does not emit observer mutation records. Later insertion
  emits the existing destination child-list mutation, without changing the source.
- Importing a Document throws `NotSupportedError`. Missing/forged node operands
  throw `TypeError`. Ordinary append/move APIs still reject foreign capabilities;
  this explicit copy operation does not relax their identity checks.

## Options

The current DOM Standard accepts a boolean or `ImportNodeOptions` dictionary.
An omitted/undefined second argument is shallow. Boolean true copies descendants;
other primitive values follow boolean conversion. Dictionary `selfOnly` defaults
to false, so `{}` and null request descendants; `{ selfOnly: true }` is shallow.
The converted native dictionary reads `customElementRegistry` before `selfOnly`
and does not enumerate unrelated properties. Native accessor/inheritance cases
have tests; guest argument-conversion behavior still needs runtime validation.

Any non-undefined `customElementRegistry` is explicitly unsupported. This engine
does not implement custom-element registries or reactions. Source and destination
ownership are rechecked after option conversion, before any node is allocated.

## Ownership and bounds

`NodeRelations.source` resolves only identities already registered by native
node/attribute owners. It does not trust copied fields, descriptors, prototypes,
Proxy wrappers or an `ownerDocument` claim. The resolver remains native code, not
a page capability. Both owners must be open; possession of a node capability is
not a new mechanism for obtaining one from another origin or page.

The existing destination node-count, UTF-16 text and depth quotas are checked
before copying a subtree. Attribute imports also use existing attribute-object
admission and native node/text quotas. Quota failures allocate nothing and do not
mutate the source. The default document limits remain 50,000 nodes, 2,000,000 text
code units and depth 256; no alternate unlimited clone store is added.

Copies consume destination lifetime retention even while detached. As with the
existing native create/clone operations, a host-capability provider failure after
allocation is not a transactional rollback of those document nodes. Retention is
still bounded by the destination quotas and released by document teardown. This
checkpoint does not claim guest-GC reclamation or provider-failure rollback.

## Native evidence

All five initial import regressions fail before the binding is added. The final
test file contains 58 cases covering cross/same-document imports, fragments and
attributes, copied state/URLs, primitive/dictionary conversion, authenticated
identity, teardown, listener isolation, mutation capture and quota failures.
Focused validation passes 270 tests across eight explicit native test files.

Final full native validation passes 7,881 tests across 223 files. A separate
committed-HEAD snapshot plus only the owned patch passes 5,121 tests across its
162 available allowlisted files. Production and new-test typechecks, builds and
four-file Biome checks pass in both trees. Earlier full runs predated the final
two URL/textarea regressions; the final runs include all 58 new cases. Existing
pending feature work is preserved and not included in the isolated patch.

## Open gates

There is no SafeJS execution or live-site/socket/TTY/PTY probe in this checkpoint.
The prior denied SafeJS fetch probe is not retried. Native fixtures establish the
connected host binding, not interpreted cross-realm identity/exception fidelity.
Namespaces, doctypes, CDATA/processing instructions, shadow trees, templates,
custom elements, cross-document adoption and full framework/site acceptance remain
open. The seven-day browser goal is still active.

## Research

Reviewed the primary [DOM import algorithm and options](https://dom.spec.whatwg.org/#dom-document-importnode),
[Web IDL union conversion](https://webidl.spec.whatwg.org/#es-union), and
[HTML input cloning steps](https://html.spec.whatwg.org/multipage/input.html#the-input-element)
on September 4, 2026. The options dictionary is deliberately not reduced to the
older boolean-only interpretation.
