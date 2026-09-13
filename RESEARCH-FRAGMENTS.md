# Research navigation with URL fragments

The research CLI accepts public HTTP(S) URLs containing fragments, reusing the
native session's existing document-target behavior. The previous blanket CLI
rejection blocked discovered links before any request, including NVIDIA's actual
comparison link ending in `#50-series`.

Both authored input and its normalized URL remain bounded to 4096 code units.
Credential-bearing URLs, private-address policy restrictions, non-HTTP schemes,
request/redirect budgets, read-only requests, pacing and rate-limit stopping are
not relaxed. The existing native transport sends pathname/query as the HTTP
request target, not the fragment; its redirect fragment handling is unchanged.

## Navigation versus extraction

The semantic reader retains inert `id` attributes on emitted elements and
`name` on anchors. Previously it discarded those identifiers, so the native
session could not find a reader document's target even after URL admission.
Retained attributes are escaped and charged to existing output limits. Omitted
script, style, control, template and foreign-content subtrees remain omitted;
retaining an ID does not bring them back. This is not a full-fidelity DOM.

The later point-anchor follow-up also retains passive `dfn` elements and emits
empty ID anchors for other non-omitted unwrapped tags. Their content is not
wrapped by those anchors; selecting one alone does not extract its original
descendants. See READER-POINT-ANCHORS.md for the precise projection and new tests.

The session's selected target supplies `:target` and the new report metadata.
There is no second DOM scan or separate fragment matcher. Existing raw/decoded
ID matching, named-anchor fallback and first-match behavior remain native-core
semantics, not a claim of complete standards conformance.

Default extraction still reads the document. A fragment does not mean that all
content outside its target disappears. For deliberate narrowing, use existing
`--selector :target`, or `--section :target` when the target is a heading.
Headings/find/line discovery continue to use their explicitly requested scope.
No automatic retry or guessed alternate anchor is performed when a target is
missing. Reader target resolution does not prove scrolling, script-driven tab
activation, hash-router execution or styled visibility.

## Redacted provenance

Reports involving a requested or effective fragment add `fragment` metadata:

- `schemaVersion: 1` and `semantics: native-dom-target-no-scroll-or-script`.
- `requested`: a serialized-fragment identity, or null if none was requested.
- `effective`: the response/document identity, null if removed, omitted until
  an effective URL is known. Requested and redirect-result identities can differ.
- Each identity contains a code-unit count and SHA-256 of the UTF-8 serialized
  fragment, excluding its leading `#`; the encoding label is explicit.
- `resolution`: pending, absent, element, unmatched, document-top or
  unsupported-directive. A matched element has only its opaque native reference
  in `target`, not its raw ID/name.

An empty `#` differs from no fragment. A missing target is not a challenge or
an HTTP failure. Text directives remain explicitly unsupported rather than
being reported as matched text. Failures before document classification keep
pending provenance; challenge and 429 handling do not become successful target
extraction.

Raw fragment strings remain absent from these metadata fields and from redacted
requested/final URLs. Digests support comparison, not encryption or secure secret
storage. Captured page bodies can independently contain source identifiers; this
feature is not a general secret scrubber. Metadata URL validation is bounded to
the existing 16384-unit network-URL ceiling for effective response URLs.

Evidence serialization/replay checks the new field shape and bounds. The long
output-limit projection retains fragment provenance even when it omits body or
heading payloads. Fragmentless flows have no new optional field. Existing
fragmentless source-identity admission remains separate and unchanged.
Target references belong to the original projected document; retaining them in
replay metadata does not make them valid in a newly parsed raw-source document.
The digest cannot recreate an undisclosed fragment. A later replay must use its
own explicit selection rather than treating an old reference as a live node.

## Validation status

The first isolated run exposed the reader's missing-identifier behavior, plus
four legacy HTTP429 expectations unrelated to this change. An isolated run of
the unchanged audited source reproduces exactly those four failures. They remain
unmodified and are explicitly excluded only from the extended focused checks.
Neither legacy suite belonged to the prior broad native selection; that gate's
two exclusions remain distinct. Do not interpret a selected pass as all manifest
entries passing.

The final isolated focused run passes **2614 tests with zero failures**, with
the four independently reproduced legacy cases explicitly excluded. It includes
238 new cases: 78 metadata/helper, 40 navigation/evidence and 120 reader cases.
Strict checking, formatting and source immutability checks pass. The initial
reader failures and obsolete blanket-fragment-rejection assertions remain in
their original failed-run artifacts; production rate-limit behavior was not
weakened to satisfy legacy assertions.

The clean broader native gate passes **17741 tests, zero failures, two unchanged
exclusions** across 343 selected suites and 342 strict roots. Its manifest has
721 entries, with 378 not run by this gate. The audit binds 1250 source files,
2076 compiled files and 1239 unchanged tracked inputs. Build/strict/format/source
checks pass. Gate time: September 13, 2026, 04:22:18.530–04:26:23.376 UTC;
audit: 04:26:23.484 UTC. These broad exclusions are not the four focused legacy
exclusions: the two legacy suites were never in this broad selection.

Evidence lives under `node_modules/.cache/native-validation/`:

- `research-fragment-work-september13/fixed00`, `fixed01`, `fixed02` — focused runs.
- `research-fragment-work-september13/legacy-baseline00` — unchanged-source
  reproduction of the four legacy HTTP429 failures.
- `native-research-fragment-september13-round00` — clean broader gate and audit.

Separate native website probes are documented in the website-test inventory
updates; unit tests do not prove their outcomes. No full-site rendering,
credential/passkey-device operation, SafeJS, real TTY or challenge-handoff
acceptance is inferred. No runtime dependency was added; overall goal active.
