# Explicit source-heading raw discard

September 8, 2026. The research heading scanner can explicitly select the bounded
native cursor capability recorded in `RAW-DISCARD-STEPS.md`. Default scanning is
unchanged. This feature is not yet selected by a live research operation and
does not establish recovery of source09 or readable publisher prose.

## Selection and behavior

`discoverResearchSourceHeadings` accepts the exact optional setting:

```ts
{ method: "native-source-headings-v1", rawDiscardPolicy: "bounded-non-entity-v1" }
```

The existing strict options snapshot rejects proxies, accessors, unknown values,
explicit `undefined`, non-plain prototypes and unknown keys. Selecting this policy
also requires a window of at least16 UTF16 units, checked after the full options
snapshot and before source admission, even when the source has no raw elements.
Without the policy, the former smaller-window admission and report shape remain.

Only the existing outside-heading raw-omission branch selects bounded steps for
`script`, `style`, `xmp`, `iframe`, `noembed` and `noframes`. It retains the same
cursor, limits, signal and original deadline. Each single-window call has scanner
checkpoints before/after, successful aggregate counter updates and the existing
awaited yield check. Only `more` repeats; actual EOF is not an accepted element.

An `end-tag` result only locates the prefix. Ordinary native `next` and `plainEnd`
still validate the whole closing token; attributed, malformed, self-closing or
oversized tokens can fail. Head-boundary bookkeeping happens only after that
validation. Raw self-closing starts, inside-heading raw content and later scope
or heading errors retain their prior rejection and final output barrier. No
partial candidate report is published on failure.

`title` and `textarea` still use legacy `raw(name, true)`, including entity issues
and raw-window refusal. Non-entity raw text remains literal and omitted; no new
NUL/entity validation, payload return, host parser or catch-and-fallback is added.
All source/window/work/operation/issue/depth/title/output/deadline ceilings remain.

## Truthful selected reports

Only selected reports gain `rawDiscardPolicy` and this frozen limitations tuple:

```text
six-non-entity-names-only
title-textarea-legacy-raw
closing-token-still-window-bounded
lexical-not-dom-or-visibility
```

Selected `counters.rawDiscard` has exactly four aggregate fields:

- `steps`: successful step returns, including `more` and the terminal close.
- `elements`: successful `end-tag` returns; final report publication still requires
  closing-token and subsequent scan validation.
- `codeUnits`: the sum of committed advances, not bytes, overlap-copy lengths,
  per-element excerpts or a source09 payload-size claim.
- `legacyRawCalls`: successful legacy title/textarea calls.

Successful reports enforce these identities in regression coverage, with `EOF`
equal to1 only when completion is `eof`:

```text
operations = tokens + steps + legacyRawCalls + EOF
sum(rawStarts) = elements + legacyRawCalls
legacyRawCalls = rawStarts.title + rawStarts.textarea
```

Missing raw-name counts mean zero. Empty raw elements can legitimately advance
zero units. Unselected reports retain the original operation identity and no new
keys. Recursive freezing and the self-describing encoded-output byte quota include
all selected metadata. Method, lexical/non-DOM semantics, partial status and null
content-success remain unchanged; this is not DOM visibility or prose acceptance.

## Validation

| Gate | Actual UTC result on September 8, 2026 |
| --- | --- |
| Initial format | 04:41:18.704706055–04:41:18.842776169; exit0 |
| Initial setup | 04:42:00.404547336–04:42:13.659962469; build/strict0, Biome1 |
| Corrected format | 04:43:43.175329908–04:43:43.369216587; exit0 |
| Corrected setup | 04:44:20.055102077–04:44:30.302909941; build/strict/Biome0 |
| Six explicit native files | 04:46:02.270874090–04:46:10.034441445;1515passed,0failed/pending |
| Pinned audit | 04:47:44.290;2716 current inputs,92 core and551 source09 artifacts verified |

The heading suite has1005 cases:933 retained and72 new. Other selected suites are
cursor263, tokenizer input48, tokenizer issues60, source input105 and resource
limits34. All1443 prior assertion names pass. Audit checks all five unchanged core
code/test files and the exact old heading-test prefix after restoring only its
expanded import. No full-suite or live acceptance claim follows.

Independent static review found no actionable correctness defect. Runtime bytes
match that reviewed draft; test formatting and a fixture-preserving template-literal
lint fix were reconciled by parent review. Initial Biome failure and both setup
snapshots are retained. Native ran once against corrected snapshot02; no native
test failed. Validation approvals succeeded first try. Earlier sandboxed draft
integration failed without edits, then a separately authorized exact helper ran.

Frozen evidence is `node_modules/.cache/native-validation/native-source-raw-discard/`.
The79-entry `FINAL-SHA256SUMS` is
`9d8455a8c7920f70d74e3b546bb974fed1c1a45826f3a662b29e9621131ae6cc`;
the2716-entry native ledger is
`a94834f70537e3798e13f31146cb9c2693857f40719f13a10bfa18ff97a48e37`;
`AUDIT.json` is `002c0714d6c8dbed9a38094186cab99fea4b8cf101496ce72fa3c654faba74b7`.
Runtime/test SHA256:
`38e8eb5eaa26011b39a11815ae51a8b9fdb39616264b47b6a330f4995e27d4d7` /
`668e36d1262dc58b54ec810a4a964754022861c8a97be71618c81d94a9ff0784`.

## Remaining gates

No CLI/index, operation/verifier or live trial is activated here. A future operation
must disclose the selected tuple before work, including failures, and validate
the new counter identities rather than reuse the old raw-call formula. It needs
an exact tested-engine freeze, fresh controls/review and fresh authorization.
Source09 still identifies no name/entity mode/full payload size. Historical raw
bodies/captures were not inspected, and privacy/provider/vault/device/page/SafeJS
acceptance and all stopped/denied research gates remain unresolved.
