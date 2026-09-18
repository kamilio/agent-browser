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
property. They now reach an SDK accounting/performance blocker and still exceed
the native time limit. The explicit `after-prefix` scheduling option passes the
controlled-event callback followed immediately by new source in the composed
SDK/native fixture. Broader scheduler qualification still has separately tracked
failures; this focused pass is not complete SDK qualification. No production
timeout increase or publisher-source rewrite hides the remaining blockers.

Native tests, captured-source execution and live HTTP acquisition are separate
gates. No successful Zoom joining UI, meeting admission, incoming media decode,
recording, transcription or delivery is established by this work. Original CSP
enforcement and resource restrictions remain in force.
