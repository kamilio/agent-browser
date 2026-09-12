# Native offline source: noscript serialization

Separate authorized offline extraction on September 12, 2026. **Zero new HTTP
requests; one additional native section.** The original `NOSCRIPT-SOURCE.md` and
`native-noscript-source-september12` lane remain unchanged. Their historical
three-GET/five-section accounting is not rewritten to include this task.

## Exact condition and escaping

Section **13.3 Serializing HTML fragments**, source anchor
`parsing.html#serialising-html-fragments` (the heading and anchor use different
spellings), contains the relevant Text-node branch.

If the Text node's parent is `noscript`, its data is serialized literally when
**“scripting is enabled for the node”**. Otherwise its data is escaped. The other
literal-text parents listed in the same branch are `style`, `script`, `xmp`,
`iframe`, `noembed`, `noframes`, and `plaintext`; those do not have this additional
`noscript` scripting condition.

The escaping algorithm in the same section replaces, in order:

- `&` with `&amp;`.
- U+00A0 NO-BREAK SPACE with `&nbsp;`.
- `<` with `&lt;`.
- `>` with `&gt;`.
- Double quotation marks with `&quot;` only in attribute mode, not this Text-node
  branch.

Consequently, disabled-scripting `noscript` text needs normal HTML text escaping;
enabled-scripting `noscript` text takes the literal-data branch. The selection
does not prescribe a repository helper's default value for missing owner state.

## Which node and document?

The algorithm defines `node` as its input Element, Document, or DocumentFragment,
and serializes that node's children. Its `current node` variable is the child
being processed. For an element child, serialization recurses with that child as
the new input. Thus while serializing the direct Text children of `noscript`,
the invocation's input node is the `noscript` element. This is a node-relative
scripting condition, not a property of an unrelated caller or a global default.

**Owner-document interpretation:** the relevant owner is the serialized
`noscript` node's own node document, not a different destination document or an
arbitrary serializer fallback. This applies the node-relative scripting concept
linked by the selected section. The section itself does **not** reproduce that
concept's definition; the native extraction points to
`webappapis.html#concept-n-script`. That separate definition was not captured or
followed under this task's one-section authorization. Therefore the direct
captured wording is the node-relative condition; the owner-document statement
is an interpretation, not an independently captured definition or proof of all
detached-document/default-state cases.

This source does not validate text-locator behavior or the parent's proposed
serializer implementation. No production edits or tests are performed here.

## Native section provenance

Source document: `https://html.spec.whatwg.org/multipage/parsing.html`.
Original response received: **2026-09-12T02:34:10.032Z**, during the prior task.
This task's offline child ran **2026-09-12T02:45:06.610Z** through
**2026-09-12T02:45:07.090Z**. No new capture date is assigned to the response.

- Native discovered heading: `e27365`, level 3,
  `13.3 Serializing HTML fragments`.
- Native selector:
  `html:root:nth-child(1) > body:nth-child(2) > h3:nth-child(512)`.
- Returned section: heading `e27365`, exclusive end `e28622`; 1,257 selected
  nodes, 3 context nodes, 28,620 scanned nodes.
- Text-condition paragraph: native ref `e27968`; scripting-definition link:
  native ref `e28008`; escaping steps: native list ref `e28574`.

New private `0700` lane:
`node_modules/.cache/native-validation/native-noscript-serialization-source-september12/`.
Filenames below are relative to that lane:

- `archives/parsing-capture-live.jsonl`: exact original receipt copy;
  SHA256 `02faaa87636bff80eb24a33aaf3159312bb056f2ee6411509d38cd63d2fbc334`.
- `archives/parsing-capture-response.body`: 787,795 original transport-decoded
  bytes; SHA256 `311d356f10fcb9fbeedfa90964845568575f1802e2d7f34eba1f8fbc95c86e99`.
- `archives/parsing-capture-response.headers.json`: complete original normalized
  header map; SHA256 `b685a51f997239656a09543630937e789dba83768f5794a9aa4a600d69512962`.
- `serialization-section-1.jsonl`: one bounded native extraction, 80,358 bytes;
  SHA256 `6dfe9191f90c745c63480c7235b294a4a5575e79e12c9c4e04946ad005a6d07e`.
- `EXCERPT.json`: selected native output subtrees, with original refs and source
  hashes; this is a saved subset of the one extraction, not another native call.
- `ARCHIVES.json`, `PREFLIGHT.json`, `INTEGRITY.json`, and `CHECKS.json` preserve
  byte-copy, runtime, provenance, execution, cross-file, and report-hash checks.

## Verification and limits

The reused audited release is `43202e3a0bb22bd072a2a2d2356a68b2e74cd3e1` at
`native-optional-image-september12-round01/snapshot01/dist`, with pinned Node
`v22.22.0`. Its 20 gate receipts, 1,091 source files, 1,928 compiled files,
historical 11,504 passing native tests with 2 exclusions, and commit-owned inputs
were reverified without rebuild or gate rerun. Original receipt, response, body,
headers, source heading, old report, and both old seals were checked before use
and after extraction. Archive copies use Buffers with immediate equality,
length, and SHA256 validation.

The offline child had kernel seccomp socket denial and JavaScript network/process
guards. It made one section call, zero navigations, zero network requests, and
zero denied attempts. No scripts, real SafeJS, provider/device/TTY probes,
credentials, raw-HTML searches, alternate clients, retries, or online fallback.
The original receipt's historical network metrics remain historical; copying
them does not represent a new request.

Bounds: 30-second child wall plus 5-second termination grace; 6MiB file/output;
12MiB lane; at least 64MiB free; private empty `0700` HOME/TMP and explicit
environment allowlist. Native admission and replay capacities are unchanged.
All parsed document nodes were closed. New `EVIDENCE.sha256` and
`FINAL-RECEIPTS.sha256` are independently verified; the latter also binds the
former. No modifications or additions were made inside the old sealed lane.

The extraction succeeded without a barrier or truncation, but native semantic
reader output remains partial and unverified for rendering/runtime semantics.
Original body bytes are decoded response bytes, not compressed socket frames;
headers are the native normalized map, not raw HTTP serialization. The uncaptured
node-scripting definition is the explicit source-coverage limit described above.
