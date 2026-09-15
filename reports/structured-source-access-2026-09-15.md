# Structured-source access validation — September 15, 2026

## Result

Added bounded, nonexecuting source-access declarations to research extraction.
This helps distinguish a possibly partial article from a complete read without
changing content, HTTP/challenge outcomes or authorization. No new public article
body recovery was demonstrated, so none was added. See RESEARCH-SOURCE-ACCESS.md.

The original 100-URL sweep remains in reports/agent-citation-pages-2026-09-15.md,
including every attempted URL, HTTP outcome and content review. That corpus is a
reproducible agent-citation proxy, not a measured global agent-visit ranking.
This phase uses 95 retained corpus bodies plus eight deeper-page bodies; it does
not repeat the 100-site live sweep or claim that every website works.

## Saved-source survey

All103 native survey children completed and their saved guard/closure records
were independently audited. Of100 HTML-declared responses,51 have77 eligible
JSON-LD blocks; three Markdown-declared responses were skipped for this survey.
All77 blocks parsed, with no recorded parser/JSON errors or limit hits. The survey
found four access declarations on three pages, one articleBody string and two
reviewBody strings on two other pages. No complete-body prose was emitted.

PCMag's structured article and CarGurus's editorial review do not establish new
missing content: the earlier article extraction and source-mode hidden-tab
recovery already provide prose. CarGurus's separate86-unit user review is not the
primary editorial review. Consumer Reports still lacks readable headline picks;
member/component payloads were not recovered. Missing flags are not proof of
free access, and RTINGS's part-level declaration does not block its entire page.

The survey's10,000-container walk resets per block and traverses arbitrary object
children; it is not schema validation. Its accepted aggregate budget excludes
oversized skipped blocks, and there is no separate global finding cap. The new
collector is intentionally narrower: recognized contexts and root/@graph/hasPart
only,256 visited values globally,16 entries,8 blocks,65,536 units/block,
262,144 aggregate units including skipped blocks, and depth16. Unit tests cover
exhaustion; ordinary sample sizes alone do not validate limits.

## Metadata observed

| Supplied page | Retained declarations | Added document extraction bytes |
| --- | --- | ---: |
| `https://www.rtings.com/` | `$.hasPart: "False"` | 212 |
| `https://www.consumerreports.org/electronics-computers/tvs/best-tvs-of-the-year-a3862868628/` | `$: false`; `$.hasPart: false` | 263 |
| `https://www.nerdwallet.com/finance/learn/sell-your-stuff` | `$: true` | 202 |

All three pages also retain identical declarations with main-content focus.
The four values remain separate and unverified. Offsets and object paths are in
the JSON companion; they refer to normalized original source, not a selected DOM
scope. Missing/unsupported/over-budget metadata never becomes a free-access claim.

## Native validation

- Clean baseline 55e852d14a6a828de7280fd9686569f93ec8ac2c; candidate overlay contains only the
  three production files, two registered native test files and manifest additions.
- 116 new tests pass, including raw/visibility policies, omitted
  ancestors, no script execution, bounds, freezing, table-priority/UTF-8 fitting,
  prefix/focus behavior, MIME absence, cleanup and mocked challenge invariance.
- Selected51-file candidate: 3646 pass, four unchanged existing
  failures; baseline49 files: 3530 pass, the same four failures.
  Build, changed-file format/lint and new-test types pass. Broad test types retain
  the existing snapshot.test.ts:83 TS2345 error; this is not an all-green suite.
- Initial new-test run111pass/5fail compared document-specific references across
  separate trees. The corrected semantic comparisons omit only document/scope/ref
  keys. Both production builds are unchanged; failed evidence is retained.
- All103 saved bodies run with document and focused extraction on both baseline
  and candidate: 412 mocked navigations, 206
  paired comparisons. Content hashes, outcomes, barriers, contentSuccess, reader
  accounting and non-access extraction metadata are unchanged in every pair.
- SourceAccess appears on exactly three pages/six policy cases. All extraction
  receipts remain within256,000 serialized bytes. Bodies and headers are unchanged;
  capture serialization/admission checks pass. These are mocked navigations from
  retained responses, not new live loads or evidence that all sources are useful.
- Initial comparison stopped on differing locally generated receivedAt times.
  Those are now validated separately; every other primary-response field still
  compares exactly. No source rewrite or rerun; the failed check remains recorded.
- Zero fresh native HTTP requests;103 survey plus206 replay child groups close.
  Offline replay uses kernel/JavaScript IO guards, empty HOME/TMP,192MiB heap and
  30-second deadlines. No credentials, SDK, page scripts, listeners or TTY probes.

The JSON report retains exact checks, failures, flags, source hashes and private
evidence pins. Original tracked/untracked work and historical reports are kept
separate. No push. The overall browser goal, real interactions/passkeys, SafeJS
and website challenge gates remain outstanding. This is advisory metadata, not
a speed benchmark, entitlement check or newly recovered article content.
