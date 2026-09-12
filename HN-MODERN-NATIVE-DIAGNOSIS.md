# Hacker News captured-page diagnosis on native15421

## Outcome and scope

The unchanged September11 HTML/CSS capture still fails used layout on committed
native15421 (`5164b28a6480c2748a18534ac7799ad0e215bfd1`). The actual coordinator
error is `unsupported`: `Document width resolution requires an issue-free
supported formatting profile`. This is not successful website or navigation
acceptance. No current website bytes, HTTP request, click, credential, script,
SafeJS runtime, alternate browser, or challenge bypass was used here.

Main performed four separately retained bounded offline native loads. Two
diagnostic harness mistakes preceded corrected lanes; they are not hidden or
counted as browser defects. The original loader, HTML, CSS, response headers,
native image policies and resource limits were preserved throughout.

| Lane | September12 UTC native interval | Actual result |
| --- | --- | --- |
| `hn-cache00` | 18:48:57.745–18:48:57.791 | Harness compared a null-prototype native header map with a plain JSON object; one memory response, no formatting/layout. |
| `hn-cache01` | 18:49:39.218–18:49:39.349 | Header entries compared without changing data; two memory responses, one formatting pass, one rejected layout. |
| `hn-attribution00` | 18:53:09.998–18:53:10.124 | Two responses and formatting; harness called nonexistent `styles.visibility`, so no layout. |
| `hn-attribution01` | 18:53:53.610–18:53:53.760 | Correct public `styles.get` metadata access; two responses, one formatting pass, one rejected layout and complete bounded attribution. |

The first lane's post-assertion request array is empty, but its native transport
counter records the response: seven memory responses total across four attempts,
162038 decoded bytes, zero wire requests. Supervisor exit0 denotes a recorded
diagnostic outcome, not successful layout. Session, transport and image owners
closed after each attempt; source/capture inventories remained unchanged.

## Concrete remaining gaps

The completed attribution observes 1303 document nodes, 109 stylesheet rules,
219 declarations, one external stylesheet and no imports. Applicable stylesheet
issues are 11 unsupported/invalid values, two unsupported properties and one
unsupported media query. The formatting tree reports:

| Diagnostic | Count |
| --- | ---: |
| Unsupported/invalid CSS values | 11 |
| Unsupported CSS properties | 2 |
| Unsupported media query | 1 |
| HTML presentation hints | 64 |
| HTML table presentation hints | 4 |
| Deferred table display markers | 4 |
| Unsupported image elements | 2 |
| Unsupported overflow layout | 61 |

All four tables have `cellspacing="0"`. Other observed legacy attributes include
three table widths, three `border="0"`, 30 right-aligned cells and 60 top-aligned
cells. The already-supported cellpadding and background hints are also present.
Attribute occurrences are not one-to-one diagnostic counts. The four table
display markers are decomposition markers; they alone do not establish a
coordinator defect.

All 61 overflow observations are `td.title`, computed `display:table-cell`, with
both overflow axes hidden. An inline-only applicability fix would not resolve
this captured case. Raw CSS rule candidates and DOM matches are recorded, but
are not presented as full cascade-applicability counts. The requested
Verdana/Geneva/sans-serif font list is outside the current native font profile;
point font-size units are already supported. Requested typography must not be
silently removed to make layout appear successful.

Both selected images, `y18.svg` and `s.gif`, are complete/broken with
`policy-denied`, zero natural dimensions and no decoded pixels. Their resource
owner made zero image requests and delivered two errors. The captured response
contains CSP. Static implementation inspection finds that the current loader
reduces CSP presence to an image-blocking flag, and the image owner reports that
CSP enforcement is not implemented. That is a conservative implementation gap,
not evidence that the remote server blocked these two unattempted requests.
Directive-aware enforcement requires source-list, origin, redirect, fallback and
multiple-policy semantics; disabling the flag would not implement CSP.

## Evidence and next steps

Owned lanes are under
`node_modules/.cache/native-validation/website-functional-september12-evening/`.
Each preserves `probe.mjs`, `run.mjs`, `RESULT.json`, stdout/stderr and
`SUMMARY.json`; contracts and corrected-helper notes remain at their original
locations. `verify-hn-cache.mjs` performs only readonly receipt/result checks,
not another page load, parse, layout or replay.

Historical input remains `native-hn-link-flow-september11/`: 34946byte HTML
SHA256 `724d5760b11a50927a9e1404221eb96be75f13b685e0ae22e11ec1c70c523bee`
and 7418byte CSS
`de4722818cb6e7859a4287ba956bf04973a63ca97318f6d4c4f44d55e7d454b5`.
The original 23-entry receipt ledger is
`c0b56cf0e673dcfaef318814a1174266823fcac38e869d5adc7c2ecf8405b450`.
Native release evidence remains 15421 passed, zero failed, two exclusions;
those tests were not rerun by these diagnostic probes.

The separately authorized fresh live flow is `HN-MODERN-NATIVE-FLOW.md`; unlike
this diagnostic replay, it stops on the image-policy observation before initial
document commit. Its outcome and response bytes must not be conflated with this
historical replay. `CSP-NATIVE-SOURCE.md` records subsequent bounded source
research, not an implemented policy engine. Table spacing is a focused repair
candidate; resolving it alone cannot establish Hacker News acceptance.
