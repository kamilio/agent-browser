# Bounded native DOM expandos

Status: September 18, 2026. This is an explicit, programmatic opt-in for
guest-owned properties on selected native DOM capabilities. It requires a
matching **private SafeJS SDK candidate**; it is not a published, installed
default capability or a claim of general browser compatibility.

## Configuration

The page runtime loader accepts this configuration shape:

```ts
import type { PageRuntimeLoadOptions } from "./src/node-page-core.js";

const options: PageRuntimeLoadOptions = {
	adapter: "extension",
	runtimeOptions: { domExpandos: "bounded-v1" },
};
```

For `SessionProcessOptions`, use `runtimeAdapter: "extension"` with the same
`runtimeOptions` object. The direct `extensionPageRuntime` factory also accepts
`domExpandos: "bounded-v1"` in its configuration. These examples describe the
option shape, not authorization to load or execute an SDK or publisher asset.

- Default is off: omit `domExpandos`. Native host definitions then omit the
  entire SDK `expandos` field, rather than sending `expandos: undefined`.
- Only the exact primitive string `"bounded-v1"` is accepted. An explicitly
  supplied `undefined`, another value, an accessor, an inherited option or a
  non-enumerable field is invalid. Validation does not execute option getters.
- The runtime selection snapshots the own enumerable data option before SDK
  allocation. Later changes to the caller's configuration do not change it.
- The legacy adapter refuses this option; there is no silent downgrade or
  retry without the requested semantics.
- The CLI accepts `AGENT_BROWSER_DOM_EXPANDOS=bounded-v1`, requiring an explicit
  `AGENT_BROWSER_SAFEJS_ROOT` and `AGENT_BROWSER_PAGE_RUNTIME=extension`. Reader
  profile, legacy runtime and malformed values reject before secret loading,
  process creation or connection reuse. Selection is snapshotted before async
  setup. It does not enable website/classic scripts, string compilation or any
  CSP bypass; those policies remain separate.

The internal `ScriptHostObjectFactory.domExpandos` marker is readonly. The
extension supplies an own, nonwritable, nonconfigurable marker on its
`PageBindingContext` only when requested. This is native configuration forwarding,
not an SDK capability-discovery echo. No realm-level SDK `domExpandos` option is
sent.

## Scope and bounds

Only `ScriptNodePublications` publications of kind `node` request expandos. This
includes native document, element, text, comment, document-fragment and doctype
capabilities published through that path. Existing native node identity is
preserved.

Attrs, attribute maps, collections, DOM implementation objects, window/global
bridges, events, network objects and other host capabilities remain fixed.
In particular, an Attr is not opted in merely because browser DOM terminology
classifies it as a node. Native `childNodes` snapshots are arrays of existing node
identities, not expando-enabled host collections.

Each opted-in node requests these fixed SDK limits:

| Limit | Meaning |
| --- | --- |
| `maxKeys: 64` | At most 64 live guest expando keys per host object. |
| `maxKeyCodeUnits: 4096` | Aggregate UTF-16 code units across its live guest expando keys. |

These are not per-key length limits, global object quotas or declared-member
quotas. Guest values remain subject to the SDK's existing work and retained-data
budgets. Accounting units are not a physical heap-byte bound. No budget is
disabled or enlarged by this native option.

## Publication and lifetime

The native definition supplies a plain, zero-argument, synchronous guard:

```ts
expandos: {
	maxKeys: 64,
	maxKeyCodeUnits: 4096,
	assertActive: () => {
		read();
	},
}
```

Here `read()` is the existing publication/owner-ready assertion, not a guest hook
or a no-op. The callback returns `undefined`. Access is denied before publication
commits, after a failed publication, and after publication or owner closure.
Existing declared-operation guards and publication transaction behavior remain
in place.

The matching SDK invokes this guard before guest reads, writes, deletion,
membership, enumeration and iterator access, including declared-member access.
A guard failure prevents the mutation or declared native operation. Async,
generator and proxy hooks are not supported; returning a promise or another
non-undefined value is also invalid.

