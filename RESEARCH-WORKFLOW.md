# Structured and paced native research

The research helper uses this repository's native transport, document loader and
extractor. It does not use a remote browser or a host HTML parser. New options
expose structured table evidence and deliberate request spacing without changing
the default Markdown report or treating access challenges as successful content.

```sh
node dist/scripts/research-browser.js --reader --format json --table-metadata --min-request-interval-ms 250 https://example.com/one https://example.com/two
```

This is an invocation example, not an executed website check. Build through the
repository's existing build workflow first; runtime code is emitted under dist.
Do not invoke raw TypeScript compilation without an output directory.

## Structured output

- `--format markdown|json` selects the extraction payload inside the existing
  JSONL research report; Markdown remains the default.
- `--table-metadata` requires JSON and retains bounded source header/span strings
  described in TABLE-SOURCE-METADATA.md. It does not reconstruct a grid or prove
  compatibility relationships. The reader retains its explicit limitations.
- JSON supports the existing selector, heading-section and text-line selection
  paths. Format/table flags cannot accompany heading or text-line discovery;
  they would otherwise be ignored. The long-v1 heading-capture profile therefore
  rejects these extraction flags. Pacing remains available for that profile.
- Challenge classification examines bounded document text, then bounded semantic
  text from the selected extraction, never JSON property names or serialized
  metadata. Whole-document prechecks prevent a narrow JSON selection from hiding
  an access warning; selected-text checks also catch warnings beyond that prefix.
- Empty structured content reports empty-extraction; text, images, separators,
  tables or source table metadata make a structured payload nonempty. All
  successful extractions remain partial and extracted-unverified.

## Pacing

`--min-request-interval-ms N` accepts canonical decimal integers from 0 through
60000. Omission or zero disables pacing. Repeated or malformed flags reject
before navigation. Pacing adds latency; no throughput improvement is implied.

The command-line batch spaces navigation-start grants per normalized requested
origin, so sequential visits to the same origin do not reset that cooldown.
Other requested origins are independent. Each navigation's native transport
also applies the interval to its own actual-hop admission, including redirects
and requested subresources. This uses the bounded scheduler in REQUEST-PACING.md.

These are separate scheduling scopes: cross-session redirect destinations are
not globally coordinated, and grants cannot guarantee packet-arrival spacing.
The helper does not coordinate other processes/agents, retry blocked responses,
schedule Retry-After waits, change identities/fingerprints or solve CAPTCHAs.
Existing login/challenge diagnostics still request user handoff.

Batch waits count against the overall command deadline; each navigation retains
its own timeout, with transport waits included. Aborting the supplied signal
interrupts a pending batch grant. Consumers of the async generator should pass
a signal to cancel an outstanding next call; returning after a yielded report
closes the batch pacer.

The batch ends after yielding a challenge/access-barrier report or any HTTP 429
response, including a 429 without challenge markers. Remaining URLs, even on
other origins, are not requested; no skipped reports are fabricated. The stop
decision is captured before yielding, so mutating a returned report cannot
restart the batch. Earlier reports remain available. Ordinary unclassified HTTP
500 responses do not stop subsequent explicitly requested URLs. This prevents
continued batch traffic after a detected restriction; it does not solve a
challenge, automatically retry, or prove fewer blocks in live use.

RESEARCH-RATE-LIMIT.md describes the subsequent early 429 stop: primary error
pages are not parsed, stylesheet rate limits also end the batch, and bounded
Retry-After advice is reported without sleeping or issuing another request.

## Programmatic entry points

`researchNavigation` retains its first ten positional parameters and accepts an
optional eleventh `ResearchExecutionOptions` object with `format`, `tableMetadata`
and `minRequestIntervalMs`. False tableMetadata is a no-op. Invalid values reject
before transport construction; true table metadata still requires JSON.

`researchBatch(args, signal?)` accepts the same argument array as the CLI and
yields research reports. The CLI consumes this generator. Its batch pacing does
not replace the per-navigation transport limits or the existing output writer.

For a separately admitted capture, RESEARCH-JSON-REPLAY.md describes bounded
selector/section JSON extraction without a second request. Failed or blocked
receipts are not promoted to usable captures by that helper.

## Validation

On September 11, 2026, production build, strict types for 15 selected test roots
and three-file lint pass. All 196 new cases pass: 127 JSON workflow cases and
69 batch/pacing cases. These include native/reader selected-text challenge
regressions beyond the document prefix and Markdown parity controls.

The broader 16-file native run reports 1489 passed and three failures out of
1492 tests. The three failures are unchanged selector assertions that reject
existing resource-limit diagnostic details. An independent committed d02fbc3
run reproduces exactly all 118 selector outcomes, including those three failures.
The original 16-root type check also has 13 unchanged selector union-narrowing
errors, reproduced byte-for-byte on that baseline; the passing 15-root check
excludes only that file. Neither full16 check is represented as green.

All 980 isolated source inputs remain unchanged, and the three feature source/
test files match the working tree. Evidence and earlier failures are retained in
`node_modules/.cache/native-validation/native-research-workflow-september11-round03/`
and its preceding lanes. The native run interval is 04:00:42.188–04:01:28.349 UTC.
No website, real socket, page runtime, credential or device probe is part of
these tests; no performance or reduced-block result follows from them.

The subsequent batch-stop check on September 11, 2026 at
04:54:21.840–04:54:32.562 UTC passes production build, strict types for six test
roots, two-file lint and all 561 cases in six explicitly selected native test
files. The batch/pacing file now has 80 passing cases, including 11 new terminal
response regressions. All 984 isolated source inputs remain unchanged. Evidence:
`node_modules/.cache/native-validation/native-research-batch-stop-september11/`.
This focused check excludes the existing selector failures described above and
is not a full-repository or live-website pass.

## Bounded omitted raw text

`--reader-raw-policy separate-omitted-raw-v1` is an explicit reader-only option
that separates omitted nonentity raw text from the text quota while retaining
source limits and adding bounded raw scanning/work accounting. All default and
long-v1 admission restrictions remain unchanged. Programmatic execution uses
readerRawPolicy. READER-OMITTED-RAW.md describes the precise contract, 222 new
tests and propagation into eligible capture replay; SWE-BENCH-READER-RECOVERY.md
records a fresh successful website check. No-policy report shapes stay unchanged.
