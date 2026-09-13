# Website test inventory — September 13, thirty-seventh update

**Native inline-middle layout removes two Python and 29 Wikipedia alignment
guards. Both whole-page flows remain blocked by other requirements.** Original
captured pages are replayed without edits; only the primary-source read is live.

| Scope | Actual result | Not established |
| --- | --- | --- |
| CSS22 visual-formatting-details source | One native GET, HTTP 200; margin-box/parent-x-height rule retained through two native parses | Latest-spec status, reference pixels or rendering conformance |
| Native inline-middle implementation | 55 new cases; 21,097 passed / zero failed / two unchanged skips | Full CSS alignment, all-manifest coverage or separate live/device gates |
| Python original eight-resource page | Alignment guards 2→0; same Tutorial pointer attempt still fails | Successful navigation, fresh Python state or whole-page pixels |
| Wikipedia original portal response | Alignment guards 32→3; total formatting issues 231→202 | Successful input geometry, raster or search submission |

Python's latest replay runs at **20:52:54 UTC**, Wikipedia's at **20:57:04 UTC**
on September 13, 2026. Both use zero HTTP and preserve their original sources,
styles and failures. The Wikipedia comparison spans intervening features and
is not a middle-only A/B. One successful diagnostic exit is not a website pass.

The source GET at **20:40:32 UTC** adds one live request on the already tested
W3C domain, not a new domain or one of the four completed research topics. It
uses normal native User-Agent/TLS without challenge bypass. No credentials,
devices, scripts, alternate browser, resource stripping or semantic fallback.

The native gate selects 412 files / 411 strict roots from 766 manifest entries;
354 remain unselected. Earlier test-oracle failures and the reproduced nested
inline-flex baseline defect remain preserved. Single-run timing/RSS and work
counters do not establish a speedup or repeatable performance acceptance.

Details: `PYTHON-INLINE-MIDDLE-REPLAY-SEPTEMBER-13.md`,
`WIKIPEDIA-INLINE-MIDDLE-REPLAY-SEPTEMBER-13.md`, `INLINE-MIDDLE.md`.
Previous checkpoint: `WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-SIXTH-UPDATE.md`.

Next: identify Wikipedia's three remaining alignment cases natively, and address
real Python/Internet CSS, positioning/overflow and original-asset pointer blockers.
Broader varied-site acceptance, repeatable performance, hardware/benchmark/Astra/
verified Reddit-Poe research and credential/provider/passkey-device/SafeJS/socket/
TTY gates remain open. Overall browser goal: **ACTIVE**.
