# JavaScript runtime boundary: Poe SafeJS

Decision: September 1, 2026. The user requires no new dependencies and explicitly
allows Poe Code SafeJS. We reuse its already-installed public SDK; the browser's
DOM, parsing, navigation, networking, controls, styling and clients remain our
TypeScript implementation. Neither parse5 nor QuickJS was installed, imported or
vendored. The unfinished original script-parser draft was removed rather than
maintaining a competing interpreter without evidence that it was needed.

**Latest extension:** `PAGE-PROCESS.md` documents persistent page-owned realms and
an explicit owned-session process API, using the separately compiled extended
public core. `PROCESS-CLI.md` adds opt-in routing through the actual CLI and paired
playground API. `SCRIPT-LOADING.md` adds explicit partial automatic classic scripts,
with passing HTTP fixtures but unresolved public dynamic-site compatibility.
`DOCUMENT-WRITE.md` adds a scoped parser-input capability without relaxing SafeJS's
reentry boundary; nested inline written scripts still require upstream support.
`PAGE-TIMERS.md` adds bounded timers through public identity-preserving guest
argument handles (`SAFEJS-GUEST-REFERENCES.md`), filed upstream as #542.
Automatic scripts remain off by default. The adapter described below is the
earlier single-evaluation interface, retained rather than silently replaced.

**Original adapter scope:** a tested experimental single-evaluation runtime adapter, not
website JavaScript support. The CLI and playground still report website scripts
disabled. SafeJS is a JavaScript-subset interpreter, not complete ECMAScript or a
browser engine. Public dynamic-site acceptance, broader DOM/event compatibility,
script scheduling and lifecycle are still required.

## Existing runtime selection

`SafeJsRuntime` is exported from the package's main SDK and accepts the public
SafeJS SDK as an explicit constructor argument. `createSafeJsRuntime` and
`loadSafeJsSdk` are available through `@automations/browser-agent/node-safe-js`.

```typescript
import { createSafeJsRuntime } from "@automations/browser-agent/node-safe-js";

const { runtime, version } = await createSafeJsRuntime({
  packageRoot: process.env.AGENT_BROWSER_SAFEJS_ROOT,
});
try {
  const result = await runtime.evaluate("return [1, 2, 3].map(value => value * 2);");
  console.log(version, result);
} finally {
  runtime.close();
}
```

Without `packageRoot`, Node resolves the public `poe-code/safe-js` import normally.
With an explicitly selected installed package root, the loader verifies its
bounded manifest identifies `poe-code`, then uses exactly the `./safe-js` public
Node import declared there. It does not guess private implementation paths or
fall back to another evaluator. Unsupported/missing SDKs fail explicitly.

The current workspace has Poe Code 4.0.48, which does not expose SafeJS. The
already-installed global Poe Code 13.0.10 does expose it and passed this probe.
Neither installation was changed. `AGENT_BROWSER_SAFEJS_ROOT` is read by the
probe script; the normal browser CLI does not enable scripts just because this
variable exists. Library callers explicitly pass the root themselves.

After building, an operator can select an already-installed compatible global
package and run the opt-in probe without installing anything:

```bash
AGENT_BROWSER_SAFEJS_ROOT="$(npm root -g)/poe-code" \
  timeout 30s node --max-old-space-size=192 \
  packages/browser-agent/dist/scripts/check-safejs.js
```

The published SafeJS SDK currently targets Node, not the browser/Worker import
condition. Cloudflare remains optional and unverified. Reusing this allowed
interpreter does not authorize adding unrelated packages or downloading updates.

## Capability and lifecycle contract

- Each evaluation starts a fresh SafeJS run. Globals are not retained across
  evaluations, even on the same adapter object. No replay snapshot is passed.
  This is not yet a persistent page realm or the implementation of browser eval.
- The module registry is always empty. No filesystem, process, shell, environment,
  network, agent, MCP or browser capability is granted automatically.
- `evaluate(source, { bindings })` grants **trusted host-selected capabilities**.
  Host callbacks must validate their arguments and restrict side effects. Never
  pass arbitrary filesystem/network/exec wrappers. The current browser loader
  does not pass website-controlled bindings into this API.
- Console messages are discarded; only their count is reported. Script errors
  expose bounded codes, not source, stack traces, host messages or arbitrary guest
  objects. Genuine SDK budget exceptions are identified by class identity rather
  than trusting a guest object's `code` property.
