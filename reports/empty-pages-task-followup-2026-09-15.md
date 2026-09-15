# Empty pages and task-level follow-up — September 15, 2026

The original 100/100 native homepage attempts are complete. Their entire matrix
and reproducible selection remain in `reports/agent-citation-pages-2026-09-15.md`
and its companion corpus/results JSON. These are candidates drawn from five AI
citation rankings, **not a measured global ranking of pages visited by agents**.
The original review found 48 useful source pages; later observations must not be
added to that count as though they were one unchanged-profile validation run.

This follow-up investigates eight retained empty/tiny responses and makes **two
new public task-page navigations**, followed by two network-disabled selector
checks. It does not repeat or replace the original 100-page sweep.

## Eight retained source diagnoses

Two independent source-only reviewers inspected original hash-pinned captures,
reader counters and relevant native source. The supervising audit independently
rechecks receipt/body hashes and byte counts. This is bounded structural source
inspection, not fresh browsing, native reparsing or script execution.

| Original candidate | Body bytes | Supported diagnosis |
| --- | ---: | --- |
| `www.youtube.com` | 881814 | App/video skeletons without eligible listing text. The inspected navigation/copyright text is explicitly hidden. Initial-data markers are not visible videos. |
| `www.tiktok.com` | 376824 | Client-rendered app and paint placeholders, including an empty-alt image. No eligible video captions were found. |
| `www.pinterest.com` | 1119204 | The JavaScript-required noscript notice survives correctly; application data and stream-completion boundaries do not establish visible pins. |
| `www.bestbuy.com` | 441685 | Deferred storefront shell. Real promotional/navigation HTML exists in explicitly hidden stream chunks; source-only execution does not reveal/relocate it. The unresolved business-name template is literal source, not a product. |
| `www.nordstrom.com` | 254302 | Almost entirely raw script/style material, with two body scripts and no readable product markup. A particular challenge vendor or runtime result is not established. |
| `carinterior.alibaba.com` | 270053 | Redirected HTTP-200 error-themed showroom shell with empty module containers and hidden configuration. Its title is not an HTTP-404 status. |
| `thelivinglook.com` | 13464 | Redirected showroom has an empty app mount; captured product initialization and ItemList collections are also empty. Metadata is not a populated catalogue. |
| `www.oreateai.com` | 17403 | All five identified server-rendered slogans survive; the remainder is a promotional app skeleton, not substantive writing/documentation. |

All eight original receipts have zero reader tokenizer issues, but that alone
does not prove parser correctness. Nonzero source/text/output counters include
metadata, whitespace or sanitized markup and cannot establish readable content.
The downstream missing-doctype diagnostics concern sanitized reader input, not
proof that the network response lacked a doctype or that content was lost.

No concrete native extraction defect explaining these eight results is
demonstrated. Do not remove hidden/template boundaries, stringify hydration data,
execute completion scripts outside SafeJS, or invent listings to turn these
failures into passes. Best Buy's hidden server-supplied chunks are a specific
future deferred-rendering investigation, not proof of supported rendering today.

## Two fresh task pages

On September 15, 2026, at **19:30 UTC**, the actual native research CLI made one
default-profile request per URL. It used the inert reader, complete body capture,
`separate-omitted-raw-v1` and `source-hidden-inline-v1`; no caps were raised.

| Target and task | HTTP | Complete body bytes | Markdown bytes | Reviewed result |
| --- | ---: | ---: | ---: | --- |
| `https://www.google.com/search?q=HTML+parser` — public search | 200 | 91655 | 149 | Script-mediated redirect notice only; no search results. |
| `https://grokipedia.com/page/Web_browser` — article retrieval | 200 | 373212 | 78304 | Substantial article prose and references, mixed with navigation/contribution UI. |

Google's saved homepage form supplies `/search` and input name `q`; the check
navigates directly and does **not** validate form filling/submission. The
Grokipedia URL is constructed using the `/page/` route found in retained source,
not a followed homepage article link or a tested search interaction.

Both native receipts say `extracted-unverified`, `contentSuccess:null` and
`partial:true`, with no classified barrier. The manual Google shell judgment
does not rewrite that receipt or assert a confirmed CAPTCHA. Its retry/enable-JS
link was not followed. HTTP 200 and a zero exit status are not search success.

## Existing offline selection improves article output

The fresh Grokipedia source contains one `article` element. Passing the exact
captured receipt and independent host pins to the existing replay CLI with
`--expected-profile default --selector article --format markdown` yields
**73520 UTF-8 bytes / 73494 code units** of Markdown. Selection removes 4784 bytes
of surrounding material, including the contribution dialog; introductory prose,
middle sections and the reference list remain. The report records one match,
zero network requests, partial semantics and unverified content success.

Sample inspection includes the beginning, offset 35000 and the final 1000 code
units. This verifies useful article source, not the accuracy of its claims,
citation targets, current market statistics, audio controls or contributions.
No references were fetched. Some source UI text remains inside the article.

As a negative content control, selecting Google's `body` with the same existing
offline CLI reproduces the **same 149-byte content hash**. Selection cannot
create search results absent from the eligible captured source.

## Evidence and boundaries

- Runtime commit: `1bf98d77a1f1265c44377f8eaa2352f6676d466d`. Reused the prior clean
  compiled candidate only after checking all 1481 committed runtime source,
  script/config files and its source/compiled manifests. No dirty build used.
- Two live navigations, two GET request starts, two complete HTTP-200 responses,
  two complete captures, zero redirects/retries/credential headers/guard denials.
  Both requests and observed sockets closed.
- Two actual offline replay CLI processes ran under kernel socket/io_uring
  denial and JS network/subprocess guards; zero guard attempts, real network
  requests or mocked navigations. All four children/process groups closed.
- Live checks had separate empty HOME/TMPDIR, a 192 MiB heap and 45-second outer
  deadlines; offline checks had 30-second deadlines. No timeout or kill occurred.
- Private evidence lane:
  `node_modules/.cache/native-validation/empty-pages-task-followup-september15/`.
  `AUDIT.json`, `SOURCE-DIAGNOSES.json`, `SHELL-A.md`, `SHELL-B.md`, invocation,
  lifecycle and guard records retain exact pins. The companion public JSON
  summarizes outcomes and evidence hashes without republishing captured pages.
- No production behavior changed; no new build or native-test suite pass is
  claimed. Historical reports, original 42 dirty tracked/697 untracked files,
  native manifest and runtime remain unchanged. No push.

The broader native-browser goal remains active. Runtime/deferred rendering,
access restrictions, real interactions, credentials/passkeys and SafeJS acceptance
remain separate outstanding gates. These ten examined pages do not establish
full-site compatibility or a globally representative agent benchmark.
