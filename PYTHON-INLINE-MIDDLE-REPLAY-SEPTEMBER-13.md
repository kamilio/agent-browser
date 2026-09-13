# Python documentation: native inline-middle replay

**The two inline-middle alignment guards are resolved; the genuine Tutorial
click still fails.** Remaining CSS, positioning and overflow restrictions are
not bypassed. This is a native implementation plus unchanged captured-page
replay, not a fresh Python visit or a completed navigation.

## Exact comparison

Both runs use the same eight original resources: seven September 11 captures
and the September 13 `basic.css`, totaling 72,064 decoded bytes. One native
`BrowserSession` homepage navigation loads those fixtures, discovers Tutorial
link `e375`, attempts one actual `session.click`, and performs the unchanged
bounded formatting inspection. No direct destination fallback, source/style
rewrite, omitted resource, alternate browser or fake geometry is used.

Document identity remains 853 nodes, revision 860, title `3.14.7 Documentation`.
That is the captured title, not a claim about the current Python release. The
observed destination remains `https://docs.python.org/3/tutorial/index.html`.

| Observation | Current-runtime baseline | Inline-middle runtime |
| --- | ---: | ---: |
| Inline vertical-alignment guards | 2 | 0 |
| Applicable unsupported CSS properties / values | 8 / 1 | 8 / 1 |
| Unsupported positioning / overflow | 1 / 1 | 1 / 1 |
| Visited DOM nodes / formatting boxes | 576 / 669 | 576 / 669 |
| Formatting text units / deferred subtrees | 4,074 / 9 | 4,074 / 9 |
| Counted formatting work | 8,294 | 8,965 |
| Stylesheet work | 93,886 | 93,886 |
| Actual HTTP requests | 0 | 0 |
| Genuine Tutorial navigation | Failed | Failed |

The previous native attribution identifies the middle-aligned replaced images
as `e283` and `e759`. The new runtime implements their line extents and fragment
placement rather than deleting diagnostics. Independent native fixtures verify
pixels, geometry, hit testing and actionability; this still-blocked full page
does not itself provide successful whole-page layout or raster evidence.

The remaining click error is:

```text
Document width resolution requires an issue-free supported formatting profile: css:unimplemented-css-property (8), css:unimplemented-or-invalid-css-value (1), position-layout-not-supported (1), overflow-layout-not-supported (1)
```

Raw float/display/clear coordination markers remain 8/9/3. They are not each
independent fatal coordinator failures. Earlier attribution identifies remaining
hyphenation/vendor, cursor and border-radius properties, unsupported justification,
the sticky sidebar and overflow wrapper. Those requirements remain open.

## Execution and containment

- Baseline: September 13, 2026, **20:31:59.787–20:32:00.043 UTC**, group 931134.
- After: **20:52:54.145–20:52:54.399 UTC**, group 947595, 45,418 output bytes.
- Both exit zero because observation completes; both have `flowPassed:false`.
- Fixture, action harness, runner and guards remain byte-identical. Only audited
  runtime pins and authorization change. Internal `before` filename prefixes
  are retained for wrapper reuse, not to mislabel a fresh/live observation.
- Eight fixture adapter requests, zero HTTP, no page scripts, SafeJS, credentials,
  devices, real TTY, process escape or challenge bypass. Original limits and
  private empty HOME/TMP remain; queries, documents, images, queues and session
  close. Private directories are removed empty and process groups are absent.
- Source/compiled inventories, fixture bodies/metadata and framework pins match
  before and after. Original historical reports and failed observations remain.

Each run records 0.25s elapsed. Peak RSS is 108.83MiB before and 109.55MiB after.
These single observations are not a repeatable benchmark or speedup; formatting
work increases by 671 to account for alignment ownership validation.

## Runtime and evidence

Implementation commit: `e5bcc24`. Details: `INLINE-MIDDLE.md`.
The final native gate passes **21,097 / 0 / 2 unchanged skips**, with 55 new
cases. Selection is 412 files / 411 strict roots / 766 manifest entries;
354 remain unselected. Source/compiled counts are 1,308/2,128. Native tests do
not establish the separate website or credential/device/SafeJS/socket/TTY gates.

Under `node_modules/.cache/native-validation/`:

- `native-python-middle-baseline-september13/`: unchanged-runtime baseline.
  28-entry ledger `a4c1f09a2f456beb414eab3a79178893c5f2d0e94e96ca2505b06948e3630e30`.
- `native-python-middle-september13/`: implemented-runtime replay.
  28-entry ledger `abefacf7e6b1ccb4201d208996f5c29c811593a6472d4f138512182409029fe4`.
- `inline-middle-work-september13/PYTHON-VERIFICATION.json`: independently
  checked comparison, exact failures, cleanup, resources and immutable pins.
- `native-inline-middle-september13-round00/`: broad native gate/audit.

Previous checkpoint: `PYTHON-UNDERLINE-OFFSET-REPLAY-SEPTEMBER-13.md`.
No new Python HTTP request, completed research topic or full navigation acceptance
is added. Overall browser/functionality/performance/research goal stays ACTIVE.
