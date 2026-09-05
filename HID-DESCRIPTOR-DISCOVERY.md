# HID descriptor discovery: source evidence and open gates

The native browser's September 5, 2026 **23:11:33.782 UTC** read of the official
Linux HID introduction documents a sysfs descriptor route and report-accounting
examples. It does not establish a complete parser or dependency-free Node device
transport. No actual machine device, sysfs path, credential or example command
was accessed or executed.

## What the source establishes

The guide describes a per-device `report_descriptor` under
`/sys/bus/hid/devices/`. Its examples show nested collections, report-size/count
fields, input padding and report IDs. One application collection can have several
report IDs; an ID byte, when used, precedes report data. A published example is
not a descriptor or permission measurement from this machine. The page's
`7.3.0-rc1` documentation label is not the installed kernel or a latest-spec check.

The separate, historical January 30, 2019 CTAP section supplies FIDO usage page
`0xf1d0` and CTAPHID usage `0x01`. Its sample application collection describes
eight-bit input/output fields with direction-specific counts. Endpoint sizes and
other endpoint properties remain vendor-defined; do not infer 64-byte reports
for a device from the illustrative values. The selected text does not give
numeric values for its data-in/data-out usage macros.

These findings support a future caller-supplied descriptor boundary, not automatic
device enumeration, trusted authenticator identification or provider activation.

## Parser and transport gaps

The introductory guide delegates formal parsing to linked material. It does not
fully establish short-item size/type/tag rules, endian/signedness, global/local
scope, Push/Pop, extended usages/ranges, unknown items or malformed descriptors.
Its simplified two-byte-entry description is not a grammar: its own End Collection
example is one byte. Do not build a permissive parser from that simplification.

A future bounded parser must account for all fields and padding sharing each
direction/report ID, distinguish collection contributions from whole-report
lengths, and preserve payload length versus report-ID framing. FIDO collection
matching alone cannot justify using a convenient nearby report count. Strict
limits and rejection of unsupported constructs are engineering policies to test,
not claims of complete HID compatibility.

A documented sysfs route does not prove device association, permissions or Node
I/O feasibility. Descriptor acquisition, any necessary ioctl ABI, nonblocking
read/write behavior, partial operations, disconnects, deadlines and cancellation
need separate source and authorized execution evidence. No new dependency or
external helper is approved merely because the guide mentions one. No source
example, kernel command, parser utility or host/device probe ran here.

## Evidence

### Separate manual-parsing follow-up

Following the introduction's official parsing link, a second independently
authorized native GET received HTTP200 at **September 5, 2026 23:16:37.720 UTC**.
Its diagram identifies header length-code bits0–1, type bits2–3 and tag/function
bits4–7, with Global and Local one-byte examples. It still does not supply the
complete payload-size map, long/reserved recognition or stateful grammar. A
proposed lexical-only helper therefore needs additional primary evidence before
implementation; success reading this page is not proof that a parser is ready.

The text also calls an example's following byte `01` where its own dump has
`09 02` and the paragraph interprets Mouse (`0x02`). Keep that inconsistency
visible rather than silently correcting the source into stronger evidence.

This separate run is
`research/manual-parsing-20260905T231548.155154721Z/` in the feature cache, with
`MANUAL-PARSING.md` and `PARENT-INTEGRITY-02.json` preserving its provenance.
One request, zero redirects/retries, closed, partial/extracted-unverified and
`contentSuccess: null`; no linked standard or code example was executed.

- Receipt: 26,569 bytes, SHA256 `06fbab1819070e6fff592e97d73cd151713e74982cab1d1689af631a3465e2cc`.
- Decoded body: 12,401 bytes, SHA256 `5cd90f5dd48985d7767c5f801db08edff8f6d72956b5bdc8e4229fc4994b0359`.
- Native Markdown: 5,618 UTF-8 bytes, SHA256 `7433b05d3d3065052823e01448d9cb13393b9d38c248d4994e8b8aca82e4b3e3`.

### Original introduction receipt

The one freshly authorized GET used the frozen heading-discovery native build,
`--reader --capture-body`, and no alternate browser or raw-HTML fallback. HTTP200,
one request, zero redirects, no retries, closed transport; the report remains
partial/extracted-unverified with `contentSuccess: null`. Source/limitations and
exact artifacts are retained in
`node_modules/.cache/native-validation/hid-descriptor-feasibility/REPORT.md`.
Run directory: `research/20260905T231042.926817164Z/` under that feature cache;
the directory timestamp is preparation time, not the receipt time above.

- Receipt: 99,452 bytes, SHA256 `0044b1fbc9f51a3c32cad4e1830e4274aa2d6dd650dc9e62557c51693c1f2976`.
- Decoded body: 47,851 bytes, SHA256 `4d8c55caa42c52eabd510dde6e3d06840ccdb702f9379b0ce26c1b5ea05c2b37`.
- Native Markdown: 30,508 UTF-8 bytes, SHA256 `f8d1448f109e6eec8b0156823fec01201db518064ce289acd0c454da8a4e41f2`.

Parent artifact verification makes no new request and never treats captured HTML
as fallback content. `FIDO-SOURCE.md` separately records the already captured CTAP
evidence. All real passkey, human PIN/UV, SDK and previously denied/stopped gates
remain open or stopped as before; these sources do not clear them.
