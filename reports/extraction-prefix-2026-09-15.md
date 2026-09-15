# Bounded extraction prefixes — September 15, 2026

## Outcome

Added explicit `--output-limit-policy text-prefix-v1` to reader Markdown
research, with a matching core/API option. It recovers bounded plain text from
an already admitted semantic tree when rich Markdown or final extraction JSON
exceeds the output cap. Defaults remain strict. Fitting results are unchanged.
No network, loader, metadata, intermediate, structure or unsupported error is
converted into a successful extraction. See `EXTRACTION-PREFIX.md` for usage.

**This does not fix Kateminimalist's useful-content retrieval.** The saved page
is labelled `text/markdown` but contains a full HTML document. Recovery returns
**245353 Markdown bytes /255995 serialized extraction bytes**, with explicit
truncation, but inspection shows mainly literal HTML, scripts and CSS. It is
not credited as useful source content or a working website. This newly exposed
MIME mismatch is the next root cause, not something hidden by a nonempty count.

A separate isolated diagnostic changes only the copied response's Content-Type
to HTML. The same body then produces **34787 bytes** through the native HTML
reader, without fallback. Beginning/middle/end inspection finds category
navigation, storefront promotional/product/service text and footer information;
zero counters, promotional dates/prices and source placeholders are unverified.
This is **diagnostic-only**, not production sniffing, a changed historical receipt,
another website request, rendered shopping or transactional acceptance.

## Bounds and representation

The helper projects admitted text iteratively, preserves inline adjacency and
block separators, and emits four-space-indented literal text. It does not create
partial active links, raw HTML or unclosed fenced blocks. It fits the complete
serialized extraction including metadata, JSON escapes, Unicode and indentation;
existing surrogate pairs are not split. It records policy, representation,
logical source/retained code units, truncation and the original typed trigger.
No room for meaningful text means the original failure remains. Explicit plain
projection can fit completely after dropping rich formatting; metadata still
records the changed representation. Prefixes can omit important qualifications.

Static review found a post-fit reporting edge: replacing `?x` with `?redacted`
adds seven bytes. Two isolated negative controls on release01 produce **256007
bytes**. Final positive-growth reservation makes the HTML and Markdown cases
**256000 bytes** after redaction and admission serialization, preserving captures.
The actual internal trigger truthfully records255993 bytes for that URL; the
outer research cap remains256000. Strict defaults avoid this new reservation.

## Validation

- Baseline: **2065 pass /1 fail**, 28 explicitly selected native files.
- Final: **2156 pass /1 fail**, 30 files, **91 new passing tests**. Every baseline
  test position/name/status is preserved. The unchanged failure is the existing
  replay-row-flag rejection expectation in `research-table-rows-cli.test.ts`.
  It is not discarded, reclassified as passed or fixed in this focused change.
- Build, narrowed types, formatting and lint pass. Native suite exit remains1
  because of that baseline failure; this is not an all-green/full-manifest claim.
  Canonical manifest has895 entries; original three working-only entries remain.
- Tests cover byte budgets, UTF16 boundaries, inflation/escaping, literal code,
  selection and omissions, structure/metadata failures, strict compatibility,
  CLI validation, request count, closure, capture/serialization and access status.
- Final saved-source comparison: **95 strict cases unchanged; 94 requested-prefix
  cases unchanged; one output recovered**. Full content/diagnostic metadata hashes
  are compared after removing instance document/scope IDs. Actual serialized byte
  lengths remain recorded and individually bounded, not compared as stable IDs.
- Final pairing is285 mocked navigations in190 child groups. The initial
  candidate adds190 navigations /95 groups; four query controls and one forced-MIME
  diagnostic bring the total to **480 mocked navigations, zero HTTP**. All285
  saved-body groups record terminal cleanup. Three direct diagnostic invocations
  return zero with empty I/O guards and closed native metrics; their subprocess
  PIDs were not individually retained. No page scripts, SafeJS or credentials.
- Initial two helper-test lint errors were fixed with template-literal spelling.
  The first aggregator mistakenly compared instance-dependent raw JSON lengths;
  correcting that bookkeeping did not change browser code or hide a content hash
  mismatch. Original runs, review, negative controls and diagnostics are retained.

Five original response bodies are unavailable: Google Play, TechRadar, Tom's
Guide, CNBC and Comparor. They remain original size/timeout failures, not passes.
Stored response headers omit `cf-mitigated`: The Spruce, Serious Eats and Byrdie
reconstruct as HTTP failures rather than their original live semantic barriers.
Original live records remain authoritative; this is not a bypass or a new result.

## Next work

