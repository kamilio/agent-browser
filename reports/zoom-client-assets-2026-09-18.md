# Native Zoom client assets: source capture, not execution

September 18, 2026. This checkpoint follows the client-shell capture and
experimental scheduler proposal. **No meeting is joined, and no audio,
recording, transcript or summary delivery is demonstrated.**

## Two actual native reads

The captured inline loader supplies the paths and the initial CDN base. These
requests select that configured candidate; they do not establish which CDN a
running Zoom client would choose. No guessed document-origin asset, backup
CDN, redirect follow or retry is used.

| Initial-CDN asset | HTTP / received at UTC | Complete captured bytes | Reader result |
| --- | --- | --- | --- |
| `st1.zoom.us/web_client_pwa/7.1.0.3117/js/externals.0.min.js` | 200 / 08:00:56.280 | 337,218 | `unsupported/loader`, exit 1, zero Markdown |
| `st1.zoom.us/web_client_pwa/7.1.0.3117/js/pwa-webim.js` | 200 / 08:03:26.926 | 75,102 | `unsupported/loader`, exit 1, zero Markdown |

Both responses have `application/javascript` MIME. Source capture succeeds;
the reader intentionally does not turn executable assets into article content.
These are **not successful page loads, executed scripts or functional Zoom UI**.
The total complete captured source is 412,320 bytes, not rendered content.

Each separately scoped lane first proves a 66-byte synthetic JavaScript capture
with the same unsupported reader result, one mocked request and zero live IO.
Live lanes then make one anonymous GET each, with ordinary identity, verified
TLS, public-address checks, existing byte/heap/output/time limits and complete
request/session/process closure. No SDK, subresource execution, credentials,
device or meeting action occurs. Native read timings are observations, not a
controlled performance benchmark. The qualified native runtime is reused;
no new full native suite or actual SDK gate is claimed.

## Structural client findings

The first asset contains seven sequential wrappers for React, ReactDOM, state
management, routing, and custom modal/toast globals. Its captured React version
literal is 18.3.1; this is not a latest-release claim. The browser-global branch
has eager embedded stylesheet setup and creation of a detached modal root.
Actual modal/toast rendering and most interaction APIs remain deferred. The
React scheduler has alternatives to MessageChannel, so its mention alone does
not establish a mandatory missing API. No further executable download target
was identified inside this first asset; diagnostic links are not asset loaders.

The webim body parses with zero syntax diagnostics and 26,729 AST nodes. Its
single top-level expression pushes Webpack chunk 962 with one module definition,
19776, to `this.webpackChunkzoom`. The payload has no explicit third startup
argument. A separately installed runtime may replace the push handler, so this
is source structure rather than proof about actual module execution.

Source review of the current extension adapter with the frozen SDK candidate
identifies two separate configuration gaps: the adapter supplies no top-level
`this` receiver, and its capability-backed `window` has neither a writable chunk
registry nor a dynamic named-property setter. Supplying just that window as the
receiver would therefore leave the registry assignment unsupported. These are
source predictions, not errors observed by executing the asset. The capture
does not select or execute this adapter; the browser otherwise defaults to its
legacy runtime. The candidate is not asserted equivalent to a released SDK.

Public SDK binding injection and dynamic named properties do exist, so this is
not an absolute missing-API claim. An ordinary host dictionary is not a sufficient
fix: copies crossing the host boundary would lose the identity of a guest array
subsequently mutated by `.push`. A proper integration must retain page DOM
capabilities and shared receiver/window/self/globalThis identity across scripts.
The reviewed host APIs do not expose the interpreter's internal Script mode;
injecting a receiver alone does not prove global `var` and lexical semantics.
The scheduling proposal does not address these independent gaps. The companion
JSON pins the separate first-asset and classic-global reviews and their sources.

The initial webim inventory's `globalAssignments` field is not exhaustive; its
second version additionally includes `this.*` instance members. Neither list is
used as a global-export count. The top-level chunk structure is derived
separately. Earlier inspection output is retained, not rewritten.

Static limit preflight identifies another distinction between capture and
execution: the first asset has 337,218 code units, exceeding the native page
runtime's default 262,144-unit per-source limit. The existing options permit
bounded overrides; this is not an immutable engine ceiling. No default is raised
and no source is evaluated here. A future execution profile must explicitly
budget the real sources, not assume that successful transport capture admits
them to the runtime or satisfies its other step/data/time limits.

## Still required

- Qualify the reviewed scheduling proposal through the separately requested
  isolated SDK tests; it remains unactivated.
- Establish classic-script/global behavior and actual client/resource execution
  using supported native/SafeJS APIs, without source rewriting or another engine.
  First qualify an unchanged cold-chunk expression and cross-script registry,
  array and factory identity with real page capabilities intact; keep this
  distinct from factory execution and complete classic-Script support.
- Verify native realtime media reception/decode and legitimate host admission,
  then permitted recording, transcription and summary delivery.

The remaining loader-linked scripts are not fetched in this checkpoint. No
CAPTCHA bypass, fingerprinting script execution, latest-release assertion or
broader browser/research completion claim is made. The overall goal stays open.
