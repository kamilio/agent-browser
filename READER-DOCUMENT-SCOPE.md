# Recover context outside an article selection

Main-content selection can produce a useful article while excluding its byline,
publication date or supplemental tables. Check `partial`, `contentSelection` and
the source before treating an article slice as a complete page. Nonempty output
or `extracted-unverified` does not establish that the requested content is there.

## Existing document-wide reader command

Use the native research-browser command without `--content-focus` when the public
source has relevant material outside the chosen article:

```sh
node dist/scripts/research-browser.js \
  --reader \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-fallback-encoding utf-8 \
  --compact-tables --table-rows \
  --output-limit-policy text-prefix-v1 \
  "$PUBLIC_PAGE_URL"
```

This is the normal bounded reader profile, not the long-profile heading workflow.
It does not disable source-hidden filtering, execute scripts, render charts or
bypass access checks. Output limits still apply; inspect any prefix/truncation
indicators. Document scope often includes more navigation and unrelated controls.
The exact-target link-content convenience command deliberately uses main-content
selection; the command above is a separate existing entrypoint, not a new flag
for that convenience command.

## Verified captured-page example

For the native September 16, 2026 RunRepeat Brooks Revel Max capture:

- Main-content extraction contains 19,465 UTF-8 bytes and 28 tables.
- Document-wide extraction contains 27,113 bytes and 30 tables. The original
  article remains an exact contiguous slice; no article prose is rewritten.
- The extra context includes the author, displayed publication date, methodology
  link, lab-summary table and separately labeled brand-specification table.
- Explicit heel labels in the supplemental table provide context absent from
  the flattened measurement selectors. They do not authorize interpreting a
  publisher-specific `.active` class as a universal selected state or inventing
  alternate-state measurements.

The actual compiled command was tested with one explicitly routed saved response
under kernel-denied networking. There was no additional live request for this
document-wide check. The independent article review predates this follow-up;
main's separate comparison verifies the recovered context and selected source
samples, not every cell of every supplemental table or publisher claim.

Source-only outcomes remain `extracted-unverified`, `partial:true` and
`contentSuccess:null`. Keep laboratory claims separate from brand claims and
retain their respective units and provenance. Charts/media and interactive
radio/disabled-button state remain incomplete.

The same scope change does **not** recover RTINGS' captured review: document-wide
and both main-content policies return identical navigation-only text. Its empty
component mount and opaque props need a separately established content contract,
not weaker visibility filtering. Manuals.plus' confirmed challenge requires a
human handoff, not a scope or client workaround.

Evidence: `reports/review-manual-workflows-2026-09-16.md` and companion JSON.

## Fresh scope and compact-output check

A separate September 17, 2026 native GET of the same source-linked RunRepeat
review returns a new 780,668-byte body. The earlier capture and measurements
above remain unchanged. Three actual offline replay CLI invocations compare:

| Selection | Markdown bytes | Native tables |
| --- | ---: | ---: |
| `--content-focus main-content-v3` | 37,927 | 29 |
| `--selector body` | 47,474 | 31 |
| `--selector body --compact-tables` | 41,468 | 31 |

All three use `--format markdown --table-rows` and the same capture pins.
Document scope includes the entire main output as an exact contiguous slice.
The compact document saves 6,006 bytes, or 12.7%, solely by shortening the native
row/cell begin-boundary labels. All other output bytes are identical, including
table contents, row order and remaining structural warnings. This is output
serialization size, not network or execution speed, and does not establish that
every source or dynamic measurement was extracted correctly.

All CLI children exit successfully. The original document-mode collectors
incorrectly expect `selection.method` to be `selector`; the actual public value
is `css-selector`. Their failures remain recorded. Separate saved-output
verification checks the correct schema, content, pins and closure without
rerunning the commands or website. Evidence and remaining source-fidelity gaps:
`reports/entry-content-retest-2026-09-17.md` and companion JSON.
