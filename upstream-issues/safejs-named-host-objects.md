# SafeJS: bounded dynamic named host-object properties

## Request

Extend the public host-object capability boundary with dynamic named properties,
composable with fixed properties/methods and the indexed capability in #545.
This supports browser-owned NamedNodeMap/Attr objects and later named collections
without adding DOM semantics to SafeJS or using a native Proxy as the guest object.
It is a separate building block for the extension contract in #540.

The independent TypeScript browser reached `element.attributes[name]` in the
unmodified jQuery 1.9.1 script served by Books to Scrape. A fixed property list or
snapshot object is insufficient: names change while the saved collection identity
must remain stable, and removals must change lookup and membership immediately.

## Candidate public boundary

An optional `named` declaration supplies:

- Positive maximum key count and aggregate key UTF-16 code-unit count.
- Synchronous `keys()` and `get(name)` providers.
- Optional enumeration policy; NamedNodeMap needs unenumerable named properties
  while retaining enumerable numeric indices.
- Exported lightweight TypeScript types, with no new runtime dependency.

Declarations must be validated without evaluating accessors. Runtime key lists
must be bounded dense own-data arrays of distinct strings. Reject proxies,
accessor/sparse arrays, invalid bounds, duplicate names and prototype capability
names. Fixed members take precedence; canonical numeric names remain owned by
the indexed capability when one is present. No implicit host prototype exposure.

Reads and returned values use normal realm identity, cancellation, conversion and
accounting. Named properties are read-only in this first contract: prevent guest
writes/deletion/freezing from replacing or disguising host state. Enumeration,
membership, Object.values, object spread and for-in must agree about current keys,
including removal during an earlier getter. Reject async providers without an
unhandled rejected promise. Saved virtual getters must be revoked on realm close.
Copy/replay restrictions should remain explicit.

## Acceptance and current evidence

An isolated local candidate based on v13.0.10 now implements this through the
public createHostObject/core boundary. Nineteen named-capability tests cover
identity, liveness, fixed/indexed collisions, enumeration, mutation during spread,
writes, limits, hostile key arrays, async rejection, copy restrictions and close.
They and the existing seventeen indexed tests pass. This is a local candidate,
not a statement that current upstream main or a published release supports it.

The browser now owns live Attr records, attachment/replacement/removal and value
mutation. Actual automatically loaded page scripts use the compiled public core;
native button actions remove the exact hidden attribute and update the real
semantic snapshot. No native browser is substituted as the engine. With this
primitive, Books passes its attribute-object blocker and next reaches Date (#543).

Please keep DOM attribute policy, storage and lifetime in the consumer package.
This request is for the generic, metered capability primitive only.
