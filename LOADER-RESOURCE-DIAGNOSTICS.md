# Native loader resource diagnostics

The native research CLI can now identify selected resource failures through
`failure.resourceLimit`, alongside its existing `category` and `stage`. This is
diagnostic metadata, not a larger budget, retry, successful extraction or an
indication that every resource failure has been instrumented.

```json
{
  "category": "resource-limit",
  "stage": "loader",
  "resourceLimit": {
    "kind": "reader.text",
    "unit": "code-units",
    "limit": 1000000,
    "observed": 1057108
  }
}
```

## Measurement rules

`src/resource-limit.ts` creates ordinary `AgentBrowserError` instances with their
existing category and message. A private weak map associates native-created error
identities with frozen, enumerated diagnostic records. Lookup does not inspect
error properties, getters, prototypes or proxy targets. Copying an error, setting
a similarly named property or wrapping it in a proxy does not copy the record.
The research report never copies an error message into this metadata.

Only nonnegative safe-integer limits and strictly larger safe-integer observations
are recorded. Invalid, non-exceeded or unrepresentable measurements leave the
original resource error unannotated. Records contain no document text, URL,
credential value, arbitrary nested object or source excerpt. These helpers are
internal module exports, not new root-package exports or guest APIs.

Supported loader sites:

| Kind | Measurement |
| --- | --- |
| `reader.source`, `reader.decoded` | Original decoded UTF-16 source length |
| `reader.text` | Cumulative reader text, including charged omitted/raw text |
| `reader.output` | Cumulative escaped output length |
| `reader.tokens` | Tokens charged before processing |
| `reader.depth` | Checked open-element or omitted-subtree stack length |
| `reader.encoded`, `text.encoded`, `html.encoded` | Response body byte length |
| `text.decoded` | Decoded text length before document construction |
| `html.source` | Original source length before normalization |
| `html.work` | Cumulative tokenizer input work, including repeated work |
| `html.tokens` | Charged tokenizer results |
| `html.attributes` | Attribute attempts, including duplicates |
| `html.writes`, `html.write-source` | Write attempts or cumulative source length |
| `document.nodes` | Attempted single-node or attribute allocation count |
| `document.text` | Prospective text usage at the central text-budget check |
| `document.depth` | Checked insertion/fragment/replacement depth |

Code-unit counts mean UTF-16 units, not Unicode code points or UTF-8 bytes.
The legacy `encoded` error names refer here to the already transport-decoded
response body: they do **not** measure gzip/compressed wire bytes. The reader's
non-HTML decoded limit records the effective minimum of its applicable bounds.
An observation is the count at rejection; it need not be exactly `limit + 1`.

Existing check ordering, abort precedence, sticky parser-write failures, cleanup,
messages and all quotas remain unchanged. No source-dependent diagnostic object
is allocated on successful checks. The reader check avoids a per-call rest array.
No throughput or memory improvement has been benchmarked.

Shared document pools, several bulk/template-copy checks, global node-identifier
exhaustion, formatting bounds, reprocessing guards and other browser subsystems
can still return generic resource errors. A node-ID-only failure is not falsely
reported as a node-count violation. The helper recognizes a reprocessing kind
for bounded metadata, but the existing parser guard does not emit it: it lacks a
strictly exceeded pass measurement. Absence of metadata does not identify a cause.

## Validation and evidence

Evidence lives under
`node_modules/.cache/native-validation/loader-resource-diagnostics/`.
The clean snapshot excludes unrelated pending changes and the two uncommitted
parent-RP test entries. Its named native scope contains 13 manifest-listed files,
including four new suites. Both runs passed 529 cases: 110 new, 419 existing,
zero failures or skips. Build and strict new-suite type checks also passed.
Final validation status and preserved receipts are recorded in `CURRENT.md` in
that evidence directory. No whole-manifest, socket or SafeJS acceptance follows.

On September 5, 2026, a separately authorized offline replay used the exact saved
1,929,966-byte Fetch-standard response received at 11:41:06.948 UTC. With unchanged
limits, it reported `reader.text`, limit 1,000,000 and observed 1,057,108. This
diagnoses that saved input with the instrumented loader; the original receipt
still records only a generic loader resource failure. No new fetch, script or
extraction occurred, and no historical path, timestamp or outcome was rewritten.

The separately authorized hardware follow-up read the ordinary NVIDIA Spark
Known Issues link using the frozen native browser. Its HTTP 200 response produced
37,578 transport-decoded bytes with verified capture hash, but remains a partial,
unverified extraction. The source's memory-accounting, power-adapter and software
compatibility cautions inform future hardware measurements, not a purchasing
winner or measured LLM performance. See `research/hardware/REPORT.md` within this
evidence directory. Reddit, Astra, stopped X and denied runtime/device gates remain
unchanged. The complete browser goal remains open.
