# Libpng image-border source check — September12,2026

## Result and scope

**The independent border-zero failure is fixed; the original quirks fallback
failure remains.** This is a small paired-document source probe,not a full
Libpng replay,new website visit or successful FAQ navigation. No HTTP requests,
image fetches,page sessions or clicks occur. No source is removed to turn the
historical website flow into a pass.

The exact original badge and full doctype are extracted from the preserved
Libpng homepage body. Its SHA256 remains
50ec9ab7655ee476c78e3ff45630a51e459c8bdff8071c73a03056860f4db480. The badge retains WIDTH80,HEIGHT15,BORDER0,the
public HTTP SourceForge source and its alternative text. Two synthetic native
documents differ only in their doctype:original versus HTML5.

| Runtime / document | Presentation-hint guards | Unsupported-element guards | Native image rectangle |
| --- | --- | --- | --- |
| 12650 original quirks | 1 | 1 | unsupported |
| 12650 HTML5 control | 1 | 0 | unsupported |
| 12817 original quirks | 0 | 1 | unsupported |
| 12817 HTML5 control | 0 | 0 | 216×8 at0,0 |

The earlier control unexpectedly failed because border=0 was independently
misclassified. Its two failed runs are retained. The new code recognizes the
HTML border presentation hint rather than suppressing all diagnostics. The
original-doctype expectation still requires the unsupported-element failure;
it is not weakened to hide the remaining quirks behavior.

Both current image owners stay broken/policy-denied with zero natural
dimensions,zero resources,zero requests and zero decoded bytes. The HTTP image
is blocked before fetch. All owners close and input bytes remain unchanged.
There is no SourceForge HTTP response,MIME/body/hash or server/codec/reachability
verdict. Zero adapter rejections in the original live flow did not mean zero
image-owner policy denials. Parsed URLs and these offline documents add no
host to the website inventory.

The already-supported list-style:disc declaration also expands into three
declarations without diagnostics. That narrow source assertion does not erase
the original document's independent table/presentation/display/layout guards.

## Provenance

Native child UTC:2026-09-12T09:51:19.852Z–2026-09-12T09:51:19.875Z.
Supervisor UTC:2026-09-12T09:51:19.767Z–2026-09-12T09:51:19.884Z;exit0.
Runtime:3890c339b2bba7c743c1322a36c733a8f2c2fc75,12817 isolated native passes,0failures,
2unchanged exclusions. Parent verifies7 actual committed Git inputs and all
20 release receipts,1140source files and1956compiled files before/after the
socket/socketpair-denied child. Empty HOME/TMP,no stdin/TTY,credentials,
providers,devices or realSafeJS. This is not foreign-browser pixel parity.

Source:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/image-border-work-september12/badge-doctype-source.mjs
Artifacts:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/image-border-work-september12/badge-doctype-source-probe
Prior failed controls:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/image-border-work-september12/../post-list-style-work-september12/quirks-image-baseline-run00 and -run01.
Original live source:node_modules/.cache/native-validation/native-libpng-flow-september12/response-1.body.

- Probe:a271633462654ab0869944000189840cbb3d34c573d6e0aade750801cf61d786
- Probe stdout:a1712ae56952d51e9692a8d5b3a79d6dbf510c1b363dbddc6b010c254b4af8e3
- Probe summary:7d44eb7525ca662bfd90ee2dbfffc40318ca7cb63f22c13d0a74b9fb1e0e915e
- Prior run01 summary:dde76bd23317a59e928cb16962037d8413da58c5ba192cd4394a5a326d91f993
- Committed runtime verification:72d7aa990bc0e05e2ab152aa6d1f3309cc1c9f978ba1c993944221635215e789

HTML-IMAGE-BORDER.md records the isolated implementation and frozen regression.
The full browser goal,dimensioned quirks broken-image rendering,full Libpng
flow,provider/passkey/device/TTY/realSafeJS and broader research/performance/
challenge-handling acceptance remain open in TASKS.md.
