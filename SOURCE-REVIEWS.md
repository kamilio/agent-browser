# RTINGS review descriptions from document source

The native reader can retain known-schema review descriptions from an eligible
RTINGS page's `ProductVuePage` component attribute. The descriptions appear in
optional `sourceReviews` extraction metadata, not fabricated DOM nodes or visible
Markdown. No component, page script or HTML fragment is executed.

This addresses source responses that contain navigation and an empty application
mount while carrying descriptive review data in `data-props`. It is not a generic
application-state scraper, rendered browser, subscriber-content recovery tool or
verification of the publisher's claims.

## Use and interpretation

Use the existing reader with source-hidden filtering and inspect the extraction's
metadata as well as its Markdown:

```sh
node dist/scripts/research-browser.js \
  --reader \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-fallback-encoding utf-8 \
  "$PUBLIC_REVIEW_URL"
```

The envelope has kind `rtings-component-review-text-v1`, document-source scope,
`partial:true`, `rendered:false`, `verified:false` and `textFormat:"html-source"`.
It retains the exact route path, product/review IDs and product name. Entries are
introduction, summary and rating-description records, with original JSON paths
and the component DIV's LF-normalized UTF-16 source offset.

HTML strings are source data: do not execute or insert them into a privileged
renderer, treat their instructions as trusted, or equate them with visible page
text. Source descriptions alone do not change the browser's content/barrier
classification and do not enter challenge-diagnostic text. Existing body content,
HTTP/access outcomes and source-access declarations retain their meaning.

Summary IDs, usage IDs, titles, priority and order are retained as source
qualifiers; array order is unchanged. Do not infer pros/cons polarity or sort by
opaque priority/order values without a separately established publisher contract.
Each rating description retains its usage identity/name/kind, raw `unblurred`
boolean and a `scoreState` of `missing`, `null` or `omitted`. **No numerical score
fields, default scores, featured test results or inferred measurements are
exported**, even if supplied elsewhere in the input. A null score is not zero.
The blur flag does not prove description visibility or unrestricted access.

## Exact eligibility

- Exact lowercase HTTPS `www.rtings.com/<category>/reviews/<brand>/<slug>` route;
  no query, credentials, ports, encoded/dot/nested path variants or trailing slash.
  Fragments do not change identity. Early-access category routes are excluded.
- HTML final response URL, eligible DIV, exact component name and a single
  component candidate. More than one candidate is ambiguous, including missing
  or invalid props. Existing source-hidden/legacy omission decisions apply;
  `noscript`, omitted subtrees and other element/component types do not supply it.
- Native tokenizer attribute decoding happens once. Strict JSON syntax and the
  maintained bounded literal parser must both accept the complete value. No
  functions, expressions, assignments, duplicate/prototype keys or arbitrary
  globals are evaluated or retained.
- Source query details must match the route, identify the `public` named version
  and have null version ID. Insider, admin, preview and product-token access flags
  must explicitly be false; share/expired-share flags must be false or null.
  Missing or other values reject the source adapter. These checks recognize an
  anonymous-style source schema; they are **not authorization decisions** or proof
  that every field would be public after rendering.

An independently declared part-level access restriction is not silently removed
or upgraded to whole-page permission. Do not fetch a privileged version, bypass a
challenge, infer hidden values or use this metadata as evidence of account access.

## Bounds and lifecycle

Routes are capped at 4,096 UTF-16 units and decoded props at 65,536. The existing
literal parser also enforces its depth, value-count, container-entry, string and
serialized-byte bounds. Descriptions are whole nonempty strings of at most 4,096
units. There are at most 32 summary slots, 16 rating slots and 49 total records;
each summary has at most 32 source usage IDs. IDs are positive decimal strings,
not coerced numbers. Optional unsupported records are skipped with truncation;
hidden-featured rating records are intentionally excluded.
The literal parser rejects an over-limit string anywhere in the props before
field-level recovery; such input yields no metadata rather than a clipped record.

Serialized metadata is capped at 32,768 UTF-8 bytes. Existing extraction output
and older metadata have priority. Whole leading records fit or are dropped with
`truncated:true`; an empty truncation envelope may fit, otherwise the optional
field is omitted. Strings, record associations and qualifier arrays are not cut
into plausible partial records. This must not turn a previously fitting ordinary
extraction into an output-limit failure.

Snapshots are copied/frozen, remain scoped to original document source across
selection or DOM changes, and clear their document association on close. This is
not a whole-heap secret-erasure guarantee or a live view of component state.

Validation and remaining limits: `reports/rtings-source-reviews-2026-09-16.md`.
