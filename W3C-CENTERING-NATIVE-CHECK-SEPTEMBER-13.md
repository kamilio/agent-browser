# W3C centering — bounded native check, September 13, 2026

**PASS: authorized live capture and isolated native reader inspection only.**
No production changes, TestPages work, unit rerun, commits or pushes.

## Capture

- Target: `https://www.w3.org/Style/Examples/007/center.en.html`.
- Received September 13, 2026, **13:56:35.716 UTC**; HTTP **200**.
  Server Date: `Sun, 13 Sep 2026 13:56:35 GMT`;
  Last-Modified: `Thu, 02 Oct 2025 06:43:46 GMT` (not the capture date).
- Exactly **one native document request / one actual GET**, zero redirects,
  retries, subresources or linked-source fetches. Native NodeNetworkTransport;
  250ms pacing configured, fresh empty cookies, credentials omitted.
- **20,483 decoded bytes / 6,199 encoded bytes**, within 3MiB body/aggregate caps.
  Retained decoded-body SHA-256:
  `4e36b55cab8cf0781ae46278aafbf58ae36339dfcebe767ac7fd0f0a2ca93a69`.
- Native challenge diagnostic null; no HTTP429 or Retry-After. No bypass.

## Native observations

Exactly one offline `long-v1` reader load, default raw policy, succeeds with
**484 nodes**, **10 headings** (one h1, nine h2; title counted separately),
**43 links**, **11 preformatted code-example blocks**, zero code elements.
Examples here means native `pre` elements, not rendered demonstrations.

- Native title `e5`: “CSS: centering things”. Heading references include
  `e72` text centering, `e90` block/image centering, `e148` vertical centering,
  `e226` vertical/horizontal centering and `e288` viewport centering.
- Native example text is retained at `e77` (text-align), `e95` (auto margins),
  `e168` (absolute positioning/translation), `e214` (flex alignment),
  `e251` (two-axis positioning/translation), `e277` (flex justification).
  These are extracted source examples, not claims that their CSS executes.
- Links: eight fragments, 23 relative references, 12 `http:` references;
  none followed. Example native references: `e13`, `e26`, `e40`, `e44`.
- Three queries consume **13,406 query-work units**; extraction consumes
  **1,701 walk-work units**. **24 complete labels / 1,621 text units** retained:
  title plus nine headings, ten example blocks and four links. No truncated
  or skipped selected labels; not every counted heading/example was labeled.
- Reader metadata: partial semantic view, styling/scripting/hidden-content
  semantics false; 60 omitted tokens, 88 ignored attributes, one unwrapped
  element, zero tokenizer issues. Omitted subtrees: two meta, 48 link, one
  style, one input. Document revision remains 483.

## Isolation and pinned evidence

Evidence lane: `node_modules/.cache/native-validation/native-w3c-centering-september13/`.
`AUTHORIZATION.md`, capture/audit receipts, native labels, invocation records,
resource/closure records and complete before/after inventories are retained.
`DIGESTS.sha256` seals all lane files plus this report and the sibling handoff;
the manifest necessarily excludes itself. Verification is performed after writing.

Only `native-date-time-source-september13-round00/snapshot01/dist` was imported:

- Base: `960ea83eabad9cbca448ce8d586a2f8464b126e5`.
- Source inventory: `de56de86bf4e804d45289713a0087e4324ce75da5969669e8b5bf28e84948174`.
- Compiled inventory: `c6bd4e772aa54342e44c4e968970a1f9d920ab1cb8ea84ebf577ada316362fb3`.
- All **1,287 source / 2,124 compiled files** match before/after each phase.
  Existing audit: **19,476 passed / THREE unchanged failures / two skips**;
  70 new date-time cases and 63 newly selected existing text-line cases pass.
  **FULL SELECTED SUITE NOT GREEN.** Existing audit reused; no rerun.
- Private empty HOME/TMP were removed; native transport/cookies/query owners
  closed, document 484→0 nodes, both process groups absent. Offline paired JS
  denials and kernel seccomp active (`NoNewPrivs=1`, `Seccomp=2`), zero guard
  attempts. No resource callbacks, scripts, SafeJS, geometry, raster or actions.
- Both phases exit0 within 30s plus5s grace and 10MiB output caps; measured
  wall time live0.14s / reader0.13s, maximum RSS80,220 /82,812 KiB respectively.

## Failures, limitations and OPEN gates

No capture/reader failure occurred. Full-DOM comparison **not run**: its
authorization condition (reader failure before queries/extraction) was not met.
This is bounded native content inspection, not independent CSS conformance,
visual centering, generated positioning, geometry, rendering or resource/script
acceptance. Script omission is not proof of rendering. No browser comparison.

OPEN: parent-owned TestPages/generated-position investigation and production
work; independent rendering/CSS, SafeJS, TTY/PTY, device, credential and broader
website acceptance gates; original four-topic research and overall browser goal.
Parent owns global TASKS/inventory updates. Historical reports remain unchanged.
