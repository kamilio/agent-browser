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

`CookieJar.sameSite(url, siteUrl)` uses that jar's selected policy and rejects a
closed jar. Native redirect handling uses this operation for both sides of each
hop. Same-site siblings do not acquire cross-site taint with the selected PSL;
scheme changes, private-tenant boundaries and cross-site-and-back chains remain
tainted. Origin-based credential restrictions are never widened by this policy.

State schema 1 retains old host-only records unchanged. Domain records explicitly
add `hostOnly: false`; absence never becomes domain scope. Importing domain scope
requires the trusted snapshot and repeats scope validation. Older consumers that
cannot enforce the added field reject it instead of widening old state.

## CLI and owned processes

Set `AGENT_BROWSER_COOKIE_POLICY=pinned-psl-v1` to select this policy in the
native CLI, or pass `cookiePolicy: "pinned-psl-v1"` to `BrowserSessionProcess`.
Absence preserves the old host-only behavior and does not read a PSL asset.
Invalid, inherited or accessor configuration rejects before runtime startup.

The fixed vendored public PSL is read with a bounded allocation and EOF check,
regular-file and symlink checks, before/after identity checks, and the existing
exact pinned hash verification. File handles close on errors. No configurable
path, network download, credential file or filesystem permission expansion is
introduced. The parent sends verified public PSL text in the bounded initialize
frame; the child revalidates it before SDK loading and echoes the selected policy
in ready metadata, which the parent checks.

## Validation and limits

The isolated cookie/PSL/state worker gate passes 714 tests. Parent session and
routed-native-transport integration passes 783 tests in 10 explicit native files;
build, types, formatting and lint pass. Tests use synthetic cookies and mocked
routes, not real sockets, saved state or credentials. Session tests verify fresh
state, sibling-domain delivery, unrelated-host isolation, HttpOnly hiding and
complete cleanup.

The redirect integration preserves all 783 cases and adds 19 synthetic controls:
802 tests in 11 native files pass, with build, types, formatting and lint passing.
The initial missing-operation and sibling-redirect failures remain recorded.

The September 18, 2026 Zoom metadata request observed 14 Domain-cookie rejections
in the older immutable core. That establishes a compatibility gap, not the cause
of its meeting-client redirect. This new policy has not been live-tested against
Zoom. CLI/process source and compiled mocked-runtime lanes each pass 352 tests.
Parent integration with URL, CSP, DOM and redirect changes passes 1558 tests in
41 native files, plus build, selected-test types, formatting and lint. Actual
owned-process startup with the cookie policy selected remains a separate gate.
