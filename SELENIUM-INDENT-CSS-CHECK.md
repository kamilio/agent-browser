# Captured Selenium CSS check after native indentation

## Measured result

A separate offline native check on September12,2026 observes the same six
declarations from the same captured Selenium document. Native raw/applicable
unsupported-property counts each fall from four to three:

| Native owner | Declaration | Current result |
| --- | --- | --- |
| div e136 | text-indent:80% | Accepted as text-indent:80% |
| a e186 | text-transform:capitalize | Still unsupported |
| a e190 | text-transform:lowercase | Still unsupported |
| a e194 | text-transform:uppercase | Still unsupported |

The visibility:hidden and width:10px declarations remain accepted. All original
references, tags, source statements and the other five declaration results match
the prior diagnostic exactly. Seven style owners supply121 CSS code units and
six statements; native scanning reports no scanner issues. This directly checks
the indentation parser fix on captured website content, not a completed page.

## Execution and evidence

Release:0adb8759343ef83a2cca755903d13f33ee51447b, native14032/0/2.
Immutable runtime:native-text-indent-september12-round01/snapshot01/dist/src.
Nine actual Git input blobs are captured outside kernel isolation and compared
with the audited source snapshot. The commit proof, audit, source1165/compiled1976
inventory ledgers and every listed file are verified before/after the check.

Input remains the3123decoded-byte response-1.body in
native-selenium-simple-flow-september12, SHA256
97179c187a27e230036f15ee8615213366ebd1ec8cc93ac70ef8afb8737331f3.
The old diagnostic output is independently pinned to its historical SHA256
3e8239fa91bb12a34815bc00221c8b0e72e6c4983f04ca4b0d84d1c022ca8dad.
Neither original lane/report is edited, retried or relabeled.

Native observation:2026-09-12T16:23:10.903Z–16:23:10.953Z.
Supervisor:16:23:10.777–16:23:10.961UTC, exit0, no signal/error.
One native HTML parse,197nodes at revision198, unchanged through observation.
Selector cleanup is closed with zero cached selectors and indexed nodes.
Output1936bytes, stderr0bytes; output SHA256
4007994851f8d49efede37eb5499e1c354343c9e1c62fd6407787fbe00f77eba.

Kernel socket/socketpair denial, Seccomp2/NoNewPrivs1, zero socket self-probes,
empty private HOME/TMPDIR before/after, sanitized environment and stdin DEVNULL.
Contract, preparation, pin, probe, supervisor and wrapper hashes are captured
before/after and unchanged. Bounds:30seconds,256KiB output,128KiB source,
1024nodes,64owners,8192CSS code units,128statements,512units per statement,
32KiB diagnostic JSON and bounded native selector work.

Private lane:
node_modules/.cache/native-validation/native-selenium-indent-css-diagnostic-september12.
CONTRACT.md, PIN.json, actual-git, scripts and results retain the observation.
The finalized report/lane ledger and read-only verify.mjs can be checked under
the same socket-denial wrapper without importing the page runtime or reparsing.
This is Main's checked execution, not independent implementation review.

## Acceptance limits

Zero new HTTP requests, image hydration, layout attempts, clicks or scripts.
No full-page, navigation, hit/paint, timing-speedup, provider/passkey, device/TTY,
SafeJS or challenge-solving acceptance. In particular the three transformation
issues remain; fixing indentation alone does not make the original click pass.
SELENIUM-SIMPLE-FLOW.md and SELENIUM-SIMPLE-CSS-DIAGNOSTIC.md retain their original
partial/unsupported outcomes. Attempted-host count stays87, not87working sites.
