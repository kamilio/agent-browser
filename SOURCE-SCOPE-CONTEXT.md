# Trusted bounded scope context

`sourceHeadingScopeContextDiagnostic(error)` provides trusted host-only context
for actual native source-heading scope-close failures. It is separate from the
existing structure and five-field scope getters; their records and semantics
remain unchanged. No CLI, page API or source-wrapper activation is included.

The new readonly record has exactly four fields:

- `kind: "source-heading-scope-context"`.
- `tableScopePolicy: "strict" | "optional-end-tags-v1"`, from the snapshotted host option.
- `order: "outer-to-inner"`.
- `scopes`: an owned frozen array of the actual finite tracked scope names.

The array is empty for an empty tracked stack and bounded by the existing hard
depth limit of 128. It contains only admitted native scope-name constants, not
arbitrary tag names, attributes, source snippets, titles, URLs or error messages.
The record and array are frozen before the error leaves the scanner; they do not
retain the live stack, token, cursor or source. Repeated lookup of the same actual
error returns the same record. Different errors get independent snapshots.

Only actual scope-close failures already receiving the existing scope diagnostic
are branded in the new private WeakMap. The getter does not inspect supplied
properties, prototypes, descriptors, coercion hooks or proxy traps. Forged,
copied, wrapped, foreign and revoked-proxy inputs cannot acquire the private
brand merely by claiming matching fields. Other parser, resource and admission
errors remain unbranded by this getter.

## Behavior boundary

This adds bounded error metadata, not parser recovery. Strict/default and selected
table-policy transitions, successful reports, counters, work charges, yields,
limits and existing rejection precedence remain unchanged. A rejected optional
table plan leaves its original tracked stack available to the snapshot.

Tracked lexical scopes are **not DOM ancestry or proof of source syntax**. The
actual trial in `SOURCE-TABLE-TRIAL.md` reports expected `td`, observed `table`,
depth 31 at source coordinate 872144, but its old receipt has no context record.
It is not enriched retroactively. Any later source integration must explicitly
admit the new bounded schema and undergo separate authorization.

## Validation

On September 7, 2026, exact round-02 native validation passes **740 tests, zero
failures or pending**, in five explicit manifest-listed files at
23:59:37.295226721–23:59:41.315401378 UTC. This includes 45 new context cases and
all 695 prior cases: source headings 413, source input 105, cursor 139, tokenizer
issues 49, resource limits 34. Isolated build, strict test typing and scoped Biome
pass at 23:58:49.863526911–23:58:59.378961897 UTC. Independent static review finds
no actionable runtime issue; its exact runtime hash is the tested hash.

Parent corrects one new test-key expectation before execution, then reviews
layout-only formatter changes. An earlier native launcher refuses round 01
before testing because a short-context snapshot mirror reordered the appended
test block. That snapshot and setup logs remain unchanged; they are not a native
pass. The fresh round-02 builder uses whole-file context and immediate exact-byte
guards. No runtime change is made to accommodate this local tooling defect.

Metadata/hash reconciliation at **September 8, 2026, 00:01:29.837 UTC** checks
all 2,716 native inputs, reviewed/final working/tested identities, the retained
untested snapshot and all 328 source-04 artifacts. No old-runtime negative control,
source-wrapper activation, new request or body/capture decoding/replay is claimed.

Frozen evidence: `node_modules/.cache/native-validation/native-source-scope-context/`.
`FINAL-SHA256SUMS` covers 62 files, SHA-256
`e792134928ec43163142f98b69183685fd540452e346090cb67ca662865b7085`.
`AUDIT.json` is `1a5cfd7b6a16c46dc76b65c236d9569c836533c44a6ab87c578e09c0d8c9dda5`.
Tested runtime: `c124040b70b75945b4057a7753eb38ada57c93d0deadb0bb79823d090473b544`;
tested test file: `f5e852b5310f93c1db9031a61b3b2e59d01298dffcee1067ba2219467a8d363d`.

Modern passkey privacy wording, provider/vault, physical-device, page/consent and
full browser gates remain open; all stopped/denied gates remain unchanged.
