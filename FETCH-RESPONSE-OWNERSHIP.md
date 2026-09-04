# Fetch response ownership and publication

September 4, 2026. The existing production PageFetch path now guards response
capability publication and owns copies of transport bytes. This is an independent
resource/lifecycle improvement while the observer guest-scheduling gate remains
open; it does not replace or close that gate.

## Reproduced defects

Eleven initial native cases fail across these boundaries:

- A header or response capability factory throws after body allocation. The fetch
  rejects, but its unpublished body remains charged and retained until page close.
- A capability factory closes the fetch owner during construction. The fetch can
  still fulfill with a response whose getters are already revoked.
- A transport supplies a Node Buffer. Calling its slice method retains a view of
  the original bytes, so later source mutation changes the response body.
- A typed-array subclass overrides slice; response copying calls that native
  provider method instead of guaranteeing an owned byte copy.
- A factory retains partially constructed capabilities before throwing. Their
  headers/properties and consumption methods remain usable despite failed publication.
- Non-object factory results are accepted rather than rejected as invalid capabilities.

Five later regressions show that invalid capability and transport providers are
accepted at construction and consume a document cleanup registration. Provider
validation now rejects them before registration; tests fill the remaining cleanup
capacity to verify that no slot was leaked.

## Ownership rules

Response and clone bytes are copied into a plain Uint8Array rather than using the
input's overridable slice method. Buffer-backed inputs, subarray boundaries and
typed-array species/iteration hooks have native fixtures. The core adds no Node
dependency; the Buffer import is confined to the explicit native test file.

Response-count and retained-byte admission precede host capability creation.
Headers and the response are validated as distinct object capabilities, including
against earlier identities issued by this fetch owner. They become readable only
after both are successfully constructed and the owner is still open. A synchronous
factory must build the supplied lazy capability definition, not execute its getters,
consumers or clone method before publication.

If construction fails, that response's body is revoked, removed from the retained
set and released exactly once. Partial header/response capabilities reject future
access. A failed clone does not consume, revoke or corrupt the original response;
an ordinary factory failure need not revoke unrelated successful responses.
Closure during factory entry is checked again before publication, so no stale
success is returned. Owner closure uses the same idempotent release path.

Failed post-admission construction still consumes the cumulative response-attempt
budget, preserving bounded factory work/SDK allocation attempts. It does not keep
unpublished body bytes charged. This clarifies the existing responses metric rather
than claiming that every admitted construction returned a usable response. Quota
failures before admission leave both counters and existing bodies unchanged.

Null bodies remain reusable without setting bodyUsed; consuming an empty but
non-null body still marks it used. JSON parse failure releases the consumed bytes.
Close revokes all response access, including clone calls on previously consumed
bodies. Existing request/redirect/CORS checks, response filtering, deadlines and
the text/json-only body profile remain unchanged.

## Evidence and remaining gates

Reviewed the Fetch Standard's body-consumption and Response.clone algorithms at
`https://fetch.spec.whatwg.org/`, and Node's documented Buffer/TypedArray slice
distinction at `https://nodejs.org/api/buffer.html`. The decisive evidence here is
the native byte-alias and provider-failure fixtures, not another browser or a live
network experiment.

There are 38 new explicit native tests. Coverage includes failed initial/clone
publication, recovered body capacity, cumulative admission, identity reuse,
construction-time reentry, Buffer/subarray copies, null/empty/consumed bodies,
JSON failure, provider validation and repeated teardown. The focused selection
passes 93 tests across four allowlisted files: ownership, fetch, fetch journal and
page bindings. Closure assertions inspect Promise settlement directly rather than
letting a test matcher inspect already-revoked getters.

Full native validation passes 7,769 tests across 220 explicit files. An isolated
HEAD snapshot plus only this owned patch passes 5,009 tests across its 159 available
native files. Production/new-test type checks, builds and two-source Biome checks
pass in both trees under Node v22.22.0. Full suites use normal file ownership for
private-file tests. The fetch source was clean before this change; existing pending
work, including task-ledger changes, remains outside the isolated patch and commit.

Real released-SDK provider behavior still requires its separately authorized
acceptance run. Guest AbortSignal, streams/binary body APIs, broader fetch behavior,
actual observer scheduling, real websites, sockets and real TTY/PTY remain open.
No runtime artifact, dependency or execution engine is changed. No gated probe is
run, and historical report paths and measurements remain unchanged.
