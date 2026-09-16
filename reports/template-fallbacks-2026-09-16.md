# Template no-script source fallback recovery — September 16, 2026

## Result

The research reader retains meaningful noscript HTML inside eligible omitted
templates as bounded **sourceTemplateFallbacks document-source metadata**. MDN's
captured Promise compatibility notice is recovered exactly. It remains absent
from ordinary Markdown because this does not activate/render templates or
implement declarative shadow DOM. The captured source supplies no support matrix.
No support values or working compatibility-widget claim are invented.

SOURCE-TEMPLATE-FALLBACKS.md specifies eligibility, source offsets, hidden-content
exclusions, immutable snapshots and bounds:8192 UTF16 units per inner HTML entry,
16 entries,32768 serialized UTF8 metadata bytes. Hidden/forbidden descendants
invalidate the whole entry instead of splicing HTML. Metadata fits after ordinary
output and all existing optional fields. Document-source scope is explicit even
with a selected heading/subtree. It does not influence content-success or challenge
classification. The source strings are data, not executable instructions.

## Candidate and native gates

- Base HEAD: 0fe8de1199ebb7d93f09aaa1aa7f20f102fea859; final candidate release02 at /tmp/agent-browser-template-fallbacks-JoXD4F/candidate-release02.
- All1537 source/config/test inputs and2316 compiled artifacts match pinned
  manifests. The five root-workspace overlays match the candidate. Comparison
  with the prior runtime:2304 compiled files unchanged,8 changed,4 added,0 removed.
- **3,316 passed/0 failed across38 selected native files**,20.5559 seconds in the
  final recorded run. New cases:96 helper plus102 reader/extraction integration.
  Build, selected-test types, formatting and lint all exit0.
- Native manifest has952 canonical entries; the workspace has955 because three
  unrelated pre-existing entries are preserved. This is not a full-manifest pass.
- Pre-feature reader/extractor with the new helper and exact final102-case
  integration test records41 passed/61 failed. This is a regression demonstration,
  not an unchanged baseline checkout or a final candidate failure.
- Initial release01 native/build/types/format passed, but lint rejected two test
  string concatenations. Release02 changes only those to equivalent template
  literals. Initial evidence remains intact. Recorded durations are observations,
  not evidence of a speed improvement.

## Differential source coverage

**114 saved bodies** were replayed through old and new native implementations:
111 successful extraction pairs and3 matching non-HTML failures. For all111,
complete prior extraction—including Markdown, reader counters and prior source
metadata—matches after excluding only the new field and normalizing DOM reference
identity. No DOM mutation/projection is used. Content predicates, diagnostic text
and challenge classifications also match. All returned documents close.

Only the MDN Promise capture gains metadata, with one entry:

- Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
- Body SHA256:67ce22318a16b3305b8d0fe5f34f37d1d7c5e47c7251af4f7de5dd9256f94714.
- Outer template opening offset:138867; noscript opening offset:139267, both
  LF-normalized UTF16 offsets. Retained template attribute:shadowrootmode=open.
- Exact inner source: Enable JavaScript to view this browser compatibility table.
- Original40555-byte Markdown, including the previously recovered image-role
  warnings, is unchanged. This does not change the historical MDN/page verdict.

The other113 inputs gain no template metadata, including the three unchanged
non-HTML failures. These are saved-response checks, **zero new live requests**.
Historical100-entry measurements remain unchanged.

## CLI and independent verification

Three actual compiled native research-browser CLI invocations replay the saved
Python asyncio, MDN Promise and GitHub repository responses. Each uses one native
routed response with kernel network denial and the JavaScript guard, empty isolated
HOME/TMP and no credentials/scripts/alternate browser. Previous complete extraction
objects match exactly after omitting only the new field, which matches the full
corpus replay. Native transport closes with zero active requests.

Those equalities preserve the prior independently checked53 distinct code blocks
(34 Python,18 MDN,1 GitHub); code examples were not executed. A separate Python
standard-library HTMLParser audit independently matches this MDN source's exact
inner HTML, template attributes and both normalized offsets to the new metadata.
It confirms the notice is not promoted into ordinary Markdown. Its first attempt
failed because its helper method collided with HTMLParser's offset attribute;
the separate corrected attempt passes. Both runs are preserved, with no production
change or new request attributed to the verifier correction. This Python audit
uses kernel denial, not a claim of a JavaScript guard inside Python.

Independent static review of release01 found **no blockers** after checking all
1537 snapshot hashes before/after. All three production files are byte-identical
in final release02; only the two test concatenations differ. The reviewer did not
execute tests/probes. Review fixtures and coverage limitations are retained in
review.md/JSON and REVIEW-APPLICABILITY.json.

## Evidence and open work

Evidence directory: /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/template-fallbacks-september16

Sealed at 2026-09-16T16:22:15.262Z: 127 files,11783842 bytes; ARTIFACTS.json SHA256:
714355faa3ddeea545953c0647746b30775b2caf609e12d414fe5b47f8f80358. The inventory excludes itself and SEALED.json. Both
subagents are closed. All17 recorded validation process groups are absent at audit,
including expected red/failing attempts, with no timeout or termination signals.
All19 pinned helper/input paths checked by the audit match. Native/probe HOME/TMP
directories are empty; quality-run TMP emptiness is not claimed.

Preserve42 prior dirty tracked files and697 prior untracked files. The focused
commit adds only this feature and its evidence; no push is performed. Broader62
failures across26 files,22 missing committed tests, actual SafeJS, rendering,
credentials, passkeys, devices, TTY and restricted-site handoffs remain open.
Rendered template content, JavaScript-dependent sites, access barriers and overall
performance/functionality still require work; the browser goal remains active.
