# Python captured-page replay after float applicability repair

September 12, 2026, **20:08:17.037–20:08:17.176 UTC**. One new offline native
replay uses committed native15601 `9abc8366c73aaa7976fbded2b1eea57ae64c6d9e`.
The false float-ownership mismatch is gone. **The page still does not pass used
layout or live website acceptance.** Earlier capture/replay reports are unchanged.

## Same page and responses

The original eight fresh Python response records are replayed byte-for-byte
through native `requestWithRoutes`, BrowserSession, document loader and resource
owners. Original URL/status/header entries and all bodies remain unchanged.
Eight memory responses deliver **72,064 decoded bytes; zero wire requests**.
No new fetch supplies missing resources, no alternate browser is used, and no
CSS/DOM modifications or resource substitutions occur.

One document commits with title **3.14.7 Documentation**, 853 native nodes and
revision860, unchanged by one formatting inspection and one layout attempt.
The prior separately scoped diagnostic's three unsupported `py.svg` element
states remain, sharing one 2,041-byte resource and zero decoded pixels. There is
no global image-owner failure. Inspecting this preserved unsupported-image state
is an offline diagnostic allowance, not a successful live navigation or SVG render.

## Measured difference from native15522

| Observation | Before | After |
| --- | --- | --- |
| Float-layout diagnostics | 10 | **8** |
| Actual native float owners | Not separately listed | **8**, all right floats |
| Non-none computed floats without float owners | Not separately listed | e344 left; e730 right |
| First layout error | Float formatting ownership does not match its diagnostics | Document width resolution requires an issue-free supported formatting profile |

All other measured formatting issues are unchanged: six unsupported selectors,
22 unsupported properties, six unsupported values, two inline vertical-align,
nine deferred-display, one positioning, one overflow and one clearance issue.
Styles remain 579 rules and 1,071 declarations from five external sheets and one
import. No remaining guard is suppressed; the new first error does not identify
which of those remaining limitations should be treated as supported.

The repaired ownership invariant is therefore observed on the exact captured
website, not merely on a constructed fixture. This is still a **cached diagnostic**,
not fresh post-fix traffic, successful whole-page geometry, a click flow or
script execution. No aggregate working-website count is increased.

## Isolation and verification

The exact tested runtime comes from
`native-float-applicability-september12-round01/snapshot01/dist`; its six committed
source/manifest inputs, 1,186-source/1,996-compiled inventories and twenty gate
receipts are pinned. The original 280-entry Python capture ledger remains:
`979bd3d6d854abfdb5ed4d290fc2cb304c6a101ec97a722ae18143de7b46ead2`.
The original capture used the older runtime; this report does not change that.

The probe uses kernel socket denial, pinned Node22.22.0 and empty private
HOME/TMPDIR. Existing 12-memory-request, 2MB response, 8MB total, 30-second child,
32KiB semantic output and 64-sample limits remain. No cookies/credentials,
providers, passkey devices, TTY, SafeJS, socket probe or challenge bypass.
Document/image owners close; document nodes, active image/transport work and
session pending loads/queue work are zero. One native commit, zero clicks,
zero cleanup errors. Event/control ownership is not separately instrumented.

Evidence is in
`node_modules/.cache/native-validation/float-applicability-work-september12/python-delta00/`.
Parent `PYTHON-DELTA.md` records the scope. `verify-python-delta.mjs` checks
result/capture/runtime identity, exact before/after diagnostic changes and cleanup
without replaying the page; `PYTHON-DELTA-VERIFICATION.json` and the eleven-entry
receipt ledger retain its outcome. Broader Python/browser gates remain open.

The first read-only verification attempt confused the old report's hash with
the old result artifact's hash. The original verifier is retained as
`verify-python-delta-attempt00.mjs`; the corrected verifier checks the complete
original pinned ledger and its distinct artifact hash. Neither attempt loads
or replays the page, and the original/new native results remain unchanged.
