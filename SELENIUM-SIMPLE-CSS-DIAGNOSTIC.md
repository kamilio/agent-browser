# Captured Selenium CSS diagnostic — September 12, 2026

## Finding

A separate offline native-browser parse identifies the four unsupported CSS
declarations in the captured basic Selenium fixture:

| Native owner | Declaration | Native declaration-parser issue |
| --- | --- | --- |
| div e136 | text-indent:80% | unimplemented-css-property |
| a e186 | text-transform: capitalize | unimplemented-css-property |
| a e190 | text-transform: lowercase | unimplemented-css-property |
| a e194 | text-transform: uppercase | unimplemented-css-property |

Seven style-bearing owners supply121CSS code units and six native-scanned
statements. The other two statements, visibility:hidden and width:10px, are
accepted by that declaration parser. Aggregate raw and applicable style metrics
each report four unimplemented-css-property issues, matching the live counters.

This localizes the CSS diagnostics, not every possible layout limitation.
No source fix, supported text-indent/text-transform implementation, successful
reference click or whole-page acceptance follows from this result. These are
concrete compatibility candidates; silently dropping their guards is not a fix.

## Separate From The Live Run

SELENIUM-SIMPLE-FLOW.md preserves the original run: one initial page commit,
then a genuine reference click stopped by the supported-formatting-profile guard.
That live run did not perform this diagnostic. Its initial197node document also
loaded an image. This offline parse does not hydrate images or attempt layout,
clicks, painting, script execution or another request. It is not a page replay.

Input is exactly the3123decoded-byte response already captured at
node_modules/.cache/native-validation/native-selenium-simple-flow-september12/response-1.body.
SHA256:97179c187a27e230036f15ee8615213366ebd1ec8cc93ac70ef8afb8737331f3.
The live lane/report/capture are unchanged. Its separate221-entry seal is
independently verified by Main; this diagnostic is not inserted into that seal.

## Execution And Integrity

Only the committed13769 native HTML parser, DOM selectors, CSS statement scanner,
declaration parser and style engine are used from release
4c2d78c8b7c6c10acef91a04ed6b17613ce0f345, immutable
native-block-content-alignment-september12-round01/snapshot01/dist/src.
No alternate HTML/CSS parser or raw-HTML regex extraction is used.

Native parse/observation:2026-09-12T15:28:04.980Z–15:28:05.031Z.
Supervisor:15:28:04.854–15:28:05.043UTC, exit0, no signal/error.
Exactly one HTML parse yields197nodes at revision198, unchanged during reads.
Selector cleanup reports closed with zero cached selectors/indexed nodes.
The source1160/compiled1972 inventory contents and input body hashes match
before and after. No new HTTP requests, page/image loading or layout attempts.

Execution uses kernel socket/socketpair denial, private empty HOME/TMPDIR and
stdin DEVNULL. Bounds remain30seconds,256KiB captured output,128KiB source,
1024observed DOM nodes,64style owners,8192CSS code units,128statements,
512code units per statement and32KiB diagnostic JSON. No credentials, providers,
devices, TTY or SafeJS execution.

The first diagnostic process,15:27:32.851–15:27:32.923UTC, failed before any HTML
parse because its import prefix incorrectly omitted dist/src. Original
probe.mjs,run.mjs and results remain unchanged. probe01.mjs/run01.mjs correct
only the module prefix and result paths; the one-parse contract is preserved.

Private evidence:node_modules/.cache/native-validation/native-selenium-simple-css-diagnostic-september12.
Successful output:results01/stdout.json.
Output SHA256:3e8239fa91bb12a34815bc00221c8b0e72e6c4983f04ca4b0d84d1c022ca8dad.
The original import failure, successful output, supervisor receipts and scripts
are retained. This is same-agent diagnostic evidence, not an independent
implementation review, live retry or new standards-conformance claim.
