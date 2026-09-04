# Native public-contract focus bridge

September 4, 2026 integration on `f1d7b43`. This extends the native helper in
`FOCUS-OPTIONS.md` and the explicit adapter selection in `RUNTIME-SELECTION.md`.
It is a tested native implementation of an inspected public contract, **not
released-SafeJS execution evidence**.

## Publication and completion

The extension adapter requests `guest:retain` and `source:nested`, and exposes a
setup-only registration hook to PageBindings. It does not expose registration,
nested source evaluation or any runtime-private API to page scripts.

PageFocus registers a bounded pool of final outer focus/blur operations during
setup. Lazy element publication binds a previously unused pair to the final
ScriptNodePublications ownership guards. The exact registered outer function is
the published host method: no later wrapper changes its identity. Native focus
dispatch awaits controlled listener prefixes, not arbitrary async listener tails.
Only these registered operations use the public await-result contract; ordinary
async APIs still return Promises. This contract still requires an authorized
released-runtime execution gate before claiming synchronous guest behavior.

Ownership is checked before and after async dispatch. Failed publication consumes
its pair, and unpublished, closed or revoked operations cannot regain authority.
Closing the helper aborts suspended calls. Existing native reentrancy, same-target
options, focus indication and root-scroll behavior remain authoritative. Own-data
focus dictionaries remain deliberately narrower than arbitrary guest dictionaries.

## Resource and compatibility limits

The default is **4,096 publication pairs and 8,192 setup-time registration calls**
per enabled page. This is a bounded upfront cost, not a measured release-speed or
memory claim. `focusLimits.maxBindings` accepts integers 1 through 4,096. All
active element publications consume slots, even nonfocusable elements; slots are
never rebound or recycled. Exhaustion rejects rather than registering late or
silently returning a Promise substitute. Other runtime quotas remain independent.

The integrated 24-case pressure audit exercises pools of 1/64/512/4,096 slots,
repeated owners, failed registrations/publications, exhaustion, revoked retained
methods, 128-deep publication limits and repeated nested listener failures. It
does not force GC, measure RSS or equate cleared slots with document reclamation.
The native total-host-object model reserves six setup objects, so at most 4,090
button publications fit its 4,096-object quota. Its definition-only step estimate
is stricter: at most 916 such element definitions under the configured default
step budget, before any guest execution/callback/access costs. Neither estimate
is a measured released-runtime page capacity; no quotas are raised here.

Contexts lacking registration omit active element focus/blur methods. Inert
secondary documents retain their existing synchronous no-op methods. Runtime
selection remains explicit, with the legacy default unchanged. Module-level
native helper capabilities remain conservative; the instance reports whether it
has the bridge, not whether a released runtime passed acceptance.

## Integration evidence

Current focused suites pass **227 tests across ten files** in working and
isolated trees, including eighteen bridge and twenty-four pressure cases. Source
types/builds, four strict test checks, seven-file Biome checks and two-file
format checks pass. Lint on the two larger binding modules retains only the
preexisting ScriptDom assignment-expression diagnostic; no unrelated cleanup is
bundled. A parent integration test calls
the final published methods on a fixed target at root scroll (100,300), asserting
unchanged geometry, indication and ordered focus/focusin/blur/focusout callbacks.
Other cases cover exact identity, late-created elements, ordinary Promise APIs,
callback prefixes/tails, nested reentry, cancellation, failure, close and limits.

Final authorized explicit `native-tests.json` runs pass **10,493 tests across
308 isolated files**. The working run reports **11,624 passes and the same
fifteen pending assertion failures across 330 files**. Fourteen are preexisting
obsolete positioning/capability expectations and one is the unchanged onload
object assertion. The same twenty-two additional uncommitted test files remain
outside the HEAD archive, not excluded from working validation.

The original worker delivery and source-contract references remain in
`node_modules/.cache/native-validation/parallel-focus-bridge/FOCUS-BRIDGE-DELIVERY.md`.
The separate pressure handoff remains under `parallel-focus-provisioning-pressure`.
Its setup definition-work measurement belongs to that snapshot: the working tree
has three additional preexisting Window entries (149 versus 146 setup units).
The integrated fixture measures setup work rather than freezing unrelated Window
API counts, while retaining exact pool/publication counts and the independent
step-ceiling assertion. None of those pending Window additions is committed here.
Current integration logs use the `focus-bridge-integration` prefix. An initial
full-suite attempt was invalidated by accidental in-source TypeScript output.
All 3,104 newly emitted files across both roots were byte-verified, individually
backed up and removed; the invalid log remains separately labeled. Builds now
use the repository's `--outDir dist` setting and native suites are rerun cleanly.
The first clean run also exposed one obsolete runtime-selection grant assertion;
that tracked test now expects the new source:nested grant. Its before-fix logs
remain separately labeled rather than being confused with the final run.

## Open acceptance gates

Released-SafeJS scheduling, controlled guest callback execution, actual subprocess
permissions, live websites, sockets, real TTY/PTY and full framework/playground
compatibility remain unverified. No such probe ran or previously denied probe was
retried. Public URL/URLSearchParams constructors remain blocked separately; no
internal factory is aliased to a standard constructor. Provisioning pressure is
covered by the integrated native stress audit, not released-runtime validation.
