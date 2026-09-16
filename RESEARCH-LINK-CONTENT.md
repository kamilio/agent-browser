# Native reader link-content command

Use an explicit reader workflow when the task is to retrieve a public article,
not reproduce the original site's full CSS, scripts or visual interaction.
The maintained command loads a source page, selects its intended hyperlink,
performs a real native click, and returns extracted destination content:

```sh
node dist/scripts/research-link-content.js \
  --target https://engineerfix.com/plc-programming-languages-a-comparative-guide/ \
  --selector 'h3.entry-title > a[href="https://engineerfix.com/plc-programming-languages-a-comparative-guide/"]' \
  https://engineerfix.com/
```

The example uses a previously source-audited article link; a publisher can change
its page. A missing or ambiguous match fails rather than choosing another link.
Both flags are required once, in either order, with exactly one source URL.
Inspect the current reader document when choosing the selector: it need not
retain all raw-source attributes. Use `--help` for the command synopsis.

When the exact destination is known but card markup varies, explicitly select
target-link mode instead of supplying a CSS selector:

```sh
node dist/scripts/research-link-content.js \
  --target-link https://engineerfix.com/plc-programming-languages-a-comparative-guide/ \
  https://engineerfix.com/
```

This mode requires exactly one source and one `--target-link` value. It cannot
mix with `--target` or `--selector`. It scans retained `a[href]` elements and
chooses the first eligible exact-target anchor in document order. Duplicate
image/headline links are allowed; empty text labels remain ineligible. It makes
one native click attempt, not an automatic fallback after a selector or click
failure. A known target is still required; this is not an article-search command.

Do not overconstrain the selector with incidental metadata or a particular
heading rank. One measured publisher variant moved `title` from its article
anchor to the parent heading and changed that heading from `h3` to `h5`.
The explicit selector `.display-card-title > a[href="EXACT_SOURCE_HREF"]`
worked for both observed structures; `[title]` and the fixed `h3` predicate did
not. This is a source-audited example, not a universal class name or automatic
fallback. Preserve the failed attempt, inspect the current source, and validate
an intentional selector change separately. See
`reports/reader-diverse-workflows-2026-09-16.md` for the original failure and
corrected native click, with no substitution of a different article.

## Compact table output

Either selection mode accepts one optional standalone `--compact-tables` flag:

```sh
node dist/scripts/research-link-content.js --compact-tables \
  --target-link https://en.wikipedia.org/wiki/Grace_Coolidge \
  https://en.wikipedia.org/wiki/Main_Page
```

The destination must still be linked from the current source page. This flag
does not alter link selection or enable a fallback when that link disappears.
It shortens repeated enclosed row/cell begin markers using the existing native
Markdown formatter, while keeping text, links, cell order and table warnings.
The existing row-list preference stays enabled. Simple row lists and non-table
content may not shrink at all. No input, output or request limits increase.

The flag takes no value and cannot be repeated. Omitted means the prior output
and parser shape remain unchanged; enabled reports disclose
`extraction.compactTables:true`. It does not add a top-level report flag. See
`COMPACT-MARKDOWN-TABLES.md` for the formatting contract and
`reports/reader-link-compact-2026-09-16.md` for saved-body size measurements.
Smaller output is not a claim of faster page loading or fuller rendering.

## Output and failure behavior

One bounded JSONL record contains `outcome`, source/target URLs, the selection,
actual native event sequence, response status/body hashes/byte counts, optional
`extraction`, and closed-resource metrics. The Markdown is in
`extraction.content`. No full response body, cookie value or raw exception
message is dumped. Response hashes identify bodies seen during execution, not
exported replayable receipts; use the existing capture/replay workflow when you
need complete source artifacts.

Target-link reports omit `selector`, set `selectionMode` to `exact-target-v1`,
and publish `targetLinkDiscovery` only after a complete scan. Its counts separate
all retained anchors, attribute/URL-qualified target candidates, and candidates
with eligible text labels. `selection.candidates` counts target candidates in
this mode; CSS mode retains its original all-selector-matches meaning.

Do not inspect only `extraction.content` when researching a product. The reader
can also attach `extraction.sourceProducts`: bounded route-matched Target product
descriptions from inert source JSON. A live product workflow returned a thin
Markdown shell but useful specifications, highlights and descriptions in this
separate field. See `SOURCE-PRODUCTS.md` for its schema and limits.

