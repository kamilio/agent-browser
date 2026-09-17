# Native-first reader fallback — September 17, 2026

Opt-in native-first fallback is implemented and tested on saved responses and
three fresh entry-page checks. This is a content-retrieval milestone, not broad
browser compatibility or completion of the overall goal.

## Change and limitations

The opt-in research CLI strategy `native-reader-fallback-v1` tries the existing
native loader first. Only an HTTP 200 response with exactly one explicit HTML
Content-Type and a native loader unsupported/resource-limit error permits a
bounded reader attempt on the same bytes. No second request, larger limits,
script execution, credential access or new runtime dependency is introduced.
Successful empty native documents and later extraction errors do not trigger it.
Normal network/challenge/rate-limit classification and handoff remain in force.

This reuses native inline CSS handling rather than adding a second CSS engine.
On the captured Tableau iframe, native mode correctly yields empty content;
forced reader mode exposes a stylesheet-hidden 138-byte error template. The
strategy keeps native empty output. It does not make the visualization work.

Defaults and explicit reader workflows remain unchanged. The strategy currently
supports default-profile whole-document extraction, not reader policies, content
focus, selection/discovery, long documents, JSON pointers or text-prefix fallback.
Strategy-tagged captures are explicitly rejected by existing replay/recovery
admission; strategy-aware replay is not implemented. Native success is not a
best-content decision and may lack reader-specific source enrichments.

The selected tree initializes once. Typed cancellation reasons are preserved;
secondary cleanup errors cannot replace the primary initialization/abort error.
Failed intermediate trees close. Source bytes remain caller-owned and unmodified.

## Final isolated validation

Clean release03 is baseline d0548e7 plus six source/test overlays. All 1601 source
and 2380 compiled pins verify. Selected tests: 2732 passed, zero failed, across
38 explicit native files, including 237 new cases (115 loader,98 CLI,24 admission).
Build and selected-type checks pass; formatting/lint pass for the six overlays
only. This is NOT a full-suite pass: the canonical 1000-entry manifest includes22
files absent from this isolated commit-plus-overlays tree. All22 paths exist in
the dirty workspace, whose1003-entry manifest has zero missing files; that
workspace is not the qualified runtime. A separately run172-case admission
diagnostic remains171/1 with all outcomes matching its prior
baseline. Its known heading-options identity assertion is not fixed by this work.

Feature/admission absence produces74 failures on old CLI/admission code (48pass);
the two review-found cancellation/cleanup defects produce28 failures on the old
helper (87pass). Every failing regression is present and passing in release03.
Release01's escaped-Markdown expectation and lint failures, the original review,
and all intermediate runs remain retained, not rewritten into passes.

## Saved-response comparison — not a new crawl

110 exact saved responses, each through native, reader and strategy modes, produce
330 mocked requests and zero network requests. All218 prior native/reader result
projections match. Final checks take15.880 seconds in this isolated run; that is
not a live browser speed benchmark. Resources close and network guards record no
attempts. Strategy selects reader13 times and native97 times.

| Outcome | Native | Forced reader | Strategy |
| --- | ---: | ---: | ---: |
| Nonempty, unverified | 58 | 72 | 71 |
| Empty | 7 | 6 | 7 |
| Loader/extraction failure | 15 | 2 | 2 |
| Semantic barrier | 20 | 20 | 20 |
| HTTP failure | 10 | 10 | 10 |

The13 nonempty recoveries are Forbes,Target,HomeDepot,Facebook,Instagram,NerdWallet,
GoodHousekeeping,PCMag,CarAndDriver,Pinterest,MayoClinic,WhoWhatWear andCarbuzz.
These are NOT13 newly working sites. Their historical main-focus reviews were
9 useful-source-content,2 navigation-only,1 login-required and1 other-failure;
those reviews are context, not a fresh whole-document audit of this strategy.
The original100-entry33-useful/67-other verdicts remain unchanged.

## Source-only Tableau follow-up

One additional exact native GET to the iframe's literal PreBootstrap.min.js asset
at07:00:52.558 UTC returns200 and73037decoded bytes. The pinned runtime is d0548e7,
before this feature; reader refuses JavaScript MIME and emits no article content.
The asset is inspected as inert bytes, never executed. Source shows configuration
coming from a computed session POST followed by additional bootstrap modules;
no POST or downstream request is made, and no complete static benchmark/export
URL is identified. Zero numerical benchmark rows are established. Optional auth
branches are not evidence that this captured public view requires credentials.

## Fresh native content checks

3 separately scoped entry-page checks make3 real GET requests after exact historical-response
proofs. Each uses the final clean candidate, the same explicit strategy/capture
arguments, and unchanged2MB response/256KB extraction limits. No redirects, retries,
subresources, scripts, SDK, credentials or alternate browser/client are used.
All recorded transport/session/document/process closure checks pass.

| Site | HTTP | Selected mode | Markdown bytes | Reviewed content |
| --- | ---: | --- | ---: | --- |
| www.nerdwallet.com | 200 | reader | 44656 | useful-source-content |
| www.pcmag.com | 200 | reader | 48340 | useful-source-content |
| www.mayoclinic.org | 200 | reader | 22614 | useful-source-content |

- **www.nerdwallet.com:** captured2026-09-17T07:52:47.261Z. News/article listings and descriptive resource text survive extraction. Linked articles were not fetched; responsive duplicates and promotional/navigation material remain. No financial facts or product terms were verified. Review scope: Full source token scan with thirteen normalized paragraph-presence checks and five heading/destination matches; manual review sampled five article heading pairs and two paragraph instances, not full-page semantics or computed visibility.
- **www.pcmag.com:** captured2026-09-17T07:58:39.133Z. Original-source headline, news/review/how-to article cards, authors, and editorial teaser survive extraction. Heavy surrounding category navigation and footer material remain; sampled pick links include navigation and are not counted alone as substantive evidence. Review scope: Entire captured source token inventory and date-pattern scan; selected original source blocks compared to entire normalized extraction. Human review sampled, not exhaustive. Hidden hints are source-only, not rendered visibility. Source dates are unverified publisher labels, not capture dates..
- **www.mayoclinic.org:** captured2026-09-17T07:58:41.117Z. Original-source institutional headings, descriptive international-service/location paragraphs, and three named campus links survive extraction. This is a sparse institutional landing page with extensive menus/footer and directories, not a recovered clinical article or article listing. Review scope: Entire captured source token inventory and date-pattern scan; selected original source blocks compared to entire normalized extraction. Human review sampled, not exhaustive. Hidden hints are source-only, not rendered visibility. Source dates are unverified publisher labels, not capture dates..

These are source-content checks, not factual verification, product/financial/
medical advice, full article retrieval or functional login/shopping/search tests.
Source publication dates are separate from capture timestamps. Full per-case
metadata and evidence paths are in the adjacent JSON.

## Remaining work

Broader website task success, content fidelity, speed, dynamic SafeJS/runtime,
external styling, access/CAPTCHA handling, real credentials/passkeys/devices and
unfinished research remain open. This milestone does not complete the browser.

## Evidence and publication

See `RESEARCH-NATIVE-FALLBACK.md` for the CLI contract and the adjacent JSON for
measured results. Private evidence is retained under
`node_modules/.cache/native-validation/stylesheet-reader-review-september17/`
and the two separately sealed live evidence lanes named in JSON. Final publication
verifies all source pins against the focused commit while preserving pre-existing
uncommitted work. No push is performed.
