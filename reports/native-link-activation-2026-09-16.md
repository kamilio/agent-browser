# Native link activation and font cache — September 16, 2026

## Result

Three fresh live workflows successfully discover a link on the loaded landing
page, activate it with the native session, navigate to its exact destination and
extract nonempty Markdown. Wikipedia and RunRepeat use `BrowserSession.click`;
Cambridge uses targeted `BrowserSession.press("Enter")`. The harness does not
substitute a direct target navigation. Six GETs, no redirects or retries.

This supplements the complete 100-entry checklist in
`reports/agent-citation-revalidation-v2.md`, not a replacement sweep or a claim
that all 100 pages work. That corpus is a citation-frequency proxy, not measured
global agent traffic, and its root URLs are not necessarily the cited deep pages.
Historical results remain unchanged. Native activation plus nonempty extraction
is separate from the saved-output content review recorded in the JSON report.

That review finds substantive target content in all three fresh outputs:
biographical prose, a shoe review and dictionary definitions/examples. Wikipedia
is sampled; RunRepeat and Cambridge Markdown are read fully. Source accuracy,
visual rendering and extraction completeness are not verified.

## Exact live workflows

| Landing URL | Discovered destination | Action | HTTP pair | Target Markdown bytes |
| --- | --- | --- | --- | ---: |
| https://en.wikipedia.org/wiki/Main_Page | https://en.wikipedia.org/wiki/Grace_Coolidge | click | 200 / 200 | 212988 |
| https://runrepeat.com/ | https://runrepeat.com/brooks-revel-max | click | 200 / 200 | 19465 |
| https://dictionary.cambridge.org/ | https://dictionary.cambridge.org/dictionary/english/patronize | targeted Enter | 200 / 200 | 20400 |

Wikipedia starts at the canonical landing URL already recorded in the earlier
root receipt. This deliberately avoids repeating its root redirect. Each workflow
selects the first exact-target, nonempty-label match in source order: Wikipedia
has two matches, the others one. Click events are `mousedown, mouseup, click`;
targeted Enter events are `keydown, keypress, click, keyup`. The final navigation
and installed document URLs must match the discovered target. Both installed
documents and the session/transport close after each workflow.

Live action durations are 2177.10, 2081.34 and 2050.87 ms respectively. These include
network admission/pacing and are **not** cache performance measurements. The live
runtime is the pinned pre-cache build matching parent `dc41c5c` runtime inputs.
The new cache candidate is separately tested on identical saved bodies below.
Fresh Wikipedia output differs from its older fixture by three bytes; neither
capture is rewritten or treated as an identical-response comparison.

## Focused production change

An isolated saved-body Wikipedia CPU profile attributes 60.227 ms of sampled
inclusive time to font-family parsing through `resolveNativeFont`. The parser
repeatedly resolves the same successful strings during native layout/hit testing.

`src/font-family.ts` now caches at most 64 successful resolutions by exact raw
string, with FIFO eviction and the existing 4096-code-unit input bound. Invalid
inputs never enter the cache or evict valid entries. Each call returns a fresh
record copied from a private frozen snapshot, retaining the existing shared font
identity. Parsing, normalization, family ordering, errors and public APIs are
unchanged. No page/document objects, dependencies or runtime engines are added.

### Controlled saved-body comparison

Three fresh-process samples per variant per workflow, alternating variant order
between repetitions. Both builds use the identical action/extraction harness and
pinned bodies. All 18 executions produce identical per-page extraction hashes
and event sequences; no network is permitted. Full samples are in the JSON.

| Workflow | Baseline median ms | Cache median ms | Median reduction |
| --- | ---: | ---: | ---: |
| Wikipedia click | 1239.61 | 1195.49 | 3.56% |
| RunRepeat click | 375.49 | 366.91 | 2.29% |
| Cambridge Enter | 181.32 | 182.54 | -0.67% |

These are small local observations with only three samples, not a general browser
speedup or statistically established gain. Cambridge does not improve in this
sample. The optimization deterministically avoids repeated successful parsing;
most overall action cost remains elsewhere.

## Validation and boundaries

- Clean baseline: 364 passing tests across nine explicit native-manifest files.
- Clean cache candidate: 390 passing tests across ten files, including 26 new
  cases. Build, selected test types, formatting and lint all pass.
- Negative control: the final new tests over unchanged production give 12 passes
  and 14 expected failures. Its build/types/format/lint pass; native exit is 1.
- Separate initial session/link selection: 214 passing tests across five manifest
  files. These overlap the later selection; do not sum them as unique coverage.
- No full 932-file canonical-manifest run is claimed. The working manifest has
  three unrelated pre-existing additions, kept out of this commit.
- Hash-bound static reviews cover the cache and final live harness. The latter
  requires current successful offline fixtures and an affirmative current-input
  decision before execution; static review is not user authorization or a test.
- Exact URL phase, GET/no-body/no-credential and request-budget checks precede
  native dispatch. Native `redirect: "error"` prevents any follow-up hop. Final
  unfiltered challenge checks precede visibility filtering; barriers stop, not
  trigger retries, alternate clients or challenge solving.
- Default 2 MB response cap, 2-second per-origin pacing, 15-second transport,
  20-second navigation and 45-second outer deadlines, 256 MiB heap, empty HOME/TMP.
  No page scripts/SafeJS, credentials, forms, sign-in, real TTY or remote browser.
- All 30 audited successful fixture/comparison/live process groups terminate;
  all six observed live request/socket pairs close. Offline guards record zero
  attempted I/O and installed kernel network denial. This is not a complete
  resource-allocation census or acceptance for separate runtime/credential gates.

## Evidence and retained failures

Evidence directory:
`node_modules/.cache/native-validation/native-link-activation-september16`.
The JSON report pins runtime manifests, fixture corpus, reviews, invocation
results, live response metadata and controlled comparison records. Decoded live
bodies and Markdown remain in that local evidence directory; report summaries do
not redistribute entire pages.

Earlier experiments are preserved: an unlisted-test setup refusal, initial
test-format/lint failures, the first rejected harness review, and a failed
synthetic redirect-body policy check. The latter exposed the existing classifier's
intentional exclusion of 3xx bodies; no production classifier was altered or
status spoofed. Final version03 instead refuses every redirect natively. A refused
redirect has observed status/selected headers but no ordinary wrapper body capture
or guaranteed classified barrier. Superseded version02 is not live acceptance.

The cache candidate has no fresh live run in this batch. Wider dynamic-site,
challenge/handoff, passkey/credential, SafeJS and interactive acceptance remain
open in `TASKS.md`. No push is performed.
