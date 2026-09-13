# Rounded CSS: unchanged website replays — September 13, 2026

Three captured-site checks use the newly audited native runtime. **There are no
new HTTP requests and no new full-site acceptance passes.** The same source
bytes now produce fewer unsupported-CSS diagnostics because physical rounded
corners have actual style, paint and hit-test support, not because guards or
source declarations were removed. See `ROUNDED-CSS-DOCUMENT.md` for the native
profile and its 184 new regression cases.

## Results

| Captured site and exact scope | Previous cursor runtime | Rounded runtime | Acceptance result |
| --- | --- | --- | --- |
| Python documentation, eight original resources and discovered Tutorial click | 7 unsupported-property occurrences; 30 formatting issues | 4 property occurrences; 27 formatting issues | Tutorial click still unsupported |
| Wikipedia portal, original body and input geometry probe | 85 property occurrences; 187 formatting issues | 65 property occurrences; 167 formatting issues | Input geometry still unsupported |
| kernel.org, original HTML plus two stylesheets, CSS-only attribution | 61 raw / 25 applicable CSS issues | 53 raw / 20 applicable CSS issues | No full-resource geometry/action probe in this scope |

These are diagnostic occurrences, not counts of affected elements or proof of
winning cascade declarations. All other Python/Wikipedia issue counts and
formatting metrics are unchanged. Kernel's complete non-radius property
attribution objects are unchanged.

## Python

One native BrowserSession navigation, two queries, one discovered-link click
attempt and one formatting inspection ran **23:25:23.193–23:25:23.454 UTC**.
All eight original fixtures were used: seven September 11 captures plus the
exact September 13 `basic.css`, totaling 72,064 bytes. Literal `before` mode
and `before-` filenames in the reused harness remain intentional; the new lane
and audited runtime identify this follow-up.

The three radius-property failures disappear. Four unsupported-property
occurrences, one unsupported-value occurrence, and positioning/overflow guards
still prevent the genuine Tutorial click. The raw formatting inspection also
retains eight float, nine display and three clear diagnostics. No direct
destination fallback, skipped resource, CSS rewrite or successful click is
claimed. Formatting remains 669 boxes and 8,965 work.

Lane: `node_modules/.cache/native-validation/native-python-radius-september13`.
The 48-entry evidence ledger SHA-256 is
`66eebc7708235c693ba09cddd024a70a4278aa4d1dbf266801731699c4b23498`.
Process group **1040100** exited zero, was reaped and is independently absent.
Exit zero means the bounded observation completed, not that the click succeeded.

## Wikipedia

One native load, three queries, one formatting inspection, one geometry call and
two generated-style reads ran **23:25:26.213–23:25:26.530 UTC**. The original
119,573-byte portal body is unchanged, SHA-256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.

Twenty radius-property failures disappear. Remaining diagnostics include 65
property, 24 value, eight selector, one at-rule and two media occurrences, plus
the existing layout/direction coordination issues. Input geometry remains
unsupported. There are no actions, rasters, new asset fetches or live navigation.
Formatting remains 2,250 boxes and 20,974 work.

Lane: `node_modules/.cache/native-validation/native-wikipedia-radius-september13`.
The 43-entry evidence ledger SHA-256 is
`b255e812b6377334d9b79d7e5ea3a76bf4bbbaf4e7257a2592ea3c95db276f00`.
Process group **1040178** exited zero, was reaped and is independently absent.

## Kernel CSS attribution

One native CSS-only load and formatting inspection ran
**23:23:50.824–23:23:51.048 UTC**, using original captured homepage response 1
and stylesheet responses 2 and 7. There was no image callback/decode, geometry,
action, raster, script or missing-logo completion.

Eight raw and five applicable radius occurrences disappear. Raw property/value
counts are now **34/15**, applicable counts **12/4**, with the same two at-rule
and two selector issues. Declaration occurrences fall **57→49**. There are 36
attribution records, 114 references, 95 queries, two conservatively charged
selector failures, and 532,436 work. Background-image/position/repeat/size,
shadows, transitions and the other non-radius problems remain.

The copied historical evidence checker initially rejected the new count because
it retained a literal 57-occurrence expectation. That checker is preserved. A
separate follow-up checker verifies the eight/five removed radius occurrences
against the sealed previous attribution and requires every non-radius property
object to remain identical. **The browser was not rerun.**

Lane: `node_modules/.cache/native-validation/native-kernel-radius-attribution-september13`.
The 34-entry evidence ledger SHA-256 is
`0de80a293972ddf94dd5f0dfea565023434b0c781196994aee3d8c0513864605`;
seal SHA-256
`6312c4492c4272109d0a1a5f5a70c2c052e47dc1bfd6a75de87df1514b06647f`.
Process group **1039036** exited zero, was reaped and is independently absent.
The earlier ten-request live attempt remains incomplete because of its local
request-scope limit; this CSS-only replay neither widens nor completes that visit.

## Integrity and outstanding work

All three use `native-radius-integration-september13-round00`, whose selected
native gate passed **21,517 / 0 / 2 unchanged skips**. Before/after runtime,
fixture and executed-framework inventories match. Empty private HOME/TMP and
kernel/JavaScript guards remain in use; cleanup and actual group absence were
checked independently. Historical source paths and measurements are unchanged.

Remaining work includes the Python value/position/overflow blockers, Wikipedia's
remaining CSS/direction/layout profile, full original-resource live flows, and
repeatable varied-site performance measurement. Rounded clone/unequal-height
slices and fieldset-legend interactions remain explicit limitations. These runs
establish neither challenge solving nor credential, provider, passkey/device,
SafeJS or real-TTY acceptance. The requested hardware, benchmark, Astra and
verified Reddit/Poe research remains incomplete. The overall goal stays active.
