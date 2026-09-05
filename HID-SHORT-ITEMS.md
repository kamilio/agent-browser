# Bounded HID short-item tokenization

`src/hid-short-items.ts` provides an internal, builtin-only lexical helper for
caller-supplied descriptor bytes. `tokenizeHidShortItems(bytes, options?)` returns
ordered `{ offset, header, type, tag, data }` tokens. It does not validate HID
descriptor semantics, identify FIDO devices or derive usable report metadata.
No package export, runtime dependency or device provider is added.

## Framing and limits

- Permitted header size codes 0/1/2/3 consume 0/1/2/4 payload bytes. Every token
  advances past its header, including zero-byte items. Truncated permitted items
  reject the whole call; a valid prefix is not returned as success.
- `type` is `"main"`, `"global"` or `"local"`; `header` and `tag` preserve raw
  lexical fields. Tags below15 are not certified as semantically valid items.
  Payload bytes remain in input order, without endian/signed numeric conversion.
- Every tag15 header rejects immediately as unsupported, not just `0xfe`.
  After that check, reserved type3 rejects immediately. These refusals precede
  payload-length checks and do not parse or skip suffix bytes. Long refusal has
  precedence when a header also has reserved type bits.
- `maxBytes` and `maxItems` each default to4096 and accept integers1–4096.
  These are implementation policy caps, not a claimed Linux descriptor maximum.
  Full input size is checked before scanning; item count before the next item.
  Invalid configurations reject before parsing. Empty input returns no tokens,
  which is not acceptance of an empty HID descriptor.
- Each `data` is an independent owned Uint8Array. Genuine ordinary-buffer
  Uint8Array/Buffer/subclass/cross-realm offset views are accepted through intrinsic
  access, without byte-view shadowed getters or species. Wrong brands, proxies,
  lookalikes, shared and detached storage reject; input storage is not retained.
  Out-of-bounds views after resizing also reject rather than masquerading as
  legitimate empty input; in-bounds empty resizable views remain accepted.

Invalid input/configuration, exhausted limits and unsupported encodings have
distinct `AgentBrowserError` categories and fixed messages. Hostile input/getter
messages and payload bytes are not included. Successful token offsets are
available; failure messages deliberately omit offsets and raw input.

## Primary implementation evidence

Native-browser reads of fixed upstream Linux `v6.12` header/core sources received
HTTP200 at **September 5, 2026 23:21:13.878 UTC** and **23:22:06.332 UTC**.
The captured implementation supplies the size/type/tag extraction, 0/1/2/4 map
and tag15 classification. Its full report parser rejects long format, but its
reserved handler returns success and an earlier scanner has different handling.
This helper's blanket reserved-type rejection is deliberately stricter policy,
not a claim to copy every Linux caller or enforce a normative HID specification.

The captures reference `HID_MAX_DESCRIPTOR_SIZE` but do not define its numeric
value. A different report-buffer constant is not substituted for it. Neither a
version-tag URL nor a successful source retrieval establishes latest behavior,
tag-signature verification, installed-kernel behavior or device compatibility.
The earlier guides' grammar gaps and example inconsistency remain recorded in
`HID-DESCRIPTOR-DISCOVERY.md`, not rewritten as stronger evidence.

`node_modules/.cache/native-validation/hid-short-items/SOURCE.md` preserves exact
requests, receipt times, paths and source/engineering-policy distinctions. Each
source used its own fresh authorization and the frozen native browser with
`--reader --capture-body`: one request, no redirects or retries, closed transport,
partial/extracted-unverified, `contentSuccess: null`. Parent inspected only native
plaintext extraction and verified captured bodies as bytes, with no raw-capture
fallback, source compilation, code execution or extra request.

Receipt/body/Markdown SHA256s, in header then core order:

- Receipts: `8451fd551cbbeea03fe7360b7b95841b9a022e0c67061e7bf4c000dea3e9218e` and `c70f5501c9d296d6ad70c98110f237f9783873c5330cf6c56a53c9b4aa0ae0e2`.
- Bodies (40,289 / 78,059 bytes): `69db832572997025df301fbcf243e0bd7eb00a5dca61edfac46635efe8efe93b` and `c12c3f89a2e04d7ef68a80d48cfe3b30f153f6de5bc7bb095c810b2f214d603b`.
- Markdown: `25f5733fca0bb5a61e5252dd654daf1d0d1513372528b932119b9bf40d5f9943` and `596365e485dae7634396f2d76036742c23e8eb03c6a68d805c2dace7a2c3bfb0`.

## Remaining gates

Collection balance, global/local state, Push/Pop, Usage Page/Usage and ranges,
Report Size/Count/ID validity, padding/shared-ID accounting, FIDO application
matching and per-direction report metadata remain unimplemented. Tokens alone
must not configure a physical transport or prove authenticator trust/ownership.
Node descriptor acquisition/readiness/short I/O/deadlines/cancellation and actual
device, credential, SDK and trusted human PIN/UV acceptance remain separate gates.
All previously denied/stopped lanes stay unchanged.

## Scoped validation

The clean candidate on base `a9c8864` passes the exact three-file native scope:
**124 cases, zero failures or skips**, including 24 new tokenizer cases plus 17
packet and 83 hidraw-report cases. The new suite explicitly counts all 256 header
forms (180 framed tokens and 76 refusals), exercises all payload truncation lengths,
zero-byte progress, exact limits, error precedence, hostile inputs, owned payloads
and resizable-buffer empty/out-of-bounds distinctions. Illustrative FIDO-like
bytes are asserted only as tokens, not as a valid/identified FIDO descriptor.

Build and two-file Biome pass. Initial strict test typing found an invalid-fixture
array-inference issue; a single `unknown[]` annotation fixes it without changing
runtime fixtures/assertions. Strict typing and a fresh same-scope native run pass
afterward. Initial diagnostics remain preserved under the feature cache's
`evidence/`; this is not a whole-manifest or physical-device acceptance claim.

Independent bounded static review found no concrete defects. A separate review
addendum preserves the original report and verifies that the final test differs
only by the type annotation. Review hashes, executed checks and source integrity
are separate evidence; none establishes real hardware or full descriptor validity.
