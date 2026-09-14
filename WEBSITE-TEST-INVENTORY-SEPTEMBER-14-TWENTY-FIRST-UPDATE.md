# Website inventory: September 14 twenty-first update

This append-only update records current-engine checks of **two existing hosts**,
using original captures. It adds no live requests, new host or current-availability
claim. Historical successes and failures retain their original evidence.

| Host | September 14 UTC | Current captured outcome |
| --- | --- | --- |
| `info.cern.ch` | 12:26:02 | Harness header-prototype assertion fails before native loading; verification remains failed. |
| `info.cern.ch` | 12:27:50 | Explicit corrected-harness retest passes real link discovery, mouse activation, second-document navigation/content and closure. |
| `www.wikipedia.org` | 12:25:23 | Native formatting/diagnostics and search lookup complete; input geometry remains unsupported. |

CERN uses exactly two historical responses / 2,881 bytes, one initial navigation,
one genuine click and three explicit queries. It reaches “Overview of the Web”
with 498 body-text code units. No forced click or direct destination fallback.
See CERN-CURRENT-CAPTURED-FLOW-SEPTEMBER-14.md, including the immutable first failure.

Wikipedia uses its original 119,573-byte portal. Total overlapping formatting
issues fall 160→138, driven by value diagnostics 24→2. Input `e239` still has no
supported rectangle. No image callback or raster is enabled, so missing sprite
pixels are not verified. See WIKIPEDIA-BACKGROUND-DIAGNOSTICS-SEPTEMBER-14.md.

Both use the audited b5d2efd runtime. The 23,340-pass gate is rehashed, not rerun.
Zero wire, scripts, credential/provider/device or terminal probes. These checks
do not close the original research, broader live-site or challenge-handling gates.
