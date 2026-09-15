# Explicit reader fallback encoding

The research reader accepts `--reader-fallback-encoding utf-8` with `--reader`.
Use it when the source is known to be UTF-8 but has no stronger supported
encoding declaration. It is a fallback, not an encoding override or detector.

```sh
node dist/scripts/research-browser.js --reader --capture-body \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-fallback-encoding utf-8 https://www.webmd.com/
```

## Contract

- Only the exact value `utf-8` is accepted. Omitting the option preserves the
  windows-1252 HTML fallback. The option requires reader mode, including in
  programmatic execution options (`readerFallbackEncoding`).
- BOM and HTTP charset precedence and errors are unchanged. A supported HTML
  meta declaration in the first 1,024 bytes takes precedence over the fallback.
  Later declarations do not trigger a reparse. This does not implement a full
  browser encoding-restart algorithm.
- The shared prescan now continues past unsupported meta labels and maps
  `x-user-defined` to windows-1252, matching the ordinary native loader. These
  are intentional corrections even without the new option.
- Non-HTML decoding is unchanged. Requesting fallback still records the option;
  its presence does not prove that it determined the actual encoding. Explicit
  MIME-repair rules remain separate and do not turn this into force-decoding.
- No response, source, work, output or deadline cap changes. The visibility
  barrier check uses the same fallback as extraction. No scripts are enabled.

`loadResearchDocument` accepts `fallbackEncoding` as its seventh argument, after
the existing MIME policy. The option type and validator are in
`src/research-reader-info.ts`. Existing calls without the argument keep their
previous positional shape.

## Capture and replay

A requested fallback is recorded as top-level `readerFallbackEncoding` and
`reader.fallbackEncoding`; `reader.encoding` records the actual result. Captures
retain original decoded-response bytes and their hashes, not re-encoded text.

The offline replay CLI inherits the paired declarations from the pinned receipt.
Neither declaration present means legacy behavior. Missing counterparts,
unsupported values, mismatches and explicit undefined/null declarations are
rejected. The reparsed actual encoding must agree with the recorded encoding.
Receipt/body pins, source-admission gates and failure restrictions remain in
force. Do not edit a historical receipt to add an option retroactively.

## Validated scope

`reports/reader-utf8-fallback-2026-09-15.md` records 191 passing new native tests,
three saved-body comparisons, three fresh native navigations and three exact
offline replay comparisons. Two unrelated native failures also reproduce on the
baseline; this is not a green full-manifest run. WebMD's saved homepage restores
the source em dash without changing default output; HTTP-declared UTF-8 controls
retain their content hashes. Native source retrieval remains partial and
unverified, not proof of factual accuracy, interactive functionality or SDK
acceptance.
