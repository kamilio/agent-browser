# Confirmed native source: CSS import mode

**Confirmed directly by native extraction:** CSS Cascading and Inheritance
**Level 4**, §2.2 **`#import-processing`**, defines the caller “To fetch an
@import” and passes **destination `style`, CORS mode `no-cors`** to the
style-resource fetch algorithm. This is the missing import-specific binding,
not a deduction from HTML link `crossorigin` or destination alone.

Source: `https://www.w3.org/TR/css-cascade-4/`, retrieved **September 11, 2026**.
The parent-provided URL was only a candidate: no retained parent web text or
citation is used as proof. Evidence is the authorized native extraction of
**§2 `#at-import`, including §2.2**, in `section-1.jsonl`.

## Exact boundary of the finding

- The caller obtains the rule's parent stylesheet, returns for an unsatisfied
  supports condition, and parses the rule URL against that stylesheet's location.
  It then explicitly supplies `style` and `no-cors` to the fetch operation.
- **Credentials consequence, separately derived:** the previously sealed native
  CSS Values Level 4 §4.5.4 extraction changes credentials to `include` when
  supplied `no-cors`, before URL request modifiers. Credentials are not directly
  assigned in this Cascade caller. The older caller passes a stylesheet while
  the newer Values algorithm accepts a rule/declaration; full cross-edition
  algorithm compatibility is not asserted.
- Inherited referrer policy, final-response URL base assignment, and cycle
  handling remain unverified. No browser implementation compliance is claimed.
  Earlier reports retain their original limited findings; none was rewritten.

## Final receipt

Lane: `node_modules/.cache/native-validation/native-css-import-mode-source-september11/`

| Artifact | Evidence |
| --- | --- |
| `section-1.jsonl` | Single native section extraction; **38,644 bytes**, **575 selected nodes**; includes the exact caller and arguments. |
| `response-1.body`, `response-1.json`, `live.jsonl` | Intact original HTML, response metadata and pinned native reader capture. |
| `LIVE-AUDIT.json`, `RESULT.json`, `*-EXECUTION.json` | **1 navigation, 1 bodyless GET, HTTP 200, 0 redirects/retries/mocks; 1 offline section, 0 offline navigation/wire.** |
| `PREFLIGHT.json`, `*-INTEGRITY.json`, `*.sha256` | Release/harness before-after pins and preserved evidence. |
| `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Final named checks, including the explicit caller/argument sequence in native extracted content, and artifact/report hashes. Ledger excludes itself. |
| `AUTHORIZATION.md`, `PROMPT.md`, `ATTRIBUTION-CORRECTION.md` | Authorization history and corrected attribution; no parent-search proof. |

Body: **269,589 decoded / 45,247 encoded bytes**;
SHA-256 `7787bd75c1f7187fdfdfdf9e7b5b8391faeac0e7c80dd19461de8426931138e5`.
Section SHA-256:
`9e36f5d9ae44110b02dd9d9d89fa19e2a35005f1fa7fd9824a57d6c8e34f6d90`.
Receipt SHA-256:
`5ea81c4497deb94c2f1c3513f7a859a2f9651ad1652a06519181ade38d1c2285`.

Live child: **21:43:38.983–21:43:39.281 UTC**; offline child:
**21:44:01.404–21:44:01.703 UTC**, September 11, 2026. Unchanged `long-v1`
admission; 9,635 heading-outline nodes scanned, no truncation/cap/restriction.
Each phase used one child, 30s+5s, 6 MiB output/file, private empty HOME/TMP,
allowlisted environment and existing guards; offline socket denial remained
active. Native 250 ms pacing was configured, not exercised between multiple
requests. Final checks enforce ≥64 MiB free and lane ≤12 MiB. Native semantic
results remain partial, `extracted-unverified`; closed offline documents retain
zero nodes. No cleanup, page subresources/scripts, credentials, alternate client,
raw-body search/trimming, protected fixtures, source edits, builds or tests.

Released runtime remains `native-table-document-integration-september11-round04/snapshot01/dist`,
commit `2e88c1464b0975f1ad8a9e3e4eca122e648175b8`. The authorized gate pins and
20 receipts are verified; **10,123 pass / 0 fail / 2 exclusions** are historical,
not a new test run. Fixture-safe checks rehash 372 source/1,488 compiled files;
full ledgers remain pinned without reading excluded fixtures/tests. All three
earlier report/evidence seals remain intact. **Research concluded; no additional
URLs or extractions were used.**
