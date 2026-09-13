# The Internet checkbox replay and fresh document check — September 13, 2026

**Semantic checkbox activation passes; the genuine pointer click still fails.**
One fresh native GET confirms that today's HTML is byte-identical to the retained
September 11 document. Stylesheet/image freshness is not established by that GET.
This adds evidence without rewriting `INTERNET-CHECKBOX-FLOW.md`.

## Faithful full-asset replay

Runtime: `node_modules/.cache/native-validation/native-generated-table-september13-round01/snapshot01/dist`.
It is the previously audited 20,398-pass / zero-failure / two-skip runtime, not a
new native-suite run. All 1,299 source and 2,124 compiled inputs are reverified.

The normal native `BrowserSession` and document loader consume the exact four
historical resources, with original response metadata and unchanged body hashes:

| Resource at `https://the-internet.herokuapp.com` | Bytes |
| --- | ---: |
| `/checkboxes` | 2,008 |
| `/css/app.css` | 353,394 |
| `/css/font-awesome.css` | 28,747 |
| `/img/forkme_right_green_007200.png` | 7,660 |

Total: **391,809 bytes**, four native transport-route responses, **zero HTTP**.
Both original stylesheets and the real PNG load; nothing is stripped to make the
action pass. Native queue capacity remains one and the identical transport limits
object is forwarded. All exact fixtures are admitted at most once; no retry.

At viewport 1280×720, the document has 81 nodes and revision 85 after loading.
Native discovery finds enabled `e56` unchecked and enabled `e60` checked. Two
semantic actions invert `e56` and restore it. Each emits ordered `click`, `input`,
`change` events with matching state and target; all six events are `isTrusted:false`.
This remains semantic activation, not hit-tested pointer acceptance.

Exactly one real `session.click` on `e56` then fails with `unsupported` during
document-width resolution. It emits no control events; the checkbox remains
restored to false. The failure names CSS at-rules (8), properties (11) and
selectors (2). No direct action substitution, guessed coordinates, CSS removal,
navigation fallback or pointer retry follows.

Native formatting reports 54 visited nodes, 72 boxes, 258 logical text units,
695 counted work and six deferred table shells. All six Foundation-generated
`::before`/`::after` boxes carry native table metadata rather than generated-display
rejections. Whole-page support is still blocked: formatting also reports two
unsupported media queries, two float markers, one position-coordination marker
and four clearance markers. A formatting shell is not proof of completed layout.

Replay supervisor: **18:03:10.789–18:03:11.209 UTC**, September 13, 2026;
PID/process group 844788, exit zero for completed observation, not pointer success.
GNU time reports 0.41 seconds elapsed and **134,656 KiB / 131.5 MiB peak RSS**.
This is one instrumented offline process measurement, not a repeated benchmark or
live speedup. It exceeds the provisional 100 MiB small-page target despite the
small DOM; the stylesheet-heavy workload and instrumentation remain explicit.

## Fresh live HTML, separate source-only scope

One native GET of `https://the-internet.herokuapp.com/checkboxes` returns HTTP 200
at 18:07:13.478 UTC. Wrapper interval: **18:07:13.359–18:07:13.485 UTC**.
No redirects, retries, CSS/images/scripts, cookies, authorization headers or extra
requests. Challenge classification is null; this is not a challenge-bypass test.

Both current and historical HTML are 2,008 bytes with SHA-256
`b5464fb9b1d91e1eb32e3b6ada6b4207a915723f86429c75ea650d879193efda`.
Parent verification also compares the two byte buffers directly without printing
or searching raw source. CSS and image freshness remain unknown.

A separate offline native parse at **18:07:18.943–18:07:19.076 UTC** performs two
queries, not a BrowserSession load. It confirms the same checkbox references and
states, plus form `e54` with absent method/action attributes. Query work is 770;
81 nodes/revision 82 remain unchanged until close. Seven unexecuted scripts and
one end-`br` parser recovery remain explicit. No value/password fields are read.
Both source-worker processes exit zero and are absent after cleanup.

## Exact CSS attribution

