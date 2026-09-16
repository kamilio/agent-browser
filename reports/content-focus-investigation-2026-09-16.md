# Home Depot: recover content outside a promotional article

## Result and scope

The original100-page run gave Home Depot a navigation-only verdict because
`main-content-v1` selected a153-byte promotional article. **The same complete
captured page contains22 populated product cards outside that article.** Native
replay can retrieve them without another request, page scripts or credentials.

This step improves the documented retrieval workflow and adds8 regression
tests. It does not change production selection heuristics or claim that they
automatically recognize promotional cards. Original reports and their verdicts
remain unchanged; this is saved-body configuration evidence, not fresh website
validation or a global agent-traffic ranking.

| Same-body operation | Markdown bytes | Product destinations | Assessment |
| --- | ---: | ---: | --- |
| `main-content-v1` | 153 | 0 | Promotional card, insufficient homepage content |
| Whole document, no focus | 36201 | 22 | Useful products plus outer navigation/footer |
| Native replay CLI, `--selector '#default-layout'` | 28240 | 22 | Useful products without outer navigation/footer |

The scoped output is an exact substring of the whole-document output. It retains
all66 product-link occurrences and31 dollar-prefixed display lines, including
all22 product destinations, while removing7961 bytes. Those byte counts measure
output size, not browser speed or factual usefulness by themselves. Product
headings, displayed amounts and review-count text supply the substantive evidence.

## Why focus lost the products

The source contains no `main`, one `article` and21 `section` elements. The article
is `article#sbotdBanner`, a daily-deals promotional tile with placeholder slots.
It is nested in a grid column under `div#default-layout`, not around the product
shelf. The shelf is a disjoint sibling populated with ordinary linked headings,
price text and review-count text. It is not solely JSON, script data or image alt
text. An independent offline source reviewer checked all22 cards and the saved
output comparison.

Core `selectContentFocus` implements its stated unique-main, then unique-article,
then document rule. That rule selects the promotional tile here. The broader
successful extractions rule out inability to parse the product text; they do not
justify a universal selector, arbitrary size threshold or rewritten source
markup. Source inspection and explicit replay scope solve this particular task.
Smarter automatic focus remains outstanding.

The browser's source visibility policy is unchanged. The saved reader omits259
source-hidden subtrees and1491 tokens. Stylesheet/offscreen/carousel visibility,
images, current inventory, review authenticity, personalized offers and shopping
actions were not validated. The scoped output still includes promotional links,
category lists and incomplete recommendation widgets. It also omits the footer's
price/stock qualifications, so it is not a complete statement of offer terms.

## Reproduction and evidence

Original URL: `https://www.homedepot.com/`. The original HTTP200 request was
recorded on September16,2026 at00:24:30UTC. Original decoded body:1247687 bytes.

- Receipt SHA-256: `c4cca4067388f48e0774b2d3b542eefb0c0170767ad7830f3443e029f9ac78db`
- Body SHA-256: `b75b1495c0bd39f4881a951bceeef7adb942dd86f2e8ddef865857784a4ad9bc`
- Original/focused Markdown SHA-256: `0228736d7607a49c23569779d2a2f5621a9d1e013380f4a08bcd15c7f20c2cd8`
- Whole-document Markdown SHA-256: `8ce33ca1f47e7f6a4abcd5b7076777098006ed0a6098999c979bdae27acc82df`
- Scoped Markdown SHA-256: `e9e7cf1ee800d087ffb3e2a71c9ac3359d0723d4f085732eed46c9ed193cae99`

`REPLAY-CONTENT-FOCUS.md` documents the native CLI recipe. The actual isolated CLI
invocation, pinned complete receipt, JSONL response and extracted Markdown are
recorded in the private evidence lane's `selector` directory. Scope matched once;
the CLI reported zero network requests and left `contentSuccess: null`.
Independent review supplies the useful-content judgment, not a rewritten receipt.

The replays used the clean committed `53576833ee775aea83294af5cf254cf28e3532ab`
runtime, not dirty root code. Both replay children had kernel-denied network,
empty HOME/TMP, a256MiB heap and60-second supervision; all child groups closed,
guard attempts remained empty and no real TTY was used. The CLI read the pinned
receipt through file stdin. No new live socket, SafeJS or credential gate is
claimed. Complete-source barrier checks and normal replay admission remained on.

## Tests and retained failures

- Baseline:387 passed/0 failed across6 selected manifest files.
- Final:395 passed/0 failed in the same6 files, with8 new synthetic contexts:
  default/long-v1 profiles, JSON/Markdown formats, explicit container/body scopes.
  They verify sibling product recovery, hidden/script omission, selector scope,
  input-pin immutability, no network requests and owned-document/body cleanup.
- Build, selected types, focused formatting and lint all pass. All2288 compiled
  production artifacts are byte-identical to the replay runtime. Only the test
  file changes executable source; no production behavior or manifest entry changes.
- First test attempt:391 passed/4 failed. All failures expected an unescaped
  decimal in serialized Markdown; corrected assertions account for Markdown
  escaping. Original test source and failed results remain retained. These are
  not production failures or red/green evidence of a parser fix.
- The first evidence audit wrongly required empty compiler/formatter HOME/TMP;
  the second wrongly required identical opaque compiler-cache bytes across
  separate builds. Final audit records the exact empty Biome-cache directories
  and two1322060-byte compiler-cache files with independent hashes. TypeScript's
  installed entry shim enables the Node compile cache. Neither cache is replay
  browser state. Failed audit scripts/records and all cache artifacts remain;
  no tests or live requests were repeated because of those audit assumptions.

Private evidence: `node_modules/.cache/native-validation/content-focus-investigation-september16/`.
The JSON sibling pins the inputs, source review, replay/CLI artifacts, native
results and final audit. Raw copyrighted bodies are not added to git. A final
seal covers local artifacts after commit. The full native manifest was not run.

Unrelated work and historical measurements stay intact. No push. Automatic
focus quality, dynamic content/search, challenge handoff, SafeJS callback
admission, credential/passkey and real-input gates remain open; overall goal active.
