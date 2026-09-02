# Public SafeJS extension adapter

Status: September 2, 2026. The adapter is implemented and covered by mock-contract
tests. It has **not been run against an approved released SafeJS artifact**.
The CLI/service still selects the existing experimental adapter; no dependency,
installation, SDK patch or default runtime switch is part of this work.

The public contract was inspected at poe-code commit
`7984fa903602e6561b342a140f472978827094b7`: realm options, extension setup, callbacks,
error results, budgets and cleanup. The maintainer's 19:34 UTC comment on #550
reports implementation pushed and release jobs queued. That is upstream evidence,
not local package acceptance or provenance verification.

## Integration boundary

`extensionPageRuntime(core)` accepts the public core namespace and returns a
trusted `PageRuntimeFactory` for `PageScripts`. It imports no interpreter internals
and does not discover, download or substitute packages. `ReleasedCore` and related
types describe only the public members consumed. The strict explicit package
loader remains separate from this portable adapter.

Before setup, `pageBindingGlobalNames` declares the exact browser globals,
including optional History, Storage and fetch bindings from the native owner.
Each realm registers one `agent-browser-page` extension, the `guest:retain` grant,
and explicit `builtinOverrides: { console: "agent-browser-page" }` authorization.
No other intrinsic is replaced. Owned DOM, Window, timers and console capabilities
are constructed through the extension context. No source prefix rewrite or
separate mirrored console is used.

Setup is lazy. One empty-source bootstrap initializes the extension before the
first user evaluation. It uses the same lifetime work budget, does not replay
user code and is not a separate browser command. Closing an unused owner does
not acquire DOM capabilities. Optional native ports must be installed before
constructing the page owner; declaration mismatches are not silently repaired.
A core that rejects console authorization, omits setup, lacks budget metrics or
returns an obsolete untagged result fails closed without legacy fallback.

## Results and lifetime

- The public realm exports values; the adapter uses those directly. `PageScripts`
  still applies bounded, accessor-safe JSON projection, without a private copy API.
- Tagged failures stay failures. Only validated public own error codes and budget
  names are retained, not sensitive messages/stacks. No SDK error constructor or
  error getter is required. Revoked contexts cannot return successful values.
- Only the supported filename option goes to realm evaluation. Per-request abort
  and timeout close the realm lifetime rather than passing an unsupported signal
  option or reusing a canceled realm.
- SDK context abort/cleanup closes idle owners. During active evaluation, closure
  is finalized through the result/error path so the original failure is not
  replaced by an unrelated closed error. Finalization catches deferred closure
  notices. Borrowed native document interactions retain their native owner.
- Closure is idempotent and cleanup failures remain observable. Retained timer
  arguments are released while live. During whole-realm closure the SDK revokes
  its roots; browser cleanup does not release already revoked handles again.

## Callbacks and bounds

The adapter forwards `startCallback(callback, { args, thisValue })`, preserving
the SDK's original prefix and final-result promises. It does not fake completion,
wait for all async tails before native default actions or approximate ordering
with a fixed number of microtasks. Timer argument retention is registered during
setup before either global or Window timer methods are exposed.

Source size, run count, pending callbacks, result size and per-request timeout
remain bounded by the browser. Work, call depth, strings, arrays and data share a
persistent SDK Budget, without a fixed wall-clock lifetime expiry for idle pages.
Hard preemption of uncooperative native work still needs the process boundary.

Public realm quotas: one extension, 4,096 host objects, 4,096 callbacks, 8,192 guest
references, 64 cleanups and eight nested evaluations. The last quota grants no
nested-source permission: only retention is granted, and guest dispatch/focus/reset
wrappers are not added.

**Still unverified:** fresh source evaluation while an earlier callback's async
tail remains pending. The browser requires this without breaking prefix ordering.
The raw release probe checks it explicitly; the browser probe exercises an async
canceling click listener. Mock tests cannot establish released scheduler behavior.
No source replay, hidden callback RPC or final-result waiting workaround substitutes
for that gate.

## Acceptance commands

After building, select an already available, trusted and approved package root
and exact release version. Replace the placeholder; the loader rejects `0.1.XX`
and never resolves `latest` or downloads an artifact:

```sh
AGENT_BROWSER_SAFEJS_RELEASE_ROOT=/absolute/path/to/approved/package AGENT_BROWSER_SAFEJS_RELEASE_VERSION=0.1.XX node packages/browser-agent/dist/scripts/check-released-safejs.js --trace
AGENT_BROWSER_SAFEJS_RELEASE_ROOT=/absolute/path/to/approved/package AGENT_BROWSER_SAFEJS_RELEASE_VERSION=0.1.XX node packages/browser-agent/dist/scripts/check-released-page.js --trace
```

The first consumer checks raw extension contracts, now including console ownership
and source progress after a suspended callback prefix. The second uses this adapter
with the native command host, DOM, console journal, controls, retained timers,
session Storage/History, navigation and cleanup. Documents and transports are in
memory, not real websites or a live terminal. Reports record selected package
identity and distinguish failure from completion; neither establishes package
provenance from a manifest alone.

These consumers compile but are **unrun against a released artifact** at this
checkpoint. No placeholder green report is created. Default activation, released
compatibility, owned-process integration, real-site/terminal acceptance and full
browser parity remain separate gates.
