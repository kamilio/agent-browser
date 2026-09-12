# Float applicability: separately scoped native source follow-up

September 12, 2026, **19:55:46.587–19:55:46.760 UTC**. Main performed two
explicitly scoped offline source views using committed native15522
`43060222e28db7abb3259b0ad50d230f359705c6`. Zero HTTP/resource requests.
This supplements `FLOAT-APPLICABILITY-SOURCE.md`; it does not replace its
published-Flexbox node-limit failure or incomplete first Display sampling.

## Flexbox: existing editor source, not a new web response

The unchanged file `/tmp/agent-browser-flexbox-reference-2026-09-03.bs`, already
recorded in `FLEX-LAYOUT.md`, has 302,576 bytes and SHA256
`9045cf12ebac5c027cadaacab8b4e90fcc66657520eeaab140d50e51bd300ffa`.
One native `loadTextDocument` call viewed the entire file with explicit local
text/plain fixture metadata. Its three-node document preserved the full text
exactly. This was not a Bikeshed renderer, fresh HTTP capture, substitute HTML
parser, or successful parse of the separately failed published HTML.

Five bounded native-text contexts were retained with UTF-16 source offsets and
hashes. The first, source interval 26,763–28,023, contains the substantive rule:
float/clear do not float or clear flex items, and do not remove them from flow.
Other contexts include discussion and historical changes; they are not five
independent normative rules. The editor-source edition was recorded September 3,
not established as the newest published specification by this operation.

## Display: full selected definition section

One separately authorized native HTML parse used the exact newly captured
581,657-byte Display response, SHA256
`872cdd7c49fdbfba1ff7ea5b6689145c168b17d09542f11af717a55bc16ab9ed`.
The native document contains 12,037 nodes. Native selection starts at
`#box-generation` (h3, node5274) and stops before the next same-level
`#legacy-display` heading (node6332). It retains 1,058 selected nodes and all
7,720 bytes of section text, including test labels, not just favorable excerpts.
Selection consumed 14,041 work units; semantic-text SHA256:
`c50e94bc50bb91aea1a1a4e83debbff55807d309d6f799250b6ec2d3f476a6a8`.

The actual definition now establishes that ordinary `display:contents` elements
generate no own boxes, while their children/pseudo-elements retain normal box
generation. Document-tree selector, event and inheritance semantics are not
changed by that box suppression. The section also explicitly qualifies replaced
and other non-CSS-controlled elements, which compute to `display:none`, and
points to Appendix B. That appendix was **not followed or extracted**; this is
not evidence that the browser implements every unusual/replaced-element case.
The captured note about other browsers is source text, not independently tested
cross-browser behavior. Source spans here are native heading/node boundaries,
not a complete mapping to raw HTML byte intervals.

## Isolation and retained limitations

The published Flexbox HTML was not retried, trimmed or reparsed; its 30,000-node
failure remains. Both new views kept 30,000 nodes, depth256, 2MiB text, 100k query
work, 2M selection work and 32KiB combined output. The single child ran under
kernel socket denial with pinned Node22.22.0 and empty private HOME/TMPDIR.
Before/after release and original source hashes agree; query/document owners
close with zero remaining document nodes. No scripts, SafeJS, credentials,
providers, devices/TTY, socket probe, stylesheet/DOM alterations or challenge
bypass. This source work is not website layout acceptance or full CSS conformance.

Private evidence and the exact scope are in
`node_modules/.cache/native-validation/float-applicability-work-september12/source-followup00/`
and its parent `SOURCE-FOLLOWUP.md`. `verify-source-followup.mjs` checks the
original source intervals, response/result hashes, release identity and cleanup
without repeating either native operation; its nine-entry receipt ledger and
`VERIFICATION.json` retain the verification outcome.
