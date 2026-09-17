# Source-declared reader link labels — September 17, 2026

## Outcome

The native Markdown reader now offers explicit `source-aria-label-v1` annotations
for otherwise empty admitted HTML anchors. This fixes the three SVG-only author
links observed in the web.dev module-workers article without inventing visible
publisher prose. Default extraction is unchanged. The option is bounded and
propagated through native research navigation and ordinary saved-body CLI replay.
See `READER-SOURCE-LINK-LABELS.md` for its contract and exclusions.

## Native validation

- **6,547 passed / zero failed across 68 selected native files**, including
  **194 new cases across three files**. Build, strict selected-test types,
  scoped format and lint all pass. Processes close with empty HOME/TMP.
- The final 48 extractor cases all fail against the old extractor. This is a
  missing-feature control, not an assertion that the old default behavior was
  itself defective. The new default behavior remains identical.
- The canonical manifest contains 973 entries, with 951 files available and
  **22 still missing**. This is not a full-manifest or actual SDK acceptance run.
- Independent core/CLI reviews identified stale test expectations, malformed
  argv-test coverage and a missing receipt count ceiling. These are corrected;
  followup reviews establish no remaining blocker within their bounded scopes.
  Static review is separate from the executed tests.

## Saved real-page comparison

The 137 pinned historical response inputs produce **130 successful matching
pairs and seven matching refusals**. Default Markdown, structured JSON, reader
source/DOM, classification and diagnostics match the committed baseline. This
comparison ran against release02; all **1,876 compiled core files** are identical
in final release04. Final receipt-validation changes are tested separately.
These are offline comparisons, not new website visits or improved crawl counts.

Four previously captured documentation pages additionally retain their exact
default Markdown and all **101 code blocks** when the new policy is enabled:

| Saved page | Default Markdown bytes | Opt-in bytes | Generated labels |
| --- | ---: | ---: | ---: |
| MDN modules | 60,223 | 60,223 | 0 |
| web.dev module workers | 10,776 | 11,005 | 3 |
| Python importlib | 80,702 | 80,702 | 0 |
| Rust async concurrency | 24,185 | 24,185 | 0 |

The added web.dev names are “Jason Miller on X”, “Jason Miller on GitHub” and
“Jason Miller's homepage”, each explicitly prefixed as a source ARIA label.
No SVG execution, hidden-subtree expansion or new link navigation is involved.

## Fresh native website and CLI checks

One fresh anonymous GET to `https://web.dev/articles/module-workers` starts at
**2026-09-17T01:15:08.934Z** and finishes at **01:15:09.370Z**. It returns HTTP200,
103,569 decoded bytes, 20,289 encoded bytes and 11,005 Markdown bytes. An
independent source audit matches all three author names/destinations and all
11 source pre/code blocks. The native operation takes 436ms, excluding some
startup/supervision; this single observation is not a speedup measurement.

Before the request, the exact compiled command passes a synthetic routing proof
under kernel/JS network denial. The live check uses explicit source/main-content
policies, default limits, honest native identity and credential omission. There
are no redirects, retries, page scripts, SDK execution, alternate clients or
challenge solving. Request/TLS/socket/process resources close.

Four compiled replay CLI runs use the old and fresh receipts with the option off
and on under network denial. All pass. Matching capture/replay policies produce
identical content; captured policy and selected policy remain distinct. A replay
without the flag does not silently inherit the capture's opt-in annotation mode.

## Retained failures and limits

Earlier quality runs expose test typing/lint/format problems; release02 has 16
failed CLI assertions plus a helper collection error. They remain recorded.
The first independent live-source audit incorrectly required no whitespace
before the generated name; the second missed empty-HTTP-path `/` normalization.
The corrected code04 audit preserves exact names/destinations while accounting
for those existing serialization rules. Neither correction changes production
code or triggers another website request. Original diagnostics remain intact.

This does not establish rendered visibility, full accessible-name computation,
actual SafeJS execution, dynamic-site or authentication/passkey/device/TTY
acceptance, general performance gains, or a CAPTCHA solution. Historical
100-entry **33 useful / 67 other** verdicts remain unchanged. Difficult-site
recovery and the original four research topics remain open; the overall goal
is not complete.

Machine-readable measurements and hashes are in the adjacent JSON report.
Private local evidence is under
`node_modules/.cache/native-validation/source-link-labels-september17/`.
