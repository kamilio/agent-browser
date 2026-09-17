# Quoted cache freshness and fresh reference content

## Browser change

The opt-in native resource cache now accepts quoted decimal `max-age` arguments,
including HTTP quoted-pair escaped digits. Previously an otherwise eligible
public stylesheet/image response with that argument form always missed cache
admission. The change retains the existing positive safe-integer/millisecond
checks, public-only eligibility, same-origin anonymous resource scope, copied
bytes, freshness accounting and local lifetime caps. It does not parse JavaScript
escapes, change `Age` syntax, admit new directives or enable caching by default.

Two mocked `NodeNetworkTransport` cases request the same eligible resource twice:
plain quoted digits and escaped quoted digits both use **one underlying mocked
HTTP exchange and one memory-cache delivery**. This removes an avoidable repeat
request for the tested header form. It is not a live-site request-reduction or
latency measurement, and no CAPTCHA solution or broader site access is claimed.

## Red/green qualification

The exact same seven-file test set gives **606 passed / 10 failed** against
unchanged production code and **616 passed / zero failed** after the fix. Build,
selected test types, and formatting/lint for the three changed TypeScript files
pass. Both isolated native groups close with empty private HOME/TMP directories.
The regressions cover quoted numeric acceptance, escaped digits, age/expiry and
mocked transport reuse; rejection coverage retains malformed arguments, zero,
overflow, duplicates, private/no-store/no-cache and quoted `Age` cases.

An earlier preparation attempt named a transport test absent from the explicit
native manifest. It stopped before any test process; the corrected preparation
uses the actual route-transport and retry-after-pacing manifest entries. Nothing
was skipped or added to the manifest. Its 1,018 entries still include 22 absent
committed files. This is a selected native gate, not a new complete-suite run or
actual socket, SDK, credential, passkey or device acceptance.

## Two fresh public references

The native browser makes one anonymous GET to each explicitly selected public
URL, after a separate synthetic no-network proof. There are no redirects,
retries, credentials, scripts, SafeJS or subresource requests. Both replies are
HTTP200 with no classified barrier. Live and replay use the qualified pre-fix
runtime matching commit `e09acb4`; the cache fix is validated separately.

| Reference | Received UTC, September 17, 2026 | Captured HTML bytes | Full reader Markdown bytes |
| --- | --- | ---: | ---: |
| arXiv `2005.14165`, paper abstract | 16:14:23.379 | 49,045 | 12,973 |
| RFC9111, HTTP caching | 16:14:23.493 | 232,630 | 155,359 |

Source URLs are `https://arxiv.org/abs/2005.14165` and
`https://www.rfc-editor.org/rfc/rfc9111.html`. These are functionality candidates,
not a popularity ranking or newly discovered source links. The adjacent JSON
records receipt/body hashes, exact options and separate execution evidence.

Five offline native selections return **1,886 Markdown bytes** for the complete
paper title/abstract and **2,690 bytes** for the RFC argument-form paragraph,
response max-age section and response no-store section. Both fit the fixed
12,288-byte workflow limit. Thirteen complete source text-block checks pass in
JSON and normalized Markdown; twelve native documents close. No extra request
is made to obtain these compact outputs. Their JSONL companions preserve title,
URL and captured-body identity; bare excerpts should not lose that attribution.

Independent review confirms exactly-once block order, headings/list semantics
and the preserved normative terms. A stronger artifact-only check verifies all
thirteen complete typed JSON blocks and corresponding Markdown blocks without
rerunning extraction. The byte budget is Markdown-only: the accompanying RFC
JSONL envelopes total 13,085 bytes, so the whole evidence package is not claimed
to fit 12 KiB. Markdown escaping, blockquote notation and lost CSS styling are
not treated as missing words or preserved visual rendering.

The captured RFC paragraph discusses recipients accepting both token and
quoted-string argument forms. That source comparison identifies the cache
compatibility gap; it is not evidence of full HTTP-cache conformance. The paper
abstract is retrieved source content, not a current benchmark ranking, a verified
model-capability claim or a complete research-paper review.

## Empty-entry triage

Four older unsuccessful entries were inspected without new requests. Historical
measurements and verdicts remain unchanged:

- **Nordstrom:** the saved body is a script-mediated replacement response, not
  delivered product prose. Its embedded request/environment metadata is not
  product content and is not replayed. No extraction-only fix can recover absent
  product records from those bytes.
- **Best Buy:** previously documented hidden promotional HTML remains available
  through explicit legacy source selection of `[id="S:4"]`; this is not a newly
  discovered parser defect or a rendered storefront.
- **Car Interior / Alibaba:** the captured final page is an HTTP200 error-themed
  application shell with empty product modules, not recovered recommendations.
- **Living Look:** metadata and related-search navigation do not establish a
  populated catalogue. No product/article omission was demonstrated.

These findings prevent unnecessary retries and misleading content-success
claims; they do not solve the access or dynamic-runtime limitations. No denied
destination is retried or alternate endpoint used during this triage.

## Remaining work

Historical 100-entry results stay 33 useful / 67 other. More diverse task-level
website tests, actual SafeJS integration, avoidable access/CAPTCHA friction,
real credentials/passkeys/devices and unfinished research remain open. No new
runtime dependency is added and pre-existing work remains separate. The overall
browser goal is active, not complete.

Private evidence: `node_modules/.cache/native-validation/empty-entry-recovery-september17/`
and `node_modules/.cache/native-validation/paper-cache-reference-live-september17/`.
