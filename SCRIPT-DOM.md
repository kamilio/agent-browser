# Experimental script DOM

September 1, 2026. `ScriptDom` binds the browser's own `DocumentTree` to the locally
extended SafeJS public `createHostObject` API. No dependencies are installed. The
default CLI, server and playground keep automatic website JavaScript disabled.
`SCRIPT-LOADING.md` documents later opt-in classic execution through this adapter;
`DOM-FRAGMENTS.md` adds fragments, cloning and detached control-root indexing.
`HTML-CONTENT.md` adds contextual innerHTML and bounded inner/outer serialization.

## Implementation

The adapter caches opaque per-node capabilities for a document's lifetime. It does
not pass copied DOM records to scripts. Getters read current tree state and
setters/methods mutate that same tree, so snapshots and later queries see changes.

- Node properties expose type/name, parent/sibling/child identity, ownerDocument,
  isConnected, nodeValue and textContent. Removed nodes keep identity and data.
- Document methods create elements/text/comments, find IDs and run bounded
  selectors. Document properties expose body/head/root and URL.
- Elements support attributes, child insertion/removal, matches/closest queries,
  and reflected id/className/title properties.
- Text replacement validates and allocates its replacement before detaching old
  children. Node/text/depth quota failures do not first empty the old element.
  Document textContent is null/no-op; character-data nodes expose their data.
- Input/textarea value and input checked state use the owned control model.
  Programmatic changes do not use agent actionability checks. Default attributes
  remain unchanged in value/checked modes; default-mode values reflect attributes.
  Radio peers use their actual connected or detached tree-root group model.
- Capability identity rejects fabricated or foreign-document nodes. Closing the
  adapter or document revokes access and clears caches.
- Optional guest function-listener bindings connect node add/removeEventListener
  to controlled dispatch. `SCRIPT-EVENTS.md` defines the dispatcher ownership,
  live event fields, error/cancellation policy and remaining integration gates.

The constructor accepts a structural factory interface. Browser code does not
import private SafeJS paths or modify the installed SDK. `SAFEJS-EXTENSIONS.md`
records the separate source candidate. This is a partial binding, not full DOM.

## Verification

The guest-listener checkpoint has 885 passing tests across 48 files, including fifteen
guest-event adapter tests; `SCRIPT-EVENTS.md` records the current compiled-core
probes. The earlier DOM checkpoint below has 860 passing tests across 46 files, including seven
script-DOM tests and existing subprocess, transport, form/action and snapshot
regressions. Build, strict typecheck and the configured linter pass.

`NATIVE-SCRIPT-ACTIONS.md` records the later 908-test checkpoint and actual
interpreted listeners driving native controls, forms, keyboard and real-page links.

`reports/safejs-script-dom-2026-09-01.json` records seven checks with the actual
compiled public SafeJS core. It verifies snapshot mutations, cross-source identity,
creation/lookup/attributes, input/checkbox state, removed-node identity and absent
ambient network/process capabilities.

`reports/safejs-script-dom-sites-2026-09-01.json` has thirteen passing checks: those
seven plus three each on actual HTTPS loads of Example Domain and Books to Scrape.
Scripts read downloaded headings, mutate only local trees and verify the session
snapshots and identities. These are explicit test scripts, not website-authored
scripts. There are no HTTP mutations, browser-engine fallbacks, account actions or
stored raw responses/credentials. The final 113639424-byte RSS value is a whole-process
sample, not peak memory or a complete browser benchmark. The initial sandbox
network-error report is retained.

After building this package and the explicit SafeJS source core:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
  timeout 50s node --max-old-space-size=192 \
  packages/browser-agent/dist/scripts/check-script-dom.js --sites
```

This selects the declared `@poe-code/safe-js/core` export in the local source
package, not the global installed SDK. Omit `--sites` for fixture-only checks.
This in-process probe runs trusted test scripts under an enclosing timeout; it
is not an untrusted website execution service.

## Remaining gaps

- Child lists are snapshot arrays, not live NodeLists/HTMLCollections. Namespaces,
  custom elements, shadow trees, complete fragment parsing, constructors/prototypes,
  complete document hierarchy validation and object-to-DOMString conversion are
  missing. Basic script-facing document-child constraints are now enforced;
  fragment node construction/cloning is distinct from HTML fragment parsing.
- Specialized input modes, file inputs, select/option IDL and full control behavior
  are unfinished. Unsupported specialized input value writes fail explicitly.
- Function-listener registration/removal and live event capabilities are wired
  experimentally (`SCRIPT-EVENTS.md`). Native async actions are integrated in
  `NATIVE-SCRIPT-ACTIONS.md`; guest synchronous dispatch,
  event constructors and the complete microtask checkpoint model are not.
- Script discovery/order, DOMContentLoaded/load, timers, network grants and
  navigation cancellation still need integration. The current process adapter
  uses independent `run` jobs, not persistent realms.
- A process-owned document authority or verified mutation/synchronization protocol
  is required before mixing child scripts with parent native actions. Replacing
  node identities between jobs or replaying source is not an acceptable shortcut.
- Native wrapper-allocation and DOM-work quotas need further stress testing;
  interpreter data accounting is not an RSS cap. Large child collections may
  allocate host-side bindings before the interpreter converts their results.

Automatic website JavaScript remains disabled. These checks do not establish
dynamic-site acceptance or the requested full Kitesurf/Playwright superset.
