# Content-page checks and authored link labels — September 15, 2026

## Six new content-page attempts

Native build: `fb9eeeee1d56d6d08af06b3e258d366f494d3929`. Six navigations,
**8 GET requests, zero retries, six verified body captures**. All children,
process groups and transports closed. Empty HOME/TMP and allowlisted environment;
no page runtime, credentials, external resource execution, identity rotation or
challenge bypass. Existing response/extraction/time caps stayed in place.

| Requested page | HTTP | GETs | Markdown bytes | Observed result |
| --- | ---: | ---: | ---: | --- |
| `https://docs.pytorch.org/docs/2.14/index.html` | 200 | 1 | 18681 | Documentation content, not another redirect note |
| `https://en.wikipedia.org/wiki/Large_language_model` | 200 | 1 | 0 | Whole-page extraction output limit |
| `https://www.gutenberg.org/ebooks/1342` | 200 | 1 | 6488 | Book catalog, metadata and reading/download destinations |
| `https://www.nasa.gov/learning-resources/` | 200 | 1 | 48247 | Education descriptions and resource links, with navigation clutter |
| `https://www.rust-lang.org/learn` | 200 | 3 | 4957 | Learning/documentation directory after two redirects |
| `https://web.dev/articles/passkey-registration` | 200 | 1 | 34250 | Article, checklist and code examples; examples not executed |

The PyTorch destination was authored in the previous turn's preserved stable
redirect note. This new scope resumed explicitly after the earlier follow-up
stopped. Neither earlier note outcomes nor the original top-100 matrix changed.
Five live results remain `extracted-unverified`, not full functional acceptance.
No linked book/download/share/send/account destination was activated.

Pacing qualification: the native setting is **per origin**, not per navigation.
Rust starts were 14 ms apart across different origins and 1003 ms apart for the
subsequent same-origin redirect. The initial scope's wording was overbroad; this
is not a production pacer bug or evidence of a global one-second interval.

## Wikipedia without re-fetching

The 1,071,877-byte captured body failed at `extraction.output`: 256,000-byte cap,
256,028 observed. Pinned offline outline recovery found **64 native headings**,
including UI headings, without truncation. Three exact observed section selectors
then returned useful bounded Markdown through the real replay CLI:

| Section | Markdown bytes |
| --- | ---: |
| Training | 2919 |
| Architecture | 7529 |
| Evaluation | 8239 |

All preserve the original failure and receipt/body pins, with zero network
requests and no original-request retry. Whole-body compact-table/row replay also
exited 1 with the CLI's generic error; its exact exception is not inferred from
that message. Three sections are not a complete-article retrieval claim.

## Focused fix from real pages

NASA resource links and web.dev author links include SVG-only anchors with
authored `aria-label` text. The semantic reader stripped both SVG and that
attribute, leaving empty collected link labels. Gutenberg similarly exposes
icon-only anchors with `title`. Default Markdown deliberately omits empty anchor
wrappers; an existing regression forbids inventing visible text from attributes.

The fix preserves bounded `aria-label` on reader anchors and exposes optional
`sourceLabel` metadata during requested link discovery. It records the authored
attribute, normalized text and truncation, without replacing collected text,
changing URL-only search, fabricating DOM refs, or injecting prose into Markdown.
Selected and unfiltered link diagnostics include the source metadata. Contract:
`SOURCE-LINK-LABELS.md`.

Five pinned baseline/candidate comparisons verify:

| Capture/query control | New source labels | Default content |
| --- | ---: | --- |
| NASA aerospace resource | 1 ARIA label | Same Markdown and extraction JSON |
| web.dev author GitHub link | 1 ARIA label | Same Markdown and extraction JSON |
| Gutenberg Dropbox destinations | 5 title labels | Same Markdown and extraction JSON |
| Rust learning links | 0; existing text retained | Same Markdown and extraction JSON |
| PyTorch Markdown links | 0; source-link behavior retained | Same Markdown and extraction JSON |

The NASA candidate's actual replay CLI matches its API metadata. These are
offline checks of fresh captures, not a new live run of the candidate build.
Reader accounting intentionally changes: NASA ignored attributes 885→874 and
sanitized output units 127269→127803; web.dev 1186→1180 and 100783→100994.
The other three controls' accounting is unchanged. Captured source bytes and
original receipts are unchanged. Document-local refs are normalized only in
cross-tree comparisons, never in actual output.

## Validation and open gates

- Clean committed archive plus six owned TypeScript overlays: **1,857 passed,
  zero failed across 22 selected explicit native test files**. All 1,802 baseline
  test statuses match; 55 new cases cover the source-label contract and barriers.
- Build, scoped types, format and lint pass. Initial release01 had the same
  passing tests but a new-test formatting failure; release02 validates final bytes.
- Independent static review found no actionable issues in the five production
  diffs. This is not a full browser or rendered-accessibility audit.
- Ten guarded offline children closed with zero network attempts. The initial
  auxiliary JSON proof used an excessive ceiling and is excluded from final
  acceptance; corrected baseline/candidate JSON comparisons use 256,000 bytes.
  Original helper versions, results and caveats are preserved.
- The preparation filename error stopped before build/tests and is recorded;
  it was not a browser failure. No native production limits or dependencies added.
- Hidden UI/navigation clutter and reduced table-header associations remain.
  No default visibility changes, full-page Wikipedia success, or interactive
  passkey/browser acceptance is claimed. No new runtime authorization was received;
  SafeJS, credentials/providers/devices, real TTY/service and full-release gates
  remain open. The overall browser/research goal stays active.

Machine-readable summary: `reports/content-pages-runtime-2026-09-15.json`.
Private evidence lane: `node_modules/.cache/native-validation/content-pages-runtime-september15/`.
Raw bodies and query-bearing logs stay private. All pre-existing work is preserved;
no push is part of this change.
