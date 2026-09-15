# Bounded source descriptions for otherwise empty pages

The September 15, 2026 saved-page investigation found no missing non-script
application body text in the sampled Instagram, TikTok, Twitch, MSN and Roblox
responses. These captures provide no additional non-script body prose.
However, Instagram, Twitch, Roblox and Pinterest supply public meta descriptions
that the research reader previously discarded. Those descriptions now survive
as separately labeled extraction metadata, without inventing body content.

## Output contract

Both native and reader extraction can include `sourceDescriptions` in JSON
reports, whether the requested body format is JSON or Markdown:

```json
{
  "kind": "html-meta-descriptions-v1",
  "partial": true,
  "truncated": false,
  "entries": [
    {
      "attribute": "name",
      "name": "description",
      "text": "A page-provided description.",
      "truncated": false
    }
  ]
}
```

- Only `description`, `og:description` and `twitter:description` markers on
  direct HTML head meta children are eligible. Marker case and surrounding
  ASCII whitespace normalize; content uses parser-decoded attribute text.
- The reader retains matching inert marker/content pairs in head-compatible
  source context. Other attributes are stripped. Mixed `http-equiv` records
  remain omitted, so this does not enable refresh, CSP or other meta behavior.
- Body, nested head/noscript, foreign and omitted-template/script descriptions
  are not promoted. This is not arbitrary metadata or hydration-state export.
- Preserve source order, duplicates and disagreements. At most eight nonblank
  entries, each limited to 2,048 source UTF-16 code units without splitting a
  surrogate pair. Entry truncation and additional-entry truncation are separate.
  Terminal controls use the same escaping convention as extraction text.
- Metadata is document-wide, like the title, even for scoped body extraction.
  The field is absent when there are no eligible descriptions. Literal-text
  documents are not interpreted as HTML. Returned description snapshots freeze
  their records/array and survive later document mutation or closure.
- Retained reader descriptions consume existing text/output quotas. Extraction
  metadata consumes the existing byte quota. No resource cap is raised; a page
  with excessive description attributes can now reach those existing limits.

Descriptions are unverified statements supplied by the page, not article text,
rendered content, search results, prices or a feed. They never enter the body
Markdown/JSON tree or turn `empty-extraction` into `extracted-unverified`.
Challenge/login and HTTP failure classification retain their existing priority.
Metadata-only failure receipts remain evidence-only; replay admission is not
broadened. No scripts, alternate browser, runtime dependency, extra HTTP request
or automatic navigation is introduced.

## Saved response checks

Guarded native inspection and injected-response research checks use the original
top-100 captures, not fresh website visits. These are descriptions recovered
from saved bytes; they do not demonstrate functioning applications.

| Saved website | Added description entries | Body Markdown bytes | Outcome retained |
| --- | ---: | ---: | --- |
| Instagram | 1 | 0 | empty-extraction |
| TikTok | 0 | 0 | empty-extraction |
| Twitch | 3 | 0 | empty-extraction |
| MSN | 0 | 0 | empty-extraction |
| Roblox | 3 | 0 | empty-extraction |
| Pinterest | 2 | 98 | extracted-unverified, JavaScript notice |
| VK | 0 | 201 | extracted-unverified, browser notice |
| YouTube Music | 0 | 155 | extracted-unverified, browser notice |
| Zoom control | 3 | 29,997 | extracted-unverified |
| LinkedIn control | 0 | 0 | semantic-barrier, no extraction |

Every measured body hash, outcome, content-success value and replay-admission
classification matches the baseline. The actual Pinterest replay CLI keeps its
98-byte body and exposes two description entries. Native source parsing confirms
the recovered descriptions, independently of the static inspection report.
Original capture hashes and historical top-100 measurements remain unchanged.

## Validation

The focused suite has 1,054 passing cases in 14 explicit native-manifest files:
54 new cases and the same 1,000 prior statuses. Build, strict types, formatting
and lint are checked on clean archives with owned overlays. The initial combined
candidate passed every test but needed formatting changes in two new test
statements; its production bytes are identical to the final candidate.

Eleven guarded offline children include an initial inspection and corrected
inspection, API/replay checks, and actual CLI checks. One initial proof child
failed because the proof supplied no replay selector, not because extraction
failed; the corrected recipe explicitly selects `body`. The first inspection
also omitted Pinterest's existing separate-raw-discard policy and reported a
budget failure; the corrected recipe retains the capture's original policy.
Those artifacts are retained rather than rewritten as successes. All children
and groups close, guards record zero network attempts, and build/source pins
remain unchanged. See `reports/source-descriptions-2026-09-15.json`.

This is not a full native release or live/rendered application validation.
Useful-content versus application-shell diagnosis, broader site compatibility,
research conclusions and separately authorized runtime, credential, passkey,
service/socket and TTY acceptance remain open in `TASKS.md`.
