# Captured MDN action check — September 14, 2026

## Actual Outcome

**FAIL for the discovered-link action.** Initial native document navigation and
link discovery work, but clicking the observed `querySelectorAll()` link fails
during formatting-profile width resolution. Integrity, containment and cleanup
checks pass; they do not make the failed browser action a pass.

The one offline observation runs from `2026-09-14T05:17:20.244Z` to
`2026-09-14T05:17:20.659Z`. It uses the original September 11 MDN capture, not
fresh website content or the newer, unrelated border-style source capture.

| Native operation | Observed result |
| --- | --- |
| Navigate to `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector` | One call; document committed |
| Query `main a[href]` | One call; 49 links, 2 exact destination matches; 50,087 query work |
| Select first exact `querySelectorAll` destination | Rediscovered `e1673`, label `querySelectorAll()`, target `_self` |
| Ordinary `BrowserSession.click` | One call; `AgentBrowserError`, code `unsupported` |
| Destination request / navigation | Neither reached |
| Additional formatting, geometry, raster or query probes | None |

The current reference comes from native discovery, not a supplied historical
reference. No direct destination navigation, actionability bypass or retry occurs.
`flowPassed` and `destinationNavigationCompleted` remain false. There is no
fixture denial, transport failure or Cloudflare challenge in this observation:
the blocker is the native browser's formatting capability guard.

## Reported Blocker

The exception starts with `Document width resolution requires an issue-free
supported formatting profile` and names these issue counts:

| Diagnostic type | Count |
| --- | ---: |
| `css:unimplemented-css-at-rule` | 14 |
| `css:unimplemented-or-invalid-css-value` | 15 |
| `css:unimplemented-css-property` | 78 |
| `css:unimplemented-or-invalid-css-selector` | 2 |
| `generated-content-item-layout-not-supported` | 29 |
| `inline-vertical-align-not-supported` | 3 |
| `generated-content-vertical-align-layout-not-supported` | 3 |
| `html-presentation-hint-not-supported` | 1 |

The message reports two additional issue types without naming them. This check
does not enumerate them or attribute failures to particular raw CSS declarations.
No extra browser diagnosis is added after the first failure. The complete original
exception and stack remain in the result. Do not suppress the capability guard
or relabel unsupported/invalid diagnostics merely to obtain a click result.

## Corpus And Runtime

All **19 exact responses** are used once: one HTML document and 18 stylesheets,
**270,288 decoded bytes**, 19 accepted adapter requests, zero denials, wire
requests, redirects or unused fixtures. Exact historical URLs, statuses, headers
and bodies remain unchanged. Current image loading is enabled; it reports zero
image elements/resources/requests after scanning 2,731 nodes, not a disabled
image pipeline. Script and process/network guard attempts remain zero.

The corpus still lacks the destination response. Even if a future action reaches
that request, the same corpus cannot prove destination navigation. Any expansion
needs a distinct bounded capture/replay scope; no response aliasing is allowed.

Runtime: `overflow-ownership-work-september14/release01/snapshot01/dist` beneath
`node_modules/.cache/native-validation/`, ownership commit
`23e988d39d721c27a318c4d129e1736f32118c48`. Its existing 22,065-pass native gate
is not rerun here. It is not the newer capability build or the dirty working tree.

The historical MDN cascade rule ceiling was 4,096; this frozen runtime's existing
shared-owner ceiling is 8,192. Static preparation caught the mismatch before
execution. The parent explicitly retained the unchanged current default and
recorded both profiles; no production limit was patched or raised. Other query,
cascade and session bounds remain, including 5,000,000 work and 24 stylesheet
requests. The loader observes 591 rules. This is not a controlled single-change
comparison against the older MDN runtime.

## Measurement And Evidence

Native observation: **0.415 seconds**. GNU time: 0.55 seconds wall, 0.98 seconds
user CPU, 0.07 seconds system CPU, **137,240 KiB peak RSS**. These measure this
early-failing captured workload, not a full-flow speed improvement or live-site
benchmark. Exit1 is retained as the real action failure; no timeout, signal,
watchdog, output-cap, spawn or integrity error occurs.

The child is reaped and process group1300142 is independently absent. Document,
session, transport, image and query owners close; active/pending work and retained
document nodes are zero. Private HOME/TMP are empty and removed. The parent
rechecks all 18 run ledgers, totaling 11,034 entries, and both outcome seals.

Evidence under `node_modules/.cache/native-validation/`:
- `native-mdn-ownership-september14/before-RESULT.json`:
  `581ea14f553f518cb6268f6a57b102ea03465d2e0547ed46224013de67cd13a5`.
- `native-mdn-ownership-september14/VERIFICATION.json`:
  `682536614bf900e6ed308eec6ac9ce0079e4d315acb47ca94bb70e7811ea429a`.
- `native-mdn-ownership-september14/EVIDENCE.sha256`:
  `0493463678cb9be7bddc226c1dca2acf0fa149371b563083eeebafeedf62f171`.
- `mdn-ownership-work-september14/PARENT-OUTCOME-VERIFICATION.json`:
  `e6b850883f281fef49ce0449161e7c3a79c1ee2cb901ae40bef1160f0bb9927d`.
- `mdn-ownership-work-september14/preparation/REPLAY-REPORT.md`: full handoff.

Next: isolate the reported generated-content and vertical-alignment conditions
in a separately scoped diagnosis, then add focused native regressions. Full MDN
interaction, fresh live sites, research, credentials/devices, SafeJS, socket, TTY
and challenge-handling acceptance remain open. No push.
