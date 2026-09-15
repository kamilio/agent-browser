# Selected response-header evidence — September 15, 2026

## Result

New primary-response summaries retain bounded, whole fields for Content-Type,
Content-Length, Content-Encoding, CF-Mitigated and Retry-After. The explicit
`selected-response-headers-v1` marker records omitted selected fields without
clipping a conflicting tail or claiming that all response headers were captured.
Unknown/sensitive headers stay excluded. See `RESEARCH-HEADERS.md` for the contract.

This fixes **future capture fidelity**, not historical missing evidence or a
website access restriction. Seventeen saved live receipts record confirmed
Cloudflare header evidence but omit the source header. Three consequently lose
the barrier category when rebuilt from stored headers alone: The Spruce,
Serious Eats and Byrdie. No historical header value or measurement was rewritten.

## Validation

- **3269 selected native tests pass; three unchanged baseline failures**.
  All **271 new tests pass** across 44 selected files.
  Build, narrowed types, formatter and lint pass. Baseline:2998pass/3fail.
- Existing failures are two body-capture post-extraction expectations and one
  replay-row-flag expectation; they remain visible rather than fixed or excluded.
- Native synthetic cases cover exact values, conflicts, whole-field omissions,
  sensitive-header exclusion, legacy/new admission, serialization hooks/proxies,
  detached emitted evidence, default serialization bounds and barrier rejection.
- **190 paired cases unchanged**:95 strict and95 existing explicit-MIME cases.
  Headers/markers round-trip through receipt admission; content, reader metadata
  and classifications match the parent after the declared metadata difference.
- **380 mocked navigations /190 closed child groups /zero HTTP requests**.
  Source/compiled hashes, original body/receipt pins, I/O guards and bounded
  extraction outputs are verified. Five original missing bodies remain unavailable.

One earlier candidate harness child stopped on a plain-object versus
null-prototype-record comparison, despite equal header data. Its failed artifacts
remain intact; it was reaped with empty I/O guards. The corrected harness compares
own fields and unchanged arrays, without changing production code. Including
that stopped first-policy attempt gives381 saved-body mock navigations and191
closed child groups total; it is not counted as a successful paired case.

Static review caught a validate-one-graph/serialize-another gap and a proxy check
ordering defect. Explicit-marker default reports now emit the detached graph
actually validated; hooks are rejected before execution. This does not impose
long-profile depth/property caps on previously uncapped default emission.
Long-profile and replay admission limits remain unchanged.

## Remaining limits

Selection and whole-field omission remain partial evidence. A header that was
never saved cannot be inferred from an old diagnostic. A challenge header is
not content-replay permission, and retaining Retry-After does not schedule a retry.
The network helper uses trusted transport records, not a hostile-Proxy sandbox.
No fresh site, authentication, runtime-script or CAPTCHA acceptance is claimed.

## Saved-source coverage

Both policies below are unchanged relative to the parent. Counts describe
extraction, not a new content-usefulness review or current site availability.

