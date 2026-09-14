# Native W3C CSS Text research — September 14, 2026

## Website result

One anonymous native-browser GET of `https://www.w3.org/TR/css-text-3/` returns
HTTP 200 at **10:23:36 UTC**, using committed runtime `be3aaf6`. The semantic
reader processes 540,326 decoded bytes and discovers the heading outline.
One offline native extraction selects section 7.2, discovered as heading
`e6838`, using its actual native selector. No second GET, redirects, subresources,
scripts, credentials, alternate browser or raw-HTML substitute is used.

This is fresh live **reader** coverage, not CSS layout, raster or click acceptance.
The native receipts retain `extracted-unverified`, `partial: true` and
`contentSuccess: null`; source extraction is not independent factual verification.

## Source findings used in implementation

The native-extracted section distinguishes computed and CSSOM-resolved values:
`normal` computes to zero, while zero is exposed as `normal` by
`getComputedStyle()`. Source paragraph `e6988` and the property table support
this distinction. It revealed a zero-value mismatch in the first letter-spacing
candidate, prompting dedicated regression tests and a correction before adoption.

Paragraph `e7007` specifies half-spacing on each side of typographic units,
without outside-line spacing. Example `e7061` describes the average of different
adjacent inline spacing values. Paragraph `e7116` treats a consecutive run of
atomic inlines as one unit. The current candidate implements ordinary text
spacing but explicitly rejects affected atomic boundaries instead of claiming
that missing behavior is supported. These are paraphrases, not direct quotations.

Refs identify the closed captured document, not a current live page. Discovered
source fragments are `#letter-spacing-property` and `#propdef-letter-spacing`;
neither caused an additional request. The returned resource's Last-Modified
header is August 14, 2026; no latest-editor-draft claim is made.

## Preserved harness failure

Live supervision exits 0. The offline helper emits its section receipt and
closes the document, then its harness incorrectly asserts a nonexistent
`extraction.truncated` field. The original offline exit 1 and failed assertion
remain preserved. Independent artifact verification validates the emitted
receipt and closure without another browser invocation; it does not turn the
failed harness into an entirely passing run. No retry occurs.

Live interval: `10:23:36.152`–`10:23:36.501` UTC. Offline interval:
`10:24:59.202`–`10:24:59.535` UTC. Both process groups are subsequently absent;
documents close from 11,943 nodes to zero, and the live transport closes with
zero active requests. Source/compiled inventories remain stable. The existing
22,991-pass native gate is rehashed, not rerun for this research observation.

Original lane: `/dev/shm/agent-browser-css-text-spec-september14/`.
Durable copy: `node_modules/.cache/native-validation/css-text-spec-september14/`.
The lane's `REPORT.md`, `VERIFICATION.json`, `EVIDENCE.sha256` and `SEAL.json`
retain exact scope, original paths, failures, invocations and integrity evidence.

| Artifact | SHA256 |
| --- | --- |
| Captured response body | `17c26f1b41455947f106dac81736944b12da328ee4892c7c5b601f5b65ced55a` |
| Live native receipt | `7b03a4a740b31fa284313a3646d531c58ddd2eeb17de82b45105f54a19dfdadd` |
| Native section receipt | `5a080b438f5805ba6c1fd7d80bfb0bdf1dacb2e061908354c0fc7095aab38145` |

The original hardware, benchmark, Astra/X and Poe/Reddit research is still
incomplete; this standards check is not a substitute for those topics. Broader
live interactions and independent credential/passkey/device, SafeJS, socket/TTY
and challenge gates remain open. Overall browser goal active; no push.
