# Trusted native scope-close diagnostics

Implemented and validated September 7, 2026. The host source-heading scanner can
now distinguish the two predicates behind `scope-close-structure`, without
changing parser acceptance, source exposure or existing diagnostic records.
The actual W3C failure in `SOURCE-SCOPE-FAILURE.md` remains unchanged: its closing
tag and predicate are still unknown because this getter was not activated there.

## Host contract

`scripts/research-source-headings.ts` exports the readonly
`SourceHeadingScopeDiagnostic` / `SourceHeadingScope` types and
`sourceHeadingScopeDiagnostic(error: unknown)`.

Only errors created at the existing scope-close guard have the new private
WeakMap identity. A successful lookup returns the same frozen five-field record:

| Field | Meaning |
| --- | --- |
| `kind` | Constant `source-heading-scope-close` |
| `condition` | `scope-mismatch` or `non-plain-close` |
| `expectedScope` | Actual tracked-stack top, or null for an empty stack |
| `observedScope` | Closing name admitted by the finite tracked-name sets |
| `depth` | Actual tracked-stack length before failure and cleanup |

Scope names are restricted to the existing 32 omitted/suppressed tag constants;
they are not arbitrary source strings, attribute values or token snippets. The
19 stack-admitted names retain their existing behavior; raw/void starts still
bypass insertion. No URL, title, source body, error message, stack, token/cursor
reference or caller-owned record is retained in this metadata.

The getter performs only null/type checks and WeakMap lookup. It does not inspect
input properties, prototypes or descriptors, invoke getters/proxy traps, mutate
errors or accept forged/copied records. Unbranded, wrapped, foreign and revoked
errors return undefined. Neither record can be recovered from a serialized error
or retroactively added to an old receipt.

## Preserved behavior

The original short-circuit guard is retained: mismatch wins without inspecting
closing attributes; only a matching stack top evaluates the plain-close check,
once. A valid close still pops once. Both rejection paths retain the same
`unsupported` category/message and the unchanged four-field
`sourceHeadingStructureDiagnostic` snapshot, including last-committed UTF-16
position semantics. New metadata is captured before the existing cleanup.

No parsing recovery, optional-table-close acceptance, changed work/issue counting,
raised limit, changed deadline/yield or successful-report serialization is added.
This is not a parser fix inferred from an unread source. The host scanner module
is the only export surface changed: no public index, CLI, page binding, source
operation or verifier activation is included. No runtime dependency is added.

## Validation

Fresh setup01 at **22:41:15.761563639–22:41:23.773166010 UTC** passes production
build, exact scoped strict types and scoped Biome. One formatter pass changes test
layout only. The initial permission review times out; one identical retry is
approved before execution. There is no retry of a denied operation.

Fresh native01 at **22:42:11.973380592–22:42:15.806970004 UTC** passes **634 tests,
zero failures and zero pending**, limited to five explicit `native-tests.json`
entries: source-headings307, source-input105, token-cursor139, tokenizer-issues49
and resource-limit34. Of these, **93 cases are new**.

Coverage includes all finite observed names, all stack-admitted expected names,
empty/mismatched/nonplain closes, actual attribute-inspection precedence, nested
and maximum-depth snapshots, cleanup, exact frozen own descriptors, repeated
identity, nonexposure, forged/copied/wrapped/foreign errors and hostile/revoked
proxies. Existing other-reason/resource failures stay unbranded. Strict synthetic
optional-table-close examples remain rejected. Test-only `node:vm` constructs a
foreign error; it is not page execution or SafeJS acceptance.

Independent static review reports no actionable finding. A read/hash audit at
**22:44:30.778 UTC** verifies 2,716 native inputs, working/tested/review identities
and all 292 frozen scope-source evidence files. It preserves native failure,
no candidates/body identity/outline and no replay readiness. These are synthetic
native tests, not a full-suite or live-source pass; no old-runtime negative control
for the newly added getter was run.

Evidence directory:
`node_modules/.cache/native-validation/native-source-scope-diagnostics/`.

| Artifact | SHA-256 |
| --- | --- |
| Final runtime | `aff05d54a59b419bb014228e716e4ebe2e1d1b77983beb74607cd8f1d27b895d` |
| Final formatted test | `bd7f63e3226705c03904b7560ac231d02a997cf26edacbf16e18339e2d1f14d0` |
| `evidence/native-01-INPUT-SHA256SUMS` | `869595c4bb7e49885f8108b9982f5a2258e9f585352d6ebe707d8e6dcc5551c1` |
| `REVIEW.md` | `8105489261143cdea1084b6e489c78f823f9b643a4d4e95e80dc1d372c541707` |
| `AUDIT.json` | `49a189c7228a8a44fbb67f30006138a0b8ec9081deb1ba21016b3652c0bb0724` |
| `FINAL-SHA256SUMS` (44 entries) | `07956c74a56d6aab4e6343340290e2bdf1c0d3ab5dcb91fb4a949f02d978d2e8` |

The immutable integrated01 candidate starts at
`e41d4aaa34640c9f012c1b875b789682ab5effa2` and mirrors only the two code/test
deltas. Pre-existing dirty work and denied RP changes remain excluded.

## Outstanding gates

An operation must explicitly use this getter before any new live failure can
carry its metadata; that requires fresh review, exact integration probes and
source authorization. Do not infer the actual W3C tag/predicate from synthetic
fixtures, relax grammar or replay old captures. Modern passkey privacy wording,
providers/devices, page/consent integration, blocked research and all previously
stopped/denied gates remain open. The original browser goal continues.
