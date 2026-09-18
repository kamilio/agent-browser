# Bounded classic URL globals

Explicit classic page runtimes expose guest-constructible `URL` and
`URLSearchParams`. Parsing uses the existing native WHATWG implementation through
opaque capabilities; page code never receives host URL objects or prototypes.
There is no network access or additional runtime dependency.

Supported behavior includes base resolution, URL component setters, `href`,
`origin`, serialization, stable live `searchParams`, duplicate query values,
encoding, sorting, iteration, record/sequence initialization and `forEach`.
Coercion, record getters and callbacks run in the guest. Invalid URLs, symbol
coercion and invalid receivers reject. Mutation limits are checked before replacing
retained state, and lifecycle cleanup revokes retained native capabilities.

Each owner is bounded to 128 URLs, 256 parameter owners, 256 pairs per list,
16384 input/serialized code units, 262144 retained code units and 2000000 work
units. Repeated operations consume this finite work allowance. Owner resources
are released at close rather than relying on guest garbage collection.

This is a partial capability, not full web-platform conformance. Static
`URL.parse`, `URL.canParse`, object-URL creation/revocation, complete WebIDL
descriptor/enumerability behavior and host prototype interoperability are not
implemented. Legacy/nonclassic behavior remains unchanged, and later publisher
replacements are not overwritten.

## Validation

The focused native gate passes 250 tests, including 65 URL cases. Parent
integration with cookie, CSP, DOM and runtime changes passes 1558 tests in 41
explicit native files; build, selected-test types, formatting and lint pass.
The unrelated pre-existing page-bindings onload test remains excluded from the
focused worker gate and is not claimed fixed.

The first actual SafeJS synthetic gate passes 17 of 18 checks: constructors,
query behavior, isolation, bounds and native revocation pass. Its remaining
private harness check rejects a default abort reason but cannot classify it
through own error descriptors. That failed suite is preserved; a separate
closure-classification check is pending, not assumed successful.

On September 18, 2026, ASSETS31 executes all nine unchanged captured Zoom inline
bodies, decodes the recorded 149-byte CDN PNG and reaches the real core-script
request in 8.544 seconds. The backup CDN and unrecorded tracking resource remain
refused; core execution is deliberately held until cleanup. This is bounded
offline capability evidence, not live navigation, CSP enforcement, application
startup or meeting admission. Earlier failed startup runs remain unchanged.
