# Native image represented-content source — September 12, 2026

## Outcome and immutable early handoff

One authorized native GET returned HTTP200. One offline native parse captured
the img represented-content cases and the separate complete getter. **The full
available/current/pending request definitions and state transitions remain
uncaptured:** their observed cross-references point to another document, which
was not requested. No additional URL, retry, redirect, layout or implementation
was attempted. This is bounded primary-source evidence, not rendered-site
acceptance, a latest-revision claim, or chapter-wide conformance.

New private lane, absolute path:
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-image-semantics-source-september12/`.

The early-handoff native extraction is immutable and remains unchanged:
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-image-semantics-source-september12/EXTRACTED.json`.
SHA-256:
`0464aa24735b5e2168e8be7e98c81c6f2c33b02f24165c0a79328d6b244ad16e`.
It was made read-only immediately after extraction, before this report/seal.

## Source-stated represented-content cases

The authoritative selected block is `EXTRACTED.json` → `selected[1]`, ordinal2,
native DOM node4222, `div[data-algorithm]`, sibling index104 after selection
of `#the-img-element`. The following paraphrases preserve attribute presence
separately from string value and preserve the availability/display condition.

| src attribute | alt attribute | Represented-content branch |
| --- | --- | --- |
| Omitted | Omitted | Nothing. |
| Omitted | Present, empty | Nothing. |
| Omitted | Present, nonempty | Text supplied by alt. |
| Present, including empty | Present, empty | Image data if the image is available and the UA is configured to display it; otherwise nothing. |
| Present, including empty | Present, nonempty | Image data under that same availability/display condition; otherwise text supplied by alt. |
| Present, empty | Omitted | Image data under that same availability/display condition; otherwise the explicit empty-src branch represents nothing. |
| Present, nonempty | Omitted | Image data under that same availability/display condition; otherwise the UA should display an unrendered-image indicator and may supply contextual caption information under the stated conditions. |

The last case does not invent an alt string. Its optional caption algorithm
first uses a nonempty title; otherwise it can use the first figcaption of a
qualifying containing figure, with the source's flow-content restriction;
otherwise there is no caption information. The report does not substitute title
for alt in every failed image. The selected following paragraph, ordinal3,
also distinguishes alt from title/advisory information.

For present empty alt, the source permits complete omission from rendering when
the element represents nothing. That permission is not an instruction in this
task to drop an element, override authored geometry, or erase the separate
rendering algorithm. BROKEN-IMAGE-SOURCE.md retains the previously captured
rendering expectations, including pending/missing-alt/quirks branches and zero
natural dimensions versus authored used dimensions.

## Current, pending and completion: preserve the distinction

`EXTRACTED.json` → `selected[4]`, ordinal5, DOM node6115,
`div[data-algorithm]`, sibling index162, captures the separate complete getter.
It returns true if any of these conditions holds:

- Both src and srcset are omitted.
- Srcset is omitted and src has the empty-string value.
- The current request is completely available and the pending request is null.
- The current request is broken and the pending request is null.

Otherwise it returns false. In particular, the null-pending qualification belongs
to the last two conditions; do not incorrectly attach it to the first two or
remove those first two conditions when a pending request exists. This getter
does not define what is represented and does not establish that true means
successfully fetched/decoded pixels. Omitted src with present srcset is not the
first completion condition.

The source's availability predicate and full state machine are external
cross-references. The captured links include `images.html#img-available`,
`#current-request`, `#pending-request`, `#img-all` and `#img-error` under the
same official multipage source. They were retained, not followed. This lane
does not capture the definition of unavailable or partially available, initial
request state, source-selection/error transitions, or the meaning of available
in terms of those states. It therefore cannot collapse unavailable, pending,
loading, broken and unsupported decoding into one fully source-confirmed enum.

Ordinal6 contains the currentSrc getter's current-request URL reference.
Ordinal7 contains adjacent decode-method text, including current-request
changes/broken state and waiting for complete availability. Neither is a
replacement for the missing state definitions. The keyword selection also
retains an adjacent controls paragraph and an alt-example block; these extra
records are not used to establish the table or completion conditions above.

## Policy proposals — not additional source statements

- Main can test missing-src/missing-alt, missing-src/empty-alt and
  missing-src/nonempty-alt separately without treating missing as empty.
- Preserve the conditional available-and-configured branch for present src;
  this capture does not independently prove which request states satisfy it.
- Keep represented content, completion, expected future image availability,
  replaced/non-replaced rendering, intrinsic dimensions and CSS used sizing
  separate. Do not derive a universal300x150 fallback from this evidence.
- Do not use this capture to claim the Selenium missing-source image has a
  verified used layout or that native image-loaded navigation now passes.

No source, tests, root manifest, TASKS, Git objects or implementation files were
edited by this worker. Main owns implementation and the overall task ledger.

## Observed target, bytes and version information

Discovery used the existing native JSONL only:
`node_modules/.cache/native-validation/native-broken-image-source-september11/section-1.jsonl`.
The prior receipt ledger was checked before and during verification. Five native
links matched; the first is ref e4275 at JSON path
`$.extraction.content.children.0.children.0.children.2.children.3.children.0`.
It observed
`https://html.spec.whatwg.org/multipage/embedded-content.html#the-img-element`.
Only the fragment was removed for the one document request. SOURCE-TARGET.json
records the source hash, exact links, source metadata and prior selection;
archive/observed-section-1.jsonl preserves the input bytes. No guessed URL or
raw-HTML replacement parser supplied the target.

