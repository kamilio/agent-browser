# Explicit PSL-backed domain cookies

Native sessions can select domain-cookie support with a verified snapshot of the
complete vendored Public Suffix List. No download, target-specific allowlist or
additional runtime dependency is used. Without a snapshot, existing host-only
behavior and Domain-cookie rejection remain unchanged.

```ts
const publicSuffixSnapshot = await createPinnedPublicSuffixSnapshot(pslBytes);
const session = new BrowserSession({
  cookiePolicy: { publicSuffixSnapshot },
  createTransport,
  loadDocument,
});
```

Direct users can pass the same policy as the third `CookieJar` constructor
argument, after limits and the clock. The snapshot must be the branded result of
`createPinnedPublicSuffixSnapshot`; a lookalike matcher is not accepted. Options
are captured before transport creation, with accessors and inherited session
policy rejected. Later caller mutation does not change the selected policy.

Domain admission and delivery enforce canonical DNS label boundaries and pinned
registrable-site boundaries, including nested private suffixes. Public suffixes,
IP scopes, malformed domains and cross-domain scopes reject. Secure, HttpOnly,
SameSite, prefix rules, insecure overwrite protection, capacity and cleanup remain
enforced. With the policy, same-site checks use scheme and registrable site;
same-origin credentials remain a separate, narrower restriction.

State schema 1 retains old host-only records unchanged. Domain records explicitly
add `hostOnly: false`; absence never becomes domain scope. Importing domain scope
requires the trusted snapshot and repeats scope validation. Older consumers that
cannot enforce the added field reject it instead of widening old state.

## Validation and limits

The isolated cookie/PSL/state worker gate passes 714 tests. Parent session and
routed-native-transport integration passes 783 tests in 10 explicit native files;
build, types, formatting and lint pass. Tests use synthetic cookies and mocked
routes, not real sockets, saved state or credentials. Session tests verify fresh
state, sibling-domain delivery, unrelated-host isolation, HttpOnly hiding and
complete cleanup.

The September 18, 2026 Zoom metadata request observed 14 Domain-cookie rejections
in the older immutable core. That establishes a compatibility gap, not the cause
of its meeting-client redirect. This new policy has not been live-tested against
Zoom. CLI/owned-process policy selection and PSL-aware redirect-taint handling
remain separate integration work; current redirect handling remains conservative.
