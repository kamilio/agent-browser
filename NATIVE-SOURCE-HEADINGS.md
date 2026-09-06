# Explicit native source-heading discovery

September 6, 2026. The host API `discoverResearchSourceHeadings` in
`scripts/research-source-headings.ts` uses the actual native HTML token cursor
to discover bounded **source-heading candidates without constructing a DOM**.
It requires explicit `method: "native-source-headings-v1"`. No CLI flag,
automatic load-failure fallback, page binding or general browser-index export
is added. Existing document limits and long-v1 behavior remain unchanged.

## Input and identity

Input is an own plain-data record with exactly `finalUrl`, `contentType` and
`body`. The URL must be canonical HTTP(S), at most 8,192 UTF16 units, without
credentials, fragments or controls. It is a **reported URL**, not DNS resolution,
transport authorization, publisher truth or proof of freshness. Content-Type is
one `text/html`-essence string, at most 1,024 units; commas and controls reject,
including commas inside otherwise quoted parameters. This is a deliberately
restricted envelope, not a new complete MIME parser.

Body admission uses intrinsic typed-array checks and an owned snapshot of the
actual Uint8Array view. Proxy/shared/detached/out-of-bounds views reject without
user getters, iteration or species; valid ordinary resizable views remain
supported. The original view's bounds are validated before reconstruction, so
an invalid resized view cannot become a valid empty source. Limits validate
before input inspection, and trusted phase-checkpoint failures retain identity.

`scripts/research-source-input.ts` records separate transport-decoded byte
length/SHA256 and exact decoded-text code-unit length/SHA256. Text digest
encoding is explicitly UTF-8. The byte pin is not a compressed-wire pin; the
text pin does not replace it. Reported MIME/URL and decoder policy accompany
these identities; no replacement count is inferred from U+FFFD characters.

The existing native 1,024-byte HTML encoding sniff is factored into
`src/html-encoding.ts` without behavior changes. The same raw-name set and
function body are verified against the pre-change reader. Actual decoding
still uses `decodeResponseText`: recognized UTF8/UTF16 BOM, then matching header
charset, then native meta sniff, then windows-1252 fallback. Existing invalid
label, nonfatal replacement and manual windows-1252 behavior remain intact.
This is the versioned native reader policy, not a full HTML-standard prescan.

Coordinates are half-open UTF16 ranges in exact decoder output, before parser
BOM/CRLF/NUL/surrogate normalization or sanitizer escaping. A decoder-consumed
BOM has no coordinate; a remaining U+FEFF does. Entity-decoded title lengths
are not source offsets. No capture/base64 record is accepted or replayed here.

## Candidate semantics

Results contain frozen `report`, compact `jsonl` and actual `outputBytes`.
Every report says `source-heading-candidates`, `lexical-not-dom`, `partial: true`
and `contentSuccess: null`, even at EOF. Each completed h1–h6 candidate has an
ordinal, level, bounded title/truncation flag and separate start/end tag ranges
under `source-utf16-range-v1`. There are no CSS selectors, DOM references,
revisions, fragment identities, rendered-visibility or accessible-name claims.

- Comments and doctypes do not supply titles. Script/style/xmp/iframe/noembed/
  noframes/title/textarea use real native raw/script state and require a matching
  explicit closing token; oversized raw segments fail rather than reset state.
- Versioned active/foreign/embedded omissions and parser-sensitive head/template/
  select/table scopes suppress candidates. Foreign integration points do not
  escape suppression. Known tracked scopes require balanced matching closes;
  plaintext/noscript ambiguity, unclosed scopes and malformed transitions reject.
- Admitted headings allow balanced span/a/b/strong/i/em/code/small/sub/sup plus
  br/wbr. Nested headings, other content, self-closing nonvoid wrappers and
  misnesting reject. This intentionally loses coverage and can reject otherwise
  valid or repaired HTML; it does not emulate tree repair.
- Titles concatenate native entity-decoded text, normalize JS whitespace, add
  br's separator and no wbr text, and clip without splitting a valid surrogate
  pair. Attributes, image alt, ARIA and CSS do not supply title text. Only seven
  explicitly named native entity-issue kinds are nonfatal; other issues reject
  with fixed errors, never source excerpts.
