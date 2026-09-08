# Bounded network-policy reasons in research evidence

September 8, 2026. Research failures can now retain a genuine native network-policy
reason without publishing addresses, URLs, ports, headers, error messages, stacks,
causes, credentials or response bodies in that diagnostic. Policy decisions and
existing failure categories/stages are unchanged.

## Contract

The optional `failure.networkPolicy` fragment has exactly two fields:

```json
{"kind":"network-policy-v1","reason":"resolved-address-policy"}
```

Its reason uses the same closed12-value vocabulary as the existing private native
diagnostic, through the internal `isNetworkPolicyReason` predicate. The producer
attaches it only for a matching AgentBrowserError with current code policy-denied
and genuine WeakMap identity. Matching text, public fields, wrappers and serialized
copies do not authenticate errors. Unbranded policy/challenge errors remain plain.
The early URL argument check still precedes report construction and can throw
without producing a report. The existing outer instanceof boundary is not newly
Proxy-safe. A retained genuine error is not proof of current-request ownership.

Long-profile emission and both replay profiles validate only these reserved paths:
`failure.networkPolicy` and `outputLimit.prior.failure.networkPolicy`. A present
fragment requires the exact kind/reason shape, allowed primitive reason, enclosing
policy-denied category and string stage, with no own resourceLimit. Malformed,
extra, missing or undefined fields are rejected rather than silently repaired.
Existing safe-snapshot rules handle accessors/proxies/graphs; no new getter trust
or error construction from serialized metadata is introduced.

The bounded prior-failure projection retains only validated kind/reason alongside
category/stage. Its existing128-code-unit and1024-byte guards remain unchanged;
over-bound failures are wholly omitted, never reduced to detached policy reasons.
Fragment bytes count as metadata. The outer output-limit fallback remains the
unbranded resource-limit/evidence-output failure; only prior.failure can carry
the original policy fragment. Replay still returns failure evidence with no body.

## Compatibility and limits

Trusted default emission remains JSON.stringify plus LF, without the long-profile
snapshot, new validation or caps. It can emit arbitrary caller extensions; both
replay profiles validate fragments actually present in received JSON. Undefined
properties erased by default stringify cannot be recovered or rejected by replay.
This is not a strict arbitrary-object default emitter.

Absent diagnostics, resource-only behavior, unknown ordinary metadata, byte
accounting and policy/transport/session behavior are preserved. Invalid extensions
previously using either newly reserved path now reject at those boundaries: this
is the narrow intentional compatibility cost. Other similarly named metadata is
not treated as an authenticated diagnostic.

Serialized validation establishes vocabulary, not native provenance, a trusted
server, fresh-request ownership or permission to retry. Historical NVIDIA failure
remains undiagnosed. No endpoint is revisited, restriction weakened or challenge
cleared by the new reason. This changes no public package barrel or dependency.

## Validation and preservation

An isolated committed5f283b7 snapshot with the six candidate files keeps the
committed package and522-entry native manifest unchanged. **198tests pass in
three selected files:**62diagnostic,124evidence,12producer;77new cases with all121
old cases/assertions retained. This is not the full native suite or a live gate.

Actual first native subprocess: **10:53:57.460Z–10:54:41.386Z**, exit0, no signal,
complete output; whole helper10:53:56.598Z–10:54:42.182Z. Fail/pending/todo counts
are0. All helper/action/supervisor/bootstrap statuses are0. The4408-file expected,
before and after input inventories match:
`6f2f7ed01bad67ae35e274d69256f01bfb9ab7cdb6cda7a4b74d53164aea2e9e`.
They cover2725snapshot files and pinned tools/installed inputs; parent rehashes
all4408 afterward. Static installed-link observations are not runtime topology
enforcement or a full OS/module-resolution attestation.

Original format succeeds at10:35:04.822Z–10:35:06.473Z. Original checks at
10:36:48.908Z–10:36:58.516Z have build0/strict0/lint1 for two new missing-field
fixture delete operations. That failure and all original bytes remain intact.
Fresh round02 constructs exactly the remaining fields, not undefined substitutes;
no runtime/assertion changes. Its checks at10:51:25.625Z–10:51:35.228Z pass all
three stages. No new formatter or original native run is claimed for that round.

Initial harness review finds missing shell/ldd pins and too-late bootstrap coverage.
Corrections add exact tools and a separately pinned13-file external bootstrap,
reviewed before execution. Every phase has separate approval. Format and round02
checks each have one approval timeout followed by one identical approved retry;
original checks and native approval succeed first try. Those are conversation
events, not inferred execution timestamps.

Native limits are180+5s subprocess,210+5s action and225+5s external bootstrap,
6MiB files, owned caches, six-key environment, native mjs config loading,
envDir=false and one worker. Outer shell startup/redirection/final status remain
outside its timer. These synthetic tests do not exercise real DNS/sockets,
websites, passwords, devices, SafeJS or TTYs, nor prove their acceptance gates.

Evidence is sealed in `node_modules/.cache/native-validation/native-research-policy-reporting/`
and the separate `native-research-policy-reporting-round02/` lane. Their final
regular-file inventories exclude only themselves and audit successfully:

- Original2941entries/2942files:
  `e1f72fb8067709a19bfe06f1cba61d8aa7ad5e84999daf078a6949daf6d61af4`.
- Round022867entries/2868files:
  `3e024e0cc95eb760ce0a0d00baefb9dbcc01e7e1d0753549bb716ea825f14c18`.

Neither lane contains symlinks. Independent integration review finds no actionable
defect; its selected-input rehash is not the parent's separate full4408 audit.
Read-only retention is not OS immutability or a signed attestation. No action is
rerun to seal evidence, and the mixed root package is not the tested package.
