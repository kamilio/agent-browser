# Reader names and chart-source diagnosis — September 16, 2026

## Result

The native reader dropped authored naming metadata from preserved role-bearing
elements. Google Play's three Top charts category buttons consequently had empty
snapshot names. Preserve bounded literal aria-label/aria-labelledby on anchors
and preserved nonblank-role elements; reuse existing snapshot naming behavior.
No chart rows, market data, roles, nodes or script interactions are invented.

Parent runtime: `a09dbf8368bca1e9a8639951f50071fefe9e4f97`. The clean candidate
overlays only `src/research-loader.ts`, the new `src/research-reader-names.test.ts`,
and related expectations in `src/research-aria-table.test.ts`. Dirty root runtime
is not used. `READER-NAMES.md` documents the exact retention and budget contract.

## Validation

- Parent:576 passing tests in10 selected native-manifest files.
- Final:724 passing,0 failing in11 files, including148 new naming cases.
- Production build, formatting, new-test/production lint and both owned-test
  typechecks pass. This is not a full-manifest run.
- Selected-suite typechecking retains the parent's identical error at
  `src/snapshot.test.ts:83`; it does not pass. The adjacent ARIA-table test retains
  two existing lint findings, noInferrableTypes/useTemplate. Parent/candidate
  diagnostics match after normalizing changed line numbers and timings. Neither
  unrelated issue is repaired or hidden.
- Final tests against old production:113 pass and83 expected failures in2 files.
  Of those failures,74 are new naming cases and9 are updated ARIA expectations;
  preserving a literal name still does not promote a role to table metadata.
- First candidate:713 pass/11 fail, plus formatting failure. Nine failures were
  expectations for intentionally discarded names under the old contract; two
  incorrectly expected xmp text to be omitted. Corrected those tests without
  changing xmp behavior. Original failed results are retained.
- Static production review found no actionable defect. Source and compiled files
  are pinned and checked before the saved-body and live executions.

## Historical and fresh Google Play comparisons

Both comparisons load a complete captured body with the native long-v1 reader,
raw-source separation, inline source visibility and UTF-8 fallback. Each compares
the clean parent against the final candidate, without network or page scripts.

| Body | Bytes | Old snapshot names | Candidate snapshot names | Markdown bytes |
| --- | ---: | --- | --- | ---: |
| September15 retained capture | 2535808 | three empty names | Top free, Top grossing, Top paid | 27716 |
| September16 03:24 UTC capture | 2708333 | three empty names | Top free, Top grossing, Top paid | 29972 |

The three exact IDs remain unique and each scoped snapshot contains one button.
Ordinary Markdown hashes match between old and new for each body. Historical and
fresh page bodies differ; no cross-capture identity or broad speed claim is made.
All four isolated comparisons close their trees/process groups, record zero
network attempts and run under a kernel network denial. The initial separate
baseline reproduction also closes and records no network attempts.

The fresh capture uses the actual compiled native research-browser CLI against
`https://play.google.com/store/games`: one GET, no redirects/retries, status200,
one closed request/socket pair and a closed native transport. It retains the
complete receipt/body for independent replay. Empty HOME/TMP, no credentials,
page scripts, SafeJS, real input, alternate browser/client or challenge solver.
Native4MB body limits and public-network policy remain in force.

**The live command still exits1 with empty-extraction/contentSuccess:false**:
its requested heading outline is empty. The separate snapshot checks demonstrate
naming recovery; they do not relabel that outcome as a successful heading test.
Both fresh offline loads additionally validate the original empty-outline receipt.

The original live supervisor's post-capture assertion wrongly expected
request.host to hold the hostname; native transport records a pinned public IP
there and keeps play.google.com in the HTTP authority. A separate offline audit
verifies both, with no repeated navigation or receipt rewrite. The diagnostic
observer is not a pre-dispatch allowlist; native network policy is authoritative.

## Missing source data is not a reader defect

Independent static inventories of both Google captures find a4582-byte Top charts
section with the three authored category labels,9 numbered placeholders, and no
app links/images. Their category child labels are aria-hidden. The literal source
has no app/rank associations to recover. No page configuration or endpoint is
mined, and script-driven control activation remains untested.

The separately reviewed September15 CNBC body has two tables, both with literally
empty tbody elements: Most Active and Unusual Volume. Whole-source scans find no
tr/td/th elements. Matching historical Markdown retains the headings and table
boundaries. No row-loss defect is established. This does not diagnose the previous
turn's different September16 CNBC body or validate financial data.

## Relation to the 100-page request

`reports/agent-citation-revalidation-v2.md` retains the complete100-entry checklist
and original individual reviews. This follow-up does not rewrite those verdicts
or claim another100-site live sweep on the new runtime. The frozen list is a
citation-derived proxy, not measured global agent browsing traffic; root entry
pages are not necessarily the deep pages agents cite.

Original reviewed totals:33 useful-source-content,19 navigation-only,23
consent-or-access,3 login-required,6 empty,8 HTTP errors,2 transport failures and6
other failures. All100 were attempted; all100 did not pass. Broader dynamic-site,
challenge/human-handoff, SafeJS, credential/passkey and interactive gates stay open.

## Evidence

Local lane: `node_modules/.cache/native-validation/chart-source-diagnostics-september16`.
The accompanying JSON pins source changes, test summaries, all five isolated
probe results, the single live capture, complete body/receipt hashes, static
inventories and reviewer findings. It preserves original failed checks separately.
Raw bodies are local evidence, not committed source fixtures. Historical reports
and sealed lanes remain unchanged. No push is performed.
