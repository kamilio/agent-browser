# Top-100 saved-source reassessment — September 15, 2026

## Outcome

Replayed **all 90 available bodies** from the original 100-site sweep, with the
original reader policy and opt-in `source-hidden-inline-v1`, on both the current
baseline and guarded candidate: **360 in-memory navigations, zero HTTP requests**.
The ten original attempts without body captures remain unavailable, not passed.
This is not a new live crawl or a verified September traffic ranking; the corpus
is still the published May 2026 list documented in the original report.

The sweep found and fixed Rakuten's inline-hidden reader failure. A hidden div
contains a list with no closing `ul` before its explicit `div` end, at normalized
UTF-16 offset **310747**. The new bounded ancestor closure recovers **57,936
Markdown bytes**, previously zero with `unsupported` at the loader. Its original
policy output remains **66,879 bytes**, byte-identical. The other **179 paired
cases** retain their outcomes, body hashes, reader diagnostics, classifications
and existing source metadata.

The recovered page includes shopping categories, shop/brand and service sections,
ranking and points text, and footer information. It also retains source coupon
date placeholders: it is useful source content, **not verified rendered offers,
prices, dates, interactive shopping or a complete working website**.

## Candidate counts

These counts describe reconstruction from saved bodies and limited stored
headers, not replacements for the original live outcomes.

| Outcome | Original policy | Inline-hidden policy |
| --- | ---: | ---: |
| Nonempty, unverified extraction | 65 | 64 |
| Empty extraction | 13 | 14 |
| HTTP failure | 7 | 7 |
| Semantic barrier | 5 | 5 |
| Loader/other failure | 0 | 0 |
| Total captured bodies | 90 | 90 |

**Important evidence gap:** ChatGPT, Canva and Indeed were originally confirmed
as challenges using `cf-mitigated: challenge`. The old receipt summary retained
only content headers, not `cf-mitigated`. Consequently, their saved-body runs
produce HTTP failures rather than reproducing the original header-confirmed
challenge classification. That is incomplete replay evidence—not successful
access, a bypass, or demonstrated classifier regression. Original live records
remain authoritative and unchanged. Future capture header retention is still work.

## Fix and validation

- Explicit supported block ends may close their nearest matching ancestor
  inside the hidden stack; they never pop the visible stack or invent an ancestor.
  Table/select/template/foreign/legacy/formatting boundaries remain guarded.
- Independent review caught newly admitted body-attribute and persistent-form
  side effects. Local body/form guards address these new paths. Older direct-match
  document-tag/form limitations remain explicit in `HIDDEN-BLOCK-ENDS.md`.
- Clean baseline: **1,818 tests / 24 selected native files**. Final candidate:
  **1,945 / 25**, including **127 new tests**. Build, narrowed types, formatter,
  linter and selected native tests pass. This is not a full-manifest or SDK pass.
- **1,812 baseline cases are unchanged**. Six expanded cases deliberately replace
  newly accepted ordinary-span negative vectors with still-rejected formatting
  vectors; positive recovery is covered in the new suite.
- A retained negative-control candidate uses the pre-guard implementation with
  the new tests: **1,939 pass / six body-form cases fail**. Final guarded code passes
  the identical tests. Initial and follow-up static reviews retain separate hashes.
- The original reassessment harness used an invalid policy spelling. Its **83
  terminal child records** remain preserved and are not counted as paired results
  or website failures. Corrected runs use separate scripts/directories and stop
  on a child error. Both complete 90-body runs and the one diagnostic child close;
  **264 total recorded child groups** are reaped with unchanged input pins.
- Native runtime source identity matches **1,456 HEAD files** before reuse of the
  verified baseline build. Source/compiled manifests and original receipt/body
  hashes are checked. The original top-100 artifact checksum verification passes.
  There are no new live, SDK, credential, socket/TTY probe or CAPTCHA-solver runs.

Single-run processing timings remain private diagnostic evidence, not a speed
benchmark. No retries or resource-limit increases are used to make sites pass.

## Next functional work

Static review of the original 13 empty sources identifies bounded, inert JSON in
Roblox's landing catalog and TikTok's navigation as useful next source-recovery
candidates. Instagram/Twitch descriptions are metadata, not feeds. Two other
sources advertise age verification in executable bootstrap state; do not execute
or bypass that state or count it as catalog content. Booking and IMDb supplied
zero-byte 202 responses, unlike sources that have no retained capture at all.

Retain challenge/cooldown header evidence without clipping conflicting values
into a false signal. Continue safe page-content coverage and resolve the separate
SafeJS contract issue before activating page scripts. Credential/passkey,
interactive/service/TTY, CAPTCHA and broad compatibility gates remain open.

## Unavailable captures

The ten unreplayed original entries are Baidu, Netflix, SharePoint, Globo,
AliExpress, E-office.cloud, HBO Max, Bet.br, Gemini and 9animetv.to. Their original
network, timeout, decoded-size or redirect-limit failures remain in
`reports/top100-websites-2026-09-15.md`; they were not fetched again here.

## Every replayed website