The native live child ran at18:04:08.800569–18:04:09.061603UTC on
September12,2026, with one bodyless GET and one observed wire request.
The requested/final document was
`https://html.spec.whatwg.org/multipage/embedded-content.html`.
It returned155204decoded bytes and23398gzip-encoded bytes, with zero redirects.
Decoded-body SHA-256:
`52e3c8252fcaf5e69842d6c01668e5053a6d7ac3714ef5f808594997b22acef9`.
response-1.body and wire-1.body retain decoded and encoded bodies respectively;
response-1.json and wire-1.headers.json retain headers and transport/TLS data.

Observed response headers: Date `Sat, 12 Sep 2026 18:04:09 GMT`, Last-Modified
`Tue, 08 Sep 2026 14:24:04 GMT`, ETag `W/"6aa01a84-25e44"`, and content type
`text/html; charset=utf-8`. These are reported server metadata, not independently
verified upstream revision identity or a statement that this is the latest text.
TLS authorization was true. No Retry-After, restriction status, challenge header
or challenge title was observed. Native DNS/public-address/TLS transport checks
were retained; the wire audit records AgentBrowser/0.1 and omitted credentials.

## Native selection and source-span limits

The single offline parse ran at18:05:39.224–18:05:39.315UTC. It observed7747nodes,
132sibling inspections, eight selected blocks,32unique links and one selected
heading. Selected block text plus heading totals9064UTF-8bytes. The parser is
explicitly `independent-html-subset`, partial, no-quirks, scripting false; its
four script-not-executed issues are retained, not suppressed as success.

The native selector is `#the-img-element`, heading DOM node2082. Instrumenting
the existing native tokenizer during that same parse records its actual opening
token at decoded-source code-unit interval[44244,44267). No alternate parser or
second HTML parse was used. Native link token spans are retained as well; for
example, the availability link in the represented-content block starts at
[88965,89032), and the current-request link selected with the complete getter
starts at[131800,131871). These are token spans, not whole-algorithm spans.

`textSourceAnchors` separately records exact literal native-text searches into
the captured source, including byte offsets and line numbers. These are **not
unique DOM-to-source mappings or reliable full-block boundaries**: short phrases
can recur, including the last-text anchor in ordinal2. Do not interpret that
pair as the end-to-end source span of the represented-content algorithm. The
complete native block text, DOM IDs, sibling positions and genuine tokenizer
link/heading spans are the usable provenance; full block source spans remain a
limitation. The immutable early artifact is preserved without correction.

Configured parse limits were30000nodes,2MiBsource text and depth256. Native query
maxWork was2000000 with128results; only the heading and title selectors ran.
The retained final-query work counter is75; a combined per-query work trace was
not retained. Semantic-text cap was64KiB and selected heading/link cap128.
No layout ran. The tree revision stayed unchanged; cleanup left zero nodes,
closed/empty query caches, one close notification and the tokenizer restored.

## Release, execution, verification and seal

Only commit `11316bee02c034fe041a4753a8621fee9bc17d4c` and the immutable
`native-plain-fractional-editable-september12-round00` snapshot were imported.
Before/after checks retain1177source files,1992compiled files, six snapshot
inputs, nine actual Git objects recaptured twice and20gate receipts. The gate
records15065passed, zero failed and two unchanged exclusions. This is a checked
historical gate, not a test rerun or authorization for additional live gates.

Actual local Git cat-file capture ran outside the socket-denying kernel wrapper;
all seven supervised stages otherwise use the applicable recorded live/offline
wrapper. Offline discovery, integrity, extraction and verification deny sockets
in the kernel. The native child and other supervised stages use private empty
HOME/TMPDIR, sanitized environments and DEVNULL stdin, without a real TTY/PTY.

Live bounds were one request, one concurrent operation,2MiB encoded/decoded body,
30seconds plus5seconds kill grace,4MiB per file and combined stdout/stderr. This
lane additionally used a stricter4MiB aggregate-storage ceiling. All recorded
stages exited zero with no termination signals, truncation or cap failures; all
process groups were absent afterward and private directories remained empty.
No live or parse retry occurred. Adjacent historical failures remain untouched.

preseal-verification.stdout records a successful read-only verification of actual
Git archives, snapshot inventories,20gate receipts, unchanged stage-script pins,
one-request evidence, immutable extraction bytes and cleanup. This is the
worker's verification, not Main's independent review. The verifier imports no
native page modules and performs no network replay or HTML reparse.

Read-only verification command from repository root:

```sh
python3 -I -B node_modules/.cache/native-validation/native-image-semantics-source-september12/run.py verify
```

RECEIPTS.sha256 seals lane evidence, scripts and this report. SEAL.json records
the report/extraction/ledger hashes and actual outcome. Source snapshots retain
their original paths and are verified against their immutable inventory hashes;
they are not copied or rewritten. All lane files and this report become read-only
at sealing. No commit or push was made. Full request-state semantics, implementation,
used-layout/navigation acceptance and wider browser gates remain open.
