# Conservative native head boundary

The native source-heading scanner now accepts the explicit host-only option
`headScopePolicy: "explicit-body-boundary-v1"`, independent of table policy.

## Contract

An actual non-self-closing `body` start may end one eligible leading `head`.
Eligibility requires a bounded prefix: ASCII HTML whitespace and comments,
at most one native doctype before an optional single non-self-closing `html`
start, then an explicit non-self-closing head with no outer tracked scope or
active heading. There is no inferred head or body.

Inside that eligible head, only ASCII whitespace, comments, base/link/meta and
successfully completed native title/style/script blocks preserve eligibility.
A normal plain head end uses the existing strict close path. Any other content
permanently disqualifies implicit omission, even if its context later balances.
No search for an ancestor, source substring or previously hidden heading occurs.

The body boundary requires the tracked stack to be exactly `[head]`. Charged
admission precedes removing that one frame; no await may split the phase change
and pop. Existing outer suppression, EOF refusal, raw-token handling, work/depth/
output limits and cursor cleanup remain constraints. Whitespace inspection is
bounded and cooperative, not an uncharged full-string scan.

Fake body strings in attributes, comments, raw text or entity-decoded text do
not become start tokens. Non-ASCII whitespace, ordinary elements, template,
foreign content, tables and opaque raw contexts cannot be crossed or forgotten.
This is lexical source scanning, not CSS visibility or DOM ancestry modeling.

Selected reports must disclose the exact head policy. Existing diagnostic
schemas remain unchanged: their table-policy field describes table policy only.
A future source wrapper would need independent head-policy provenance. Strict
absence, table v1 and table v2 must preserve their prior behavior.

## Evidence and gates

`SOURCE-SCOPE-CONTEXT-TRIAL.md` records a retained head in actual bounded native
state, but no raw markup or earlier event history. It does not prove that the
document has an eligible body boundary. The static design is not source recovery
evidence, and a table-policy test pass is not a head-policy test pass.

No CLI/page/source-wrapper activation, live request, old-capture inspection/replay,
provider/vault/device/page/consent acceptance or challenge bypass is part of this
feature. All historical and stopped/denied gates remain unchanged.

## Focused validation

On September 8, 2026, all 856 tests pass in five explicitly listed native files
at 01:20:15.866245062–01:20:20.087018766 UTC: source-headings 529, source-input
105, token-cursor 139, tokenizer-issues 49 and resource-limit 34. The 66 new cases
cover ordered prefix eligibility, terminal disqualification, actual versus hidden
body tokens, raw completion, earlier error precedence, independent table-policy
composition, selected output provenance, unchanged diagnostics, hostile options,
window/work/operation/depth/issue/output limits, snapshotting, cancellation and
actual cursor cleanup. All 790 prior test definitions remain unchanged.

The tests do not directly expose private phase state, measure each 256-unit
inspection span or observe a partially rejected mutation. Static runtime review
checks those implementation properties separately. The review finds no actionable
issue against runtime `015ec6f10281e10af9f752efb159dbcb0d8530d00db9d158aa906efc5990f262`.
Formatting changes one runtime destructuring line wrap and test layout only.

Two-file formatting passes at 01:18:53.332680919–01:18:53.441378955 UTC after an
initial approval-review timeout and one approved identical retry. Separately
authorized build, five-file strict typing and two-file Biome checks all pass at
01:19:46.352217135–01:19:54.499822645 UTC. The isolated snapshot archives commit
`0cef5041e71d9f06e3433e3bc8507345382fe85f` and uses full-file-context patches with
exact baseline/final byte checks, excluding unrelated and denied pending work.

Reconciliation at 01:21:21.135 UTC passes 2,716 native input identities, all 334
frozen source05 artifacts and 48 prior table-feature artifacts. It compares the
complete 790 prior assertion-name multiset with the new result outside the added
group, and verifies code/snapshot identities, the 516-file committed manifest and
five-file execution scope. This is not a full-suite result, an actual old-runtime
negative control or a successful source operation.

Frozen evidence: `node_modules/.cache/native-validation/native-source-head-boundary/`.

| Artifact | SHA-256 |
| --- | --- |
| Final runtime source | `32a74c5f9778a6c028133fef57a9d9bc4effb8ff295b50cc28793ef1d723a430` |
| Formatted test source | `f611084f6a21855de2a44fe7d699a530e32e0c3597e26bb38447527a35a97a52` |
| `REVIEW.md` | `93bc61412cdb280a9b88b0089332bb8f1825548d12ab82abd45dcd3af1dcf8d8` |
| `evidence/native-01-INPUT-SHA256SUMS` | `98fda0799876679ce9d8bfb58ffda980b0cba42471c230b67337399000e6b387` |
| `AUDIT.json` | `3226820820756eed5e4a6366a64ba739c6ae4288ae01c34005d3cac60319c13f` |
| `FINAL-SHA256SUMS` (50 entries) | `962b02a286b609adcefb0d0a6ca343340906f3fe5705c07e59c45632f0a80398` |

Next is independently reviewed wrapper/verifier provenance and fresh synthetic
integration before requesting one bounded native source operation. Neither the
old source context nor this test pass proves that the W3C document meets the
new eligibility contract. Modern privacy, provider/vault/device/page/consent and
blocked research remain unresolved.
