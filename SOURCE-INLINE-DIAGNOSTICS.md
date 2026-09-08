# Trusted native heading-inline diagnostics

The scanner adds `sourceHeadingInlineDiagnostic(error)` for the existing
active-heading start-token rejection. This is failure metadata, not new grammar.

## Contract

Only the actual scanner-created error can retrieve the frozen five-field record:
`kind: "source-heading-inline-start"`, condition `non-inline-start` or
`self-closing-inline`, active heading level1–6, canonical observed tag, and current
inline depth0–127 (further bounded by the selected tracked-depth limit).

The diagnostic vocabulary is a closed union of99 local scanner/loader tag names
plus `other`. Names longer than10 code units return `other` before map lookup;
short unknown names also return `other`. Known names return canonical literals,
not an unrestricted source string. No attributes, titles, URLs, source snippets,
inline stack, policies or extra error properties are retained in this record.

The existing membership check still precedes reading the self-closing predicate.
Non-inline starts do not read that predicate to produce metadata. br/wbr retain
their earlier bypass, and earlier tokenizer/ambiguous-mode/resource failures keep
precedence. Metadata is created only after rejection and before any inline push.

The private WeakMap getter performs only null/type checks and identity lookup;
copied records/errors, inherited objects, foreign objects and proxies are not
authorities. It does not inspect properties, prototypes or proxy traps. Existing
structure/scope/context schemas, error shape/message, successful reports,
head/table policies, work/counters/limits and cursor cleanup remain unchanged.

## Evidence boundary

`SOURCE-HEAD-TABLE-TRIAL.md` records source06's heading-inline failure at committed
UTF-16 coordinate250858. It does not identify its rejected tag or predicate.
This change cannot retroactively enrich that receipt and does not authorize
broader heading grammar, source/capture inspection or a source request.

Focused static review and separately authorized synthetic validation are complete.
Future wrapper/verifier provenance, integration controls and any native source
operation need separate authorization. No CLI/page activation, real provider,
vault, device, consent/privacy, challenge bypass or blocked research acceptance
is claimed. Existing stopped/denied gates remain unchanged.

## Focused validation

On September8,2026, all1,093 tests pass in five explicit native files at
02:04:45.393444273–02:04:51.422472453 UTC: source-headings766, source-input105,
token-cursor139, tokenizer-issues49 and resource-limit34. Exactly237 new cases
cover all reachable finite labels, six active levels, both predicates, depths0/2/127,
earlier failures, five-field descriptors/identity, privacy, hostile/revoked proxies,
work/operation boundaries and six head/table-policy combinations. All856 prior
assertion names remain unchanged. This is not an actual old-runtime negative control.

Eight cursor controls retain the actual parsed boolean behind a counting getter
to observe self-closing read order. Other fixtures use the actual native scanner
and cursor without fabricated errors. Tests do not inspect private map/stack state
or prove hidden allocation costs; static review separately checks the fixed-size
map/record implementation. The two br/wbr labels are unreachable at this guard.

Two-file formatting passes at02:03:03.221606054–02:03:03.348862506 UTC after an
approval-review timeout and one approved identical retry. Build, five-file strict
typing and two-file Biome pass at02:03:50.355274723–02:03:59.173133786 UTC. The
isolated archive of a7289a76afcbb9f7875cb91271dcea4875aeeccd uses whole-file-context
patching with exact baseline/final byte checks; unrelated pending work is excluded.

Audit at02:05:47.323 UTC reconciles2,716 native input identities,362 frozen source06
artifacts,50 prior head-feature artifacts and the complete856 prior assertion-name
multiset. The committed manifest has516 files; only the explicit five ran.

Frozen evidence: `node_modules/.cache/native-validation/native-source-inline-diagnostics/`.

| Artifact | SHA-256 |
| --- | --- |
| Final runtime | `64fa2b240039b0e0be1c7d0b418924ad120c8fd2e83e4de9ee116d67e83979e7` |
| Final tests | `7893c3b0adcce5ad8faf62f2a3bdd5ba45910b7efc8af8830a511f8e979bc187` |
| `REVIEW.md` | `5f5eede0e94debfecc538bd5ea8e68c6ae9413b4d4d7c0722dab39f990a2d0ed` |
| `AUDIT.json` | `876a9989341c604cad35d1684ed51e03987bce49ef5d407873f3459b197f1b9e` |
| `FINAL-SHA256SUMS` (48 entries) | `7849a585a0bf6566af8145414741c4348a888893347ed9dc01666d96c497edfc` |
