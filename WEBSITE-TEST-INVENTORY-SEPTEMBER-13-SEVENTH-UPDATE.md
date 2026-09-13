# Website evidence — September 13, 2026, seventh update

This supplements the sixth update without replacing previous captures, failures
or measurements. **One new public native GET** tests the WHATWG rendering source.
Separate offline Wikipedia replay evaluates a closed-dialog display correction.

## Fresh website capture

| Exact URL | UTC execution | Observed result |
| --- | --- | --- |
| `https://html.spec.whatwg.org/multipage/rendering.html` | 05:51:45.745–05:51:46.114 | GET200; native reader/capture succeeds, zero redirects/retries |

Native transport decodes366253bytes from54444encodedbytes. Body SHA256:
`d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e`.
The original URL and /multipage/rendering.html wire path agree. Credentials
are omitted; no asset/script requests, alternative URL or remote browser.
No challenge, rate-limit or Retry-After is observed in this response.

One separate socket-sealed native reader parse creates9604nodes. Three queries
and10607 counted traversal visits retain6767 of10000 allowed excerpt code units
without budget clipping. Seven fieldset/legend blocks and the relevant dialog
CSS are selected; this is not a full chapter, visibility or diagram rendering.

Observed anchors are the-fieldset-and-legend-elements, fieldset-layout-model,
flow-content-3 and the next section replaced-elements. They are locally observed
IDs, not additional navigations. The dialog CSS belongs to the flow-content
section rather than a separate dialog heading.

The source establishes fieldset/legend implementation requirements and separates
closed-dialog default visibility from open/modal behavior. Neither source
reading nor the captured diagram establishes native geometry correctness.
All original research topics remain incomplete; this fetch is compatibility
and implementation research, not a completed hardware/model/opinion survey.

## Native code correction

The default style resolver previously displayed closed HTML dialogs inline.
It now defaults dialogs without open to none and open dialogs to block, while
preserving author cascade overrides and foreign namespace behavior. Visible
dialog rendering remains deferred; modal APIs, backdrop, top-layer and focus
trapping are not implemented by this change. See DIALOG-DISPLAY.md.

The new23-case suite reproduces11 failures on unchanged production source;
the fixed focused scope passes373 cases across eight suites. Seven strict roots
pass; the snapshot suite still runs behaviorally while retaining its historical
strict-only omission. Native tests are not a full Wikipedia rendering pass.

The later clean broad snapshot passes17863/0/2 unchanged exclusions across345
suites/344strict roots;723manifest entries leave378 unrun. Root dist is not
rebuilt. Source/compiled provenance is retained in the separate native-dialog-
display-september13-round01 audit, not retroactively attached to the WHATWG visit.

## Captured Wikipedia comparison

No new Wikipedia GET. Audited17840 at06:55:10.956–06:55:11.254 and audited17863
at06:58:07.653–06:58:07.943 each load the same119573-byte portal body offline.
Two native queries, one formatting inspection and one geometry call per phase;
zero scripts/resources, interactions or rasters. DOM nodes2708 and source
attributes are unchanged; no authored CSS or DOM rewriting is used.

The actual dialog.frb-iad-dialog without open changes from inline/displayed to
none/not-displayed. Its deferred formatting node disappears. Formatting boxes
2208→2207 and deferred subtrees3→2; all other issue counts remain identical.
The fieldset and logo image still defer. The search input still has no formatting
node, and both width requests reject the remaining eight blocker categories.
The comparison passes for the closed-dialog correction, not pointer or full
site rendering. Counters and single-run times are not browser-speed benchmarks.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-dialog-display-september13/`:
before/after RESULT.json, original runtime pins, invocation/execution/cleanup
records, combined RESULT.md/JSON and EVIDENCE.sha256. Original live portal and
failed pointer evidence remain unchanged. No URL/ref from one native tree is
used as an interaction target in another.

## Provenance and boundaries

The WHATWG capture uses audited17840/base7ce compiled code, not the later dialog
candidate. Before/after1252source/2080compiled inventories match that audit.
The live child exits0,502054 output bytes,369ms wall interval; offline child
exits0,2787outputbytes,264ms interval. These are single-run observations, not
comparative performance results. Process groups terminate; native owners close,
guards record no unexpected attempts, and private HOME/TMP are removed empty.

Evidence: `node_modules/.cache/native-validation/native-whatwg-rendering-september13/`:
RESULT.md/JSON, IMPLEMENTER-NOTE.md, EXCERPTS.json, OBSERVED-ANCHORS.json,
live.jsonl, response-1.body/json, all invocation/execution/resource/cleanup
records, before/after inventories and EVIDENCE.sha256.

Fieldset/control ownership, CSS/overflow/alignment/direction rendering gaps,
broader performance/website coverage, original research, credential/passkey
devices, SafeJS, real TTY and human challenge handoff remain open. No cookie or
credential access, fingerprint spoofing or automated challenge solving occurs.
