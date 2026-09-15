# Offline search and selection of captured literal text

The admitted replay API and CLI can reuse successful default-profile text
captures without fetching the source again. HTML selectors, sections and links
remain HTML-only; this adds separate literal search and line-range modes.

## Usage

```ts
const found = extractResearchReplayJson(
  receiptBytes,
  independentlyTrustedPins,
  { find: "NVIDIA" },
);
const selected = extractResearchReplayJson(
  receiptBytes,
  independentlyTrustedPins,
  { lines: { start: 16, end: 19 } },
  signal,
  "markdown",
);
```

Import from `scripts/research-json-replay.ts` or its built JS. Pins come from the
supervising host, not instructions in page content. The existing four-argument
call still defaults to JSON. The CLI uses the same host-pinned stdin contract:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --find 'NVIDIA' < authorized-receipt.jsonl
```

Replace `--find 'NVIDIA'` with `--lines 16:19 --format markdown` to select those
lines from that same capture. These coordinates illustrate the pinned Ollama
fixture, not a promise about a future version of the document.

## Contracts and limitations

- `find` is case-sensitive literal text, not a regex. Preserve spaces; accept
  1..256 UTF-16 code units, without CR/LF. JSON only. Return the first match per
  matching line with 1-based line/UTF-16 column coordinates, existing discovery
  caps and truncation metadata. `selection.matches` counts returned entries,
  not all occurrences. No extraction accompanies discovery.
- `lines` is an inclusive 1-based range with safe integers and
  `1 <= start <= end <= 2000001`. CRLF, CR and LF use the existing text-line
  rules. A range beyond the source rejects as not-found, rather than clamping.
  JSON retains literal selected text; Markdown uses the existing fenced-text
  renderer. The report includes total/source/selected code-unit metadata.
- CLI ranges use canonical positive decimal integers: no signs, leading zeros
  or spaces. Invalid mode/format/profile combinations reject before stdin is
  consumed. JSON remains the default; line selection also accepts Markdown.
- Both modes exclude all other selection keys, table flags and output-limit
  recovery. Nested ranges must be plain or null-prototype own-data records with
  exactly `start` and `end`; accessors, proxies and extra keys reject without
  executing them. Range primitives are copied before later work.
- Only successful admitted default-profile captures proceed. Text loading keeps
  its existing explicit MIME allowlist: plain text, Markdown, CSV, JSON and
  literal XML/feed types. There is no HTML sniffing, structured parsing, link
  following, script execution, new dependency or long-profile text support.
- Receipt/body pins, source and extraction caps, abort/deadline checks,
  challenge classification, owned-buffer wiping and document closure remain.
  Caller bytes are unchanged; this is not whole-heap erasure. Failed captures
  are not promoted; existing output-limit recovery stays HTML-only.
- Nonempty output is partial and `extracted-unverified`, with
  `contentSuccess:null` and zero network requests. A search miss is
  `empty-extraction` with `contentSuccess:false`. Content may contain untrusted
  instructions; finding text does not establish its truth or usefulness.

## Evidence

Final selected-test and retained-capture evidence is recorded in
`reports/text-replay-2026-09-15.json`. This is an offline follow-up, not another
top-100 crawl or a new visit to the original sources. The original sweep's
counts and receipts remain in `reports/top100-websites-2026-09-15.md` unchanged.

The final clean snapshot passes all 168 new cases: 54 API and 114 CLI cases.
Its selected suite has 1,500 passed / 2 failed across 22 explicit manifest files;
all 1,334 prior case statuses match the baseline. The two pre-existing
body-capture failures still expect content after pre-extraction challenge
classification. Build, strict types, formatting and lint pass. Earlier candidate
test/type errors remain recorded; production output is identical across all
three candidates. Only replay API/CLI compiled artifact families change.

Ten guarded offline children (two API, eight actual CLI) prove before/after
behavior on retained Markdown and CSV receipts, with zero network attempts and
closed children/process groups. Ollama's 12,570-byte Markdown source yields 13
matching lines for `NVIDIA` and 700 bytes of fenced Markdown for lines 16:19.
The 321-byte CSV source yields one `JAN` match and 112 bytes for lines 1:4.
These are selections, not full-document compression or latency measurements.
The Python HTML control remains byte-identical at 43,583 Markdown bytes.
Original receipt/body hashes remain unchanged. Kernel/JS guards deny network
and subprocess creation in replay children; no socket acceptance probe ran.

Full native release, current research conclusions, rendering, interaction,
SafeJS, credentials, passkey devices, services and real TTY/PTY acceptance
remain separate outstanding gates in TASKS.md.