Guest values live entirely in SDK-owned storage. Native code neither stores nor
deep-copies expando payloads or guest closures. The SDK retains their identity,
including shared values and cycles, and accounts for the retained graph.

Guard failure is **not eager reclamation**. SDK handle conversion, graph
accounting and cleanup deliberately do not invoke the guard. Retained payloads
remain charged even while document access is denied, until deletion, overwrite,
SDK revoke or realm close releases the relevant references. A guard failure is
not interpreted as permanent revocation because owner readiness can fail
temporarily. Close the owning realm when eager per-document reclamation is
required; there is no new per-object revocation API.

## Protected members and compatibility limits

- Declared properties keep their native getters and setters. Expandos do not
  make readonly members writable or shadow declared methods.
- Declared-member deletion, symbol mutation keys and reserved prototype-name
  mutations reject. No host prototype modification or jQuery-specific exception
  is introduced.
- Descriptor, `Reflect` and prototype operations retain the SDK's existing
  refusal semantics. These capabilities are not ordinary JavaScript objects
  with unrestricted reflection.
- Expando definitions cannot coexist with named/indexed definitions. Native
  attribute maps and host-backed collections are not opted in.
- The inspected older qualified SDK rejects the unknown `expandos` field, so
  explicit opt-in fails closed on that lineage. This is not a guarantee about
  arbitrary older or third-party SDKs. Use the matching private candidate;
  runtime contract-shape validation alone is not feature qualification.

## Qualification evidence and remaining gates

These are existing results, not executions performed to write this document.

| Scope | Evidence | Result |
| --- | --- | --- |
| Parent native union | `/tmp/agent-browser-dom-expandos-union01-b8ncDG/candidate`; sibling `execution/EXECUTION.json` | 3150 tests in 65 files passed, 33.740348 seconds. |
| Private SDK union | `/tmp/agent-browser-sdk-dom-expandos-BqM3JX/union02` | 1516 tests in 102 files passed. |
| Private SDK focused | `/tmp/agent-browser-sdk-dom-expandos-BqM3JX/green03` | 57 tests in 2 files passed. |

The parent native build, scoped types and format checks pass. Whole touched-file
lint has one independently reproduced, pre-existing `noAssignInExpressions`
finding in `script-dom.ts`; it is not a new finding or an all-lint-zero result.
The SDK handoff records a passing strict core/node declaration build and focused
typing, not a full CLI/workspace build or repository-wide formatting/lint pass.

The SDK contract and evidence details are in
`/tmp/agent-browser-sdk-dom-expandos-BqM3JX/SCHEMA.md` and
`/tmp/agent-browser-sdk-dom-expandos-BqM3JX/HANDOFF.md`. Original failed runs remain
at their original paths; later passes do not rewrite those outcomes.

Native mocks and SDK synthetic tests are separate gates. As of this documentation
handoff, parent owns and is running the combined captured-dependency recovery
gate; this document does not claim its result. None of the results above proves
whole Zoom page startup, meeting admission, media operation or notetaking.

Subsequent combined recovery at
`/tmp/agent-browser-zoom-join-dependency-recovery-xtNvCr/stage01` verifies the
actual expando preflight and unchanged captured bootstrap, but the original
Zoom dependency exceeds its120s script deadline. Stage03's same-input CPU
diagnostic attributes about96.7% of sampled execution to retained-data
reconciliation. Both failed gates close owners/process groups and release all
SDK-retained values/data. Neither verifies the final jQuery exports.

CLI forwarding is separately qualified by291 native tests in6 files at
`/tmp/agent-browser-cli-dom-expandos-green01-4KAOv6/candidate`, with build, types,
format and lint passing for the scoped change. The failure-first run retains17
failed assertions. This mock-only qualification does not execute an SDK, create
a real process, visit a website or establish actual owned Zoom recovery.
