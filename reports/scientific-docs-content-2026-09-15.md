# Scientific documentation and source alternatives — September 15, 2026

## Public native checks

Five navigations, **five GETs, no redirects or retries**. The first four targets
were fixed before browsing; the fifth is the exact public Markdown representation
advertised in Apple's captured head link and visible View Markdown link, recorded
in a separate follow-up scope. No JavaScript, supplied cookies/credentials,
runtime SDK, device, solver, identity rotation or access bypass.

| Target | HTTP | Outcome | Markdown bytes |
| --- | ---: | --- | ---: |
| `https://docs.julialang.org/en/v1/manual/performance-tips/` | 200 | extracted-unverified | 107037 |
| `https://numpy.org/doc/stable/user/absolute_beginners.html` | 200 | extracted-unverified | 62932 |
| `https://www.rfc-editor.org/rfc/rfc9110.html` | 200 | extraction output-limit failure | 0 |
| `https://developer.apple.com/documentation/metal` | 200 | extracted-unverified; JavaScript notice | 285 |
| `https://developer.apple.com/documentation/metal.md` | 200 | extracted-unverified; literal Markdown documentation | 12844 |

Julia and NumPy provide substantial instructional content, code and headings,
with navigation clutter still present. Apple's HTML notice is **not** the Metal
documentation; the separate Markdown response contains the framework overview
and topic links. Literal Markdown is intentionally retained as source, not a
rendered or interactive document. No example or GPU code was executed.

All five body captures and child/transport closure verified. Empty HOME/TMP and
environment allowlist; one child at a time; 1000 ms per-origin pacing, 20-second
navigation / 45-second child limits, 2 MB response and 256 KB extraction caps,
five redirects maximum, 192 MiB heap. Source-hidden-inline-v1 and separate omitted
raw policies were explicitly selected; these do not establish computed visibility.

The live build's 1445 committed source/script/package/config inputs matched
`dda1af413d51ab66ecebc189f036b308af48a79e`. It was a pinned prior candidate archive,
not a claim that all archived reports/docs equal HEAD. Source and compiled hashes
remained stable. The new metadata implementation below was validated offline
against these captures, not presented as an additional live validation run.

## Implemented improvement

HTML extraction now exposes optional `sourceAlternates` metadata for bounded,
source-advertised Markdown alternatives. The semantic reader retains eligible
head link rel/type/href attributes rather than discarding them. Native and reader
extraction share the discovery logic. See `SOURCE-ALTERNATES.md` for the contract.

This does not fetch an alternative, inject text, infer availability, grant access,
retag a response or turn a shell into retrieved documentation. Metadata cannot
authorize failed-receipt replay. URL syntax and final resolved lengths are bounded;
unsafe schemes and credentials are rejected. Eight entries and 256 direct head
children cap discovery, preserving source order/duplicates and reporting truncation.
Document-base lookup still follows existing document limits and rules.

Independent review caught two cases where ineligible URLs could occupy reader
head scanning before final rejection: unsafe schemes/credentials, and short raw
absolute Unicode URLs with oversized serialized forms. Both are rejected earlier
now, with four 256-prefix regressions including backslash spelling. Relative
references keep final actual-base validation. The final scoped review reports no
additional concrete findings. Defaults and runtime dependencies are unchanged.

## Validation and source comparison

- Clean base: `dda1af413d51ab66ecebc189f036b308af48a79e`.
- Baseline: **1173 passing cases**, 14 explicitly selected native files.
- Final release03 candidate: **1369 passing cases**, 16 files, **196 new cases**.
- All baseline outcomes match, retaining duplicate-name occurrences.
- Build, strict selected-root types, format, lint and native runner pass.
- Native tests use synthetic documents/mocked responses, not live sockets, SDK,
  credentials or devices. This is not a full native release or interactive gate.

Release01 retains 33 failing new cases caused by shared expected Markdown strings
omitting existing punctuation escaping and angle-bracket link destinations. Those
expectations were corrected without altering production rendering. Release02
passes 1367 cases; release03 adds the final two serialized-length review cases.

Ten immutable saved sources compare baseline/final candidate: five current
captures plus Office, NASA, web.dev, PyTorch and GOV.UK controls. All visible
Markdown hashes and outcomes match. RFC's exact original failure remains. Only
Apple HTML gains the advertised alternate metadata in this set. Its reader
output count changes **927 to 1028 code units**, omitted tokens **192 to 191**,
and omitted link count **16 to 15**. Other reader reports match exactly.

The actual offline CLI also surfaces the alternate from the original pinned
Apple HTML receipt, without rewriting it or fetching the destination. Literal
Markdown controls remain literal and do not acquire HTML alternate metadata.

## RFC recovery without a retry

RFC 9110 returned 1187554 decoded bytes. Its full extraction still fails at
**256604 observed bytes against the 256000-byte limit**. Keep that outcome; do
not raise budgets or call the whole document successfully extracted.

Existing explicit output-limit replay finds **256 headings, truncated**, then
uses selectors observed in that outline to recover:

| Selected heading | Markdown bytes | New HTTP requests |
| --- | ---: | ---: |
| 9.2.2. Idempotent Methods | 3035 | 0 |
| 10.2.3. Retry-After | 1719 | 0 |

Both results retain original-failure and receipt/body identity. They are bounded
sections, not full-document recovery. Across three RFC children and five source/
CLI comparison children (including intermediate release02), all eight offline
process groups close with kernel/JS I/O guards and zero requests.

## Remaining work and evidence

No measured speedup or lower blocking rate is claimed. Automatic script support,
large-document usability, clutter removal, table/code fidelity, provider/passkey/
device/TTY acceptance and broader topic research remain open. Advertised URLs
need their own authorized, policy-checked navigation; challenges stay barriers.

Machine summary: `reports/scientific-docs-content-2026-09-15.json`.
Private scopes, receipts, pins, native runs, review, source comparisons and audits:
`node_modules/.cache/native-validation/scientific-docs-content-september15/`.
