# Native list-style shorthand

## Behavior

The native stylesheet and inline declaration engines now expand list-style
into list-style-type,list-style-position and list-style-image. Omitted values
reset to disc,outside and none. Existing marker types and inside/outside work
in any supported token order. A lone none disables type and image;with an
explicit type it supplies image:none. CSS-wide keywords expand all components.

list-style-image currently supports none and the four existing CSS-wide
keywords only. Image URLs,custom counters,string markers and symbols() remain
unsupported,with diagnostics intact. No marker-image fetching is introduced.
Other CSS/HTML/table/layout guards and existing capacity limits remain intact.

Inline/CSSOM support includes importance,component overrides,removal,variables,
CSS.supports,all resets,and computed shorthand/image values. The native
serializer emits explicit position/image/type components,matching its existing
explicit-component outline policy;browser-minimal-string parity is not claimed.

The shared declaration serializer also preserves representable pending-variable
shorthands plus explicit overrides. It reconstructs the original shorthand
before the first related component,and retains equal/stronger-priority
overrides. It does not evaluate variables. Missing components,incompatible
pending groups and weaker-priority overrides are not recreated,which would
change cascade semantics. General serialization of those cases remains open.

## Evidence

The immutable list-style:none navigation fixture fails0/1 on clean12470 at the
width-supported-profile guard;it now passes geometry,raster-marker absence,
hit testing,source preservation and cleanup. Four suites add180 cases.
Final focused run:690 passed,zero failed. The selected explicit-manifest
gate passes12650 cases,zero failures and two unchanged exclusions:
244 selected suites,243 strict roots,638 manifest entries.
Production build,strict checking and formatting all pass.

UTC:2026-09-12T09:08:42.535Z through 2026-09-12T09:11:19.025Z.
Gate:`node_modules/.cache/native-validation/native-list-style-september12-round02`.
Audit:1136 source files,1952 compiled files,
1125 unchanged tracked inputs;20 receipts and full source/compiled ledgers.
Kernel socket/socketpair denial,pinned Node22.22.0,private HOME/TMP and stable
source inventories separate this native evidence from live acceptance.

The first broad round retains an old failing negative for list-style:none;
that fixture now uses genuinely unsupported list-style:url(marker.png).
Independent review exposed seven CSSOM round-trip regressions,all reproduced
before the serializer repair. An intermediate repair missed a first-component
CSSOM ordering case;that failure is preserved and fixed. See the work lane's
VALIDATION-NOTES.md. No failed run is replaced or renamed as success.

## Scope and remaining work

GnuPG's captured navigation/footer source motivates the shorthand addition.
This code gate alone does not establish successful GnuPG navigation or remove
its other CSS limitations. Libpng testing on the older12470 runtime is separate
evidence,not a validation of this release. Historical website reports remain
unchanged. The broader native-browser goal,performance/research/site coverage,
image markers,GIF animation,provider/passkey/device/TTY/realSafeJS and challenge
recognition/human handoff remain open. No foreign engine,dependency or bypass.

Primary syntax references:CSS2.2 generated content/lists and CSS Lists3 shorthand
sections at https://www.w3.org/TR/CSS22/generate.html and
https://www.w3.org/TR/css-lists-3/ . No foreign browser was run for parity.
