# Website test inventory — September 14, third update

**Adds two native standards GETs, not two successful website flows.** The
unchanged Python capture is not rerun in this update. Earlier observations
retain their original paths in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-SECOND-UPDATE.md` and its predecessors.

| Site/scope | Observation on September 14, 2026 UTC | Limit |
| --- | --- | --- |
| `www.w3.org/TR/css-overflow-3/` | 01:29:31: one GET, HTTP 200; 281,370 decoded bytes; one live and one offline native load, 5,854 nodes each; two offline queries, 20 retained sections | Source read only; returned Working Draft, 7 October 2025, not a latest-edition or rendering claim |
| `www.w3.org/TR/cssom-view-1/` | 01:30:06: one GET, HTTP 200; 932,214 decoded bytes; native parsing reached 23,906 nodes, then navigation failed with `Query work limit exceeded` | Not a successful standards read; no edition, semantic extraction, offline load or retry |
| Native raster clipping | Corrected focused run: 858/0/0, including 51 new cases; corrected selected gate: 21,757/0/2 unchanged skips | A rendering primitive, not integrated CSS overflow or a live website test; failed round00 remains preserved |
| `docs.python.org/3/` | No new run; previous original-resource replay still records the Tutorial click blocked by overflow | No new click, navigation, geometry, raster or HTTP evidence |

The new source activity totals **two GETs, two live native parses and one
offline native load**, with no redirects, retries, assets, page scripts,
geometry or raster calls. DOM and transport owners close, all three source
process groups are absent, and empty private HOME/TMP directories are removed.
The source runs use the previously audited sticky runtime; they do not rerun
that historical test gate or use the newer raster candidate.

Evidence is retained without alteration beneath
`node_modules/.cache/native-validation/native-overflow-source-september14/`
and `node_modules/.cache/native-validation/native-cssom-scroll-source-september14/`.
Their `RESULT.json`, `TERMINAL-AND-CLEANUP.json` and `EVIDENCE.sha256` distinguish
the successful source read from the actual stopped-source failure. The parent
rechecks 36 historical/source ledgers containing 25,080 entries without any
new source load or request.

The corrected raster gate runs 01:47:18.445–01:52:20.365 UTC, selecting 425 files
and 424 strict roots from 777 manifest entries; 352 remain unselected. The first
full run records 21,756 passes, one limits-object compatibility failure and two
skips. Separating the new clipping cap restores the existing public object;
the old assertion remains intact. See `RASTER-CLIPPING.md` for evidence paths.

## What the failure suggests

Read-only code review identifies an eager stylesheet-cascade metrics call
during navigation, so zero caller queries does not mean zero internal selector
work. It also identifies a quadratic failing general-sibling selector shape.
There is no recorded offending selector or stack for the W3C failure: the
synthetic optimization under development must not be advertised as a verified
fix for that captured page. No budget is raised and the stopped source is not
reopened under its completed authorization.

The Overflow3 read supplies padding-box scrollports, hidden-versus-clip
distinctions and used root/body propagation, while explicitly retaining the
existing newer clip-preserved computation profile. CSSOM metric/API/event
algorithms and edition remain unverified. Full nested overflow, broader website
flows, repeatable performance, challenge handling, credential/provider/device/
passkey, SafeJS, socket, real-TTY and the unfinished hardware/benchmark/Astra/
verified Reddit-Poe research gates remain open. Overall goal **ACTIVE**.