Keep each entry's `tcin` and `relation` with its fields: the route product is not
necessarily the selected variant, and parent/variant specifications can differ.
These literal `html-source` strings are not rendered HTML or verified facts;
do not execute them or merge variants. Honor `partial`, `truncated`,
`rendered:false` and `verified:false`. Prices and session state are deliberately
not exposed by this adapter. Source metadata does not turn an empty Markdown
extraction into an `extracted-unverified` workflow result.

- Exit0 means `extracted-unverified`: the native click navigated to the exact
  target and extraction is nonempty. `contentSuccess` remains `null`; article
  usefulness and factual accuracy are not automatically certified.
- Exit1 covers empty extraction, response/barrier/action/extraction failures, or
  execution/output errors. Structured workflow failures include a generic
  category and stage. Cleanup failures preserve an existing primary failure and
  set `cleanupFailed`, rather than silently replacing its diagnosis.
- Invalid command usage exits64 before transport. The exported parser and CLI
  runner instead throw generic typed argument errors to their caller.
- A failed click never becomes a direct destination navigation. There are no
  alternate links, automatic retries, redirect following or profile switches.

## Deliberate scope

Source and target must be different same-origin HTTPS URLs, without userinfo,
queries, fragments, percent-encoded spelling, backslashes, C0/C1 controls or
known account/action path segments. This is a deliberately constrained
public-content workflow, not a universal URL navigator. Native address/TLS
policy still applies. URL and selector arguments are each bounded to4096 code
units; pseudo-element and untrimmed selectors are rejected before navigation.

CSS selection considers at most64 native selector matches and requires exactly
one eligible anchor. Target-link mode allows at most10,000 retained anchors and
64 attribute/URL-qualified target candidates, including empty or overlong labels.
It completes this bounded scan before choosing the first eligible candidate;
later overflow cannot be hidden by an earlier match. Both modes require nonempty
bounded text and the exact target, and check the current document base, projected
attributes and normal native actionability. The first policy-eligible candidate
can still fail actionability; no second anchor is tried. Both pages
use the existing `long-v1` semantic reader with source-hidden-inline visibility,
separate omitted raw text and UTF-8 fallback. Source declarations can still
select another supported encoding. Main-content-v2, table rows and explicit
text-prefix-v1 retain their partial/fallback provenance.

The reader omits scripts, styles and source behaviors, including hyperlink
attributes it does not retain. For example, Engineerfix's `rel=bookmark` and
Reviewed's inline handler are omitted. Checks on projected attributes do not
prove those attributes were absent in the source. This command tests the retained
hyperlink's default action, not the source site's scripted-card behavior.
It neither solves challenges nor proves full-source rendering compatibility.

Response status and bounded unfiltered source diagnostics are checked before
visibility filtering. Detected access/challenge/consent barriers and non-success
responses stop the workflow. Detection is not universal; nonempty output may
still be a shell and needs content review. No credentials, form submission,
page scripts, alternate browser, identity impersonation or challenge solver is
enabled.

Existing explicit limits are4MB decoded per response,8MB aggregate, two requests,
one concurrent request,16KB headers,15s transport,20s navigation and2s per-origin
pacing. Extraction is bounded to256KB and final JSONL to512KB. The CLI runner has
a60s cancellation deadline, not an independent process/CPU sandbox. Existing
long-document ownership/work limits remain in effect. These settings do not
change ordinary browser defaults.

## Programmatic ownership

`scripts/research-link-content.ts` exports
`parseResearchLinkContentArguments`, `researchLinkContent`,
`runResearchLinkContentCli` and `researchLinkContentLimits`. The first two accept
the same argument array; the workflow accepts an optional AbortSignal. The CLI
runner additionally takes a caller-owned Writable and applies the output bound
and command deadline. The caller owns stream ending/destruction.

Cancellation closes browser resources and stops waiting, but cannot retract a
write already handed to an arbitrary Writable. While that write remains
unacknowledged, a per-write error/close guard remains to consume a late write
failure; normal completion or the associated error/close lifecycle removes only
owned guards. Caller listeners are never removed. A write that never acknowledges
and never closes can retain those guards on that stream; it does not retain the
command timer or caller AbortSignal listener. This is explicit outstanding-write
ownership, not a guarantee that arbitrary stream implementations will settle.

Validation and remaining acceptance limits are recorded in
`reports/research-link-content-2026-09-16.md` and, for explicit target-link mode,
`reports/reader-target-link-2026-09-16.md`. Historical publisher workflows and
the original100-entry checklist retain their own measurements and verdicts.
Product/reference workflows and source-metadata integration coverage are in
`reports/reader-product-reference-2026-09-16.md`.
Full rendering, actual SafeJS compatibility, credentials/passkeys and real-input
acceptance remain separate work in `TASKS.md`.
