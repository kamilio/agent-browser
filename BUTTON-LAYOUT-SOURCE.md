# Native button-layout source verification

## Current native source

One new bodyless native GET to the WHATWG HTML rendering specification returns
HTTP200, **54444 encoded / 366253 decoded bytes**, at
**2026-09-12T13:46:51.121Z–2026-09-12T13:46:51.250Z**. The committed13501 browser's
NodeNetworkTransport performs it; there is no alternate HTTP client, browser
session, subresource load, script execution, redirect, mock or new attempted host.
The response reports last-modified September8,2026 and is byte-identical to the
original September12 11:21 native capture. SHA256:
d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e.

Source URL: https://html.spec.whatwg.org/multipage/rendering.html

Native DocumentQueries extraction retains the1205-code-unit Button layout
section and148-code-unit button-element applicability section. A separate
44-pre-element scan finds three button-related blocks; contextual extraction
records their headings and preceding applicability prose. No fresh parse is
claimed for the earlier algorithm extraction: byte equality links its original
input to the newly fetched response. Later stylesheet extraction uses the fresh
body directly, always under kernel socket/socketpair denial.

## Rules established for implementation

HTML button display preserves flex/grid variants and none/contents; other inline
outer types behave as inline-block and other outer types as flow-root. Content
establishes its own formatting context. Auto inline size is fit-content.
Absolute positioning and normal self-alignment use specified replaced-element
behavior; this does not justify discarding or flattening descendants.

The general Form controls stylesheet supplies inline-block display, centered
text and content alignment, and border-box sizing for buttons. These alignment
defaults come from the stylesheet, not a rule invented from the layout heading.
Another captured block applies only to ISO-8859-8 bidirectional handling; the
select-child button reset is conditional on base-appearance dropdown rendering.
Neither conditional block is a universal button reset. Primitive appearance is
left unspecified there, so the repository's software theme remains a local
implementation profile rather than proof of platform-widget parity.

An external web-tool view differed from the byte-verified native algorithm.
Its blanket inline-conversion assumption is not used as canonical evidence.
No unsupported claim is made about when that external view changed.

## Retained investigation history

- source:13:43:32.064–13:43:32.319UTC fails its20000-code-unit bound because
  the selector's parent is too broad; zero excerpt output and zero HTTP.
- source01:13:44:25.705–13:44:25.953UTC returns only168codeunits: a heading
  and pointer paragraph. It is explicitly insufficient for the algorithm.
- source02:13:45:13.812–13:45:14.062UTC returns both actual sections,
  14970native nodes and14bounded sibling checks, zero HTTP.
- source03:13:50:57.349–13:50:57.600UTC retains three complete stylesheet
  blocks; source04:13:58:10.974–13:58:11.226UTC adds their applicability context.
- A helper generator first stopped at JavaScript parsing before generation or
  network; corrected generation precedes the one successful fresh fetch.

All old scripts, outputs, failures and original captures remain unchanged.
Each extraction checks20release receipts,1155source files,1968compiled files
and13actual committed inputs before/after. Final source/Git checks are separate
from any website, layout or interaction acceptance. Native probes use bounded
time/output, empty HOME, private TMPDIR and no credentials/providers/devices/TTY
or real SafeJS. The fetch has one allowed HTTPS origin and one request.

Private source evidence and readonly verification:
node_modules/.cache/native-validation/rich-button-work-september12/.
SOURCE-RECEIPTS.sha256 binds the report, exact source inputs, runtime provenance,
source scripts and retained observations; it does not include mutable architecture
notes or unrelated inventory/live-followup work.

## Remaining work

This is source research, not rich-button implementation. The current native
rich-button guard and Go's independent102applicable CSS diagnostics and56image
CSP denials remain. Architecture notes must follow the verified rules and keep
input-button widgets distinct. Correct descendants, sizing, alignment, baselines,
theme/state painting, activation, work bounds and focused/full native validation
are still required. No broader research, performance, provider/passkey, device,
TTY, SafeJS or challenge acceptance is completed by this report.
