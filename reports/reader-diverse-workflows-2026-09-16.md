# Six publisher article workflows and selector stability

## Result

The initial six-publisher batch retrieves five articles and preserves one CarBuzz
link-selection failure. A separate source diagnostic and explicit corrected-
selector validation subsequently retrieve that same CarBuzz article. **The first
batch remains five completed extractions and one failed attempt, not six passes.**

Two independent content reviewers read all emitted Markdown for the six
retrieved articles. Their verdict is substantive article text available, not
verified facts, unrestricted access or complete original-page fidelity. Native
results remain `extracted-unverified`, `contentSuccess: null`, and partial.

## Every requested article

| Publisher | Exact target URL | Initial status/result | Markdown bytes | Separate follow-up |
| --- | --- | --- | ---: | --- |
| Business Insider | https://www.businessinsider.com/boeing-777x-jet-cabin-what-passengers-can-expect-2026-9 | 200→200; article text | 14824 | None |
| Good Housekeeping | https://www.goodhousekeeping.com/what-to-buy/home-products/a73494518/how-we-test-air-fryers/ | 200→200; article text | 12909 | None |
| Car and Driver | https://www.caranddriver.com/news/a73748838/kia-pv7-electric-van-revealed/ | 200→200; article text | 10538 | None |
| Bob Vila | https://www.bobvila.com/diy/september-must-do-projects/ | 200→200; article text | 14639 | None |
| CarBuzz | https://carbuzz.com/mazda-sports-car-chassis-patent-sept-14/ | Homepage200; no target request; selector not found | 0 | Corrected selector:200→200,12223 bytes |
| IGN | https://www.ign.com/articles/silent-hill-townfall-could-finally-restore-survival-horrors-missing-mystery | 200→200; article text | 15963 | None |

Each source URL is the corresponding HTTPS host root. All targets were actual
hyperlinks in previously captured native source, not guessed URLs or a new
ranking. The original selectors were verified through the native reader and
click path over saved source and synthetic destinations before the live batch.
That offline proof does not guarantee that a later live homepage is unchanged.

The initial actual-CLI batch runs on September16,2026 from09:12:27.892893UTC to
the final observed process exit at09:12:40.226UTC. Its11 GETs comprise five
source/target pairs and the failed CarBuzz source-only attempt. The separate
CarBuzz diagnostic contributes one GET; the corrected workflow contributes two
more, ending at09:22:53.754UTC. **Total:14 native HTTPS GETs,14 request closures,
14 socket closures, zero redirects and zero automatic retries.** There is one
explicitly planned corrected-selector rerun; it is not hidden in that count.

No credentials, page scripts, SafeJS, form submission, challenge solver, identity
change, alternate client or direct-target fallback is used. All observed child
process groups close; HOME/TMP stay empty. The original publisher-host allowance
remains spent and unchanged; the corrected operation has separate explicit scope
and an exclusive allowance rather than silently releasing the failed one.

## CarBuzz diagnosis and correction

The saved older markup has an `h3.display-card-title` with `title` on its headline
anchor. The original selector was `a[href="/mazda-sports-car-chassis-patent-sept-14/"][title]`.
The live failure reports no selected link and no click events, so no assertion
about destination accessibility can be made from that attempt alone.

A separate native source-only capture contains two anchors for the same target,
but zero matches for the original selector. Its headline is now
`h5.display-card-title`, with title metadata on the heading rather than the
anchor. Its body hash differs from the failed run, so this is a later observed
variant—not exact-body proof of what caused the original failure.

The first attempted structural correction still required `h3`. Offline03
correctly refuses it; its lifecycle check passes but workflow eligibility is
false. The live launcher rejects that proof before an allowance or process is
created. The next explicit selector avoids both incidental properties:

```css
.display-card-title > a[href="/mazda-sports-car-chassis-patent-sept-14/"]
```

Offline04 selects exactly one headline and completes native click navigation
over the captured source and a synthetic destination. One separate live CLI run
then clicks that same intended article and retrieves12223 Markdown bytes. No
different article, direct navigation or automatic fallback substitutes for the
failed request. The full emitted210-line article is reviewed separately from the
original failure. Title placement and heading-rank changes now have three
synthetic regressions in `src/research-link-content.test.ts`.

## Validation and changes

- Baseline618pass/0; final621pass/0 in eight explicit native-manifest files.
  Three new cases cover stale-selector refusal and both markup variants using
  the class-and-exact-href selector. These are regression coverage of existing
  behavior, not a claim that a production browser defect was fixed.
- Clean build, selected types, formatting and scoped lint pass. All2292 compiled
  production artifacts remain byte-identical to the live-tested runtime at
  `1034f53815b49c42bd14c1abfa8d2194540df6c3`.
- The isolated batch supervisor gains mandatory hash-bound evidence admission,
  consumed approval digests, version-independent publisher reservations and
  catchable-termination cleanup. Its18 mocked controls pass under kernel-denied
  network. They do not validate actual abnormal OS-signal delivery or guarantee
  cleanup after SIGKILL, host failure or unavailable storage.
- Earlier fixture assertions about header-object prototypes and Markdown marker
  escaping failed and were corrected. Their artifacts remain; they are not
  website failures or final admission evidence. The h3-specific offline refusal
  and its denied live preflight also remain recorded.

## Content and acceptance limits

Full review here means all saved extracted Markdown, not a comparison against
every original HTML node, rendered image, video or interactive section.
Navigation, promotions, affiliate material, recommendations and account widgets
can remain. Business Insider/Good Housekeeping access metadata is unverified;
readable returned text does not establish general unrestricted access. Product,
financial, home-maintenance, safety and other factual claims are not endorsed.

The commands export extracted text and response hashes, not complete live bodies
for all article workflows. Only the separate CarBuzz diagnostic saves its full
bounded source capture. Reader projection does not prove raw-script behavior,
full CSS/rendering, dynamic applications or authenticated interactions.

Every original100-entry verdict and measurement remains unchanged in
`reports/agent-citation-revalidation-v2.md`. That corpus is citation-derived,
not global agent page-visit telemetry. These are additional task-level checks.

The adjacent JSON contains exact measurements, review scopes and93 evidence
hashes. Local evidence is in
`node_modules/.cache/native-validation/reader-diverse-workflows-september16`.
No push is performed. Full rendering, dynamic sites, actual SafeJS, access
handoff, credentials/passkeys and real-input gates remain open in `TASKS.md`;
the overall browser-improvement goal stays active.
