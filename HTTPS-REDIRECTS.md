# Explicit same-origin HTTPS redirect upgrades

Native transport rejects redirects from HTTPS to plaintext HTTP by default.
A site can advertise an HTTP canonical destination even though its HTTPS
counterpart serves the content, as observed on arXiv. The optional
`httpsRedirectPolicy: "same-origin-upgrade-v1"` supports that case without ever
requesting the plaintext destination.

```sh
node dist/scripts/research-browser.js --reader --capture-body \
  --https-redirect-policy same-origin-upgrade-v1 \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-fallback-encoding utf-8 \
  'https://arxiv.org/search?query=language+model+inference&searchtype=all&source=header'
```

The CLI option also works in ordinary native mode. Programmatic callers can set
`NodeTransportOptions.httpsRedirectPolicy` or research execution option
`httpsRedirectPolicy`. Only the exact policy name or omission is accepted.

## Upgrade conditions

All conditions must hold at the current redirect hop:

- The current URL is HTTPS and the current method is GET or HEAD.
- The resolved redirect destination is HTTP, without URL credentials.
- Changing only its protocol to HTTPS yields exactly the current origin,
  including its effective port. Other hosts and incompatible ports do not qualify.
- The normal effective-URL policy, origin allowlist, address checks, DNS checks
  and TLS certificate verification still permit the HTTPS destination.

Path, query and existing redirect fragment rules are retained. The policy does
not upgrade initial HTTP URLs, permit plaintext fallback after an HTTPS failure,
or change manual/error redirect modes. A POST redirect is not itself upgraded;
if an earlier normal redirect already rewrote the method to GET, the current GET
is evaluated normally. Nonqualifying destinations retain ordinary policy errors.

Redirect/request/byte/time limits, cookie rules, pacing, cancellation and cleanup
remain in force. Access denials and rate limits are not retried. This is not HSTS,
a preload list, persistent host policy, certificate bypass or CAPTCHA handling.
It changes the chosen destination relative to the server's HTTP instruction, so
it is explicit rather than silently enabled for every browsing session.

## Provenance

`NetworkResponse.redirects[].location` remains the effective HTTPS destination.
An upgraded hop additionally has a frozen `httpsUpgrade` object containing
`policy` and `originalLocation`. The latter is the parsed/resolved HTTP target,
including inherited fragment semantics, **not the verbatim Location header**.

Enabled transports expose `metrics().httpsRedirectUpgrades`, initially zero;
default transports omit the field. It counts admitted upgrade decisions, not
successful TLS handshakes or completed final responses. A later DNS/TLS/request
failure can therefore coexist with a nonzero counter.

Research receipts record the selected top-level `httpsRedirectPolicy` and, when
upgrades occurred in a completed primary response,
`primaryResponse.httpsRedirectUpgrades`. Each entry includes policy, source URL,
original destination and effective destination. Existing URL reporting removes
credentials/fragments, redacts query values and enforces its length bound.
Unchanged response/body hash scopes and default report shapes are preserved.

Offline body replay does not make a network request or revalidate a historical
redirect decision. Receipt/body pins and normal source admission still apply;
transport provenance must not be treated as proof of content accuracy or full
interactive website functionality. Historical failed receipts are not rewritten.

## Validation

`reports/https-redirect-upgrade-2026-09-15.md` records74 new passing mocked native
tests and a937-test passing selected suite, plus two fresh public navigations and
two guarded offline replays. arXiv's original URL now reaches source results in
one CLI navigation using two HTTPS GETs; a Python index control needs no upgrade.
This removes a manual navigation decision, not the server's redirect round trip.
It is not a full-manifest, HSTS, adversarial TLS, page-script or CAPTCHA acceptance
claim. The policy remains opt-in and the default downgrade rejection remains.
