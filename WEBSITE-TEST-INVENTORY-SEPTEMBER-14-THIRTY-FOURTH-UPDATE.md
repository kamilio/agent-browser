# Website inventory: September 14 thirty-fourth update

One new native-reader observation and two new native search flows produce
19 real HTTP requests: five document GETs and fourteen CSS/image GETs. Two further
resource deliveries come from memory and are not counted as network or mock
responses. The repeated search URLs are not new websites or unique-host growth.

| Exact document URL | Observation |
| --- | --- |
| `https://www.rfc-editor.org/rfc/rfc9111.html` | HTTP 200; 232,630 decoded response bytes; 153,459 Markdown bytes; 263 ms. Native reader checks actual age formulas and invalidation text, not just a title. Runs 22:37:12 UTC on the previously verified `ec2d176` runtime. |
| `https://lobste.rs/search` | HTTP 200 in separate cache-disabled/enabled flows. Full native HTML/CSS, no scripts, actual Space radio activation and constant filling; no account action. |
| `https://lobste.rs/search?q=local+llm&what=stories&order=newest` | HTTP 200 from native Enter submission in both flows. Byte-identical 11,560-byte Markdown results, with query/radio state and actual story/discussion links checked. |

The control runs 22:47:40–22:47:43 UTC and performs ten real requests. The opt-in
treatment runs 22:48:26–22:48:28 UTC and performs eight: the hashed stylesheet and
logo are delivered from memory on the second document. Their bodies match the
control, and their skipped control transfers carry 1,765 encoded body bytes.
This establishes a request reduction for this flow, not a general speedup.
Both use the same source-hash-pinned resource-reuse candidate based on `ec2d176`.

All observations occur September 14, 2026. Each supervisor exits 0 with no timeout,
surviving child/process group or stderr and with empty private HOME/TMP. Requests
are real public GETs with no redirects/mocks; the native flows accept no cookies
and finish with zero retained document nodes, active requests or cache bytes.
The reader's original `extracted-unverified`/`contentSuccess: null` fields remain
unchanged; semantic verification and body/output hashes are separate evidence.

`RESOURCE-REUSE.md` documents the feature, test coverage, limits and evidence
locations. Research completeness, broader compatibility, rendering, scripts,
SafeJS/device/credential and full-release gates remain open. No earlier report,
inventory total, blocked attempt or measurement is rewritten.
