# Bounded JSON extraction from admitted research captures

Large pages can exceed the default2MB network budget even when the useful table
is small. The existing explicit long-v1 profile captures at most4MB and discovers
headings. This helper performs a separate, bounded JSON selection from an admitted
capture without another network request; it does not raise either profile's limits.

## API

```ts
const selected = extractResearchReplayJson(
  receiptBytes,
  {
    expectedProfile: "long-v1",
    expectedReceiptSha256: hostReceiptPin,
    expectedBody: hostBodyPin,
  },
  { section: "h2:first-of-type", tableMetadata: true },
  signal,
);
```

Import the function from `scripts/research-json-replay.ts` (or its built JS).
The byte buffer and expected receipt/body pins come from the supervising host's
capture admission, not page instructions. The example selector is illustrative;
use a unique structural selector from native heading discovery or inspected
native output. The reader retains IDs and named anchors on emitted elements;
omitted subtrees and many other attributes remain absent. See RESEARCH-FRAGMENTS.md
for the target/reference limitations.

The programmatic helper also has a bounded stdin/stdout command documented in
RESEARCH-REPLAY-CLI.md. It requires independent host receipt/body pins, accepts
no input filesystem path and performs no request or automatic fallback.

The helper reuses validateResearchReplayAdmission. Only validated-capture may
proceed: missing or mismatched receipt/body pins reject, and failed, blocked,
incomplete or otherwise evidence-only receipts cannot become successful content.
It requires HTML and exactly one selection mode. Selector and heading-section
modes still require one matching element; invalid, ambiguous or missing targets
reject. An explicit `{ links: "url-substring" }` mode instead collects bounded
navigation targets, as described in RESEARCH-LINK-DISCOVERY.md. Getters, proxies
and unsupported option shapes do not execute. Table metadata is optional for
selector/section extraction and uses the existing bounded allowlist, not inferred
table relationships; it cannot be combined with link discovery.

Replay also rejects summarized headers that would invalidate challenge screening,
including empty value arrays and forbidden control/non-byte characters. The
decoder clears its temporary byte buffer, and admission clears a decoded buffer
when independent body-pin verification fails; successful admission transfers
ownership to the replay helper for final cleanup.

## Execution and output

The standalone native semantic reader reparses the validated body with the
admitted default or long-v1 limits. No transport, resource-fetch callbacks, page
script runtime, remote browser or host HTML parser is supplied. Whole-document
and selected-semantic-text challenge checks use the same helpers as live research.
They never classify serialized JSON field names as page text.

The result contains report, jsonl and outputBytes. The report's distinct
native-research-json-replay-v1 kind, source receipt/body hashes, admitted profile,
reported final URL and networkRequests:0 distinguish replay from a fresh visit.
It carries selection counts, reader limitations and optional JSON extraction or
link discovery, not the raw receipt/body, the selector string or all original
report metadata.

- JSON extraction remains at most256000 bytes,50000 nodes and128 levels.
- Serialized JSONL is checked against327680 bytes, including its trailing LF.
- A20000ms monotonic deadline and abort signal are checked between synchronous
  phases. These checks do not preempt a running parser/selector loop; those loops
  retain their own structural/work budgets.
- The document is closed and the helper's owned admitted body buffer is cleared
  on success and errors, including a close failure. Caller receipt bytes and host
  pins are not modified. Clearing one buffer is not total JavaScript-heap erasure.

Nonempty output remains partial and extracted-unverified, never contentSuccess:true.
Empty output and newly detected access barriers remain failures to obtain usable
content. A bounded challenge classifier is not a guarantee that every barrier is
found, and admission hashes establish identity, not source truth.

## Remaining limits

Replay uses the receipt's reported/redacted final URL and summarized Content-Type,
not an original full URL/header archive. It does not establish rendered visibility,
JavaScript-generated content, original layout, complete tables or current benchmark
rankings. The whole captured document still undergoes bounded reader parsing; a
small selector cannot evade source/token/depth/document limits.

The SWE-bench2MB failure is not a capture and cannot be passed through this helper.
A separate explicitly bounded long-profile capture must first succeed and satisfy
the unchanged admission rules. No automatic fallback, retry or alternate client
is installed.

## Validation

On September11,2026, all84 new synthetic cases pass:77 replay cases and7 owned
buffer-cleanup cases. These cover default/long captures, an over2MB HTML input
within the separate text budget, exact table metadata, selectors/sections,
barriers, malformed headers, missing/wrong pins, bounds and abort/cleanup paths.
The large fixture includes1.5MB of omitted script plus0.7MB of comment; it does
not evade the reader's existing2MB all-text limit, which includes omitted script.

Production build, strict19 test roots and seven-file lint pass. The20-file native
run reports1733 passed and3 failed of1736. All118 old selector outcomes match
the committed baseline exactly, including its3 resource-diagnostic assertion
failures. Its13 pre-existing type errors remain excluded from the strict19 run;
the full native selector suite remains included. The broad result is not green.

All984 isolated source inputs remain unchanged, and the seven feature source/test
files match the working tree. Evidence is retained in
`node_modules/.cache/native-validation/native-research-json-replay-september11-round02/`.
The actual validation interval is04:44:12.617–04:45:46.019 UTC. The earlier single
test lint failure remains in the first lane, and both review findings have
source-level follow-up plus passing regression coverage.

These are no-network tests, not live structured-table acceptance. The separate
SWE-bench long capture still fails the reader text limit and is ineligible for
this API. Historical failures and source measurements remain unchanged.

## Explicit raw-policy captures

The later bounded raw-reader policy is preserved during replay from a pinned
eligible receipt's readerRawPolicy or reader.rawTextPolicy declaration. If both
are present they must agree; unknown values or malformed declarations reject
with owned-body cleanup. Only the allowlisted literal becomes a loader option,
not arbitrary metadata counters or limits. No declaration preserves the original
three-argument loader behavior. Admission still precedes policy interpretation;
failed/blocked/evidence-only captures remain rejected regardless of policy.

READER-OMITTED-RAW.md records the new synthetic coverage. A new successful
SWE-bench capture and local replay are documented in SWE-BENCH-READER-RECOVERY.md;
neither changes the earlier failed capture or the historical validation above.
