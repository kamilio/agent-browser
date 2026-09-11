# CSS import request parameters: CSS Values Level 4 source receipt

## Result

Retrieved `https://drafts.csswg.org/css-values-4/` on **September 11, 2026** with
the authorized released native browser. **One reader navigation, one actual
bodyless GET, HTTP 200, no redirect, no retry, no subresources, no mocks.** Two
native heading-section extractions then ran offline with **zero additional
navigation or wire requests**. No protected fixtures were read.

The accepted outline has **§4.5.4 URL Processing Model, `#url-processing`**, not
a heading named Fetching External Resources. That extracted section defines
the style-resource fetch algorithm. The guessed `#fetch` anchor was not used.
The second extraction is **§4.5.1 Relative URLs, `#relative-urls`**, including
§4.5.1.1 `#local-urls`.

**Key finding:** the extracted algorithm takes both `destination` and `corsMode`
as caller-supplied parameters. It does **not** choose CORS mode from destination
`style`. For a caller supplying that destination:

| Supplied `corsMode` | Initial request destination | Initial request mode | Credentials after the algorithm's mode-dependent adjustment |
| --- | --- | --- | --- |
| `no-cors` | `style` | `no-cors` | `include` |
| `cors` | `style` | `cors` | `same-origin` |

These are the values **before URL request modifiers**. The extracted algorithm
permits modifiers defined elsewhere; this specification defines none itself.
**Which mode an actual `@import` caller supplies is still unverified.** Neither
destination `style` alone nor HTML link `crossorigin` proves that choice.

## Exact extracted request algorithm

Source: §4.5.4 `#url-processing`, `section-1.jsonl` in the evidence directory.
The inputs are a URL value, CSS rule or declaration block, a destination string
matching `RequestDestination`, `corsMode` restricted to `no-cors` or `cors`, and
a response-processing algorithm accepting a response and null/failure/byte stream.

1. Resolve the URL for the supplied rule/declaration. Return without fetching if
   resolution fails.
2. Obtain that rule/declaration's relevant settings object.
3. Create a request with these explicit parameters:

| Request field | Extracted assignment |
| --- | --- |
| URL | The resolved URL. |
| Destination | The supplied `destination`. |
| Mode | The supplied `corsMode`. |
| Origin | The relevant settings object's origin. |
| Credentials mode | Initially `same-origin`. |
| Use-URL-credentials flag | Set. This is a specification parameter, not authorization for this research to use credentials. |
| Client | The relevant settings object. |
| Referrer | Initially `client`. |

4. If the **input** `corsMode` is `no-cors`, change credentials mode to `include`.
5. Apply applicable URL request modifier steps. Other specifications may define
   them; no such specifications were followed in this run.
6. If the request's **then-current** mode is `cors` and `sheet` is non-null, set
   its referrer to the style resource base URL for the rule/declaration.
7. If `sheet`'s origin-clean flag is set, set initiator type to `css`.
8. Invoke Fetch with `processResponseConsumeBody` set to the supplied
   response-processing algorithm.

The extracted fetch block refers to `sheet` in steps 6–7 without a local
initialization in that block. The separate base-URL algorithm does initialize
a variable with that name. This report preserves the extracted conditions and
flags that binding ambiguity; it does not silently invent a sheet parameter or
claim that the native reader is a complete specification validator.

## Base and referrer facts actually extracted

**Base computation — §4.5.4 `#url-processing`:** start with `sheet` null. For a
declaration block with a non-null parent rule, use that parent rule; for a CSS
rule, take its parent stylesheet. Prefer a non-null **stylesheet base URL**,
then a non-null **sheet location**, otherwise the rule/declaration's relevant
settings object's **API base URL**. Resolve the resource with the URL parser
using this base.

**Relative URLs — §4.5.1 `#relative-urls`:** a stylesheet's relative URLs use the
stylesheet's base, not the styled document's URL. Embedded sheets use their
container's associated base; the source notes HTML document bases can change.
Property computed URL values are made absolute when possible; if absolute
resolution fails, the computed value is the specified value.

**URL encoding — §4.5.4:** omit the URL parser's encoding argument so that its
UTF-8 default applies regardless of the stylesheet encoding, after stylesheet
bytes have been decoded into Unicode.

**Referrer versus referrer policy:** the request starts with referrer `client`;
the later CORS-and-sheet condition changes the referrer to the style resource
base URL. **No inherited referrer-policy assignment is established by these
extracts.** A referrer value is not a referrer-policy value.

**Redirect/base boundary:** the algorithm consults CSSOM's stylesheet base URL
and location, but the extracted sections do not show how either slot is populated
from a redirect's final response URL. Consequently, final-response URL base
assignment for an imported sheet remains unverified. The research navigation
itself had no redirect and is not an import redirect test.

The included `#local-urls` subsection also distinguishes fragment-only local
references from ordinary relative resource URLs; it is not evidence for an
external stylesheet fetch or its credentials policy.

## Remaining implementation questions

- Find the actual stylesheet-import caller and its explicit `corsMode` argument
  before hard-coding `no-cors/include` or `cors/same-origin` for imports.
- Identify any applicable URL request modifiers; the table describes the base
  algorithm, not every possible modified request.
- Establish stylesheet base/location population after redirects, inherited
  referrer policy, and the `sheet` binding used in the fetch block through the
  relevant primary algorithms.
