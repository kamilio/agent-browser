# Bounded CSS rule capacity — September 11, 2026

Default per-document parsed-rule capacity increases from **4,096 to 8,192**.
This is an explicit, measured admission change, not removal of the rule guard.
The **524,288 source-code-unit, 16,384 declaration-statement and 5,000,000
cascade/query-work ceilings remain unchanged**, as do source storage, sheet,
nesting, network, document, SRI/CORS and actionability limits.

## Evidence for the change

`TESTPAGES-STYLESHEET-FLOW.md` preserves the real navigation failure at the old
rule ceiling. `CSS-BUDGET-DIAGNOSTIC.md` measures the unchanged captured CSS with
the existing native parser, not a regex or a modified stylesheet:

- Original limits stop at counter **4,097**, after **7,026** declaration statements.
  The over-budget rule is not admitted and no rule array is returned.
- A bounded analytical parse completes with **5,929 rules / 9,698 declaration
  statements**, **367,810 code units**, **5,446 retained style rules** and **11,365
  expanded declaration records**. Retained records are not parser budget units.
- That analytical call uses a 32,768 declaration allowance. The production change
  deliberately keeps **16,384**, because the measured count already fits it.
  Other document sheets and inline styles still share aggregate limits.
- Parent verifies all **35** named evidence checks and the sidecar receipt ledger.
  Its two preparation failures remain preserved; only the final child parses CSS.

Unsupported/grouping rules remain charged by the same parser traversal. No rule
filtering, swallowed resource failure or partial stylesheet application is added.
Measured parsing is not full cascade, styling, geometry or website acceptance.

## Native regressions

The original default fails the new 5,000/8,192-rule utility-sheet cases: **51 pass /
2 fail**, UTC **17:32:04.544–17:32:06.175**. The bounded prototype passes **155 / 0**
styles/session cases, UTC **17:35:37.281–17:35:40.087**, with stable input hashes.
Evidence is `native-css-capacity-work-september11` under the private validation
directory. Both attempts remain unchanged.

Regressions verify complete large-sheet cascade results and cache reuse, refusal
above **8,192**, existing independent lower-budget failures, and a real native
checkbox pointer gesture after loading a 5,000-rule integrity-protected sheet.
That synthetic control changes false to true with mousedown, mouseup, click,
input and change events. It is not a claim about the captured site's checkbox.

## Audited build

`native-css-rule-capacity-integration-september11-round01` passes **9,064 native
cases / zero failures / two existing explicit exclusions**, **151 selected
manifest-listed suites / 150 strict roots**. Build, strict and formatting pass;
UTC **17:37:44.910–17:39:56.929**. The unchanged manifest contains 556 entries.

The audited candidate is clean `c28968d` plus only the default-rule change in
`src/styles.ts` and the two scoped test files: **1,024 source/input files /
1,832 compiled files**. Existing unrelated worktree styles/import changes remain
untouched and are excluded from this build and commit, not implicitly certified.
The worktree's two unrelated passkey manifest entries are likewise excluded.

- Source inventory: `f1c3f7af31d8c8b63af20ca4e54ec70060dcc9dfc69592db790002fded2d014b`.
- Compiled inventory: `21a474c3efd9e10bf0ffb39434bf9dd36ace0738a79f8bd0b386004f077c836f`.
- Existing exclusions remain the total-host-object-ceiling case and the stale
  Grid/media-fallback expectation documented in `IMAGE-FALLBACK-INTEGRATION.md`.
  Strict checking retains its existing `src/snapshot.test.ts` omission.

Native guards, socket-denying tool-child seccomp, single-thread execution and
existing time/output caps remain. A separately authorized unchanged-capture
Test Pages replay will test aggregate cascade and controls; this build gate is
not fresh website, credential, device, SafeJS or full browser acceptance.
