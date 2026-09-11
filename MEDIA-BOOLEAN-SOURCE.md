# Native media boolean, unknown-value and negation semantics

## Implementation-ready conclusion

**Keep three-valued results through condition evaluation. Do not turn an unknown
feature/value into ordinary false before applying `not`.** Convert a remaining
unknown result to false only at the final two-valued matching boundary.

These are new offline native extractions from the already accepted MQ5 document,
not new website requests or tests of the parent's matcher. The parent's explicit
host contract is `light | dark | null`, with null meaning known no active
preference and therefore effective light—not an origin override. The sealed
prior §12.5 extraction establishes the current `light | dark` value set.

## Exact sourced rules

- **§2.4.2 `#mq-boolean-context`:** a bare feature is true if it would be true for
  a value other than zero, a zero-valued dimension, `none`, or a value that the
  feature explicitly defines as boolean-false. Otherwise it is false. Neither
  light nor dark is such a false value. Do not hard-code `no-preference` as a
  universal boolean-false keyword across features.
- **§2.5 `#media-conditions`:** conditions use `not`, `and`, `or` and parentheses.
  Mixing these operators at one grammar level without appropriate grouping is
  invalid; do not invent precedence to accept an invalid expression.
- **§3.1 `#evaluating`:** use Kleene three-valued logic. `NOT U = U`;
  `F AND U = F`; `T AND U = U`; `T OR U = T`; `F OR U = U`. Combining U with U
  also leaves U. `<general-enclosed>` evaluates to U. A remaining U fails final
  `@media` matching; it is not inverted into a match first.
- **§3.2 `#error-handling`:** unknown feature names, unknown values, and values
  violating the particular feature's value syntax yield U. A media query whose
  value remains U is replaced with `not all`.
- **Media types are distinct:** an unknown media type is non-matching/false, so
  bare `unknown` is false and `not unknown` is true. In contrast, `(unknown)` is
  an unknown feature: it and `not (unknown)` remain U/non-matching.
- **§3 `#mq-syntax` and §3.2:** grammar failures become `not all`; recover at the
  next top-level comma rather than discarding the whole list. Keywords are ASCII
  case-insensitive. Whitespace is required between `not`/`and`/`or` and a following
  `(`: `not(` is a function token, not the negation operator. The fallback
  `<general-enclosed>` branch is used only after preceding alternatives fail.

## Derived color-scheme outcomes

T/F/U below are intermediate condition results; **U does not match**. The table
combines the new general rules with the same document's previously extracted
§12.5 and the parent's declared host contract; it is not an executed matcher test.

| Condition | Host light | Host dark | Host null → light |
| --- | --- | --- | --- |
| `(prefers-color-scheme)` | T | T | T |
| `not (prefers-color-scheme)` | F | F | F |
| `(prefers-color-scheme: light)` | T | F | T |
| `not (prefers-color-scheme: light)` | F | T | F |
| `(prefers-color-scheme: dark)` | F | T | F |
| `not (prefers-color-scheme: dark)` | T | F | T |
| `(prefers-color-scheme: no-preference)` | U | U | U |
| `not (prefers-color-scheme: no-preference)` | U | U | U |
| Unknown color-scheme keyword, or its `not (...)` variant | U | U | U |

For example, an explicit dark test OR an unknown feature matches in the dark
state because T dominates OR. In the light state it remains U and does not
match. A failed grammar parse is different from a valid false color-scheme test.

## Scope and remaining gaps

All three authorized extractions are consumed. This establishes the listed
boolean/unknown/negation/error rules, not complete tokenizer, host-language,
range-feature, CSSOM serialization, MediaQueryList notification or resource-limit
behavior. Referenced CSS Syntax/Values specifications and linked tests were not
opened. The full media-type modifier and media-query-list combination sections
were not separately extracted; the unknown-type negation example is explicitly
present in §3.2.

No OS/UA preference, page override, embedding context, or new matcher behavior
was probed. An arbitrary engine failure or missing state is not evidence of the
parent's declared null state. The earlier preference report's remaining context,
override and notification limitations remain historical and unchanged.

## Offline evidence and seal

New lane: `node_modules/.cache/native-validation/native-media-boolean-source-september11/`

| Artifact | Evidence |
| --- | --- |
| `section-1.jsonl` | §2.4.2; **10,190 bytes / 123 selected nodes**. |
| `section-2.jsonl` | §2.5; **11,993 bytes / 155 selected nodes**. |
| `section-3.jsonl` | §3 including §§3.1–3.2; **59,211 bytes / 829 selected nodes**. |
| `OFFLINE-INPUT.json`, `SELECTIONS.json` | Original-body/receipt pins and selections discovered in prior accepted native headings. |
| `RESULT.json`, `offline-EXECUTION.json`, `section-*-audit.json` | **3 offline native sections; 0 navigation, 0 wire, 0 mocks**, restored descriptors and zero remaining document nodes. |
| `PREFLIGHT.json`, `offline-INTEGRITY.json`, `*-*.sha256` | Private preparation, unchanged admission and release/harness/prior-evidence pins. |
| `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Named final checks and complete new artifact/report digest ledger, excluding itself. |

Original source: `native-preferred-color-scheme-source-september11/response-1.body`,
**697,033 bytes**, SHA-256
`9e761f96f6a9935591264b470bdf5e4c1b5b15874c376b9de70e670171671c95`.
The original `live.jsonl` capture matches these bytes; receipt SHA-256
`83ed98d65dec410b32506b78bd08d92fb87326d5228ed6bab95ab31b96480820`.
Its historical GET is not counted as a request in this new offline task.

Execution: **September 11, 2026, 22:40:11.245–22:40:11.914 UTC**; one child,
30s+5s, 6 MiB output/file, lane ≤12 MiB and free space ≥64 MiB. The new lane and
HOME/TMP directories were **0700 before harness execution** and remain private;
HOME/TMP are preserved empty. Kernel socket denial plus network/process/SafeJS
guards were active. No excluded fixtures, navigation, network, page scripts,
credentials, alternate clients/devices, cap changes, raw-body search/trimming,
builds, implementation tests, commits, cleanup or deletion occurred.

Only the same audited release `11f31bfd279b60520d07bafb0cd929884b384257` ran the
native replay extractor. **10,390/0/2** pass/fail/exclusions and **175 selected /
174 strict / 579 manifest** remain historical gate facts; full ledgers cover
1,066 source/1,908 compiled entries. Fixture-safe executable inventories and the
six-owned-input certificate are rechecked without rerunning gates. Native results
remain partial semantic extractions, not browser implementation compliance.

Every byte of the prior lane and `PREFERRED-COLOR-SCHEME-SOURCE.md` remains sealed:
prior ledger SHA-256
`f1be98ec532b1a237aaa548b6e02321dde441819224d1cb8642d2183bc02ad89`;
prior report SHA-256
`4c86a84bf6ed632ac695559548abfc8bf95a0d97148342fde0cee36dc47e2497`.
