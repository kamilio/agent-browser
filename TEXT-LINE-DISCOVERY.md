# Native text-line discovery

`LITERAL-TEXT-FORMATS.md` additionally admits Markdown and CSV source to this
same literal discovery path. The initial Markdown-refusal scope below is historical.

September 14 extension: `LITERAL-FEEDS.md` adds four explicitly admitted XML/feed
MIME types to the same literal-text loader and line discovery. The initial MIME
scope and historical measurements below retain their original context.

The research CLI adds `--find QUERY` to locate useful lines before a separately
chosen `--lines START:END` extraction. This complements `--headings` for large
plain-text and JSON responses whose native document has no HTML headings,
including Markdown source served as `text/plain`. Existing MIME admission remains
`text/plain`, `application/json` and supported `application/*+json`; this feature
does not add `text/markdown` support.
It searches the registered native text node, not a decoded body-capture fallback.

The query is a nonempty, case-sensitive literal of at most 256 UTF-16 code units,
without CR or LF. Regex syntax has no special meaning. Option-like literals are
allowed as the consumed value, for example `--find --parallel`. No normalization,
case folding, multi-line matching or automatic source request is performed.

`--find` is mutually exclusive with `--selector`, `--lines`, `--section` and
`--headings`; `--reader` and `--capture-body` remain independently available.
The existing URL policy and network/extraction bounds are unchanged.

## Result and follow-up

The report's `selection.method` is `text-line-discovery`; its `textLines` field
contains document/revision identity, `partial: true`, ordered `{line, column}`
entries, `totalLines`, `matchedLines`, `sourceCodeUnits` and `truncated`.
Line and column numbers are one-based. Columns count raw UTF-16 code units, not
graphemes or screen cells. LF, lone CR and CRLF are supported; CRLF is one boundary,
and an empty source or a trailing newline retains its empty final line.

There is one entry per matching line, at that line's first occurrence. By default
the first 50 matching lines are returned, while bounded scanning still counts all
matching lines. `truncated` is true only when another matching line exists beyond
the entry cap; filling the cap exactly is not itself truncation. This is not an
occurrence count. Search output includes no query echo, source text or previews.
An explicitly requested body capture retains its existing, separate semantics.

Choose a bounded range around a returned line and issue a separate `--lines`
request if its content is needed. The CLI does not make that request automatically.
A later response may differ from the searched one: compare receipt/body identity
and revalidate the selected text rather than treating coordinates as a stable
cross-response anchor. No source examples should be executed merely because they
appear in a result.

## Admission and bounds

`discoverDocumentTextLines` is an internal extraction API above the pure
`discoverTextLines` helper. It shares the existing line-extraction admission check:
only an unchanged loader-registered text node in the native document/pre structure
is accepted. Ordinary HTML containing a lookalike `pre`, unregistered trees and
mutated text documents are refused. This is not a general HTML visible-text search.

The source cap is 2,000,000 code units. The helper permits an explicit `maxEntries`
from 1–200 and uses a bounded query-prefix table and one source scan, without a
per-line whole-source search, a split-string array, regex execution or allocation
per omitted match. The wrapper permits `maxBytes` from 256–1,048,576, default
262,144, and checks the serialized complete result. The CLI retains its existing
256,000-byte extraction budget. No resource bound is raised by this feature.

Detected challenge/login barriers are handled before search. Non-2xx responses
cannot become content success because they contain matching lines. Matching 2xx
responses remain `extracted-unverified` with null `contentSuccess`; zero matches
produce `empty-extraction` and false content success. Counts are observations of
the admitted document, not proof of factual correctness, complete web content,
authenticator support or a bypass of a site's access controls.

## Validation status

On clean base `98c4572`, all **326 new cases pass**: 39 helper, 98 document-wrapper
and 189 research-CLI cases. The exact twelve-file native matrix has **1045 passes
and three failures**, not a blanket pass. Those same three unchanged selector
expectation failures reproduce on an untouched committed dependency baseline;
115 other baseline cases were unselected. No unrelated test was repaired.

Initial validation found an incomplete nested cookie-context expectation, then
two new fixtures that incorrectly expected untyped loader exceptions to retain
the extraction layer's `internal-error` category. The existing session loader
boundary maps those to `unsupported`. Only the new test fixtures/import ordering
were corrected; production cookie and error policy did not change. Initial and
intermediate failed results and snapshots remain retained, not relabeled as green.

The focused dependency-closure build, strict new-test typing and six-file Biome
pass. Runtime and compiled artifacts are identical between the built final slice
and the verified slice containing the last test-only correction. This is not a
whole-package build or a full native-manifest run. Independent source and final
wrapper-test reviews found no actionable issue within their stated static scope.
Evidence is under `node_modules/.cache/native-validation/text-line-discovery/`.

## Separate native live workflow

Two individually authorized native requests to the fixed Node `v22.22.0` fs
document demonstrate the workflow without executing source examples:

- **September 6, 2026 00:46:51.223 UTC:** `--find filehandle.read` returns nine
  matching lines out of 8,521, untruncated, over 269,887 source code units.
- **00:47:39.369 UTC:** a separately chosen `--lines 380:478` request retrieves
  3,771 source code units / 3,779 rendered UTF-8 bytes. The bounds came from
  the returned locations, not raw-body searching or another browser.

Each recorded one HTTP-200 request, zero redirects/retries, closed transport,
`partial: true` and `contentSuccess: null`. Both 269,901-byte response bodies have
SHA256 `2116e13854c19f91b41c07dc81b94093992fe0b33c42f56c00a0794e28fcc0db`.
Independent receipt hashes are
`4ea1296b875a145f36e09cde59225e0c26a0f79293313676d6765b4ba4304f2e` and
`74c1c5568c84c128e53aa9e4c63646ce979b913f68ffeb0311dd3b4b0f2be647`.
Selected native Markdown hashes to
`7ecd1a3783ef238c62e05b8dda0e2da6a43f9f7aa260853041f71979a190c978`.

This validates a bounded native find-then-lines interaction on those responses,
not latest documentation, general website compatibility or real Node/device I/O.
Historical heading/line receipts retain their paths and measurements. Actual
credentials, SafeJS, socket/TTY acceptance, physical devices and stopped/denied
lanes remain separate; neither native tests nor these public reads clear them.
