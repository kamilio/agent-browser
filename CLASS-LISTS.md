# Live class lists

Status: September 2, 2026. Page elements now expose an owned, live classList
capability backed by the real document attribute. No dependency, copied guest
class map or native browser was added.

## Supported behavior

- Repeated reads of an element's classList return the same object in its page
  realm. Saved objects see subsequent className/setAttribute/removal changes and
  remain live on detached elements.
- Tokens form a case-sensitive ordered set split on ASCII whitespace. Duplicate
  tokens appear once in indexed reads, length and item(index). Missing indexed
  values are undefined; item returns null. The existing bounded indexed SafeJS
  contract supplies live for-of iteration and Array.from support.
- value and explicit toString() preserve the actual attribute text, including
  duplicate tokens and whitespace. Mutating token operations serialize the
  resulting set with single spaces. Assigning element.classList forwards to value
  without replacing its object identity; value assignment preserves its raw text.
- add/remove validate every input before changing the attribute. Empty tokens or
  ASCII whitespace in mutation tokens fail atomically. contains performs literal
  membership testing rather than mutation-token validation.
- toggle supports ordinary toggling and forced presence/absence. Omitted or
  undefined force toggles; other force values use Boolean conversion. Forced
  no-ops do not normalize the attribute. replace maintains ordered-set position,
  handles an already-present replacement and reports whether the old token existed.
- Zero-argument add/remove normalize existing attributes but do not create an
  absent empty attribute. supports throws because class names have no fixed
  supported-token vocabulary.

All actual mutations use DocumentTree.setAttribute, so native selectors, CSS
visibility, semantic snapshots and agent actionability see the same changes.
There is no separate class state that could disagree with the DOM.

## Resource and ownership contract

The page adapter allows at most 1024 class-list identities, 4096 unique tokens per
list, 65,536 UTF-16 code units per input/attribute and 256 method arguments.
Combined cached raw/token text and token-record allowances are charged against
1,048,576 code units. This is a bounded cache accounting rule, not a heap/RSS
measurement. Native tests lower these limits to exercise failure paths.

Token caches refresh only when their actual class attribute string changes, not
when unrelated parts of the document change. Cache/token/string limits are
checked before writes. If the document itself rejects a write, the prior cache
and attribute stay intact. Oversized external class attributes cause explicit
read errors instead of stale token results; replacing their value with a valid
smaller string permits recovery.

Closing the page DOM or document revokes saved class-list capabilities and clears
their cached data. `PageScripts.metrics().dom.classLists` reports list count,
cached code-unit charge, refreshes and closed state without exposing class text.

## Incomplete behavior

This is not full DOMTokenList/prototype or Web Platform Test conformance.
forEach and explicit entries/keys/values iterator methods are not provided.
Implicit stringifier/prototype behavior, generic borrowed-method receiver rules,
DOMException identity and arbitrary guest object-to-string coercion are incomplete
or unverified. Primitive DOM strings and unsigned item-index conversion are
supported; host-side guest conversion hooks are not executed. This change does
not add relList, part or other token-list attributes, SVG animated className, or
MutationObserver semantics. Capability metadata keeps `domTokens.partial: true`.

## Evidence

`src/script-class-list.test.ts` covers identity, liveness, exact whitespace rules,
normalization, toggling, ordered replacement, validation atomicity, forwarded
assignment, conversion, detached ownership, limits, cache reuse and recovery.
It includes document-budget failure without stale cache updates.
The focused checkpoint records 918 passing tests across 41 files, including
35 class-list cases plus existing DOM, CSS, selectors, snapshots and browser
regressions. Strict package/test compilation and formatting pass.

`scripts/check-class-list.ts` loads the self-authored class-driven UI fixture into
actual experimental SafeJS. Native agent clicks trigger interpreted class
mutations, reveal a previously CSS-hidden button, retain its node reference,
activate it and hide it again. Additional checks cover live indexing/iteration,
assignment, invalid operations and realm cleanup. No second response is needed
for the visibility/action changes.
Fourteen actual-interpreter checks pass. Existing storage/event (19), navigation
(21) and fetch/CORS (24) interpreter checks also pass with the new bindings.

Results are recorded in `reports/class-lists-focused-2026-09-02.json` and
`reports/class-lists-safejs-fixture-2026-09-02.json`. Run the built interpreter
probe with `check:class-list` and the configured experimental SafeJS source root.
These are in-memory tests, not public framework/site, live PTY, deployed
playground or released-SDK acceptance. The full browser goal remains active.

## Standards targets

- DOMTokenList: https://dom.spec.whatwg.org/#interface-domtokenlist
- Ordered sets: https://infra.spec.whatwg.org/#sets