- Entry-limit completion requires observing another eligible heading start
  after the cap; only completed entries are returned. Reaching the cap followed
  by actual EOF remains EOF. Fatal limits/malformed input return no candidate DTO.

## Bounds and cooperation

Defaults are also maximums; callers may tighten them with own numeric data.
Unknown/accessor/proxy/symbol options, coercion and explicit undefined reject.
Only issue allowance may be zero. Source/body limits are 4,000,000 units/bytes;
native windows 65,536 units; operations 200,000; attempted issues 1,024; tracked
frames 128; heading extent 16,384 units; entries 256; titles 256 units.

Logical work is capped at 32,000,000: actual cursor work plus one per returned
token, each processed heading-text unit (including br's supplied space), and each
delivered allowed issue. Encoding sniff/decode/hash and JSON encoding are not
included in this scanner counter; their input/output caps and whole-operation
deadline remain separate. Tracked depth is not DOM depth. Attempted issues can
exceed delivered warning counts because discarded partial attempts still count.

A single absolute 120,000ms maximum deadline spans admission through publication.
Real event-loop yields occur at 256 operations or 32,768 charged work units, with
abort/deadline checks before and after. One bounded native/text operation can
cross a batch or heading-extent threshold before its check; this is not intratoken
preemption, a CPU/RSS measure or a smaller transient-allocation guarantee.

Entire escaped UTF8 JSONL, including identity/limits/counters/ranges and LF, is
capped at 65,536 bytes. The internal owned-data encoder counts escaped string
bytes before materializing/retaining fragments. Overflow produces no truncated
JSON; its diagnostic is the requested accumulated chunk size, not an invented
complete result length. This cap may bind before 256 entries. Cursor closure
and owned-byte cleanup occur on success and failure; no late success follows
deadline/abort or trusted checkpoint failure.

## Validation evidence

Lane: `node_modules/.cache/native-validation/native-source-heading-discovery/`.
Base: `27cb3735a690ad4476a7941aade0ac85574f8c20`; isolated snapshots contain only
eight focused code/manifest deltas, excluding pre-existing dirty work and denied
parent-RP tests.

- Native01, 22:05:35.321551140–22:05:39.791734534 UTC: 767 passes, no failures
  or pending tests. Build/strict pass; four test lint findings are preserved.
- Native02, 22:07:08.839951415–22:07:13.486599719 UTC: **767 passes in ten explicit
  files**, no failures/pending, including **271 new cases** (166 scanner,
  105 input). Build, ten-file strict and seven-file Biome pass. Runtime bytes
  are unchanged between runs; only test imports/string syntax were adjusted.
  Two formatter passes were used.
- Actual pre-correction view control, 22:07:17.853648917–22:07:19.428024012 UTC:
  valid resizable view passes; out-of-bounds rejection fails as expected because
  the old helper admits empty identity. One pass, one failure, 103 unselected;
  exactly one of 957 source files differs, equal to the retained actual earlier
  helper, not a mock or synthetic mutant.
- Synthetic span-heavy input exceeds the unchanged native 50,000-node guard
  while the scanner yields, returns real candidates and reaches EOF. This is
  not evidence that the previously failed W3C source fits this lexical policy.

The matrix also covers existing cursor, tokenizer issue/input, network decoding,
reader, reader-limit, admission and trusted-diagnostic tests. It is not the full
native suite. Original scanner review reports no actionable source defect;
integrated review resolves the byte-view finding with no remaining actionable
defect. Its seven runtime/test hashes match the final tested and working files.
`AUDIT.json` verifies 2,716/2,716/967 input entries, current/tested runtime identity,
literal encoding factoring and the unchanged 94-entry cursor/238-entry failed
long-source ledgers. Audit SHA256:
`e106327eb7788cc516a36286e8794dd893853fc2d19b9031e67a5e507ca31b4c`.

## Still open

CLI/evidence activation, independently pinned source-anchor reuse/selection and
a fresh separately authorized native source operation remain open. Historical
failed captures are not implicitly eligible for decoding/replay. No source
request, real capture decoding, network/socket/TTY/SafeJS/vault/device probe or
stopped-gate reopening occurs in this slice. Password/passkey/page/device/consent,
modern privacy wording, fingerprint consistency and blocked research gates
remain open; the full original browser goal continues.
