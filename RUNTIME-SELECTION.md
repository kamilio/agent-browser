# Explicit page-runtime adapter selection

September 4, 2026. Native configuration now carries an explicit legacy/extension
choice through CLI, session host, restricted-process initialization and the actual
PageScripts factory boundary. This is configuration and public-contract wiring,
not a released SafeJS execution, provenance or website-compatibility claim.

## Configuration

| Setting | Behavior |
| --- | --- |
| No SafeJS root or adapter configuration | Existing native no-runtime CLI host. |
| AGENT_BROWSER_SAFEJS_ROOT only | Existing legacy adapter default. |
| AGENT_BROWSER_PAGE_RUNTIME=legacy or extension | Requires a nonempty explicitly configured SafeJS root. |
| AGENT_BROWSER_PAGE_SCRIPTS=classic | Separately opts into classic website scripts; still requires the configured root. |

Unknown adapter values reject without fallback. Explicit runtime/root validation
runs before local or connected routing; a connection cannot bypass a missing-root
error. A configured client does not reconfigure an already-running service: only
normal argv/session request data is sent. Configure the service when creating it.
No SDK is discovered, downloaded, installed or automatically substituted.

## Public SDK and process contract

loadPageRuntime validates a bounded package manifest and canonical public-export
file inside the configured root. Recognized declarations are poe-code ./safe-js
and the @poe-code/safe-js or @poe-platform/safe-js ./core exports. These names and
version strings are metadata, not authenticity or successful execution evidence.
The legacy loadPageScriptCore return shape remains available for existing callers.

Adapter selection checks own data-property function descriptors rather than
invoking accessor getters or calling SDK operations. It returns the corresponding
PageRuntimeFactory without creating a realm. The legacy and extension operation
sets remain distinct; missing selected-contract operations fail rather than
silently switching adapters.

SessionProcessHost copies validated configuration before actor creation and
reports runtimeValidation=configuration-only. The process validates adapter
selection before root access/spawn and sends it in initialization. The child
loads the requested public contract, supplies sdk.factory to the existing
PageScripts owner and reports adapter, public export, package/version and
runtimeValidation=contract-shape-only. Readiness does not create a page runtime
or evaluate a page. Parent readiness validation rejects mismatched adapter,
package/export or validation markers while retaining existing PID/session,
permissions, frame bounds and owned-process cleanup checks.

## Native evidence

The worker's original selector and production patches remain unchanged. Parent
extends the actual connected CLI-to-host double-click fixture across unset,
legacy and extension client settings, verifying that no local runtime host is
constructed and no runtime/root field is sent to the existing native service.
Those fixtures execute actual CLI, command-host and session code but inject the
connection boundary; they do not open a socket or launch a subprocess.

Focused validation passes 228 tests / twelve working files and 226 / twelve
isolated files. The two-count difference is preexisting pending CLI-parser tests,
not missing runtime cases. Types/builds, strict seven-test-file checking,
thirteen-file formatting, seven-file scoped Biome checks and six-source-
file lint pass. Child initialization, stdio, process creation, package imports
and page factories use explicit native fixtures/mocks. The worker's original
223-test/eleven-file report retains its earlier base and measurements.
Parent evidence uses runtime-selection-integration-* in the native-validation
cache; it is not repackaged as a released-runtime validation report.

Authorized full native validation passes 10,347 tests / 303 isolated files.
Working validation reports 11,478 passes and the same fifteen pending
positioning/capability/onload assertion failures / 325 files. The same 22
preexisting uncommitted test files remain absent from the HEAD archive, not
removed from the native allowlist. None of those pending failures is changed.

## Remaining runtime gates

The separate focus bridge must preserve the final registered nested-operation
identity and controlled callback prefixes; ordinary async host methods cannot be
advertised as synchronous HTMLElement methods. Selection of the extension adapter
alone supplies no proof of that behavior. Released artifact availability,
provenance, scheduler semantics, real restricted-process permissions, live sites,
socket/TTY behavior and framework compatibility still need their authorized gates.

Standard URL/URLSearchParams constructor publication remains open. The preserved
worker investigation at parallel-web-globals/WEB-GLOBALS-CONSTRUCTOR-BLOCKER.md
inside the native-validation cache distinguishes an available public nested-source
transport from inspected guest-language constructor-call/accessor limitations.
Its internal helper delivery is not merged or aliased to standard globals here.
No private runtime hook, replacement engine or spoofable constructor workaround
is introduced. No SafeJS, live-site, socket, real TTY/PTY or actual child-process
probe ran, and previously denied probes were not retried.
