# Native malformed HTML attribute recovery

The Bing Poe-search capture documented in `BING-ATTRIBUTE-BOUNDARY.md` failed on
an attribute whose name is one double quotation mark. The native tokenizer and
document model now have a parser-specific recovery path rather than dropping
that name or rewriting it into an unrelated valid attribute.

## Tokenization

- Double quote, apostrophe and less-than in an attribute name are retained and
  each produces `unexpected-character-in-attribute-name`.
- An initial equals sign is part of a newly started name and produces
  `unexpected-equals-sign-before-attribute-name`. Subsequent equals separates
  name from value as before.
- NULL produces `unexpected-null-character` and is replaced with U+FFFD.
- ASCII uppercase is folded; non-ASCII characters are not Unicode-lowercased.
- Duplicate detection occurs after the complete name is normalized, before
  value processing. The first attribute wins; a later value is still consumed.
- Existing token/work, issue-count and 1,024-attributes-per-token limits remain
  in force, including duplicate attributes. Incomplete input stays incomplete;
  no completed tag is manufactured at EOF or an insertion boundary.

This is not complete tokenizer conformance. In particular, the existing
`unterminated-tag` diagnostic remains the implementation's EOF-in-tag reporting;
attribute-value and after-quoted-value behavior are not broadly revised here.

## Document representation

`DocumentTree.createParserElement` and `setParserAttribute` accept names the
tokenizer can produce. They reject empty names, NULL, ASCII whitespace, slash,
greater-than, and equals signs except in the first position. Element-name,
string-value, resource-budget and mutation checks remain in place. These are
parser entrypoints, not a trust or authentication boundary.

The tree builder uses those entrypoints for element creation, initial
html/head/body scaffolding and html/body attribute merging. Active-formatting
reconstruction also preserves parsed names. Ordinary `createElement`,
`setAttribute`, `createAttribute` and
`toggleAttribute` retain their previous stricter attribute-name validation.

Parsed attributes remain observable through native attribute records and can be
updated through `setAttributeValue`, detached, reattached and removed. Removal
accepts parser-spellable names; it does not create attributes. Existing clone,
template and serialization paths preserve the names rather than hiding them.
Attribute serialization still emits raw names and escaped values; round-trip
regressions check the recovered spellings with the same native parser.

The semantic reader keeps its existing attribute allowlist. A recovered but
unrecognized name is counted as an ignored attribute, while useful safe
attributes and text can continue through the reader. This does not make the
reader a general HTML security sanitizer or render omitted graphics/scripts.

## Native source research

Three bounded offline native replays select the before-name, name and after-name
sections from the separately admitted WHATWG capture on September 11, 2026.
No new request, page script, alternate browser or external HTML parser is used.
The original first invocation exits 1 after its second saved extraction because
the harness assumes node references are global across documents. That failure
is retained. Saved-output verification checks the section title and self-link
with replay-local references; the third, distinct section runs separately and
exits 0. Exactly three extraction calls occur, with zero network attempts.

Source findings and identities:
`node_modules/.cache/native-validation/native-whatwg-attribute-name-september11/SOURCE-FINDINGS.md`.
The decoded source body SHA-256 is
`311d356f10fcb9fbeedfa90964845568575f1802e2d7f34eba1f8fbc95c86e99`.
The older failed Bing receipt remains failed; implementation tests and any fresh
website recovery are separate evidence, not retroactive admission of that body.

## Validation

The first isolated run on September 11, 2026 spans
**07:02:17.035Z–07:03:51.496Z UTC**. Build, strict checking and scoped Biome pass;
native tests report **4,597 passed / four failed** across 64 explicitly selected
manifest files. The failures expose an initial-scaffold path still using strict
creation and a historical test fixture expecting the now-recoverable tokenizer
failure. Both are corrected. Two existing six-megabyte serialization assertion
cases also exceed the harness's 15-second per-test timeout, at about 17.17 and
15.80 seconds; their test source and assertions are unchanged.

That failed run remains in
`node_modules/.cache/native-validation/native-malformed-attributes-september11/`.
A separate second snapshot uses a 30-second test-runner timeout for the same
64-file selection. This does not raise any native browser or reader budget.
Both snapshots exclude unrelated uncommitted work. Import-order checking is
disabled in the scoped Biome command because unchanged imports in document/parser
files already violate its ordering rule; formatting and lint remain enabled.

The second run spans **07:05:15.786Z–07:06:46.466Z UTC** on September 11, 2026.
Build, strict checking of 64 selected roots, scoped Biome and **4,601/4,601 native
tests** pass, including 51 new malformed-attribute cases and two new systematic
issue-path cases. The scaffold test now covers explicit head attributes as well
as initial and repeated html/body attributes. Two historical unsupported-error
fixtures use still-unsupported tag names instead of now-recoverable attributes;
their diagnostic classification assertions remain intact. No serialization
assertions are removed or changed to address the first run's timeouts.

All 997 snapshot source files remain stable, and the nine changed TypeScript
files match the tested snapshot. Evidence:
`node_modules/.cache/native-validation/native-malformed-attributes-september11-round02/`.
This is a 64-file selection from the 542-entry committed-plus-feature manifest,
not a complete repository test pass. No native test supplies live-site,
credential, device, real TTY or SafeJS acceptance evidence.

## Fresh Bing observation

A separate native request for the same public Poe subscription-opinions query
runs **07:07:17.757Z–07:07:17.940Z UTC** on September 11, 2026. It receives
HTTP 200, decodes 110,077 bytes and produces nine native headings without
truncation or a classified access challenge. The reader processes 869 tokens,
reports 21 tokenizer issues and emits 12,895 code units. One actual request,
zero redirects and zero mock responses are recorded; the transport closes with
zero active operations. There is no retry or CAPTCHA interaction.

The fresh receipt SHA-256 is
`9632a032b0fc1207615c887a8b7b0888dd149bd0b8661c672edd7e26c2151c4d`;
body SHA-256 is
`64ec0ad756c9d68787a5e01f2f8dde70787f99be73c92debf6dd75f92f152f53`.
This body differs from the old failed capture. Source/build inventories remain
unchanged (997 source files, 1,784 compiled files), with empty private HOME/TMPDIR.
Evidence:
`node_modules/.cache/native-validation/native-bing-attribute-recovery-september11/`.

The outline includes AI Poe, Path of Exile and Power-over-Ethernet results, not
verified Reddit subscription opinions. Loading recovery is therefore separate
from research relevance or completion. This single observation is not a
performance benchmark, a full styled/interacting Bing flow, or evidence that
access challenges have generally been bypassed. The broader website, SVG,
research, fingerprint and credential/passkey goals remain open.
