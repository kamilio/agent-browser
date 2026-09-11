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
one stylesheet exception at a time.

`SELENIUM-PUBLIC-CSS-FLOW.md` records that separate test: the original page and both
stylesheets load (three native/wire GETs, all200), native text fill succeeds, and a
genuine submit click reaches the native formatting-profile boundary. The select
call retains the existing placeholder, so changed-choice behavior is not proved.
No submission/destination is reached; original styling is not declared accepted.
All37 offline verification checks pass, including settled zero-resource cleanup.
This establishes a native compatibility issue after fixing harness admission,
without rewriting either earlier failed run or adding new hostnames.

`SELENIUM-FORMATTING-DIAGNOSTIC.md` replays those same three captures offline,
with zero wire requests. Native formatting identifies three coordinated Flex
placeholders, one hidden-overflow file input, four floated checkbox/radio controls
and two unsupported color/range inputs. Aggregate CSS parser diagnostics remain
separate from active-node counts; the width guard also treats those diagnostics
as fatal. All29 evidence checks pass, but this is diagnosis, not form acceptance.

`PYTHON-DOCS-QUEUED-FLOW.md` records a fresh live run on the corrected native
request scheduler with the original concurrency cap of one. Seven native/wire
requests return200, the index commits, and the native Tutorial link is discovered.
Its genuine click fails at the formatting-profile boundary; no destination is
requested. The wrapper only forwards the underlying limits, without a harness
queue. All39 original and82 additive evidence checks pass; final queue/session
resources are zero. The original admission failure is preserved. Neither this
run nor the Selenium diagnostic adds an attempted hostname.

`PYTHON-DOCS-FORMATTING.md` then replays the same seven captures offline with zero
wire requests. It measures two broken-image formatting gaps, nine potentially
coordinatable Flex/Grid placeholders, two float issues, one sticky-position issue
and one overflow issue. Three image elements share a fetched SVG resource, but
none decodes; fetching succeeded while image support did not. Copied stylesheet
diagnostics remain separate, including an unloaded import. All34 evidence and40
final-review checks pass with zero cleanup resources; geometry and link activation
remain unaccepted. Broken-image/alt fallback is distinct from adding SVG decoding.

## Existing host replay

`MDN-POSITIONING-REPLAY.md` records one offline native click against all nineteen
unchanged captured MDN responses with the 8321-pass build. Its first failure is
outside list-item markers with block content during formatting. No geometry
completes and no destination is requested. This earlier failure masks validation
of the old positioned-menu boundary; it is not evidence that MDN passed that
boundary, and it is not an additional live website request.

`MDN-OUTSIDE-MARKERS-REPLAY.md` records one later offline click on the immutable
8,529-pass outside-marker build, again with all nineteen original responses.
Formatting completes with23 outside markers and reaches positioned coordination
beyond the old eligibility barrier. The next failure is the issue-free formatting
profile guard:14 non-coordinated deferred nodes and additional active/CSS issues
remain. No completed geometry, containing-block coordinates or destination is
measured. Later native action corrections are separately validated by the8,643
gate, not by this replay; neither result is a live MDN acceptance claim.

## Next acceptance work

- Resolve measured Selenium formatting gaps without discarding original CSS;
  preserve the real submit-click failure and test changed choices separately.
- Diagnose Python documentation's remaining formatting/image failures against
  unchanged captures; scheduling success does not establish layout acceptance.
- Repeat unchanged-capture MDN validation after the genuine outside-marker
  implementation; do not replace markers or infer site success from native tests.
- Keep request, parsing, CSS, runtime, geometry, interaction, content and cleanup
  outcomes separate. Green native regressions are not public-site acceptance.
