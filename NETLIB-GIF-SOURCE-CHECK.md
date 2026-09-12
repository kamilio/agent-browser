# Netlib captured GIF source check

This is a new isolated decode of an already captured image, **not a new website
visit, page render or navigation**. The historical Netlib center flow and its
failed FAQ click remain unchanged in NETLIB-CENTER-FLOW.md.

Runtime:12470 native gate, commit e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3.
Child UTC:2026-09-12T08:39:25.341Z through 2026-09-12T08:39:25.345Z.
Supervisor UTC:2026-09-12T08:39:25.309Z through 2026-09-12T08:39:25.352Z; exit0.
Before execution, the parent verified20 gate receipts,1132 source files and1952
compiled files against their hashes. Source/compiled ledgers remain unchanged.
The child runs with kernel socket/socketpair denial and private empty HOME/TMP.

## Exact input and result

- Input:6710-byte historical response-2.body from
  `node_modules/.cache/native-validation/native-netlib-center-flow-september12`.
- Input SHA256:87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d.
- GIF87a,147×148 logical pixels,one frame;not animated/interlaced/transparent.
- 5892 compressed bytes,21756 decoded indices,336632 charged work units.
- Owned RGBA output:87024 bytes;pixel SHA256:0cc43ff6c5d1949358f3e72259785d4a09c08666624e7e4a9e9221523f9cfff7.
- No ignored metadata;loop count null and duration0ms.
- Zero HTTP requests,document loads or clicks;input bytes unchanged.

The existing image-owner decode-work ceiling33554432 and raster pixel ceiling
4194304 are passed explicitly. No limit is increased. This proves the new native
decoder accepts this exact source image and produces the reported dimensions
and bytes; it does not independently establish visual browser parity, page
layout correctness, successful link activation or animation playback.

## Retained evidence

Private lane:`node_modules/.cache/native-validation/gif-image-work-september12/netlib-gif-source-probe`.
Probe source SHA256:4941f742b26b14a14b45058769a83ba48f754362b1594c6560d634a408107a7f.
probe.stdout SHA256:65ae095c7fb2f91af6b48d1918f3c0ab2976493bbb34b1b9908fc959da4be844.
SUMMARY.json SHA256:72e30726d1dbe83070a3fc9c9f70edb3b3ba3c3226054169b80e38289cdc6eda.
The supervising source is run-netlib-gif-probe.mjs in its parent work lane.
Fresh native website testing is separate;the75 attempted-host inventory is not
incremented by this source-only check. Credentials/providers/passkeys/devices/
TTY/realSafeJS and challenge handling remain outside this result.
