# Rounded inline fragmentation: native source evidence

**Source requirements clarified, not implemented browser behavior.** A bounded
native read resolves the main default-slice versus clone distinction. It does not
establish fragment rendering, hit testing or cross-browser conformance. Unequal
transverse-size slice percentage-radius geometry remains explicitly unresolved.

## Returned document and actual request

At **22:42:50.406UTC on September13,2026**, one normal native GET to
`https://www.w3.org/TR/css-break-3/` returns200 with no redirect. Returned metadata
identifies **CSS Fragmentation Module Level3, W3C Candidate Recommendation,
December4,2018**. This is not a latest-version or editor-draft check.

The response contains171462decoded/32270encoded bytes. Its original decoded SHA-256
is `4d47d4b2dd36a28e2b0275833b9734b1d5a0b18299a3f278e238bed8e2ecd509`.
There are no retries, linked-source requests, assets, page scripts, geometry or
rasters. Native user agent/TLS remain unchanged and credentials are omitted.
No challenge-solving or access-bypass behavior is tested or claimed.

## Requirements for integration

- `box-decoration-break` accepts `slice` and `clone`, initially **slice**, applies
  to all elements and is non-inherited. Its percentage syntax being n/a says
  nothing about whether corner radii may use percentages.
- **Clone:** each fragment gets independent decoration, including border radius
  and background. A no-repeat background can consequently appear once per
  fragment. Decoration also affects the layout space needed for a fragment.
- **Slice:** decorate the hypothetical unbroken geometry and then split it.
  Do not insert border/padding or draw a shadow at a broken edge. Giving every
  line fragment four fresh rounded corners is not default-slice behavior.
- For inline fragments, use the **parent's inline progression direction** to
  identify broken edges. A different direction on the element itself or a more
  distant containing block is not a substitute for the stated parent rule.
- The source recommends honoring decoration policy at bidi/display-imposed splits;
  otherwise those splits must use slice. This is not an unconditional clone rule
  or an implementation of the full bidi algorithm.
- Hypothetical background/border-image assembly uses visual fragment order and
  dominant-baseline alignment, not a screen-space bounding rectangle around all
  lines. Page/column assembly uses its separately stated block-flow rules.

Combining clone's independent decoration with the earlier Backgrounds source's
border-box percentage bases implies fragment-local used radii for clone. That is
an **inference across two retained native sources**, not a new verbatim percentage
algorithm in this source. The earlier response body was not read or reparsed.

The source's unequal transverse-size rules expressly discuss background-image
sizing and continuity. They do not justify inventing a widest-fragment radius
reference box. Precise unequal-size slice percentage-radius geometry, full writing
modes/bidi, line-break selection, margin truncation, fragment event-hit/overflow
rules and other unfetched cross-references remain open.

Keep decoration policy, visual ordering, parent broken-edge direction, reference
geometry and per-fragment offsets/clips separate from the shared contour math in
`ROUNDED-GEOMETRY-PAINT.md`. A box plus four radii cannot encode default slice by
itself. Any limited initial profile must retain explicit unsupported cases.

## Native extraction and boundaries

One live native parse is followed by one sealed offline parse. The latter retains
5761nodes, with revision5760unchanged. Two native queries cost147051work; bounded
traversal adds62926, for209977of1000000allowed. It examines215eligible blocks and
retains32blocks across8headings,11651excerpt units including814metadata units;
the largest section is3002units. Zero budget omissions does not mean every
specification section or linked reference was examined.

Exact refs/text/hashes are in `EXCERPTS.json`. Relevant sections include
`break-decoration` and `joining-boxes`; broader percentage/property matches are
explicitly distinguished from radius-specific evidence in `REQUIREMENTS.md`.

## Integrity and cleanup

This source task uses the earlier audited21,262/0/2cursor runtime, not the later
rounded foundation gate. No native tests are rerun. Runtime/source/framework pins
match before and after both modes; native documents, query owner and transport
close. Private HOME/TMP are empty and removed. Groups1012605and1012694are absent.

Live execution:22:42:50.237–22:42:50.554UTC; offline:22:42:55.093–22:42:55.305UTC.
Both exit0 without timeout, watchdog, output-cap or stream failures. The live guard
is not a kernel network sandbox; offline uses kernel/JS network/process denial,
without active socket self-probes. No real credentials, devices, SafeJS or TTY are
accessed. Single120556/104856KiB RSS observations are not performance benchmarks.

Evidence under `node_modules/.cache/native-validation/`:

- `native-rounded-fragment-source-september13/EVIDENCE.sha256`:66entries,
  `e16927811b4fbd95869297903fe3b0f4c7d347bc302dc4143d9b019562d5e5cb`.
- Its59-entry `EXECUTION-EVIDENCE.sha256`:
  `e348f754848d40f33c804f221be149cdcd28ef4ab4b4f1d56af0e4e21c831c29`.
- `rounded-foundation-work-september13/FRAGMENT-SOURCE-VERIFICATION.json`:
  independent parent check at22:49:31.415UTC,7ledgers/7031entries verified.

Prior source evidence is preserved at its original paths. This report updates the
known source requirements, not the historical measurements or browser acceptance.
