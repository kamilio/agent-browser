# Native float applicability source check — September 12, 2026

## Result

Three authorized native GETs returned HTTP 200. Each original body received one
offline native parse attempt: **Flexbox stopped at the node limit; Grid and
Display produced bounded selections.** No request or native parse was retried,
no source was trimmed to fit, and no limit was raised.

Own outputs are this report and
`node_modules/.cache/native-validation/native-float-applicability-source-september12/`.
No production/test/manifest/TASKS/Git edits or earlier source-evidence changes.
Main's regression baseline and any implementation are separate work.

## Captures, dates, and immutable extraction pins

All receipt times are UTC on September 12, 2026. Last-Modified values below are
server headers, not verified editorial publication dates or latest-revision claims.
No native publication-date label was retained from the successful parses.

| Target | Original URL | Encoded / decoded bytes | Response saved | Server Last-Modified (UTC) |
| --- | --- | ---: | --- | --- |
| flexbox | `https://www.w3.org/TR/css-flexbox-1/` | 152,020 / 1,525,929 | 19:48:56.360 | October 11, 2025, 21:53:46 |
| grid | `https://www.w3.org/TR/css-grid-1/` | 139,592 / 957,488 | 19:48:56.663 | March 26, 2025, 04:49:36 |
| display | `https://www.w3.org/TR/css-display-3/` | 79,132 / 581,657 | 19:48:56.967 | June 5, 2026, 06:15:05 |

Each target directory preserves `response.body`, `response.json`, wire bytes/
headers, `CAPTURE.json`, its GET lock, parse lock, and `EXTRACTED.json`.

| Target | Decoded-body SHA-256 | EXTRACTED.json SHA-256 |
| --- | --- | --- |
| flexbox | `b0e3b097bc6db0688d4712968c290cda280f8f750eb998bc358c28df490ff3f5` | `5043e216ab326d326e46ee46e869896a6af2be49a10ed9a38b6f9e015bff2b55` |
| grid | `53a47980a217f0b976e1ab8fa0b56944421f7e6311deef96a6aa591ddc693317` | `fea14da09b8955eebdefaf6c20bf01ed79517ce6c0554c336967a5f189ee416e` |
| display | `872cdd7c49fdbfba1ff7ea5b6689145c168b17d09542f11af717a55bc16ab9ed` | `c494ab5c50b840ffa22aed79de052d50c89c2d1e34289fb344b8d8af4ca65461` |

The three immutable extraction/failure JSON files total **34,632 bytes**:
3,470 / 12,607 / 18,555 respectively. Grid retains four samples and 12 unfollowed
references; Display retains six samples and 14 unfollowed references. All retained
sample texts are untruncated, but this does **not** mean the selection is complete.

## Substantive findings and missing semantics

- **Grid applicability, directly supported:** native node 3605 under
  `grid-containers` says float and clear have no effect on a grid item, while float
  still affects computed display on grid-container children because that
  computation occurs before determining grid items. This supports distinguishing
  item-level layout applicability from earlier computed-value/box-generation work.
- **Related Grid context:** node 3573 describes an independent grid formatting
  context that excludes outside floats. Node 3648 describes floated or absolutely
  positioned inline-grid elements computing to grid. The latter concerns the
  container element, not a blanket permission to float grid items.
- **Display blockification, directly supported:** node 6587 under
  `transformations` states that floating or absolute positioning blockifies a
  box's display type. Native flow-model/glossary descriptions at nodes 4555,
  8308, and 8413 give supporting formatting-context information; they are not
  independent proof of flex-item applicability or unusual-element unboxing.
- **Flexbox remains missing:** the sole parse failed with
  `AgentBrowserError`, code `resource-limit`, message
  `Document node limit exceeded`, at the configured 30,000-node boundary.
  It produced zero semantic samples. The parser had already closed the partial
  document when the failure receipt observed zero remaining nodes; zero is a
  cleanup result, not the peak allocation at the failure. The complete captured
  body is retained, but its raw bytes are not claimed as extracted Flexbox rules.
