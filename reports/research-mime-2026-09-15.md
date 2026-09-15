# Explicit Markdown-to-HTML interpretation — September 15, 2026

## Result

The saved Kateminimalist response contains HTML declared as Markdown. With the
explicit `markdown-html-document-v1` reader policy, the same captured bytes yield
**34787 bytes of native Markdown** instead of an
extraction-output failure. No request, script execution, source-header mutation,
output-cap increase, or partial-output fallback is involved.

The content SHA-256 is `8fb6191f2ba38dd7f187ec4b8034fec3e65175936c67dfbd1827e8a7f152ad42`.
The original body SHA-256 remains `61f092901fbd5c3fe38a03354917dcd993f0a5c0855ed0e0d090022c2afe10e4`.
Declared Content-Type remains `text/markdown; charset=utf-8`.
This establishes saved-source extraction, not live site, inventory or checkout acceptance.

## Regression checks

- All **95 strict/default cases unchanged**, compared with the parent commit.
- **94 requested-policy cases unchanged**; only the one recognized HTML document changes.
- **285 mocked navigations, zero HTTP requests**, across **190 closed saved-body child groups**.
- Five original missing bodies remain unavailable, not tested by these offline replays.
- **2632 native tests pass; one unchanged pre-existing failure**.
  All **263 new tests pass** across 35 selected files.
  Build, narrowed type checks, formatting and lint pass. The existing replay-row-flag
  expectation remains failing and visible; the native suite is not all green.
- Original headers/body pins are checked, serialized extractions stay within
  256,000 bytes, and every saved-body child records closed metrics and empty I/O guards.

The initial candidate had type/lint and new fixture assertion failures. They are
retained in the private evidence lane, not represented as passing runs. Final
source and compiled manifests identify the validated snapshot.

## Scope and remaining gates

See `RESEARCH-MIME.md` for explicit policy, ambiguity, decoder, classifier and
replay boundaries. Captured-output-limit recovery remains declared-HTML-only.
Source-hidden challenge checks use an unfiltered interpreted tree, and challenge
diagnostics disclose the effective reader interpretation. No global silent MIME
sniffing is enabled.

This follows the 100 citation-derived entry-page sweep in
`reports/agent-citation-pages-2026-09-15.md`; that corpus is **not a verified
ranking of agent page visits**. Historical live outcomes are unchanged. In
particular, missing stored Cloudflare headers prevent reproducing three original
barrier classifications exactly; do not replace the live records with these mocks.

## All available saved bodies

