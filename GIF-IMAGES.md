# Native GIF image support

## Behavior

The native image dispatcher accepts image/gif alongside image/png and image/jpeg.
The pure TypeScript decoder supports GIF87a/89a global/local palettes, logical
screen offsets, transparency, all four interlace passes, bounded LZW dictionaries
through12-bit saturation, clear codes and KwKwK. No page-runtime dependency,
foreign browser, system codec or alternative rendering engine is added.

Only the initial graphic image is presented. Every later image frame is parsed
and validated before success; a malformed later frame rejects the entire image.
Metadata includes version, frame count, animation presence, loop count, total
delay, interlace/transparency presence, ignored metadata and work counters.
Image snapshots explicitly expose presentation:initial-frame and
animationPlayback:false. The capability response repeats these limitations.

The initial canvas is transparent if the first GCE requests transparency or no
global table exists; otherwise it uses the global background color. The first
rectangle is composited using its selected palette. This is an explicit native
policy, not independently established cross-browser pixel parity.

## Limits

Decoder ceilings:32MiB input,4096 top-level blocks,131072 nonempty sub-blocks,
256 image frames,4096-pixel dimensions,4194304 logical pixels and268435456 work
units. Existing tighter image-owner response/decoded-byte/work limits still
apply unchanged. Options can lower but not raise decoder ceilings. Input views
are respected, input bytes are not mutated and decoded buffers are owned.

Plain-text graphics and reserved disposal methods4–7 are unsupported. Nonzero
pixel aspect ratio and user-input scheduling are reported but not implemented.
There is no timed animation, disposal playback or color management. Duplicate/
dangling GCEs, conflicting loops, extra loop payloads, invalid tables/rectangles,
pixel under/overflow, missing end/trailer and trailing full compressed bytes
are rejected. Unused final-byte bits are tolerated. Unknown nonrendering
extensions are skipped within bounds. These are strict native acceptance rules,
not a claim to reproduce permissive decoder error recovery.

## Validation

The byte-identical canonical GIF/center/geometry/raster/hit fixture fails on
the clean12350 baseline at the supported-formatting-profile guard and passes
after GIF support. Three new suites add120 cases:100 independent decoder cases,
19 image integration cases and that canonical regression. Focused validation:
573 passed, zero failed. Earlier failed intermediate assertions remain recorded.

The selected explicit-manifest release gate passes **12,470 cases, zero failures,
two unchanged exclusions**: 240 selected suites,239 strict roots,
634 clean manifest entries. Production build, strict checking and formatting
also pass. This is not a claim that every manifest suite ran. An additional
command-host suite outside this established selection reproduces a pre-existing
Node capability assertion on unchanged12350:49pass/1fail. It remains unresolved;
the GIF capability contract is covered by a new passing targeted assertion.

UTC: 2026-09-12T08:34:27.827Z through 2026-09-12T08:37:03.167Z.
Evidence: `node_modules/.cache/native-validation/native-gif-image-september12-round00`.
The audit verifies1132 source files,1952 compiled files and
1120 unchanged tracked inputs, with20 gate receipts and full source/compiled
ledgers. Kernel socket/socketpair denial, private empty HOME/TMP and pinned
Node22.22.0 are used. Pre-existing command-host/index changes are preserved
through clean projection and are not bundled into the GIF commit.

## Website and remaining gates

The motivating Netlib12350 follow-up recorded a GIF87a image response but failed
the genuine FAQ click at an independent formatting guard. That historical run
is unchanged. This release alone establishes neither Netlib navigation nor any
new working website. The75-host inventory records attempts, not75 successes.
A fresh native Netlib flow is a separate bounded acceptance check.

Animation playback, broader document/CSS profiles, research-site coverage,
challenge handling/human handoff and credential/passkey/provider/device/TTY/
realSafeJS acceptance remain open. No CAPTCHA bypass or identity rotation is
implemented or tested. The overall browser goal is not complete.
