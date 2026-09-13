# LiveBench: bounded native-browser research — September 13, 2026

**Outcome: README methodology admitted; website title only. Broader browser,
research and device acceptance gates remain OPEN.** No models were evaluated,
ranked or compared. These are source claims and explicitly labeled analysis,
not independent verification of the benchmark implementation or contamination.

## Sources and native references

Evidence lane: `node_modules/.cache/native-validation/native-livebench-research-september13/`.
`reader-0-AUDIT.json` and `reader-1-AUDIT.json` retain the admitted excerpts,
native references, source digests and capture timestamps. `EXCERPTS.json` collects
the same blocks. Native identities are document-local, not HTML byte offsets.

| Source | Capture timestamp (UTC) | Native result |
| --- | --- | --- |
| `https://livebench.ai/` | September 13, 2026, 13:05:37.272 | HTTP 200, HTML, 1,066 decoded bytes; title `LiveBench`, native `e4`, nine text units |
| `https://raw.githubusercontent.com/LiveBench/LiveBench/main/README.md` | September 13, 2026, 13:05:37.742 | HTTP 200, text/plain, 16,325 decoded bytes; 13 complete heading-delimited blocks, 15,956 admitted text units, native text node `e3` in document `e1` |

Source body SHA-256, in the same order:

```text
4f0e07dcb4bd1a2b1824bef6a4ce367b9ff2ed71445101f06507413d4a2f6841
daedd942e98b2d4cc7f83e574368ba99823f4e9df9edf73619c3099a939e9944
```

The website's successful long-v1 reader produced eight nodes and only one match
for title/headings/paragraph/list/row/definition/noscript selection. Its native
reader report records three omitted script subtrees. **Inference:** this is
consistent with a script-dependent shell, not usable leaderboard evidence in
this script-free check. No ranking, score or dynamic UI was admitted. Because
the reader succeeded, no full-DOM fallback was authorized or attempted.

The text/plain source used `loadResearchDocument`'s native text-document branch,
with the profile omitted: this audited runtime explicitly rejects non-HTML for
`long-v1`. One load only. Native `discoverDocumentTextLines` and JSON
`extractDocument` line selection supplied the text; no filesystem/body search
was used for research extraction. Native line selection inspected 226 lines,
16,315 source code units; the admission filter retained 13 of 14 complete
heading-delimited blocks under 16,000 units. Lines 208–215 were not admitted.
Native newline/control normalization applies; the raw body digest remains separate.

## What the captured README says

All references below mean README native `e3` line ranges in the captured body,
not a newly fetched page or a pinned upstream commit.

- **Design and coverage, lines 30–41 and 158–176:** the introduction says
  “designed to limit potential contamination” and “18 diverse tasks across 6
  categories.” It describes monthly new questions and recently released datasets,
  papers, news and film synopses as inputs. The Data section names reasoning,
  math, coding, language, data analysis and instruction following. These counts
  and cadence are author claims, not a verified September 2026 inventory.
- **Scoring, lines 30–41:** the authors claim objective, verifiable ground-truth
  answers and automatic scoring “without the use of an LLM judge.” This read did
  not inspect per-task scorers, their answer-extraction rules, aggregation
  weights, validity, uncertainty or ground-truth error rates.
- **Release/public-data mismatch, lines 76–104:** the README labels April 25,
  2025 as its current release, says some questions are not public, and tells
  readers to select November 25, 2024 for evaluation of all categories with its
  identified public questions. Both dates are in the past relative to this
  September 13, 2026 capture. They are dated statements in a mutable README,
  **not confirmation of the actual latest release or current public availability**.
  The title block, lines 1–18, labels its model image September 30, 2024; neither
  that image nor its linked leaderboard content was loaded.
- **Run/result identity, lines 76–104 and 129–150:** documented options select
  model, task subsets, output-token cap, endpoint, concurrency, resumption,
  failure retries and release. Result display says question source and release
  should match evaluation. It exposes category/task breakdown file names rather
  than documenting an aggregate-score formula in these admitted sections.
- **Error accounting, lines 151–157:** the README describes three default API
  retries with delays, an error marker after repeated failures, and treating
  unresolved failures as incorrect. Its speculation about content filters is
  not evidence about any provider in this check. None of those evaluation
  retries were executed; this browser run had zero retries.
- **Configuration and custom tasks, lines 177–207:** custom questions carry
  identifiers, category/task, ground truth and prompt turns, and require a
  scoring function. The model section distinguishes display aliases from
  provider/API names and documents temperature, token and top-p overrides.
  Changing prompts, provider mappings or scorers therefore requires recording
  the configuration; this read did not verify the implementation.

The citation section, lines 216–226, uses a contamination-free claim in the paper
title. That title is not proof of zero contamination. Linked paper, changelog,
datasets, answers, judgments, source code and images were not opened.

## Practical interpretation checklist

