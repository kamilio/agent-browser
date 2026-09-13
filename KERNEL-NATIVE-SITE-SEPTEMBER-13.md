# Kernel.org native original-asset test — September 13, 2026

**Incomplete: the probe exhausted its ten-request allowance before the homepage
committed.** This is a local test-scope limit, not an observed remote access block
or proof of a browser compatibility failure. No request allowance was widened,
original resource omitted, fallback navigation substituted or retry performed.

## Actual live run

One native `BrowserSession` full-loader attempt ran at
**22:16:40.351–22:16:45.071 UTC**, using the audited cursor runtime. All ten
authorized HTTPS GETs returned200;65903decoded/49123encoded bytes were retained.
All requests targeted `www.kernel.org:443`, with the native user agent, normal
certificate verification, no credential headers and at least502.21ms between
wire starts. There were no redirects or POSTs.

| Original path | Status | Decoded bytes |
| --- | ---: | ---: |
| `/` |200|20359|
| `/theme/css/main.css` |200|13860|
| `/theme/images/icons/downloadarrow_small.png` |200|1079|
| `/theme/images/logos/akamai.png` |200|4753|
| `/theme/images/logos/constellix-green-logo.png` |200|2420|
| `/theme/images/logos/fastly-logo.png` |200|1635|
| `/theme/css/normalize.css` |200|7369|
| `/theme/images/logos/serverscom.svg` |200|8121|
| `/theme/images/logos/google.png` |200|2972|
| `/theme/images/logos/redhat-community.png` |200|3335|

The next original image, `/theme/images/logos/thelinuxfoundation.png`, was rejected
locally **before an eleventh wire request**. The probe's stop latch prevented
homepage commit. The terminal error is `unsupported: Document loader failed`;
the retained underlying resource error is `assert(requests.length < 10)`.
This is not a server challenge, missing-image response or unsupported-PNG finding.

## What the browser observed

- The native loader parsed857nodes and title `The Linux Kernel Archives`.
- Original external CSS plus its import yielded151rules. Native style diagnostics
  include42unimplemented properties,15invalid/unimplemented values,2at-rules and
  2selectors. These counts are not a full formatting or winning-declaration trace.
- The image owner saw eight original images: seven completed and one rejected by
  the local request allowance. Original PNG/SVG response bytes were not replaced.
- One native script-element query found zero elements; script fetch/execution
  attempts remained zero. No SafeJS execution occurred.
- **Zero homepage commits, About discoveries, click calls, pointer events,
  geometry calls or formatting inspections.** The check did not reach discovery;
  it does not establish that an About link is absent.

No403/429/challenge/robots-denial was observed. That does not establish access to
unrequested pages or permission to evade a future barrier. HTTP200 responses alone
are not native geometry, clicking, navigation or whole-site acceptance.

## Evidence and cleanup

The runtime is `native-cursor-september13-round00/snapshot01/dist`, with the prior
**21,262passed/0failed/2unchangedskips** native gate. No native tests were rerun for
this live check. All20gate receipt entries and1311source/2132compiled files were
verified before and after; framework inventories match.

The single child exited1 with no signal, spawn error, watchdog trigger or output
overflow. Process group997129 is absent. Session, documents, queries, image owner,
transport and request queue close; tabs, pending loads, nodes, active requests,
image waiters and cookie entries are zero. Private HOME/TMP were empty and removed.
No unexpected JS capability, native-addon or child-process attempt occurred. The
live guard is JavaScript-enforced, **not an OS/kernel network sandbox**.

Evidence under `node_modules/.cache/native-validation/`:

- `native-kernel-site-september13/EVIDENCE.sha256`:46entries, digest
  `36e2315d11df8d2da335e5ebd79c464347dd37e639ac81d76528b8402cccae9c`.
- Its `SEAL.json` has a distinct digest
  `a258ce6505d5cba0c6bb1e22f06c75ea0df5e1f033865923720fb89a34166f9c`.
- `cursor-work-september13/KERNEL-VERIFICATION.json`: independent parent check at
  22:20:48.996UTC,4ledgers/3509entries verified, actual failure/cleanup preserved.

The retained lane is1661638bytes; original public bodies are separately hashed.
The4.71s/100068KiB observation is not a benchmark or speedup. Nothing is pushed.

## Follow-up

The captured native CSS diagnostics can guide an offline attribution pass without
new HTTP or fabricated missing assets. A later complete original-asset and About
pointer flow needs its own explicit scope and adequate resource allowance; it is
not authorized by silently extending this exhausted ten-request run. Preserve the
failure and all original resources. Rounded paint/hit integration is also still
open; architectural notes are in `cursor-work-september13/ROUNDED-INTEGRATION-NOTES.md`.
