# Website test expansion — September 11, 2026

This is an additive record after `WEBSITE-TEST-INVENTORY.md`'s 54-host audit.
Do not reinterpret that audit or these attempts as successful website coverage.
The four new exact hostnames bring the combined attempted-host inventory to
**58**, including pre-wire admission failures. Original reports and measurements
retain their paths and outcomes.

| New hostname | Recorded scope | Evidence |
| --- | --- | --- |
| `www.selenium.dev` | Public form-page GET returns 200; initial navigation stops before native form discovery because the harness denies the original cross-origin Bootstrap stylesheet. No form actions or style acceptance. | `SELENIUM-NATIVE-FORM.md` |
| `cdn.jsdelivr.net` | Original Selenium markup causes a native CSS GET attempt. The initial same-origin-only harness rejects it before transport/wire admission. This first attempt does not establish CDN reachability. | `SELENIUM-NATIVE-FORM.md` |
| `docs.python.org` | Documentation-index GET returns 200; original stylesheet/image loading then exceeds the unchanged transport concurrency cap of one. No tutorial discovery or click. | `PYTHON-DOCS-NATIVE-FLOW.md` |
| `unpkg.com` | A separate Selenium run loads the exact previously observed Bootstrap CSS (HTTP200), then the original native loader requests datepicker CSS from unpkg. That second stylesheet is denied by the test's exact-URL policy before wire admission. | `SELENIUM-STYLESHEET-FLOW.md` |

Both live flows retain original HTML and stylesheet behavior. Neither uses page
scripts, credentials, account changes, uploads, an alternative browser or a
fallback direct destination request. Failed original attempts are not retried or
rewritten as successful validations.

The separate Selenium stylesheet test records three native attempts and two
wire responses; both the page and Bootstrap CSS return200. The unpkg request is
an additional harness boundary, not a browser bug. Its32 verification checks pass
with settled zero-resource cleanup; the initial Selenium report and its original
failed temporal-cleanup verifier remain unchanged. A further separately scoped
test permits original-loader public HTTPS CSS by resource type rather than adding
one stylesheet exception at a time; it is not accepted until its results exist.

## Existing host replay

`MDN-POSITIONING-REPLAY.md` records one offline native click against all nineteen
unchanged captured MDN responses with the 8321-pass build. Its first failure is
outside list-item markers with block content during formatting. No geometry
completes and no destination is requested. This earlier failure masks validation
of the old positioned-menu boundary; it is not evidence that MDN passed that
boundary, and it is not an additional live website request.

## Next acceptance work

- Run the Selenium form in a separate recorded test admitting its exact natively
  observed public stylesheet; keep genuine native control actions and submit click.
- Investigate Python documentation's shared stylesheet/image request admission
  under the original concurrency cap; distinguish scheduling from layout failure.
- Implement genuine outside markers with block children, not marker removal or an
  inside-marker substitution, then repeat unchanged-capture MDN validation.
- Keep request, parsing, CSS, runtime, geometry, interaction, content and cleanup
  outcomes separate. Green native regressions are not public-site acceptance.