- **Display contents/unusual-element rules remain missing:** Display's selection
  recorded 104 output-allocation omissions and two duplicate/overlap omissions.
  Its generic glossary selection consumed space ahead of the intended contents
  material. Node 5955 is a test-link label, and node 480 is a table-of-contents
  label; neither establishes box suppression or unusual/replaced-element
  qualifications. The classifier's `contents-box-suppression` tag on node 480 is
  only a selection label, not semantic evidence. Grid node 4148 is likewise a
  short example/link label and is not used as a substantive rule.

No second parse, narrowed input, additional fetch, or manufactured complete
source result was used to fill these gaps. CSS2 and other linked definitions
remain unfollowed. This report supplies source evidence for Main's review, not
implementation correctness, rendered-site acceptance, or conformance proof.

## Execution, isolation, and verification

Approved runtime: **native15522**, commit
`43060222e28db7abb3259b0ad50d230f359705c6`, from
`native-html-cell-spacing-september12-round00/snapshot01/dist`.
Before/after checks verified **11 snapshot inputs, 14 actual Git objects,
1,184 source files, 1,996 compiled files, and 20 gate receipts**.
Existing 15,522 passed / 0 failed / 2 excluded counts were checked, not rerun.
Source inventory SHA-256:
`9de0b7be99c8a865e5ed685746367ee0b839e184053a82e6faf8b951fc11eb4c`;
compiled inventory SHA-256:
`fca133ee16cbc500f3a40f3cd51eb1782ea698f53d70d228ce9c0f33725e2d7c`.

- Before integrity: `2026-09-12T19:48:50.539Z`; after: `19:52:48.069Z`.
- Live supervisor: `19:48:56.121140Z`–`19:48:56.974777Z`; three requests,
  no redirects, no retry, and start spacing approximately 337.753 / 303.735 ms.
- Flexbox parse: `19:51:50.601Z`–`19:51:50.799Z`, expected retained exit 1.
- Grid parse: `19:51:50.928Z`–`19:51:51.136Z`, exit 0, 20,416 nodes.
- Display parse: `19:51:51.267Z`–`19:51:51.458Z`, exit 0, 12,037 nodes.

Both successful parses report `independent-html-subset`, `partial: true`,
`scripting: false`, and six `script-not-executed` issues. Grid/Display selection
used 53,625 / 31,953 debits; query lastWork was 61 each. Enclosing native heading
spans and exact native-text hashes are retained. Text-source occurrence anchors
are explicitly not a complete paragraph-to-token map. Verification checks those
source spans/hashes without reparsing.

Limits stayed at 2 MiB each encoded/decoded body, 8 MiB total (conservatively
counting encoded plus decoded), one concurrent request, 250 ms pacing, 45 seconds
plus five-second grace, 6 MiB output/file, 16 MiB lane, and 64 MiB free. Actual
combined response bytes were **3,435,818**. Each parse had 30,000 nodes, depth 256,
2 MiB text, 2M selection work, 100k query work, and 16 samples. Fixed 20,000-byte/
20-reference per-target allocations kept the total under 64 KiB / 64 references.

Pinned Node 22.22.0 and the original native DNS/public-address/TLS checks were
used with AgentBrowser/0.1, omitted credentials, and no cookie/auth request
headers. Server-set cookies were preserved only in private response evidence;
none were accepted or replayed. Actual readonly Git ran outside syscall denial;
all parses/checks used the existing kernel socket denial. Transport/cookie/query/
document owners closed, no child group remained, and private HOME/TMPDIR stayed
empty. No resources, scripts, SafeJS, providers, devices/TTY, socket probe, or
protected heading payload was exercised.

**Retained setup failure:** the first extraction launcher used a Python string
method unavailable in this environment. Each mode failed before a parse lock or
child existed. `SETUP-FAILURE.md` preserves the errors; original `run.py` remains
unchanged. Separate `offline-run.py` corrected only that compatibility issue
before the one real parse per target. No consumed capture or parse was retried.

`verify.mjs` verifies success **and** the exact retained Flexbox failure, source
and extraction hashes, caps, cleanup, and before/after release identity.
`RECEIPTS.sha256` and `SEAL.json` pin this report and the new lane once; the seal
is hashes plus owner-read-only permissions, not filesystem-level immutability.
Main independently verifies and commits documentation.
