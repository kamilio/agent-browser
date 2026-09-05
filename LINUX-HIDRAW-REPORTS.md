# Linux hidraw report-byte boundary

Linux hidraw report I/O and FIDO HID packet bytes have different boundaries.
The internal `src/linux-hidraw-reports.ts` codec makes that distinction explicit
without opening a device or claiming to implement a Linux transport driver.

## Contract

- `encodeLinuxHidrawOutputReport(report, reportBytes, reportId = 0)` accepts exactly
  `reportBytes` bytes and returns an independent buffer with the report ID prepended.
  Unnumbered output still needs a leading zero; numbered output uses its specified ID.
- `decodeLinuxHidrawInputReport(bytes, reportBytes, reportId = 0)` requires exactly
  `reportBytes` bytes for unnumbered input and does not remove a leading byte.
  Numbered input instead requires `reportBytes + 1` bytes and its exact expected
  report-ID prefix. It removes only that prefix and returns an independent report.
- `reportBytes` is mandatory and uses the existing FIDO subset's strict 7–64 range.
  Report ID is an integer 0–255 without coercion; zero designates unnumbered mode.
  The caller supplies qualified metadata separately for each direction. No default
  64-byte device assumption, discovery or descriptor-to-report-size derivation.
- Wrong IDs and short/long buffers reject rather than truncate, pad or silently
  route traffic. This exact-buffer policy is a codec contract, not a claim about
  kernel short-read, short-write or truncation behavior.
- The codec does not validate CID, command, sequence or payload semantics. Packet
  decoding and assembly remain separate. It is not a generic unlimited HID codec.

Intrinsic byte-view admission rejects proxies, nonbyte, shared and detached inputs;
genuine offset/Buffer/cross-realm views retain their byte window without invoking
input getters, iterators or species. Copies are bounded and independent, inputs
are not mutated or retained, and invalid input produces a fixed safe error.
This is not protection against a compromised trusted host's global intrinsics.

## Documentary evidence

Official source: `https://docs.kernel.org/hid/hidraw.html`, received through the
repository's native reader on **September 5, 2026 at 19:17:55.877 UTC**. Exactly one
separately authorized GET returned HTTP 200, with no redirects, retries or fallback,
exit 0 and closed transport. It remains partial/extracted-unverified; no source
example, device/sysfs operation, SDK, browser script or hardware probe was executed.

The extracted guide distinguishes numbered and unnumbered reads while requiring
every write buffer to include an ID byte, zero for unnumbered reports. It separately
documents descriptor-size and descriptor-retrieval ioctls. Descriptor byte length
does not by itself establish an input/output report length. Nonblocking reads are
documented, but this bounded extraction supplies no polling, cancellation, ownership
or complete error/retry contract. Those omissions must not become invented guarantees.

Evidence root: `node_modules/.cache/native-validation/fido-hidraw-contract/`.
The exact receipt and extracted Markdown are in `live-20260905T191656Z/`; that
directory label is not the actual request time. `REPORT.md` preserves exact
commands, times, reader/transport limits, omitted content and outstanding questions.

- Receipt: 40,755 bytes; SHA-256 `1694d8558a38edf75d82995f9630cccbd9964fe13f1734563033de1e4bd4a00e`.
- Transport-decoded body: 18,520 bytes; SHA-256 `7f41c2cb7eb38c23757e9f0f398ce4ac11390904d746e39a0e8d082fd47f7e68`.
- Native Markdown: 11,485 bytes; SHA-256 `d9901edd280cb73bb4773bbe65adddbe595d3ab7f0a315ea779b330d3a9b2030`.

Hashes establish saved-artifact consistency, not independent truth or complete
document fidelity. This codec increment adds no request and does not upgrade the
earlier receipt's browser/runtime or device acceptance status.

## Driver and passkey gates

Still required: authorized device identity/path and permissions; trustworthy
direction-specific report metadata; descriptor ABI/parsing; discovery; Node I/O,
ioctl and readiness feasibility; short I/O/disconnect/error policy; bounded owned
queues and cleanup; channel ownership and fresh INIT nonces; transaction deadlines,
CBOR, KEEPALIVE/ERROR routing and cancellation; trusted human PIN/UV/touch/consent.
No native bridge or runtime dependency is added and no hardware provider activated.

The Linux guide alone establishes neither that Node builtins can implement every
required operation nor that an extra dependency is necessary. No guessed ioctl
constants, architecture-specific ABI assumptions or retries are introduced here.
Synthetic byte tests cannot prove OS I/O, physical-device interoperability or
end-to-end passkeys. Previously denied/stopped gates stay unchanged.

## Validation

September 5, 2026, clean base `7beac6e` plus this increment: **225 passing native
cases across exactly four manifest-listed suites**, zero failures/skips. The new
report suite has 83 cases; allocation 64, packet 17 and assembler 61 retain their
previous behavior. Cases cover all 58 admitted sizes and independent byte fixtures;
loops additionally exercise report IDs without inflating the runner's test count.
Project build, strict new-test typing and two-file Biome checks pass. Initial
formatting diagnostics remain recorded. No runtime dependency was installed.

Independent static review finds no concrete codec defect and records a composition
test assumption about nonempty packet output. The final test explicitly checks
independently calculated packet counts before iterating. A fresh run of the same
four-file scope again passes all 225 cases; final strict typing and Biome pass.
The earlier passing run and original review hashes remain separate evidence.

Implementation evidence: `node_modules/.cache/native-validation/linux-hidraw-reports/`.
The clean compiled snapshot is adjacent `linux-hidraw-reports-integrated/`.
These synthetic tests exercise byte contracts, not Linux syscalls or device I/O.
