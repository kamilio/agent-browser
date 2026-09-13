# Website test inventory — September 13, twenty-third update

**New GOV.UK website coverage and a verified datetime-source fix. Overall browser
and research acceptance remain OPEN.** The native reader previously retained
human-readable date labels but discarded their machine-readable years/dates.
The fix preserves source declarations through the reusable reader and JSON
extraction pipeline. No website HTML rewrite or extra runtime dependency.

## New live website check

URL: https://www.gov.uk/bank-holidays
Captured 2026-09-13T13:32:40.825Z; HTTP200, 175842 decoded
bytes / 13478 encoded bytes; SHA256
f2a2e6ddd524367b753932a225c9a3f336eb92f678314bf018df9a51c90a7f1f.

Exactly one native document request/one actual GET, no redirects/retries or
subresources. Fresh empty cookie jar, credentials omitted, no Cookie or
Authorization header, transport closed. No challenge/login/rate-limit stop
signal was encountered; this does not establish general CAPTCHA compatibility.
No browser impersonation, fingerprint spoofing or challenge solving occurred.

The same retained bytes then receive one isolated long-v1 semantic-reader load
and one isolated full native DOM load, each with four queries. Full DOM is an
explicit comparison, not a substitute reader success or silent fallback.

| Native observation | Semantic reader | Full DOM |
| --- | ---: | ---: |
| Nodes | 5412 | 5672 |
| Tables / captions | 33 / 33 | 33 / 33 |
| Rows | 313 | 313 |
| Header / data cells | 379 / 560 | 379 / 560 |
| Anchors with href | 85 | 85 |
| Time elements | 280 | 280 |
| Explicit datetime declarations | **0** | **280** |
| Selector work | 281660 | 302953 |
| Instrumented label-walk work | 847 | 833 |

Six sampled row-text digests match. Heading selectors return24reader/25full-DOM
matches; the full DOM includes an additional SVG title. Both have20h2 and3h3
matches; no h1 appears in either result. These observations are not inferred
browser defects. The reader reports10script and6SVG subtree omissions, along
with other intentionally omitted content. Hidden-content semantics remain partial.

Selector work and descendant-label traversal are separately instrumented; they
are not whole-process timing or complete runtime-operation counts. Conservative
validation-node upper bounds are 4413
and 4401. No speed claim follows.

Evidence: native-govuk-bank-holidays-september13/RESULT.json and EVIDENCE.sha256.
All cache paths in this report are relative to node_modules/.cache/native-validation/.
This live check uses the prior audited font-size runtime (19343pass/3fail/2skips),
not the subsequently built datetime runtime. Capture provenance is unchanged.

## Shared functionality

- Preserve literal datetime on unchanged HTML time, ins and del; not unrelated
  elements, rewritten wrappers or omitted executable/foreign reader subtrees.
- JSON nodes automatically expose dateTimeSource with kind
  native-date-time-source-v1, original supported tag and raw string value.
- Do not parse calendars, infer time zones, invent missing values or validate
  source accuracy. Empty declarations differ from absent attributes.
- Enforce4096UTF-16 units per exported value and existing JSON byte/intermediate/
  structure limits. Fail rather than silently truncate. Markdown remains
  unchanged and does not incur JSON-only metadata limits.
- Export only visible included native HTML content, not heading-section context
  wrappers. Native foreign elements remain excluded; an actual HTML integration
  point uses its effective namespace. Non-whitespace metadata alone is research
  content, but is never added to rendered-text diagnostics.

Contract: DATE-TIME-SOURCE.md. This feature does not make the partial reader a
visibility oracle or interpret edit timestamps as dates of visible content.

## Isolated regression and broad validation

| Gate | Actual result |
| --- | --- |
| New feature cases | **70 pass**; corrected unchanged baseline48fail/22controls |
| Focused run | **809 pass / 0 fail / 0 skips**,10suites |
| Expanded selected native run | **19476 pass / 3 unchanged failures / 2 unchanged skips** |
| Selection | 379suites/378strict roots/746manifest entries |
| Build, strict, formatter | Pass; stable source inputs |
| Inventories | 1287source/config and2124compiled files;1281unchanged tracked inputs |

