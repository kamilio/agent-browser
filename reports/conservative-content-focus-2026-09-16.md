# Conservative automatic content focus — September16,2026

## Implemented result

New opt-in `main-content-v2` prevents a lone promotional article from hiding
other admitted source content outside semantic article and ancillary contexts.
It preserves main/ambiguous priority and uses the existing bounded focus scan.
Core, command host, research browser, replay API and replay CLI accept the exact
token. Default extraction and valid v1 outputs remain unchanged.

On the saved Home Depot body, v2 automatically selects the document and returns
**36201 Markdown bytes,22 product destinations and66 product-link occurrences**,
instead of the153-byte daily-deals card selected by v1. All31 dollar-prefixed
display lines and the previously recovered whole-document content match. The
actual native replay CLI produces identical content with no manual selector.
This is useful product-bearing source text, not validation of current prices,
offers, stock, reviews, carousel behavior or shopping actions.

## Twelve captured-page comparisons

All12 valid v1 extraction objects are identical between the prior compiled
runtime and the candidate. V2 preserves11 content outputs and changes only Home
Depot. Except for that expected scope/content change, v2 extraction objects
match v1 after removing policy metadata. All candidate counts and focus scan
counts match between versions. The corpus contains10 root pages and2 deep
articles on12 hosts, not another100-page live run.

| Captured target | V1 selection | V2 selection | V1 bytes | V2 bytes |
| --- | --- | --- | ---: | ---: |
| `https://www.homedepot.com/` | article | document | 153 | 36201 |
| `https://en.wikipedia.org/` → `/wiki/Main_Page` | main | main | 55847 | 55847 |
| `https://www.forbes.com/` | document | document | 49434 | 49434 |
| `https://www.businessinsider.com/` | main | main | 10158 | 10158 |
| `https://www.cnet.com/` | main | main | 32394 | 32394 |
| `https://www.lowes.com/` | document | document | 3161 | 3161 |
| `https://www.tastingtable.com/` | main | main | 22864 | 22864 |
| `https://www.google.com/` | document | document | 1018 | 1018 |
| `https://my.clevelandclinic.org/` | document | document | 24098 | 24098 |
| `https://manuals.plus/` | main | main | 7602 | 7602 |
| `https://www.pcmag.com/news/i-tested-canons-first-retro-camera-and-it-proves-throwback-gear-doesnt` | main | main | 23840 | 23840 |
| `https://www.ign.com/articles/wo-long-2-wings-of-ember-gets-release-date-demo-available-now` | main | main | 4345 | 4345 |

The saved decoded bodies total5317098 bytes. Root receipts retain their original
`extracted-unverified` and barrier-null fields. Deep article receipts have a
different schema: their pinned completed workflow/extraction evidence is checked
without inventing an outcome token. Requested and final response URLs remain
distinct, notably for Wikipedia. All raw bodies and original reports stay intact.

## Policy and limits

The outside-content signal uses admitted visible nonwhitespace text or nonblank
HTML image alt text, ignoring HTML header/footer/nav/aside contexts and native
banner/contentinfo/navigation/complementary roles. It does not infer meaning
from class/id, domain, content length, text ratio, price or language. Semantic
article ancestry follows the existing visible-frame rules, not every literal
article tag. `CONSERVATIVE-CONTENT-FOCUS.md` specifies those details and usage.

V2 adds `outsideArticleContent` metadata and the
`article-with-outside-content` fallback reason. Every v2 result reports the
signal, including where main/ambiguous priority makes it non-decisive. V1 has no
new metadata field. Invalid-input text now names both policy tokens; the
byte-identical compatibility result concerns valid extraction outputs.

Admission, source visibility, leaf descent, node/depth and output bounds remain
unchanged. Broader output can fail the old output cap; explicitly requested
Markdown text-prefix fallback remains separate. No scripts, credentials, paid
content unlocking, new dependencies, alternative browser or challenge solver.
Unfiltered source/header challenge checks still precede focused extraction.

## Validation

- Clean baseline:661 tests passed/0 failed across10 explicit manifest files.
- Core candidate:172 passed/0 across3 selected files. Identical new core tests
  on old production:82 pass/42 expected failures, all unsupported-v2 failures.
  These42 cases establish new-policy coverage, not an old runtime that already
  accepted v2 but selected incorrectly.
- First integrated candidate:811 passed/0. Final candidate:813 passed/0 in the
  same10 files,152 additional cases versus baseline. The final two contexts add
  v2 strict/output-prefix cap checks; existing barrier fixtures now exercise both
  policies. Build, selected types, focused formatting and lint all pass.
- Tests cover core signal/context behavior, mutation and exact scan limits,
  research native/reader modes, both capture profiles and formats, replay/CLI
  forwarding, source barriers, failed/incomplete admission, selection/recovery
  exclusions, hostile option objects, body/document cleanup and output bounds.
  This is not the full937-file committed native manifest.
- Two kernel-denied replay children process the12 saved bodies: baseline v1,
  candidate v1/v2. A third kernel-denied child runs the actual replay CLI on the
  Home Depot receipt. All finish cleanly with absent child groups, empty replay
  HOME/TMP and no guard attempts. Loaded documents are explicitly closed.
- A separate read-only core review finds no blocking issues and records reviewed
  hashes/limitations. The plumbing worker does not independently certify its
  own changes. The corpus worker verifies saved hashes/seals, not live content.

No new website requests, live sockets, SafeJS, passkey/credential or real-input
probes occur. Matching focus scan counts demonstrate unchanged node charging,
not a timing/memory benchmark or a single pass for the entire browser engine.
The compiler/formatter's private cache files remain ordinary tool artifacts,
separate from the empty replay HOME/TMP evidence.

## Provenance and outstanding work

Baseline source commit: `3711ebef872449f321effa6505db14101f10f2d6`. Candidate
snapshots contain the same1514 committed runtime source/script/config inputs,
with only10 owned source/test overlays; no dirty root runtime is used. Five
production modules change. Final test additions leave the compiled production
output identical to the first integrated candidate. Source, compiled, receipt,
body, extraction, invocation and process records are pinned in the JSON sibling.

Private evidence lane:
`node_modules/.cache/native-validation/conservative-content-focus-september16/`.
Raw copyrighted page bodies remain outside git. The final artifact seal covers
local evidence after the atomic commit. Build current source before using v2;
this validation does not rebuild or certify the pre-existing dirty root runtime.

A misleading unique main can still narrow too far. Unrecognized boilerplate
contexts can broaden output; recognized ancillary content does not trigger it.
The corpus lacks a real captured ambiguous-main case and a standalone deep
article without main; those paths have synthetic coverage, not fresh site proof.
Dynamic hydration/search, broader live coverage, challenge handoff, SafeJS
callback admission, credential/passkey and real-input gates remain open.
Historical100-page verdicts are unchanged. No push; overall browser goal active.
