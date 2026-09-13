# SQLite native load after SVG clipping

**September 13, 2026: the original SVG image loads and the document commits;
the full initial-load check still fails at native used layout.** This is a
fresh website request, not a retained-body replay or complete website pass.

Runtime: committed `0c2323f9e8c9382afd5912656f96d068d5fe546c`,
`native-svg-clip-september13-round01`, selected native **16,960 passed, zero
failures, two unchanged exclusions**. The runtime gate and original dirty
working tree remain separate. The engine uses no substitute browser.

## Actual Sequence

The native result runs from **2026-09-13T01:14:15.945Z** through
**2026-09-13T01:14:16.968Z**, under a bounded supervisor. Exactly one navigation
to `https://www.sqlite.org/index.html` makes three original same-origin native
GETs, all HTTP 200, with no redirects:

| Resource | Encoded / Decoded Bytes | SHA256 |
| --- | --- | --- |
| `/index.html` | 8,886 / 8,886 | `12ea0901282e7b4794061d085e10d172380ad973bbb58d37ffb530f18b93ac41` |
| `/sqlite.css` | 6,868 / 6,868 | `273c0cab19c9f24614e837e9383e3fa5ca3a4e2a20457a7a1054c0600dc7eb2b` |
| `/images/sqlite370_banner.svg` | 12,707 / 12,707 | `462c4ce8229b585dd6880cd308b121d9de63eb619db05e469598594e80d7b151` |

The 28,461 encoded plus 28,461 decoded bytes total 56,922 combined bytes.
The banner has the same original bytes as the earlier failing acquisition.
It now reaches image-owner `complete`, origin-clean, with natural dimensions
**392×176**, **278,244 decoded bytes** and **3,471,819 decode work**. Integer
natural dimensions are distinct from the fractional intrinsic dimensions and
393×177 pixel storage documented in `SVG-CLIPPING.md`.

One 469-node document commits with title **SQLite Home Page** and nonempty
bounded DOM body text. The inspected body text includes inert script text;
scripts are disabled, so this is not rendered-text or JavaScript acceptance.
One formatting inspection returns 308 formatting nodes, 330 boxes, 274 visited
DOM nodes, 1,191 text code units and 2,860 work. Its exact diagnostic counts are:

| Formatting Diagnostic | Count |
| --- | --- |
| Invalid/unimplemented CSS value | 6 |
| Unimplemented CSS property | 15 |
| Invalid/unimplemented CSS selector | 6 |
| Float layout flag | 11 |
| Overflow layout flag | 1 |
| HTML presentation-hint flag | 2 |

The first actual failure occurs at **01:14:16.915Z**, during the one used-layout
attempt: `AgentBrowserError`, code `unsupported`, message
`Document width resolution requires an issue-free supported formatting profile`.
No used-layout artifact returns. The diagnostic vector is not proof that every
float independently fails: the native layout dispatcher has a float coordinator;
the rejected combined profile still needs declaration-level diagnosis.

Only cleanup follows the failure. There are no clicks, screenshots, second
layouts, alternate URLs, retries, script execution or downstream actions.
`passed`, `scopedInitialStagesPassed` and `websitePassed` remain **false**.

## Scope And Evidence

The four-stage contract is navigation, committed-content inspection, formatting
inspection and used layout. The native `partial:true` capability marker is
recorded rather than converted into a synthetic failure. All actual native
formatting/width guards remain intact; none are waived to make the page pass.

Limits remain 32 bodyless GETs, one concurrent, 250 ms pacing, 2 MiB per response,
8 MiB combined transfer, 45 seconds plus 5 seconds cleanup grace, 6 MiB per
artifact and 16 MiB for the lane. TLS, DNS/public-address, CSP and original
native-loader checks remain in force. The user agent is unchanged; no
credential/cookie reuse, fingerprint spoofing or challenge workaround occurs.

Closed owner observations show no retained tabs, loads, active/queued requests,
document nodes/text, image resources/decoded bytes/waiters or interaction state.
Private HOME/TMP are empty. Session commits (1) and image decode work (3,471,819)
are cumulative activity counters, not retained resources; they are not reset.
Before/after checks verify 1,226 source files, 2,048 compiled artifacts, 19
committed inputs, 22 actual Git objects and 20 native-gate receipts.

Evidence: `node_modules/.cache/native-validation/native-sqlite-clip-september13/`.
The first frozen evidence verifier incorrectly expects those cumulative
counters to be zero; its original `1 !== 0` failure is preserved. The separate
offline `verification01` corrects only those counter checks and passes. All
actual zero-retained-resource, closed-owner, source/compiled/Git, request/body,
first-failure and no-post-failure assertions remain. Its new seal and Main's
independent read-only verification pass at **01:21:31 UTC** without another
website request or decoder call. The ledger covers 289 entries and verifies
266 original files unchanged, including the failed verifier and old handoff.
Verification success means evidence/cleanup consistency, not website success.

| Evidence | SHA256 |
| --- | --- |
| Complete receipt ledger | `5f6ca124d57dcd69ac53ce3e7c0a5c1bf914d95b37e7f61361e360bfcbc5c81e` |
| Seal | `c10c80be960e2421196e7176eda728b3e600b77fe837c243b6c8a4a453a3309b` |
| Correction handoff | `e314eae0d6bb79fec60b0162dda567c180f138b9804d0003b4710f261c0e7606` |

Use `verification01/run.py final-readonly`, not the original failing verifier.
Result SHA256:
`9152f693e198638fbd3fafcca0da61a237d79bf23970167a0ebc3c12a90d22c3`.

This known-host repeat adds no new host to the previously recorded 86-host
inventory in `WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SEVENTEENTH-UPDATE.md`.
That inventory is not a count of working websites. The separate
retained-asset transparency-heuristic failure also remains preserved; neither
this live check nor the native tests relabel it as a passed visual capture.
The next investigation uses separate offline owners and original sealed HTML/
CSS to identify exact compatibility blockers, without changing this live result.
