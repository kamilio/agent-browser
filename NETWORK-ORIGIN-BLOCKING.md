# Explicit origin blocking

`NetworkPolicyOptions.blockedOrigins` is an optional list of exact origins to
deny. `NodeNetworkTransport`, programmatic owned-session network options and
`NodeWebSocketTransport` accept it. There is no default blocklist or new CLI
environment variable.

```ts
const transport = new NodeNetworkTransport({
	blockedOrigins: ["https://analytics.example"],
});
```

The transport reports a normal `policy-denied` error with the fixed, redacted
diagnostic reason `origin-blocked`. It does not return an empty successful
response, replace source, remove response policy or bypass page authorization.
Blocking a dependency can break the application; callers must validate the
resulting behavior rather than assume an analytics-classified asset is optional.

## Policy behavior

- Denial precedes DNS, HTTP exchange and route delivery. Followed redirects are
  checked before their next request. Existing private-address, credential, CORS,
  mixed-content, method, byte and request limits remain independent.
- Explicit denial wins over allowed-origin and private-origin permissions.
  Invalid URL/scheme/credential and blocked-port errors still take precedence.
- Matching uses canonical exact origins, including scheme and non-default port;
  it does not use suffixes or wildcard expansion. Resource paths, queries and
  fragments are not origin-policy entries.
- WebSocket options use the existing WS-to-HTTP origin equivalence: `wss:` maps
  to `https:` and `ws:` to `http:`. This is forwarding into the same policy,
  not a separate unfiltered WebSocket path.
- Lists contain at most 1,000 entries. The policy snapshots their indexed values,
  rejecting sparse/invalid entries without invoking a supplied iterator. Later
  list mutation cannot change the policy. Undefined/empty lists preserve defaults.

## Qualification

The combined native integration passes **4,720 tests in 105 files**, in
47.736 seconds, with strict build/types, formatting and lint passing:
`/tmp/agent-browser-blocked-origins-union02-9eZXHp/candidate`.

The focused worker passes 421 tests in 11 files. Its synthetic full-policy loader
test refuses a nonce-admitted blocked external resource, reports the fetch
failure, then executes the following allowed sources. The runner in that test
is fake; this is not actual SDK or publisher evidence. Fake-socket tests also
verify WebSocket refusal before DNS/handshake and preservation of exact matching.

Preserved failures include the worker's original red cases and missing-cookie-jar
fixture; the parent's WebSocket red gate; an iterator-invocation regression;
and an initial combined run with two parameter-table failures and a type error.
Wrapping table arrays as row objects fixes only the latter test fixtures. No
assertions or production limits are relaxed. Native run HOME/TMP are empty;
compiler-tool caches are retained separately. No actual socket, website or SDK
acceptance follows from these native results.

The unfiltered Zoom timeout remains recorded in
`reports/zoom-full-document-2026-09-18.md`. Any filtered attempt must explicitly
identify its blocklist and remain separate from that unfiltered result.
