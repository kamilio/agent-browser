# Bounded FIDO HID candidate layouts

`src/fido-hid-descriptor.ts` adds internal
`discoverFidoHidReportLayouts(bytes)` above the owned short-item tokenizer. It
returns ordered candidate collection offsets and independent input/output
`reportId` / `reportBytes` metadata. Payload lengths exclude the HID report-ID
prefix; neither those IDs nor collection offsets are FIDO channel identifiers.
This does not select, open, trust or activate an authenticator.

## Deliberately narrow subset

The parser tracks balanced collections, global Push/Pop, logical bounds, usage
pages, local declarations and per-direction/report-ID bit totals. Every field
contributes to its report, including padding and unrelated application fields.
Local state resets after each Main item. Nested Application collections replace
ownership; other nested collections retain their nearest Application owner.

A candidate is an Application collection with usage page `0xf1d0`, usage `1`.
It must exclusively own exactly one complete input report and one complete output
report. Each selected field must be 8-bit Data/Variable/Absolute, have logical
bounds 0–255 and declare only FIDO-page usages. The complete payload must be
7–64 bytes. Split fields, distinct input/output IDs, asymmetric lengths and
multiple independently numbered candidate collections are supported. Shared
reports, including another FIDO collection's contribution, are refused rather
than reporting a misleading partial payload length. Feature reports participate
in structural accounting but are not selected as transport reports.

Numeric data-in/data-out usage IDs are **not** verified: the captured CTAP example
names those macros without resolving their values. Metadata is only a candidate
for later qualification, not complete FIDO or HID conformance. An empty result
does not certify an arbitrary descriptor as valid.

Ranges are bounded intervals, never expanded into one allocation per usage.
Their ordering follows completion at Usage Maximum, not reservation at Minimum.
Short 1/2-byte endpoints may mix; 4-byte extended endpoints must be paired with
4-byte endpoints. Crossing short and extended categories is unsupported. Pending
short local usages also prevent ambiguous Usage Page changes, including Pop.
These are conservative candidate policies, not universal malformed-HID claims.

Other policy refusals include mixed unnumbered/numbered declared fields, unknown
tags, unsupported local metadata and fields without an Application owner.
Unbalanced stacks, unresolved/reversed ranges, zero/invalid report IDs and invalid
payload widths fail. An error anywhere rejects the entire call; an earlier
candidate is never returned as a successful partial prefix.

## Resource and ownership limits

The tokenizer first enforces its 4096-byte/item bounds and owned input bytes.
Additional limits are 32 stack levels, 256 collections, 1024 fields, 256 report
groups, 256 local declarations and 65,536 bits per report group. Arithmetic is
checked before accumulation; no work is proportional to an untrusted report count
or the numeric span of a usage range. Returned metadata is newly allocated and
does not alias descriptor bytes or state from another call.

Failures use fixed `invalid-input`, `unsupported` or `resource-limit` errors;
tokenizer errors retain their safe framing categories. Raw descriptor bytes,
hostile exception text and partial layouts are not included in errors.

## Native-browser evidence

This increment uses previously captured native plaintext, with no new source
request or raw-body decoding fallback. The Linux `v6.12` header/core receipts are
September 5, 2026 at 23:21:13.878 and 23:22:06.332 UTC. Their parser implementation
informs state restoration, logical signedness, Main-local reset, collection
ownership and whole-report accounting. The CTAP2 January 30, 2019 USB section,
retrieved at 23:00:34.562 UTC that day, supplies the FIDO application identity and
illustrative byte reports. These are fixed historical sources, not latest-spec,
installed-kernel or real-device evidence.

All three reads were separately authorized native requests, HTTP 200, closed,
partial/extracted-unverified. See `HID-SHORT-ITEMS.md` and `HEADING-DISCOVERY.md`
for preserved request paths, receipt/body identities and extraction limits.
The source excerpts' SHA256 identities are:

- Linux header: `25f5733fca0bb5a61e5252dd654daf1d0d1513372528b932119b9bf40d5f9943`.
- Linux core: `596365e485dae7634396f2d76036742c23e8eb03c6a68d805c2dace7a2c3bfb0`.
- CTAP USB section: `527902104d1b22278ddf0973f2e2b4fa0f66d832b692d69cd45671519e698d64`.

The Linux implementation's raw range endpoints and maximum-item width do not
support independently normalizing mixed short/extended endpoints. Review found
that doing so could invent FIDO collection identity or field qualification.
The final implementation refuses that ambiguity instead of copying kernel
clamping/overflow behavior or asserting an unverified interpretation.

## Scoped validation

On clean base `76225f5`, the exact three-file native scope passes **123 cases,
zero failures or skips**: 96 descriptor unit cases, three descriptor-to-framing
integration cases, and 24 existing tokenizer cases. Both new tests are explicitly
listed in `native-tests.json`. The integration cases exercise unnumbered and
asymmetric numbered reports through packet encoding, hidraw byte normalization,
fresh per-message assembly and KEEPALIVE decoding. They do not execute CBOR,
perform a transaction or establish human presence.

The initial 115-case pass remains recorded separately: passing those tests did
not establish mixed-endpoint semantics. Eight additional parameterized regressions
cover both crossed categories at collection identification, input/output field
qualification and late failure after a valid candidate. Positive controls use
independent numbered reports so unrelated group restrictions cannot mask failure.
The earlier range-completion-order correction also has explicit regressions.

Focused dependency-closure compilation, strict new-test typing and three-file
Biome all pass. This is not a whole-package build or full native-manifest run.
Original and final clean snapshots, static reviews and execution logs remain
separate under `node_modules/.cache/native-validation/fido-hid-descriptor/`.

## Still required

Trusted device selection and descriptor acquisition, Node/Linux physical I/O,
permissions, ioctl/readiness behavior, bounded read/write/cancellation, transaction
ownership/deadlines, nonce generation, CBOR and trusted human PIN/UV/consent remain
open. No actual device, sysfs, SDK, credentials, socket or TTY probe occurred here.
No password/passkey provider was activated; no previously denied or stopped gate
was reopened. The complete browser and passkey goal remains active.
