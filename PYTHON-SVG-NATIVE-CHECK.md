# Python documentation native SVG check — September 12, 2026

**Resource loading succeeds; full layout does not.** A fresh native navigation to
`https://docs.python.org/3/` commits the document and completes all three Python
SVG-icon references. The first used-layout attempt stops with `unsupported`:
“Document width resolution requires an issue-free supported formatting profile”.
This is progress beyond the previous unsupported-SVG stop, not a website pass.

## Fresh observations

- Runtime: `eaf47dc8a0e1081e31d86588c4c489c3b6d46429`, selected native gate
  16,405 passing cases / zero failures / two unchanged exclusions; not rerun here.
- Live supervisor: September 12, 2026, 22:54:02.898895–22:54:05.168807 UTC.
- One navigation and commit; zero clicks; one formatting inspection and one
  used-layout attempt. Recorded title: `3.14.7 Documentation`; 853 DOM nodes;
  4,773 body-text code units in the bounded sample.
- Eight original native HTTP 200 responses: one HTML document, six stylesheets
  (including imported `basic.css`) and one shared `py.svg` image resource.
  Encoded bytes: 16,924; decoded: 72,064; combined: 88,988.
- All three image references complete as origin-clean `image/svg+xml`, 16×16.
  The image owner records one shared request, three deliveries, 2,041 received
  bytes, 1,024 decoded pixel bytes and 121,150 decode-work units.

Formatting remains partial: six CSS-selector, 22 property and six value
diagnostics, alongside float, inline vertical-align, display, positioning,
overflow and clear coordination issues. The first layout failure occurs at
22:54:05.108 UTC. These observations do not isolate one diagnostic as the sole
cause, prove an entire layout engine absent, or establish successful geometry.
No post-failure page inspection, retry, fallback or source stripping follows.

## Integrity and limits

Evidence: `node_modules/.cache/native-validation/native-python-svg-repaired-september12/`.
Result SHA256: `907acb5e305d191c332cbb0bab77c235be8b7dc00a69338b0a9484657c355341`.
The SVG body hash is `5865be8bcc0af888594903ea0112f6c8d923c5726c4081e8c856110cc7339cef`;
`basic.css` is `656ff1bacd6f260fc7d71b97f9c2f1fcbf692dc84bf469cd952034efcb9eefed`.

Before/after checks verify the pinned 1,210 source files, 2,028 compiled artifacts,
27 tested inputs, 30 actual Git objects and 20 original gate receipts. Main also
checks the recorded outcome, exact image states, execution receipts and hashes
without navigating again. All recorded owners close after bounded settlement;
active requests, retained DOM nodes, decoded image bytes, cookie/storage entries
and cleanup errors are zero. Process groups are absent; private HOME/TMP are empty.

Limits remain 32 GETs, one concurrent request, 250 ms spacing, 2 MiB per response,
8 MiB combined bytes, 45 seconds plus five seconds cleanup, 6 MiB per artifact
and 16 MiB per lane. Native TLS/public-address/CSP/resource owners and the truthful
`AgentBrowser/0.1` identity remain enabled. No credentials, SafeJS, alternate
browser, redirect following or challenge bypass is used.

The earlier `native-python-svg-september12/` setup attempt remains preserved:
its syntax harness failed before any website request; the underlying null child
status was not diagnosed. This distinct corrected attempt uses direct supervised
syntax checks. The older eight-response Python capture also remains unchanged.
Neither setup repair nor this partial live check completes broader website,
script, accessibility, visual-comparison, authenticated or passkey-device gates.
