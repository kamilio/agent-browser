Additional acceptance case from the browser integration: **nested parser script
execution through a narrowly authorized host operation**.

Parser-integrated document.write now works for ordinary markup and written
external scripts. Inline written scripts cannot be deferred until the outer
script finishes without changing observable JavaScript behavior. For example,
the inner script's assignment must be visible immediately after write returns:

```js
let value = 0;
document.write('<script>value = 1;<\/script>');
if (value !== 1) throw new Error("Nested script ran too late");
```

The local experimental realm intentionally rejects source-evaluation reentry.
Please include a supported, tightly scoped nested-source operation in the public
realm/extension contract, rather than requiring consumers to remove that guard,
replay source, create a second realm, or manipulate VM internals.

Acceptance needs same-realm declarations/object identity, correct synchronous
ordering, shared cumulative budgets and bounded nesting, cancellation and
exception propagation, with no concurrent arbitrary evaluation or escalation of
host capabilities. Ordinary unauthorized reentry must remain rejected. The browser
currently reports nested inline writes as unsupported instead of simulating
incorrect success; external-script document writes already use the real parser.
