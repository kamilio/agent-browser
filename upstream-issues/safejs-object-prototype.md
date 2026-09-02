# Sandbox-owned Object.prototype type inspection

Related to #541. Guest-defined constructor prototypes now work in the local
browser candidate, but unmodified jQuery 1.9.1 from Books to Scrape advances to
type inspection and fails at the equivalent of a cached `({}).toString.call(value)`.
The ordinary object has no inherited `toString` in the current subset.

Actual public-core reproductions on the v13.0.10-based local candidate:

```js
({}).toString.call([])
Object.prototype.toString.call([])
Object.getPrototypeOf({})
```

All fail rather than providing standard object inspection. The tested base is
`7fbbd81fd99c46928bcf314ad89410b946d203cc`; this is not an execution claim about
newer upstream main. The browser does not rewrite jQuery or inject fake type tags.

## Requested capability

- Provide realm-owned intrinsic Object.prototype behavior, including generic
  `toString`, `hasOwnProperty`, and `Object.getPrototypeOf` needed by libraries.
- Return appropriate tags for supported values without exposing interpreter
  records such as a function's internal `kind`/`call` implementation fields.
- Integrate with ordinary guest constructor inheritance, own/enumerable property
  rules, and appropriate errors for invalid receivers.
- Never traverse or grant the host's native Object/Function prototypes. Native
  prototype pollution must not affect guest lookup, nor may guest mutations leak
  into another realm or the native process.
- Keep lookup, mutation and serialization/copy behavior budgeted and explicit.

Acceptance includes native-comparison type-tag tests across supported primitives,
arrays, functions, ordinary/custom-prototype objects and null/undefined receivers;
safe prototype identity/isolation; and the real jQuery type-detection path. No
new dependency is requested, and neither public dynamic site is claimed working.
