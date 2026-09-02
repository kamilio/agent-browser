## Problem

Guest-defined functions cannot currently behave as JavaScript objects with their
own properties and constructor prototypes. This blocks real libraries such as
jQuery at assignments equivalent to `library.fn = library.prototype = {...}`.

Current upstream `main` inspected on September 1, 2026:
`1a13eb31dd2671828ed3419d9397d7264b5b6788`.
`packages/safe-js/src/interp/interpreter.ts` still contains the explicit function
property/constructor-prototype limitations around lines 3062 and 3370.

## Minimal reproductions

Using the public `run` export from the SafeJS core, execute each independently:

```js
function Counter() {}
Counter.label = "counter";
return Counter.label;
```

Expected: `"counter"`. Observed: TypeError,
`Assignment expressions require a sandbox object property.`

```js
function Counter() { this.value = 7; }
Counter.prototype.read = function() { return this.value; };
return new Counter().read();
```

Expected: `7`. Observed: TypeError,
`Cannot assign properties of null or undefined.`

```js
function Counter() {}
return new Counter() instanceof Counter;
```

Expected: `true`. Observed: TypeError,
`Constructor prototypes are not supported; check a brand property instead.`

These snippets were executed against a local `v13.0.10`-based experimental
candidate. The newer upstream main source was separately inspected for the same
limitations; this is not a claim that the experiment executed that newer checkout.

## Requested implementation

- Represent guest-defined function own properties and ordinary constructor
  prototypes within the sandbox object model, not on native host functions.
- Support ordinary own-property assignment/read/delete/enumeration/descriptor
  behavior and constructor-instance prototype lookup needed by these examples.
- Preserve callable identity, closures, constructor return rules, `this`, shared
  prototype identity, and ordinary `instanceof` behavior.
- Keep this a core language-semantics feature, not a browser-specific extension
  or source-rewriting workaround.

## Safety and regression acceptance

- All three examples pass, plus a chained assignment similar to
  `library.fn = library.prototype = { ... }`.
- Distinguish constructible ordinary functions from arrows/other nonconstructible
  callables; do not make every callable a constructor accidentally.
- Guest properties/prototypes never expose native `Function`, host constructors,
  process/module globals or other ambient capabilities. Existing restrictions on
  host operations and live capability objects remain intact.
- Prototype cycles, aliasing and recursive data stay bounded and correctly
  accounted for; property access cannot bypass cancellation or fatal budgets.
- Preserve callback retention, realm isolation, copying and snapshot/replay
  invariants. Test each supported serialization path or explicitly reject the
  unsupported case rather than silently dropping function properties.
- Run both small semantic regressions and an unmodified real-library smoke test.
  A full jQuery page may expose further missing APIs; do not count downloading or
  merely parsing that source as successful website execution.

## Real-library evidence

The public script at `https://quotes.toscrape.com/static/jquery.js` is 84,345
characters, SHA-256
`f16ab224bb962910558715c82f58c10c3ed20f153ddfaa199029f141b5b0255c` in the observed
response. With earlier parser/regex gaps addressed in the local experiment, the
unmodified source reaches this function-property error. No native browser engine,
native RegExp fallback or source rewriting is involved. This issue isolates the
next core semantic blocker rather than promising complete browser compatibility.