- Cycle handling, response/CORS acceptance, MIME enforcement, and import
  load/error behavior were not established by this CSS Values extraction.

Links to CSSOM, Fetch, HTML, URL, and CSS Syntax are present in native extracted
content but were **not visited**. No additional specification or wire request
was used to fill these gaps. The findings are not a claim that the browser's
import implementation is compliant, and no real import request was exercised.
The research navigation's own `credentials: omit` was a guard, not the CSS
algorithm's credentials setting.

## Evidence receipt

Directory:
`node_modules/.cache/native-validation/native-css-import-request-source-september11/`

| Artifact | Meaning |
| --- | --- |
| `AUTHORIZATION.md`, `PROMPT.md`, `SOURCE-TARGET.json`, `PREFLIGHT.json` | New Markdown authorization, run copy, target/bounds, pinned release and fixture-exclusion provenance. |
| `live-INVOCATION.json`, `live-EXECUTION.json`, `LIVE-AUDIT.json` | Exact live command, private allowlisted environment, bounds, actual destination, native/wire/mock counters and closed transport. |
| `response-1.body`, `response-1.json`, `response-1.headers.json`, `FINAL-RESPONSE.json` | Original decoded HTML, response metadata and hashes; no response-body trimming. |
| `live.jsonl` | Accepted native reader receipt, original body capture, admission and native heading outline. |
| `OFFLINE-INPUT.json`, `SELECTIONS.json` | Pinned receipt/body and two selections from that outline. |
| `section-1.jsonl` | §4.5.4 `#url-processing`; 26,754 bytes; 431 selected nodes. |
| `section-2.jsonl` | §4.5.1 `#relative-urls` plus §4.5.1.1; 15,436 bytes; 189 selected nodes. |
| `section-*-audit.json`, `RESULT.json`, `offline-EXECUTION.json` | Two successful offline native extractions, zero remaining nodes after each close, zero network/process guard attempts. |
| `live-INTEGRITY.json`, `offline-INTEGRITY.json`, `*-{source,compiled,harness,preserved}.sha256` | Before/after executable-source, compiled-runtime, harness, and sealed-prior-evidence pins. |
| `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Named final checks, bounded resource accounting, and artifact/report digest ledger; ledger excludes itself. |

Original body: **1,018,170 decoded bytes**, **160,172 encoded bytes**;
SHA-256 `cfc594269a139eddc479ab65ac98267835b509ed43bcd392ffb4fc2ba1f07abf`.
Native receipt: **1,384,328 bytes**;
SHA-256 `e1358688e9afd03b218f3e5dd66c522752edcf4f16bd007fbc7c0316bf6073b0`.
The transport body and receipt capture match byte-for-byte. The response's
Last-Modified header is September 11, 2026 at 06:18:18 GMT; that is response
metadata, not an independently verified publication date.

Live child: **21:33:07.831–21:33:08.353 UTC**. Offline child:
**21:33:49.385–21:33:50.146 UTC**, both September 11, 2026. Each phase used one
child/capacity one, a 30-second timeout plus 5-second grace, and 6 MiB output/file
limits. Native 250 ms pacing was configured; no second request occurred to test
spacing. Private HOME/TMP directories remain empty and preserved. Offline
execution used kernel socket denial plus network/process guards.

Unchanged `long-v1` admission includes the 4,000,000-byte body cap and 50,000-node
document cap. The outline scanned 24,354 nodes and was not truncated. Results
remain explicitly partial native semantic extractions, `extracted-unverified`,
without page scripting or stylesheet execution. No access restriction, body/node
cap, retry, alternate client/parser, raw-body search, page subresource, credential,
device/TTY, SafeJS, cleanup/deletion, source edit, build, or test was used. Final
checks enforce lane ≤12 MiB, files/output ≤6 MiB, and free space ≥64 MiB.

## Release provenance and sealed prior

Runtime: validation-cache
`native-table-document-integration-september11-round04/snapshot01/dist`.
Commit `2e88c1464b0975f1ad8a9e3e4eca122e648175b8`, gate base
`2ea6d50cc2ae5aecfb081f9b65cc2fb04c28bb3e`. The gate-local audit, authorized full
source/compiled ledger hashes, summary, native result and 20 gate receipts were
verified. The **10,123 pass / 0 fail / 2 existing exclusions**, **170 selected /
169 strict / 574 manifest**, and **25 commit inputs** remain historical audited
release facts, not new test/build results.

To avoid protected fixtures and concurrent integration contents, this lane
rehashes only its allowlisted executable source/compiled files: **372 source
files and 1,488 compiled files**. It does not read the other **687 source and 412
compiled files**, which include tests, fixture-named files, and out-of-scope
paths. Full ledgers covering 1,059 source/1,900 compiled files remain pinned;
this is not a claim of a fresh full-content rehash. No working-tree source or
protected fixture content was read for this follow-up.

The prior `CSS-IMPORT-FETCH-SOURCE.md` and
`native-css-import-fetch-source-september11` evidence remain sealed and unchanged:
prior report SHA-256
`5f9068cd2d51cdeff5bb09bce4300769f0c0b642ffa4b036ed28662adf549a08`;
prior ledger SHA-256
`877489c5549e37c4c6fc66d336a6ba1abb427a4e668e5843c4043560ea35ba80`.
Only this new report and the new evidence lane were written. No prior phase was
relaunched, and no commit or push was made.
