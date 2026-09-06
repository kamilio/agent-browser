# Node/Linux hidraw I/O: measured source boundaries

Documentation only, based on saved native-browser receipts from **September 5,
2026 (UTC)**. No device driver or real passkey success exists in this work.
The pinned sources below are not claims about latest releases, installed Node or
kernel versions, or publication dates. Existing evidence is not rewritten.

## Source facts and limits

**Node v22.22.0** (native lines 234–243, 280–310): `FileHandle.close()` waits for
pending handle operations before closing. The `createReadStream()` warning says
blocking-only character-device reads can prevent natural closure/process exit;
artificial stream termination does not cancel pending reads. That stream-specific
note is not a promise-read cancellation contract. Neither close nor the excerpt's
`AbortSignal` option proves interruption or bounded shutdown for hidraw.

**Linux v6.12** (native lines 46–180, 263–273, 341–387, 636–644): the empty-queue
read path checks signals and disappearance before returning `-EAGAIN` for
`O_NONBLOCK`; its per-open mutex is acquired first. Nonblocking therefore does not
bound all waiting. A positive read consumes one report, discarding any truncated
tail. Writes carry a report-number prefix and return delegated results; they are
reports, not a stream to repair with suffix writes. Shared `minors_rwsem` does not
serialize writers. Output/raw-request calls delegate beyond this file, with a
conditional `-ENOSYS` fallback. Release takes the exclusive lock and last-open
cleanup delegates close/power work. Neither these paths nor writable readiness
proves deadline bounds, pending-I/O interruption, or immediate release on close.

## Proposed design, not tested hardware behavior

- Consider one pending read and one pending write per owned handle, with explicit
  operation ordering and cleanup ownership; do not infer a kernel writer queue.
- Consider an **expected-size-plus-one sentinel** buffer, using the independently
  established OS input-report size including any applicable report ID. Accept only
  the expected count; reject shorter or larger results. This is an oversize
  detection idea, not lossless recovery or a measured device guarantee.
- Define short/zero-write failure policy before implementation; do not append a
  suffix or automatically resend an uncertain report. Treat deadline expiry,
  cancellation of actual I/O, and descriptor closure as separate obligations.

Keep existing boundaries in [Linux report bytes](LINUX-HIDRAW-REPORTS.md),
[FIDO packet framing](FIDO-HID-FRAMING.md),
[descriptor discovery](HID-DESCRIPTOR-DISCOVERY.md), and
[candidate report layouts](FIDO-HID-DESCRIPTOR.md). Those local prerequisites are not an
implemented hardware transport or acceptance result.

## Historical evidence and integrity

Evidence root: `node_modules/.cache/native-validation/node-hid-io-source/`.
The unchanged [Node report](node_modules/.cache/native-validation/node-hid-io-source/REPORT.md)
and [Linux report](node_modules/.cache/native-validation/node-hid-io-source/LINUX-HIDRAW.md)
preserve provenance. `PARENT-INTEGRITY.json` and `PARENT-LINUX-INTEGRITY.json`
record checks at **2026-09-05T23:49:45.933Z** and
**2026-09-06T00:05:05.378Z**, respectively, not new retrievals.

Each historical run made **one request**, HTTP 200, zero redirects, no classified
barrier, exit 0, empty stderr, `active: 0`, and `closed: true`. Both remain
**`partial: true`, `contentSuccess: null`, `outcome: extracted-unverified`**.
There was no retry or alternate endpoint. The native semantic reader had page
scripting disabled; closed transport and integrity checks are not content or
hardware validation.

### Node receipt

- Fixed URL: `https://raw.githubusercontent.com/nodejs/node/v22.22.0/doc/api/fs.md`.
- Run directory: `research/20260905T234240Z-node22-fs/` under the evidence root.
- Wrapper: **2026-09-05T23:43:33.074849861Z–2026-09-05T23:43:33.710325227Z**.
- Native run: **2026-09-05T23:43:33.383Z–2026-09-05T23:43:33.703Z**;
  primary response: **2026-09-05T23:43:33.693Z**.
- `stdout.jsonl`: **376,698 bytes**, SHA-256
  `4236fb5d92993beb213b0d71312ee13c93a6ba69e7cba641f607a8fa1ace45da`.
- Body: **269,901 decoded bytes**, **53,291 encoded bytes**; SHA-256
  `2116e13854c19f91b41c07dc81b94093992fe0b33c42f56c00a0794e28fcc0db`.
- Native extraction: **12,228 UTF-8 bytes**, SHA-256
  `5eba2cd697e70b871fec8f46da2b8c8fa850f603e449a08aef626eed2697ecde`.
- Selection: lines **1–420 of 8,521**, **12,216 selected code units** from
  **269,887 source code units**. Source-line references exclude the opening
  four-backtick renderer fence. The selection stops inside the options-read
  overload's history, before its contract; open flags are not established.

### Linux receipt

- Fixed URL: `https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/hid/hidraw.c`.
- Run directory: `research/linux-hidraw-20260905T235815.173526340Z/` under the evidence root.
- Wrapper: **2026-09-05T23:59:09.469038897Z–2026-09-05T23:59:09.886397371Z**.
- Native run: **2026-09-05T23:59:09.785Z–2026-09-05T23:59:09.879Z**;
  primary response: **2026-09-05T23:59:09.872Z**.
- `stdout.jsonl`: **42,700 bytes**, SHA-256
  `be64a064f62fe3f386c4b8d4d1d1e08bb75508fe43460980dceca70af3cdd8b0`.
- Body: **15,806 decoded bytes**, **4,356 encoded bytes**; SHA-256
  `282e5b5f16bd16c940abc47cef0b8d9031639c88f375173ed2b48903d21c1efa`.
- Native extraction: **15,814 UTF-8 bytes/code units**, SHA-256
  `bc2a8b2bcd4d3c9caa42699907aa2ae2389f3acffc53621a5bbd66a787cdf32d`.
- No range/selector argument; native lines **1–690** exclude triple-backtick
  fences. Reader source/text metadata: **15,806 code units**. Apparent full extent
  does not override partial/unverified status or authenticate upstream authorship.

Both responses are gzip, `text/plain; charset=utf-8`. Body hash scope is
`transport-decoded-body-before-loader`, not compressed wire bytes. Extraction
hashes include renderer fences. Receipt sizes/digests and extraction/body hashes
were statically checked against saved parent reports; all 25 entries in
`FINAL-SHA256SUMS` matched. Captured bodies were decoded only into bytes for
length/hash comparison, never into fallback source text. Only saved native
`extraction.content` supplied source text. No new request or probe ran.

## Remaining gates

Separately establish Node numeric open-flag propagation, error mapping and
readiness integration; ioctl ABI, sysfs/device association, permissions and exact
descriptor/report IDs and sizes; short/zero I/O and disconnect behavior; delegated
driver timing, actual abort, close races and bounded shutdown. Then obtain explicit
authorization for device access and trusted human consent/PIN/touch/UV, and real
relying-party passkey acceptance. Native tests would not clear those gates.
No runtime, test, device, network, socket, TTY/PTY or SafeJS probe, dependency,
other browser, or installed-version check is part of this documentation work.
