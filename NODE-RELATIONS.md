# Node relationships

Implemented checkpoint, September 3, 2026. This advances K01/K03;
it is not full framework, DOM, released-SDK or real-site acceptance.

## Implemented tasks

- Add live `contains`, `compareDocumentPosition`, `isSameNode` and `isEqualNode`
  to document, fragment, element, text, comment and attribute capabilities.
- Preserve node identity and distinguish identity from structural equality.
  Follow current parents/child order after moves, and keep disconnected ordering
  consistent. Attributes use their special comparison ordering but are not children.
- Reject forged operands, revoke closed owners, and bound traversal, temporary
  paths and compared strings without recursion or retained pair caches.
- Check same/cross-document cases, fragments, attributes, moves, clones, nulls,
  argument validation, resources and teardown with native unit tests.
- Exercise the methods through the actual existing experimental SafeJS core,
  including a guest reconciliation operation that changes native snapshots.
- Run the explicit safe regression suite, build, strict typing, lint and formatting;
  retain evidence and limitations alongside the implementation.

## Semantics and ownership

`src/node-relations.ts` supplies shared relation definitions to `ScriptDom` and
`ScriptAttributes`. A weak capability registry recognizes actual native nodes,
not objects that happen to have a `nodeType` property. Independent live facades
for the same native node retain native identity; separate documents never do.
Each operand's owner must still be open, including when the underlying document
is shared with another facade. Invalid operands and missing arguments throw
`TypeError`; nullable operands produce false for the three Boolean methods.

Containment follows inclusive parent ancestry. It does not treat an attribute as
its owner's child. Position comparison includes ancestor masks, preorder sibling
position, and the specification's special attached-attribute ordering. Detached
trees use stable root allocation order with disconnected/implementation-specific
bits; attaching, removing or moving nodes immediately changes subsequent results.
No pair-order cache retains detached nodes or stale topology.

Structural equality compares kinds, HTML tag names, unordered attribute name/value
sets and ordered descendants, including exact UTF-16 text/comment data. Attribute
equality ignores its owner. Form control state is intentionally not structure.
Comparisons do not mutate the tree, create node copies, or materialize descendants'
guest capabilities. The six position constants are readonly on supported node
instances; a global `Node` constructor and shared prototype graph remain absent.

## Resource contract

Every operation gets a fresh bounded traversal budget. Defaults and lower-only
native configuration are 100,000 work visits, 1,024 path/stack entries and
8,000,000 compared UTF-16 code units. Depth bounds apply to stored ancestor paths
and the explicit equality stack; `contains` uses constant storage and the work
bound. Equality walks iteratively rather than recursively and does not queue all
siblings at once. Work includes visited path/stack entries, attribute visits and
sibling scans; these are algorithm units, not a CPU-instruction or wall-time claim.
Budget exhaustion throws `resource-limit`, never a false equality/order answer.
Identity fast paths do not scan an already identical subtree.

The shared registry uses weak object keys, with no global strong handle list or
retained comparison results. Existing document/session/runtime quotas remain in
force. This is not a whole-process RSS or general host-execution-budget guarantee.

## Verification

- 79 dedicated unit cases cover all 36 pairs in a six-node preorder matrix,
  disconnected roots, fragments, attribute ownership/order, cross-document
  structure, forged operands, mutation freshness, closure and resource failures.
  A 501-element chain verifies iterative equality without recursion.
- A separate command-host case verifies the advertised partial capability and
  exact limits, without claiming namespaces, shadow trees or a global constructor.
- Both initial and final broad runs pass 3,004 tests across 117 explicit safe files.
- Actual experimental-SafeJS probes pass 14 checks in both final and repeat runs.
  Guest keyed reconciliation uses containment/order/equality to remove a clone,
  reorder items and replace changed text; native document order and agent snapshots
  verify the result. This is actual interpreted execution, not a native-only mock.
- Existing experimental-core CharacterData and one-megapixel image integration
  regressions pass 15 and 30 checks, respectively. All transport is in-memory;
  no network, sockets or public-site acceptance is claimed.
- Package build, strict typing of the new and command-host test files,
  seven-file lint, eight-file formatting and whitespace checks pass.
  Initial lint failures were declaration/number-namespace
  style issues in the new test file; they were fixed without disabling rules.

```sh
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
node node_modules/vitest/vitest.mjs run packages/browser-agent/src/node-relations.test.ts packages/browser-agent/src/command-host.test.ts --maxWorkers=1
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js node packages/browser-agent/dist/scripts/check-node-relations.js
```

Reports are indexed in `reports/README.md`. The experimental core is not released
SDK acceptance. The separate existing media function-identity failure remains
open; these tests do not bypass or replace it. Full framework, real-site, Worker
and Playwright/Kitesurf parity gates also remain open.

## Specification scope

Specification references: WHATWG DOM, Node equality and document-position algorithms,
`https://dom.spec.whatwg.org/#dom-node-comparedocumentposition` and
`https://dom.spec.whatwg.org/#concept-node-equals`. The web tool returned no content;
read-only GitHub source retrieval subsequently verified the current WHATWG `dom.bs`
comparison steps and WPT `dom/nodes/Node-compareDocumentPosition.html`. The local
fixtures are not a full upstream WPT run.
The current native model has HTML elements and null-namespace attributes, not
namespace-aware XML/SVG, shadow trees, doctypes or processing instructions. Those
remain outside this checkpoint rather than being silently treated as implemented.
