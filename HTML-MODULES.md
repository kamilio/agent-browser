# Opt-in HTML module loading

The native script loader can connect parser-inserted module scripts to the
document-owned network module registry and the extension page runtime. This
does not add another JavaScript engine or a browser fallback.

## Explicit mode

`AGENT_BROWSER_PAGE_SCRIPTS=module` selects classic-and-module loading and
requires `AGENT_BROWSER_PAGE_RUNTIME=extension` plus an explicit
`AGENT_BROWSER_SAFEJS_ROOT`. The existing `classic` mode keeps its behavior;
automatic page scripts remain disabled when no mode is selected. Selecting
module mode with the legacy adapter is rejected rather than silently falling
back. These settings do not install, update or qualify a SafeJS package.

For an embedding host, configure `PageScripts.networkSourceModules` with this
document's URL, a policy-aware fetch provider, `entries: []` and
`htmlEntries: true`; set `ScriptLoader` limits to include `modules: true`.
The loader asks its runner to prepare each entry, then evaluates the prepared
source with `sourceType: "module"` and the exact registered identity.
Normal static module registry configuration does not grant HTML entry admission.

## Source ownership and policy

Inline entries use document-local reserved URN identities, distinct from any
fetchable URL. Their import base is captured independently from the document's
base URL. External entries retain the requested URL as identity, while relative
imports use the final response URL as their base. Fragments distinguish module
identities; network fetch policy controls the actual request URL.

Roots and imported dependencies share the bounded registry/cache. External
sources always require the existing policy-aware CORS path, successful status,
JavaScript MIME and UTF-8 decoding. Credentials default to same-origin;
`crossorigin="use-credentials"` selects include for the entry's graph. The
registry inherits that context along imports and reuses the first admitted
load for an already-known identity. Page code cannot supply the trusted
document origin or replace the network provider.

External integrity metadata is checked against original response bytes.
Cached modules retain bounded integrity digests rather than body buffers, so
a dependency later used as an integrity-constrained entry need not be fetched
again. Configured source-only entries have no original-response digests and
cannot satisfy an external integrity constraint. Existing source, request,
concurrency and byte limits remain in force.
Cancellation and document/runtime closure stop admission and release ownership.

## Loader behavior and limitations

Modules defer by default; explicit async entries are scheduled when prepared.
In module-capable mode, classic `nomodule` scripts are skipped. Module evaluation
keeps `document.currentScript` null and receives no parser `document.write`
insertion capability. Distinct inline entries retain distinct identities.

The loader still reports partial support. Import maps, arbitrary dynamic DOM
script insertion and complete browser script scheduling are not implemented.
The existing runtime exposes a single evaluation promise, not a module's
synchronous execution phase separately from top-level-await completion. The
serialized loader therefore cannot claim standards-conformant top-level-await
and DOMContentLoaded timing. A module waiting for an event that this loader
delays may reach the existing execution deadline instead of completing.

Native tests use deterministic transports and fake SafeJS contracts. They can
verify scheduling, source registration, policy forwarding and lifecycle wiring,
but not actual JavaScript/module execution in a published SafeJS release.
Actual SDK, public-site and Zoom interoperability remain separate acceptance
gates. Enabling this mode is not evidence of meeting admission, incoming audio,
recording, transcription or summary delivery.