- Results are copied through the public SDK boundary, then limited to bounded
  acyclic JSON-like data. Accessors, exotic objects, functions, non-finite numbers,
  cycles and oversized/deep structures fail explicitly. Prototype-shaped data
  keys do not mutate the host prototype.
- Overlapping runs on one adapter are rejected. Caller cancellation, the timeout
  timer and `close()` abort an active run. Ending an evaluation aborts its signal
  as well, revoking later host effects from retained guest callbacks. The installed
  SDK probe verifies that revocation, not only a mock implementation.
- There is no host eval, `new Function`, Node VM, Chromium/Firefox or remote browser
  fallback in this adapter. A missing runtime remains an explicit error.

Default limits, configurable only by the trusted host within bounded maxima:

| Limit | Default |
| --- | ---: |
| Source UTF-16 code units | 262,144 |
| Interpreter steps per evaluation | 100,000 |
| Interpreter call depth | 64 |
| Individual string length | 262,144 |
| Array length | 16,384 |
| SafeJS retained-data accounting units | 1,048,576 |
| Evaluation timeout | 1,000 ms |
| Runs per adapter instance | 128 |
| JSON result bytes | 65,536 |
| Result structure nodes / nesting | 16,384 / 64 |

These are interpreter/adapter limits, **not a whole-process heap limit or complete
security proof**. The adapter's timer and SDK deadlines are cooperative; a trusted
host callback can still block its thread. The opt-in probe has an external 30-second
watchdog and Node heap setting. For the separate owned-child execution layer,
see the following checkpoint; complete OS containment is not claimed. Page
execution stays disabled until its isolation/lifecycle boundary is ready.

The subsequent `SafeJsProcess` layer now provides an owned Node child with a parent
watchdog and tested cleanup (`SCRIPT-PROCESS.md`). It adds an optional execution
boundary, not an OS sandbox or a persistent page realm. This in-process adapter's
own cooperative-limit caveats remain unchanged.

## Evidence

- `reports/safejs-sdk-2026-09-01.json`: all 22 installed-public-SDK checks pass at
  approximately 20:21 UTC on Poe Code 13.0.10 / Node 22.22.0. Arithmetic, closures,
  mutable state, loops, arrays/callbacks/JSON and promises execute. Ambient host
  globals, dynamic code construction/import and unregistered modules are denied.
  Exact steps/call-depth/string-length budget categories are asserted; guest
  catch/finally cannot suppress step exhaustion. Explicit capability isolation,
  pending-await cancellation and post-evaluation host-effect revocation pass.
- The 96.4 MB RSS value is one whole-process sample including the installed SDK
  and probe, not peak usage or a completed browser benchmark. SafeJS data units
  must not be relabeled as process bytes.
- `reports/unit-node-2026-09-01-safejs.json`: all 840 tests in 43 files pass,
  including 20 adapter/loader unit cases. Mock SDK fixtures test our wrapper's
  lifecycle, output validation, limits and public-export selection; the separate
  installed SDK report supplies actual interpreter evidence.
- `reports/safejs-sdk-initial-2026-09-01.json` retains the initial adapter loading
  failure. It used CommonJS resolution for an import-only public export. The fix
  uses Node dynamic import or the selected package's declared public import.
  This was our adapter bug, not a SafeJS defect or a reason to install anything.

No public page's JavaScript is claimed to work from these tests. Existing static
HTML/CSS/form website evidence remains separate in `reports/README.md`.

## Next integration gates

1. Define a disposable page-realm lifecycle and externally enforceable watchdog,
   with bounded jobs and cancellation during navigation/tab closure.
2. Implement identity-preserving browser DOM wrappers, property reads/writes,
   native events and narrowly scoped network/storage capabilities. Do not replace
   real DOM behavior with page-specific string rewrites or handcrafted site data.
3. Load actual inline/external/module scripts in the correct document lifecycle,
   and explicitly report SafeJS language/browser-API gaps.
4. Prove a real JavaScript-dependent website and malicious local fixtures through
   the same engine, before changing `websiteJavaScript` capability claims.
5. Extend the needed browser/runtime functionality without adding other packages.
   Keep full Kitesurf/Playwright parity in the acceptance ledger, not just syntax.

## Primary reference

https://github.com/poe-platform/poe-code/tree/main/packages/safe-js

The installed public SDK and its own declared exports were inspected directly;
no SafeJS implementation files were copied into this package.
