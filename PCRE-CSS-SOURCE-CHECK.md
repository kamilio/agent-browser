# PCRE captured CSS: unsupported declaration attribution

## Result

An offline native source check identifies the two applicable unsupported CSS
declarations in the retained PCRE homepage: **`text-decoration: underline` and
`cursor: pointer` on `a`**. Each selector matches 43 source-DOM anchors. The
diagnostic count is two declaration occurrences, not 86 failing elements.
This explains the observed property diagnostics; it is not a website pass or
proof that these are the only remaining rendering or interaction limitations.

The original live result remains `PCRE-DOCUMENTATION-FLOW.md`: the homepage
commits, but a real documentation click fails native width resolution before
destination navigation. This source check does not repeat that session.

## Unchanged captured inputs and native result

Committed runtime: `96541506e7878af0bea70ed002bf13111765da3c`, the isolated
13042-pass gate, pinned Node 22.22.0. Probe UTC on September 12, 2026:
**10:59:23.046–10:59:23.126**. Supervisor:
**10:59:23.019–10:59:23.135**, exit zero.

| Captured input | Decoded bytes | SHA256 |
| --- | ---: | --- |
| Homepage HTML | 7949 | `0d90d7d90c93583f8547b109d0c33b5df148fe0f0ea4c9c63876f94bc0570b5d` |
| Original linked stylesheet | 630 | `1837495fbe684df3364c4887672c9c9b657ee0feb0800dd7fdbf8fd550cd5036` |

The native HTML parser runs with scripting false. Native selector queries find
the original stylesheet link, and `documentStyles.setExternalSheet` receives
its unchanged captured bytes. No source repair, resource fetch, foreign parser,
style suppression, geometry or raster fallback is used. The source DOM has
262 nodes and revision 263, unchanged during inspection; document and query
owners close afterward. These source-only observations do not reproduce live
pointer state, installed resources or whole-page rendering.

The native CSS scanner sees **10 source rules / 22 declarations**. The full
native parser retains **9 rules**; the unmatched `a.links:hover` rule has no
accepted declarations because its only property is unsupported. Raw issues
are six `unimplemented-css-property` occurrences; applicable issues are two.
Native per-statement diagnostic aggregation agrees with the full-sheet parser.

| Original selector | Unsupported declaration | Source matches |
| --- | --- | ---: |
| `a` | `text-decoration: underline` | 43 |
| `a` | `cursor: pointer` | 43 |
| `a:hover` | `text-decoration: underline` | 0 |
| `a.links` | `text-decoration: none` | 0 |
| `a.links:hover` | `text-decoration: none` | 0 |
| `button` | `cursor: pointer` | 0 |

Zero hover matches describe this source-only state, not future interaction.
Each recorded selector sample is capped at five refs. The original stylesheet
is parsed whole; source rule counts are not inferred from substring excerpts.

## Isolation, verification and preserved failures

The source check runs under unconditional kernel socket/socketpair denial,
with explicit environment, empty HOME/TMP, no stdin/TTY and bounded time/output.
It opens **zero browser sessions, makes zero requests or mocks, performs zero
clicks and adds zero attempted hosts**. No credentials, providers, devices,
real SafeJS or protected source-heading payloads are accessed.

Before execution, all 20 release receipts, 1144 source files, 1960 compiled
files and ten actual committed Git inputs are verified. Git reads occur outside
the kernel seal. The source/compiled inventories, release pins and all 216
entries in the original PCRE final ledger match again after execution. The
original ledger SHA256 remains
`fa3ea2fe13e99b6f67aa298f3535300c1069a7e16df528d0dbe87705e9cfbed1`.

Private evidence is under
`node_modules/.cache/native-validation/quirks-image-work-september12/`:

- `pcre-css-source-run00/`: preparation fails before probe launch because the
  repository-relative PCRE ledger was initially resolved against its lane.
  Original helper bytes and an explicitly retrospective failure note remain.
- `pcre-css-source-run01/`: isolated probe exits one at 10:58:31.502 UTC.
  A diagnostic assertion incorrectly equates ten scanned source rules with
  nine retained rules. Original stdout, stderr, probe and receipts remain.
- `pcre-css-source-run02/`: corrected accounting explicitly verifies ten source
  rules, nine retained rules and equality of their accepted-selector lists.
  The captured site bytes, diagnostics and production runtime are unchanged.

`PCRE-CSS-SOURCE-RECEIPTS.sha256` binds the reports, helper sources, parent
proof and preserved runs. `verify-pcre-css-source.mjs` checks those receipts,
the original PCRE ledger and the unchanged native release without rerunning
the computation or browser; execute it with the adjacent existing
socket-denying supervisor as recorded in `PCRE-CSS-SOURCE-VERIFICATION.json`.

Next implementation work should provide genuine decoration and cursor behavior
with cascade, computed-style, rendering/interaction and negative tests—not
silence diagnostics. Live destination success, complete rendering, performance,
research, credentials/passkeys, TTY, real SafeJS and challenge handling remain
separate outstanding gates.
