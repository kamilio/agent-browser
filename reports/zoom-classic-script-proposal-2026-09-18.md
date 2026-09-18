# Native Zoom prerequisite: public classic-Script proposal

September 18, 2026. **The native browser still has not joined the meeting.**
This checkpoint prepares an unactivated SafeJS contribution; it does not change
the installed SDK, browser runtime selection, or production execution defaults.
No website, credential, device or meeting is accessed; no SDK, guest script or
test case executes in this phase.

## Proposed implementation

The contribution targets the frozen pristine upstream snapshot at commit
`0bafd4f3849f0450481db0f02349c3506c4ab168`, independently of the earlier scheduling
proposal. It is not a claim about the latest release or installed package.

- Add opt-in `createRealm({ classicScripts: true })` using existing Script
  parsing and interpretation, with a persistent lexical environment and intrinsic
  global receiver. Ordinary and nested sources use Script grammar; explicit
  modules retain module grammar and their undefined module receiver.
- Preserve omitted/false legacy grammar and immutable injected capabilities.
  Reject injected `this`/`globalThis` replacements in the new mode. No source
  wrapping, guest-eval trampoline, new dependency or private SDK access.
- Register retained Script source and charge it while active and while retained
  by guest values. Include all registered roots in both existing host-bridge
  remeasurements, rather than allowing those calls to erase active-source charges.
- Track global declaration names separately from property descriptors. Preserve
  identifier-versus-member/with deletion semantics, retained-name accounting and
  explicit optional snapshot metadata. Old snapshots remain readable but cannot
  reconstruct declaration history they never recorded.

These shared accounting/declaration corrections also require regression testing
of existing modes; preserving legacy grammar is not a claim that every shared
code path is untouched. The patch changes 13 upstream files: eight production
TypeScript files, four test files and the package README.

## Review and static evidence

The initial source-only review found three gaps: source retention accounting,
global declaration history, and source-resolved Script imports. F1 and F2 have
source corrections and authored regression cases. F3 is explicitly deferred:
Script `import(...)` uses registered host modules, not `sourceResolver`; correct
per-Script referrers and retained-function attribution remain unimplemented.

The accounting follow-up identifies no remaining F1 blocker in its bounded
source review. The parent reviews the completed declaration/deletion/snapshot
diff and combined candidate, including the snapshot restriction to the intrinsic
global object. These reviews are not observed runtime behavior or general
security acceptance.

The final **TypeScript 5.9.3 no-emit check covers 597 source/declaration files
with zero errors**. It includes all changed production TypeScript and all four
new test files. The pristine source with those same contracts reports **59
missing-API type errors**, retained separately; these are not runtime failures.
An initial pristine source-only check has zero errors. Intermediate source and
contract checks, prototype corrections and the initial restricted-edit handoff
remain preserved rather than being rewritten as final passes.

Authored inventory, not runner discovery: **60 definitions / 126 expanded cases**.
The main public contract contributes 27/66, accounting 6/9, and declaration plus
snapshot contracts 27/51. **Zero tests are executed.** Finite guarded compiler
processes report no IO attempts or socket probes, no timeout, empty task HOME/TMP,
and closed children/process groups. There is no full native suite or SDK pass.

The exported patch passes strict source whitespace/application checks and is
applied to another disposable pristine copy; all 13 resulting changed-file hashes
match the candidate. No package install, upstream modification, commit there,
deployment or production activation occurs.

## Remaining gates

The proposed intrinsic Script global is not yet the browser's capability-backed
`window`/`self`. Guest registry and factory identity need actual qualification
with real page capabilities, not a copied host-array substitute. Composition
with the separate callback scheduler is untested, and source-resolved Script
imports are unsupported. Existing source/execution limits are not raised.

First obtain the separately required isolated SDK execution authorization and
qualify these contracts plus existing lifecycle, budget, parser/eval, callback,
module and snapshot regressions. Then integrate an explicit opt-in native adapter
and qualify unchanged client source under a bounded execution profile.

Native media reception/decode, legitimate meeting admission, permitted recording,
transcription and verified summary delivery remain separate implementation and
acceptance gates. Hardware/benchmark/Twitter/Reddit research and broad website
coverage are not completed by this work. No challenge bypass or alternate engine
is used. The overall browser goal remains active.

Artifacts: `contributions/safejs-classic-scripts/README.md`,
`contributions/safejs-classic-scripts/QUALIFICATION.md`, the sibling patch, and this
report's JSON companion. Pre-existing uncommitted work is preserved; no push.
