# Source-linked content pages — September 15, 2026

## What ran

Followed eight exact links from native-captured homepages into public article,
reference, definition and product pages. Every target retains its parent extraction
hash and exact observed link. This is a purposive content-page sample, **not a
new top100 ranking, a census of agent usage, or complete-site acceptance**.

**9 fresh native navigations / 9 GETs / no redirects or automatic retries.**
The extra ninth navigation is a separately scoped Home Depot Accept contrast,
not a hidden retry. The original eight ran at16:49UTC and the contrast at16:51UTC.
Seven responses are HTTP200 with identifiable prose/definitions. The two Home
Depot responses are HTTP403/error content. Nonempty text is not a success verdict.

Runtime commit: `aae29eac2770b10236162ab37270c6988bbddad0`. All 1472
committed source/config files match the pinned clean release02 build. The904-entry
native manifest matches semantically, with historical indentation preserved in
the repo. Previous3530pass/4baselinefailures and the existing snapshot-test type
error are reused evidence, **not a newly executed all-green native gate**.

All fresh navigations use the standalone native reader with explicit raw,
inline-hidden, MIME and main-content-focus policies, Markdown output and body
capture. They retain the2MB response/256KB extraction limits,5redirect cap,
45second child deadline and192MiB heap. Requests are sequential with2second gaps.
Empty HOME/TMP, no credentials/cookies/profile, page scripts, SafeJS, listener,
TTY, external browser/client, identity spoofing or CAPTCHA solver. Raw selected
response headers agree with captured headers; request/socket/process closure and
all body/receipt hashes verify. No source-page instructions were executed.

## Complete fresh matrix

Counts are emitted Markdown content bytes, not full serialized report bytes.
Row9 intentionally repeats the same product target under the separate contrast.

| # | Exact source-linked URL | HTTP | Outcome | Bytes | Content assessment |
| --- | --- | ---: | --- | ---: | --- |
| 1 | `https://en.wikipedia.org/wiki/Menches` | 200 | extracted-unverified | 85395 | substantive-sampled |
| 2 | `https://www.consumerreports.org/electronics-computers/tvs/best-tvs-of-the-year-a3862868628/` | 200 | extracted-unverified | 17388 | partial-editorial-missing-picks |
| 3 | `https://www.pcmag.com/articles/apples-first-budget-laptop-cost-more-than-two-macbook-neos` | 200 | extracted-unverified | 13431 | substantive-editorial |
| 4 | `https://www.nerdwallet.com/finance/learn/sell-your-stuff` | 200 | extracted-unverified | 18560 | substantive-editorial |
| 5 | `https://dictionary.cambridge.org/dictionary/english/enormous` | 200 | extracted-unverified | 19064 | substantive-definitions |
| 6 | `https://www.cargurus.com/research/2026-BMW-X5-c33915` | 200 | extracted-unverified | 29805 | partial-editorial-hidden-tabs |
| 7 | `https://www.homedepot.com/p/Home-Decorators-Collection-Marsden-Patina-Wood-Finish-3-Drawer-Rattan-Cane-Chest-of-Drawers-38-in-W-x-36-in-H-05-633-543/327654656` | 403 | http-failure | 61 | http-error |
| 8 | `https://scienceinsights.org/how-long-does-an-elephant-live-in-the-wild/` | 200 | extracted-unverified | 2944 | substantive-article-source |
| 9 | `https://www.homedepot.com/p/Home-Decorators-Collection-Marsden-Patina-Wood-Finish-3-Drawer-Rattan-Cane-Chest-of-Drawers-38-in-W-x-36-in-H-05-633-543/327654656` | 403 | http-failure | 61 | http-error |

## Content review

Two independent offline reviewers inspect all eight original outputs. Wikipedia's
long output is sampled; the other seven Markdown files are fully read. Raw HTML is
sampled selectively, with Home Depot's small error body fully inspected. This does
not verify page claims or overall source completeness.