| Rank | Host | Strict outcome | Explicit policy outcome | Markdown bytes | Changed |
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
| 22 | medium.com | semantic-barrier | semantic-barrier | 0 | no |
| 23 | www.wikihow.com | extracted-unverified | extracted-unverified | 31599 | no |
| 24 | www.etsy.com | extracted-unverified | extracted-unverified | 5501 | no |
| 25 | www.lowes.com | extracted-unverified | extracted-unverified | 3161 | no |
| 26 | www.cars.com | semantic-barrier | semantic-barrier | 0 | no |
| 27 | www.facebook.com | extracted-unverified | extracted-unverified | 3993 | no |
| 28 | www.instagram.com | extracted-unverified | extracted-unverified | 1967 | no |
| 29 | www.nytimes.com | extracted-unverified | extracted-unverified | 20494 | no |
| 30 | www.nerdwallet.com | extracted-unverified | extracted-unverified | 44516 | no |
| 31 | www.tripadvisor.com | http-failure | http-failure | 44 | no |
| 32 | www.yahoo.com | extracted-unverified | extracted-unverified | 15236 | no |
| 33 | www.goodrx.com | http-failure | http-failure | 0 | no |
| 34 | finance.yahoo.com | extracted-unverified | extracted-unverified | 66558 | no |
| 35 | www.thespruce.com | http-failure | http-failure | 42 | no |
| 37 | www.tastingtable.com | extracted-unverified | extracted-unverified | 30911 | no |
| 38 | www.cargurus.com | extracted-unverified | extracted-unverified | 28831 | no |
| 39 | www.google.com | extracted-unverified | extracted-unverified | 1018 | no |
| 40 | www.quora.com | extracted-unverified | extracted-unverified | 58 | no |
| 41 | www.tiktok.com | empty-extraction | empty-extraction | 0 | no |
| 42 | www.goodhousekeeping.com | extracted-unverified | extracted-unverified | 27707 | no |
| 43 | www.pcmag.com | extracted-unverified | extracted-unverified | 47028 | no |
| 45 | www.alibaba.com | extracted-unverified | extracted-unverified | 5333 | no |
| 46 | www.caranddriver.com | extracted-unverified | extracted-unverified | 27740 | no |
| 47 | www.justanswer.com | semantic-barrier | semantic-barrier | 0 | no |
| 48 | www.liberia.ubuy.com | semantic-barrier | semantic-barrier | 0 | no |
| 49 | www.medicalnewstoday.com | extracted-unverified | extracted-unverified | 13664 | no |
| 50 | www.pinterest.com | extracted-unverified | extracted-unverified | 98 | no |
| 51 | www.angi.com | semantic-barrier | semantic-barrier | 0 | no |
| 52 | my.clevelandclinic.org | extracted-unverified | extracted-unverified | 24098 | no |
| 53 | www.bobvila.com | extracted-unverified | extracted-unverified | 27611 | no |
| 54 | www.bbb.org | extracted-unverified | extracted-unverified | 2040 | no |
| 57 | www.seriouseats.com | http-failure | http-failure | 42 | no |
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
| 68 | www.merriam-webster.com | semantic-barrier | semantic-barrier | 0 | no |
| 69 | www.collinsdictionary.com | semantic-barrier | semantic-barrier | 0 | no |
| 70 | wellnd.com | semantic-barrier | semantic-barrier | 0 | no |
| 71 | www.wayfair.com | http-failure | http-failure | 0 | no |
| 72 | www.yelp.com | http-failure | http-failure | 44 | no |
| 73 | wellwhisk.com | semantic-barrier | semantic-barrier | 0 | no |
| 74 | www.mayoclinic.org | extracted-unverified | extracted-unverified | 22565 | no |
| 76 | www.whowhatwear.com | extracted-unverified | extracted-unverified | 103618 | no |
| 77 | apps.apple.com | extracted-unverified | extracted-unverified | 17593 | no |
| 78 | hometosight.com | semantic-barrier | semantic-barrier | 0 | no |
| 79 | www.reviewed.com | extracted-unverified | extracted-unverified | 12755 | no |
| 80 | wallethub.com | semantic-barrier | semantic-barrier | 0 | no |
| 81 | www.nordstrom.com | empty-extraction | empty-extraction | 0 | no |
| 82 | manuals.plus | extracted-unverified | extracted-unverified | 9271 | no |
| 83 | dictionary.cambridge.org | extracted-unverified | extracted-unverified | 22018 | no |
| 84 | www.outdoorgearlab.com | extracted-unverified | extracted-unverified | 22996 | no |
| 85 | www.kohls.com | http-failure | http-failure | 211 | no |
| 86 | hub.sivo.it.com | semantic-barrier | semantic-barrier | 0 | no |
| 87 | www.bankrate.com | extracted-unverified | extracted-unverified | 23689 | no |
| 88 | www.expedia.com | http-failure | http-failure | 0 | no |
| 89 | kateminimalist.com | failure | extracted-unverified | 34787 | MIME interpretation |
| 90 | health.clevelandclinic.org | extracted-unverified | extracted-unverified | 26548 | no |
| 91 | www.aeanet.org | semantic-barrier | semantic-barrier | 0 | no |
| 92 | www.amazon.co.uk | extracted-unverified | extracted-unverified | 21904 | no |
| 93 | thelivinglook.com | empty-extraction | empty-extraction | 0 | no |
| 94 | carbuzz.com | extracted-unverified | extracted-unverified | 26307 | no |
| 95 | www.ign.com | extracted-unverified | extracted-unverified | 24019 | no |
| 96 | www.ubuy.mq | semantic-barrier | semantic-barrier | 0 | no |
| 97 | runrepeat.com | extracted-unverified | extracted-unverified | 9805 | no |
| 98 | www.cosmopolitan.com | extracted-unverified | extracted-unverified | 22986 | no |
| 99 | www.byrdie.com | http-failure | http-failure | 42 | no |
| 100 | www.ulta.com | extracted-unverified | extracted-unverified | 55232 | no |

Five original unavailable bodies: Google Play, TechRadar, CNBC (decoded-size
limits), Tom's Guide and Comparor (timeouts). Their failed live attempts remain
in the original 100-row report. JSON companion records source hashes, full paired
outcomes and the offline evidence references.
