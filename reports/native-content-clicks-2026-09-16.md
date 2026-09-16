# Full-source native click limits and 100-entry audit

## Result and scope

The existing100-entry corpus is complete:100 distinct attempted URLs,100 native
outcomes and linked reviews,100 matching CSV rows. A fresh offline audit performs
5205 passing checks, rehashes1700 files in two historical sealed ledgers and
reproduces the selection from five saved source tables. Original totals remain
100 navigations,108GETs including redirects,96 complete captures and zero retries.
Original review counts remain33 useful,19 navigation-only,23 consent/access,
3 login-required,6 empty,8 HTTP errors,2 transport failures and6 other failures.
This audit does not re-review content or make new website requests.

The original live interval is September16,2026,00:24:27.995–00:25:44.308563UTC,
on runtime `ebdaf316c161bb6747fdf1fa42b0ba05c488bc5b`. All100 URLs, individual
verdicts and evidence notes are in `reports/agent-citation-revalidation-v2.md`;
JSON and CSV remain beside it and unchanged. The list is a reproducible proxy
from five commercial US/all-topics Ahrefs citation-domain tables,250 rows and
113 hosts, selecting100 by appearances/rank sum/hostname. It is not measured
worldwide agent-page traffic or a sample of the deep pages actually cited;
there are no dedicated ChatGPT or Claude source tables. A superseded historical
scope says six source successes; the final frozen decision correctly uses five.

## New full-source workflow fixtures

Current pinned runtime: `6bbaf6d779a6d3c29995369acb1d93d40d694da0`.
All1514 committed runtime/source/config inputs match the prior clean build.
No root dirty runtime or alternate browser is used. These are **offline** tests
of saved native response bodies, using the full inert native HTML parser for
the initial page and intending actual `BrowserSession.click`, not reader-DOM
activation or manually supplied destination navigation.

| Source page | Intended source-discovered destination | Reached stage | Native failure |
| --- | --- | --- | --- |
| Home Depot root | First eligible source product-title anchor; never selected | Initial navigation | CSS source text limit exceeded |
| Wikipedia Main_Page | Grace_Coolidge article | Native click | Unsupported formatting:2 unloaded external stylesheets,20 unsupported element-layout issues,2 presentation-hint issues |
| CNET root | tech/computing/visiting-shenzhen-chinas-silicon-valley/ | Native click | SVG scene: clip reference node limit exceeded |

Home Depot uses proof01 with default document-source admission. The final
Wikipedia/CNET proof04 uses explicit long-v1 response/document bounds but
unchanged default CSS limits. Each final workflow issues only one **fixture**
request and produces zero click events; no synthetic destination is reached.
Both title selectors match exactly once and the selected source hrefs pass the
same-origin HTTPS/content-path policy. Their native actionability records do not
show an initial hidden/inert/disabled rejection, but subsequent layout/geometry
checks still fail. That is not evidence of rendered visibility or successful
activation. No styles or hidden attributes are removed, no click is forced and
no budget is silently increased.

The source-only sidecar independently checks Wikipedia's featured-article title
and CNET's article-heading link against the saved bytes, exact attributes,
ancestors, base URL, alternatives and forbidden action paths. Its19 synthetic
rejections are not native runtime tests. Raw-source availability is not live
availability or permission to ignore an access barrier.

Earlier successful Wikipedia native activation in
`reports/native-link-activation-2026-09-16.md` used `loadResearchDocument` for the
initial page. It is not a full-source-parser control. These new failures do not
prove a regression from that different DOM/loader, and neither report is changed
to imply otherwise. The full-source fixtures use older saved homepage bodies;
they do not establish current website behavior.

## Validation and live admission

- Fresh698pass/0 in7 files explicitly selected from committed `native-tests.json`:
  click-actionability,session,opacity-click,extraction-content-focus,
  research-content-focus,research-inline-visibility and network.
- Reused build/types/format/lint results are unchanged clean-runtime evidence,
  not fresh quality-command executions. No full937-file manifest claim.
- 78 separate exported-policy assertions pass under kernel-denied network,
  including normal exactGETs, source link rules, unsafe hrefs, credential/body/
  identity rejection, duplicate/unsafe anchors, base changes and failed-proof
  rejection. These are local harness assertions, not new native tests.
- All completed workflow children have observed absent processes/groups, clean
  native session/transport/document closure and empty HOME/TMP. Their offline
  guards record no attempted IO. The standalone selector diagnostic returns0
  with empty guard attempts, but its simpler runner does not separately record
  process-group absence; do not generalize the stronger supervisor claim to it.
- Proof04 failures are mechanically rejected by `validateOffline` before live
  approval/claim. No live approval, claim or workflow directory is created.
  No new website/socket/SafeJS/credential/passkey/real-TTY probe is made by this
   follow-up; native unit tests do not establish those separate gates.

## Preserved harness failures

1. Preparation verified preservation/runtime pins but initially named a
   non-manifest test file. It stopped before tests; the corrected seven-file
   list produces the698 passing run. This is not a browser test failure.
2. Offline02's supervisor used a16000000-byte file hard limit; the kernel guard
   required16777216 and stopped before Node launched. No runtime/live request.
3. Filename migration for03 accidentally changed the URL policy's Unicode
   whitespace bound from0020 to0030, rejecting slash characters. A separate
   guarded native-parser diagnostic shows both selectors match uniquely.04 is
   regenerated from02 with digit-bounded version replacement and the correct
  16777216-byte file cap. The03 files/results remain intact, not relabeled.

## Next work, not completed fixes

CNET's stack reaches `src/svg-scene.ts` clip-reference indexing. The current
implementation walks the entire document to build its first-ID map and imposes
the4096-node/64-depth SVG index cap on that walk. Investigate a lazy bounded
prefix index that can stop after the requested first ID, preserving document
order, duplicates, namespaces, depth/source/node/work accounting, missing-ID
failures and mutation invalidation. This report does not implement it or claim
that it will resolve every later layout blocker.

Home Depot's CSS budget and Wikipedia's unsupported formatting need separate
work. Do not suppress either error to manufacture a click pass. Public source
content extraction and separately labeled source-linked navigation remain
distinct from full-page scrolling/hit testing. Authentication, challenge handoff,
dynamic content, SafeJS, credentials/passkeys and real-input acceptance remain
open. Overall browser goal remains active; no production change or push here.

## Evidence

Local lane: `node_modules/.cache/native-validation/native-content-clicks-september16`.
The companion JSON pins the runtime, fresh native run, corpus/source audits,
final and failed workflows, policy assertions and helper review. Captured source
bodies retain their original paths/hashes; no full page content is redistributed
here. Hashes establish local consistency, not independent external authenticity.