The matrix uses the guarded candidate. Byte counts measure Markdown body content,
not metadata or usefulness. Original-policy means the original capture's reader
options applied to the current code, not its historical extraction bytes.

| Rank | Host | Original policy: outcome / bytes | Inline-hidden policy: outcome / bytes | Qualification |
| ---: | --- | --- | --- | --- |
| 1 | `google.com` | extracted-unverified / 1018 | extracted-unverified / 1018 | Unchanged by this fix |
| 2 | `youtube.com` | extracted-unverified / 893 | empty-extraction / 0 | Unchanged by this fix |
| 3 | `facebook.com` | extracted-unverified / 3993 | extracted-unverified / 3993 | Unchanged by this fix |
| 4 | `instagram.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 5 | `chatgpt.com` | http-failure / 42 | http-failure / 42 | Original challenge header absent from capture |
| 6 | `x.com` | extracted-unverified / 1288 | extracted-unverified / 1288 | Unchanged by this fix |
| 7 | `reddit.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged by this fix |
| 8 | `whatsapp.com` | extracted-unverified / 8855 | extracted-unverified / 5647 | Unchanged by this fix |
| 9 | `bing.com` | extracted-unverified / 4081 | extracted-unverified / 2811 | Unchanged by this fix |
| 10 | `yahoo.com` | extracted-unverified / 34785 | extracted-unverified / 16139 | Unchanged by this fix |
| 11 | `wikipedia.org` | extracted-unverified / 23395 | extracted-unverified / 23395 | Unchanged by this fix |
| 12 | `yahoo.co.jp` | extracted-unverified / 5484 | extracted-unverified / 5484 | Unchanged by this fix |
| 13 | `tiktok.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 14 | `yandex.ru` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 16 | `amazon.com` | extracted-unverified / 24484 | extracted-unverified / 23341 | Unchanged by this fix |
| 17 | `pornhub.com` | extracted-unverified / 14987 | extracted-unverified / 14987 | Unchanged by this fix |
| 18 | `linkedin.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged by this fix |
| 20 | `temu.com` | extracted-unverified / 9623 | extracted-unverified / 2821 | Unchanged by this fix |
| 21 | `live.com` | extracted-unverified / 40 | extracted-unverified / 40 | Unchanged by this fix |
| 22 | `xvideos.com` | extracted-unverified / 33318 | extracted-unverified / 33318 | Unchanged by this fix |
| 23 | `naver.com` | extracted-unverified / 574 | extracted-unverified / 551 | Unchanged by this fix |
| 24 | `office.com` | extracted-unverified / 52523 | extracted-unverified / 26082 | Unchanged by this fix |
| 25 | `weather.com` | extracted-unverified / 3478 | extracted-unverified / 3478 | Unchanged by this fix |
| 26 | `pinterest.com` | extracted-unverified / 98 | extracted-unverified / 98 | Unchanged by this fix |
| 27 | `discord.com` | extracted-unverified / 10233 | extracted-unverified / 10233 | Unchanged by this fix |
| 28 | `twitch.tv` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 29 | `microsoft.com` | extracted-unverified / 17999 | extracted-unverified / 17942 | Unchanged by this fix |
| 30 | `vk.com` | extracted-unverified / 201 | extracted-unverified / 201 | Unchanged by this fix |
| 31 | `xhamster.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 32 | `duckduckgo.com` | extracted-unverified / 246 | extracted-unverified / 219 | Unchanged by this fix |
| 34 | `fandom.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged by this fix |
| 35 | `qq.com` | extracted-unverified / 8641 | extracted-unverified / 8641 | Unchanged by this fix |
| 36 | `mail.ru` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 37 | `xnxx.com` | extracted-unverified / 3422 | extracted-unverified / 3422 | Unchanged by this fix |
| 39 | `paypal.com` | extracted-unverified / 11784 | extracted-unverified / 11547 | Unchanged by this fix |
| 41 | `ebay.com` | http-failure / 242 | http-failure / 242 | Unchanged by this fix |
| 42 | `msn.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 43 | `canva.com` | http-failure / 263 | http-failure / 263 | Original challenge header absent from capture |
| 45 | `samsung.com` | extracted-unverified / 40339 | extracted-unverified / 40281 | Unchanged by this fix |
| 46 | `github.com` | extracted-unverified / 15380 | extracted-unverified / 14174 | Unchanged by this fix |
| 47 | `roblox.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 48 | `espn.com` | extracted-unverified / 21222 | extracted-unverified / 21222 | Unchanged by this fix |
| 49 | `amazon.co.jp` | extracted-unverified / 67399 | extracted-unverified / 66369 | Unchanged by this fix |
| 50 | `booking.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 51 | `xhamster43.desi` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 52 | `quora.com` | extracted-unverified / 123 | extracted-unverified / 58 | Unchanged by this fix |
| 53 | `craigslist.org` | extracted-unverified / 32011 | extracted-unverified / 32010 | Unchanged by this fix |
| 54 | `bilibili.com` | extracted-unverified / 7884 | extracted-unverified / 7884 | Unchanged by this fix |
| 55 | `apple.com` | extracted-unverified / 76021 | extracted-unverified / 70421 | Unchanged by this fix |
| 56 | `bbc.co.uk` | extracted-unverified / 33129 | extracted-unverified / 30689 | Unchanged by this fix |
| 57 | `spotify.com` | extracted-unverified / 7053 | extracted-unverified / 7053 | Unchanged by this fix |
| 58 | `rakuten.co.jp` | extracted-unverified / 66879 | extracted-unverified / 57936 | Hidden block recovery |
| 59 | `amazon.de` | extracted-unverified / 30498 | extracted-unverified / 25565 | Unchanged by this fix |
| 60 | `zoom.us` | extracted-unverified / 31023 | extracted-unverified / 14051 | Unchanged by this fix |
| 61 | `nytimes.com` | extracted-unverified / 22522 | extracted-unverified / 20813 | Unchanged by this fix |
| 62 | `sahibinden.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged by this fix |
| 63 | `stripchat.com` | http-failure / 0 | http-failure / 0 | Unchanged by this fix |
| 64 | `imdb.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 65 | `cnn.com` | http-failure / 0 | http-failure / 0 | Unchanged by this fix |
| 66 | `amazon.in` | extracted-unverified / 26035 | extracted-unverified / 24954 | Unchanged by this fix |
| 67 | `google.de` | extracted-unverified / 1018 | extracted-unverified / 1018 | Unchanged by this fix |
| 68 | `vercel.app` | extracted-unverified / 11534 | extracted-unverified / 6806 | Unchanged by this fix |
| 69 | `shein.com` | extracted-unverified / 11566 | extracted-unverified / 8582 | Unchanged by this fix |
| 70 | `indeed.com` | http-failure / 179 | http-failure / 179 | Original challenge header absent from capture |
| 71 | `pinterest.com.mx` | extracted-unverified / 98 | extracted-unverified / 98 | Unchanged by this fix |
| 72 | `chaturbate.com` | semantic-barrier / 0 | semantic-barrier / 0 | Unchanged by this fix |
| 73 | `ok.ru` | extracted-unverified / 4213 | extracted-unverified / 4213 | Unchanged by this fix |
| 74 | `cricbuzz.com` | extracted-unverified / 41157 | extracted-unverified / 41157 | Unchanged by this fix |
| 75 | `xnxx.gold` | extracted-unverified / 2634 | extracted-unverified / 2634 | Unchanged by this fix |
| 77 | `music.youtube.com` | extracted-unverified / 155 | extracted-unverified / 155 | Unchanged by this fix |
| 78 | `onlyfans.com` | extracted-unverified / 78 | extracted-unverified / 9 | Unchanged by this fix |
| 79 | `glance.com` | extracted-unverified / 5538 | extracted-unverified / 5538 | Unchanged by this fix |
| 80 | `beeg.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 82 | `google.co.jp` | extracted-unverified / 1018 | extracted-unverified / 1018 | Unchanged by this fix |
| 83 | `bbc.com` | extracted-unverified / 50899 | extracted-unverified / 47773 | Unchanged by this fix |
| 85 | `amazon.co.uk` | extracted-unverified / 26054 | extracted-unverified / 23089 | Unchanged by this fix |
| 86 | `doubleclick.net` | extracted-unverified / 16454 | extracted-unverified / 16423 | Unchanged by this fix |
| 88 | `uol.com.br` | extracted-unverified / 95276 | extracted-unverified / 84564 | Unchanged by this fix |
| 89 | `nudevista.com` | extracted-unverified / 58731 | extracted-unverified / 58549 | Unchanged by this fix |
| 90 | `news.yahoo.co.jp` | extracted-unverified / 15342 | extracted-unverified / 15342 | Unchanged by this fix |
| 91 | `nicovideo.jp` | extracted-unverified / 11782 | extracted-unverified / 11341 | Unchanged by this fix |
| 92 | `mercadolivre.com.br` | extracted-unverified / 55159 | extracted-unverified / 29280 | Unchanged by this fix |
| 93 | `theguardian.com` | extracted-unverified / 54476 | extracted-unverified / 51600 | Unchanged by this fix |
| 94 | `primevideo.com` | extracted-unverified / 5162 | extracted-unverified / 1616 | Unchanged by this fix |
| 95 | `minesweeper.one` | extracted-unverified / 16032 | extracted-unverified / 16032 | Unchanged by this fix |
| 96 | `dailymotion.com` | empty-extraction / 0 | empty-extraction / 0 | Unchanged by this fix |
| 97 | `fc2.com` | extracted-unverified / 2737 | extracted-unverified / 2732 | Unchanged by this fix |
| 98 | `telegram.org` | extracted-unverified / 5005 | extracted-unverified / 5005 | Unchanged by this fix |
| 99 | `nyanx.com` | http-failure / 179 | http-failure / 179 | Unchanged by this fix |
| 100 | `tradingview.com` | extracted-unverified / 70086 | extracted-unverified / 69932 | Unchanged by this fix |