The following are **analysis/recommended reporting safeguards**, not a claim that
the README mandates a complete reporting schema.

1. **Pin the comparison:** record capture/evaluation dates, upstream code commit,
   question artifact digest, release and question source, exact subsets and
   counts. Do not equate a public November 2024 run with an incompletely public
   April 2025 release. Obtain fresh authorized evidence before calling either
   date latest. Basis: lines 76–104, 129–150, 158–195.
2. **Separate identity from the label:** record model revision where available,
   provider/API name, display alias, endpoint identity without secrets, prompt
   artifact, token limit, temperature/top-p overrides and other effective
   settings. Record seed policy if available; this read did not establish it.
   Basis: lines 76–104 and 177–207.
3. **Report the denominator and failures:** retain per-question outcomes,
   category/task breakdowns, missing data, error counts, retry/resume policy and
   actual attempts. Keep concurrent-request and task-parallel settings distinct.
   Otherwise API reliability or retry differences may affect apparent model
   ability. Basis: lines 105–157.
4. **Inspect the scoring contract:** pin task scorer and answer extraction,
   ground truth, normalization, aggregation and any uncertainty calculation
   before interpreting small differences. Objective-answer scoring can reduce
   reliance on a model judge, but does not by itself validate the answers,
   scorer or breadth of the measured capability. Basis: lines 30–41, 129–150,
   177–195; the missing implementation details are open checks.
5. **Treat freshness as mitigation, not immunity:** ask which questions postdate
   which model's training, how update cadence actually occurred, and what
   overlap/exposure checks exist. A monthly-update design alone cannot establish
   zero contamination or a universal best model. Six named categories can help
   organize a capability profile; they do not establish performance on every
   real-world workflow. Basis: lines 30–41 and 158–176.

## Bounds, validation and seal

Two authorized native document requests made **two actual GETs**, no redirects,
retries or subresources; 17,391 decoded and 6,661 encoded bytes total. Fresh empty
cookie jars used credentials omit, retained zero cookies and closed. The live
guards admitted no Cookie/Authorization headers and reported no challenge,
429, Retry-After or prohibited guard attempt.

| Offline phase | Loads | Nodes | API calls | Admitted blocks / text units | Accounted walk work |
| --- | ---: | ---: | ---: | ---: | ---: |
| Website long-v1 reader | 1 | 8 | 1 | 1 / 9 | 11 |
| README native text document | 1 | 3 | 2 | 13 / 15,956 | 49,159 |

HTML selector work was 421 native units. Text calls used a conservative charged
budget of 130,520 units, not an instrumented native query-work measurement.
The transient full text selection was 16,315 units; admitted excerpts alone are
subject to the 16,000-unit per-body ceiling. No further reader loads are allowed.

All four bounded phases exited zero, with empty stderr, absent child process
groups and 26,879 combined stream bytes. Each phase used 30 seconds plus five
seconds grace and a 10 MiB stream ceiling. Private HOME/TMP directories were
empty before/after and removed. Offline seccomp reported NoNewPrivs=1/Seccomp=2;
paired JS guards recorded no network/process attempts. No socket self-probe,
script/SafeJS execution, rendering, real terminal, device or model evaluation ran.
Both document owners closed to zero nodes; the website query owner closed with
zero indexed nodes. The text path created no persistent DocumentQueries owner.

Only `native-aria-table-september13-round00/snapshot01/dist` ran, under Node
22.22.0. Complete inventories (1,284 source/config and 2,120 compiled files)
were pinned before/after every phase and at finalization:

```text
base: bdab3fdce00f5a68ddd103dae1470b66dffdfe12
source: da2e046c498fa6719cd0cdac31e07309b6a1a96998492a868bb36c4b92f8cfb1
compiled: 01e9d2430852e62fbbac66a303c8be200305f835a990383bf187290ec9e55283
```

The bound historical audit is **19,269 passing, three unchanged baseline
failures, two skips; full selected suite NOT green**. The three failures are two
malformed `h2::before` section-rejection cases in `research-section.test.ts` and
the non-table/executable-subtree attribute-retention case in `table-source.test.ts`.
All 108 new ARIA/newline cases passed in that audit. This lane did not rerun tests
or rebuild root dist; the four phase exits are not a substitute suite result.

`EVIDENCE.sha256` and `SEAL.json` bind source bodies, actual request receipts,
runtime inventories, scripts, excerpts, this report and `RESEARCH-RESULT.md`.
Create-only receipts and final read-only modes support a digest-verifiable seal,
not filesystem-level immutable storage. Prior reports and their measurements
are unchanged; no production/test/manifest/TASKS edits, commits or pushes.

**Still OPEN:** dynamic leaderboard/interactive website behavior; current release
and public-data verification; question/scorer/contamination audit; matched model
measurements and full benchmark research; broader browser, website, socket,
SafeJS, terminal and device acceptance gates. No X/Poe opinion inference or
claim of all research completed follows from this bounded check.
