# Classic page globals

The extension adapter accepts an explicit `classicScripts: true` option when
used with a compatible public SafeJS core. The default adapter is unchanged.

```ts
const runtime = extensionPageRuntime(core, { classicScripts: true });
const scripts = new PageScripts(page, runtime, options);
```

With a compatible scheduling-capable core, select
`callbackScheduling: "after-prefix"` alongside `classicScripts: true` to allow
new source after an event callback's synchronous prefix without conflating its
unfinished asynchronous result. This option is separately validated and
forwarded to the SDK; it is not an adapter-side queue or a completion stub.
The default does not request a scheduling mode.

This requires the classic-Script SDK capability, not merely the native loader's
`websiteScripts: "classic"` setting. It does not install, upgrade or substitute
an SDK, and does not enable this experimental mode automatically in the CLI.
The September 18 qualification uses a pinned, privately composed SDK source
candidate; it is not a claim about an installed or published release.

## Explicit process selection

The native process API accepts `runtimeAdapter: "extension"` together with
`runtimeOptions: { classicScripts: true, callbackScheduling: "after-prefix" }`.
Only these two serializable runtime options are accepted. The parent validates
and snapshots them before SDK import/process startup; the child validates them
again and echoes the selected configuration in its ready metadata.

The corresponding CLI environment options are:

```bash
AGENT_BROWSER_SAFEJS_ROOT=/path/to/compatible-compiled-sdk \
AGENT_BROWSER_PAGE_RUNTIME=extension \
AGENT_BROWSER_PAGE_GLOBALS=classic \
AGENT_BROWSER_CALLBACK_SCHEDULING=after-prefix \
AGENT_BROWSER_PAGE_SCRIPTS=classic \
node dist/src/cli.js serve
```

The first four settings select the explicit SDK and runtime semantics. The
separate `AGENT_BROWSER_PAGE_SCRIPTS=classic` enables automatic script loading;
neither new semantics option enables loading on its own. Invalid values, a
missing SDK root, legacy-adapter configuration and reader-profile conflicts are
rejected. These options do not install a compatible SDK or relax CSP/resource
limits. Native mocked-process/CLI tests are not a real process or Zoom gate.

A separate September 18 owned-process gate successfully imports a freshly
compiled public SafeJS core, reports these exact runtime options, executes the
capabilities command and emits three production heartbeats. It retains the
256MiB child heap and restricted filesystem/process permissions. Only anonymous
Unix-domain socketpairs for piped standard I/O were allowed by that isolated
gate; network connections remained denied. Production close terminates the child
with SIGKILL and leaves no pending commands. This proves startup and liveness,
not page execution, scheduler behavior or a meeting join.

## Native integration

- The guest's actual global object supplies `window`, `self`, `top` and `parent`
  in the native single-window context. Publisher exports and Webpack arrays stay
  guest-owned rather than being copied onto a read-only host capability.
- Native window properties forward to the existing bounded capabilities.
  Writable property names are explicitly checked. Other publisher properties
  remain ordinary guest global properties.
- A retained guest reference preserves the global receiver when native getters
  or callback receiver/argument slots return the native window. The SDK owns its
  lifetime; cleanup does not release already-revoked references.
- `document.defaultView` returns the bound browsing context, or null without one.
  Inert created documents remain detached and return null. Closed document reads
  remain revoked.
- The adapter requests classic Scripts explicitly, validates bootstrap execution,
  counts its bootstrap against the source limit and fails closed if initialization
  is skipped. It does not concatenate or rewrite publisher scripts.

## Qualification and outstanding work

The actual captured Zoom chunk registers through SafeJS and shares its registry
across the native aliases. Additional actual-SDK checks exercise cross-script
exports, document identity and idle timer receiver/argument identity. Native
fake-core tests cover ownership, property checks, cleanup and default behavior.

This is not complete browser-global compatibility. Existing injected lexical
bindings are not turned into a complete mutable Window environment; nested
containers returned by host methods are not recursively rewritten. Window
constructors, child browsing contexts and all web-platform descriptors are not
promised.

The captured React externals previously failed when assigning a host Window
property. They now initialize under the separate explicit 120-second application
profile, taking 118937ms in ASSETS26; the ordinary 16-second performance gate
still fails. The explicit `after-prefix` scheduling option passes the controlled
event callback followed immediately by new source in the composed SDK/native
fixture. The combined accounting/scheduling/regex candidate passes 1113 selected
SDK tests, not a full release qualification. Earlier scheduler and timeout
failures remain recorded. See SCRIPT-BUDGET-PROFILES.md for the opt-in profile;
publisher source and ordinary timeout defaults are unchanged.

Native tests, captured-source execution and live HTTP acquisition are separate
gates. No successful Zoom joining UI, meeting admission, incoming media decode,
recording, transcription or delivery is established by this work. Original CSP
enforcement and resource restrictions remain in force.