- Wikipedia retains substantial article/reference content but noisy structure.
- Consumer Reports retains introduction/methodology and unrelated recently-tested
  carousel entries, **not its readable headline13 recommended picks**. Saved HTML
  identifies member/component delivery. No login, component execution, member-data
  recovery or recommendation claim is made; carousel models are not relabeled picks.
- PCMag retains a short retrospective, not the text of its embedded archival scan;
  NerdWallet retains a coherent editorial essay, with subscription/related material.
- Cambridge retains actual lexical definitions/examples/phonetics; dictionary UI
  and ancillary material remain. Audio and account features are not exercised.
- CarGurus initially retains one active editorial panel and extensive specifications,
  but misses five supplied inactive panels. Its source-mode recovery is below.
- ScienceInsights retains coherent article prose through its ending. Its scientific
  claims are not independently researched or endorsed.
- Home Depot provides only an error interface; no requested product content.

The JSON records each review's scope and qualifications. All HTTP200 reports keep
`contentSuccess: null`; editorial/manufacturer assertions, prices, product
rankings, specifications, scientific claims and page dates are not verified facts
or buying/financial/medical advice.

## Existing source-mode workflow recovers five tabs

The source-linked CarGurus response has public editorial prose inside five inactive
`role=tabpanel` containers marked`hidden`. The explicit
`source-hidden-inline-v1` policy intentionally drops those subtrees. The existing
default reader, without a visibility policy, admits supplied source text and
explicitly reports`hiddenContentSemantics: false`.

One network-disabled native mocked navigation with the same body/headers/raw/MIME/
focus/table options recovers all five panels. **Markdown increases from29805 to
39331bytes**, without refetch, raised caps or script execution. Native parsed-source
and reader-tree inspection records panel IDs, original hidden state and complete
panel-text hashes; all five are retained in source-mode output and absent from the
filtered output. Classification remains unchanged. The same source body SHA256 is
`766c4211b5f815791ad5b6602fe4e31844ba8a710cf20413e70437b31d65d165`.

This is **a verified existing configuration choice, not a production parser fix,
tab activation or complete/factually validated review**. Source mode can include
hidden interface noise. Keep source-state/visibility provenance explicit and use
the appropriate policy for the task. See`CONTENT-PAGE-WORKFLOWS.md`; no member
rating component or restricted account content is recovered in this experiment.

## Access-friction contrast

The initial Home Depot product response is403 with a short generic error interface,
despite the earlier readable homepage. A later native attempt without Markdown
preference still returns403 and the same61-byte emitted error text. Error HTML body
hashes differ. The contrast observer records Accept`*/*`, User-Agent
`AgentBrowser/0.1`, language`en-US` and native compression support.

The original request's ordinary headers were not recorded, so no missing values
are reconstructed. A single temporal contrast does not isolate causation. Neither
response has an established challenge diagnostic; **HTTP403 is not proof of a
CAPTCHA, and removing Markdown preference did not recover access**. No further
retry, solver, impersonation or authenticated access was attempted.

## Offline fidelity and fragment clarification

Nine captured bodies each run through default/focused mocked native navigation:
**all nine focused outputs match the fresh captures exactly** and all paired
outcomes/classifications agree. Together with source-mode recovery, that is
**19 mocked navigations with zero HTTP requests**. The focused/default byte matrix
and source hashes are in the JSON companion.

The earlier noscript fixture observation is also resolved: the fragment API returns
a detached root. The article exists under that root, while a default document-root
query misses it and extraction correctly rejects a detached reference. Inserting
the returned fragment preserves the article for both recorded scripting states.
No parser defect or fix is claimed. The initial mistaken extraction probe and a
separate pre-child guard-path preparation failure remain recorded.

All **21 actual child groups close**:9live,9paired-replay,1source-mode,1successful
fragment check and1failed fragment check. No SDK/real-TTY/credential/runtime gate
is inferred from these results. Historical reports, the100-page matrix and original
working changes remain unchanged. Overall browser compatibility and access-friction
goals remain active; nothing is pushed.
