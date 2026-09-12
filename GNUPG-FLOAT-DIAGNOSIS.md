# GnuPG float integration: source-only diagnosis

After the failed live GnuPG flow, a separate native source-only check identifies
seven inline-block formatting nodes that meet the float coordinator's explicit
unsupported-combination predicate. The first is the navigation list item `e48`,
formatting node16, with `kind=block`, `level=inline`, `display=inline-block` and
`contentMode=inline`. The next sampled list items are `e81`, `e104` and `e137`.
These are source-tree observations, not a second website interaction.

The relevant production boundary is `acceptedFormatting` in `src/float-document.ts`:
it rejects any atomic inline node, or flex/grid/table content mode, in the float
formatting tree before coordinated layout. The captured stylesheet contains
inline-block navigation items alongside floated footer content. This narrows the
next fixture to a real unsupported combination; deleting the guard alone would
not supply the missing sizing, text wrapping and reflow coordination.

## Scope and actual differences

Exactly one source-tree formatting build uses the original captured HTML and CSS
with the pinned1478cd7/11901 compiled native parser, styles and formatting modules.
The stylesheet is attached through `DocumentStyles.setExternalSheet` at its actual
link node and URL. The source bytes and default1280×720 viewport are unchanged.
There is no BrowserSession, loader, transport, mock, navigation, click, geometry
call, image load/decoding or new HTTP request.

The check runs September12,2026,05:29:10.258–05:29:10.297 UTC under strict kernel
socket denial, JS network/process/runtime guards, explicit environment and private
HOME/TMP, with a45-second limit and bounded output. No credentials, providers,
devices, TTY, realSafeJS or bypass are involved. The parsed document closes.

Unlike the original live flow, images are not loaded. **Do not equate its census
with the live page:** it has279 formatting nodes,285 boxes,244 visited DOM nodes,
work3892 and two deferred element guards. The live page has277 nodes,283 boxes,
work3712 and no deferred subtree. Both retain nine float and eight clear guards;
the source check also retains the same raw CSS13/43/2 and applicable3/14/2 counts
(invalid values / unsupported properties / unsupported selectors).

HTML SHA256:
`cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438`.
CSS SHA256:
`48233e2b7bd1f22cca5f901465a95ff7fb8d9bb80f862378d8530b2fa422863b`.
Probe SHA256:
`0bef5fe32280c617d2e3296b990b3eff363fdcbb82270ed642c2023a86b25bce`.
Output and supervisor receipt:
`node_modules/.cache/native-validation/css-rule-work-september12/gnupg-source-probe`.

Next work should first minimize the inline-block navigation plus floated sibling
case, then coordinate bounded atomic sizing/baselines and float-aware wrapping,
checking geometry, raster, physical hits, mutations and cleanup. Non-floating
clearance and flex/grid/table combinations remain separate requirements. Even a
successful minimized case would not remove the site's independent CSS guards;
the real captured flow would still need a newly scoped released-runtime check.
