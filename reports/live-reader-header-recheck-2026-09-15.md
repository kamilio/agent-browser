# Fresh reader and challenge-capture recheck — September 15, 2026

## Result

Four previously tested public entry pages received one fresh native-browser
navigation each, between **15:57:10 and 15:57:18 UTC**. This is a targeted live
follow-up, not a new100-page sweep or agent-traffic ranking.

| Requested page | HTTP | Native result | Markdown bytes | Saved replay |
| --- | ---: | --- | ---: | --- |
| `https://kateminimalist.com/` | 200 | extracted-unverified | 34787 | same content and classification |
| `https://www.thespruce.com/` | 403 | semantic-barrier | 0 | same content and classification |
| `https://www.seriouseats.com/` | 403 | semantic-barrier | 0 | same content and classification |
| `https://www.byrdie.com/` | 403 | semantic-barrier | 0 | same content and classification |

**Kateminimalist now yields readable source content on a fresh request.** Its
525,193-byte response is still declared as Markdown but contains HTML. Explicit
`markdown-html-document-v1` interpretation produces **34,787 Markdown bytes**
without a partial-output fallback, raised limit or script execution. The emitted
content hash matches the earlier offline result despite a different fresh body
hash. A full Markdown review and sampled HTML cross-check find real storefront
categories, product descriptions/links and business text, alongside substantial
navigation noise, duplicated labels, escaped entities and placeholder values.

This is not verification of merchant identity, product claims, current prices,
inventory, discounts, timers, rendering, links, cart or checkout. The reader's
partial/source-visibility qualifications remain in the receipt.

**The Spruce, Serious Eats and Byrdie remain blocked by Cloudflare challenges.**
Their fresh HTTP403 responses contain challenge markup and scripts, not useful
publisher extractions. The independently observed `cf-mitigated: challenge`
values now survive in captured headers. All three subsequently retain the same
confirmed challenge classification in network-disabled saved-body runs. No
missing historical header was inferred, and no challenge was solved or bypassed.

## Method and limits

- **4 actual GETs, 0 redirects, 0 retries**;4 completed live child groups.
- **4 additional offline mocked navigations, 0 HTTP requests**;4 closed child groups.
- Native reader only, empty HOME/TMP, no credential headers, page scripts,
  external browser, alternate fetch client, listener or real TTY.
- Same default source/body/extraction limits. Markdown preference, explicit MIME
  interpretation, separate omitted-raw accounting and inline-source visibility.
- Observer raw selected-header values match retained headers and omission markers;
  all body/receipt hashes, request/socket closures and offline I/O guards verify.
- Runtime commit `cdf7e2e2272ed51985a104c15ae164eb152a1921`, pinned clean compiled build. Preflight compares
  1,469 committed source/config files, including tests, and source/compiled hashes.
  The prior selected suite is3269pass/3 unchanged baseline failures; it was not
  rerun for this report-only live follow-up and is not claimed all green.

Raw captures remain private local evidence. The JSON companion includes body,
receipt and content hashes, observed selected headers, classifications and offline
comparisons. Earlier measurements in `reports/agent-citation-pages-2026-09-15.md`
remain historical; these four results do not silently update that100-page matrix.

## Outstanding

The three publisher access barriers remain unresolved. This result validates the
MIME/content fix and faithful challenge evidence for these responses only; it
does not finish the overall browser, runtime, passkey or broad compatibility goals.