A separate **no-action, zero-HTTP** native load attributes declarations using the
engine's scanner, parser, import graph, media evaluator and style-selector APIs.
The complete pass covers two external CSS roots / 382,141 code units, 1,685 scanned
rules and 1,613 style queries / 141,802 query-work units. Its shared native parser
budget consumes 1,659 rules and 3,402 declarations, below 8,192/16,384 limits.
The normal style engine separately counts 382,208 total input code units including
inline styles. No source rewriting, alternate parser or raw-source grep is used.

All **11 applicable property diagnostics** are accounted for:

| Property | Occurrences | Native attribution |
| --- | ---: | --- |
| `-ms-text-size-adjust` | 1 | `html`, value `100%` |
| `-webkit-text-size-adjust` | 1 | `html`, value `100%` |
| `-moz-box-sizing` | 2 | `hr:content-box`; universal/pseudo rule `border-box` |
| `-webkit-box-sizing` | 1 | Universal/pseudo rule, `border-box` |
| `-webkit-appearance` | 1 | Unknown match: unsupported search-control pseudo-selector |
| `cursor` | 1 | `body`, `default` |
| `-ms-interpolation-mode` | 1 | `img`, `bicubic` |
| `*zoom` | 1 | `.row`, `1` |
| `direction` | 1 | Matched block-element list, `ltr` |
| `text-rendering` | 1 | Matched heading, `optimizeLegibility` |

Ten occurrences have confirmed native element or pseudo-target matches. The
appearance declaration is retained conservatively by the native cascade because
its selector cannot be evaluated; it is **not** claimed to match a checkbox.

The two unsupported selector lists are the WebKit search-cancel/search-decoration
pseudos and Mozilla focus-inner pseudos. Seven applicable keyframe at-rules
(`rotate`, `webkitSiblingBugfix`, `fa-spin`, including vendor variants) plus one
`@font-face` account for all eight applicable at-rule guards. A ninth raw `@page`
rule is in nonmatching print media. Definitions are not proof of active animation
or font use; the diagnostic does not suppress their current guards.

Three incomplete instrumentation attempts remain preserved:
1. Initial diagnostic stops on native unsupported pseudo-selector matching.
2. Follow-up reaches all 11 properties but stops at its own 1,024-character
   diagnostic selector ceiling before scanning both stylesheets.
3. Using the native text ceiling still stops because DOM syntax validation has a
   whole-list component budget, unlike native CSS's per-branch style matching.

The final diagnostic uses the **same `matchingStyleSpecificities` API as the
cascade**, with unchanged engine limits and aggregate work accounting. It records
unknown matches explicitly and does not swallow resource-limit errors. Final
interval: **18:08:01.531–18:08:01.891 UTC**, exit zero. These are diagnostic-harness
corrections, not new browser functionality or a successful pointer action.

## Integrity and next work

All phases preserve runtime, source, fixtures and framework pins, use private
empty HOME/TMP and bounded watchdog/output limits, and verify zero retained tabs,
documents, image work, queue activity, cookies and listeners after cleanup. Offline
seccomp/network/process guards record no attempted escape. No SafeJS, credentials,
passkey devices, TTY or server-socket acceptance is claimed.

Evidence under `node_modules/.cache/native-validation/`:
- `native-internet-checkbox-replay-september13/`: 28 sealed receipts; ledger SHA
  `eedef49ca2f0ad49cd548cef208f82c944251cd67d50e3794bc571ec230cb100`.
- `native-internet-checkbox-source-september13/`: 64 sealed receipts; ledger SHA
  `1535eea18ba6aaeea1254ef8cb6b6afc48cd340451fca8d0e41a15f89e8f52bc`.
- `native-internet-checkbox-css-attribution-september13-round03/`: 30 sealed
  receipts; ledger SHA `f8e8fcc213cec945b24a7b3b022000532914798e384203fadb3838fc39acc837`.
- The initial CSS attribution and rounds 01/02 retain their nonzero exits and
  separate 30-receipt ledgers. Parent checks are in
  `internet-checkbox-work-september13/EVIDENCE-VERIFICATION.json`.

Next work must implement real property/selector/font/animation behavior where
required, and distinguish invalid legacy CSS from supported aliases—without merely
discarding guards. The actual checkbox pointer gate remains open. Repeatable
memory/speed measurement, broader live interactions, research refresh and access
restriction handling remain part of the active goal. No production code changes
or native-suite rerun are claimed by this testing checkpoint.
