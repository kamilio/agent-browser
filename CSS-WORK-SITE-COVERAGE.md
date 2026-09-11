# CSS-work website coverage

These are separate native observations using the isolated selector-candidate
build, not claims that the sites render completely or that access challenges
are solved. Existing request, document, query and stylesheet limits are unchanged.

## Python.org search attempt

`node_modules/.cache/native-validation/native-python-search-flow-september11/`
records September 11, 2026, 08:21:41.471–08:21:42.420 UTC. The browser receives
HTTP200 for the public homepage and three native-requested stylesheets:

| Response | Decoded bytes | Body SHA-256 |
| --- | ---: | --- |
| Homepage | 52757 | `84e2ed570eae6a267d8726feb28f1f8844eeb0462ac68e63201bca7180df85e2` |
| Main stylesheet | 349405 | `d89cd2bd0637ccc5b4af65448deb9c85fac1f97c7b529ccc99b7070f8377b44d` |
| Media-query stylesheet | 96086 | `35e36199388e7f91c71fadd3c2619b88b0144a29e30784546f453a8d6285a5be` |
| Icon stylesheet | 31078 | `cc97f277693cd6797804977c15340f0901af3e04bb2737693921950de950396b` |

Loading fails with `Query work limit exceeded` before search discovery, fill or
submission. The planned public query `asyncio` is not submitted. All four
response-header challenge classifications are null; no credentials or scripts
are supplied. Four actual requests, no redirects, 529326 decoded bytes and
161628 encoded bytes are recorded. The transport closes with zero active
requests and zero mocks. Source/build pins remain unchanged; clean HOME/TMPDIR
and child-close checks pass.

Receipt SHA-256:
`f3f65887cc81607c2da77c414394c353d0088b899b45762cd6b8f332c2fbbe20`.
All exact response URLs are retained in this receipt. Replay must bind each
capture only to its recorded URL and deny other resource requests.

## Cross-site next step

STYLESHEET-CANDIDATES.md records successful Wikipedia portal loading and native
search submission, followed by a second CSS-work failure on the article. The
article and Python.org captures now provide two different workloads for offline
profiling. Profile successful high-cost selectors as well as the final budget
failure: the last selector may be merely where an accumulated budget expires.

Preserve original failed receipts and diagnose captured stylesheet dependencies
without new network requests or limit increases. Successful native tests and
portal recovery do not complete varied-site, rendering, research, fingerprint,
CAPTCHA or real credential/passkey-device acceptance.