Implement narrowly validated, explicit HTML-as-Markdown recovery with source-MIME
provenance and controls for genuine Markdown containing HTML/code examples.
Do not couple MIME sniffing silently to output recovery. Follow with deep-page
and agent-task checks rather than claiming homepage access is full functionality.
Preserve unfinished response-header work; SafeJS contract, credential/passkey,
interactive and access-restriction gates remain open. No push accompanies this
change, and the broader browser goal remains active.

## Saved-body matrix

Columns are outcome /Markdown bytes. These are offline source reconstructions,
not new live requests or useful-content rankings.

| Priority | Host | Strict | Requested prefix | Comparison |
| ---: | --- | --- | --- | --- |
| 1 | `www.youtube.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged (document-reference-normalized metadata) |
| 2 | `en.wikipedia.org` | extracted-unverified / 57367 | extracted-unverified / 57367 | Unchanged (document-reference-normalized metadata) |
| 3 | `www.forbes.com` | extracted-unverified / 48414 | extracted-unverified / 48414 | Unchanged (document-reference-normalized metadata) |
| 4 | `www.healthline.com` | extracted-unverified / 8903 | extracted-unverified / 8903 | Unchanged (document-reference-normalized metadata) |
| 5 | `www.walmart.com` | extracted-unverified / 6310 | extracted-unverified / 6310 | Unchanged (document-reference-normalized metadata) |
| 6 | `www.edmunds.com` | http-failure / 475 | http-failure / 475 | Unchanged (document-reference-normalized metadata) |
| 7 | `www.target.com` | extracted-unverified / 8441 | extracted-unverified / 8441 | Unchanged (document-reference-normalized metadata) |
| 8 | `www.homedepot.com` | extracted-unverified / 36237 | extracted-unverified / 36237 | Unchanged (document-reference-normalized metadata) |
| 9 | `www.kbb.com` | extracted-unverified / 25696 | extracted-unverified / 25696 | Unchanged (document-reference-normalized metadata) |
| 10 | `www.bestbuy.com` | extracted-unverified / 43 | extracted-unverified / 43 | Unchanged (document-reference-normalized metadata) |
| 11 | `www.ebay.com` | http-failure / 242 | http-failure / 242 | Unchanged (document-reference-normalized metadata) |
| 12 | `www.webmd.com` | extracted-unverified / 23679 | extracted-unverified / 23679 | Unchanged (document-reference-normalized metadata) |
| 13 | `www.trustpilot.com` | http-failure / 178 | http-failure / 178 | Unchanged (document-reference-normalized metadata) |
| 14 | `www.reddit.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 15 | `www.amazon.com` | extracted-unverified / 25385 | extracted-unverified / 25385 | Unchanged (document-reference-normalized metadata) |
| 16 | `www.businessinsider.com` | extracted-unverified / 22734 | extracted-unverified / 22734 | Unchanged (document-reference-normalized metadata) |
| 17 | `www.cnet.com` | extracted-unverified / 50326 | extracted-unverified / 50326 | Unchanged (document-reference-normalized metadata) |
| 18 | `www.linkedin.com` | extracted-unverified / 20871 | extracted-unverified / 20871 | Unchanged (document-reference-normalized metadata) |
| 19 | `www.lemon8-app.com` | extracted-unverified / 1466 | extracted-unverified / 1466 | Unchanged (document-reference-normalized metadata) |
| 20 | `www.consumerreports.org` | extracted-unverified / 32338 | extracted-unverified / 32338 | Unchanged (document-reference-normalized metadata) |
| 21 | `pmc.ncbi.nlm.nih.gov` | http-failure / 179 | http-failure / 179 | Unchanged (document-reference-normalized metadata) |
| 22 | `medium.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 23 | `www.wikihow.com` | extracted-unverified / 31599 | extracted-unverified / 31599 | Unchanged (document-reference-normalized metadata) |
| 24 | `www.etsy.com` | extracted-unverified / 5501 | extracted-unverified / 5501 | Unchanged (document-reference-normalized metadata) |
| 25 | `www.lowes.com` | extracted-unverified / 3161 | extracted-unverified / 3161 | Unchanged (document-reference-normalized metadata) |
| 26 | `www.cars.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 27 | `www.facebook.com` | extracted-unverified / 3993 | extracted-unverified / 3993 | Unchanged (document-reference-normalized metadata) |
| 28 | `www.instagram.com` | extracted-unverified / 1967 | extracted-unverified / 1967 | Unchanged (document-reference-normalized metadata) |
| 29 | `www.nytimes.com` | extracted-unverified / 20494 | extracted-unverified / 20494 | Unchanged (document-reference-normalized metadata) |
| 30 | `www.nerdwallet.com` | extracted-unverified / 44516 | extracted-unverified / 44516 | Unchanged (document-reference-normalized metadata) |
| 31 | `www.tripadvisor.com` | http-failure / 44 | http-failure / 44 | Unchanged (document-reference-normalized metadata) |
| 32 | `www.yahoo.com` | extracted-unverified / 15236 | extracted-unverified / 15236 | Unchanged (document-reference-normalized metadata) |
| 33 | `www.goodrx.com` | http-failure / 0 | http-failure / 0 | Unchanged (document-reference-normalized metadata) |
| 34 | `finance.yahoo.com` | extracted-unverified / 66558 | extracted-unverified / 66558 | Unchanged (document-reference-normalized metadata) |
| 35 | `www.thespruce.com` | http-failure / 42 | http-failure / 42 | Unchanged (document-reference-normalized metadata) |
| 37 | `www.tastingtable.com` | extracted-unverified / 30911 | extracted-unverified / 30911 | Unchanged (document-reference-normalized metadata) |
| 38 | `www.cargurus.com` | extracted-unverified / 28831 | extracted-unverified / 28831 | Unchanged (document-reference-normalized metadata) |
| 39 | `www.google.com` | extracted-unverified / 1018 | extracted-unverified / 1018 | Unchanged (document-reference-normalized metadata) |
| 40 | `www.quora.com` | extracted-unverified / 58 | extracted-unverified / 58 | Unchanged (document-reference-normalized metadata) |
| 41 | `www.tiktok.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged (document-reference-normalized metadata) |
| 42 | `www.goodhousekeeping.com` | extracted-unverified / 27707 | extracted-unverified / 27707 | Unchanged (document-reference-normalized metadata) |
| 43 | `www.pcmag.com` | extracted-unverified / 47028 | extracted-unverified / 47028 | Unchanged (document-reference-normalized metadata) |
| 45 | `www.alibaba.com` | extracted-unverified / 5333 | extracted-unverified / 5333 | Unchanged (document-reference-normalized metadata) |
| 46 | `www.caranddriver.com` | extracted-unverified / 27740 | extracted-unverified / 27740 | Unchanged (document-reference-normalized metadata) |
| 47 | `www.justanswer.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 48 | `www.liberia.ubuy.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 49 | `www.medicalnewstoday.com` | extracted-unverified / 13664 | extracted-unverified / 13664 | Unchanged (document-reference-normalized metadata) |
| 50 | `www.pinterest.com` | extracted-unverified / 98 | extracted-unverified / 98 | Unchanged (document-reference-normalized metadata) |
| 51 | `www.angi.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 52 | `my.clevelandclinic.org` | extracted-unverified / 24098 | extracted-unverified / 24098 | Unchanged (document-reference-normalized metadata) |
| 53 | `www.bobvila.com` | extracted-unverified / 27611 | extracted-unverified / 27611 | Unchanged (document-reference-normalized metadata) |
| 54 | `www.bbb.org` | extracted-unverified / 2040 | extracted-unverified / 2040 | Unchanged (document-reference-normalized metadata) |
| 57 | `www.seriouseats.com` | http-failure / 42 | http-failure / 42 | Unchanged (document-reference-normalized metadata) |
| 58 | `www.rtings.com` | extracted-unverified / 15275 | extracted-unverified / 15275 | Unchanged (document-reference-normalized metadata) |
| 59 | `carinterior.alibaba.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged (document-reference-normalized metadata) |
| 60 | `www.ziprecruiter.com` | extracted-unverified / 5106 | extracted-unverified / 5106 | Unchanged (document-reference-normalized metadata) |
| 61 | `scienceinsights.org` | extracted-unverified / 3123 | extracted-unverified / 3123 | Unchanged (document-reference-normalized metadata) |
| 62 | `engineerfix.com` | extracted-unverified / 3813 | extracted-unverified / 3813 | Unchanged (document-reference-normalized metadata) |
| 63 | `grokipedia.com` | extracted-unverified / 1515 | extracted-unverified / 1515 | Unchanged (document-reference-normalized metadata) |
| 64 | `goto.walmart.com` | http-failure / 84 | http-failure / 84 | Unchanged (document-reference-normalized metadata) |
| 65 | `www.oreateai.com` | extracted-unverified / 114 | extracted-unverified / 114 | Unchanged (document-reference-normalized metadata) |
| 66 | `biologyinsights.com` | extracted-unverified / 3478 | extracted-unverified / 3478 | Unchanged (document-reference-normalized metadata) |
| 67 | `www.macys.com` | http-failure / 251 | http-failure / 251 | Unchanged (document-reference-normalized metadata) |
| 68 | `www.merriam-webster.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 69 | `www.collinsdictionary.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 70 | `wellnd.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 71 | `www.wayfair.com` | http-failure / 0 | http-failure / 0 | Unchanged (document-reference-normalized metadata) |
| 72 | `www.yelp.com` | http-failure / 44 | http-failure / 44 | Unchanged (document-reference-normalized metadata) |
| 73 | `wellwhisk.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 74 | `www.mayoclinic.org` | extracted-unverified / 22565 | extracted-unverified / 22565 | Unchanged (document-reference-normalized metadata) |
| 76 | `www.whowhatwear.com` | extracted-unverified / 103618 | extracted-unverified / 103618 | Unchanged (document-reference-normalized metadata) |
| 77 | `apps.apple.com` | extracted-unverified / 17593 | extracted-unverified / 17593 | Unchanged (document-reference-normalized metadata) |
| 78 | `hometosight.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 79 | `www.reviewed.com` | extracted-unverified / 12755 | extracted-unverified / 12755 | Unchanged (document-reference-normalized metadata) |
| 80 | `wallethub.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 81 | `www.nordstrom.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged (document-reference-normalized metadata) |
| 82 | `manuals.plus` | extracted-unverified / 9271 | extracted-unverified / 9271 | Unchanged (document-reference-normalized metadata) |
| 83 | `dictionary.cambridge.org` | extracted-unverified / 22018 | extracted-unverified / 22018 | Unchanged (document-reference-normalized metadata) |
| 84 | `www.outdoorgearlab.com` | extracted-unverified / 22996 | extracted-unverified / 22996 | Unchanged (document-reference-normalized metadata) |
| 85 | `www.kohls.com` | http-failure / 211 | http-failure / 211 | Unchanged (document-reference-normalized metadata) |
| 86 | `hub.sivo.it.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 87 | `www.bankrate.com` | extracted-unverified / 23689 | extracted-unverified / 23689 | Unchanged (document-reference-normalized metadata) |
| 88 | `www.expedia.com` | http-failure / 0 | http-failure / 0 | Unchanged (document-reference-normalized metadata) |
| 89 | `kateminimalist.com` | failure / 0 | extracted-unverified / 245353 | Output recovered; literal HTML, not useful-content pass |
| 90 | `health.clevelandclinic.org` | extracted-unverified / 26548 | extracted-unverified / 26548 | Unchanged (document-reference-normalized metadata) |
| 91 | `www.aeanet.org` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 92 | `www.amazon.co.uk` | extracted-unverified / 21904 | extracted-unverified / 21904 | Unchanged (document-reference-normalized metadata) |
| 93 | `thelivinglook.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged (document-reference-normalized metadata) |
| 94 | `carbuzz.com` | extracted-unverified / 26307 | extracted-unverified / 26307 | Unchanged (document-reference-normalized metadata) |
| 95 | `www.ign.com` | extracted-unverified / 24019 | extracted-unverified / 24019 | Unchanged (document-reference-normalized metadata) |
| 96 | `www.ubuy.mq` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged (document-reference-normalized metadata) |
| 97 | `runrepeat.com` | extracted-unverified / 9805 | extracted-unverified / 9805 | Unchanged (document-reference-normalized metadata) |
| 98 | `www.cosmopolitan.com` | extracted-unverified / 22986 | extracted-unverified / 22986 | Unchanged (document-reference-normalized metadata) |
| 99 | `www.byrdie.com` | http-failure / 42 | http-failure / 42 | Unchanged (document-reference-normalized metadata) |
| 100 | `www.ulta.com` | extracted-unverified / 55232 | extracted-unverified / 55232 | Unchanged (document-reference-normalized metadata) |

## Evidence

- Runtime source parent: `52991dedec9713fd8140ee7d1913b7ba31662c71`.
- Final comparison SHA256: `5e63556361e9040e3a7ba0c94ca94d92467cab5e55a4743c996705ffea9c32ae`.
- Final validation SHA256: `1cc246dd56c9f7459ed17adcf3cc4f680f8f768ddf1e8c4fc91fc4f047ae7cd5`.
- Recovered literal-prefix SHA256: `a3166293971b5c7504f170eda12776527cbcad3beba28640439987f6ffd64009`.
- Diagnostic HTML-reader SHA256: `8fb6191f2ba38dd7f187ec4b8034fec3e65175936c67dfbd1827e8a7f152ad42`.
- Local lane: `node_modules/.cache/native-validation/extraction-prefix-september15`; source/compiled pins, scopes, original
  reports, private retained content, reviews, closure records and artifact ledger.
- Machine-readable companion: `reports/extraction-prefix-2026-09-15.json`.
