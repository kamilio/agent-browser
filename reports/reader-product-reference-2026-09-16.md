# Native product and reference-page workflows

## Results

Three fresh source-to-destination native reader workflows use the maintained
`--target-link` command on runtime `feac628899caea37d5f15c3007084ba56b6164e3`.
Each has a prior hash-checked saved-source/native-click proof with a clearly
synthetic destination. Those proofs do not establish real destination content.

| Source | Exact destination | Native result | Content review |
| --- | --- | --- | --- |
| `https://www.homedepot.com/` | `https://www.homedepot.com/p/Home-Decorators-Collection-Marsden-Patina-Wood-Finish-3-Drawer-Rattan-Cane-Chest-of-Drawers-38-in-W-x-36-in-H-05-633-543/327654656` | Source200, target403 | Access denial; no product content or challenge-provider attribution. |
| `https://en.wikipedia.org/wiki/Main_Page` | `https://en.wikipedia.org/wiki/Grace_Coolidge` | Two200 responses, native click,213087 Markdown bytes | Substantive reference article available; heading outline and introduction/later-body/end samples reviewed. Large navigation/table/citation/category overhead remains. |
| `https://www.target.com/` | `https://www.target.com/p/apple-watch-series-12/-/A-1013556561` | Two200 responses, native click,2282 Markdown bytes | Full130-line Markdown reviewed: product identity and variant controls, but empty detailed sections. Separate source metadata already supplies specifications and descriptions. |

These are **six new GETs**, no retries, redirects, credentials, page scripts,
alternate clients, challenge solving or cart/account/form actions. All observed
requests/sockets, documents and child/process groups close. Home Depot's failed
destination is preserved; no alternate product is substituted. Native mouse
events occur before its HTTP failure, not a successful destination extraction.
Wikipedia starts from its known canonical Main_Page URL, not an unrecorded retry
of the root-page redirect. Exact times, hashes and selection counts are in JSON.

## Product metadata is not Markdown

The original successful Target workflow already includes
`extraction.sourceProducts`: **26865 compact-JSON bytes**, four bounded records,
76 specification strings,27 highlights and three descriptions, totaling110 text
fields including four titles. It is partial and truncated: the source parent
has21 children, while the adapter retains only three variants alongside it.

An initial main review looked only at Markdown and overlooked this existing
field. No new collector or missing-data runtime fix is claimed. The maintained
command guide now explains how to use the metadata separately. Its literal HTML
source strings are unrendered and unverified; they are not inserted into the DOM
or executed. Preserve each record's TCIN/relation. The parent's M/L band field
and a child's S/M field cannot be combined into one selected product's specs.
No selected-variant inference, price/inventory validation or endorsement of
medical/safety marketing claims follows from retrieving these strings.

One **additional, explicitly recorded native GET** captures the exact Target
product source for diagnosis. It returns200 and a different body hash from the
original workflow. Static JSON-path checks confirm all four included identifiers
and110 text values against that separate fresh capture. This is not a claim that
the original response bytes were reconstructed or that all21 variants were
retained. The page supplies inert Next.js product data; no JSON-LD product block
was found by the diagnostic script scan. No captured script is executed.

Total new requests for this batch: **seven**, including the separate diagnostic.
Home Depot's403 is not retried. The diagnostic plan and spent-once record are
distinct from the three initial publisher workflow allowances.

## Tests and changes

- Add three integration regressions to `src/research-target-link.test.ts`:
  bounded source metadata survives CLI JSON without merging route/variant fields;
  a mismatched source route contributes no product metadata; metadata does not
  turn empty Markdown into a successful rendered-content extraction. Synthetic
  price/session sentinels and an omitted fourth variant stay out of the output.
- Final **806pass/0 in10** explicitly selected native-manifest files:723 prior
  selected cases,80 additional existing product-collector cases and3 new cases.
  This is not806 new tests or full939-file manifest coverage.
- Clean build, selected type-check, scoped format/lint all pass. All2292 compiled
  production artifacts match the live runtime byte-for-byte. This batch changes
  tests and guidance, not production behavior or the historical website verdicts.
- Saved-source inspection and three native-click proofs run with kernel-denied
  network. Native unit tests use a JavaScript guard, not a kernel isolation claim.
  Prior723-test evidence admits the live run; the later806-test run adds coverage
  without changing the production runtime used for it.

## Still open

The100-entry citation-proxy checklist remains unchanged at33 useful/67 other;
these task-level destination results are not added to that root-page tally.
Home Depot's earlier full-source CSS admission failure and Wikipedia's full-page
formatting limitations are not fixed by this explicit semantic-reader workflow.
Native nonempty outcomes remain `extracted-unverified` with `contentSuccess:null`.
Full rendering, dynamic interactions, access handoff, actual SafeJS, credentials,
passkeys and real-input gates remain open in TASKS.md. No speed claim follows
from these few network durations. Adjacent JSON records exact evidence hashes.
