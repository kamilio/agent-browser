# Native cursor keyword styling

`cursor` participates in the existing native declaration parser, cascade,
custom-property substitution, CSSOM and computed-style lookup. It is an inherited
presentation hint, not a hit-testing or actionability switch.

## Supported behavior

- All 36 keywords listed in `cssCursorKeywords`, including `auto`, `none`,
  `pointer`, `text`, `wait`, resize directions, grab and zoom variants.
- Initial value `auto`; existing `initial`, `inherit`, `unset`, `revert` and
  `all` processing, with the repository's existing cascade boundaries.
- `DocumentStyles.cursor(id)` and computed-style `cursor` return the computed
  keyword. Mutations, reparenting and stylesheet changes invalidate cached values.
- Generated pseudo-content and generated native controls carry inherited cursor
  metadata. Default `auto` is omitted from optional generated metadata.
- Cursor hints do not change layout, document pixels, pointer targeting, clicking
  or focus. `none`, `not-allowed` and `wait` do not disable an otherwise actionable
  element. Existing `pointer-events`, disabled and inert behavior remains separate.

URL/image cursor lists, hotspots and unknown values remain unsupported; they do
not trigger asset fetches. There is no OS/system cursor rendering or cursor
compositing into document rasters. `interactionStyleCapabilities` explicitly
reports `cursorImages: false` and `systemCursor: false`.

## Validation — September 13, 2026

The same 93 new tests yield 13 passes/80 failures on the prior runtime and all93
passes on the fixed runtime. The 13-file focused selection changes from
593passed/80failed to673passed/0failed, without skips or regressions. It covers
keyword dispatch, inheritance/globals, variables, CSSOM, invalidation, generated
metadata, rejected URL cursors, budgets/closure and unaffected geometry/actions.

The explicit native gate at21:54:05.253–21:59:01.715UTC records **21,262passed,
zero failed and two unchanged skips**,414selected files/413strict roots out of
768manifest entries. Build, strict checking, scoped formatting and input-integrity
checks pass. There are1311source files,2132compiled files and1302unchanged tracked
inputs. The two skips remain the separate host-object ceiling and advisory-media
cases; a native pass is not separate live/device/SafeJS/socket/TTY acceptance.

Evidence under `node_modules/.cache/native-validation/`:

- `cursor-work-september13/FOCUSED-VERIFICATION-00.json`: identical focused tests,
  80 improvements, zero regressions and32verified receipts.
- `native-cursor-september13-round00/AUDIT.json`, SHA-256
  `680b210fe19ca1a90e5ef8eeacc73d5eff08300f7a44ca7d0a6f2798ea3ba953`.
- Its20-entry `RECEIPTS.sha256`, SHA-256
  `fbf9508c3f0a8b95c92b808c6bd9b62b91fe3c593e737f174bf6f223790580b3`.

Static independent review found no concrete high-confidence correctness gap
within its bounded scope; that review did not run tests or establish live results.

Unchanged captured-site replays remove12Wikipedia cursor-property diagnostics
and one Python diagnostic. Both still fail their requested geometry/click flow;
see `CURSOR-WEBSITE-REPLAYS-SEPTEMBER-13.md`. Python style work increases by855
units; there is no performance or whole-site acceptance claim.
