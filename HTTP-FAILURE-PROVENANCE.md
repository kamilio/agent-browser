# Preserve received HTTP failures when content processing fails

The top-100 sweep saved an empty HTTP 403 from CNN with `Content-Length: 0`
and no Content-Type. Native research retained the response metadata but reported
only `outcome: failure`, with `unsupported` at the `loader` stage. The HTTP
outcome was assigned only after successful content extraction.

Research now establishes `http-failure` as soon as it summarizes a primary
response outside 200..299. It does not throw early or skip diagnostic content
loading. A later execution error still retains its category/stage and any
structured resource/policy diagnostic. Header and document challenges keep
their higher-priority `semantic-barrier` outcome, and 429 still stops without
retry. Successful 2xx content and 2xx loading failures retain their behavior.
An exception before a primary response arrives remains a non-HTTP failure.

For the saved CNN shape, the corrected result is:

```json
{
  "outcome": "http-failure",
  "contentSuccess": false,
  "failure": { "category": "unsupported", "stage": "loader" }
}
```

The response still has status 403, zero body bytes and no extracted content.
This is clearer failure provenance, not access recovery, MIME sniffing,
CAPTCHA handling or successful content retrieval. Its capture stays
evidence-only and cannot enter successful replay admission. No retry, request
budget, dependency, credential handling or page runtime changes.

## Validation scope

`reports/http-provenance-2026-09-15.json` records the clean-snapshot native
comparison and guarded offline proofs. The proof injects only the saved final
response into the actual native research pipeline; it does not reenact prior
redirects or contact CNN, Zoom or LinkedIn. Actual CLI invocations use the same
explicit injection under network-denying guards. Their expected exit is 1,
since an HTTP failure is still a failure to obtain content.

All 42 new tests pass. The final selected suite has 2,035 passed / 2 failed
across 23 explicit manifest files; all 1,995 prior case statuses match the
15-second-harness baseline. The two older body-capture assertions remain
unresolved. Build, strict types, configured formatting and lint pass.

The initial five-second baseline had one additional timeout in the existing
50,001-node headings case. A focused diagnostic confirmed the harness timeout;
the unchanged baseline and final candidate pass that case with a 15-second
test limit. Browser/navigation limits were not increased, and no speedup is
claimed. Initial new-test failures concerned Markdown punctuation escaping and
an oversized expected body pin; these fixture assertions were corrected.
Production output is identical across the two candidate iterations.

Four guarded offline children (two API and two actual CLI processes) supplied
ten saved primary responses, with zero network attempts. Both native/reader
CNN runs retain the empty 403 and loader diagnostic as `http-failure`, remaining
evidence-only. Zoom's 29,997 Markdown bytes and LinkedIn's semantic barrier are
unchanged. All children/process groups close, and source/compiled/receipt/body
pins remain unchanged. Only research-browser compiled artifacts change.

Original top-100 receipts, timings and result counts remain unchanged in
`reports/top100-websites-2026-09-15.md`. Source/body pins and cleanup are checked
separately from native unit tests. This does not establish a current full native
release, interactive website compatibility, rendered visibility, SafeJS,
credential/passkey-device, service/socket or TTY acceptance. TASKS.md retains
the broader content, performance and research goals.