The expansion adds70new cases and63previously unselected existing text-line
extraction cases, all passing. The other367manifest entries are outside this
selected run. Full run 2026-09-13T13:46:15.979Z to 2026-09-13T13:50:45.340Z; native command
actually exits1. Its audit accepts only the exact existing three failures, not
a green suite: two research-section h2::before rejection expectations and the
table-source globally preserved id negative-string assertion. Existing focus-
provisioning and media-fallback skips remain unchanged; no added exclusions.

Runtime: native-date-time-source-september13-round00/snapshot01/dist.
Base: 960ea83eabad9cbca448ce8d586a2f8464b126e5.
Source inventory: de56de86bf4e804d45289713a0087e4324ce75da5969669e8b5bf28e84948174.
Compiled inventory: c6bd4e772aa54342e44c4e968970a1f9d920ab1cb8ea84ebf577ada316362fb3.
Native result: 6a042e602bb7e33f91c67677e0162b58c6b19d71dd6506625c28b357a764eb31.
Summary: 98d527856149429b1dbe2eb0580b24116cc93c466c0a8b4f06ca87c381cf3dfb.
AUDIT.json and RECEIPTS.sha256 bind exact files/results; root dist is not rebuilt.

Preserved attempts: baseline00 has761passes/48failures and fixed00 has808passes/
one failure. The new SVG integration test incorrectly expected a stored HTML
namespace URI instead of the native implicit-HTML representation. The test now
uses the existing effective-namespace predicate; production namespaces were not
changed. Baseline01 retains48missing-metadata failures; fixed01passes all809.
Original snapshots/results remain intact; no old failure is relabeled or skipped.

## Exact retained-source production extraction proof

Each before/after phase performs one long-v1 reader load, two native queries and
one production JSON extractDocument call. Zero HTTP, no full-DOM reload, no
styles/resource callbacks/scripts/actions/geometry/raster. Same source bytes,
default raw policy, reader/document limits; JSON cap1048576bytes/10000nodes/
128depth, query budget2million and validation-walk budget100000.

| Measurement | Before | After |
| --- | ---: | ---: |
| Reader DOM nodes | 5412 | 5412 |
| Extracted nodes | 5407 | 5407 |
| Datetime query matches | 0 | **280** |
| Exported datetime metadata records | 0 | **280** |
| JSON extraction bytes | 272773 | 297693 |
| Reader output code units | 71965 | 78125 |
| Ignored source attributes | 2281 | 2001 |
| Query work | 99016 | 93976 |

All280declared values and their order match the already retained native full-DOM
observations. Metadata-stripped content and native references are identical:
e8aaa2ab889f7e09b0fc9487a809ce22a50f9c538395405b1ad63451e24633a3.
Output grows by24920bytes;
this richer evidence is not free and is not presented as a speed improvement.
Dates are unvalidated source statements, not calendar/legal/travel advice.

Before 2026-09-13T13:39:19.842Z to 2026-09-13T13:39:20.034Z; after
2026-09-13T13:50:57.058Z to 2026-09-13T13:50:57.250Z. All site and proof phases
exit0 with stable full runtime inventories, empty/removed private directories,
absent process groups, closed native document/query owners and no prohibited
guard attempts. Each phase has30seconds plus5seconds grace and10MiB stream cap.
Offline phases use paired kernel/JS denials, no socket self-probe. Evidence:
native-govuk-datetime-reader-september13/RESULT.json and EVIDENCE.sha256.

## Still open

Full visual/interactive GOV.UK behavior, downloaded styles/fonts/scripts, cookie
banner actions, calendar-source accuracy, browser performance benchmarks and
general crawler/challenge compatibility are not established. The original four
research topics and broader browser/device/TTY/socket/SafeJS/credential/passkey
gates remain OPEN. No push; prior uncommitted work and old evidence preserved.
