# Zoom launch bundle and browser-client discovery

September 18, 2026. **The meeting has not been joined.** This checkpoint finds
the genuine browser-client route from captured Zoom source without executing
that source, accessing credentials/devices, or substituting Chromium. It does
not implement meeting admission, WebRTC, audio decoding or notetaking.

## One new native request

The previously captured September 17 launch shell has no anchors or script-src
attributes. Native HTML parsing and static TypeScript AST inspection establish
that its loader combines an initial CDN domain with a bundle pathname, removing
the trailing slash. Resolving that pathname against the meeting origin would
have been wrong. The actual initial target is:

`https://st1.zoom.us/fe-static/launch-meeting/meeting.b0aef1bba24832b2fa72.js`

One anonymous native GET at **06:13:43.906 UTC** returns **HTTP200**, MIME
`text/javascript`, and **1,196,388 complete body bytes**. The saved body hash is
`3ad762d1a84767e0e43f436087c4ce0caea6e4ae91fae2ef2ffe2bb17b14c983`.
No redirect, retry, fallback CDN, fingerprinting/chat asset, subresource, script
execution, authentication or identity change occurs. Public-address checks,
verified TLS, existing limits and request/resource cleanup remain intact.

**Capture succeeds; reader extraction fails.** The source has 1,162,732 code
units, above the reader's 1,000,000-unit non-HTML limit. The CLI exits 1 with
`resource-limit` at `loader`, zero Markdown bytes and `contentSuccess: false`.
The native reader also intentionally does not admit JavaScript MIME as a text
document, as demonstrated separately by the small synthetic fixture. Raising
one limit would therefore not make this a supported reader or executable client.
The original failure remains unchanged; no retry or limit increase is used.

## Finding the actual browser route

Offline analysis parses the saved bundle with the existing compiler, not a page
runtime: zero syntax errors and 297,947 visited AST nodes. The bundle references
`webClientUrl`, browser-join handlers and settings. Those references alone do not
establish their runtime paths or the capabilities of the separate meeting client.

The shell stores launch configuration in `window.launchBase64`, not in an HTML
link or a JSON string. Source inspection traces its variable-bound decoder: it
normalizes base64 alphabet characters, converts decoded bytes and passes them
to a protobuf decoder. Source-derived field mappings identify the route at
**root field4 (`urls`) → field3 (`webClientUrl`)**.

A bounded offline wire inspection of the captured **3,364-byte** configuration
selects those unique length-delimited fields. It does not evaluate the bundle or
inspect a password store. Parent review separately confirms the source decoder
conversion for this canonical-base64 payload. This is capture-specific analysis,
not a new general protobuf library or a production browser feature.

The resulting display URL is:

`https://quora.zoom.us/wc/join/7982110526?redacted`

The exact URL is retained only in a private artifact, identified by SHA-256 in
the JSON companion. Its two query parameters are not printed. A narrow
credential-name check finds no credential-named parameters; that is not a
general secret detector. **Do not navigate to the redacted display URL.** Future
navigation must resolve the pinned private constant inside the trusted host and
apply normal network and logging checks. The client route is **not fetched**
in this checkpoint, and no host setting or admission decision is established.

## Verification and preserved failures

- Reuse the immutable core02 runtime qualified by **817 native passes in nine
  files**, with build/types/format/lint passing. No suite, build or actual SafeJS
  check is rerun for this discovery. Its candidate base plus overlay is distinct
  from publication commit `d3083778ad9415645c58d0d93c796a8a7de10dc4`.
- Corrected synthetic bundle proof: HTTP200 `application/javascript`, 79 bytes
  captured, CLI exit1 `unsupported/loader`, no extraction, one mocked request,
  zero live IO and complete cleanup. This proves capture despite reader refusal.
- Preserve the first synthetic attempt: invalid explicit `--redirect-mode error`
  exits64 before a request. The corrected lane omits that flag and verifies the
  six-element CLI tail and effective no-follow policy. No production parser or
  evidence expectation is weakened.
- Preserve an initial copied-runner path error before child creation and a later
  static-inspection assertion that guessed a function declaration instead of
  the actual variable-bound function. Both are harness errors, not native Zoom
  failures; corrected runs use separate paths.
- All completed offline inspection children/groups close, with kernel/JavaScript
  network guards, zero IO attempts and empty private HOME/TMP directories. No
  source evaluation, SDK, real socket probe, device or credential test occurs.

## What still prevents the requested workflow

The current technical blockers remain real client execution and reception of
decoded meeting audio—not lack of user permission for an anonymous page read.
The earlier actual SafeJS gate still fails when later source is evaluated while
a callback's asynchronous tail remains pending. This discovery does not alter
that public scheduling contract or count a static parse as runtime acceptance.

The separate meeting client must be inspected and executed through supported
native/SafeJS APIs, followed by genuine WebRTC/media reception and decoding,
legitimate host admission, permitted sustained recording, transcription, summary
and verified delivery. Existing WebSocket and PCM primitives do not provide those
outcomes by themselves. The browser-client URL is a concrete next entry point,
not a completed integration. No push or default-runtime change occurs here.
