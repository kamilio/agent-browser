# Opt-in lexical table scopes

`discoverResearchSourceHeadings` accepts the explicit host option
`tableScopePolicy: "optional-end-tags-v1"`. The default remains the strict
`native-source-headings-v1` scanner with unchanged report shape and rejection
rules. This option is not enabled in the CLI, page API or source-request wrappers.

The opt-in is a conservative lexical subset, **not an HTML tree builder or DOM
visibility model**. A successful report retains `semantics: "lexical-not-dom"`,
`partial: true`, `contentSuccess: null` and adds its selected `tableScopePolicy`.
The policy field participates in the existing output-byte cap and deep freezing.
Only the exact own data value is admitted; accessors, proxies, inherited policies
and nonliteral values do not enable recovery. Selection is snapshotted before
asynchronous scanning and cannot be changed by later caller mutations.

## Supported transitions

Recovery recognizes only a contiguous suffix rooted in an actual tracked table:
`table`, optional `tbody`/`thead`/`tfoot`, optional `tr`, optional `td`/`th`.
A cell requires an actual row. At most four stack slots are inspected; no older
ancestor search, implicit container insertion or token replay occurs.

- A new `td`/`th` can replace the preceding cell within the same row.
- A new `tr` can close the preceding cell and row within the same table/group.
- A new `tbody`/`tfoot` can close the preceding cell, row and `tbody`.
- Explicit `</tr>` and matching group ends can close their cell/row descendants.
- Explicit `</table>` can close its cell, row and `tbody` descendants.

Implicit removal is limited to cells, rows and `tbody`. `thead` and `tfoot`
require matching explicit ends. Caption, colgroup, template, select, foreign and
other tracked scopes are barriers, not disposable ancestors. A nested table
start never closes its outer table; closing it leaves outer suppression intact.
No heading inside a retained table or outer tracked scope becomes a candidate.
Raw text continues through the native cursor's raw mode, not these transitions.

For example, selecting the policy permits
`<table><tbody><tr><td>A<td>B</table><h1>After</h1>` and returns only `After`.
Default strict mode still rejects that sequence. Conversely, a redundant explicit
end after an implicitly closed cell can be rejected under opt-in. The policy is
not a validator of every possible table parent relationship: unlisted transitions
fall back to existing strict behavior, including its lexical limitations.

## Failure and resource bounds

Plans validate the complete bounded suffix before mutation. Additional planning,
inspection and planned mutation work is charged to the existing work budget;
depth is admitted before a replacement push. Transitions have no mid-mutation
await and check cooperative yielding afterward. All original byte, source,
window, work, operation, issue, depth, heading, entry, output and deadline caps
remain unchanged. EOF never drains unclosed scopes.

Rejected plans leave the original stack intact. Scope mismatch still precedes
nonplain-close diagnostics; no speculative expected scope or arbitrary source
value is exposed. The existing private WeakMap getters retain fixed immutable
records. Native issues, raw/self-closing errors, resource, abort/deadline and
cursor cleanup behavior remain separately enforced.

## Validation

On September 7, 2026, separately authorized isolated build, strict test typing
and scoped Biome pass at 23:29:21.791105694–23:29:29.698120355 UTC. The exact five
manifest-listed native files pass **695 tests, zero failures or pending**, at
23:29:54.320330677–23:29:58.090870257 UTC: source headings 368, source input 105,
cursor 139, tokenizer issues 49 and resource limits 34. This includes 12 new
option-admission and 49 new transition cases, retaining all 634 prior cases.

Independent static runtime review finds no actionable issue. Parent reconciles
the subsequent formatter's layout-only changes. A separate metadata/hash audit
at 23:31:52.968 UTC checks final working/tested identities, all 2,716 test inputs
and all 304 preserved source-03 artifacts. This is not a full-suite pass or an
actual old-runtime negative control.

The actual W3C observation in `SOURCE-SCOPE-DETAIL.md` identifies expected `td`,
observed `table`, depth 27, but not the intervening stack or a recoverable source
pattern. No new source request, wrapper/verifier policy activation, source-body
inspection or old-capture decoding/replay occurs in this change.

Frozen evidence: `node_modules/.cache/native-validation/native-source-table-scopes/`.
Its `FINAL-SHA256SUMS` covers 45 files, SHA-256
`c79e00a5f6348d9d6ba64383a5d8e261492c42e5d73f21ce7b1ea3b59900792a`.
`AUDIT.json` is `b272d0c06a637328e9e0b458df43605e0229175c4df7b0fa930462f8261c5f29`.
Tested runtime: `eebb457a8aa4d215c171115ee790d838384261bfa7ae2d016eea93496006cb16`;
tested test file: `9da503b871fdc45d1bf73a3abf65a160bdbcf4cfcf9d405e19f1369fffe409f9`.
The separate two-file design evidence is in
`node_modules/.cache/native-validation/native-source-table-scope-design/`.

Modern WebAuthn privacy wording, provider/vault, physical-device, page/consent and
full browser gates remain open. All stopped/denied gates remain unchanged; this
option is not challenge bypass or proof of successful live extraction.