| Rank | Host | Strict | Explicit MIME | MIME Markdown bytes | Legacy CF header missing |
| --- | --- | --- | --- | ---: | --- |
| 1 | www.youtube.com | empty-extraction | empty-extraction | 0 | no |
| 2 | en.wikipedia.org | extracted-unverified | extracted-unverified | 57367 | no |
| 3 | www.forbes.com | extracted-unverified | extracted-unverified | 48414 | no |
| 4 | www.healthline.com | extracted-unverified | extracted-unverified | 8903 | no |
| 5 | www.walmart.com | extracted-unverified | extracted-unverified | 6310 | no |
| 6 | www.edmunds.com | http-failure | http-failure | 475 | no |
| 7 | www.target.com | extracted-unverified | extracted-unverified | 8441 | no |
| 8 | www.homedepot.com | extracted-unverified | extracted-unverified | 36237 | no |
| 9 | www.kbb.com | extracted-unverified | extracted-unverified | 25696 | no |
| 10 | www.bestbuy.com | extracted-unverified | extracted-unverified | 43 | no |
| 11 | www.ebay.com | http-failure | http-failure | 242 | no |
| 12 | www.webmd.com | extracted-unverified | extracted-unverified | 23679 | no |
| 13 | www.trustpilot.com | http-failure | http-failure | 178 | no |
| 14 | www.reddit.com | semantic-barrier | semantic-barrier | 0 | no |
| 15 | www.amazon.com | extracted-unverified | extracted-unverified | 25385 | no |
| 16 | www.businessinsider.com | extracted-unverified | extracted-unverified | 22734 | no |
| 17 | www.cnet.com | extracted-unverified | extracted-unverified | 50326 | no |
| 18 | www.linkedin.com | extracted-unverified | extracted-unverified | 20871 | no |
| 19 | www.lemon8-app.com | extracted-unverified | extracted-unverified | 1466 | no |
| 20 | www.consumerreports.org | extracted-unverified | extracted-unverified | 32338 | no |
| 21 | pmc.ncbi.nlm.nih.gov | http-failure | http-failure | 179 | no |
| 22 | medium.com | semantic-barrier | semantic-barrier | 0 | yes |
| 23 | www.wikihow.com | extracted-unverified | extracted-unverified | 31599 | no |
| 24 | www.etsy.com | extracted-unverified | extracted-unverified | 5501 | no |
| 25 | www.lowes.com | extracted-unverified | extracted-unverified | 3161 | no |
| 26 | www.cars.com | semantic-barrier | semantic-barrier | 0 | yes |
| 27 | www.facebook.com | extracted-unverified | extracted-unverified | 3993 | no |
| 28 | www.instagram.com | extracted-unverified | extracted-unverified | 1967 | no |
| 29 | www.nytimes.com | extracted-unverified | extracted-unverified | 20494 | no |
| 30 | www.nerdwallet.com | extracted-unverified | extracted-unverified | 44516 | no |
| 31 | www.tripadvisor.com | http-failure | http-failure | 44 | no |
| 32 | www.yahoo.com | extracted-unverified | extracted-unverified | 15236 | no |
| 33 | www.goodrx.com | http-failure | http-failure | 0 | no |
| 34 | finance.yahoo.com | extracted-unverified | extracted-unverified | 66558 | no |
| 35 | www.thespruce.com | http-failure | http-failure | 42 | yes |
| 37 | www.tastingtable.com | extracted-unverified | extracted-unverified | 30911 | no |
| 38 | www.cargurus.com | extracted-unverified | extracted-unverified | 28831 | no |
| 39 | www.google.com | extracted-unverified | extracted-unverified | 1018 | no |
| 40 | www.quora.com | extracted-unverified | extracted-unverified | 58 | no |
| 41 | www.tiktok.com | empty-extraction | empty-extraction | 0 | no |
| 42 | www.goodhousekeeping.com | extracted-unverified | extracted-unverified | 27707 | no |
| 43 | www.pcmag.com | extracted-unverified | extracted-unverified | 47028 | no |
| 45 | www.alibaba.com | extracted-unverified | extracted-unverified | 5333 | no |
| 46 | www.caranddriver.com | extracted-unverified | extracted-unverified | 27740 | no |
| 47 | www.justanswer.com | semantic-barrier | semantic-barrier | 0 | yes |
| 48 | www.liberia.ubuy.com | semantic-barrier | semantic-barrier | 0 | yes |
| 49 | www.medicalnewstoday.com | extracted-unverified | extracted-unverified | 13664 | no |
| 50 | www.pinterest.com | extracted-unverified | extracted-unverified | 98 | no |
| 51 | www.angi.com | semantic-barrier | semantic-barrier | 0 | yes |
| 52 | my.clevelandclinic.org | extracted-unverified | extracted-unverified | 24098 | no |
| 53 | www.bobvila.com | extracted-unverified | extracted-unverified | 27611 | no |
| 54 | www.bbb.org | extracted-unverified | extracted-unverified | 2040 | no |
| 57 | www.seriouseats.com | http-failure | http-failure | 42 | yes |
| 58 | www.rtings.com | extracted-unverified | extracted-unverified | 15275 | no |
| 59 | carinterior.alibaba.com | empty-extraction | empty-extraction | 0 | no |
| 60 | www.ziprecruiter.com | extracted-unverified | extracted-unverified | 5106 | no |
| 61 | scienceinsights.org | extracted-unverified | extracted-unverified | 3123 | no |
| 62 | engineerfix.com | extracted-unverified | extracted-unverified | 3813 | no |
| 63 | grokipedia.com | extracted-unverified | extracted-unverified | 1515 | no |
| 64 | goto.walmart.com | http-failure | http-failure | 84 | no |
| 65 | www.oreateai.com | extracted-unverified | extracted-unverified | 114 | no |
| 66 | biologyinsights.com | extracted-unverified | extracted-unverified | 3478 | no |
| 67 | www.macys.com | http-failure | http-failure | 251 | no |
| 68 | www.merriam-webster.com | semantic-barrier | semantic-barrier | 0 | yes |
| 69 | www.collinsdictionary.com | semantic-barrier | semantic-barrier | 0 | yes |
| 70 | wellnd.com | semantic-barrier | semantic-barrier | 0 | yes |
| 71 | www.wayfair.com | http-failure | http-failure | 0 | no |
| 72 | www.yelp.com | http-failure | http-failure | 44 | no |
| 73 | wellwhisk.com | semantic-barrier | semantic-barrier | 0 | yes |
| 74 | www.mayoclinic.org | extracted-unverified | extracted-unverified | 22565 | no |
| 76 | www.whowhatwear.com | extracted-unverified | extracted-unverified | 103618 | no |
| 77 | apps.apple.com | extracted-unverified | extracted-unverified | 17593 | no |
| 78 | hometosight.com | semantic-barrier | semantic-barrier | 0 | yes |
| 79 | www.reviewed.com | extracted-unverified | extracted-unverified | 12755 | no |
| 80 | wallethub.com | semantic-barrier | semantic-barrier | 0 | yes |
| 81 | www.nordstrom.com | empty-extraction | empty-extraction | 0 | no |
| 82 | manuals.plus | extracted-unverified | extracted-unverified | 9271 | no |
| 83 | dictionary.cambridge.org | extracted-unverified | extracted-unverified | 22018 | no |
| 84 | www.outdoorgearlab.com | extracted-unverified | extracted-unverified | 22996 | no |
| 85 | www.kohls.com | http-failure | http-failure | 211 | no |
| 86 | hub.sivo.it.com | semantic-barrier | semantic-barrier | 0 | yes |
| 87 | www.bankrate.com | extracted-unverified | extracted-unverified | 23689 | no |
| 88 | www.expedia.com | http-failure | http-failure | 0 | no |
| 89 | kateminimalist.com | failure | extracted-unverified | 34787 | no |
| 90 | health.clevelandclinic.org | extracted-unverified | extracted-unverified | 26548 | no |
| 91 | www.aeanet.org | semantic-barrier | semantic-barrier | 0 | yes |
| 92 | www.amazon.co.uk | extracted-unverified | extracted-unverified | 21904 | no |
| 93 | thelivinglook.com | empty-extraction | empty-extraction | 0 | no |
| 94 | carbuzz.com | extracted-unverified | extracted-unverified | 26307 | no |
| 95 | www.ign.com | extracted-unverified | extracted-unverified | 24019 | no |
| 96 | www.ubuy.mq | semantic-barrier | semantic-barrier | 0 | yes |
| 97 | runrepeat.com | extracted-unverified | extracted-unverified | 9805 | no |
| 98 | www.cosmopolitan.com | extracted-unverified | extracted-unverified | 22986 | no |
| 99 | www.byrdie.com | http-failure | http-failure | 42 | yes |
| 100 | www.ulta.com | extracted-unverified | extracted-unverified | 55232 | no |

Unavailable original bodies: Google Play, TechRadar, CNBC (decoded-size limits),
Tom's Guide and Comparor (timeouts). The original100-row live report remains
`reports/agent-citation-pages-2026-09-15.md`; it is a citation-derived candidate
corpus, not a measured ranking of agent page visits.
