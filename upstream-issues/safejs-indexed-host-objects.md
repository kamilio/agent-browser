# Bounded indexed live host-object capabilities

Our browser now reaches unmodified jQuery's getElementsByTagName calls. Correct
live HTML collections need length and indexed reads to observe current DOM state,
not a copied array or tens of thousands of eagerly declared property getters.
The current SafeJS createHostObject API only declares fixed property/method names.

Requested public extension: optional bounded, read-only indexed capability data
with a synchronous length getter, synchronous per-index getter and explicit maximum
length. Index values must pass the existing host conversion/identity boundary.
Keep this generic: the browser owns DOM querying, collections and invalidation.

Acceptance: changing host contents become visible through saved collection values;
canonical index lookup, own-key inspection, membership, iteration and Array.from
preserve identity; out-of-range reads do not call the host element getter; length,
enumeration and traversal are budgeted; no host prototype, arbitrary proxy, hidden
evaluator or new dependency is granted. Index writes must reject. Realm close
revokes access, and data-copy/replay boundaries must remain explicit.

A local candidate is being built against the existing v13.0.10-based checkout
(`7fbbd81fd99c46928bcf314ad89410b946d203cc`). This request complements #540's unified
extension lifecycle; it is not a claim that the framework or browser is complete.
