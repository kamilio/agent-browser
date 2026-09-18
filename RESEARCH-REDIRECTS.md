# Inspect redirects without following them

The native research CLI now exposes its existing manual redirect mode:

```sh
node dist/scripts/research-browser.js \
  --reader --capture-body --redirect-mode manual PUBLIC_HTTP_URL
```

Default redirect handling is unchanged. This flag returns a redirect response
without requesting its Location. It does not enable automatic redirects, retries,
an alternate browser, a different identity or challenge solving. It cannot be
combined with `--https-redirect-policy same-origin-upgrade-v1`.

## Report contract

A received 301, 302, 303, 307 or 308 can include:

```json
{
  "redirectMode": "manual",
  "redirect": {
    "kind": "http-redirect-handoff-v1",
    "status": 308,
    "action": "review-before-new-request",
    "followed": false,
    "reason": "available",
    "location": {
      "url": "https://example.com/introduction",
      "sameOrigin": true,
      "queryRedacted": false,
      "fragmentOmitted": false
    }
  }
}
```

This is a hint from the received response, not a successful load of the target.
`finalUrl` and `primaryResponse.url` still identify the requested page. The
existing response-body extraction may run; a readable redirect body remains an
`http-failure` with `contentSuccess: false`, not a successful destination load.
An all-redirect batch exits 1. Normal 200 responses can still be read in manual
mode and do not gain a redirect claim. Explicitly listed batch URLs are distinct
requests; a Location is never appended to the batch automatically.

Challenge classification runs before the hint is exposed. A detected barrier
keeps its barrier outcome and does not expose this redirect hint as a next step.
Loader, transport, HTTP and capture failures retain their original diagnostics.

## Review the target

- Relative Location values resolve against the received response URL. Only one
  unambiguous HTTP(S) location is eligible; input/output are bounded at 4,096
  code units without truncating a URL into a different destination.
- Queries become `?redacted`; fragments are removed and flagged. **Never follow
  a redacted URL as if it contained the original query.** Obtain the needed
  destination from an independently trusted source or a human handoff.
- Credential-bearing, malformed, control-bearing, oversized, duplicate and
  locally disallowed locations produce an unavailable reason and no target URL.
  Header/accessor/proxy inputs are not allowed to execute getters.
- URL paths remain visible: this is targeted query/userinfo handling, not
  arbitrary secret detection. Keep captured receipts private when appropriate.
- `sameOrigin` describes URL origins, not authorization. Syntactic URL and
  literal-address checks do not resolve DNS or verify the destination's TLS.
  HTTP downgrades can be reported but are never followed or silently upgraded.
  A later separately selected navigation must pass its normal network policy.

The raw Location is not added to the selected-response-header capture. The
bounded `redirect` diagnostic is separately validated during serialization and
replay admission, including default-profile receipts. A malformed diagnostic or
an inconsistent status/origin/redaction flag is rejected; it grants no replay or
network capability. Historical captures without these fields remain unchanged.

## Verified scope

The focused final native selection passes 817 tests in nine files, including
137 helper cases and 24 CLI/serialization/integration cases. Build, type checking,
format and lint pass. A baseline CLI regression fails as expected on the prior
implementation. Native fixtures are not live redirect qualification; actual
website results and original failed runs are recorded separately in
`reports/docs-content-followup-2026-09-18.md` and its JSON companion.
