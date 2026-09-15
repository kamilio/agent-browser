# Agent browser implementation tasks

Current objective: improve native-browser performance, speed and functionality
across varied websites, including actively reducing avoidable crawler blocks and
CAPTCHA friction. Request pacing is an initial opt-in measure, not a replacement
for real-site coverage, performance measurements, compatibility work or human
handoff at access restrictions. Those broader outcomes remain unverified.

### September 15: fresh live confirmation of reader and header fixes

- Revisited four previously tested public entry pages with the pinned native
  build at15:57UTC: **4GETs, no redirects/retries, 4closed live child groups**.
  Empty HOME/TMP and no credential headers, page JavaScript, external browser,
  alternate fetch client, identity spoofing, CAPTCHA solver, listener or TTY.
- **Kateminimalist succeeds at source extraction on a fresh HTTP200 response**:
  still525193bytes of HTML declared Markdown; explicit MIME interpretation yields
  34787Markdown bytes without fallback or raised caps. The fresh body hash differs
  from the old capture, while emitted content hash is unchanged. Full Markdown
  review plus sampled source confirms useful storefront text with substantial
  navigation/placeholder noise; offers, inventory, claims and checkout unverified.
- **The Spruce, Serious Eats and Byrdie remain HTTP403 challenge barriers.**
  Observed original `cf-mitigated: challenge` values now survive capture exactly.
  Their source contains managed challenge markup, not publisher content. No
  challenge bypass or successful access is claimed.
- **4additional network-disabled mocked navigations preserve all4 fresh content
  and classification results**, including confirmed header-based barriers.
  All8 child groups are closed; selected-header equality/omissions, body/receipt
  hashes, actual GET/socket closure and offline guards verify. Historical missing
  headers and original100-page measurements remain unchanged.
- Report: `reports/live-reader-header-recheck-2026-09-15.{md,json}`. Reused clean
  runtime commitcdf7e2e after matching1469 committed source/config files and all
  source/compiled hashes. Prior suite3269pass/3baselinefailures was not rerun or
  relabelled as new native acceptance. Preserve42tracked/697untracked originals;
  report-only commit, no push. Broad compatibility, three barriers, SafeJS and
  interaction/passkey acceptance remain outstanding; overall goal stays active.

### September 15: retain bounded challenge and retry header evidence

- New primary summaries retain whole selected Content-Type, Content-Length,
  Content-Encoding, CF-Mitigated and Retry-After fields:16values/160Latin-1-safe
  codeunits per value. Whitespace, duplicates and conflicts survive; invalid or
  oversized fields are omitted completely and identified by the immutable
  `selected-response-headers-v1` marker. Unknown/sensitive headers stay excluded.
- New marker/schema validation preserves legacy three-header/two-value behavior
  for unmarked evidence. Explicit default reports serialize the detached graph
  actually validated; proxy/hook rejection precedes access, and fragment schema
  validation precedes undefined-field pruning. Default emission does not acquire
  long-profile depth/property caps; replay and long-profile caps are unchanged.
  These protections do not enable retries, CAPTCHA solving or content access.
- Adopted the previously unfinished header helper and tests. Production helper
  bytes are unchanged; one test assertion received a formatter-only line wrap,
  with original bytes archived. The existing replay optional-header negatives
  explicitly use legacy unmarked fixtures; new-schema negatives test earlier
  rejection separately. Preserve the remaining697 original untracked files and
  original42 dirty tracked files/residuals; no unrelated work is bundled.
- Final selected suite: **3269 pass /three unchanged pre-existing failures**;
  **271 new passing tests /44 files**. Baseline2998pass/3fail. The broader baseline
  includes two body-capture extraction expectations plus the existing replay-row
  expectation. Build, narrowed types, formatter and lint pass; initial type,
  fixture and formatting failures remain in the private evidence lane.
- **190 saved-body pairs unchanged**:95strict and95explicit-MIME cases, with
  receipt admission and exact retained header/marker checks. Final paired run:
  **380mock navigations/190closed children/zeroHTTP**. One earlier harness child
  stopped on a record-prototype comparison, was reaped, and is preserved as a
  failed attempt, not a passing case; including it totals381mocks/191closed groups.
- **Historical loss remains explicit:**17 old receipts cite confirmed Cloudflare
  header evidence but omit that header; three lose their barrier category from
  saved headers alone (The Spruce, Serious Eats, Byrdie). No original values were
  fabricated or captures rewritten. Five missing bodies remain unavailable.
- Documentation: `RESEARCH-HEADERS.md`;95-row evidence report in
  `reports/research-headers-2026-09-15.{md,json}`. Canonical native manifest901;
  working904 retains the original three working-only entries. No new live,
  credential, socket/TTY or SafeJS acceptance claim; overall goal remains active.

### September 15: explicit interpretation of Markdown-labelled HTML

- Added opt-in `--reader-mime-policy markdown-html-document-v1` and matching
  research API/loader support. Only default-profile, single-declared Markdown
  with a bounded HTML5 doctype/root/head-or-body prefix is interpreted. Original
  decoding, response headers/body hashes and resource caps remain unchanged;
  the existing inert sanitizer/parser performs extraction without execution.
- Genuine Markdown, fenced/indented examples, prose, YAML frontmatter, fragments
  and other MIME types retain existing behavior. Complete unfenced HTML examples
  remain ambiguous; explicit opt-in and interpretation provenance are required.
  Source-hidden prechecks inspect unfiltered interpreted HTML. Classification
  discloses `reader-mime-interpretation`, not fabricated transport evidence.
- Ordinary validated capture replay checks declarations, regenerates the prefix
  from original bytes and rejects contradictions. Literal line operations reject
  interpreted HTML. **Captured output-limit recovery remains declared-HTML-only**;
  this change does not expand its admission gate or enable automatic fallback.
- Final selected suite: **2632 pass / one unchanged pre-existing failure**, with
  **263 new passing tests / 35 files**. Build, narrowed types, formatting and lint
  pass. Baseline2369pass/1fail; the replay-row-flag failure stays visible. Initial
  type/lint and new fixture assertion failures remain in the evidence lane.
- Saved-body validation: **95 default cases unchanged, 94 explicit-policy cases
  unchanged; one corrected extraction**. The captured Kateminimalist response now
  yields **34787 Markdown bytes /38085 serialized bytes**, with original body
  SHA and declared Markdown MIME intact. Prefix68codeunits; no partial fallback,
  cap increase or new request. Sampled output contains storefront categories,
  product/service text and links, but also duplicate navigation and zeroed timer
  placeholders. Current pricing, inventory, scripts and checkout are unverified.
- **285 mocked navigations /190 closed saved-body child groups /zeroHTTP**.
  Five original missing bodies remain failures, not offline passes; original
  live barrier records remain authoritative where capture headers are incomplete.
  Canonical native manifest898entries; original three working-only entries remain.
- Documentation: `RESEARCH-MIME.md`; complete95-row follow-up in
  `reports/research-mime-2026-09-15.{md,json}`. Original100-page sweep and its
  citation-not-traffic caveat remain in the original reports. Preserve42tracked
  and699pre-existing untracked files, including unfinished response-header helpers.
  No new live/socket/TTY/SafeJS/credential acceptance claim and no push.

### September 15: bounded extraction prefixes and MIME diagnosis

- Added explicit `--output-limit-policy text-prefix-v1` for reader Markdown and
  the matching core/API option. Defaults remain strict; fitting results remain
  unchanged. Genuine typed output-size limits can yield an indented plain-text
  prefix with source/retained units, truncation and original trigger metadata.
  Full serialized extraction still fits its existing byte cap; no limit increase,
  hidden/form/script admission change, new request or automatic replay fallback.
- Static review found a final-URL redaction overrun. Isolated negative controls
  confirm256007 bytes for HTML and Markdown; positive-growth reservation brings
  both to256000, with truthful255993-byte internal trigger limits for `?x`.
- Final selected suite: **2156 pass, one unchanged pre-existing failure**, with
  **91 new passing tests / 30 files**. Build, narrowed types, formatter and lint
  pass. Baseline2065pass/1fail; the unrelated replay-row-flag expectation in
  `research-table-rows-cli.test.ts` remains visible, not fixed or excluded.
  Canonical native manifest895 entries; original three working-only entries stay.
- Final saved-source comparison: **95 strict cases unchanged, 94 requested-prefix
  cases unchanged**; one output-limit error yields245353 bytes /255995 serialized
  bytes. Final pairing285 mocked navigations; zeroHTTP. Five missing original
  captures remain untested failures. Prior live barrier classifications remain
  authoritative where stored headers omit Cloudflare evidence.
- **Do not call the Kateminimalist page fixed.** Inspecting that retained prefix
  reveals HTML/script/style source served as `text/markdown`, not useful content.
  A separate diagnostic-only HTML MIME override on the unchanged body yields
  34787 native Markdown bytes without fallback. It is not production sniffing or
  a live acceptance result; product/promotion placeholders remain unverified.
- Next root-cause work: explicit, narrowly validated HTML-as-Markdown recovery
  with controls for real Markdown/code examples and source MIME provenance.
  Preserve unfinished response-header work separately. See `EXTRACTION-PREFIX.md`
  and `reports/extraction-prefix-2026-09-15.{md,json}`. SafeJS, access restrictions,
  credentials/passkeys and interactive acceptance gates remain open; no push.

### September 15: 100 citation-derived agent entry-page checks

- Completed **100/100 fresh native entry-page navigations**, 107 GETs including
  redirects, zero retries; 95 decoded bodies retained and hash-verified. Native
  outcomes: **59 nonempty/unverified, 5 empty, 18 semantic barriers, 12 HTTP
  failures and 6 resource/timeout failures**. Nonempty is not useful-content or
  interactive acceptance. Offline review finds **48 useful source-content
  results**; all100 have individual verdicts and inspection-depth disclosures.
- This is **not a measured global top-100 agent page-visit ranking**. Five
  Ahrefs September2026 citation tables (updated September2) yield113 unique
  hosts; deterministic appearance/rank-sum/hostname ordering selects100 normalized
  publisher-linked HTTPS roots. US/search-backed source sampling, top50 cutoffs,
  equal platform weighting and missing dedicated ChatGPT/Claude lists remain
  explicit limitations. Host citations do not establish which deep pages agents
  visit. Five successful and five404 source acquisitions are separate evidence.
- The clean pinned runtime matches1457 committed source/script/config files.
  All110 experiment children/groups and observed requests/sockets close. No
  page scripts, SafeJS, credentials, form actions, impersonation or challenge
  bypass; prior dirty work and runtime pins are unchanged at postflight.
- Fix candidates: explicit bounded partial output for Kateminimalist's525193-byte
  Markdown response (256KB output cap), bounded handling of oversized Google
  Play/TechRadar/CNBC bodies, and clearer JS/login-shell usefulness reporting.
  Tom's Guide/Comparor timeouts and real403/429/challenge barriers remain failures.
  No caps were raised and no production behavior changes accompany this sweep.
- Reports: `reports/agent-citation-pages-2026-09-15.md` and JSON companion;
  full source ranks/selection in `reports/agent-citation-corpus-2026-09-15.json`.
  The historical human-traffic sweep remains unchanged. Next: deep-page/task
  coverage and fixture-backed fixes; preserve unfinished response-header work
  separately. SafeJS contract, credential/passkey and interaction gates stay open.

### September 15: full saved top-100 reassessment and hidden block recovery

- Reassessed all 90 available top-100 bodies under original and inline-hidden
  reader policies on both builds: **360 in-memory navigations, zero HTTP**.
  Ten missing captures remain unreplayed original failures, not passes.
- Fixed Rakuten's missing list end inside a hidden div with bounded explicit
  block-ancestor closure: inline-hidden extraction recovers **57936 bytes**;
  original-policy 66879 bytes stay identical. The other **179 paired cases**
  retain body outcomes/hashes, diagnostics and source metadata. Source coupon
  placeholders remain; this is not rendered or transactional website acceptance.
- Review exposed document-body/form side effects in the initial new helper.
  Six new negative controls fail on that version; local body/form boundaries
  make the final identical suite pass. Existing direct-matching document-tag/
  form limitations remain documented, not disguised as a full visibility fix.
- Clean native baseline1818/24; final **1945/25**, **127 new tests**. Build,
  narrowed types, formatting, lint and selected tests pass. 1812 original cases
  unchanged; six negative vectors intentionally replaced by still-rejected
  formatting variants. Explicit canonical native manifest now893 entries.
- Preserve first harness policy-spelling failures separately: 83 terminal
  children, not website failures or paired results. Corrected baseline/candidate
  runs have 180 successful children plus one diagnostic; all264 groups close.
  Original source/body/compiled evidence and dirty workspace are preserved.
- Three old header-confirmed challenges (ChatGPT/Canva/Indeed) cannot be faithfully
  reclassified from their stored headers because cf-mitigated was omitted. Their
  original live barrier records remain authoritative. Next: bounded challenge/
  cooldown header retention without clipping conflicts into false evidence.
- Empty-source inspection identifies Roblox catalog and TikTok navigation inert
  JSON as useful next extraction candidates; do not execute bootstrap programs
  or count age-verification state as content. See `HIDDEN-BLOCK-ENDS.md` and
  `reports/top100-reassessment-2026-09-15.{md,json}` for the complete90-site matrix.
  SafeJS, providers/passkeys, interactive/service/TTY, CAPTCHA and broad live
  compatibility remain open. Overall goal stays active; no push.

### September 15: bounded source-backed product tables

- Recovered AMD's source-backed product specifications without running page
  scripts: five tables, 31 rows and 276 formatted fields, including supplied
  units and prefix/suffix qualifiers. The complete 27,409-byte metadata matches
  an independent inventory of the previously captured response.
- Added optional, immutable `sourceDataTables` to research extraction. It is
  explicitly partial document-source data, not rendered content. Schema/input/
  output bounds apply; whole-row metadata fitting preserves the existing body
  budget, including exact-boundary outputs. No raw numeric conversions or
  arbitrary application-state dumping.
- Clean selected native validation: 1,647/21 baseline to **1,722/23 candidate**,
  **75 new tests**, every original case unchanged. Final build, narrowed types,
  formatting, lint and selected tests pass. Initial formatting/lint corrections
  and their evidence remain recorded.
- Both builds passed 26 saved-response/policy cases over 22 original captures;
  all body outcomes/hashes and prior metadata are unchanged. Only AMD gains
  source tables. Independent inventory and replay groups closed with **zero new
  HTTP requests**. This is not a new live sweep or full-manifest acceptance.
- See `SOURCE-DATA-TABLES.md` and
  `reports/source-data-tables-2026-09-15.{md,json}`. The overall goal remains
  active; SafeJS/JavaScript, credentials/passkeys, interactive/service/TTY,
  CAPTCHA and broad website compatibility gates remain open. No push.

### September 15: hardware pages and inline XML content recovery

**PROGRESS; overall browser goal remains ACTIVE.** Four public hardware pages,
four GETs, all 200, no redirects/retries, four verified bodies and closed native
transports/children. NVIDIA yields 37845 Markdown bytes, AMD 42340, Intel 39856.
Framework returns 211555 HTML bytes but originally fails all reader policies.
Its 43-unit XML declaration at normalized offset195463 precedes a footer SVG;
the reader's offset-zero restriction, not decoding or a challenge, causes failure.

Apply the existing strict <=256-unit XML declaration grammar relative to each
token start, omitting it as an inert HTML comment anywhere in markup. No XML mode,
charset override, generic processing instructions, visibility bypass or limit
change. Malformed/overlong input and CDATA still fail; raw/escaped text is intact.

Clean baseline1790/22 files; final1849/23 files, 59 new tests. Build/types/format/
lint/native all pass. Preserve first-candidate type/new-test expectation failures;
corrections affect tests only. 1783 baseline cases match unchanged; seven old
negative vectors intentionally switch newly accepted inline XML to invalid2.0.
Static review finds no production blocker and documents token-accounting caveats.

22 saved responses, 26 policy cases/build: 23 unchanged; all three Framework
policies recover useful CPU/iGPU/memory/product text (18778 bytes for both hidden
policies, 19694 default). Two proof groups close after52 in-memory navigations,
30 successful original replays and14 original-failure replay denials; two other
diagnostic groups also close. Zero offline HTTP; original live failures remain
unchanged. No candidate live retry or speed/CAPTCHA-success claim.

Next content gap: AMD specification rows already exist in saved data-json but are
absent from Markdown. Explore bounded, source-labeled extraction without another
request or execution. Preserve table/footnote/teaser semantics and manufacturer
claim qualifications. SafeJS/provider/passkey, interactive/service/TTY and broader
research remain open. See reports/hardware-reader-2026-09-15.md. No push.

### September 15: isolated SafeJS dependency closure and contract failure

**PROGRESS; overall browser goal remains ACTIVE.** The specific isolated-gate
approval has arrived; this is no longer an authorization wait. Stage the pinned
SafeJS 0.1.599 and its full declared closure outside project resolution: 15
packages, 19 edges, 2686 files, 137923752 extracted bytes. Native transport makes
28 dependency metadata/tarball GETs, all 200, no redirects; requests, sockets and
child groups close. Verify integrity, exact file/link inventories, unchanged
original SDK and canonical browser build. No install scripts or latest claim.

Preserve two zero-HTTP acquisition input failures and three no-SDK host-control
failures. The explicit ABI1 guard with truncation compensation, owned OpenSSL
config and constructible denial wrappers passes its synthetic control. Then run
the approved canonical core fixture exactly once: 11 of 19 checks pass, check12
is interrupted and the retained error is "Sandbox object is already running."
New source evaluation is attempted while a callback's asynchronous tail remains
pending despite its completed prefix. Finally-close may mask the original error;
the exact throw site is unproven. Public SDK docs do not promise this admission
boundary; clarify the supported contract before speculative adapter changes.
The remaining seven core checks and all ten page-extension checks are unrun.
No SDK retry, private SDK mutation, default activation or live scripted browsing.

All actual runtime children/groups close; no runtime HTTP or recorded prohibited
I/O attempts. Independent review identifies launcher reuse gaps: unconditional
exception-safe cleanup, non-assert prerequisite enforcement and complete terminal
failure records. Exact staging inventory is separately audited. This is bounded
fixture evidence, not a hostile-code sandbox or general browser compatibility.

Resolve the public pending-callback/new-evaluation contract without weakening
browser progress expectations; harden the runner before a separately scoped
follow-up gate. Keep diverse-site/content, performance, crawler/CAPTCHA friction,
provider/passkey, interactive/TTY/service and broader research work open. See
reports/safejs-isolated-gate-2026-09-15.md. Prior work preserved; no push.

### September 15: multilingual content and inert leading XML declarations

**PROGRESS; overall browser goal remains ACTIVE.** Four public native navigations,
four GETs, no redirects/retries, four verified captures and closed transports/
children. Japanese Wikipedia returns 18426 Markdown bytes, W3C Ruby Markup 33538,
and French MDN ruby documentation 44962. Aozora returns HTTP 200 / 124623 body
bytes but initially fails the reader. Native metadata sniff/decoding already
selects shift_jis correctly and verifies its Japanese title; the leading XML
declaration, not charset handling, causes rejection under all three policies.

Allow a complete, syntactically bounded <=256-normalized-unit declaration at
offset zero as an omitted HTML comment. No XML mode, external entities/resources,
charset override, general PI support or resource-limit change. Tokenizer issue
and omission accounting remain. Misplaced, malformed and overlong declarations
stay rejected; existing empty processing markers and raw/escaped text are intact.

Clean baseline: 1452 passing tests in 18 explicit files. Final candidate: 1592
in 19 files, 140 new. 1451 baseline cases match unchanged; one negative vector
intentionally moves the newly accepted declaration after a paragraph, retaining
misplaced-declaration rejection. Final build/types/format/lint/native all pass.
Release01's native tests also passed, but two new-test union-content type errors
required a format guard; that failed type gate is retained, production unchanged.
Independent static review finds no actionable issue and qualifies the 256-unit
bound as matcher/acceptance input, not the preceding tokenizer scan.

Eighteen saved responses, 20 policy cases per build: 17 unchanged, all three
Aozora policies recover the same 127443-byte Japanese Markdown with reading
annotations. Three offline child groups close with zero HTTP requests: 40 native
in-memory navigations, 24 successful original-receipt replays, eight denied
original-failure admission checks, and one three-policy decoder/sanitizer probe.
Original live failures stay unchanged; no candidate live retry or speed claim.

Manual review of fourteen short top-100 extractions and three HTTP failures finds
no substantiated new missed barrier; LinkedIn's prior fix is not a new finding.
Do not broaden CAPTCHA detection to login or JavaScript notices on this evidence.
See INERT-XML-DECLARATIONS.md and reports/multilingual-content-2026-09-15.md.
Continue diverse content/research checks; SafeJS/provider/passkey, interactive,
service/TTY and broader research gates remain open. No push; prior work preserved.

### September 15: LLM reference pages and hidden paragraph-end recovery

**PROGRESS; overall browser goal remains ACTIVE.** Four public native navigations,
four GETs, no redirects/retries, four verified captures and closed transports/
children. Hugging Face negotiates Markdown (9863 extraction bytes), MLCommons
provides benchmark methodology (16986), and Apple's research article provides
5498. MLCommons' interactive numerical results remain absent. GitHub returns
HTTP 200 / 643745 body bytes but the source-hidden loader fails; this original
failure receipt is retained, not rewritten as success.

Saved-response diagnosis finds redundant end-p tags after implied paragraph
closure inside GitHub's hidden fallback. Ignore end p only while omitting a
source-hidden subtree and neither visible nor skipped ancestry contains p/svg/
math. Emit nothing, keep both stacks, retain all other mismatch checks and
resource accounting. Do not disable visibility filtering as a fallback.

Clean baseline: 1330 passing tests in 17 explicit files. Candidate: 1426 in 18,
96 new, all baseline outcomes unchanged; build/types/format/lint pass. Independent
source review finds no actionable issue. Fourteen saved responses, 16 policy
cases per build: 14 cases unchanged; both GitHub hidden policies recover useful
build documentation (51435 attribute-hidden / 51421 inline-hidden Markdown bytes).
The default GitHub output stays unchanged at 52904 bytes. Original failed-receipt
ordinary replay remains denied. Three offline child groups close with no network
attempts; 32 in-memory navigations, 18 successful original-receipt replays and six
failed-GitHub admission checks. No candidate live retry or speed claim.

Research notes now distinguish quantization/backend documentation, benchmark
comparability and paper-specific memory claims from verified hardware results.
No buying recommendation or current model/ranking conclusion. See
reports/llm-reference-content-2026-09-15.md and
reports/llm-reference-research-2026-09-15.md. Continue real-page content coverage;
Astra/Twitter, Poe/Reddit, hardware measurements and separate runtime/provider/
interactive gates remain open. Prior top-100 results and work stay unchanged.

### September 15: namespace-only parser reads and measured recovery performance

**PROGRESS; overall browser goal remains ACTIVE.** Baseline CPU profiling of the
saved RFC 9110 recovery identifies avoidable attribute snapshots in namespace-only
parser checks. Add a scalar DocumentTree.namespaceOf read and use it only where
the parser/formatter needs a namespace, preserving attribute-aware foreign-content
logic, mutation semantics and work/node/text limits. No caches or dependencies.

Clean baseline: 1356 passing tests in 22 explicit files. Candidate: 1424 in 24,
68 new, all baseline outcomes unchanged; build/types/format/lint pass. Independent
source review finds no concrete issue. Ten saved-page comparisons preserve every
compared output, reader report, source-alternative hint and original failure.

Five alternating baseline/candidate pairs, fresh guarded processes pinned to one
CPU, measure three captured workloads with 15 timed calls per variant/workload.
RFC section recovery median: 1994.85 to 1584.13 ms (20.59% lower); NumPy full
extraction: 502.93 to 345.78 ms (31.25% lower), all five pairs improve for each.
Julia: 200.03 to 192.11 ms aggregate, but three of five pair medians regress,
including 37.27% more time in one pair; no consistent Julia speedup claimed.
Shared-host activity and sample variability remain explicit. These are offline
processing measurements, not website-network, page-JS or block-rate improvements.

Zero new HTTP requests. All 14 offline child groups close, including the initial
profile probe whose assertion wrongly distinguished equal values by prototype;
that failed attempt is retained. Original RFC full-output failure stays intact.
See PARSER-NAMESPACE-PERFORMANCE.md and
reports/reader-recovery-performance-2026-09-15.md. Continue targeted website
content checks and isolate short-document allocation/JIT variability; SafeJS,
credentials/passkeys, interactive acceptance and broad research gates stay open.

### September 15: scientific documentation and advertised Markdown alternatives

**PROGRESS; overall browser goal remains ACTIVE.** Four public native probes plus
one separately scoped author-advertised Apple Markdown navigation make five GETs,
no retries or redirects, with five verified captures and closed child/transports.
Julia and NumPy provide substantial documentation; Apple's HTML remains a 285-byte
JavaScript notice, while its advertised Markdown URL yields 12844 bytes of literal
documentation. RFC 9110 retains its full-output failure (256604 observed bytes /
256000 limit); offline replay finds 256 headings, truncated, and recovers observed
Idempotent Methods / Retry-After sections (3035 / 1719 bytes), no new requests.

Expose bounded sourceAlternates metadata from head rel=alternate text/markdown
links, preserving eligible links through the semantic reader. No body injection,
automatic fetching, MIME retagging or inferred authorization. Limit entries/head
scan/URLs; reject unsafe syntax and overlong absolute serialization before reader
retention, with final actual-base validation. Keep visibility and runtime defaults.

Clean baseline: 1173 passing native cases in 14 explicit files. Final candidate:
1369 in 16 files, 196 new, baseline outcomes unchanged; build/types/format/lint pass.
Review identified two retention/filtering defects, both corrected and re-reviewed.
Release01's 33 failures were new shared Markdown expectation errors, retained as
evidence; release02 passed 1367 before the final two review regressions were added.
Ten saved-source comparisons preserve visible Markdown and original failures.
Apple HTML gains its authored alternate URL; reader output units change 927 to
1028 and omitted link count 16 to 15. Actual offline CLI replay reproduces the
metadata from the unchanged original receipt. Eight offline proof child groups
(including intermediate release02 checks) close, with zero HTTP requests.

Next: continue diverse content checks, especially large-page recovery and
JavaScript-only shells; measure performance rather than inferring speedups.
Source alternatives are hints, not verified availability or access permission.
Runtime/SafeJS activation, providers/passkeys/devices/TTY, full-release and the
hardware/benchmark/Astra/Poe research gates remain open. Details:
SOURCE-ALTERNATES.md and `reports/scientific-docs-content-2026-09-15.md`.

### September 15: saved-page visibility and noscript challenge fallback

**PROGRESS; overall browser goal remains ACTIVE.** Compare 17 immutable public
captures under default, source-hidden-v1 and source-hidden-inline-v1 policies,
without another website request. GOV.UK drops its whole hidden cookie banner and
contradictory confirmations: 9837 to 6700 Markdown bytes, services content retained.
Office drops inline-hidden configuration (52523 to 26082); NASA loses hidden menu
clutter (48247 to 12590). These are source-filtering observations, not computed
visibility or a blanket default-policy change. No cookie consent action occurred.

The comparison exposes a diagnostic gap: LOC's saved primary-header projection
omits cf-mitigated while its original receipt retains a confirmed challenge.
Supplying only the projected response through a development in-memory transport
previously yielded an HTTP failure without a challenge diagnostic. Add a bounded
fallback pairing exact Just a moment title with Enable JavaScript and cookies to
continue. Report possible/unspecified unless independent provider evidence exists;
keep the original failed receipt fail-closed. No invented header, retry or bypass.

Clean isolated baseline: 1095 passing native cases in 12 explicit files. Candidate:
1218 in 14 files, 123 new, all baseline outcomes unchanged; build/types/format/lint
pass. Independent scoped review has no concrete findings. Final baseline/candidate
proofs perform 102 in-memory navigations, no HTTP requests; 48 non-LOC page/policy
outputs match exactly. GOV.UK's actual offline CLI matches selected API output.
Initial incorrect cookie-button expectation and the diagnostic-triggering run are
retained separately. All five offline proof child groups close and pins remain
unchanged. Historical live captures/results are not rewritten.

Next: use explicit source filtering where hidden UI is unwanted, continue broader
content/interaction checks and measure parser/runtime bottlenecks. Real-site
blocking reductions, JS shells/runtime activation, providers/passkeys/devices/TTY,
full-release acceptance and hardware/benchmark/Astra/Poe research remain open.
Details: NOSCRIPT-CHALLENGE.md and
`reports/content-visibility-evaluation-2026-09-15.md`.

### September 15: paced server cooldowns and three content checks

**PROGRESS; overall browser goal remains ACTIVE.** Opt-in native pacing now
records bounded Retry-After advice from real HTTP 429/503 headers before body
completion, delaying queued exchanges for that origin without retrying. Preserve
longer deadlines, FIFO, cancellation and resource caps; disabled pacing, routed
responses and cache hits retain prior behavior. Cross-transport coordination and
real-server effectiveness are not established.

Clean baseline: 1042 passing selected native cases in 16 files. Owned candidate:
1125 in 18 files, 83 new, with baseline outcomes unchanged and build/types/format/
lint passing. Independent review found no actionable defects in its scoped read.
Three candidate public navigations made three GETs, no retries, all captures and
cleanup verified: GOV.UK 200 / 9837 Markdown bytes; ESA 200 / 18667 bytes; Library
of Congress 403 / challenge, stopped. No 429/503 occurred. GOV.UK exposes hidden,
mutually exclusive cookie confirmations in default extraction; no consent was
given. Next: evaluate explicit source-visibility filtering on that immutable
capture, without another website request or rewriting the original result.

The completed top-100 homepage sweep remains historical: 100 attempts, 197 GETs,
65 nonempty-unverified, 13 empty and 22 other failures/barriers, not 100 working
websites or a verified September traffic ranking. JS/runtime activation, provider/
passkey/device/TTY gates, interaction acceptance, content-quality checks and
hardware/benchmark/Astra/Poe research remain open. Report:
`reports/retry-after-cooldown-2026-09-15.md`.

### September 15: real content pages and authored link labels

**PROGRESS; overall browser goal remains ACTIVE.** Six new content-page
navigations made 8 GETs with no retries; all bodies verified and children /
transports closed. PyTorch's authored versioned link now yields documentation,
not a redirect note. Gutenberg, NASA, Rust and web.dev provide substantial
content; Wikipedia's full extraction retains its 256000-byte output-limit failure.
Pinned replay finds 64 native headings and recovers Training/Architecture/
Evaluation sections (2919/7529/8239 Markdown bytes) without another request.

Real NASA/web.dev captures reveal useful icon-only links losing authored labels.
Preserve bounded anchor aria-label in the reader and expose sourceLabel only as
explicit link-discovery metadata for empty collected labels, with title fallback.
Do not inject invented visible text or change URL-only matching. Both selected
and unfiltered diagnostics include the metadata. Seven sampled source labels
are recovered across NASA/web.dev/Gutenberg; Rust and literal PyTorch controls
retain their behavior. Default Markdown and extraction JSON content match five
saved baselines; changed reader attribute/output accounting is explicit.

Clean isolated selection: 1857/1857 tests, 22 files, 55 new cases; all 1802
baseline statuses unchanged. Build/types/format/lint pass. Final production
review has no actionable findings. Initial formatting/preparation/auxiliary
comparison-envelope errors are retained, not rewritten as successful gates.
Details: SOURCE-LINK-LABELS.md and reports/content-pages-runtime-2026-09-15.md.

Rust's cross-origin redirect timing is consistent with per-origin pacing, not
a production bug; initial scope wording was overbroad. Server Retry-After advice
versus future-request cooldown handling remains an investigation point, not an
implemented fix or authorization to retry blocked sites. Hidden UI, table
associations, complete large-page recovery and full rendered interaction remain
open. No new SafeJS execution authorization received; runtime, providers/passkeys/
devices, real TTY/service, full-release and broader research gates remain open.
No dependency or production-budget increase; no push.

### September 15: bounded Markdown source-link discovery

**PROGRESS; overall browser goal remains ACTIVE.** Reverified all 100 saved
top-site receipts and 90 captured bodies without new requests; historical
65 nonempty/13 empty/7 barrier/3 HTTP/12 other outcomes remain unchanged.
The full matrix is `reports/top100-websites-2026-09-15.md`, using the published
May corpus rather than a claimed current September ranking.

Four fresh native navigations used 7 GETs, no retries, and closed all children
and transports. Mail.ru remains an empty scripted/meta-refresh bootstrap.
PyTorch root/docs/stable return literal source redirect notes; two explicit
source-linked follow-ups still do not constitute documentation retrieval.
The next authored versioned destination was recorded, not fetched in this lane.

Bounded requested Markdown link discovery now exposes source-only candidates
without DOM anchors/refs or automatic navigation. Explicit pinned default-profile
replay --links accepts these captures. Ordinary extraction/HTML discovery and
existing admission/budget/provenance checks remain intact. Four saved controls
prove 1/28/32 Markdown candidates and unchanged RFC HTML discovery; Cloudflare's
entry-cap truncation remains explicit. Details: `MARKDOWN-SOURCE-LINKS.md` and
`reports/source-redirect-runtime-2026-09-15.md`.

Clean isolated selection: 1513/1513 tests, 23 files, 244 new tests; all 1269
baseline statuses unchanged. Build/types/format/lint pass. Initial expectation
and comparison-harness errors are retained. Container-code/autolink/code-span
review fixes have regressions; unsupported tails can suppress to EOF.
This is not a full native release or proof of Markdown challenge detection.

SafeJS 0.1.599 staged artifact/public contract was inspected only, not executed
or claimed latest. Dependency closure and legacy API incompatibility remain;
isolated execution authorization is pending, not granted. Do not change runtime
defaults from static inspection. Live scripting, providers/passkeys/devices,
TTY/service/full-release gates and broader research remain open. No push.

### September 15: content follow-ups and compact replay parity

**PROGRESS; overall browser goal remains ACTIVE.**
Eight additional native page attempts and two explicit source-linked follow-ups:
10 GETs, no redirects/retries, 10 verified captures and clean child closure.
Seven direct nonempty results, Reuters401, Phoronix404 and an arXiv output-cap
failure remain distinct. Follow Phoronix's authored /reviews link to useful
content without relabeling its original404. The arXiv abstract links full HTML;
that captured source fits loading but not whole-page output. Existing offline
recovery finds 130 headings; its observed Pretraining section is recoverable.
Expose existing compactTables in replay/selector/section recovery and CLI,
including tableRows composition and exact 15-argument parsing. Defaults, source
pins, failure provenance, limits, visibility preflight and ownership remain.
Pretraining output is 36,118 bytes normally, 28,448 compact and 24,758 compact
with rows. Actual CLI matches API/direct source extraction; the whole paper
still hits the unchanged cap. Fourteen guarded offline children close without
network attempts; preserved failed helpers and rejection controls are explicit.
All 158 new tests pass; 1,311 selected assertions pass and one stale baseline
row-CLI recovery assertion still fails. All 1,154 baseline statuses match;
build/types/format/lint pass. This is not a full native release. Independent
static review finds no actionable two-file production issue. See
RESEARCH-COMPACT-REPLAY.md and reports/reader-fallback-content-2026-09-15.md.
Static inspection of 22 prior top-100 receipts finds no demonstrated lost
article/data text in its 13 empty results; runtime shells are not manufactured
into passes. Historical evidence, 42 dirty tracked paths and 697 original
untracked files are preserved. No push or wider gate completion is claimed.
Next: bounded large-document reading and source-linked navigation; script-driven
apps, full rendering/interactions, credentials/passkeys and service gates remain.

### September 15: conservative inline source filtering

**PROGRESS; overall browser goal remains ACTIVE.**
Add explicit source-hidden-inline-v1, retaining default and attribute-only v1.
Recognize bounded, simple inline display:none with declaration order/importance;
retain ambiguous CSS, variables, comments, escapes and all shorthands rather than
guessing. Do not compute styles, execute runtime code, infer prices or raise limits.
Preserve the same-budget unfiltered barrier/operation checks, source accounting,
ownership, raw-policy composition and explicit replay/recovery provenance.
Nine saved controls retain exact default/v1 output, reports and normalized DOM/
discovery. Office's two CSS-hidden configuration blocks disappear; selected
Markdown changes 41,839→26,082 bytes and nodes 1,439→1,403 versus v1. Microsoft
price placeholders remain. In-memory Office/PayPal policy captures match API
replay; Office's actual offline CLI also matches. Four guarded children close
cleanly with unchanged pins and zero HTTP requests; these are not fresh live reads.
Recheck all 100 historical top-100 receipts and 90 bodies without rewriting results.
All 1,525 selected native tests pass (189 new; all 1,336 baseline statuses match),
plus build/format/lint. The unchanged snapshot fixture TS2345 remains in broad
types; separate 24-file strict types pass while it stays in native execution.
Three initial test-expectation failures remain recorded; independent static
review finds no actionable production issue. See READER-INLINE-VISIBILITY.md.
No push or full native/runtime/interaction/credential/passkey/service acceptance
is claimed. Next: useful-content recovery, large-document and JS-shell handling;
computed visibility and all wider browser gates remain open.

### September 15: explicit source-hidden filtering and six more pages

**PROGRESS; overall browser goal remains ACTIVE.**
Add opt-in --reader-visibility-policy source-hidden-v1 without changing defaults,
limits or dependencies. Omit explicit hidden/ARIA-hidden source subtrees, not
CSS/inert content. Preserve literal MIME and legacy source accounting; carry
policy through capture, replay, output-limit recovery and truthful notices.
Use a same-budget unfiltered diagnostic tree, including requested selector,
section, outline or link checks, and retain both titles for later classification.
Hidden markers must not erase existing bounded challenge/login evidence. This adds HTML work,
not a speedup or a budget bypass; the temporary tree closes before selected load.
Six new page attempts: five nonempty content results, one Chrome404, seven GETs,
zero retries and six verified captures with clean closure. Nine saved controls
retain exact default output/normalized DOM/discovery. Selected PayPal loses twelve
explicitly hidden intermediate digits; final spans survive and offline CLI/API
agree. Office CSS-only config and Microsoft price placeholders remain unresolved.
All 1,336 selected native tests pass, including 165 new; all 1,171 baseline statuses
match. Build/format/lint pass. One unchanged baseline snapshot fixture type error
remains; a separate 22-file strict check passes while keeping it in native runs.
Review-driven barrier/accounting/metadata fixes, initial failed assertions and
two corrected offline proof assumptions remain recorded. See
the final independent static review alongside the native/live evidence in
READER-SOURCE-VISIBILITY.md. A separate fresh public PayPal policy read returns
HTTP200/11,547 Markdown bytes in one GET; its own offline replay matches. Its body
differs from the older control; no cross-capture equality or offer validity is
claimed. Total new live activity: seven navigations/eight GETs, no retries.
No full native/runtime/interaction/device acceptance, research recommendation
or push is claimed. Wider gates
and the existing large-document/JS-shell/CSS visibility issues remain open.

### September 15: large-document whitespace design checkpoint

**PROGRESS; overall browser goal remains ACTIVE. No production optimization.**
Investigate the previously failed W3 long-profile body as pinned development
input only, not successful source evidence or ordinary failed-capture replay.
The unchanged reader still exceeds 50,000 nodes. Experimental block-gap removal
fits at 49,170 nodes and 230 headings, but static review identifies semantic
risks; a conservative structural/matched-stack rule removes only ten chunks
and still fails. Its early dd/dl mismatch can be a valid optional HTML end,
not a finding that the source is malformed. Six finite offline diagnostics,
zero HTTP requests; final three reproduce with unchanged pins and clean child
closure. No production, limits, defaults or native manifest changes. No new
native-suite/build pass, live success, replay admission or research conclusion
is claimed. See READER-WHITESPACE-CHECKPOINT.md. Next: reviewed bounded parsing
that preserves words, headings, labels and literals; all wider gates remain open.

### September 15: preserve block-linked card structure

**PROGRESS; overall browser goal remains ACTIVE.**
Fix Markdown's unconditional inline treatment of anchors containing block source.
Preserve headings, paragraphs, containers and quote/list prefixes while carrying
sanitized outer destinations to nonempty text groups. Keep literal pre code and
one fallback autolink for code-only source, without inventing empty-link labels.
Ordinary inline paths, true sinks and unsupported table cases stay unchanged.
JSON, DOM, discovery, admission/classification and limits remain unchanged.
Saved BBC output now retains all nine story h2 headings; whole Markdown grows
15,263→17,231 bytes and a selected card 385→604 bytes. Actual replay CLI/API
agree, and card JSON is identical. Seven saved sources retain DOM/discovery,
titles and outcomes; five retain exact Markdown and Chrome's 404 changes only
boundary whitespace on 28 link labels. Original AP barrier replay remains denied.
All 1,177 selected tests across 22 files pass, including 68 new cases; all 1,109
prior statuses match. Build/types/format/lint and independent static review pass.
One new test below the existing byte-limit minimum was corrected without any
production changes. An invalid projected-header AP reinjection assumption is
preserved; corrected checks do not fabricate headers or rewrite its challenge.
Seven offline children, zero network attempts and clean closure/pins. Warm
extraction medians add about 0.260 ms for 500 inline links, 1.051 ms for 250
block cards with larger output, and 0.093 ms for 1,600 plain paragraphs. This is
not a speedup or live-rendering claim. See BLOCK-LINK-CONTENT.md and its JSON
report. Original dirty work and website evidence are preserved. No push.
Next: further useful-content recovery, shell/response-limit diagnostics and
source-backed research. Full rendering/interaction/native release, SafeJS,
credential/passkey-device, service/socket and TTY gates remain open.

### September 15: diverse content coverage and explicit subtree recovery

**PROGRESS; overall browser goal remains ACTIVE.**
Twelve new public content-page attempts using only the frozen native browser:
12 GETs, zero retries, 11 captured bodies, clean transport/process closure.
Five supply useful-looking topic/index content, crates.io supplies only a JS
notice, Chrome returns 404, npm/AP stop at challenges, W3 exceeds response limits,
and PyPI/RFC exceed whole-page extraction limits. Original results stay intact.
PyPI's small description is overwhelmed by file metadata; its inner h1 recovery
also exceeds output limits. Add explicit --recover-output-limit --selector and
recoverResearchOutputLimitSelector for one pinned eligible HTML source subtree.
Default profile, exact output-failure admission, source identities, challenge
checks, uniqueness, existing quotas and cleanup remain unchanged. No automatic
fallback, raised limits, new dependency, runtime, refetch or ordinary failed replay.
Saved PyPI now yields a 3,803-byte Markdown introduction; RFC Retry-After yields
1,719 bytes. CLI/API match direct baseline native extraction of the same source
subtrees. Oversized selection and ordinary failed replay remain rejected.
All 1,312 focused tests pass across 18 files, 80 additional cases net; 1,227
unchanged statuses match and five CLI admission cases are intentionally revised.
Build/types/format/lint pass, with independent static review. Fourteen guarded
offline children record zero network attempts and clean closure. Initial
test-only type/escaping errors and a rejected unescaped dotted-ID proof recipe
are preserved; final production bytes match the first candidate.
See RESEARCH-SELECTOR-RECOVERY.md and reports/diverse-content-2026-09-15.md.
Next: BBC card headings/readability loss, useful content versus JS-only shells,
response-limit provenance and richer large-document workflows. Full native
release/rendering/interaction, SafeJS, credentials/passkey-device, service/socket
and TTY gates remain open; research conclusions remain incomplete. No push.

### September 15: bounded Markdown source navigation

**PROGRESS; overall browser goal remains ACTIVE.**
Explicit unchanged text/markdown documents now expose partial sourceMarkdown
metadata: bounded ATX-shaped candidates and physical source ranges usable with
existing offline --lines. Literal body bytes, pre/text DOM, empty rendered title,
DOM heading/link behavior and HTTP/content classification remain unchanged.
No MIME sniffing, new dependency, runtime or fetching. Bound source at 2,000,000
UTF-16 units, 128 entries and 128 title units; keep source coordinates, explicit
truncation and existing extraction quotas. This is not semantic Markdown:
unfenced code comments in the saved PyTorch source are genuine lexical candidates
and can terminate ranges. Do not infer author intent or repair source silently.
All 1,642 selected native tests pass across 23 files, including 106 new cases;
all 1,536 previous case statuses match. Build/types/format/lint pass in isolated
archives. Six saved-page bodies, titles and outcomes stay unchanged. Docker,
Hugging Face, Ollama and PyTorch gain source navigation; a redirect notice gains
no invented heading and an HTML control stays unchanged. Actual PyTorch CLI
replay extracts the same 2,643-byte selected body with source metadata added.
Seven guarded offline children, zero network attempts, all closed/reaped with
pins unchanged. Initial harness path errors, a replaced potentially quadratic
title helper and an invalid proof assumption about PyTorch fences are recorded,
not erased. Review also caught Unicode fence-regex backtracking and optional
metadata rejecting initialized source shapes; both are fixed with regressions.
One new assertion was corrected for existing Markdown period escaping without
production changes. See MARKDOWN-SOURCE-OUTLINE.md and the dated JSON report.
Next: richer source representations, navigation noise and useful-content versus
shell diagnostics. Broader research conclusions remain incomplete. Full native
release, rendering/interaction, SafeJS, credential/passkey-device, service/socket
and TTY/PTY gates remain open. Original dirty work is preserved. No push.

### September 15: real content pages and bounded recovery workflows

**PROGRESS; overall browser goal remains ACTIVE.**
Twelve fresh public documentation/reference navigations used only the native
reader with explicit Markdown preference, producing 13 observed GETs and 12
verified captures. Ten yielded substantial-looking source content, one hit the
extraction output limit, and one yielded only a textual redirect notice. All
HTTP statuses were 200 after redirects, illustrating why status/nonempty text
alone is not content success. Four initial responses served Markdown; these are
literal fenced source with empty title metadata, not semantic Markdown parsing.
One scoped follow-up to PyTorch's public source-linked versioned URL recovered
163,872 extraction bytes. Total: 13 navigation attempts, 14 GETs, zero retries,
13 verified captures and clean child/request/socket closure. No script execution,
credentials, challenge bypass or production behavior change.
Wikipedia's original 256,013/256,000-byte extraction failure remains unchanged.
Existing pinned offline output-limit recovery yields 64 headings and Training,
Inference/Evaluation sections of 2,919/6,828/8,239 bytes; actual CLI/API agree.
Ordinary failed-receipt replay stays denied and no request is repeated. Six
guarded offline children include one preserved prototype-comparison assertion
error followed by a corrected data comparison, with zero network attempts.
Current committed runtime/config sources match the previously validated frozen
build; worktree and source/compiled pins stayed unchanged throughout the probes.
See `CONTENT-PAGE-WORKFLOWS.md` and `reports/content-pages-2026-09-15.md`.
Next: semantic Markdown/title/navigation support, MDN's absent dynamic sections,
less navigation noise and source-backed research conclusions. Full rendering,
interactions, credentials/passkeys, SafeJS, service/socket and TTY gates remain
open. Original work and all earlier website evidence are preserved. No push.

### September 15: recover bounded, labeled source descriptions

**PROGRESS; overall browser goal remains ACTIVE.**
Native inspection of eight saved application-shell responses confirms there is
no additional non-script application body content to recover in the sampled
empty pages. Instagram, Twitch, Roblox and Pinterest do supply public meta
descriptions that the reader dropped. Retain only inert allowlisted description
marker/content pairs and expose bounded sourceDescriptions metadata separately
from body content. Direct head records only; no nested/foreign/body promotion,
http-equiv behavior, arbitrary metadata export or script/hydration execution.
Source order and disagreements remain, with eight-entry/2,048-unit bounds and
explicit truncation. Existing reader text/output and extraction byte limits
apply. Metadata-only pages remain empty, notices remain unverified, and replay
admission and semantic/HTTP barriers do not change.
All 1,054 focused tests pass across 14 explicit files, including 54 new cases;
all 1,000 prior statuses match. Build/types/format/lint are checked in isolated
archives. A candidate's two new test-formatting issues were corrected without
changing production bytes. Ten saved-response research controls preserve every
body hash and outcome; actual Pinterest CLI replay retains its 98-byte notice
and now exposes two description records. Zoom's 29,997-byte content and the
LinkedIn barrier remain intact. Eleven offline children include preserved
initial proof errors (missing replay selector and omitted existing raw policy),
then corrected successful recipes; all processes close with zero network
attempts. Original top-100 captures/results and dirty work remain unchanged.
See `SOURCE-DESCRIPTIONS.md` and `reports/source-descriptions-2026-09-15.json`.
Next: broader content recovery and application-shell diagnosis, response/redirect
limits and source-backed research. Live applications, broad runtime/rendering,
credentials/passkeys, services/sockets and TTY gates remain open. No push.

### September 15: remove repeated wide-node snapshots and scope Office content

**PROGRESS; overall browser goal remains ACTIVE.**
Guarded profiling confirms substantial native work behind the slow wide-document
test: full immutable node snapshots repeatedly copied a growing body child list
for CSP parent and parser namespace checks. The first CSP-only candidate passed
tests but did not improve timings; another profile showed the cost move into
parser checks. Those unsuccessful measurements remain preserved.
The combined fix adds validated parent-ID reads and small immutable element
information views, used by CSP/formatting/foreign/parser metadata checks. Full
get snapshots, exact CSP edge-work accounting, metadata fail-closed behavior,
foreign/fragment semantics and resource caps remain unchanged.
All 1,724 tests across 30 selected native files pass, including 31 new cases;
all 1,693 prior statuses match. Build/types/format/lint pass. Two new assertion
errors were corrected to allow one initial empty-body snapshot, not repeated
growing-body snapshots; final production bytes match the preceding candidate.
Unprofiled three-sample medians on one pinned CPU show the valid 30,000-element
case improve from 1,563 to 425 ms in direct loading and 1,807 to 459 ms through
native research. The 50,001-element case retains the exact node-limit failure,
but reaches it sooner. All measured signatures match. Small-case results are
mixed, and this is not a live-network/rendering or universal speed claim.
Saved Office content is usable with the existing main#main replay selector:
9,786 Markdown bytes versus 41,789 in the original whole-page record, excluding
startup/trace noise while retaining all five FAQ answers. Baseline/final scoped
outputs and actual CLI/API output match. Blanket hidden filtering would lose
four collapsed answers and was not introduced.
Eleven guarded offline children, zero HTTP attempts, clean process/transport
closure and unchanged source/compiled/receipt/body pins. Original top-100
measurements are untouched. See `PARSER-METADATA-PERFORMANCE.md` and
`reports/parser-metadata-performance-2026-09-15.json`.
Next: other measured parser costs, useful-content versus application shells,
response/redirect diagnostics and source-backed research. Full native release,
rendering/interaction and separately gated SafeJS, service/socket, TTY/PTY,
credential and passkey-device acceptance remain open. Original work is preserved.

### September 15: retain HTTP failure provenance before content processing

**PROGRESS; overall browser goal remains ACTIVE.**
The saved CNN response was an empty HTTP 403 without Content-Type, but the
research pipeline reported a generic failure/unsupported loader outcome.
It now sets http-failure when the primary non-2xx response is summarized,
before capture/loading/extraction. Later error categories/stages remain intact;
header/document barriers retain priority and 429 still stops without retry.
No early throw, MIME sniffing, admission widening or invented network status.
All 42 new tests pass. The final selected suite is 2,035 passed / 2 failed
across 23 files; all 1,995 prior case statuses match the final baseline.
Two known body-capture assertions remain unresolved. The initial five-second
harness also timed out the existing 50,001-node headings case; an isolated
diagnostic confirmed that timeout, and unchanged baseline/candidate code passes
with a 15-second test-only bound. Production deadlines are unchanged; this is
not a performance improvement claim. Earlier new-test assertion errors remain
recorded. Build/types/format/lint pass and both candidates' production artifacts
are identical. Only research-browser production artifact maps/JS change.
Four guarded offline children (two API, two actual CLI) inject ten saved primary
responses without network access. CNN's native/reader results now preserve both
HTTP 403 and unsupported/loader provenance; no content is recovered and its
receipt stays evidence-only. Zoom's 29,997 Markdown bytes and LinkedIn's
semantic barrier remain unchanged. All process/transport cleanup and pins pass.
Original top-100 results and receipts are unchanged; no website was revisited.
See `HTTP-FAILURE-PROVENANCE.md` and `reports/http-provenance-2026-09-15.json`.
Next: useful-content versus application-shell reporting, hidden startup data,
response/redirect diagnostics and source-backed content recovery. Profile large
native-document work separately before attributing test duration to browser
performance. Full native release, research conclusions, rendering/interaction
and separately gated SafeJS, service/socket, TTY/PTY, credentials and passkey
device acceptance remain open. Original work and historical evidence stay intact.

### September 15: reuse captured literal text without refetching

**PROGRESS; overall browser goal remains ACTIVE.**
Added explicit offline replay `--find` and `--lines` modes for successful,
host-pinned default-profile literal text captures. Find preserves spaces and
returns case-sensitive line/column discoveries; inclusive line ranges return
bounded JSON or fenced Markdown. MIME/profile/format admission, source pins,
caps, challenge screening, buffer wiping and closure stay intact. No HTML
sniffing, structured-text execution, new dependency, failed-capture promotion,
long-text profile or network fallback. HTML selections/recovery stay separate.
All 168 new API/CLI cases pass. The final selected suite is 1,500 passed / 2
failed across 22 files, with all 1,334 original case statuses unchanged. The
two known body-capture assertions remain unresolved. Build/types/format/lint
pass; production artifacts are identical across three candidate iterations.
Earlier test/type authoring failures are preserved, not represented as passes.
Ten guarded offline children (two API, eight actual CLI) use the saved Ollama
Markdown and academic CSV captures, plus a Python HTML control. Before this
change the text receipts were admitted but HTML-only replay rejected them;
now their search/range coordinates match independent literal-source checks.
Selected Markdown is 700 / 112 bytes respectively; Python's 43,583-byte control
is unchanged. Zero HTTP attempts; all children/process groups close and
receipt/body/source pins remain unchanged. This is not new website coverage,
a latency measurement, verified source truth or full browser acceptance.
See `RESEARCH-TEXT-REPLAY.md` and `reports/text-replay-2026-09-15.json`.
Next: useful-content versus application-shell reporting, hidden startup data,
HTTP/response/redirect failure provenance and content recovery from saved/public
sources. Full native release, research conclusions, rendering/interaction and
separately gated SafeJS, service/socket, TTY/PTY, credentials and passkey-device
acceptance remain open. Original work and historical evidence stay preserved.

### September 15: identify the missed browser-check interstitial

**PROGRESS; overall browser goal remains ACTIVE.**
The saved rank-18 LinkedIn response was an HTTP-200 browser-check page, not useful
professional content. The shared classifier now accepts its exact normalized
reCAPTCHA browser-check title only with an existing bounded challenge-text marker.
HTML/status gates, title/text bounds, truncation checks and confirmed-header
priority remain unchanged. The result is a possible/unspecified challenge with
explicit handoff, not a provider claim, solver, identity change or bypass.
Two guarded actual replay-CLI children and two captured-response-injected native
API children reproduce the original 184-byte false extraction and the corrected
semantic-barrier/no-extraction result. The CLI's expected status 1 carries a
structured handoff report, not an unhandled exception. Four captured responses
are injected across the API children; no HTTP requests or continuation attempts.
The recent Zoom recovery remains byte-identical at 29,997 bytes. All process and
transport cleanup/pin checks pass, and original live receipts remain unchanged.
All 37 new tests pass. The selected suite is 1,247 passed / 2 failed across 17
files; all 1,212 original case statuses match the baseline exactly. Two older
body-capture assertions still expect post-extraction content despite the existing
pre-extraction barrier behavior. They remain unresolved; no green full release is
claimed. Build/types/format/lint pass; only the shared classifier's JS/map change.
See `RECAPTCHA-BROWSER-CHECK.md` and `reports/recaptcha-diagnostic-2026-09-15.json`.
Next: useful-content versus application-shell reporting, hidden startup data,
precise HTTP/response/redirect diagnostics and further content recovery from
saved/public sources. Broader research conclusions, full native release,
runtime/rendering/interaction and separately gated SafeJS, service/socket,
TTY/PTY, credentials and passkey-device acceptance remain open. Original work
and historical evidence stay preserved; access restrictions are not bypassed.

### September 15: recover Zoom content without exposing omitted templates

**PROGRESS; overall browser goal remains ACTIVE.**
The actual native loader now reproduces the saved Zoom HTTP-200 failure, which
the previous increment had only statically diagnosed. Repeated direct paragraph
starts inside an omitted template left an extra paragraph on the stack, causing a
`Malformed omitted reader subtree` error. The reader closes one directly open
HTML paragraph on the next p start, excluding SVG/MathML ancestry. Template
content stays omitted; strict unrelated boundaries, real nesting and all existing
resource limits remain. No runtime option or dependency is added.
The same pinned 300,329-byte capture now yields 29,997 bytes of whole-page Markdown
and 9,888 bytes from its unique #main, with six selected H1/H2 elements. This is
partial/unverified content, not full source, rendering, interaction or site success.
Five tokenizer issues remain. Both templates stay omitted. Two guarded offline
native children reproduce before/after behavior through direct loading and an
explicitly injected-response research pipeline; zero HTTP requests and clean
process/tree/transport closure. The original live failure remains unchanged and
failed-receipt replay admission is not broadened.
All 1,546 tests across 23 selected native files pass, including 48 new cases;
all 1,498 original case statuses match. Build/types/format/lint pass. The first
new-test formatting failure is preserved, and its production output is byte-equal
to the corrected candidate. Only research-loader production artifacts change.
See `OMITTED-PARAGRAPHS.md` and `reports/zoom-reader-recovery-2026-09-15.json`.
Next: LinkedIn barrier detection, shell/useful-content reporting, hidden startup
configuration and precise response/redirect/HTTP-failure diagnostics. Full native
release, research conclusions, runtime/rendering/interaction and separately gated
SafeJS, service/socket, TTY/PTY, credentials and passkey-device acceptance remain
open. Original work and historical website evidence stay preserved.

### September 15: attempt every entry in a published top-100 website list

**PROGRESS; overall browser goal remains ACTIVE.**
Completed 100/100 public-homepage navigation attempts with the native browser,
using Similarweb's published May 2026 corpus, not a claimed September ranking.
Four disjoint batches made 197 observed HTTP GETs including redirects; zero
retries, supplied credentials/cookie headers, page scripts or challenge bypasses.
The original native outcomes are 65 extracted-unverified, 13 empty-extraction,
seven semantic barriers, three HTTP failures and twelve other failures. Nonempty
text includes login/JavaScript/compatibility shells and is not site success.
All 100 children and transports closed; 197 request/socket closes matched the
197 starts, and all 90 saved decoded-body hashes verified. Frozen source and
compiled ledgers matched before/after; no production changes occurred in the sweep.
The full 100-row matrix and machine-readable URL/result/hash inventory are in
`reports/top100-websites-2026-09-15.md` and its matching JSON file. Raw evidence
remains in `node_modules/.cache/native-validation/top100-september15/`; redirect
logs are private and can contain server-generated query values. Exported report
URLs redact queries. No supplied secret access or cookie jar was used.
Priorities: Zoom's HTTP-200 reader failure; LinkedIn's missed browser-check barrier;
useful-content versus shell reporting and Office's hidden configuration pollution;
decoded-response and redirect-limit diagnostics; CNN's empty 403 mislabeled as
a loader failure; animated-counter/template artifacts and safe observer export.
Fix these against saved captures with isolated tests rather than recrawling the
same sites. Full native release, research conclusions, runtime/rendering,
interaction, SafeJS, service/socket, TTY/PTY, credential and passkey-device gates
remain open and separate. Original work and historical evidence stay preserved.

### September 15: retain explicit formula text and read product specifications

**PROGRESS; overall browser goal remains ACTIVE.**
Two fresh native GETs broaden coverage to an NVIDIA product page and an arXiv
scientific paper, both HTTP 200 without redirects. Source-backed product reading
recovers all 47 specification rows / 141 cells from the static `#specsmodal`, not
the empty script-populated `#specs` placeholder. Large navigation, unresolved
price/date placeholders and multiline-table fallback remain; no hardware/LLM
performance, availability, rendered visibility or recommendation is established.
The arXiv capture proves actual loss: eight explicit MathML `alttext` alternatives
vanish, leaving three equation cells empty and damaging one paragraph and three
table labels. The reader now retains nonblank alternatives as labeled inert code,
without evaluating TeX/MathML, inferring absent formulas or fetching dependencies.
MathML DOM remains omitted. Optional frozen source counters disclose retained
alternatives; their decoded units consume the existing text/output budgets.
All **1,498 cases across 22 selected native files pass**, including 104 new cases.
Build, 22-root strict types and three-file format/lint pass. All 1,394 original
case statuses stay unchanged; the initial literal-NUL fixture correction and its
failed report are retained. Only the reader loader and reader-info modules change.
Four offline CLI and two API children restore all eight captured alternatives,
with an exact +215 text-unit charge and unchanged surrounding text. The paper's
Markdown grows 28,586→28,957 bytes; NVIDIA stays byte-identical at 17,259 bytes.
NVIDIA API JSON differs only in generated references after prior allocations,
not content. No replay HTTP requests; the local code-span-padding verifier
correction remains preserved without repeating any native child. Together with
the website inspections: two fresh GETs and eight offline native children.
See `MATHML-ALTERNATIVES.md` and the forty-fourth inventory for scope/evidence.
Full browser/research outcomes remain open: more sites, product-page focus and
metadata, runtime/rendering/interaction, JS-only/iframe content, doctype provenance,
full native release, older table-source/body-capture failures and ARIA-test lint.
SafeJS, service/socket, TTY/PTY, credentials and passkey-device gates remain separate.
Original work and evidence remain preserved; access restrictions are not bypassed.

### September 15: readable table rows and broader native reading

**PROGRESS; overall browser goal remains ACTIVE.**
Opt-in `tableRows` / `--table-rows` renders simple native tables as physical
row/cell lists. Empty cells and source order remain; no header, span or column
associations are invented. Complex tables keep boundary output. Core, live
research, admitted replay and bounded section recovery share the preference;
defaults, source/structure/intermediate/output caps and timeout allowances stay
unchanged. Integration testing caught and fixed missing CLI recovery forwarding.
All **125 new cases pass**. Build, 26-root strict types and seven-file formatting
and lint pass. Expanded native validation is **2,839 passed / 10 failed across
26 files**; all 2,724 pre-existing case statuses match the clean baseline exactly.
Those ten older `table-source.test.ts` cases still expect reader attributes to
exclude the inert class retained by the earlier selector change. They remain
unresolved, separate from this feature; this is not a green full release.
The earlier 24 stale depth/attribute/resource-diagnostic cases are repaired in
separate test-only commit `15a87a6`: all 329 cases pass and production compilation
is unchanged. Historical failing reports are retained rather than rewritten.
A new native GitHub Camoufox GET retrieves its README; captured-source checks
verify forty headings, sixteen code blocks, four tables and 57 cells. Its Firefox
architecture and detection claims are source descriptions, not tested features
or dependencies adopted here. Shared-workspace drift remains explicitly recorded.
A separate native SQLite GET and offline source check recover a 12,727-byte
`div.fancy` article with all five headings, fifteen exact code blocks and 26
paragraphs. No SQL is executed; it contains no HTML tables. Bold/italic emphasis
is flattened but text is retained. Eight actual offline CLI comparisons and two
native API children verify HF 14,437→13,724 bytes, PyTorch 15,917→14,436 and GitHub
39,999→38,339 using matched normal-boundary baselines. All non-table Markdown and
converted-cell inline content stay exact; three complex GitHub tables fall back
unchanged. Python remains byte-identical at 43,583 bytes. No replay HTTP requests;
Python's original full-JSON cap failure stays unchanged. Including both website
inspections, this increment uses two fresh GETs and twelve offline native children.
See `TABLE-ROWS.md` and the forty-third inventory for contracts and evidence.
Original work and evidence remain preserved; no push. Broader hardware/benchmark/
Astra/Poe research, more sites, copy-label noise, doctype provenance, JS-only/
iframe content, rendering/interaction and full release remain open. Older
body-capture failures and ARIA-test lint remain outside this selection. Service,
SafeJS/runtime, TTY/PTY, credential and passkey-device gates remain separate;
access restrictions are not bypassed.

### September 15: remove empty Markdown links and reach redirected content

**PROGRESS; overall browser goal remains ACTIVE.**
Native Markdown omits empty/whitespace-only hyperlink wrappers while preserving
source anchors, JSON/discovery records, meaningful labels, whitespace, code and
existing source/structure/intermediate/output budgets. Hugging Face's captured
article shrinks from 16,092 to 14,437 bytes: only eighteen empty heading wrappers
and their now-leading whitespace change. The 43,583-byte Python article remains
byte-identical, including its nonempty paragraph-sign links.
Two fresh PyTorch GETs demonstrate why HTTP 200 alone is insufficient: the stable
URL serves a client-side redirect stub; a separately counted native navigation
follows its explicit same-origin Continue link without executing scripts. The
15,267-byte scoped article verifies twelve headings, seven code blocks, twenty
table cells and 52 paragraphs. The versioned URL is not a latest-release claim.
Build, fifteen-root strict types, formatting/lint and all **2,045 tests across
fifteen selected native files pass**, including 26 new cases. Original baseline
failures and test-authoring corrections remain in separate frozen evidence.
No timeout or application cap changes; the canonical native manifest has 853
entries. Previous 24 baseline failures, earlier body-capture failures and old
ARIA-test lint issues remain outside this selection and unresolved.
The forty-second inventory and `EMPTY-MARKDOWN-LINKS.md` record the change.
More sites/research, copy-label and table noise, doctype provenance, JS-only/iframe
content, interaction/rendering and full-release validation remain open. Service,
SafeJS/runtime, real TTY/PTY, credential and passkey-device gates remain separate.
Restrictions are not bypassed; original work and evidence are preserved. No push.

### September 15: preserve article targets and verify more public content

**PROGRESS; overall browser goal remains ACTIVE.**
Two new native GETs recover MLCommons methodology and Hugging Face quantization
documentation without retries, redirects, scripts or extra resources. Numeric
MLCommons results remain in an omitted iframe; benchmark/hardware/social research
is not complete. Captured-source checks verify substantive prose, headings, table
cells and code rather than treating HTTP 200 as acceptance.
Reader mode now retains inert source class/role attributes on preserved tags.
Offline API/CLI comparisons recover Python's `.body[role="main"]` and MLCommons
class-selected content without another request. Python's 43,583-byte article,
57 code blocks, 24 headings and 128 paragraphs remain byte-identical to the
previous verified scope. Equal-scope whole Markdown also stays unchanged;
retained attributes consume existing reader/document budgets. Hugging Face's
`.prose-doc` now selects its 16,092-byte article with all 18 article headings,
eight table cells and 15 code blocks; its pre-article prefix drops from 5,097
bytes to 11. All seventeen replay children across the three pages make zero
HTTP requests; four baseline selector failures remain preserved.
The prior slow receipt cases are diagnosed as deep byte-array assertion cost,
not 11–13-second browser serialization. Separate commit `0a9ad55` uses exact
bounded-span comparison; 128 tests pass twice at the original 5-second allowance.
Reader build, 25-root types and five-file formatting pass. Final expanded native
validation is **3,054 passed / 24 failed across 25 files**, with the same failing
case names reproduced in the baseline and no newly failing case after updating
the old class-stripping assertion. Two baseline ARIA-test lint errors remain;
four other changed files pass lint. Earlier body-capture failures outside this
selection also remain unresolved. This is not a green full release.
See the forty-first inventory, `READER-ARTICLE-SELECTORS.md` and the MLCommons
research note. Outstanding work includes the 24 baseline cases, Hugging Face
navigation/copy-label/empty-link/table noise and doctype diagnostics, more sites,
research, JS-only/iframe content, rendering/interaction and full native release
validation. Runtime/SafeJS, live service, real TTY/PTY, credential and passkey-device
gates remain separate. Restricted sites stay stopped; no solver or identity change.
Original dirty work and historical evidence are preserved. No push.

### September 15: readable captured articles without another request

**PROGRESS; overall browser goal remains ACTIVE.**
One new Python tutorial navigation recovers 34 headings, 57 code blocks and 132
paragraphs. Native replay now accepts explicit Markdown output in its bounded
JSONL envelope, including section recovery, without changing default JSON types
or source/output/admission limits. MDN main-scope Markdown yields 20,693 JSONL
bytes versus 44,259 for byte-identical baseline/candidate JSON. Python scoped JSON
hits the existing 256,000-byte ceiling at 342,496 bytes; Markdown recovers 43,583
content bytes with all 57 code blocks, 24 scoped headings and 128 paragraphs.
All six CLI attempts are retained (four succeed, two JSON limits); two offline
diagnoses verify the original/candidate failure. No replay makes an HTTP request.
All 2,477 tests in 19 selected files, build, 19 strict roots, formatting and lint
pass. Initial failures/types/lint and 5-second harness timeouts are retained;
final per-test allowance is 30 seconds, not a changed application deadline.
The fortieth inventory and `CAPTURED-ARTICLE-MARKDOWN.md` record evidence.
Python's stripped main role/class, large-receipt serialization cost, prior
unresolved tests, broader research/sites, rendering/interaction, restricted
content, full native release and separate runtime/service/device/credential
gates remain open. Existing dirty work is preserved; no push.

### September 15: opt-in publisher Markdown negotiation

**PROGRESS; overall browser goal remains ACTIVE.**
Five native requests across two public URLs compare default and preferred text
representations, then verify the actual new `--reader --prefer-markdown` CLI.
Ollama supplies the same hardware Markdown as its publisher source with 90.1%
fewer encoded body bytes than the observed HTML response. MDN ignores the
preference and retains byte-identical HTML/extraction without a retry. The
fixed Accept preference is opt-in, preserves identity/credential omission and
limits, and rejects DOM-selection/long-profile conflicts before networking.
All 51 new tests pass. The selected 22-file run remains non-green: 1,914 pass,
four existing failures reproduce exactly on unmodified baseline (252 pass/four
fail there). Initial new assertion mistakes and all failure logs are retained;
no old tests are dropped or weakened. Build, 22 strict roots, formatting and
lint pass. The thirty-ninth inventory and `MARKDOWN-NEGOTIATION.md` describe
evidence and limitations. MDN navigation clutter, broader site/research coverage,
rendering/interaction, comparative latency, restricted sites, full native release
and separate runtime/service/device/credential gates remain open. No push.

### September 14–15 UTC: Markdown documentation and CSV content recovered

**PROGRESS; overall browser goal remains ACTIVE.**
The publisher's Ollama index yields a real hardware Markdown link; that page and
an academic CSV both return 200 but expose unsupported MIME loading. Exact
text/markdown and text/csv admission now reuses bounded inert text, not parsers,
scripts, formulas or automatic link following. Native CLI capabilities and
literal find/line tests cover the formats. Eight same-body socket-denied loader
calls recover both inputs without HTTP; separate fresh native requests recover
12,580 bytes of Markdown source and 329 bytes of CSV source. Original failed
receipts, hashes and September 14 scope paths remain intact across UTC midnight.
Five real requests cover three URLs/two hosts, with zero redirects or mocks.
All 1,429 tests across 20 selected native files pass, with build, 20 strict roots,
formatting and lint. Six initial obsolete refusal assertions are replaced by
positive discovery checks; the initial failure log and source pin are retained.
The thirty-eighth inventory and `LITERAL-TEXT-FORMATS.md` record results and limits.
No dependency, wildcard MIME admission, network-policy/budget relaxation or push; original
dirty work is preserved. Broad research, site coverage, rendering/interaction,
restricted sites, comparative performance, full native release and separate
runtime/device/credential/service gates remain open.

### September 14: large-page content recovered and find regressions aligned

**PROGRESS; overall browser goal remains ACTIVE.**
An explicit existing long-v1 native request loads SWE-bench's 2,392,125-byte page
and eleven headings; six socket-denied local replays extract useful benchmark
descriptions with zero additional HTTP requests. The prior default-limit failure
and September 11 evidence remain intact. `CONTENT-FIRST-RESEARCH.md` documents
the practical capture/outline/section workflow without automatic retries or
relaxing limits. NVIDIA's GPU reference yields 48 source-order table cells after
one automatic redirect: two HTTP requests. Its reviewer flags strict one-request
scope wording; that caveat is retained, not promoted to a clean strict-scope pass.
Overall, two navigation launches make three real HTTP requests and no mocks.
The stale fragment/429 find expectations are replaced by positive behavior tests,
with added literal-feed coordinate, source-integrity and capture coverage. No
production policy changes: all 2,208 compiled files match the previous candidate.
All 1,597 cases across 21 selected native files pass, including 260 find cases;
build, 21 strict roots, formatting and lint pass. Prior failed logs are retained.
The thirty-seventh inventory records exact new observations and scope limits.
Original dirty work is preserved; no push. Broad site/research coverage, automatic
content workflows, rendering/interaction, restricted sites, performance, live
service, SafeJS/device/credentials and full native release remain open.

### September 14: public feed content no longer fails MIME admission

**PROGRESS; overall browser goal remains ACTIVE.**
Five fresh native HTTP requests cover four URLs on three hosts. Our World in Data
article and benchmark/source text are usable (18,053 and 19,163 Markdown bytes).
The default SWE-bench visit hits its decoded-byte cap; no status/body/content is
claimed and earlier long-profile evidence is not rewritten. BBC RSS returns 200
but exposes a real loader gap: text/xml is rejected. `LITERAL-FEEDS.md` fixes the
exact XML/RSS/Atom MIME admission through inert bounded text, not an XML parser.
Native and reader same-body replays recover all 21 item blocks with zero network;
a separate fresh BBC visit confirms 15,195 Markdown bytes and all 21 literal items.
No scripts, entities, stylesheet/resource loads, auto-following or relaxed limits.
Native CLI capabilities expose the admitted formats; line discovery/selection work.
All 38 new feed cases pass. The 16-file selection has 1,199 passes and five failures
reproduced on the unchanged baseline research-find tests; they are retained and
the run is not all green. Production build, 16 strict roots, formatting and lint
pass. The thirty-sixth inventory preserves receipts, original failures and source
pins. Prior dirty work remains untouched; no push. Larger-page admission, those
baseline test mismatches, interactive charts, broad research/site coverage,
rendering, live service, SafeJS/device/credential and full-release gates stay open.

### September 14: usable CLI resource reuse and more documentation coverage

**PROGRESS; overall browser goal remains ACTIVE.**
`CLI-RESOURCE-REUSE.md` exposes the public anonymous CSS/image cache through
`AGENT_BROWSER_RESOURCE_CACHE=public-anonymous-v1` at native host startup.
Defaults remain unchanged; unsupported reader/process/page-script combinations
and invalid values fail before connection/secret IO. Existing daemons are not
reconfigured by a client's environment. 563 tests across eight native-manifest
files, production build, eight strict roots, formatting and new-file lint pass.
Four real CLI configuration smokes pass under socket denial, without credentials,
subprocesses, addons or service startup; they do not prove a live daemon cache hit.
The thirty-fifth website inventory adds useful ROCm documentation (16,358 Markdown
bytes) and records vLLM's HTTP 429 Cloudflare barrier honestly. Only two requests
were made; SWE-bench was not attempted after the batch stopped. No restricted
target retry or bypass. Previous source/evidence paths and measurements remain.
Prior dirty work is preserved. Broad research and website coverage, rendering,
live-service/cache acceptance, SafeJS/device/credentials and full native release
remain open. No push or unrelated adoption.

### September 14: fewer repeated resource requests without changing content

**PROGRESS; overall browser goal remains ACTIVE.**
`RESOURCE-REUSE.md` adds opt-in native transport reuse for strictly admitted public
same-origin anonymous CSS/images, plus explicit resource credential omission.
Defaults, navigation/script/fetch credentials and pointer geometry remain intact.
Bounded copied bytes, expiry, route checks, unsafe-method start/completion
invalidation and memory-delivery accounting avoid fabricated HTTP successes.
805 cases across fourteen native-manifest files pass, along with production build,
fourteen strict test roots, formatting and new-file lint; two old session-test
lint findings are preserved. Native regression work catches zero-byte limits,
route invalidation and overlapping writes before live use. A fresh paired native
search uses eight rather than ten real HTTP requests with byte-identical content;
two asset memory deliveries are recorded separately. The thirty-fourth inventory
also checks actual RFC caching text through the native reader, for19 fresh HTTP
requests overall. This is measured request reduction for one flow, not a general
speedup, CAPTCHA solution or complete HTTP cache. CLI exposure, broad research and
website coverage, pointer/rendering, SafeJS/device/credentials and full release
remain open. No push or unrelated work adoption.

### September 14: native keyboard search gets content despite layout gaps

**PROGRESS; overall browser goal remains ACTIVE.**
`NATIVE-CONTENT-SEARCH.md` records two successful real native search workflows:
fill/Enter for comments, and Space on Stories followed by fill/Enter. A separate
label-pointer attempt fails at the existing global layout gate; that failure is
preserved rather than hidden by a click fallback. The explicit keyboard route
returns useful content without new APIs or weaker geometry guarantees. Five new
regressions protect radio state, GET serialization, cancellation and absence of
pointer gestures;321 tests across eight manifest-listed files, production build,
eight strict test roots and formatting pass. Three actual search-result links
also yield checked article/thread content. The thirty-third inventory accounts
for28 real requests: eight document GETs and twenty CSS/image GETs, not28 sites.
Header review identifies only two explicitly fresh reusable assets; caching is
not yet implemented. Broad research/website coverage, pointer rendering,
SafeJS/device/credential and full release gates remain open. No push, challenge
bypass or unrelated work adoption.

### September 14: choose oversized-document sections without another request

**PROGRESS; overall browser goal remains ACTIVE.**
`OUTPUT-LIMIT-HEADING-DISCOVERY.md` adds explicit
`--recover-output-limit --headings` and `outlineResearchOutputLimitCapture`.
It uses the same strict failed-capture admission, preserves original failure
identities, and reports bounded native selectors/truncation without relaxing
ordinary replay. A fresh GitLab reference hits its output cap; its saved response
then yields175 headings and three useful sections through actual returned
selectors, with zero further requests.630 targeted native cases, production
compilation and eight strict test roots pass; final affected API/CLI tests repeat
after fixture type/format corrections. The thirty-second inventory records four
new reader requests: Docker and Python forum navigation work, GitLab recovers,
and Britannica returns a challenge. A separate profile attributes the old slow
receipt tests to assertion/GC overhead, so no speculative production optimization
is made. Research, broad website coverage, rendering/interaction, SafeJS/device
and full release gates remain open. No push, bypass or unrelated work adoption.

### September 14: more public content and smaller table-heavy output

**PROGRESS; overall browser goal remains ACTIVE.**
`COMPACT-MARKDOWN-TABLES.md` adds opt-in `--compact-tables`, retaining all content
and boundaries while removing repeated caveats only inside an emitted table
warning. Defaults, JSON, independently scoped warnings and quotas stay unchanged.
Six saved-page comparisons prove exact default-output preservation and only the
documented compact substitutions. A fresh GitHub CLI visit saves9,204 Markdown
bytes (16.95%) without a second request;795 targeted native tests, production
compilation and eight strict test roots pass. Validation also catches and repairs
one older test expectation for the intentional structured output diagnostic.
The thirty-first inventory update adds nine reader requests across eight hosts:
seven useful documents, PyTorch's continuation-only stub and a Stack Overflow403
challenge. Following the stub's real public anchor yields CUDA documentation;
arXiv, SQLite, Apple, NVIDIA and Lobsters also yield checked content. No new
content omission is demonstrated by the bounded saved-capture review. Research,
full release, rendering/interaction and SafeJS/device gates remain incomplete;
access restrictions are not bypassed. No push or unrelated work adoption.

### September 14: native browsing recovers oversized content explicitly

**PROGRESS; overall browser goal remains ACTIVE.**
`CONTENT-SECTION-RECOVERY.md` implements explicit saved-capture heading recovery
through the API and `--recover-output-limit` CLI flag. Default replay remains
closed to failed receipts; typed output failures require intact pinned captures,
unrestricted HTML and closed native-reader state.729 targeted native tests pass,
production compilation succeeds, and eight selected test roots typecheck after
repairing the previous regression fixture's missing default limit. Its196 tests
also pass again. A fresh Wikipedia observation hits the whole-page quota; three
useful sections then pass content checks through the socket-denied CLI without
refetching or changing the failed receipt. The thirtieth inventory update records
seven HTTP requests across six seeds: five useful documents including Wikipedia,
plus HELM's empty script-driven application. GitHub README/build instructions,
Hugging Face optimization docs and Stanford's static benchmark article yield
content. Research remains incomplete; Reddit/X, SafeJS activation, rendering,
interaction and full release gates stay separate. No push or access bypass.

### September 14: output-limit diagnostics support bounded content recovery

**PROGRESS; overall browser goal remains ACTIVE.**
`CONTENT-OUTPUT-LIMITS.md` records structured `extraction.output` byte diagnostics
for Markdown and final serialized extraction quotas. Caps, error codes/messages
and failed-receipt admission stay unchanged; there is no silent truncation or
automatic refetch. The owned regression retains captured source and reads a
bounded section without another request. Five new cases first fail against the
old code;298 targeted native tests then pass across three explicitly manifested
files, with a successful parent repeat and production no-emit typecheck. The
full release profile and separate test-root typecheck are not rerun. Combined
Biome checking retains an independently reproduced pre-existing import-order
failure; new formatting and whitespace checks pass. Fresh website evidence still
belongs to earlier runtime5c7a882, not this patch. Keep browsing in content-first
mode, recover oversized pages by useful sections, and track real access blocks
without bypassing them. SDK activation and other acceptance gates remain open.

### September 14: content-first browsing works across varied sites

**PROGRESS; overall browser goal remains ACTIVE.**
The user prioritizes getting content rather than perfect rendering.
`CONTENT-FIRST-BROWSING-SEPTEMBER-14.md` and the twenty-ninth inventory update
record seven fresh native-reader page requests: five whole-page content checks
pass, Wikipedia hits its Markdown output quota but yields three useful sections
from the same saved response without another request, and Reddit returns403 with
an access-denied classification. Python and HN links are genuinely discovered
and followed as URLs, not claimed as geometry clicks. Content-only browsing now
proceeds independently of the separate visual/interaction acceptance gate.
An earlier26-resource live MDN visit commits its initial document but stops at
the harness's strict formatting census. Its original14/15 verifier outcome is
preserved; a separate parent Accept-default reconciliation passes15 checks,
without upgrading the incomplete interactive flow. No SafeJS activation,
credentials, CAPTCHA bypass or push occurs. Precise output-limit diagnostics,
readable table/boilerplate output, SDK acceptance and further site research remain
outstanding; historical reports and native-test counts remain unchanged.

### September 14: latest SafeJS source pulled and release staged

**PROGRESS; overall browser goal remains ACTIVE.**
`SAFEJS-REFRESH-SEPTEMBER-14.md` records the clean source fast-forward to
`9baf685284b3a089eaa3a22d1521b6dc391fccd9` and registry-latest
`@poe-platform/safe-js@0.1.599` observed at17:15:33 UTC. The exact tarball matches
registry SHA-512/SHA-1 and its372 files are staged without install scripts,
dependency installation, SDK execution or active browser runtime replacement.
Public-contract compatibility, isolated SafeJS execution and activation remain
outstanding; artifact integrity is not source provenance or runtime acceptance.
The browser still uses audited runtime5c7a882 with23975 native passes,0 failures
and2 exclusions from the prior gate, not a new test run. Fresh MDN remains
PREPARED: review corrections are authored, final syntax/hash review and a single
live launch are still pending. No new website run or push occurred. Original42
dirty tracked paths and697 untracked file hashes remain preserved.

### September 14: shared soft-hyphen minimum sizing repaired and measured

**PROGRESS; overall browser goal remains ACTIVE.**
`HYPHEN-EMERGENCY-MIN-CONTENT.md` records the shared min-content correction for
emergency wrapping plus manual soft hyphens. It partitions at existing valid
emergency boundaries first, preserving manual opportunities in protected pieces,
used-layout hyphen priority and the OW:break-word minimum distinction. Native
inline-block geometry, fixed-line raster references, same-point hit invalidation,
Unicode/source boundaries, resets and work caps are covered.

The final 488-file selected native profile passes 23,975 cases, zero failures
and two unchanged exclusions; build, 487-root strict types and scoped formatting
pass. All 23,937 prior case occurrences are preserved and 40 passing cases added.
The unchanged original 37-case characterization now passes all 37, repairing
both previously recorded failures without editing expectations. Nine passes /
31 failures on old production provide the identical-final-test baseline.

Paired native counters for 128/256 repeated-SHY groups fall from 53,784/205,848
minimum-pass work units to 10,145/20,257, while maxima and maximum-pass metrics
stay identical. These are 81.14%/90.16% charged-work reductions for two fixtures,
not measured website speedups. Protected manual islands can still be quadratic;
arbitrary explicit SHY placement is not a new Unicode-conformance guarantee.

A bounded static inventory verifies 44 retained public response bodies from
seven hosts, with zero target soft-hyphen forms. No new live or captured browser
run occurs in this increment. Next broaden website testing with MDN's retained
sidebar case and its missing SVG/resource boundary, or the Python Tutorial flow;
do not fabricate targeted site coverage by injecting characters or omitting CSS.
Preserve the 42 dirty tracked paths and 697 original untracked files. Research,
varied live coverage, wall-clock performance, SafeJS, credential/provider,
passkey-device, real terminal and challenge gates remain open. No push.

### September 14: captured HN confirms word-break diagnostic removal

**PROGRESS; overall browser goal remains ACTIVE.** One separate native recheck
on committed cd62d4d loads the unchanged September 11 HN capture at
16:18:22.688–16:18:22.907 UTC. The applicable word-break declaration diagnostic
is gone: overlapping formatting occurrences fall from 135 to 134, with every
other category and all formatting metrics unchanged. `.morelink` e1261 remains
discoverable but geometry returns unsupported; zero clicks or destination
requests. This is not HN rendering/link-flow acceptance or a new live visit.

Exactly two original mocked responses supply 42,364 decoded bytes; zero wire
requests, scripts, SafeJS, credentials/devices or real terminal probes. Native
run, verifier and parent comparison pass; guarded source/capture integrity,
native-owner cleanup, empty-private-directory removal and absent process group
are verified. `HN-WORD-BREAK-RECHECK-SEPTEMBER-14.md` and the twenty-eighth
inventory update retain the evidence and independent remaining site blockers.

The word-break feature's durable archive and 5,168-file final-gate copy are now
byte-verified; 42 dirty tracked paths and 697 original untracked files remain
preserved. Its separate two failing soft-hyphen sizing reproductions remain
open, not folded into the 23,935 passing selected native cases. Next correct
that shared min-content path; broader research, varied live coverage, speed,
provider/passkey-device and challenge gates remain open. No push.

### September 14: independent word-break compatibility passes native profile

**PROGRESS; overall browser goal remains ACTIVE.** `WORD-BREAK.md` records the
independent inherited `normal`/`break-word` longhand and shared emergency-wrap
integration. The final 485-file selected native profile passes 23,935 cases,
zero failures and two unchanged exclusions; build, 484-root strict types and
scoped formatting pass. All 23,853 prior case occurrences retain their statuses
and identities; 84 passing tests are added. Registration-only evidence still
fails 26/34 layout cases, so this is actual wrapping support, not diagnostic
suppression. Source/compiled inventories and all unowned Git files are verified.

Independent review also exposes a shared soft-hyphen minimum-width defect:
two separate characterizations each pass 35 cases and fail two, reporting 18px
instead of 6px for manual-hyphen/emergency-wrap composition. These remain
explicitly failing evidence outside the adopted 84-case suite; the defect is
not fixed or counted as acceptance. Next: correct that shared min-content path
with mixed-inline/whitespace/Unicode coverage and stronger failure-path teardown.

The HN captured stylesheet motivates this change, but no new HN load occurs in
the feature lane. A separately reviewed captured recheck is prepared, not yet
executed. HN's layered backgrounds, presentation hints, image and table-cell
overflow blockers remain. Live sites, real socket/TTY, SafeJS, credential/vault,
passkey-device, research, challenge and performance acceptance gates remain
open. Preserve the 42 pre-existing dirty paths, original 927-line TASKS residual,
three original manifest additions and 697 original untracked files. No push.

### September 14: fresh native man7 two-page live flow verified

**PROGRESS; overall browser goal remains ACTIVE.** One freshly authorized native
live run on 71d0c8b at 15:47:57.021–15:48:00.348 UTC completes ls(1) → genuinely
discovered date(1), with two document commits and native destination title/text.
Eight real HTTP 200 responses, zero redirects/mocks/retries, 46,184 encoded /
78,042 decoded bytes. Two optional tracker denials remain local, so ten adapter
entries are not ten wire requests. No scripts, credentials/devices or bypass.

All 14 independent evidence checks and a separate 83-file seal recheck pass.
Child/supervisor exit 0, owners/process group close cleanly, private directories
remain empty. The new complete eight-response corpus retains the destination
without modifying older captures or failed reports. This proves this bounded
workflow, not whole-site/visual acceptance, a performance gain or challenge
handoff; no challenge was encountered. See MAN7-LIVE-FLOW-SEPTEMBER-14.md and
the twenty-seventh website inventory. The repeated host is not new host coverage.

Parent review corrected local-denial/wire counter conflation before launch and
rebound a stale syntax receipt without weakening checks. Both preparation states
remain preserved; only one live attempt occurred. Existing dirty work is intact.

NEXT: preserve this complete corpus for regressions and move to other site
blockers. Static HN findings identify independent inherited word-break handling
with meaningful min-content behavior; confirm semantics and add native tests
before implementation. Layered backgrounds, wider complete/live coverage,
performance measurements, research, providers/passkeys, devices and human
challenge handoff remain open. No push or overall-goal completion.

### September 14: man7 native activation reaches the capture boundary

**PROGRESS; overall browser goal remains ACTIVE.** One unchanged captured man7
flow on adopted 71d0c8b at 15:24:52.577–15:24:53.765 UTC commits ls(1), discovers
date(1) and activates the ordinary link far enough to request its destination.
The prior width/fieldset-height guards no longer stop this input. The actual
failure is now ReplayMiss for the uncaptured date(1) response, before transport.
There is still no destination commit or whole-site/live acceptance.

Four original mocks / 39,562 decoded bytes, one initial navigate, one click,
two session navigation attempts / one commit, zero wire/scripts/credentials.
Revision changes 727→732; URL/root/history stay. All 18 evidence/cleanup checks
pass while browser/supervisor retain exit 1. Historical failures and old captures
remain immutable. See MAN7-FIELDSET-RECHECK-SEPTEMBER-14.md and the twenty-sixth
website inventory. This repeated host does not increase host coverage.

NEXT: prepare and separately release a bounded fresh native live flow so the
natural destination can be observed and captured without altering old evidence.
Do not repeat this incomplete replay, invent assets, force navigation or bypass
restrictions. HN text/background gaps, wider complete-corpus/live coverage,
research, providers/passkeys and device/human-handoff gates remain open. No push.

### September 14: auto-height fieldsets no longer invent a table dependency

**PROGRESS; overall browser goal remains ACTIVE.** The man7 captures contain no
authored percentage-height declaration. Static investigation identifies the
internal fieldset wrapper's unconditional 100% as the likely false dependency.
Native table/form/fieldset fixtures reproduce the exact guard. The producer now
keeps auto for auto-height owners, retaining 100% for non-auto owners. The table
guard, padding, ownership and existing definite-height behavior stay unchanged.

Final release01 at 15:12:15.777–15:18:52.589 UTC passes 23,851, zero failures and
two unchanged exclusions: 482 selected files, 481 strict roots, build/format pass.
Audit preserves all 23,824 baseline occurrences and records 29 new passes, with
no case-name migrations. Focused01 passes 317. Final identical-test red02 records
19 expected failures on old production. Review additions cover inline atomic
fieldset reflow and percentage children under constrained auto versus definite
owners. Exact pixels, hits, ordinary/canceled clicks and cleanup are covered.

The initial wrong min-height test expectation and raw-Git-byte audit correction
remain recorded; no production workaround follows either. Existing dirty work
and historical evidence remain intact. See FIELDSET-AUTO-HEIGHT-TABLES.md.

NEXT: one separately bounded captured man7 recheck on the adopted audited runtime.
The recorded site flow still fails; this native fix does not rewrite it or prove
which captured descendant failed. Retain original assets and ordinary navigation,
and distinguish further native blockers from the absent destination capture.
Broader complete-corpus/live coverage, HN CSS gaps, research, providers/passkeys,
devices and challenge handoff remain open. No push or overall-goal completion.

### September 14: captured man7 advances to cell-height reflow

**PROGRESS; overall browser goal remains ACTIVE.** One captured man7 observation
on adopted bdb923d at 14:58:56.168–14:58:57.018 UTC loads ls(1), rediscovers
date(1) and attempts one ordinary click. The exact previous workload advances
past percentage table-container sizing, then fails with `Percentage cell
descendant heights require table reflow`. No destination request/commit occurs;
the absent destination capture is not reached. This is not website acceptance.

Four original responses / 39,562 decoded bytes replay unchanged, with zero wire,
scripts, credentials/devices or extra assets. All 18 evidence/cleanup checks pass
while browser and supervisor retain exit 1. One missing-argument parent command
fails before any lock or browser launch; only one website observation occurs.
Original evidence and dirty work remain intact. See
MAN7-TABLE-WIDTH-RECHECK-SEPTEMBER-14.md and the twenty-fifth website inventory.

NEXT: trace the actual cell-descendant percentage-height declaration and its
containing-height definiteness; add native red/green geometry/rendering/click
tests before changing the guard. Do not suppress it or replay without a relevant
validated change. Complete-corpus/live coverage, HN CSS gaps, original research,
providers/passkeys, devices and challenge handling remain open. No push.

### September 14: percentage table container handoff validated

**PROGRESS; overall browser goal remains ACTIVE.** Corrected the stale table-role
guard that rejected an already-resolved container percentage width unless a
caption wrapper existed. The existing coordinator computes real used widths and
intrinsic minima; no parser-only acceptance, fabricated geometry or broad guard
bypass is added. Row/group, height/min/max, fixed-layout, positioning and direct
float/flex/grid table restrictions remain. Tables inside allocated blocks work.

Final release01 at 14:36:44–14:43:16 UTC passes 23,822 with zero failures and the
same two exclusions: 480 selected files, 479 strict roots, build/format pass.
Audit preserves 23,757 baseline case occurrences, records two explicit existing
case migrations and 65 new passes. Identical-source controls add 264 distinct
existing passes, giving 24,086 unique passing occurrences. Focused01 passes 542.
Review-driven tests prove width-induced text/natural-height reflow and allocated
float/flex/grid containing blocks, with real pixels, hits and native clicks.

The first red check's missing type-resolution setup failure and the subsequent
21 expected percentage failures remain intact. Existing dirty work is preserved;
no new runtime dependency, live, credential, SafeJS or device probe. See
TABLE-CONTAINER-PERCENTAGE-WIDTHS.md. Native gates are not website acceptance or
a performance benchmark.

NEXT: release the separately prepared captured man7 check only against the
adopted audited runtime. Retain exact original responses and ordinary date(1)
click; distinguish any later missing destination fixture from a native blocker.
Word breaking, layered backgrounds, broader complete-corpus/live coverage,
original research, providers/passkeys, devices and challenge handling remain
open. Do not push this increment or mark the overall goal complete.

### September 14: broader captured-site checks expose table sizing

**PROGRESS; overall browser goal remains ACTIVE.** Four captured attempts across
three existing hosts use audited 39b55d9 without live requests. Hacker News
loads but link geometry remains unsupported; exact-input formatting occurrences
fall 145→135 relative to its September 12 replay. Native samples identify
word-break and layered backgrounds, with presentation hints and overflow still
blocking geometry. zlib reaches the known missing ninth resource after eight
captured responses: a fixture limit, not a demonstrated browser regression.

The first man7 check fails on premature image-owner instrumentation; its
17-pass/1-failed verifier and evidence remain immutable. A separately scoped
one-line instrumentation retest commits ls(1), rediscovers date(1), and attempts
one genuine native click. It now fails at "Percentage table role sizing requires
cycle resolution", with no applicable CSS issues and only three table shells.
Its 18 verification checks pass without relabeling the incomplete flow.

All four outcomes and seals are independently audited and copied byte-for-byte.
Total: 15 mocked responses / 171,934 decoded bytes, four initial navigations,
two initial commits, one click attempt, zero destination commits or wire requests.
No code/test changes or new gate run; the prior 23,757-pass/two-exclusion gate
and source/compiled inventories reverify. See
WEBSITE-TEST-INVENTORY-SEPTEMBER-14-TWENTY-FOURTH-UPDATE.md and its four reports.

NEXT: implement genuine percentage table sizing at the table-layout role guard,
including containing-block resolution and retained protection for unresolved
intrinsic cycles, then retest the same man7 flow. Do not merely remove the
guard. Word breaking, layered backgrounds, wider rendering and complete-corpus
coverage follow; do not repeat zlib's incomplete capture as a layout test.
Research, live-site, provider/passkey, SafeJS, device and challenge-handling
acceptance remain open. No performance improvement or whole-site success is
claimed. Preserve original work and evidence; do not push this increment.

### September 14: captured Wikipedia opacity recheck

**PROGRESS; overall browser goal remains ACTIVE.** The scoped captured native
diagnostic on committed 39b55d9 completes at 13:51:28.935–13:51:29.302 UTC.
Overlapping formatting issue occurrences fall 137→131 and unsupported-property
occurrences 63→57; invalid-value occurrences remain two. Input e239 is found
and has a formatting node, but geometry is still unsupported. There is no
new host, wire request, raster, sprite acquisition or search interaction.

All 12 verifier checks and the independent parent metadata/hash audit pass.
All 33 original evidence entries match; 36 final sealed entries and the complete
37-file evidence copy are verified. The prior word-spacing sealing correction
remains historical; no current sealing failure is repeated. The audited runtime
has 23,757 native passes and two unchanged exclusions, plus 264 distinct existing
supplemental controls. See WIKIPEDIA-OPACITY-DIAGNOSTICS-SEPTEMBER-14.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-14-TWENTY-THIRD-UPDATE.md.

NEXT: broaden captured-site coverage and implement real layered-background,
clipping and other missing behavior without suppressing unsupported guards.
Original research, new live-site checks, credentials/passkeys, SafeJS, device
and challenge-handling gates remain open. This diagnostic is not a rendered
Wikipedia or performance acceptance result. Do not push this iteration.

### September 14: native group opacity validated

**PROGRESS; overall browser goal remains ACTIVE.** Implemented actual grouped
opacity compositing, not per-glyph fading or parser-only acceptance. Non-inherited
CSS numbers/percentages, stacking isolation, nested layers, native controls,
generated text, clipping, SVG shape cascade and explicit outer-SVG handoff share
the native raster path. Zero opacity retains geometry and genuine click dispatch.
Review fixes cover captioned document-root table backgrounds and releasing old
destination/clipping references before replacement-layer allocation.

Final release01 at 13:42:28–13:48:43 UTC passes 23,757 cases with zero failures
and the same two exclusions: 477 files / 476 strict roots, build and formatting
pass. The audit verifies 23,514 unchanged baseline occurrences, one explicit
opacity-to-filter unsupported-fixture migration, and 244 new passing cases.
Identical-source supplemental controls pass 508, adding 264 distinct existing
cases: 24,021 unique passing occurrences. Focused05 passes 859. See OPACITY.md.

No new runtime dependency, live request, credential, device or SafeJS probe.
Retained opacity buffers and work are bounded; this is not a measured RSS or
speedup claim. Internal SVG groups, block-in-inline splits and individual
collapsed-border owners retain explicit compositing restrictions. Failed earlier
runs remain unchanged. All original dirty work is preserved during adoption.

NEXT: run the separately scoped original Wikipedia captured diagnostic against
the committed audited runtime, without inferring search-flow success from these
native cases. Broaden captured-site checks afterward; layered backgrounds,
clipping, live-site/research, credentials/passkeys, device and challenge gates
remain open. Do not suppress unsupported guards or rewrite historical evidence.

### September 14: captured Wikipedia word-spacing recheck

**PROGRESS; overall browser goal remains ACTIVE.** One current captured native
observation on committed 6e95ddc at 13:13:00.256–13:13:00.631 UTC completes
formatting, cached diagnostics and search lookup. Its genuine word-spacing
implementation reduces overlapping formatting occurrences 138→137 and
unsupported-property occurrences 64→63; invalid-value occurrences stay at two.
Input e239 is found, but supported geometry still fails. No wire, scripts,
resources, raster or form actions; owners close cleanly. This is not a search
flow, live website acceptance or speedup claim.

Preserved the first harness-only tab-identity failure before native execution.
A separately prepared same-scope retest passes 12 metadata/cleanup checks.
Also retained one stale redirected-verifier-stdout seal entry explicitly; the
parent verifies the actual output and makes a separate final seal after closure,
without rerunning the browser or verifier. Both lanes have byte-verified durable
copies. See WIKIPEDIA-WORD-SPACING-DIAGNOSTICS-SEPTEMBER-14.md and the twenty-second
website inventory. All historical evidence remains unchanged.

NEXT: address real remaining rendering gaps, prioritizing genuine group opacity
and clipping/layered-background behavior with layout/raster/hit regressions.
Do not suppress unsupported guards or treat diagnostics alone as interaction
acceptance. Broader website/research and credential/passkey/device gates remain
open; preserve original work and require separately scoped observations.

### September 14: genuine native word spacing validated

**PROGRESS; overall browser goal remains ACTIVE.** Implemented inherited signed
px/em/rem word spacing in actual separator geometry, not only CSS acceptance.
SPACE/NBSP advances now feed wrapping, intrinsic widths, ranges, hit testing,
pixels and native controls' caret/selection/navigation. Fixed file capacity and
default-zero behavior remain intact. Review regressions cover applicability,
fully contracted spaces, zero-font separators and letter-spacing justification.

Final isolated release02 at 13:03:42–13:09:45 UTC passes 23,513 cases with zero
failures and the same two explicit exclusions: 470 files / 469 strict roots,
build and formatting pass. The source/compiled audit preserves every prior case
and adds 173. Identical-source supplemental controls pass 437 cases, including
264 additional existing cases: 23,777 unique passing occurrences, not double
counting the repeated feature suites. Focused02 passes 475. See WORD-SPACING.md.

The captured W3C section was extracted natively and independently rehashed;
this is not a conformance result. Backwards separator advances, unsupported
units, non-native separators and independent marker/image-alt pipelines retain
explicit limits. No new runtime dependency or live/credential/device access.

NEXT: re-observe the original Wikipedia portal capture using the committed,
audited runtime and its own isolated scope. Do not infer search geometry or
site acceptance from these native tests. Opacity, layered backgrounds,
appearance/clipping, broader research and real-device/provider/passkey gates
remain open. Preserve all historical measurements and pre-existing dirty work.

### September 14: current captured CERN flow and Wikipedia diagnostics

**PROGRESS; overall browser goal remains ACTIVE.** Broadened current-runtime
testing to two existing hosts without live requests. CERN's original two-page
capture passes native discovery, real mouse click, destination navigation/content
and old-document closure at 12:27:50 UTC: two responses / 2,881 bytes, two commits.
An earlier harness-only header-prototype failure is preserved; an explicit
separately sealed retest compares exact header entries. No production change.

Wikipedia's original portal diagnostic at 12:25:23 UTC reduces overlapping
formatting occurrences 160→138 and applicable CSS-value issues 24→2. Its search
input e239 is found but geometry remains unsupported. No sprite bytes, raster or
search flow. Native samples retain real gaps including word-spacing:-4px on the
search fieldset, opacity, layered backgrounds, clipping and appearance.

See CERN-CURRENT-CAPTURED-FLOW-SEPTEMBER-14.md,
WIKIPEDIA-BACKGROUND-DIAGNOSTICS-SEPTEMBER-14.md and the twenty-first inventory.
Both audited observations use b5d2efd; its 23,340-pass gate is rehashed, not rerun.

NEXT: implement genuine negative word-spacing layout for the observed search
fieldset, with native width/wrapping/range/hit/pixel regressions; do not only
accept its syntax. Opacity still needs group compositing, not a guard bypass.
Keep missing-asset/live scopes separate. Original research, broader forms/sites,
credentials/providers/passkeys/devices, SafeJS, socket/TTY and challenge gates
remain open. Preserve unrelated work; no push.

### September 14: captured MDN abort cleanup settles within its bound

**PROGRESS; overall browser goal remains ACTIVE.** A separately sealed native
observation on b5d2efd runs at 12:13:35 UTC. It reaches the same uncaptured SVG
at adapter attempt 20 after 19 responses / 270,288 bytes. Zero wire requests,
queries or clicks; navigation and missing-image rendering remain unverified.

The immediate 2,731 nodes, one pending job and one active queue lease settle by
the next metric sample, about 1.25 ms later, with an empty closed image owner.
No counters are cleared or page actions retried. Prepared and parent observation
verification pass within the 1,000 ms bound. The previous immediate-cleanup
failure remains immutable; this is not a retroactive pass or production fix.
See MDN-BACKGROUND-SETTLEMENT-SEPTEMBER-14.md and the twentieth inventory.
The 23,340-pass native gate is rehashed, not rerun for this captured observation.

NEXT: separately scoped/authorized missing-asset capture before further MDN flow
claims; preserve the old closed corpus. Original research, Wikipedia geometry,
broader live sites/forms, credentials/providers/passkeys/devices, SafeJS,
socket/TTY and challenge gates remain open. Preserve unrelated work; no push.

### September 14: MDN background request exposes capture and cleanup boundaries

**PROGRESS; overall browser goal remains ACTIVE.** On committed bce6e10, a new
11:49:00UTC captured navigation serves all19original responses/270288bytes, then
denies an uncaptured high.712917a113e51658.svg before transport. No query, click,
wire request, new asset, rendering or retry. This is not a Cloudflare challenge.

The original overall verifier FAILS: its immediate post-close snapshot retains
2731nodes,one pending load andone active queue lease. Existing session contracts
allow asynchronous settlement; neither a persistent leak nor later captured
cleanup is proven. An independent11-check fact audit preserves the failure and
confirms containment/process absence. The consumed lane is not rerun or rewritten.

Five separate native abort regressions cover signal/stop/tab/session cancellation
and honest accounting of an uncooperative active transport. Focused checks pass
308/0; the full466-file gate passes23,340/0/2unchanged exclusions at12:01:35UTC.
All23,337previous case occurrences and compiled runtime bytes are preserved.
See MDN-BACKGROUND-IMAGE-ABORT-SEPTEMBER-14.md, BACKGROUND-NAVIGATION-ABORT.md and
the nineteenth inventory. This is test/evidence work, not a production-code fix.

NEXT: a separately sealed bounded cleanup-aware observation, with no further page
actions after its blocker; then separately scoped/authorized missing-asset capture
and resumed MDN flow. Keep the old19-response corpus closed. Original research,
Wikipedia geometry, broader live sites/forms, credential/passkey/device, SafeJS,
socket/TTY and challenge gates remain open. Preserve unrelated work; no push.

### September 14: single-layer CSS background images validated

**PROGRESS; overall browser goal remains ACTIVE.** URL backgrounds now have real
native loading, stylesheet/import/redirect/variable provenance, size/position/
repeat pixels, clipping and canvas propagation. Shared image ownership retains
CSP, budgets, cancellation and taint metadata; resource transfers/swaps preserve
decoded data and detached img consumers. Initial background loading waits for
stylesheets. Pending paint and stale prepared captures remain explicit failures.

The isolated final gate passes23,335/0/2unchanged exclusions at11:42:08UTC across
465selected files. Independent audit preserves23,099prior case occurrences and
verifies238new passing cases,2,899inputs and2,192compiled files. Initial failures
remain recorded, including URL lowercasing, an invalid opaque-source attempt and
an obsolete support assertion. No cap, dependency, engine or exclusion changes.
See CSS-BACKGROUND-IMAGES.md for scope, limitations and retained evidence.

NEXT: recheck the captured MDN flow on this committed runtime without opening its
old19-response corpus or claiming missing image assets were rendered. Additional
asset acquisition needs a separately bounded scope. Non-atomic inline/control/
special-table/fieldset image backgrounds remain fail-closed; gradients, multiple
layers and unsupported attachment modes remain rejected. Original research,
Wikipedia geometry, broader live websites/forms, credentials/providers/passkeys/
devices, SafeJS, sockets/TTY and challenge gates remain open. No push.

### September 14: MDN click rechecked on committed letter spacing

**PROGRESS; overall browser goal remains ACTIVE.** A new captured ordinary click
on e5f76b6 runs at10:55:31UTC. Initial navigation and link discovery succeed;
native width admission still rejects the click. Exception property counts fall
54→51; the other six named categories stay unchanged. No destination or wire
request, scripts, forced click, fallback or retry. This is not a Cloudflare block.

The original19responses/270,288bytes,49links and50,087query work are unchanged.
Prepared and parent verification pass with stable inputs/clean closure. The
23,097-pass gate is rehashed, not rerun. See MDN-LETTER-SPACING-CLICK-REPLAY.md
and the eighteenth inventory; historical failures and paths remain preserved.

NEXT: build actual single-layer CSS backgrounds, including URL provenance,
existing image/network/CSP ownership, position/size/repeat pixels, invalidation
and cleanup. Native diagnostics plus source inspection identify missing behavior;
do not replace implementation with syntax acceptance or admission exceptions.
Keep the old captured corpus closed. Original research, Wikipedia geometry,
broader live forms/sites, credential/passkey/device, SafeJS, socket/TTY and
challenge gates remain open. Preserve unrelated work; no push.

### September 14: native letter spacing validated with geometry and clicks

**PROGRESS; overall browser goal remains ACTIVE.** Real nonnegative px/em/rem
letter spacing now affects grapheme advances, wrapping, intrinsic widths,
rectangles, ranges, pixels and hit ownership. W3C-native research corrects the
computed-zero/CSSOM-normal distinction. Unsupported fixed-advance consumers and
atomic boundaries remain fail-closed, including suppressed-text guard cases.

Final isolated build/types/format/native gate passes23,097/0/2unchanged exclusions
at10:47:11UTC across459selected files; focused checks pass1,151. There are106new
passing cases, preserving all22,993previous occurrence statuses. A quadratic
positioned-subtree scan is fixed without raising limits; six scan-test labels
and one obsolete positive-spacing rejection fixture are updated transparently.
All initial failures and evidence paths remain recorded in LETTER-SPACING.md.

NEXT: bounded captured MDN checks on the committed runtime; do not infer full
page click success from synthetic fixtures. Wikipedia geometry, original
research, broader live sites/forms, credential/providers/passkeys/devices,
SafeJS, socket/TTY and challenge gates remain open. Preserve unrelated work;
no push.

### September 14: fresh native W3C source check informs text spacing

**PROGRESS; overall browser goal remains ACTIVE.** One anonymous native GET of
W3C CSS Text3 succeeds at10:23:36UTC, followed by one offline native extraction
of discovered section7.2. Source findings expose a zero-value CSSOM mismatch in
the letter-spacing candidate; regression tests and correction precede adoption.
Ordinary text line-edge/mixed-value rules are confirmed; atomic-boundary tracking
remains explicitly unsupported rather than silently omitted.

The offline harness's nonexistent-field assertion fails after emitting its
receipt; the original failure is retained. Independent artifact verification
passes without rerunning the browser. No scripts, credentials, redirects,
subresources or alternate browser. This is live reader coverage, not CSS layout
acceptance. See W3C-TEXT-SPACING-RESEARCH-SEPTEMBER-14.md and the seventeenth
inventory. Original research and all separate acceptance gates remain open.

NEXT: finish isolated validation and adopt the bounded text-spacing feature,
preserving unrelated work and the still-failing MDN ordinary-click evidence.

### September 14: ordinary MDN click still fails current native layout

**PROGRESS; overall browser goal remains ACTIVE.** At 10:04:18 UTC, committed
be3aaf6 loads all19original MDN resources and rediscovers the querySelectorAll
link, but an ordinary click still fails document-width capability admission.
There is no destination request, wire access, forced click or fallback. Current
click diagnostics name54unsupported-property occurrences versus78earlier; both
clicks fail. This is a native layout blocker, not a Cloudflare challenge.

The original verifier's missing-import failure remains recorded. A separately
corrected verifier and independent parent check pass on the same observation;
the browser is not rerun. The22991-pass gate is rehashed, not rerun. See
MDN-CURRENT-CLICK-SEPTEMBER-14.md and the sixteenth inventory for scope/evidence.

NEXT: implement actual missing text/layout behavior, starting with bounded
letter spacing, without weakening whole-document geometry or pointer checks.
Count-only issue maps and truncated samples do not justify target-only admission.
Wikipedia geometry, original research, broader live sites/forms, provider/passkey/
device, SafeJS, socket/TTY and challenge gates remain open. Preserve unrelated
work and all historical failures; no push.

### September 14: captured MDN confirms inline-spacing improvement

**PROGRESS; overall browser goal remains ACTIVE.** A new captured MDN native
observation on committed be3aaf6 completes at 09:54:18.823 UTC. The same 19
resources/270288 bytes support one navigation, formatting build, cached CSS
diagnostics read, hint query and bounded attribution. No wire/scripts/clicks;
prepared and parent verification pass with stable inputs and clean closure.

Raw unsupported-property occurrences fall 126→113, applicable 64→54, and
overlapping formatting occurrences 206→196. All other issue counts and formatting
metrics stay unchanged. Samples retain128/omit18, still nonexhaustive; cascade
work rises1305 and generated-content work117. No speed, raster or interaction
success is claimed. See MDN-INLINE-SPACING-REPLAY.md and the fifteenth inventory.
The22991-pass native gate/two exclusions is rehashed, not rerun. Historical
evidence and original execution paths remain unchanged in durable copies.

NEXT: revisit the earlier captured MDN ordinary-click failure on current code
under a separate bounded scope. No implicit destination/asset fetch if geometry
now succeeds; unknown requests must fail closed. Wikipedia geometry, original
research, broader live sites/forms, credential/provider/passkey/device, SafeJS,
socket/TTY and challenge gates remain open. Preserve unrelated work; no push.

### September 14: native inline logical spacing and actual geometry

**PROGRESS; overall browser goal remains ACTIVE.** Native margin-inline and
padding-inline plus four start/end longhands now participate in the real
horizontal-tb/LTR physical-edge cascade. Authored identity, variables, priority,
CSS-wide/all, CSSOM accessors/order, pseudo content and invalidation are covered.
Geometry, pixels and hits match canonical physical edges, including negative
margins, auto centering, containing-width changes, text and rich buttons.
Existing vertical/RTL guards and legacy block-only helper behavior remain.

All67new cases fail on the old runtime; the corrected focused run passes741.
Final native gate passes22991/0/2unchanged exclusions across455files/454strict
roots; build/strict/format pass and inputs stay stable. The net65-pass increase
retires two obsolete global inline-property rejection cases; all other previous
selected cases/statuses remain unchanged. Audit verifies1363source files,
2184compiled files and100receipts. See LOGICAL-INLINE-SPACING.md for scope,
test-helper corrections, retained failures and existing generic CSSOM limits.

NEXT: bind the committed runtime/final gate, then separately replay the original
MDN capture. No new captured/live website, credential/provider/passkey/device,
SafeJS, socket/TTY or challenge gate is claimed by this native implementation.
Original research and broader website/form/browser acceptance remain open.
Preserve unrelated work and historical evidence; goal active, nothing pushed.

### September 14: current Python two-page interaction remains passing

**PROGRESS; overall browser goal remains ACTIVE.** A fresh captured Python flow
on committed565aa1e completes at09:12:47.025UTC: native homepage navigation, ordinary
rediscovered Tutorial click, replacement document and title/h1 verification.
Nine original resources/109017unique bytes yield16responses/161647served bytes;
zero wire/scripts/denials/fallback. Both documents and all owners close cleanly;
prepared22checks and independent parent verification pass.

Compared with the actual04:41UTC flow on23e988d, document sizes, loader-time
scalar stylesheet metrics and raw issue counts are unchanged. Each phase still
reports22unsupported properties/5invalid values. No extra formatting/raster or
destination action is tested; single-run timing is not a performance benchmark.
See PYTHON-CURRENT-REPLAY-SEPTEMBER-14.md and the fourteenth inventory update.
The22926-pass native gate/two exclusions is rehashed, not rerun. Durable evidence
copies preserve original paths, hashes and historical failures.

NEXT: implement observed inline logical-spacing/unit behavior with native
regressions, then a separately scoped captured-site recheck. Wikipedia geometry,
MDN destination/assets, original research, broader live sites/forms, credential/
provider/passkey/device, SafeJS, socket/TTY and challenge gates remain open.
Preserve unrelated work and historical evidence; goal active, nothing pushed.

### September 14: captured MDN confirms logical-block improvement

**PROGRESS; overall browser goal remains ACTIVE.** A separately scoped native
replay on committed565aa1e completes with19originalresources/270288bytes, one
navigation/formatting/cached diagnostics/hint query and unchanged bounded native
attribution. Zero wire/scripts/clicks/recorded JS guard attempts; prepared and
parent outcome verification pass, with stable inventories and clean closure.

Raw unknown-property occurrences132→126, applicable68→64, total overlapping
formatting occurrences210→206 versus the latest font-wide observation. All
other issue counts and formatting metrics stay unchanged. Retained samples128,
omitted37→31; cached metrics stay unchanged, cross-runtime cascade work rises
2151units. No speed, used-geometry, raster or interaction success is claimed.
See MDN-LOGICAL-BLOCK-REPLAY.md and the thirteenth inventory update. The final
22926-pass native gate/two exclusions is rehashed, not rerun; RAM evidence is
copied durably without rewriting original execution paths or historical data.

NEXT: a separately scoped current-runtime Python two-page replay to exercise
actual interaction on another captured site, then observed inline logical
spacing/unit gaps. Do not silently fetch MDN's destination or missing assets.
Original research, broader live sites/forms, credential/provider/passkey/device,
SafeJS, socket/TTY and challenge gates remain open. Preserve unrelated work and
historical evidence; goal active, nothing pushed.

### September 14: native logical block spacing and CSSOM ordering

**PROGRESS; overall browser goal remains ACTIVE.** Native margin-block and
padding-block plus four start/end longhands now share the real physical-edge
cascade in horizontal-tb. Variables, priority, inheritance, generated content,
computed accessors and live cache invalidation are covered. Real boxes move and
grow with canonical physical rectangle/pixel/hit parity; existing vertical/RTL
guards remain. This is not inline-axis or full logical/vertical CSS support.

Focused676nativecases pass, including185new cases. An integrated run first
reproduced16CSSOM ordering failures; mixed-mapping compaction, pending-group
pre-emission and spacing setter order are corrected with effective-value round
trips. Review's16additional regressions also fix independent-variable shorthand
synthesis and interposed left/right order. Existing generic partial-pending/
crossed-group limitations remain explicit.
See LOGICAL-BLOCK-SPACING.md. Final selected native gate and audit pass:
22926passed/0failed/2unchangedexclusions,452files/451strictroots; build/strict/
format pass. Final inventories bind1360source/2184compiledfiles and155receipts.
No new website observation or live-site acceptance is claimed. RAM evidence is
copied durably with original paths and hashes retained; unrelated work stays out
of the atomic feature commit.

NEXT: bind the completed committed runtime and final native gate, then separately
replay the original MDN capture. Wikipedia's earlier geometry rejection remains;
do not silently fetch sprite/logo assets or relax native guards. Original
research, broader live sites/forms, credential/provider/passkey/device, SafeJS,
socket/TTY and challenge gates remain open. Preserve all pre-existing work and
historical evidence; goal active, nothing pushed.

### September 14: current Wikipedia diagnostics and blocked geometry

**PROGRESS; overall browser goal remains ACTIVE.** The original119573-byte portal
capture is loaded once through native loadBrowserDocument on committedfefbb8b,
with formatting, cached diagnostics, one search-input lookup and one geometry
attempt. No wire/scripts/actions or recorded JS guard attempts; integrity/cleanup
pass. Compared with the latest executed September13radius replay, overlapping
formatting occurrences167→160: unknown CSS properties65→64 and overflow7→1.
All other issue counts and formatting sizes stay unchanged; work rises3units.

Inpute239is found but its rectangle remains rejected by the existing width
guard. No search flow, raster or live-site success is claimed. Native diagnostics
retain128samples/omit14, exposing background sprites and other actual gaps;
cached metrics stay unchanged. See WIKIPEDIA-CURRENT-DIAGNOSTICS-SEPTEMBER-14.md
and the twelfth website inventory update. Reused22741nativepasses/twoexclusions
were rehashed, not rerun. New RAM evidence is copied durably with original paths
and exact hashes retained after project capacity recovers; historical evidence
is unchanged.

NEXT: implement actual native behavior for observed layout/paint gaps, with
synthetic regressions before another separately scoped captured replay. Do not
accept sprite syntax as painting support or silently fetch missing logo/assets.
MDN destination, original research, broader live sites/forms, credential/provider/
passkey/device, SafeJS, socket/TTY and challenge gates remain open. Preserve
unrelated work; keep watching storage. Nothing pushed; continue the full goal.

### September 14: captured MDN confirms font-wide improvement

**PROGRESS; overall browser goal remains ACTIVE.** A fresh separately scoped
offline native observation on commitfefbb8b completes with19original resources/
270288bytes, zero wire/denials/scripts/clicks. Prepared and independent parent
verification pass. Applicable unknown-property occurrences70→68, raw134→132,
total overlapping formatting occurrences212→210. The retained font:inherit
rejection is gone; this is not complete sampling or full-font conformance.

All formatting metrics and other raw/applicable issue counts stay unchanged.
Cached diagnostics reuse build1, retain128samples and omit37rather than39.
Cascade work rises157units; no speed/memory claim. See `MDN-FONT-WIDE-REPLAY.md`
and the website inventory's eleventh update. Earlier evidence is untouched.

NEXT: current-code diagnostics on the existing Wikipedia portal capture to
broaden coverage, then logical spacing/units and remaining actual sampled
features. Reuse original fixture metadata and a new scoped lane; do not silently
fetch missing logo/assets. No fresh Wikipedia pass, MDN destination capture,
interaction, original research completion, broader live sites/forms, credential/
device, SafeJS, socket/TTY or challenge acceptance is claimed. Project storage
is nearly full; use separately scoped new scratch capacity, not deletion of
historical evidence or another blind full-build copy. Preserve unrelated work.
Nothing pushed; continue the full browser objective.


### September 14: native font-wide inheritance and pending serialization

**PROGRESS; overall browser goal remains ACTIVE.** Font initial/inherit/unset/
revert now expand into five real native font longhands. Priority, variables,
CSSOM resets/removal/serialization, parent/root and generated inheritance,
button defaults and live caches are covered. Real text/button fixtures change
height8→48pixels with exact canonical pixels and expanded hit regions; native
font/control limits remain. Full/system font grammar and full computed font
serialization are not implemented, nor unsupported reset-only font features.

Review caught a genuine deferred all/font serialization regression. The fix
orders strictly nested pending groups before scalar overrides and preserves
all121components rather than losing116on reparse. Thirteen round-trip cases
cover importance, earlier slots, direct setters, nesting and siblings. Existing
missing-component and crossed non-contained pending limitations remain explicit.

Final selected gate:22741passed/0failed/2unchangedexclusions,449files/448strictroots;
build/strict/format pass. See `FONT-WIDE-INHERITANCE.md` and
font-wide-work-september14/release01. Focused545pass with229new cases. All earlier
failed development/native receipts remain, including two old full-font negative
tests whose expected rejection category changed; their layout guards stay intact.
Pre-existing parser/declaration reordering and other unrelated work are preserved.

NEXT: separately bind/release/recheck the original MDN capture, then use the
existing Wikipedia portal capture for a different-site diagnostic on current
code. Continue logical spacing/units and remaining real sampled failures; do
not treat repeated MDN checks as broad site acceptance. Original research, fresh
live sites/forms, credentials/devices, SafeJS, socket/TTY and challenge gates
remain open. Project storage is nearly full; use explicitly scoped new scratch
capacity rather than deleting historical evidence or blindly copying builds.
Nothing pushed.

### September 14: captured MDN confirms text-decoration alias improvement

**PROGRESS; overall browser goal remains ACTIVE.** A separately scoped offline
native replay on committedd9933a1 completes and passes prepared plus independent
parent verification:19original resources/270288bytes, zero wire/denials/scripts/
clicks. Applicable unknown-property occurrences fall78→70; raw147→134. The raw
invalid-value count rises30→31 because a retained unmatched underline-wavy alias
now correctly rejects the unsupported value; applicable invalid values stay15.

Formatting remains partial with10categories, now212rather than220overlapping
occurrences. All formatting metrics and other applicable issue counts are
unchanged. Cached diagnostics reuse cascadebuild1, retaining128samples and
omitting39rather than51. Cascade work increases1336units; no speedup claim.
See `MDN-TEXT-DECORATION-REPLAY.md` and the website inventory's tenth update.

NEXT: implement the persisting matched font:inherit case with genuine longhand
inheritance, priority, reset, CSSOM and control regressions. Then logical spacing/
units and remaining sampled layout features; justify-items:center is now exposed
by the bounded sample window. Do not assume sampling is exhaustive or weaken
remaining guards. Interaction, the uncaptured MDN destination, new live sites/
forms, original research, credentials/devices, SafeJS, socket/TTY and challenge
gates remain open. Preserve historical evidence and unrelated work. No push.


### September 14: native WebKit text-decoration aliases

**PROGRESS; overall browser goal remains ACTIVE.** Four exact prefixed decoration
names now use the canonical native parser, cascade, CSSOM and rendering behavior.
Both Webkit/ webkit accessors work; serialization/enumeration stay canonical.
Priority, variables, CSS-wide expansion, shorthand resets, atomic invalid writes
and resource/ownership limits remain enforced. Actual synthetic pixels/geometry
match canonical decoration. Generated decoration computes but retains its existing
layout guard; wavy/double and other unsupported values are not newly admitted.

Final clean selected gate:22512passed/0failed/2unchangedexclusions,446files,
445strictroots,798cleanmanifestentries. Build/strict/scoped format pass. Added120
cases; focused428pass. Historical failing baseline/test-development receipts remain
intact. See `TEXT-DECORATION-ALIASES.md` and the text-decoration-aliases-work-
september14 cache, release00. Preserve unrelated residual work; no push.

NEXT: separately pin/release/replay the original MDN corpus to measure the sampled
alias rejection reduction, without assuming interaction or zero remaining issues.
Then implement bounded font-wide inheritance using the source-backed next-step
investigation, followed by logical spacing/units and other sampled features.
Full/system font syntax is not implemented. Original research, fresh live sites,
forms, credentials/devices, SafeJS, socket/real terminal and challenge gates remain
open; native passes do not establish those outcomes.


### September 14: captured MDN yields actionable CSS rejection samples

**PROGRESS; overall browser goal remains ACTIVE.** A separately scoped native
run on committed diagnostics runtimeea13cf6 completes with19original captured
resources/270288bytes, zero wire/denials/scripts/clicks. One cached diagnostic
read retains128samples and explicitly omits51instrumented occurrences:53samples
are matched/active,60unmatched/active,13inactive,one matched/uncertain and one
unresolved/active. Samples are not unique bugs or exhaustive visible failures.

Concrete matched/active samples include five -webkit-text-decoration cases,
font:inherit, masks/transforms, logical spacing, letter-spacing, .5ch and100svh.
The existing10formatting categories/220occurrences, full raw/applicable maps,
boxes/text/work metrics and cascade-build identity remain unchanged. New verifier
and independent parent checks pass, including all bindings, sample bounds and
cleanup. See `MDN-CSS-DIAGNOSTIC-REPLAY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-NINTH-UPDATE.md`.

NEXT: implement genuine prefixed text-decoration compatibility and font-wide
inheritance semantics with regressions, then logical spacing/units and remaining
features based on the native samples. Do not just suppress guards or assume
unsampled properties are absent. Recheck original actions separately; additional
image/mask resources and the MDN destination are not captured. Broader live sites,
forms, research, credentials/devices, SafeJS, socket, real TTY and challenge gates
remain open. Preserve historical evidence and unrelated work. No push.


### September 14: bounded native CSS rejection details

**PROGRESS; overall browser goal remains ACTIVE.** DocumentStyles.diagnostics()
now returns a read-only cached cascade snapshot with full raw/applicable counts
and at most128bounded rejection samples. It retains authored/canonical property,
value, selector chain, matching/media state, source ordinal/import depth and
inline ownership where known. Explicit truncation/omissions and exhaustive=false
prevent treating absent samples as absence of problems. Existing accepted CSS,
issue counts, budgets and unsupported-layout guards remain unchanged.

Final focus:443pass/0fail. Final selected native gate:22392pass/0fail/two unchanged
exclusions,444files,443strict roots,796manifest entries and352unselected. All96new
cases and prior case identities/outcomes, build, strict checks, scoped formatting
and exact source/receipt checks pass. Retain1350source/2176compiled/113receipts.
Source review's selector-provenance gap is corrected and covered by import,
grandchild, cycle, inactive-media and cache tests. Earlier variable-fixture
failures and the intermediate22388-pass gate remain separate. See
`CSS-DIAGNOSTIC-DETAILS.md` for bounds, evidence and limitations.

NEXT: separately pin and use this diagnostic API through the native browser on
the MDN capture, identify real remaining CSS features, then improve compatibility
and retest actions. This native gate alone is not a new website result. Research,
broader live sites/forms, credentials/devices, SafeJS, socket, real TTY and
challenge gates remain open. Preserve pre-existing parser/styles/manifest work
and historical evidence. No push.


### September 14: captured MDN confirms generated-item formatting progress

**PROGRESS; overall browser goal remains ACTIVE.** One separately scoped native
diagnostic on committed generated-item runtime97a98e1 completes using the same
19captured resources/270288decoded bytes, zero wire/denials and no scripts or
interaction. The full raw issue map loses29generated-item and six overlapping
alignment occurrences:13categories/255occurrences become10/220, not35distinct
bugs. All remaining counts stay unchanged. The same2047indexed nodes plus
seven markers/2054boxes,15270text units and83210formatting work are retained;
deferred subtrees fall94→65. Empty generated boxes are not dropped.

New verifier and independent parent checks pass, including exact runtime/fixture
bindings, cleanup and corrected node-plus-marker accounting. The older false
verifier and all historical evidence remain unchanged. Sampling still leaves
36generated and530ordinary-inline candidates unexamined. See
`MDN-GENERATED-ITEMS-REPLAY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-EIGHTH-UPDATE.md`.

NEXT: obtain bounded native property/value attribution for remaining CSS issues,
then implement genuine missing behavior and separately retest original actions.
No fresh live site or MDN destination/action pass is claimed. Broader website/
form flows, research, credentials/devices, SafeJS, socket, real TTY and challenge
gates remain open. Preserve unrelated work and historical evidence. No push.


### September 14: generated pseudo boxes participate as flex/grid items

**PROGRESS; overall browser goal remains ACTIVE.** Native `::before`/`::after`
block-like boxes now participate in flex/grid sizing, order, alignment,
independent formatting and static stacking. Empty generated strings keep their
styled boxes. Effective-container blockification works through generating
`display:contents` ancestry without changing inheritance; the walk charges the
existing work limit. Out-of-flow placement remains separate. Unsupported
generated table items, nested containers and transparent pseudo displays retain
their guards; unsupported contents nodes do not gain phantom item metadata.

Final focused gate:582pass/0fail. Final selected native gate:22296pass/0fail/
two unchanged exclusions,441selected files,440strict roots,793manifest entries
and352unselected. Build, strict checks, scoped formatting and exact source/case
audits pass;195additional cases cover styles, geometry/pixels, stacking/hits,
position transitions, mutations and bounded work. Two old blanket-rejection
expectations are deliberately replaced. Baseline441pass/77fail and all earlier
preparation/fixture failures remain intact. See `GENERATED-FLEX-GRID-ITEMS.md`.

This is synthetic native evidence, not an MDN action or new live-site pass.
NEXT: separately pin and run a captured MDN formatting diagnosis on this new
runtime, retaining node-plus-outside-marker accounting and every remaining
issue. Then scope action/destination testing and broader website/form flows.
Research, fresh live access, credentials/devices, SafeJS, socket, real TTY and
challenge gates stay open. Historical evidence and unrelated work remain
unchanged. No push.


### September 14: MDN diagnosis identifies generated flex-item candidates

**PROGRESS; overall browser goal remains ACTIVE.** A separately scoped native
formatting diagnosis on unchanged ownership23e988d completes without interaction:
one navigation/build/hint query,19captured responses/270288 bytes, zero wire.
The raw formatting map contains13codes/255overlapping occurrences, not255bugs.
127attribution calls retain22direct generated-item records with flex parents,
three generated vertical-align candidates and five hint candidates. Sampling
leaves36generated and530ordinary-inline candidates unexamined; no exhaustive
attribution or MDN action success is claimed. The source optimization is separate.

The prepared verifier remains false: its2047nodes==2054boxes assumption ignored
seven outside markers. Separate supplemental and parent checks confirm the
native node-plus-marker convention, remaining sample constraints,18ledgers/
11049entries and cleanup. Original verifier failure, result and seals remain
unchanged; no retry or post-run browser probe. See
`MDN-FORMATTING-DIAGNOSIS-SEPTEMBER-14.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-SEVENTH-UPDATE.md`.

NEXT: implement genuine generated flex-item participation/blockification and
alignment handling with focused regressions, rather than dropping empty pseudo
boxes or weakening the width-resolution guard. Preserve candidate-vs-exact
attribution. Correct node-plus-marker accounting in any future diagnostic lane;
do not rewrite this one. Recheck original actions separately, then broaden live
sites/forms and production-only performance measurements. Destination capture,
research, credentials/devices, SafeJS, socket, TTY and challenge gates stay open.
Historical evidence and pre-existing work remain intact. No push.


### September 14: eliminate text-transform scans without text demand

**PROGRESS; overall browser goal remains ACTIVE.** Native text layout now delays
its full-formatting-node transform-presence scan until a nonempty inline context
needs it, retaining either boolean only within that call. No-width, block-only
and childless inline requests avoid the scan; validation, outputs and charged
metrics remain. There is no persistent cache, dependency or budget increase.

Deterministic native regressions reproduce11000 and1010000 predicate visits for
100/1000 empty-context measurements before the fix, versus zero afterward. These
are predicate counts, not whole-page timings or all node work. Nonempty-context
and broader repeated-layout costs remain. See `TEXT-TRANSFORM-SCAN.md`.

Retained unchanged-engine focus:299pass/14fail. Final focus:316pass/0fail,
nine files. Final selected native gate:22101pass/0fail/two unchanged exclusions,
439selected files,438strict roots,791manifest entries and352unselected.
All27new cases, build, strict checking, scoped formatting and exact case/source
inventory checks pass;1344source/2172compiled/66receipt entries are retained.
An initial fixture type error and an intermediate24-case passing run remain
separate. Bounded source review finds no blocking issue; no live-site speedup
or standalone memory improvement is claimed.

NEXT: consume the separately scoped MDN formatting diagnosis on its unchanged
older runtime, implement genuine missing layout behavior rather than suppressing
guards, and broaden website/form flows and production-only performance checks.
Research, live-site, credentials/devices, SafeJS, socket, TTY and challenge gates
remain open. Preserve historical evidence and pre-existing work. No push.


### September 14: captured MDN blocker and native action profile

**PROGRESS; overall browser goal remains ACTIVE.** One separately scoped MDN
replay loads the original captured querySelector document and discovers49 main
links/two exact destinations. One native querySelectorAll click fails on
unsupported formatting-profile width resolution before any destination request.
All19 responses/270288 bytes are accepted, zero denials/wire requests. The0.415s
observation retains exit1; integrity,18ledgers/11034entries and cleanup pass.
This is a native capability blocker, not a site or authorization block. No retry,
fallback or extra diagnostic probe. See `MDN-OWNERSHIP-REPLAY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-SIXTH-UPDATE.md`.

One independent native-only CPU profile passes36 cases (9nested-actionability,
27positioning), zero failures/skips. Frozen1343source/2172compiled/46receipt
entries remain stable. Actual implementation samples identify layoutTextContexts
for investigation; deliberate withoutReuse baselines and two negative timing
deltas prevent unwarranted speed claims. Whole profiled job3.14s wall/404.156MiB
peakRSS is not standalone-browser memory or comparable to the Python flow.
No source change, speculative cache or full native-gate rerun occurs. See
`NATIVE-ACTION-PROFILE.md`.

NEXT: isolate MDN generated-content/vertical-alignment failures in a distinct
diagnostic scope and measure text-transform scan work on production-only native
fixtures before optimizing. Preserve the unsupported-layout guard. The MDN
destination remains uncaptured. Broader live-site/form flows, repeatable
performance, research, credentials/devices, SafeJS, socket, TTY and challenge
gates remain open. Historical reports and pre-existing work stay intact. No push.


### September 14: captured Python two-page flow passes

**PROGRESS; overall browser goal remains ACTIVE.** A separately scoped expanded
corpus now passes native homepage discovery, genuine Tutorial click, destination
document replacement, old-document closure and native title/h1 verification.
The 04:41:05–04:41:06 UTC run uses the same ownership runtime 23e988d as the prior
comparison; it adds the already captured Tutorial response, not fresh HTTP.

All nine URLs are used: two documents once each and seven shared assets once per
loader phase. Sixteen requests are accepted, zero denied, with 109,017 unique and
161,647 served decoded bytes. Wire requests stay zero. Eighteen ledgers/10,980
entries verify; process group 1278218 is absent and private directories/owners
are cleaned up. No retry, source substitution, page scripts or further browsing.
The earlier eight-response denial remains unchanged; the new corpus is distinct.

One-run performance: 1.279 seconds native observation, 214,488 KiB peak RSS
(about 209.5 MiB). This is not a benchmark or a lightweight-memory success claim.
See `PYTHON-TWO-PAGE-REPLAY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-FIFTH-UPDATE.md` for evidence and boundaries.

NEXT: the retained MDN 19-response action corpus and separate memory/layout
profiling. MDN's identified destination capture is missing; do not substitute
its newer source-only border-style page or claim complete navigation. Destination
rendering, live-site behavior, repeatable performance, research, challenge and
credential/device/SafeJS/socket/TTY gates remain open. No push.

### September 14: captured Python click reaches the destination boundary

**PROGRESS; overall browser goal remains ACTIVE.** One separately released,
unchanged eight-resource replay proves the prior ownership failure is absent
on the captured Python homepage. Its discovered Tutorial click now reaches a
destination GET attempt, denied before transport because that response is not
in the original corpus. This is the local fixture allowlist, not a site block.

No click result or destination navigation completes; `flowPassed` remains false.
Eight resources/72,064 decoded bytes are accepted; the ninth adapter attempt is
denied; wire requests remain zero. Two queries and one formatting observation
complete. All 20 residual diagnostics and formatting metrics stay unchanged.
Eighteen ledgers verify, process group1261783 is absent and cleanup completes.
The 04:13:57–04:13:58 UTC run stays pinned to ownership commit23e988d, not the
newer capability build. See `PYTHON-OWNERSHIP-REPLAY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-FOURTH-UPDATE.md`.

NEXT: a separately scoped two-document capture using the already retained
Tutorial response, with exact destination assets and a genuine discovered click.
Do not expand or relabel the completed comparison. Broaden next to the original
MDN capture and separately scoped public forms. Live navigation/rendering,
repeatable performance, research, credential/device, SafeJS, socket, TTY and
challenge gates remain open. No fresh requests or push at this checkpoint.


### September 14: nested pointer actions and capability advertisement

**PROGRESS; overall browser goal remains ACTIVE.** Native session click,
double-click and hover now have explicit nested-scroll regressions. Existing
behavior passes through auto, scroll and hidden inner ports, delivers inner and
outer scroll events before pointer events, and preserves clip boundaries and
disabled-state revalidation. The stale `nestedScroll:false` capability is now
true; partial support, no force and no stable-animation-frame promise remain.

Retained pre-fix focus: **222 pass/1 fail**; only the capability assertion fails.
Final focus: **223 pass/0 fail**, six files. Final selected native gate:
**22,074 pass/0 fail/2 unchanged exclusions**, 438 selected files, 437 strict
roots, 790 manifest entries and 352 unselected entries. Nine new cases pass.
Build, strict checking, scoped formatting and inventory/test-set verification
pass. See `NESTED-ACTIONABILITY.md` and
`node_modules/.cache/native-validation/nested-actionability-work-september14/`.

These fixtures use one in-memory initial document and synthetic button actions;
they are not public-site navigation, script, credential/device, socket or TTY
acceptance. The separately scoped Python replay stays pinned to the preceding
ownership commit, not this newer capability flag. Broader website performance,
compatibility, research and challenge-handling gates remain open. No push.


### September 14: overflow ownership regression after Python replay

**PROGRESS; overall browser goal remains ACTIVE.** The single V2 captured Python
replay removed the overflow diagnostic (1 to 0; total 21 to 20), but the discovered
Tutorial click failed with `Invalid overflow ownership`. Integrity and cleanup
verification passed; the flow did not. Eight original resources, 72,064 decoded
bytes and zero wire requests were used. This is not fresh website validation.

New synthetic flex/grid fixtures reproduced an overflow ownership defect:
normalization retains discarded whitespace in the formatting arena, while the
old extent measurer required every allocated node to remain reachable. The fix
retains charged identity validation for every slot and requires reachability
only for measured boxes, containing blocks, fixed nodes, contexts, fragments and
glyphs. Existing cycle, duplicate, numerical and work guards remain intact.

Retained pre-fix focus: **90 pass/2 fail**. Final focus: **101 pass/0 fail** across
6 files; 15 new cases cover whitespace, normalization and malformed/consumed
ownership. Final selected native gate: **22,065 pass/0 fail/2 unchanged
exclusions**, 437 selected files, 436 strict roots, 789 manifest entries and
352 unselected entries.
Build, strict checking, formatting, exact test-set/count checks and source/
compiled inventory verification pass. Evidence remains under
`node_modules/.cache/native-validation/overflow-ownership-work-september14/`.
An earlier passing candidate is retained separately; it predates arena hardening.

See `PYTHON-OVERFLOW-REPLAY.md` for the failed replay and native follow-up evidence.
No saved-page replay was repeated after the fix; its effect on the original
Tutorial flow remains unverified. No new live website, credential/device,
SafeJS, socket, TTY or challenge acceptance is claimed. Broader research and
browser compatibility gates remain open. No push is part of this checkpoint.

### September 14: native nested overflow and scrolling

**PROGRESS; overall browser goal remains ACTIVE.** Supported ordinary overflow
boxes now have bounded extents, stable element scroll positions, shared
projection/clipping, nearest-scrollport sticky constraints and automatic
flex/grid minima. Guest methods, queued element events, nested reveal, wheel and
keyboard routing are integrated. Unsupported special-box cases remain guarded.

Final focus: **4,142 pass/0 fail/2 unchanged exclusions**, 105 selected files.
The 272 new cases all pass; five cases are added to existing test files.
Review reproduced and corrected inline image/control metric loss, stationary
sticky grid-area constraints and missing SVG descendant clip ownership.
Failed candidates and the first broad run remain recorded; the latter omitted
two existing exclusions and the baseline per-test timeout. The final gate
restores those exact settings, without new exclusions or higher engine limits.

Final selected gate: **22,050 pass/0 fail/2 unchanged exclusions**,
436 selected files, 435 strict roots, 788 manifest entries and
352 unselected entries. Build, strict checking, scoped formatting and
inventory audit pass; 1,341 source and 2,172 compiled files are retained.
See `OVERFLOW-SCROLLING.md` and `node_modules/.cache/native-validation/native-overflow-september14-round01/` for exact boundaries and evidence.

Original-resource Python replay is prepared but not executed at this checkpoint.
No new live website, credential/passkey/device, SafeJS, socket, TTY or challenge
acceptance follows from this native gate. The stopped CSSOM acquisition remains
closed; its offending selector and exact API algorithms are not established.
Broader website flows, performance, original research and outstanding acceptance
gates remain work to do. No push is part of this checkpoint.

### September 14: bounded sibling matching without larger budgets

**PROGRESS; overall browser goal remains ACTIVE.** General-sibling matching
reuses operation-local preceding-prefix answers instead of repeatedly scanning
wide sibling chains. Cache keys isolate selector, position, scope, pseudo target
and parent. Immediate positives avoid unnecessary memo retention; recursive
probes preserve lower-prefix tables. Default work and memo limits are unchanged.

The final focus passes **565/0/0**, including 16 new cases. The exact final test
file on original source has **11/5/0**: four large-work failures and one expectation
of the new memo contract, not five pre-existing bugs. Review found and tests
reproduced two candidate regressions: excess memo for cheap positive lists, then
overwritten lower-prefix tables after recursion. Both are corrected without
weakening caps or tests. Earlier passing/failing runs and a formatting-only stop
remain recorded. See `SELECTOR-SIBLING-WORK.md` for the complete differential.

Final selected round01 passes **21,773/0/2 unchanged skips**, from 2026-09-14T02:06:48.357Z
to 2026-09-14T02:11:51.622Z: 426 selected, 425 strict, 778 manifest and 352 unselected. Build,
strict checking, scoped formatting and inventory audit pass; 1,327 source and
2,156 compiled files are retained. Intermediate full round00 passed 21,772/0/2
before the final recursive-cache regression was added; it is not relabeled as
the final gate. Existing selected test bytes and the prior raster feature remain
unchanged. No dependency, skip or guard waiver is introduced.

This is synthetic selector/cascade progress, not proof that the stopped W3C
CSSOM navigation is fixed. No captured source is reopened and no further HTTP
request occurs. Its precise offending selector, edition and API/event algorithms
remain unknown. Python's Tutorial click still has the overflow blocker; actual
nested overflow/scroll-state/extent/clipping and nearest-scrollport sticky are
next, with the 40-case draft preserved outside the source/manifest until those
APIs exist. The existing source requirements and architecture notes are retained.

Varied website flows, elapsed-time performance, challenge handling, credentials/
providers/device/passkeys, SafeJS, socket, real-TTY and incomplete hardware/
benchmark/Astra/verified Reddit-Poe research remain separate open gates. All
unrelated work and historical evidence are preserved; commits stay local.

### September 14: bounded clipping primitive and a stopped-source failure

**PROGRESS; overall browser goal remains ACTIVE.** Native raster destinations
now support nested immutable rounded clipping views with shared pixel storage,
cached row intersections and bounded work. Rectangle, image and glyph paths
compose inherited and per-draw clips without changing alpha or alias behavior.
The 1,024-clip cap uses a separate namespace; existing raster limits remain
exactly unchanged. No overflow guard is removed and no new dependency is added.

The corrected focus passes **858/0/0**, including 51 new cases. Full corrected
round01 passes **21,757/0/2 unchanged skips**, September 14,
01:47:18.445–01:52:20.365 UTC: 425 selected, 424 strict, 777 manifest and 352
unselected. Build, strict checking, scoped formatting and inventory audit pass;
1,326 source and 2,156 compiled files are retained. Failed round00 remains
21,756/1/2: an old numeric-marker assertion caught the limits-object regression.
The production namespace is corrected, not the old test weakened.

Exactly two further native standards GETs run. Overflow3 succeeds with one live
and one offline native load; CSSOM View parses 23,906 nodes but navigation fails
at the internal query-work cap. The stop rule prevents its offline load/retry;
its edition and metric/API/event algorithms remain unverified. All source
owners close and process groups are absent. Parent verification checks 36
historical/source ledgers and 25,080 entries without another load or request.
See `RASTER-CLIPPING.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRD-UPDATE.md`.

Read-only diagnosis identifies eager cascade matching during navigation and a
separate quadratic general-sibling selector shape, not the actual failing W3C
selector. A synthetic optimization candidate passes 563 focused cases; the
same 14-case file on old source has four large-work cap failures and one new
memo-contract expectation failure. That candidate is not yet a released or
real-site-verified fix. Its separate review and full gate are next.

Full nested overflow, scroll-state/extent/clip integration and nearest-scrollport
sticky are still pending. The 40-case overflow draft stays outside source and
the native manifest until its APIs exist. Python's original-resource Tutorial
click still has the overflow blocker and is not rerun here. Varied website flows,
repeatable performance, credential/provider/device/passkey, SafeJS, socket,
real-TTY, challenge and incomplete hardware/benchmark/Astra/verified Reddit-Poe
research acceptance gates remain open. Historical evidence and unrelated work
are preserved; no push occurs.

### September 14: real sticky positioning removes Python's position guard

**PROGRESS; overall browser goal remains ACTIVE.** Commit `7ec49ac` implements
root-scrollport sticky insets, containing-block and grid-area constraints,
oversized view rectangles and margin limits without changing sibling allocation.
Geometry, paint/capture, hits, ranges/carets and scroll targeting share visual
offsets. Sticky creates an auto-z stacking context; absolute descendants follow
it while viewport-fixed descendants escape. Nested grid areas survive relative,
flex, sticky, atomic-inline and float relocation. No new dependency is added.

The focused gate passes **1,003/0/0**, including 56 new sticky regressions. The
final selected native gate passes **21,706/0/2 unchanged skips** on September 14,
01:09:31.649–01:14:33.945 UTC: 424 selected, 423 strict, 776 manifest and 352
unselected. Build, strict checking, scoped formatting and independent receipt/
inventory verification pass. The final snapshot contains 1,325 source and 2,156
compiled files. Failed round00's ten obsolete sticky rejection fixtures remain
recorded; corrected tests retain real guards or positive supported behavior.
The supplemental scroll-core suite still has 25 passes/three independently
confirmed pre-existing failures and remains outside the successful gate.

The unchanged Python replay runs **01:18:52.344–01:18:52.467 UTC**, with one native
homepage load, one discovered Tutorial click and **zero HTTP requests**. Its
eight original resources remain 72,064 bytes. Position issues drop 1→0 and raw
issues 22→21; every other issue count and formatting metric is unchanged. The
click still fails on **overflow-layout-not-supported (1)** alone. This is not
successful whole-page geometry, paint, navigation or fresh live validation.
Owners close, empty private directories are removed and group 1140002 is absent.

One separately bounded native W3C GET plus offline parse supplies the sticky
rules, returning Working Draft, 7 October 2025, with complete sticky sections.
It is a source read, not a live layout test or latest-edition claim. See
`STICKY-POSITIONING.md`, `STICKY-WEBSITE-SEPTEMBER-14.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-SECOND-UPDATE.md`. Older evidence and all
unrelated uncommitted work remain preserved; no push occurs.

Next: actual nested overflow/clipping/scrolling and nearest-scrollport sticky
composition, then original-resource live flows and repeatable performance.
Multiline/table sticky, transformed/vertical contexts and outside-CB margin
conformance remain unclaimed. Credential/provider/device/passkey, SafeJS,
socket, real-TTY, challenge and incomplete hardware/benchmark/Astra/verified
Reddit-Poe research gates remain separate.

### September 14: discretionary hyphens remove Python's remaining CSS-property guards

**PROGRESS; overall browser goal remains ACTIVE.** Commit `0ab2f0a` implements
source-preserving U+00AD soft-hyphen rendering and breaks, inherited
`hyphens:none/manual/auto`, and three legacy aliases through stylesheet and
live/computed CSSOM. It covers actual ranges/copying, pixels/hits, intrinsic and
shrink-to-fit sizing, float-shortened intervals and closing edges. `auto` keeps
explicit opportunities with no automatic dictionary installed. Language-specific
markers/spelling/shaping and complete Unicode line breaking remain limitations;
the source's language/resource gate is not waived. See `TEXT-HYPHENATION.md`.

The focused gate passes **721/0/0**, with 39 new and 682 existing cases. The identical
final-test parser-only baseline has 36 failures fixed by actual layout. The full
selected native gate passes **21,590/0/2 unchanged skips** on September 14,
00:20:18.754–00:25:18.553 UTC: 421 selected, 420 strict, 775 manifest, 354 unselected.
Compilation, strict tests, formatting, complete source/runtime inventories and
independent verification pass. Historical failures and the intentional registry
count/test-fixture corrections remain documented, not relabeled as successes.

The unchanged Python replay runs **00:27:41.765–00:27:41.887 UTC**, with one
native homepage load, one discovered Tutorial click and **zero HTTP requests**.
It removes all four remaining property occurrences: raw issues 26→22, with every
other count and formatting metric unchanged. The click still fails, but its
width-resolution guards now contain only **sticky position and overflow**.
This is not successful page geometry, painting, navigation or a fresh capture.
Native owners close, empty private directories are removed and the group is absent.

One separately scoped offline native read of the unchanged W3C body establishes
the hyphenation rules and resource-less-auto inference, with the complete
hyphenation section retained. It adds no HTTP request or latest-edition claim.
See `TEXT-HYPHENATION-WEBSITE-SEPTEMBER-14.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-FIRST-UPDATE.md`. Other websites are not rerun.

Next: sticky-position geometry and nested overflow/scroll integration, then
original-resource live flows and repeatable performance. Credential/provider/
device/passkey, SafeJS, socket, real-TTY, challenge and incomplete hardware/
benchmark/Astra/verified Reddit-Poe research gates remain separate. Pre-existing
work and historical evidence are preserved. Changes remain local; no push.

### September 13–14: native justification and the captured Python value blocker

**PROGRESS; overall browser goal remains ACTIVE.** Commit `3b85a5b` implements
bounded inter-word `text-align: justify`: eligible soft-wrapped lines share
expanded advances across text, inline geometry, paint and hits; final/forced
lines and intrinsic widths remain unchanged. Source-listed separators include
NBSP. Preserved whitespace is not expanded, and mixed tab lines retain the
tab-anchored prefix. General shaping, hanging-edge rules and all tab cases are
not claimed complete. See `TEXT-JUSTIFICATION.md`.

The final focused gate passes **569/0/0**, including 34 new cases. The full
selected native gate passes **21,551/0/2 unchanged skips** on September 13,
23:54:35.196–23:59:36.704 UTC: 420 selected files, 419 strict roots, 774 manifest
entries, 354 unselected. Compilation, strict tests, formatting and complete
source/runtime inventories pass. Independent verification completes September
14 at 00:01:46 UTC. Historical failed iterations remain recorded, including the
19 parser-only failures; one old negative fixture intentionally changes to
still-unsupported `match-parent`. Existing unrelated work is preserved.

The unchanged eight-resource Python replay runs **September 14,
00:04:34.776–00:04:34.897 UTC**, makes **zero HTTP requests**, and reduces CSS
value issues 1→0 and total formatting issues 27→26. The discovered Tutorial
click still fails on four property occurrences, sticky position and overflow;
all other diagnostics and formatting metrics remain unchanged. This is neither
a fresh complete capture nor successful full-page geometry/paint/click evidence.
Native owners close, private directories are removed and the process group is
absent. Wikipedia and kernel.org are not rerun in this cycle.

One separate bounded W3C CSS Text source GET succeeds on September 13, followed
by native offline extraction; it returns the August 14, 2026 CRD, not a verified
latest-edition claim. Exact scope, remaining gates and dates are recorded in
`TEXT-JUSTIFICATION-WEBSITE-SEPTEMBER-13.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FORTY-THIRD-UPDATE.md`.

Next: investigate the remaining hyphenation properties and sticky/overflow
integration, then original-resource live flows and separate performance work.
Credential/provider/device/passkey, SafeJS, socket, real-TTY and challenge gates
remain separate. Hardware/benchmark/Astra/verified Reddit-Poe research remains
incomplete. No push; earlier evidence keeps its original paths and measurements.

### September 13: rounded CSS reaches painting, hit testing and captured-site replays

**PROGRESS; overall browser goal remains ACTIVE.** Commit `ee3d3c7` implements
physical corner shorthand/longhands, computed/inline CSSOM, variables/cascade,
shared normalized curves, actual curved solid/dashed/groove rings, background
and replaced-content clipping, generated boxes, equal-height LTR slices and
matching native hit regions. Deferred table/flex/grid decomposition retains the
metadata. Ordinary descendants are not unconditionally clipped. Clone,
unequal-height slices and rounded fieldsets with rendered legends remain explicit
limitations; source requirements are not represented as broader conformance.

The isolated focused gate passes 887/0/0, including 184 new cases and 703 unchanged
adjacent cases. The full selected native gate passes **21,517/0/2 unchanged skips**
at 23:16:29.388–23:21:28.820 UTC: 419 selected files, 418 strict roots and 773
manifest entries; 354 remain unselected. Runtime/source audits and exact retained
residuals pass. See `ROUNDED-CSS-DOCUMENT.md`.

Three unchanged captured-site checks make zero new HTTP requests:
- Python: eight original fixtures, 72,064 bytes, one discovered Tutorial click;
  property issues 7→4, but the click still fails on remaining value/position/
  overflow and property guards. All other issue counts/formatting metrics remain.
- Wikipedia: original 119,573-byte portal, property issues 85→65; input geometry
  remains unsupported. No asset expansion, action or successful live flow.
- kernel.org: original HTML and two stylesheets only, raw/applicable CSS issues
  61/25→53/20. Eight raw/five applicable radius occurrences disappear; all other
  property-attribution objects remain identical. The copied historical checker
  rejected its stale 57-count expectation; a separate evidence-only checker
  validates the exact delta, without rerunning the browser. The earlier live
  request-cap failure remains incomplete and unchanged.

All three observation processes exit zero with unchanged source/runtime/fixture
and framework inventories, empty private-directory cleanup and independently
absent process groups. That is not native click/geometry or live-site acceptance.
Details: `ROUNDED-WEBSITE-REPLAYS-SEPTEMBER-13.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FORTY-SECOND-UPDATE.md`.

Next: remaining website CSS/layout blockers, full original-resource live flows,
and repeatable varied-site performance. Credential/provider/device/passkey,
SafeJS, socket and real-TTY gates remain separate. Hardware/benchmark/Astra/
verified Reddit-Poe research remains incomplete. Historical evidence and
pre-existing work are preserved; commits are local, with no push.

### September 13: shared rounded curves and exact kernel CSS attribution

**PROGRESS; overall browser goal remains ACTIVE.** Commit2f1e208 adds immutable
used rounded-box geometry, one-factor all8radius normalization, derived inner
curves without renormalization, shared containment/spans and native rectangle/
image clipping. Source scaling, alpha and alias handling remain intact. Work is
charged before paint mutation. **Page-level border-radius remains unsupported**
until CSS/cascade, curved border rings, generated/fragment/canvas and native hit
paths are integrated; this foundation does not remove website guards.

Actual native gate22:37:11.585–22:42:08.259UTC: **21,333passed/0failed/2unchanged
skips**,416selected/415strict/770manifest,354unselected. Build/strict/scopedformat/
source checks pass;1315source/2140compiled/1309unchangedtrackedinputs.71newcases:
45geometry/26raster. Geometry-only108/0/0; combined13file462/0/0 includes391unchanged
existing cases. Read-only geometry review found no concrete issue, not live proof.
Two preparation assertions caught a nonexistent guessed adjacent-test filename
before any test or snapshot; actual css-math-core/border-core selections are used.

Kernel original CSS attribution at22:33:59UTC makes zeroHTTP/image-fetch/decode/
geometry/action/raster/script calls. Original HTML plus both unchanged stylesheets:
61raw/25applicable CSS diagnostics;57raw/21applicable property/value occurrences,
zero reconciliation mismatches. Five applicable rounded-property occurrences and
four background-image pipeline values are identified, without claiming winners.
Two selector failures retain conservative applicability; stale lastWork53values
are excluded and full query allowances reserved.95queries/532436charged work,
38records/114references; missing unfetched images are not unsupported-image proof.

Native20receiptledger7f4142966fbfb2eb8524096fca8c9e5a3cce8cb20ac23180ffdab24030b97f50.
Attribution33entryledgerbecf2d1dc326e32f1080ba83151ff473423bc0bb5b69e65b16abe000f49468a9.
Parent source/runtime/history/framework checks and cleanup pass; attribution group
1006634absent. The old kernel live request-budget failure stays unchanged. No
Python/Wikipedia/kernel full-resource live flow is rerun by this foundation gate.

Separately, one native W3C CSSBreak3 GET200 at22:42:50UTC plus one offline parse
clarifies defaultslice versus clone: unbroken decoration then slicing, versus
independent fragment decoration; broken edges follow the parent's inline direction.
Returned document is December4,2018 CR, not latest claim.171462decoded/32270encoded
bytes,11651excerpt units, no redirects/assets/scripts or rendering. Unequal-size
slice percentage-radius geometry remains unresolved; source is not implementation.
Groups1012605/1012694absent; parent7ledgers/7031entries verified.66entryledger
e16927811b4fbd95869297903fe3b0f4c7d347bc302dc4143d9b019562d5e5cb.

Details: ROUNDED-GEOMETRY-PAINT.md, KERNEL-CSS-ATTRIBUTION-SEPTEMBER-13.md,
ROUNDED-FRAGMENT-SOURCE-SEPTEMBER-13.md and websiteinventory41.
Next: real CSS/radius/border/fragment/hit integration, original-
asset pointer flows and repeatable varied-site performance. Hardware/benchmark/
Astra/verified Reddit-Poe research and separate credential/provider/passkey-device/
SafeJS/socket/TTY acceptance remain open. No push; old edits preserved.

### September 13: kernel.org original assets reach the scoped request limit

**PROGRESS; overall browser goal remains ACTIVE.** A new bounded native live
kernel.org check at22:16:40.351–22:16:45.071UTC makes10HTTPS GETs, all200,
65903decoded/49123encoded bytes, minimum502.21ms wire-start spacing. Original
homepage/two stylesheets/seven images are retained unchanged. The next original
image is denied locally before an eleventh request; the probe stop latch prevents
homepage commit. **No About discovery, geometry, formatting, click or navigation
acceptance.** This is a scoped request-budget failure, not an observed remote block.

Native partial load:857nodes,151CSSrules;42property/15value/2at-rule/2selector issues.
Seven original images complete; final image is blocked by the count guard. One
native script query finds none; no execution/credentials/devices/SafeJS/TTY, POST,
retry, resource skipping or fallback. Do not interpret10HTTP200s as a site pass.

Uses the already audited21,262/0/2cursor runtime; no new native test run. Before/
after source/runtime/framework checks match. Childexit1, processgroup997129absent,
owners/queues close, empty private HOME/TMP removed. Parent independently verifies
4ledgers/3509entries at22:20:48.996UTC. Live guard is JS, not an OS network seal.
46entryEVIDENCE SHA36e2315d11df8d2da335e5ebd79c464347dd37e639ac81d76528b8402cccae9c;
SEAL.json separately hashes toa258ce6505d5cba0c6bb1e22f06c75ea0df5e1f033865923720fb89a34166f9c.

Details: KERNEL-NATIVE-SITE-SEPTEMBER-13.md and websiteinventory40. Next: native
offline CSS attribution on retained original sources, rounded shared paint/hit
geometry, and a separately scoped complete original-asset/pointer test. Never
silently widen this exhausted live authorization or omit the missing resource.
Rounded integration notes identify all background/border/control/image/SVG/fragment
and hit-region paths; no radius implementation is claimed. Broader research and
separate acceptance gates remain open. No push; pre-existing edits preserved.

### September 13: cursor semantics and exact remaining CSS attribution

**PROGRESS; overall browser goal remains ACTIVE.** Native cursor keywords now
participate in parsing/cascade, inheritance, variables, CSSOM/computed styles and
generated metadata. All36keywords supported; URL/image cursors still rejected,
no physical/system cursor rendering. Cursor does not disable clicks or focus.

Actual native gate21:54:05.253–21:59:01.715UTC: **21,262passed/0failed/2unchanged
skips**,414selected/413strict/768manifest,354unselected. Build/strict/scopedformat/
source checks pass;1311source/2132compiled/1302unchangedtrackedinputs.93newcases;
identical13file focused593/80/0→673/0/0,80improvements/0regressions. Read-only review
found no concrete gap within scope; it is not runtime or live acceptance.

Native Wikipedia CSS attribution at21:35:10UTC exactly reconciles97property and
24value diagnostics across76records/36properties. Cursor12, radius20 and sprite
position21 occurrences guide real implementation. Other11CSS diagnostics remain
outside that attribution.57922charged query work includes conservative stale work
on2selector failures, not an exact unique-work count or benchmark. Logo e51's asset
was not fetched by this single-body profile; no unsupported-PNG conclusion.

One native W3C sourceGET200 at21:45:27UTC reads CSS Backgrounds and Borders Level3,
returned March11,2024 CRD,544031decoded/79214encodedbytes. Native bounded extraction
establishes radius grammar/normalization and border/padding/content paint/hit curves.
Inline fragmentation remains a source gap. **Rounded rendering not implemented**;
no latest-spec, challenge-bypass or full-conformance claim.

Python fresh unchanged-resource baseline21:55:33UTC and cursor replay22:02:48UTC:
property issues8→7, Tutorial native click still blocked. Same669boxes/8965formatwork;
stylework93886→94741, not a speedup. Wikipedia unchanged-body replay22:04:29UTC:
properties97→85,totalissues199→187,CSS132→120,formatwork20974unchanged; **fullgeometry
still unsupported**. These replays make zeroHTTP; no source/style stripping.
Early Wikipedia preparation pin/write-once failures are preserved; no browser
probe ran until the corrected fresh lane. Historical evidence remains unchanged.

Source/runtime/fixture/framework/history ledgers and cleanup verified; no guard or
process attempts, recorded groups absent. Native20receiptledger
fbf9508c3f0a8b95c92b808c6bd9b62b91fe3c593e737f174bf6f223790580b3.
Details: CURSOR-STYLING.md, CURSOR-WEBSITE-REPLAYS-SEPTEMBER-13.md,
WIKIPEDIA-CSS-ATTRIBUTION-SEPTEMBER-13.md and websiteinventory39. No push; old edits
preserved. Next: real rounded paint/hit clipping, remaining CSS/layout gaps,
original-asset pointer flows and varied-site performance. Hardware/benchmark/Astra/
verified Reddit-Poe research and separate credential/provider/passkey-device/
SafeJS/socket/TTY gates remain open.

### September 13: line-edge geometry resolves Wikipedia's remaining alignment

**PROGRESS; overall browser goal remains ACTIVE.** Commit03cbad9 implements real
top/bottom margin-box alignment for retained inline atomic/replaced boxes and
eligible generated atomics. Shared line extents drive float fitting and final
fragments; signed margins/leading, baseline independence and real geometry/raster/
hit/click-point behavior are tested. Non-atomic aligned subtrees remain guarded.
The minimum-height baseline policy is deterministic, not cross-browser pixel proof.

Native attribution at21:09:43UTC identifies Wikipedia e53 heading/bottom, e234
search wrapper/top and e522 rich button/top; all are inline-block. One native
load/query/formatting,1174element inspections,seven generated reads; zero HTTP or
geometry/actions/raster. Source unchanged; no guessed alignment attribution.

Final native gate **21,169passed/0failed/2unchangedskips**,413selected/412strict/
767manifest,354unselected;21:22:52.490–21:27:49.463UTC. Build/strict/scopedformat/
source checks pass,1310source/2132compiled/1300unchangedtracked inputs.72newcases;
identical18file focused925/62/0→987/0/0. Initial fixture/obsolete-guard failures
and the failed21166/1/2full round remain preserved; no test exclusions conceal them.

Wikipedia unchanged119573-byte replay at21:28:05UTC: alignmentguards3→0 and total
formattingissues202→199;CSS132unchanged,work20971→20974. Same2708nodes/2250boxes,
input/button/fieldset identities and generated footer styles. **Fullgeometry still
unsupported.** One geometry request, zero HTTP/actions/raster; not a search pass.
Remaining CSS/value/selector/media, overflow, element/direction and coordination
diagnostics are retained. Other websites are not rerun in this checkpoint.

Native20receiptledger1888d06212c2bfb4e3169916ed8dee937bfd0a6a1b471f00276042272d4a995f.
Attribution31entryledger878d4f8617f19c163d4a6ae8eb29a3632c6f162c84a4a7148906cdfecb34ad07.
Replay31entryledgerf87a23153b08b808bb94c6e01fd844799f297ec72b5a868d8650b423f6bd82dc.
Source/runtime/history inventories and actual closure verified separately. The
single0.30s/121064KiB replay is not a benchmark or speedup. No push; old edits stay.

Details: INLINE-EDGE-ALIGNMENT.md, WIKIPEDIA-INLINE-EDGE-REPLAY-SEPTEMBER-13.md,
websiteinventory38. Next: native attribution of actual remaining CSS/element/
direction/overflow requirements, then genuine implementation and original-asset
pointer acceptance. Python/Internet flows, varied live sites, repeatable performance,
four research topics and credential/provider/passkey-device/SafeJS/socket/TTY gates
remain open. No source/style removal, fake geometry or challenge bypass.

### September 13: real inline-middle geometry across Python and Wikipedia

**PROGRESS; overall browser goal remains ACTIVE.** Commite5bcc24 implements
parent-font-x-height/margin-box middle alignment for retained inline replaced and
atomic boxes, including generated atomics. Actual line extents and fragments move
together. A reproduced nested inline-flex baseline dependency leak is fixed without
clearing required baseline guards. Non-atomic inline middle, top/bottom and other
unsupported profiles remain explicit. No source/style removal or fake geometry.

Final native gate **21,097passed/0failed/2unchangedskips**,412selected/411strict/
766manifest,354unselected,20:47:46.337–20:52:41.223UTC. Build/strict/scopedformat/
source checks pass;1308source/2128compiled/1301unchangedtrackedinputs.
55newcases; identical focused tests741/44/0→785/0/0. Actual earlier failures and
corrected test assumptions remain preserved; no test exclusion conceals them.

Native CSS22 source: oneGET200 at20:40:32UTC,87037decoded/16235encodedbytes, one
liveparse and one sealedofflineparse, onequery/12098excerptunits. Returned document
Last-Modified is April8,2016, not a latest-spec claim. Source confirms margin-box
alignment to parent baseline/x-height; native x-height comes from existing font
metrics. No source rewriting, stripping, resources, scripts or reference raster.

Python unchanged eight-resource replay at20:52:54UTC: inline guards2→0, but genuine
Tutorial click still fails on8CSSproperties/1value/position/overflow. Same853nodes/
669boxes; work8294→8965, stylesunchanged. **ZeroHTTP, no navigation pass.**
Wikipedia unchanged119573-byte replay at20:57:04UTC: alignmentguards32→3; total
formattingissues231→202, CSS132unchanged, work18685→20971. Fullgeometry still
unsupported. That comparison includes intervening features, not an isolated A/B.
**ZeroHTTP/actions/raster; remaining3alignment cases need native attribution.**

Native20receiptledger1f434980f05634ca3ccb43b729bf639d4edec8db7d9a95dd35ff8bfe8bdd1dbb.
Python28entryledgerabefacf7e6b1ccb4201d208996f5c29c811593a6472d4f138512182409029fe4.
Source/runtime/fixture/framework evidence and closure verified separately; no
historical report overwritten. Single0.25s/109.55MiB Python and0.31s/117.37MiB
Wikipedia observations are not benchmarks or speedups. No push; old edits remain.

Details: INLINE-MIDDLE.md, PYTHON-INLINE-MIDDLE-REPLAY-SEPTEMBER-13.md,
WIKIPEDIA-INLINE-MIDDLE-REPLAY-SEPTEMBER-13.md, websiteinventory37. Next: exact
remaining Wikipedia alignment attribution, Python/Internet CSS and real original-
asset/pointer flows. Broader functionality/performance/research and separate
credential/provider/passkey-device/SafeJS/socket/TTY gates stay open.

### September 13: native legends unblock the HTTPBin public form

**PROGRESS; overall browser goal remains ACTIVE.** Commitc60b133 adds rendered
legend ownership/fit-content sizing/vertical allocation and a legend-local border
gap. Shared intrinsic sizing fixes percentage-padding double counting; extraction
movement is budgeted before mutation. Normal-flow simple static legends with zero
block margins and unconstrained auto-height fieldsets are supported. Other legend
profiles and general fieldset conformance remain explicit limits.

Final native gate: **21,042passed/0failed/2unchangedskips**,411selected/410strict/
765manifest,354unselected, at20:13:59.593–20:18:53.793UTC. Build/strict/scopedformat
and source checks pass;1306source/2124compiled/1291unchangedtrackedinputs.
90newcases (43borderexclusion/47legend); identical focused tests581/84/1→665/0/1.
Initial failures, five review regressions and superseded broader results remain
retained; no new exclusion or browser-limit relaxation conceals them.

At20:20:13UTC the unchanged captured HTTPBin form reaches native click+submit and
a valid synthetic POST intent, deliberately denied by the offline guard. Two
legend deferrals become zero. **ZeroHTTP; offline flowPassed remains false.**
Separately, at20:22:57.507–20:22:57.891UTC, a fresh native full-loader GET and
genuine pointer POST both return200; the exact eight synthetic entries echo and
the session commits the destination. **This bounded live form flow passes.**
No fallback, page edits, omitted resources, scripts, credentials or extra HTTP.
2requests/2213responsebytes/259msstartspacing; single0.38s/93.73MiB is not a benchmark.

Native primary prose still has ambiguous border-gap min/max wording. The retained
SVG's geometry/order supports a local gap by inference only; text/dash/marker
limitations prevent faithful native diagram rasterization. Both source reads
are zeroHTTP. Source/runtime/framework ledgers and cleanup are independently
verified; all recorded process groups absent. Historical evidence unchanged.

Runtime: native-fieldset-legend-september13-round01,20receiptledger
5975ff847221e0f0cd90512ff5e4c42d70366693cea4e88540f956d85798ddb5.
Live31entryledger839759fb32cfa08c1c56cd847520d7576d8083ece7da9bf4d0e01ef6d4968300.
Details: FIELDSET-LEGEND.md, HTTPBIN-LEGEND-FORM-SEPTEMBER-13.md and website
inventory36. No push. Next: varied original-asset/pointer website flows, including
Internet/Wikipedia/Python; repeatable performance and requested hardware/benchmark/
Astra/verified Reddit-Poe research. Credential/provider/passkey-device/SafeJS/
socket/TTY gates and the broader browser goal remain open.

### September 13: groove/time rendering and remaining HTTPBin legends

**PROGRESS; overall browser goal remains ACTIVE.** Commit7e2734d implements real
native groove border parsing/geometry/relief paint and distinct time-value
appearance, with119newcases. Time remains native-agent-fill-only: no text caret,
segmented keyboard editor or picker. Visible legends and border interruption are
not implemented; HTML time width/height hint compatibility also remains limited.

Final isolated native gate: **20,952passed/0failed/2unchangedskips**,409selected/
408strictroots/763manifestentries,354unselected, at19:35:05.248–19:39:58.997UTC.
Build, strict, scoped format and source checks pass;1304source/2124compiled inputs,
1289unowned tracked inputs match parent2ed8556. Final focused pair has identical
tests: baseline1070/99/1 versus candidate1169/0/1. The single focused exclusion
already exists in the broader gate; no new skip is introduced.

Failed00configurations, initial focused935/5, broader truncated ENOBUFS output and
round01's20947/5/2 remain preserved. The harness buffer grows from6,000,000bytes to
bounded10MiB, not a browser-limit relaxation. Four obsolete negative fieldset
fixtures now use real visible legends; the default intrinsic-profile case checks
actual supported ownership. No production guard is weakened to satisfy them.

Captured native HTTPBin attribution confirms2pxgroove fieldsets and time min11:00/
max21:00/step900. A bounded native retained CSS-source read supports groove relief,
not universal pixel coefficients. Neither operation makes a fresh HTTP request.
At19:40:06.979–19:40:07.155UTC, an unchanged-harness replay preserves the1397-byte
body,8synthetic preparations and19events. Formatting advances43→91visitednodes,
53→112boxes; fieldsetse28/e52 andtimee85 no longer defer. Visiblelegends e30/e54
now cause the two remaining deferrals, and the genuine pointer submit still fails
before pointer/submit events. **Zero HTTP, zero POST, no fabricated echo.**

New audited runtime: native-public-form-rendering-september13-round02. Its20receipt
ledger is215aa98b779e7a4c161fe5bd897a42c803ae965321514e72ac6eda2eb6f9ec93.
Replay28entryledger63375ffdae664d1a724778128d7c7f3d86ce6b7dafdae4e0382f1df232748834.
Source/runtime/framework/fixture pins and clean closure are verified; recorded
offline groups absent. Single0.17s/88.53MiB observation is not a speedup/benchmark.

Next: real visible-legend selection/ownership/sizing/placement and interrupted
border paint, then unchanged captured-form pointer flow before fresh live echo.
Broader site/functionality/performance/research and credential/provider/passkey-
device/SafeJS/socket/TTY gates stay open. No push. Details: PUBLIC-FORM-RENDERING-
PREREQUISITES.md, HTTPBIN-RENDERING-PREREQUISITES-SEPTEMBER-13.md and website inventory35.

### September 13: HTTPBin public form, working values and blocked pointer submit

One fresh native BrowserSession GET of `https://httpbin.org/forms/post`,
18:51:40.726–18:51:40.878 UTC: HTTP200,1397bytes,96nodes,zero externalCSS/images,
no native access/challenge/login diagnostic. No credentials, retries, redirects
or POST. Initial live harness fails after loading because `formControls` returns
nodes, not IDs; this is preserved as a harness mistake, not a browser defect.

Corrected zeroHTTP native captured-body preflight,18:54:27.493–18:54:27.668UTC,
passes eight synthetic text/tel/email/time/textarea/radio/checkbox preparations,
with19untrusted preparation events. One genuine native pointer submit fails before
pointer/submit events: element-layout-not-supported3. Native deferred references
are fieldsets e28/e52 and input[type=time] e85. No outboundPOST reaches the adapter,
no echo is fabricated, and no semantic-submit fallback occurs. Captured HTML is
exact; only retained allowlisted headers are replayed, not full-header parity.

Existing fieldset support explicitly excludes default groove painting and visible
legend/interrupted-border layout. Time value preparation works but visual control
support is missing. These are next implementation leads; do not silence guards or
replace the actual form controls. See `HTTPBIN-NATIVE-FORM-SEPTEMBER-13.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-FOURTH-UPDATE.md`.

Both failed executions are sealed with clean native-owner/process cleanup and
runtime/source/compiled/framework/fixture verification. One-sample live/offline
measurements0.14s/85.22MiB and0.17s/88.48MiB are not speedup or full-flow latency.
Runtime unchanged: previous20672pass/0fail/2unchangedskips,402selected/401strict/
760manifest/358unselected; no new native-suite run or production changes here.

Overall goal ACTIVE. Implement real rendering for the observed form and revalidate
the native pointer path before additional live echo traffic. Internet/Wikipedia/
Python full interactions, broader coverage, repeatable performance, safe access
handling, hardware/benchmark/Astra research freshness and verified Reddit/Poe
opinions remain unfinished. Credential/provider,passkey-device,SafeJS,socket,TTY
gates remain separate. Pre-existing edits and historical evidence are preserved;
no push.

### September 13: native box-sizing aliases and unchanged-harness checkbox replay

Implemented explicit `-moz-box-sizing` / `-webkit-box-sizing` aliases using real
canonical native parser/cascade/CSSOM state and existing geometry; shared Webkit,
webkit and Moz host accessors retain canonical indexing and revocation. No general
prefix stripping, CSS filtering, fake geometry, new engine or dependency.
See `CSS-BOX-SIZING-ALIASES.md`.

Two new suites contain 134 cases. Identical-test final baseline: 526 passed /
126 failed / zero skipped; candidate: 652 passed / zero failed / zero skipped.
Initial 524/128 and 650/2 results remain preserved; the latter's two stale
word-wrap property-count assertions used 73 although the canonical list already
had 114 entries on both runtimes. Corrected expectations retain exact canonical
index/name and alias-exclusion checks. Four existing suites add 140 previously
unselected cases, not newly authored tests.

Fresh selected native gate, 18:28:39.480–18:33:30.400 UTC: 20,672 passed / zero
failed / two unchanged skips; 402 selected files / 401 strict roots / 760 manifest
entries, leaving 358 unselected. Build, strict, scoped formatting and immutable
source/compiled checks pass. The host-object ceiling and unsupported-display
media-fallback exclusions remain. Evidence:
`node_modules/.cache/native-validation/native-box-sizing-alias-september13-round00/`.

One new-runtime full-asset checkbox replay, 18:33:38.576–18:33:38.993 UTC, retains
all four historical HTML/CSS/PNG responses (391,809 bytes), the exact action
harness and native resource limits. Zero HTTP. Applicable property guards 11→8;
raw property diagnostics 374→359. Semantic inversion/restoration passes, but one
genuine pointer click still fails before events. Formatting observations and the
remaining at-rule/selector/layout guards are unchanged. One instrumented offline
run records 0.41 seconds and 134.36 MiB peak RSS, not a performance improvement.
Details: `INTERNET-CHECKBOX-BOX-SIZING-SEPTEMBER-13.md`; inventory update 33:
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-THIRD-UPDATE.md`.

Overall goal ACTIVE. Internet/Wikipedia/Python full interaction gates, broader
website coverage, repeatable performance, safe access-block handling and research
remain unfinished. Two native skips, unselected suites and separate credential,
passkey-device, SafeJS, socket and TTY gates remain open. No push. Pre-existing
uncommitted edits are excluded from the focused feature and evidence commits.

### September 13: current Internet checkbox HTML and full-asset pointer evidence

Broadened beyond Wikipedia/Python. This is an existinghost, not newcoverageclaim.
OnefreshnativeGET https://the-internet.herokuapp.com/checkboxes at18:07:13.359–.485UTC
returns200/2008bytes, byte-identical toSeptember11HTML. NoCSS/images/scripts/auth/
redirects/retries. Separateoffline nativeparse confirms e56false/e60true, both
enabled,forme54withoutmethod/actionattributes. This is source-only, not liveflow.

Faithful normalBrowserSession replay retains allfour391809-byte HTML/CSS/PNG
resources and0HTTP. At18:03:10.789–18:03:11.209UTC semantic e56false→true→false
passes with6untrustedevents. Exactlyone genuine session.click fails widthresolution
onCSS at-rules8/properties11/selectors2;0pointerevents,stillfalse. Nofakegeometry,
CSSdropping/actionsubstitution/retry. Sixgeneratedtable pseudos have realtable
shellmetadata, butfullpagepointeracceptance remainsFAIL. Oneinstrumented run:
0.41selapsed/134656KiBRSS(131.5MiB),aboveprovisional100MiB;notrepeatablebenchmark.

Separate0action/0HTTP nativeCSSattribution accounts forall11properties: two
text-size-adjustvendoroccurrences,threebox-sizingaliases,unknown-selectorappearance,
cursor,interpolationmode,*zoom,direction,text-rendering. Tenconfirmedmatches,one
conservativeunknownpseudo match. Two unsupported selectorlists areWebKitsearch/
Mozfocusinner. Sevenkeyframes+onefontface areapplicable;printpageisnot. TwoCSSroots/
382141units,1685scannedrules,1613stylequeries/141802work,sharedparser1659/3402.
Preserve threeincompleteinstrumentationattempts. FinalusesexactnativeCSSstyle API
withper-branchlimit,notDOMsyntaxwhole-listpreflight;noenginelimitincrease/guarddrop.
Finaldiagnostic18:08:01.531–.891UTC. Allsource/runtime/fixture/frameworkpins and
cleanupverified;live64receipts,replay28,eachdiagnostic30. Runtimeunchanged20398/0/2;
no productionchanges ornewnative-suiterun. Preserveoriginalreports/dirtywork.

NEXT: genuineCSSproperty/selector/font/animationcompatibility,invalidlegacyCSS
handling and repeatablememory/latencymeasurement;then recheckactualpointerwithout
substitution. Morevariedliveflows/access-restrictionhandling,researchfreshness/
verifiedReddit-Poe andseparatecredential/passkeydevice/SafeJS/socket/TTYgates stay
open. Nofingerprintspoofing/challengesolving/push.GoalACTIVE.
SeeINTERNET-CHECKBOX-REPLAY-SEPTEMBER-13.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-SECOND-UPDATE.md.

### September 13: generated native tables and actual Wikipedia footer replay

Native attribution identifies actual owner e2373/footer.footer's before/after
pseudos: content one ASCIIspace, static displaytable, nofloat, clearnone/both.
New generated tables use real anonymous table fixup, intrinsic layout/raster,
collapsed-border resolution and physicalclearance, not fake zero-sized blocks.
Whitespace-only generated table children avoid transient allocation; ordinary
table whitespace compaction remaps fieldset ownership links. Reviewed float
admission accepts only marked static blocktable shells; other guards stay.

85newtests(47format/38layout). Finalfocused baseline902/70→candidate972/0 across
27suites,zeroskips. Preserve allfourpairs and initialfullgate20397/1/2: its stale
table-clearnegative becomes actualcoordinate/glyph/immutability assertions;
flex/gridnegatives and23-case suitecount remain. Productionunchanged afterfirst
candidate. Finalnative20398/0/2unchangedskips,396selected/395strict/758manifest/
362unselected. Build/strict/format/sourceauditpass. Run17:51:24.281–17:56:12.212UTC;
1299source/2124compiled/1291unchangedtracked. Runtime
native-generated-table-september13-round01/snapshot01/dist; auditSHA256
462d19862c2f17120824b0501722e456050b4a44cd8a44719427d94e60b1db6b.

Wikipedia: same119573-byte portal,0HTTP at17:56:18.466–.771UTC;1load/3queries/
1format/1geometry/2generatedstylereads. Generateddisplay2→0,generatedclear1→0,
genericdisplay2→2,physicalclear4→5. Allformatissues233→231,boxes2252→2250,
work18689→18685,CSS132unchanged,deferred3unchanged. Geometry stillFAILS; actual
input/fieldset/richbuttonchildren and closed-dialog behavior retained.31receipts;
ledger061a527a1c2816259a3485f8e2cb2553e184b3dafec40f9bd460667f0a90a79a.
No freshsitevisit/search/raster/liveperformanceacceptance or researchrefresh.

NEXT: broaden real native navigation/form interactions with a bounded public-site
scope; retain firstfailedstage, no fakeCSS/geometry or mutationretries. Wikipedia
CSS/image/direction/inlinealignment/overflow remain; PythonTutorialclick stillfails.
Researchfreshness/verifiedReddit-Poe,performance,nativeskips/unselectedsuites and
separatecredentials/passkeydevices/SafeJS/socket/TTYgates remain. No spoofing,
challengesolving orpush. Preservepreexistingwork/historicalevidence.GoalACTIVE.
SeeGENERATED-CONTENT-TABLES.md,WIKIPEDIA-GENERATED-TABLE-REPLAY-SEPTEMBER-13.md,
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-FIRST-UPDATE.md.

### September 13: inherited underline offsets and two-site regression checks

Implemented separate inherited text-underline-offset through parser, CSSOM,
all/CSS-wide/variables, font/viewport computation and actual signed baseline-relative
underline pixels. Shorthand remains four components and never resets offset.
Preserve auto placement, originating decoration ownership, overline/strike-through,
geometry/clipping/ink skipping. No underline-position, vertical writing or generated
decoration support claim. Reuse already captured August17 CSSWG native sections;
no fresh source GET. Cold ancestor-style computation remains unmeasured.

136 new cases (84 style/CSSOM,52 raster). Corrected identical-test baseline740/143
and candidate883/0; all136 new cases fail baseline. Seven existing expectations
include the independent property. Initial882/1 stale cached-object expectation
failure remains recorded; its correction did not change production.
Native20313/0/2unchangedskips,394selected/393strict/756manifest/362unselected.
Build/strict/format/source stability pass. Run17:06:40.641–17:11:19.560UTC;
1297source/2124compiled/1287unchangedtracked; runtime
native-underline-offset-september13-round00/snapshot01/dist.

Python: same8captures/72064bytes/0HTTP at17:11:28.434–.691UTC. Real e375 Tutorial
click stillFAILS. ApplicableCSS9/1→8/1,raw57/6→54/6; cascade93872→93886 and
formattingunchanged. No destinationfallback, successfulnavigation or speedup.
Wikipedia: same119573-byte portal,0HTTP at17:15:09.981–10.288UTC; threequeries,
oneformat/onegeometry. Sincehistorical18046, CSSissues153→132 but geometry still
fails. Formattingboxes2238→2252,work16700→18689,deferred1→3; retain newlyexposed
generated-display/clear failures and realfieldset/richbuttonchildren. Cumulative
comparison, not attribution solely to offset; no search/raster/live acceptance.

NEXT: native attribution of Wikipedia's two generated-display subtrees and
generated-clear failure; varied-site real interactions and repeatableperformance.
Pythonjustify/hyphens+vendors/cursor/radii/inlinealignment/sticky/overflow remain.
Original research refresh and verifiedReddit/Poe opinions incomplete; native
skips/unselectedtests and separatecredential/passkeydevice/SafeJS/socket/TTYgates
remain. No spoofing/challengesolving/push. Preserve pre-existing work and all
historical measurements. GoalACTIVE. SeeTEXT-UNDERLINE-OFFSET.md, Pythonreplay
report andWEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTIETH-UPDATE.md.

### September 13: painted text-decoration thickness and two native source checks

Implemented noninherited text-decoration-thickness and four-component shorthand,
CSSOM/reset/inherit/customvariables, font/viewport-unit computation, retained
percentages/boundedmath and realstroke pixels. Usedexplicitwidthnearestinteger/
minimumone; preserveautoAgentMonosize/16 and existingplacement/geometry/inkskip.
No underlineoffset/newstyles/generated-decoration/fullCSS4claim.

Two fresh nativeGETs: W3CpublishedLevel4servesMay4,2022Draft(288319/44482bytes),
linkedCSSWGEditorservesAugust17,2026Draft(391569/67844bytes).EachHTTP200,0redirect,
0retry/subresource,one native reader,12complete sections. Sourceversion/table
inconsistencies remainexplicit;97sealedreceipts. No currenteditionguessing.

105newtests(60style/45raster); baseline639/108 → focused747/0. Preservefirstfixed
745/2test-assumption failures(xheightandresource-limit expectations), nohistory
overwrite. Native20177/0/2unchangedskips,392selected/391strict/754manifest,
362unselected.217additionalpassesinclude112previouslyunselectedexistingcases.
Build/strict/formatpass; run16:44:47.451–16:49:24.665UTC. Runtime
native-decoration-thickness-september13-round00/snapshot01/dist; source
3e4c454470fcfd394a42950b9f67aa88937043010a26401355818a5424306ab6,compiled
135b47b134ccac7024b8247f55afdab05c0bd0c931dc13ba9a2670515abbfd07.

Same8capturePythonreplay at16:49:34.790–16:49:35.043UTC,0HTTP/72064bytes,
853nodes/revision860/samee375Tutoriallink. ActualclickSTILLFAILS; nofallback.
ApplicableCSS9/2→9/1,raw57/7→57/6;rules584/declarations1075unchanged,
cascadework93132→93872; formattingunchanged. No speedup or fullrasterclaim.

OPEN: justify,hyphens+vendorvariants,cursor,radii,underlineoffset,inlinealignment,
sticky/overflow andactualclick; variedsites/interactions/repeatableperformance,
originalReddit/Poe researchgap, native skips/unselectedtests, separatecredential/
passkeydevice/SafeJS/socket/TTYgates. No spoofing/challengesolving/push.
Preserve927TASKSlines,3manifestadditions,parser10/10,declarations14/14,
computedstyles11/11,styles19/19pre-existingrearrangements andotherdirtywork.
GoalACTIVE. SeeTEXT-DECORATION-THICKNESS.md,source/replayreports andinventory29.

### September 13: native CSS nesting and same-capture Python regression

Implemented bounded native CSS nesting with immutable parent contexts, shared
selector ASTs, exact parent-list specificity, source-ordered declaration runs,
conditional groups, custom-property data, pseudo-target ownership and mutation
invalidation. No external browser, stylesheet rewriting or new dependency.

157new cases:41parser/64selector/52layout, including actual border geometry and
pixels. Initial127cases reproduce124baseline failures. Independent review finds
unsupported nesting escaping absent parents, namespace attributes incorrectly
advisory, and unsafe specificity rounding.19review failures now pass; final
focused951/0 and native19960/0/2unchanged skips. Build/strict/format pass.
387selected/386strict/752manifest;365unselected remain. Initialfailed attempts,
firstsuperseded19930gate and all original evidence are preserved.

Finalruntime native-css-nesting-september13-round02/snapshot01/dist; source
71c2f59fa78432d95c4c2b72eea3f022dc8de68054be9faa5b8a540f72d286f7,compiled
5d76d645410761cf11c9047bc093eae96260f47282c8de91efe4aee75c62e86c.
Run16:19:09.545–16:23:44.357UTC,1293source/2124compiled/1285unchangedinputs.

One same-eight-resource Python replay at16:23:52UTC:72064decodedbytes,0HTTP,
853nodes/revision860, samee375Tutorialclick STILLFAILS, no destinationfallback.
ApplicableCSS9properties/3values becomes9/2; raw54/9 becomes57/7, unhidden.
Rules579→584,declarations1071→1075,cascadework93131→93132; formattingunchanged.
The separateW3C Syntax replay covers3369complete textunits with0HTTP, resolving
the prior report's missingsection, not claiming fullCSSSyntax3/CSSOMconformance.

OPEN: remainingPythonCSS/alignment/sticky/overflow and successfulactualclick,
Go fullinteractions, repeatableperformance, originalReddit/Poe researchgap,
native skips/unselectedtests, CSSunknownfunctions/layer/scope/container.
Credentials/passkeydevices/TTY/socket/SafeJS requireseparategates; nospoofing,
challenge solving orpush. Preserve927pre-existingTASKSlines,3manifestadditions,
parser/style rearrangements and all otherdirtywork. GoalACTIVE.
SeeCSS-NESTING.md,PYTHON-CSS-NESTING-REPLAY-SEPTEMBER-13.md and inventory28.

### September 13: exact Python CSS attribution and Effective Go content coverage

One new native Effective Go GET returnsHTTP200,142913decoded/51485encoded bytes
at15:31:11.935UTC. Independent long-v1 reader/full-DOM loads both succeed with
60headings/123links/153pre/589code and24equal complete labels. Reader4259nodes,
DOM4328; partial/script/iframe/malformed-source diagnostics remain explicit.
Observed timings use unequal decoding boundaries and are not benchmarks. No
Go actions/layout/resources/scripts or repaired earlier homepage-click claim.

Native Python attribution on the unchanged eight fixtures now reconciles all
9property/3value diagnostics. Missing properties: hyphens plus3vendorvariants,
cursor,3border-radius declarations,text-underline-offset. Missing/invalid values:
justify,underline1px,and nested .good/.bad/.maybe pre rules inside div.body.
The exact rejected nested statement parses natively as3standalone border rules;
nesting is NOT implemented or installed into the page. Native ownership isolates
two middle-aligned inline images e283/e759; middle-aligned span e732 is block.

Final helper shares native8192rule/16384declaration budgets:576/1115actual,
29selectorqueries/12455work,853DOMnodes/51314CSSunits. All3actualTutorial clicks
still fail. Preserve initialwrongaccessor failure and round01per-call-budget
limitation; onlyround02 establishes shared-parser-bound acceptance. No newPython
HTTP, rawsourcegrep, CSSrewrite, extra geometry or productioncodechanges.

Last native19803pass/0fail/2skip is inherited, NOT rerun. Runtime remains
native-generated-clear-september13-round00/snapshot01/dist; source
9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619,compiled
86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9.
Fullpins/fixtures/frameworks/owner/private-directory/processgroup cleanup verified.

Separateone-nativeGET W3Ccss-nesting-1 HTTP200 at15:38:42.283UTC captures213027
decoded/39883encoded bytes. Reader3444nodes/12complete sections/22546textunits.
ObservedpublicationisJanuary22,2026WorkingDraft,NOTretrievaldate/latestclaim.
Sourcecoversparent-list specificity,sourceorderednesteddeclarations,conditional
context andpseudo-elementdistinctions. Fixedlabelselectionmissesformalrecovery
andpreciseimplicit-&algorithm; thosespecificclausesremainunverified. No second
load/fallbackorclaimofcompleteCSSnestingcontract. Seeprimarysourcereport.

OPEN: actualCSSnesting implementation and specificity/order/budget regressions,
otherPythonCSS/alignment/sticky/overflow,Go fullinteractions/resources/scripts,
reproducibleperformance,unit skips/unselectedcoverage andoriginalresearchgaps.
Separatecredentials/passkeydevices/TTY/socket/SafeJS gatesremain. No spoofing,
challenge solving orpush. Preservehistoricalevidence/dirtywork. Goal ACTIVE.

See PYTHON-CSS-ATTRIBUTION-SEPTEMBER-13.md,
GO-EFFECTIVE-NATIVE-CHECK-SEPTEMBER-13.md,
CSS-NESTING-PRIMARY-SOURCE-SEPTEMBER-13.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-SEVENTH-UPDATE.md.

### September 13: generated clearance and complete-asset Python replay

Implemented physical left/right/both clearance for normal-flow generated block
and flow-root boxes through the existing native float coordinator. Empty
clearfix, hidden layout, margins, relative offsets and origin hit ownership
have concrete geometry/raster regressions; unsupported generated floats,
logical block clearance and complex layouts remain guarded. No new dependency.

Final focused tests: 501pass/0fail/0skip; unchanged production baseline with
identical tests: 471pass/30fail, all failures in the new38-case suite. Preserve
the earlier test-only glyph-reference expectation failure and its correction.
Full selected native run: 19803pass/0fail/TWOunchanged skips,384suites/383strict
roots/749manifest entries;365unselected. Build/strict/format/native/auditexit0.
Native success is not acceptance of live, skipped or unselected gates.

Runtime native-generated-clear-september13-round00/snapshot01/dist;
baseea00b5b71952efeae0f7467e3c3280b9dc7471bb. Source inventory
9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619;
compiled86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9.
1290source/2124compiled/1285unchanged tracked inputs; no bundled dirty work.

One new native GET captured the exact missing docs.python.org/3/_static/basic.css
import: HTTP200,14685decoded/3390encoded bytes at15:03:52.901UTC September13.
No redirects/retries/subresources/credentials/challenges. Earlier seven-fixture
replay denied this import before transport; that missing fixture was not a site
rejection or proof of a browser CSS defect. Initial header-prototype harness
failure also remains preserved, not misreported as a failed website click.

Complete-asset native replay mixes seven unchanged September11 captures with
this September13 CSS. The baseline observes two empty static block ::after
boxes on UL owners e269/e745, both computed clear:both but missing formatting
clear metadata. Each actual Tutorial click outcome is tracked separately from
successful diagnostic execution; no direct target navigation substitutes for it.

After-proof at15:17:46.522–15:17:46.637UTC preserves the exact same eight inputs,
72064decoded bytes,853DOMnodes and669formattingboxes. Both generated boxes now
emit clear:both; generated-clear issues fall2to0, while raw coordinator clear
markers rise1to3. Both phases make zeroHTTP and oneactualclick, which STILL
fails on CSSproperty9/value3, inlinealignment2, stickyposition1 andoverflow1.
No furtherpagegeometry/raster success is claimed; nativefixtures proveactual
clearance separately. Exactbefore/afterguards/pins/cleanup remain recorded.

OPEN: Python click/layout/image and CSS/inline-alignment/sticky/overflow gates;
native skips/unselected coverage, whole-site resource/script behavior, measured
performance and four-topic research gaps. Separate credentials/passkey devices,
TTY/socket/SafeJS gates remain. No spoofing, challenge solving or push. Preserve
all historical evidence and dirty work. Overall browser objective stays ACTIVE.

See GENERATED-CONTENT-CLEAR.md, PYTHON-BASIC-CSS-CAPTURE-SEPTEMBER-13.md and
PYTHON-GENERATED-CLEAR-REPLAY-SEPTEMBER-13.md, plus
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-SIXTH-UPDATE.md.

### September 13: Python tutorial coverage and no failing executed selected tests

Fresh direct native GET of docs.python.org/3/tutorial/index.html: HTTP200,
36953decoded/7681encoded bytes, one GET/no redirects/retries/resources. One
long-v1 reader load succeeds:1087nodes/9headings/174links/0pre/11code, three
queries and24complete labels. No full-DOM fallback, link follow, geometry or
rendering. Earlier Python-homepage Tutorial click failure remains OPEN; direct
target retrieval is not a repaired click or image/layout acceptance.

Corrected the final selected table-source test's stale source-ID expectation,
without changing production code. Allowed ID now has a separate sentinel and
exact positive map; forbidden table/executable attributes and non-table metadata
exclusion checks remain. Same test names/counts and same manifest. Focused
baseline331pass/1fail; fixed332pass. Broad19765pass/0fail/TWOunchanged skips;
383suites/382strict roots/748manifest entries,365unselected. Both runner/auditexit0.
All executed selected tests pass, not every skipped/unselected test. No blanket
browser completion claim. All2124compiled production files match prior bytes.

Runtime native-reader-id-contract-september13-round01/snapshot01/dist;
base12197a6a1e469b2ab35416213a721464a965b4d5; sourceledger
91b3541762349300d8a13d49e432cf7528caaefe5dfe4b5b7de4cb9615678b8b; compiledledger
6d146c57138d241b8aca0b6aec0b9a875110188ad6220a3d6bd88a4fdf31c315. Full receipts and original failed preparation
remain. Python capture retains its original prior preflight-runtime provenance.
See PYTHON-TUTORIAL-NATIVE-CHECK-SEPTEMBER-13.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FIFTH-UPDATE.md.

OPEN: native skips/unselected coverage, Python click/layout/image issue, complete
website/CSS/script/resource behavior, reproducible performance and four-topic
research gaps. Separate credential/passkey/device/TTY/socket/SafeJS gates remain.
No credentials, spoofing, challenge solving or push. Preserve old captures and
dirty work. Overall browser objective remains ACTIVE.

### September 13: research element-target preflight and restored selector coverage

Fixed a real shared preflight regression: CSS before/after targets no longer
proceed into research navigation setup or replay receipt admission. An opt-in
parsed element-only mode preserves default CSS/generated matching and DOM-query
semantics, escaped literal colon text and link searches. All four research entry
points retain static non-echoing errors. No substring matching or new dependency.

Corrected baseline751pass/42fail; fixed793pass across9suites.55new cases and
118restored existing research-selector cases pass.13explicit union guards restore
strict compilation; four old ID/diagnostic expectations are updated to earlier
committed contracts without changing their case count or weakening exact limit
checks. Original failed attempts and diagnostic-kind correction remain recorded.

Broad gate19764pass/ONE unchanged table-source failure/TWO unchanged skips:
383selected suites/382strict roots/748manifest entries. Two prior selected
research-section failures now pass; the restored suite's two equivalent failures
also pass. Build/strict/format pass; source stable. Native runnerexit1/auditexit0,
NOT a green suite. Runtime native-research-element-preflight-september13-round00/snapshot01/dist;
base974a3bbca0ef0af3becf242f3f05bfd2370613f0; source ledger
bfc81f3308a3d35766e6b3911ac7a8bdf51af9d87364378edaec3d83925d917f; compiled ledger
6bec295291cc5a30586ce6de68e0229e13f356e49a67bb818701aab536689ce6.

No website requests or device/credential/SafeJS/TTY/socket probes this increment.
The previous actual website inventory remains twenty-fourth update. Local
RESEARCH-STATUS-SEPTEMBER-13.md audits original topics without fresh external
claims: hardware and benchmark evidence exists, historical Astra posts must not
be erased by later login failures, and verified Reddit/Poe opinions remain absent.
Full details: RESEARCH-PREFLIGHT-VALIDATION-SEPTEMBER-13.md and
RESEARCH-ELEMENT-PREFLIGHT.md. No push; unrelated dirty work preserved.

OPEN: final native baseline failure, full website/CSS/script/resource behavior,
whole-browser performance, research comparison/provenance/sampling gaps and
independent credential/passkey/device/TTY/socket/SafeJS gates. No challenge
solving or fingerprint spoofing. Overall browser objective remains ACTIVE.

### September 13: native generated positioning and W3C reader coverage

Implemented shared relative/absolute/fixed before/after formatting coordination,
out-of-flow blockification/static display, stacking and real DOM-origin hit targets
for boxless owners.67new regression cases all pass;11focused suites473pass.
Corrected unchanged baseline424pass/49new failures. Expanded manifest-selected
native gate19589pass/THREE unchanged failures/TWO unchanged skips:381suites,
380strict roots/747manifest entries.46existing pointer-event cases newly selected
and passing. Build/strict/formatter pass. Full suite remains NOT GREEN.

Exact retained TestPages HTML/CSS, zero HTTP, confirms all26absolute generated
labels at800/1280now have blockified display, actual absolute position and retained
inline-block static display. Position flags26→0; coordination markers1→27.
All other CSS/deferred/overflow/float issues remain; this is formatting handoff,
not full-page geometry/raster. Independent fixtures prove actual boxes/pixels.

New bounded native W3C centering-examples GET: HTTP200,20483decoded bytes;
reader484nodes,10headings,43links,11preformatted examples. OneGET, no linked
resources/scripts/actions; no conditional full-DOM fallback needed. This content
check uses the prior datetime build, not the positioning runtime. Full details:
W3C-CENTERING-NATIVE-CHECK-SEPTEMBER-13.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FOURTH-UPDATE.md.

Current audited runtime native-generated-position-september13-round00/snapshot01/dist;
base59e614469765f6e93e624637c9ce2788dc477694; source inventory
a4d0029f602923fa5a13a4e13bdf59b8fd6430adeae06d08f09ed47e9a8d9469; compiled inventory
d406e52942320f146b7844fdb6544ba44b7ab3c1691a7309e11db6e2c25bab3d. Evidence lanes remain under
node_modules/.cache/native-validation/, with exact hashes, guards, closed owners
and private/process cleanup. Prior failed fixture/preparation attempts retained.

OPEN: complete website rendering and performance, remaining CSS/flex/Grid/float
limitations, original four-topic research and crawler/challenge compatibility;
independent SafeJS, TTY/PTY/socket, credential/passkey and device gates. No
spoofing, challenge solving, real-secret access or push. Preserve prior dirty
work and historical reports. Overall browser goal remains ACTIVE.

### September 13: GOV.UK coverage and native datetime source metadata

New native-only live check: GOV.UK bank-holidays, one public GET, HTTP200,
175842 decoded bytes, no redirects/retries/subresources/cookies/credentials.
Native full DOM and semantic reader retain33tables,313rows and85links, but
the reader drops all280 machine-readable datetime declarations. This actual
site discrepancy motivates a shared reader/extraction fix, not rewritten HTML.

Reader now preserves raw datetime on unchanged HTML time/ins/del. JSON
extraction exports bounded dateTimeSource metadata automatically; Markdown
stays unchanged. Values are source declarations, not parsed/validated dates or
timezone inference. Per-value4096-unit and existing output/structure limits apply.
Hidden/foreign/executable/context-wrapper exclusions remain. Metadata-only
content counts only for non-whitespace values and is not rendered diagnostic text.

70new regressions pass; corrected baseline48fail/22passing controls. Focused
809pass/zero failures/skips across10suites. Expanded native gate19476pass,
THREE unchanged baseline failures, two unchanged skips;379suites/378strictroots/
746manifest entries. Includes63previously unselected existing text-line cases,
not63additional new feature tests. Build/strict/format pass; full suite NOT green.

Exact retained-source native reader/JSON before-after proof, zero HTTP:
280datetime declarations and280 JSON metadata records now match native full
DOM exactly, with unchanged5412reader nodes/5407extracted nodes and identical
metadata-stripped content/references. Larger output cost is recorded explicitly.
No full rendering, legal/calendar accuracy, SafeJS, action or credential claim.

Evidence: WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-THIRD-UPDATE.md and
DATE-TIME-SOURCE.md. Original research topics, browser performance/rendering,
challenge handling, live/device/TTY/socket/SafeJS/credential/passkey gates remain
OPEN. No challenge solving/spoofing, no push; unrelated dirty work preserved.

### September 13: responsive font-size math and bounded LiveBench research

Native font-size now accepts bounded calc/min/max/clamp expressions through the
existing CSS math evaluator. Parent percentages/em, root rem, inherited ex and
viewport units resolve to computed pixels, with final negative clamping and
existing resource limits. No new dependency or site-specific stylesheet rewrite.

New regressions: 74 pass; unchanged baseline 54 failures/20 passing controls.
Focused validation: 663 pass, zero failures/skips. Expanded selected native run:
19,343 pass, THREE unchanged baseline-confirmed failures, two unchanged skips;
377 suites/376 strict roots/745 manifest entries. Build, strict and format pass.
The full selected suite is NOT green; existing failures remain real failures.

Exact retained TestPages HTML/CSS, zero HTTP: native h1 is now 34px rather than
16px at width 800; the existing wide-screen media rule remains 40px at 1280.
All 15 unsupported font-size-math declarations are accepted; invalid CSS value
diagnostics fall 101 to 86. The 3153 DOM nodes and heading identity/text remain;
two expected viewport presentation invalidations are explicitly accounted for.
The failed wrapper, normalization attempt and first six-failure broad run are
preserved, not relabeled. Three related rejection tests now check the supported
math contract while retaining invalid math/line-height guards. Positioning,
overflow and full rendering remain OPEN.

Native-only LiveBench research: two public GETs succeeded under the prior ARIA
runtime. Website reader admits title only; text/plain README supplies methodology
claims and reporting limitations. Dated release claims are not latest-state
verification; no leaderboard scores, model evaluation or cross-topic inference.
The original four research topics and all broader browser/device/TTY/socket/
SafeJS/credential/passkey/live-site acceptance gates remain OPEN. No push.

Evidence: WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-SECOND-UPDATE.md,
FONT-SIZE-MATH.md and BENCHMARK-LIVEBENCH-RESEARCH-SEPTEMBER-13.md.

### September 13: reusable ARIA table metadata and native newline fidelity

Native reader preserves bounded explicit ARIA table/row/cell/header source
attributes on unchanged supported tags. Existing JSON tableMetadata exports
ariaTableSource without computed roles, header mappings, ownership resolution or
visualcolumn inference. HTMLmetadata/default node types remain separate. New
CRroundtrip regressions fixed by native newline preprocessing and re-escaping
decodedCR; originalsource-size accounting and output ceilings retained.

108newcases nowpass; baseline62fail/46controls. Focused917pass/3baselinefail.
Expanded native19269pass/3baselinefail/2unchangedskips,376suites/375strictroots/
744manifest. The fullsuite is NOTgreen: previously unselected research-section
has2oldpseudo-selector expectations and table-source has1oldglobal-id assertion.
They remainactual failures, not newskips; no unrelatedsource/test fixes.
Another previouslyunselected selector suite retains13strict typing errors outside
thisgate. Exactearlierfailedreceipts preserved. Source/compiledpins verified.

ZeroHTTP originalApple before/after:2426native/1475extractednodes unchanged;
0->81ARIArecords,1table/18rowheaders.3completerowdigests matchpriorfullDOM; stripped
JSONcontenthash identical. Oneafterreader+productionextraction, nofullDOMreload.
RetainedWHATWG:10816nodes/depth17/19headings/9tables andheadings unchanged. Owners
closed; no scripts/actions/credentials/SafeJS/TTY/devices/rendering claimed.

Contract ARIA-TABLE-SOURCE.md; receipts
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FIRST-UPDATE.md. Overallgoal ACTIVE.
Originalresearch/hardwareranking and fullsite rendering/performance, device and
human-challenge gates remainOPEN. Source metadata is not automatictable analysis.


### September 13: table-heavy website and Apple section extraction

Fresh WHATWG tables GET200,12:16:17.507UTC: exactbody native-reader10816nodes,
depth17;19headings/9tables/0column-groups.3queries/341956work;ownersclosed.
OneactualGET,no redirects/retries/subresources/credentials. Fullreport
WHATWG-TABLES-NATIVE-CHECK.md. This is readercoverage, not pagegeometry.

Retained Applebody from12:01:16.690UTC now yields associated Chip/Memory/
Electrical rows: initial heading-only selection missed native non-heading labels.
Two readerloads and one separately scoped fullDOMload,zeroHTTP,4queries/
106142work;41completeblocks/8839text acrossthreeboundedphases. Three complete
rowtextdigests agree acrossreader/fullDOM. Sourcecolumn associations, vendor
claims and limits are explicit; original title-only evidence staysunchanged.
Fullreport APPLE-CONFIGURATION-RESEARCH-SEPTEMBER-13.md.

All followups use audited18931nativepass/0fail/2oldexclusions build; no suite
rerun or rootdist rebuild. Receipts WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTIETH-UPDATE.md.
Overallgoal ACTIVE: research ranking/benchmarks/Astra/Poe, CSS/fullsite rendering,
credentials/passkeydevices/SafeJS/realTTY/challengehandoff remainOPEN. Next:
reusable non-heading section selection and actual-page CSS gaps, without
conflating source extraction with rendering or hardware measurement.


### September 13: verified reader column-group repair and hardware sources

Fixed the retained W3C Selectors reader failure at its root: a direct table's
omitted column-group end kept the reader stack in the wrong table ancestry.
Guarded closure restores row/cell/section bookkeeping without source rewriting,
raising limits, swallowing errors or relaxing orphan/malformed depth controls.

28newcases: baseline22fail/6pass controls; fixedfocused569pass. Canonical native
18931pass/0fail/2unchangedexclusions,371selected/370strictroots/742manifest.
FinalzeroHTTP originalbody replay: reader.depth129/128 -> successful22522nodes/
depth13,138headings/1table, match-against-tree sectionqueryable. Source/tokenprefix
unchanged;3queries/700859work; ownersclosed. Prior diagnostic-unit and tokenizer-
selection wrapper failures remain preserved, not rewritten as passing runs.

Native-only hardware research adds two freshGET200s: RTXPRO6000 workstation
capacity/power/formfactor rows and AppleMacStudio title-only evidence. No fresh
Appleconfiguration, hardware throughput, stock or value ranking is established.
Fullreport LOCAL-LLM-HARDWARE-RESEARCH-SEPTEMBER-13.md; native reader fix profile
RESEARCH-COLUMN-GROUPS.md; receipts WEBSITE-TEST-INVENTORY-SEPTEMBER-13-NINETEENTH-UPDATE.md.

Overallgoal ACTIVE. The specific reader defect is verifiedfixed; next targeted
research: Appleconfiguration association and matchedhardware comparisons.
Originalbenchmark/Astra/Poe topics, fullsite rendering, generatedpositioning,
credentials/passkeydevices, SafeJS, realTTY and humanchallengehandoff remainOPEN.


### September 13: generated content, real CSS recovery and a reader-depth gap

Implemented bounded modern/legacy before/after selectors, independent pseudo
cascade/substitution, string content, ref-less formatting and real native text/
empty-box rasterization. DOM/query/action/source-range identity stays unchanged.
Unsupported positioned/floated/effect/item layouts remain explicit. Real retained
CSS exposed a pseudo float-diagnostic ownership mismatch; fixed at its source,
with two additional regressions rather than suppressing unsupported layout.

Final focused1019pass; native18903pass/0fail/2unchangedexclusions,370selected/
369strict roots,741manifest entries. Native fixture pixels and range/caret tests
pass. Rootdist not rebuilt; prior dirty work preserved. See GENERATED-CONTENT.md.

ZeroHTTP TestPages comparison: selector failures169->43, raw173->46;31generated
boxes+31textnodes now retained; body/table universal box-sizing recovered.
Fullpagegeometry stillunsupported; fonts, positioned/floated pseudos and other
pagegaps remain. Earlier replay-label and float-ownership failures are preserved.

Three native source GETs to W3C CSSPseudo/Selectors/CSSContent return200. Source
extraction is not rendering acceptance. Selectors researchreader stillfails
reader.depth129/128 while originalbytes parse as22686nodes/depth13 through the
fullnativeDOMpath. This is a real reader-path discrepancy, not authorization or
Cloudflare refusal. Next: isolate implied-end/stack bookkeeping with bounded
native regressions, without increasinglimits or rewriting source evidence.

Overallgoal ACTIVE. Originalfourresearchtopics, fullpage rendering, credentials/
passkeydevices, SafeJS, realTTY and humanchallengehandoff remainOPEN. Full audit,
sourcegaps and website receipts: WEBSITE-TEST-INVENTORY-SEPTEMBER-13-EIGHTEENTH-UPDATE.md.


### September 13: native validity selectors and a fresh public form

Implemented :valid/:invalid through the existing native validator, with form
ownership, fieldset descendants, barred-control exclusions and live value-sensitive
styling. Charged control-index preparation and operation-local state/subtree
memoization retain work and memory ceilings. Unsupported constraints remain
explicit; known invalid aggregate members do not fabricate successful flags.

All51new selector cases fail on the unchanged runtime. Corrected focused gate:
876pass; canonical native18655pass/0fail/2unchanged exclusions,366selected suites/
365strictroots,737manifest entries/371unrun.58new cases and227existing validation
cases newlyselected. Rootdist and pre-existing dirty work remain untouched.

A native-discovered HTML Form link leads to one actual200GET at10:50:38.186UTC,
160810decodedbytes, no redirects/retries/challenge/credentials. The page contains
3233nodes,2forms and240controls. Exact-byte audited before/after replay changes
unsupported validity queries into239valid/0invalid matches, cross-checked against
237native candidates and2forms;3controls areexcluded. No values are emitted and
no fills/actions/submissions occur. No required attributes or invalid matches
exist in this captured page, so live required-invalid feedback remains unproved.

The unchanged real table stylesheet loses26validity-selector failures: formatting
selector diagnostics195to169, rawselectors199to173. Newly nonmatching rules also
stop contributing conservative property/value warnings; those features are not
implemented. Formattingwork remains192948 and fullgeometry still fails.

See `SELECTOR-VALIDITY.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-SEVENTEENTH-UPDATE.md` for dates, hashes,
source-scope limits and preserved failed attempts. Next prioritize the actual
pseudo-element/mixed-list and resource gaps, plus a genuinely invalid form example
and broader website/research coverage. Rendering, credentials/passkey devices,
SafeJS, realTTY and humanhandoff gates remain open. Overallgoalactive.

### September 13: real CSS diagnosis, MDN reading and reduced-motion support

A bounded zeroHTTP native diagnosis identifies the denied import as Google Fonts,
not an authorization or Cloudflare denial. The actual stylesheet has199 unsupported
selector rules, led by163 pseudo-element rules and26 validity rules, plus real
property/value/at-rule gaps. No source is rewritten or warning suppressed.

A fresh native MDN navigation uses exactly2GETs (same-origin301then200) and retains
331666decodedbytes. The full loader parses7795nodes; the semantic reader7528.
Both read the actual heading, but full-loader geometry remains unsupported by
missing stylesheet callbacks and HTML/element/SVG layout gates. No new rendering,
script, resource-fetch or device acceptance is inferred from successful reading.

Retained native Media Queries source confirms reduced-motion preference semantics.
The implemented fixedUA no-preference profile shares stylesheet/page matching,
including Booleanfalse and unchanged notifications across viewport changes.
It does not inspect OS settings, implement animations or add preference overrides.
Focused504pass; canonical native18370pass/0fail/2unchanged exclusions,359selected
suites/358strictroots,735manifest entries/376unrun. Existing87media cases are
newly selected;36new feature/page cases are added. Rootdist is not rebuilt.

An audited18370 replay of unchanged real TestPages HTML+CSS reduces actual media
diagnostics36to3 with no newHTTP; remaining conditions concern hover/pointer.
Known-inactive branches also reduce conservative selector/property diagnostics,
not their underlying unsupported syntax. Formatting work stays192948 and the
table still has no supported rectangle. Full site rendering is not complete.

See `REDUCED-MOTION-MEDIA.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-SIXTEENTH-UPDATE.md` for dated evidence,
hashes, unchanged failures and scope. Next prioritize actual selector/pseudo-element
compatibility and explicitly scoped font/resource handling, with native fixtures
and fresh sealed real-document replay. Originalresearch, broader site coverage,
fullrendering/device/SafeJS/TTY/handoff gates remain open. Overallgoalactive.

### September 13: real stylesheet accepted, wider compatibility gaps exposed

One initial capture fails locally before networking: explicit omit cookie context
needs an initialized native jar. The separate corrected harness uses a fresh
empty in-memory jar with credentialsomit, no Cookie header/storage callback and
zero cookies before/after/close. One native GET returns367810decoded/62160encoded
CSSbytes; native SRI helpers verify the actual capturedSHA256. This is a same-
origin basic response, not cross-origin CORS or website-rendering acceptance.

A new audited18247 zeroHTTP replay installs that exact sheet for native link72
through the normal resourcepolicy/loaderintegrity path. The main resource/callback
diagnostics clear. Its imported resource triggers a second denied policy callback
outside the one-captured-resource scope; only1resource response is read. The final
exact-one-callback assertion fails honestly with exit1. Native geometry separately
returnsunsupported: actual CSS exposes196property/199selector/29value/14at-rule
formattingdiagnostics plus import and other layout gaps. Default style limits are
not exhausted; no rewriting, raster, scripts or actions fake a complete result.

The separate retained-source dt/dd extraction closes the missing inline-joining
source pair with11blocks/2242units, zeroHTTP, audited18149. Scope is backgrounds/
border-image; ordinary dash-phase mapping remains a limitedLTR inference. Both
earlier failed source lanes remain unchanged. See the fifteenth September13
website inventory for dates, hashes, failures and narrower verified outcomes.

Next inspect the denied import and exact unsupported CSS rules through bounded
native diagnostics, then implement real compatibility improvements. Fresh-site
coverage, originalresearch, fullrendering/device/SafeJS/TTY/handoff gates stayopen.
No new production changes or native audit rerun in this follow-up; overallgoalactive.

### September 13: native dashed-border layout and paint

Actual dashed declarations now parse, retain used widths and paint through box,
replaced-image and inline-fragment paths. The native UA pattern is square-ended
3width dash/3width gap; clipping preserves phase, simpleLTR inline slices carry
charged cumulative width, and alpha corners retain single-side ownership.
Other styles, cloned decorations and collapsed-table dashed conflicts stayguarded.

55new cases plus43newlyselected existing border-core cases. Redbaseline45pass/
21fail; initialfocused751/2 then753/0; initialbroad18246/1 exposes stale CSS.supports
expectation, now true. Finalfocused829/0/0 across19suites/19strictroots. Finalbroad
18247/0/2 unchanged exclusions across357suites/356strictroots,734manifest/377unrun.
Build/strict/format/sourceintegrity and1258unchangedtrackedinputs verify.

New unchanged-byte TestPages replay computes e2598 top/bottom borders as dashed1px
and clears both CSS value diagnostics. Formatting work230608/3894boxes/3073visited
and table/caption ownership remain unchanged. NoHTTP/resources/raster/actions;
geometry still rejects the two missing-stylesheet/policy-callback requirements.
The real native session already has policy-aware loading; keep SRI/CORS checks.

Two freshnative W3C source GETs retain dashed definition and slice/parent-direction
rules. Both offline source attempts retain honest exit1 for optional/fullcoverage
failures; no general fragmentation or latest-specification claim. SimpleLTR
painting tests do not establish RTL/bidi/vertical or complete standards support.
Further definition-list extraction and observed stylesheet capture are separate
follow-ups. See DASHED-BORDERS.md and the fourteenth September13website inventory.
Rootdist/unrelateddirtywork preserved; no push. Original research, realdevice/
SafeJS/TTY/handoff and fullsite gates remainopen; overallgoalactive.

### September 13: TestPages style failures narrowed to real causes

New native-only retained-page diagnosis loads3153nodes, makes3selectors and uses
45849query-work units. Its own CSS parser inspects442source units and retains
63diagnostic units. The embedded358-unit/3-rule stylesheet is issue-free; both
CSS value diagnostics are div e2598's dashed thin green top/bottom borders.
The supported native border profile remains none/hidden/solid; implement dashed
geometry/rendering deliberately rather than suppressing these authored values.

Link e72 is a same-origin stylesheet with anonymous CORS and SHA256integrity.
The replay deliberately has no resource callbacks; that explains the callback
and unloaded-stylesheet diagnostics, not an absence of all native SRI/CORS support.
The actual session already supplies the policy-aware callback. Resource-backed
validation remains separate and must retain integrity/CORS checks. This run
makes0HTTP/resources/geometry/raster/actions and is not website rendering success.
See TESTPAGES-STYLE-DIAGNOSIS.md for observed attributes, exact evidence and next
work. Runtime pins/cleanup/closed owners verify. Overallgoal and separate gatesopen.

### September 13: reader anchors recovered and caption scan removed

An identical-byte full-loader/reader comparison proves both real CSSOM dfn
anchors exist in the full native DOM but disappear in the old semantic reader.
The reader now preserves passive dfn and empty opening-position point anchors
for other non-omitted unwrapped tags. Active/foreign subtrees stay omitted;
point anchors do not wrap or retain unknown-element semantics. Output/node
limits still apply.29new cases cover projection, fragments, omissions and limits.

Formatting construction indexes table nodes with charged insertion/enumeration,
avoiding the all-node caption scan.9new cases cover scaling, ownership, anonymous
tables, compaction, unsupported profiles and resource failure/recovery.
Red baseline7pass/31fail; final focused815/0/0 over15suites/15strictroots.
Broad18149/0/2 unchanged exclusions covers354suites/353strictroots and732manifest
entries, leaving378unrun. Build/strict/format/source integrity pass;1261unchanged
tracked inputs audited. Three obsolete dropped-ID assertions now require distinct
point anchors without changing child ownership; no new exclusions.

New native-only CSSOM replay recovers both exact method targets and6source blocks,
2006code units, verifying requested table/caption/content-order/bounding rules.
It uses retained bytes, not a new download. The initial comparison harness failure
and old failed source extraction remain at their original paths with real exits.
Separate unchanged-byte TestPages replay lowers formatting work234223→230608
(3615units, about1.54%) with equal boxes/ownership/styles/diagnostics. This is not
wall-clock speed evidence. Whole-page geometry still returns unsupported for
stylesheet integrity/CORS, unloaded stylesheet and CSS values; no rectangle.
Both replays use zeroHTTP and verify runtime pins, cleanup and closed owners.

See READER-POINT-ANCHORS.md, TABLE-CAPTION-WORK.md and the thirteenth September13
website inventory for exact evidence and limitations. Investigate real stylesheet
and CSS gates without weakening policy; continue varied-site coverage separately.
Original research topics, password/passkey devices, SafeJS, realTTY and human
challenge handoff remain open. Rootdist/unrelated work unchanged; overallgoalactive.

### September 13: actual table-caption wrappers and client geometry

Captions now flow around a real native table grid inside an anonymous wrapper.
Margins/relative offsets/floats belong to the wrapper; borders/padding/background
remain on the grid. Caption minimums constrain sizing, percentage bases remain
distinct, and actual grid/caption boxes contribute to table client geometry.
An alignment review exposed dropped align-content metadata; four isolated
reproductions fail before the correction and pass through the existing block path.

Two suites add65 cases. The original61-case red baseline gives7pass/54fail;
the supplemental alignment baseline gives0pass/4fail/44unselected pending.
Final focused573/0/0 covers16suites/16strictroots. Broad18111/0/2 unchanged
exclusions covers352suites/351strictroots,730manifest entries and378unrun suites.
Build/strict/format/source integrity and1253 unchanged tracked inputs pass.
Root dist, historical evidence and unrelated uncommitted work remain untouched.

Fresh native CSS22 source reading confirms separate wrapper/grid ownership;
its CAPMIN auto-width recipe is explicitly non-normative. The unchanged-byte
TestPages replay now retains grid e3000 and caption e3002 under a real wrapper.
Caption and collapsed-border diagnostics clear; the table's raw coordination
shell remains. Whole-page geometry still fails on stylesheet integrity/CORS,
an unloaded stylesheet and two CSS values. No rectangle/raster/action or speed
success is claimed. Replay HTTP0; prior failed17962 evidence keeps its exit1.
An additional native CSSOM capture succeeds, but its semantic-reader algorithm
anchor query returns no match and the offline lane exits1 without excerpts.
Independent CSSOM rectangle-source verification remains open; possible dropped
anchors in unwrapped reader elements require a separate evidence-led diagnosis.

See TABLE-CAPTIONS.md and the twelfth September13 inventory. Next, investigate
the actual stylesheet/CSS requirements and reduce avoidable caption bookkeeping
without changing ownership. On the real page formatting work rises230592→234223;
those counters are not a benchmark. Preserve source bytes and admission guards.
Inline-table, absolute/fixed and flex/grid-item tables, complete caption UA/
positioned behavior, broader website/performance work, original four research
topics, credentials/passkey devices, SafeJS, realTTY and human challenge handoff
remain open. The overall browser goal stays active.

### September 13: fresh public table page exposes remaining layout gates

One native public navigation to TestPages follows its observed same-origin301
to the current HTML-table page:2 GETs, HTTP200,158955 decoded bytes. This uses
the separately pinned17962 runtime, not the new18046 button runtime. One sealed
offline load observes3153 nodes,1 table,5 rows and10 cells;3 queries cost54166
work units. The table geometry request fails unsupported and exits1. External
CSS/integrity, invalid CSS values, collapsed-border and caption diagnostics
remain explicit; no table rectangle or rendering success is claimed.

Source/runtime hashes, absent processes, closed offline owners and empty
private-directory cleanup verify. No retry, source rewrite, scripts/resources,
interaction, credentials or alternate browser. See the eleventh September13
inventory. Next, isolate the real table/caption constraints and stylesheet
requirements; do not treat diagnostic categories as independently proven causes
or remove guards to obtain a rectangle. All broader gates remain open.

### September 13: real rich-button content and percentage minimums

Rich HTML buttons now retain genuine child formatting, geometry, hit targets
and raster content in supported block/inline/float/flex/block-grid profiles.
Source-backed UA defaults and auto fit-content sizing preserve author cascade
and one outer owner. Buttons do not borrow the fieldset padding-transfer model.
Used intrinsic border-box minimums now resolve percentage padding against the
actual containing width; cyclic intrinsic measurement keeps its zero basis.

Two new suites add84 cases. The78-case baseline reproduces59 failures; the
six-case inherited-minimum reproduction adds4 failures on the earlier rich-button
implementation. Final focused699/0/0 covers19 suites/19strict roots. Clean broad
18046/0/2 unchanged exclusions covers350 suites/349strict roots,728manifest
entries and378 unrun suites. Build/strict/format/source integrity and1247
unchanged tracked inputs pass. Root dist and unrelated dirty work are preserved.

The sealed identical-byte Wikipedia replay now retains button e522 and its
actual child e524. Deferred subtrees fall2→1; the logo remains unsupported.
Traversing genuine children also exposes another vertical-alignment issue.
Whole-page geometry still fails; no pointer, raster, submission or speed success
is claimed for this page. No new HTTP occurs in this replay; earlier failed
and diagnostic evidence keeps its original paths, measurements and hashes.

See BUTTON-CONTENT.md and the tenth September13 website inventory. Absolute/fixed
buttons, flex/grid items, inline-grid and plain/rich appearance/inset consistency
remain open. Next work must continue genuine layout and website coverage rather
than relabel diagnostics as rendering acceptance. Full fieldset/legend, Selenium
CSS/color/range, original four research topics, varied-site performance,
credentials/passkey devices, SafeJS, realTTY and human challenge handoff remain
open. The overall browser goal stays active.

### September 13: rich-control diagnostics retain the real formatting tree

Unsupported rich HTML buttons now return no software descriptor and become
explicit deferred formatting nodes, consistently with other unrepresentable
controls. This preserves full-tree diagnostics without flattening children or
admitting their geometry. Plain controls and resource errors are unchanged.

New17-case regression coverage first reproduces6 failures on unchanged source.
Expanded focused335/0/0 covers10 suites/10strict roots. A related legacy test is
updated to expect a deferred node while retaining all layout/geometry/raster/hit
failures; no exclusion is added. Its original broad failure remains recorded.
Clean broad17962/0/2 unchanged exclusions covers348 suites/347strict roots from
726manifest entries, leaving378 unrun. Build/strict/format/source integrity and
1254 unchanged tracked inputs pass; root dist and unrelated work are untouched.

A fresh offline Wikipedia replay now completes formatting and retains the
search input under genuine fieldset content ownership. Logo and rich button
remain deferred; whole-page geometry remains unsupported. Traversal exposes
more real content and issues rather than hiding them. The earlier failed17945
replay retains its original exit1 and missing tree; no HTTP or source rewrite.

A separate sealed native reading of the retained WHATWG source establishes
button display/context, auto fit-content and UA alignment requirements; it is
not a rendered conformance test. See RICH-CONTROL-DEFERRAL.md, the ninth September13
inventory, and rich-control-deferral-work-september13/BUTTON-NEXT.md. Implement
actual rich-child button layout next, not another diagnostic-only milestone.
Full fieldset/legend, Selenium CSS/color/range controls, original four research
topics, varied-site performance, credentials/passkey devices, SafeJS, realTTY
and human challenge handoff remain open. The overall browser goal stays active.

### September 13: fieldset content implemented; rich-button blocker exposed

Legend-free fieldsets now have genuine outer/content ownership, zero used outer
padding, transferred padding with the original percentage basis, and a native
min-content minimum. HTML UA defaults preserve author overrides and foreign
namespaces. Supported simple-border normal-flow fieldsets are admitted; visible
legend, default groove, absolute/fixed/floated and flex/grid fieldsets remain open.

The two new suites reproduce51 failures on unchanged source, then pass all82
cases. Focused712/0/1 explicitly excludes one legacy intrinsic-grid expectation
that also fails independently on unchanged production. Broad17945/0/2 unchanged
exclusions covers347 suites/346strict roots from725manifest entries;378 remain
unrun. Build/strict/format, source integrity and1247 unchanged tracked inputs
pass. Root dist and unrelated uncommitted work are preserved.

The identical-byte Wikipedia replay does not pass: fieldset traversal reaches
a rich button and throws unsupported before completing formatting or calling
geometry. The failed after process exits1 and remains recorded. No after-tree,
search-input rectangle, pointer or full-page rendering success is claimed.
Runtime pins, closed native owners, process termination and private cleanup
verify independently of that failed website acceptance gate.

A fresh native Selenium public-form GET returns200. A sealed inspection finds
one form,17 controls and15 labels, but geometry fails for intentionally unfetched
stylesheets and deferred color/range inputs. No submission, values, credentials
or scripts are used. This is additional capture/inspection coverage, not a
renderer pass; it uses the prior audited17863 runtime and retains exit1.

See FIELDSET-CONTENT.md and the eighth September13 website inventory. Next:
implement rich-child button layout from native-captured standards context and
replay the unchanged portal again. Complete fieldset/legend/default decoration,
varied-site performance, all original research, credentials/passkey devices,
SafeJS, realTTY and human challenge handoff remain open. No fingerprint spoofing
or automated CAPTCHA solving is added. The overall browser goal remains active.

### September 13: closed-dialog visibility corrected

One new native WHATWG rendering-chapter GET returns200; a separate bounded
reader operation retains fieldset/legend and dialog source context. Fieldsets
need genuine outer/content-box ownership, intrinsic sizing and legend/border
handling; removing their deferred guard is not an acceptable implementation.

An independent UA-default bug is fixed: closed HTML dialogs now default to
display:none, open dialogs to block, with author cascade/foreign namespace
behavior preserved. Visible/open/modal dialog layout remains deferred. The new
23-case suite first reproduces11 failures on unchanged production code; fixed
focused validation passes373/0/0 across8 suites/7strict roots. The snapshot suite
still runs behaviorally with its pre-existing strict-root typing omission.

Clean broad17863/0/2 unchanged exclusions covers345 suites/344strict roots from
723manifest entries. Build/strict/format/source integrity and1249 unchanged
tracked inputs pass. Unrelated import ordering and three old manifest additions
remain outside the owned changes. Root dist is not rebuilt.

Two offline native replays of identical Wikipedia bytes verify that its closed
dialog stays queryable but no longer creates a formatting node: deferred3→2,
boxes2208→2207, with other issue counts unchanged. Search-field ownership still
fails under fieldset, and both geometry requests remain unsupported. No source
rewriting, fabricated rectangles, interactions or HTTP occurs in that comparison.

See DIALOG-DISPLAY.md and the seventh September13 website inventory. The full
fieldset implementation map is retained in the fieldset-dialog work lane as
FIELDSET-NEXT.md; complete fieldset/legend, other rendering gaps, varied-site
performance, all original research, credentials/passkey devices, SafeJS, realTTY
and human challenge-handoff acceptance remain open. No fingerprint spoofing or
automated CAPTCHA solving is added.

### September 13: live forms and actionable layout errors

Five fresh native wireGETs exercise Bing search and Wikipedia's real form flow.
The native portal field fill and requestSubmit reach the article through two
observed redirects, closing the old document. This is HTML/form/navigation
coverage without asset/script callbacks, not rendering or pointer acceptance.
Bing is readable but none of its ten decoded result destinations is Reddit;
Poe-opinion research remains unresolved. A separate archived native replay now
retains all14 Datacenter-table rows and98 cells with their actual td label row.
MLPerf version/round alignment and original research completion remain open.

The captured portal's first pointer-geometry check fails before any action or
raster. Independent native inspection identifies eight actual width-blocking
categories and a search input whose fieldset ancestor is deferred. Existing
position/float coordination markers and advisory media diagnostics are not
misreported as additional missing engines. No guard suppression or CSS rewrite.

Width errors now include bounded blocker codes/counts while retaining rejection.
Four new tests are included in291/0/0 focused results; broad17840/0/2 retains the
same two exclusions across344 suites/343strict roots out of722manifest entries.
Build, strict, format, source immutability and1249 unchanged tracked inputs pass.
One offline captured-page check using audited17840 verifies the useful error;
geometrySupported remains false. Earlier live probes use audited17836, not the
later code. Root dist was not rebuilt. All previous failure evidence is retained.

See LAYOUT-WIDTH-DIAGNOSTICS.md and the sixth September13 website inventory.
Next rendering work must address real fieldset/control ownership and independent
CSS/overflow/alignment/direction gaps rather than inventing rectangles. Overall
website/performance/research, credential/passkey-device, SafeJS, realTTY and
human challenge-handoff gates remain open. No CAPTCHA/fingerprint spoofing work.

### September 13: bounded offline replay CLI implemented

New scripts/research-replay-cli.ts exposes existing validated reader replay via
stdin/stdout with independent host profile/receipt/body pins, one explicit
selector/section/link mode, byte/chunk/output bounds, deadline/cancellation and
buffer/stream cleanup. It accepts no input path and performs no network retry or
fallback. This makes archived research usable without repeatedly fetching pages.

The original Wikipedia body confirms that existing reader image alternatives
retain the formula and inlineN/i even while29MathML subtrees are omitted. Raw
DOM extraction still loses those alternatives under its unchanged visibility/
aria-hidden policy. The new CLI preserves the reader result without weakening
raw hidden/inert/aria-hidden admission. Reader hiddenContentSemantics:false is
explicit; neither mathematical rendering nor full visibility fidelity is claimed.

Focused843/0/0 across9 suites includes95new cases; clean broad17836/0/2 unchanged
exclusions covers344 suites/343strict roots out of722manifest entries. Build,
strict,format and source checks pass;1252source/2080compiled and1249unchanged
tracked inputs are audited. One actual stdin/stdout CLI run of the saved pinned
Wikipedia receipt exits0 with25964outputbytes, preserved alternatives, closed
document, stable source/runtime and zero network/process guard attempts.

See RESEARCH-REPLAY-CLI.md for exact interfaces, limits and separate evidence.
Overall website/performance/research, credential/passkey-device, SafeJS, realTTY
and human challenge-handoff gates remain open. No new public HTTP this increment.

### September 13: GitHub policy and Wikipedia functionality checked

Two fresh public native GETs return200 using the audited17741 runtime. GitHub's
original policy fragment remains unmatched; one offline native parse finds
prefixed source IDs, not an exact target. Policy content is readable, but no
script/alias/retry workaround or full GitHub acceptance is claimed. Selected
scenario/division rules advance benchmark research; version/eligibility and
unselected audit details remain unresolved.

Wikipedia's original Evaluation fragment resolves in the reader. A separate
raw native parse explicitly establishes its own target, extracts the bounded
heading section and39 links, stopping before the next section. Reader math
omission and missing mathematical content in extraction remain fidelity gaps.
No scroll/rendering/script or full-site acceptance is claimed. No retry,
credentials, device, SafeJS, realTTY or challenge solving occurred. See
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FOURTH-UPDATE.md for original receipts and
distinct HTTP/target/extraction outcomes. The overall browser goal stays active.

### September 13: heading/section rate-limit coverage corrected

A fresh unchanged-source run reproduces the four legacy HTTP429 expectation
failures (264pass/4fail/no exclusions). Their assertions now require stopping
before heading/section extraction rather than extracting from a429 document.
Production handling is unchanged. Sixteen additional native/reader cases cover
asset-bearing bodies, capture on/off, Retry-After and simultaneous confirmed
header challenges, with one request, omitted credentials and closed owners.

Focused validation passes496/0/0 across five explicit manifest suites; strict,
format and source immutability pass. The formatting-only first attempt remains
preserved. See RESEARCH-RATE-LIMIT-COVERAGE.md. This later update supersedes the
four legacy cases' current status, not the historical reports below. The previous
17741/0/2 broad gate remains historical; no new broad audit or live acceptance
is claimed from these tests. Original research, site compatibility/performance,
credential/passkey-device, SafeJS, realTTY and human handoff gates remain open.

### September 13: research fragment navigation implemented

The research CLI accepts bounded fragment-bearing public URLs instead of
rejecting discovered links before transport creation. Both raw and normalized
navigation URLs remain bounded; network/credential/private-address/redirect
policies are unchanged. The semantic reader now retains inert IDs and named
anchors, enabling the native session's existing target selection. Metadata
records requested/effective serialized-fragment digests and resolution without
raw fragment strings or another DOM scan. Default extraction remains whole-
document; explicit :target selector/heading-section extraction is supported.
Evidence/replay and long-output failure projection preserve bounded provenance.
No scroll, script-driven tab, text-directive or complete browser behavior claim.

Focused validation passes2614/0/4 across17files, including238new cases. The four
focused exclusions are old HTTP429 expectation failures independently reproduced
on unchanged audited source (264pass/4fail across two legacy suites). They remain
unmodified and are not disguised as successes. Those legacy suites were not in
the prior broad selection. Initial missing-reader-ID and obsolete blanket-
fragment-rejection failures are preserved and corrected at their actual causes.

Clean broad gate passes17,741/0/2 unchanged exclusions:343selected suites,
342strict roots,721manifest entries (378not run). Build/strict/format/source
checks pass;1250source/2076compiled files and1239 unchanged tracked inputs audited
in native-research-fragment-september13-round00. New tests verify that fragment
selection cannot bypass challenge classification or cause retry after429.

Native MLPerf overview and submission-guide source visits returned200 in
separate bounded runs using the older17503 runtime. They improve partial
benchmark-methodology research, not benchmark execution or proof of current
round eligibility; documentation inconsistencies remain. Live regression of
the original NVIDIA fragment-bearing URL is separately scoped to the new audited
runtime; website evidence must not be inferred from unit-test counts.

Overall browser/website/performance goal remains active. Original hardware,
benchmark, Astra and Poe/Reddit research, credential/passkey-device, SafeJS,
realTTY and human challenge-handoff acceptance remain open. Pre-existing dirty
work stays separate; no push. See RESEARCH-FRAGMENTS.md and inventory updates.

### September 13: native font-style implemented

Author font-style normal/italic/oblique now inherits through the existing CSS
cascade, custom properties and live CSSOM. Agent Mono paints actual synthetic
slanted regular/bold ink, with transformed clip bounds and unchanged logical
geometry/hit regions. Text controls, image alternatives and textual markers
receive the style; geometric controls do not. Decoration ink skipping accounts
for slanted cells. Native matching treats italic as a synonym for oblique while
preserving the computed keyword, as permitted by the retained primary source.
No true italic face, explicit angle, UA tag default, synthesis control, external
font or new runtime dependency is claimed. See FONT-STYLE.md.

Focused isolated checks pass966/0/0 across23files, including127new cases. The
original media/italic fixtures now render slanted pixels without moving boxes.
The clean broad gate passes17,503/0/2 unchanged exclusions:340selected suites,
339strict roots,718manifest entries (378not run). Build/strict/format and source
checks pass;1246source/2072compiled files and1232 unchanged tracked inputs are
audited in native-font-style-september13-round01. The initial zero-size test
fixture failure and the first broad run's two obsolete italic-rejection
expectations remain preserved. Their fixtures and unrelated guards are retained.

Original SQLite offline replay passes: raw unsupported properties18→15,
applicable properties12→11. Six selector issues, eleven float flags and one
overflow flag remain, with no CSS-value failures. The element-style census finds
179normal/twoitalic computed elements, not a visible-rendering claim. Source DOM,
post-install presentation and runtime inventories are unchanged, owners close,
and no HTTP/image/used-layout/raster/script call occurs. No whole-site pass.

Retained CSS Fonts4 native-source work verifies the unqualified oblique14degree
default and the synonym-matching condition for italic synthesis. The initial
partial extraction and follow-up topical-selection defect remain documented;
neither is misrepresented as new live HTTP or full font-matching compliance.

Overall website/performance/crawler-friction work remains active. Original
hardware/benchmark/Astra/Poe research, credential/passkey-device, SafeJS, real
TTY and human challenge-handoff gates remain open. Native unit passes do not
close them. Preserve pre-existing dirty work; no push.

### September 13: native text decoration implemented

Author-CSS text-decoration and line/style/color longhands now have a bounded,
non-inherited computed style group with shorthand reset and normal cascade/vars.
Real native solid underline/overline/line-through paint preserves originating
font/color, propagates through boxes, survives descendant none, and respects
atomic/out-of-flow boundaries, visibility and relative positioning. Native ink
skipping, descendant inline edges, wrapped spacing, clipping and work accounting
are exercised without changing layout or hit regions. No UA defaults, non-solid
styles, runtime dependencies or modern skip-ink property support is claimed.

Focused native checks pass490/0/0 across14suites, including113new cases. The two
original unsupported-profile cases now paint correctly without changing fixture
bytes. Clean broad native gate passes17,376/0/2 unchanged exclusions:337suites,
336strict roots,715manifest entries (378not run). Build/strict/format/source checks
pass;1242source/2068compiled files and1231 unchanged tracked inputs are audited
in native-text-decoration-september13-round00. An import-merge setup failure
remains preserved; it ran no tests.

Original SQLite offline replay01 passes. Applicable unsupported properties fall
15→12; raw properties fall24→18. Six selectors, eleven float flags and one
overflow remain; CSS-value failures stay absent. Raw DOM and post-install
presentation are stable, owners close and runtime inventories match. No HTTP,
image, used-layout, raster or script call in the replay: no whole-site pass.
The first replay's incorrect count assertion and a sealed prose-count mistake
are preserved with an explicit erratum; prefix counts are not full-site counts.

One actual native-browser GET of the W3C text-decoration source returned200;
one sealed native parse extracted32containers with stable runtime inventories.
The served document is the May5,2022 Level3 draft, freshly retrieved September13,
2026—not a claimed 2026 standards revision or application rendering pass.

The broader website/performance/crawler-friction goal remains active. Hardware
research browsing is continuing separately; the original four research topics,
credentials/passkey-device, SafeJS, real TTY and human challenge handoff remain
open. Original dirty work stays separate; no push. See TEXT-DECORATION.md.

### September 13: native font-family fallback implemented

Native font-family lists preserve requested computed names while matching the
actual available Agent Mono face through ordered named, generic or default
fallback. All eleven supported generic keywords use the single native face;
quoted generics remain names. Both CSS declaration paths preserve case and quoted
whitespace. Text and ex metrics use the selected face, with proper parent/own
dependencies. Bounds cover both input and normalized output plus complete lists.
No external font installation, generic visual fidelity or new runtime dependency
is claimed. See FONT-FAMILIES.md for the exact profile and remaining limitations.

Focused native validation passes792/0/0 across19suites, including121new cases.
Both original family rendering failures pass unchanged through geometry, raster,
hit testing and ex padding. The clean broad selected gate passes17,263/0/2
unchanged exclusions:334suites,333strict roots,712manifest entries (378not run).
Build/strict/format and source checks pass;1237source/2060compiled files and1218
unchanged tracked inputs are audited in native-font-family-september13-round01.
The first broad run's outdated family-name rejection test is corrected; its
failed evidence stays preserved. All original dirty work remains separate.

The original SQLite offline replay passes with its last CSS-value failure gone.
Four computed samples retain Verdana/sans-serif while selecting Agent Mono via
the generic; actual x-heights9/10px and prior padding/margins remain correct.
Fifteen CSS-property issues, six selector issues, eleven float flags and one
overflow flag remain. Float flags alone do not establish a missing float engine.
Raw DOM and post-install presentation stay unchanged, all owners close, and
runtime inventories match. No HTTP, image, used-layout, raster or scripts in this
replay: it is not whole-site acceptance or a new host. No push.

The retained primary-source grammar follow-up preserves useful native clauses,
but its receipt check failed on an erroneously included volatile procfs input.
The failed run remains failed, with no retry or rewritten evidence. Original
research topics, broader website/performance coverage, SafeJS, real TTY,
credentials, passkey-device and human challenge-handoff gates remain open.
No new live website or host has been tested in this change; overall goal active.

### September 13: native ex lengths implemented

Native ex lengths now derive actual lowercase-x metrics from the selected Agent
Mono bitmap face. Shared scalar/math box, border, outline, flex and table paths,
scalar grid tracks, font size, line height and text indentation use proper own,
parent or initial bases. Inheritance, custom-property use sites, typography/cache
invalidation, border snapping, fractional/zero metrics and lazy dependencies are
covered. Standalone APIs require an explicit x-height basis. No hard-coded pixel
substitution, runtime dependency or cap increase. Existing unsupported grid-track,
font-size and line-height math grammars remain explicit.

The clean selected gate passes **17,142/0/2 unchanged exclusions**, including70
new cases;331suites,330strict roots,709manifest entries (378 not run).
Build/strict/format/source checks pass in native-ex-length-september13-round01;
1233source/2056compiled files and1219 unchanged tracked inputs are audited.
Canonical scalar/math padding failures now pass unchanged. Earlier test-bound
and setup-manifest failures remain preserved. The pre-existing untracked font-
relative test remains byte-identical, uncommitted and outside the selected gate.
All original dirty work stays separate; no push. See EX-LENGTHS.md.

Offline original SQLite HTML/CSS replay passes with the five ex value failures
removed: unsupported CSS values fall6→1. Representative computed x-heights9/10px
produce the original button/sidebar/menu/search padding and margin declarations.
One font-family value,15properties,6selectors,11float flags and one overflow
remain; alignment flags stay absent. No HTTP,image,used-layout,raster or scripts,
so this is not whole-site acceptance or a new host. Source DOM and post-install
presentation stay unchanged; all owners close and runtime inventories match.

Native retained-source font-family fallback research is underway for the next
CSS-value issue. Original research topics, broader website/performance coverage,
SafeJS, real TTY, credentials, passkey-device and challenge/human-handoff gates
remain open. Overall browser goal stays active; historical host count stays86.

### September 13: paragraph and heading alignment hints implemented

Native HTML p/h1–h6 left/center/right alignment now participates in the real
author cascade, inherited text styling, geometry, raster and hit testing.
Exact case-insensitive values are supported without trimming or importing DIV's
middle alias. Applicable hints prevent ancestor legacy CENTER positioning;
auto margins still work. Namespace, mutation, CSS-wide/variable precedence and
4096-unit attribute bounds are covered. Justification and unrelated element
alignment remain explicit unsupported scope. No runtime dependency or cap raise.

The final selected gate passes **17,072/0/2 unchanged exclusions**, including112
new tests;328 suites,327 strict roots,706 manifest entries (378 not run).
Build/strict/format/source checks pass in native-html-align-september13-round01.
Its audit binds1229source/2052compiled files and1223 unchanged tracked inputs.
The superseded round00 and intermediate harness failures remain preserved.
Original dirty work remains separate; no push. See HTML-ALIGNMENT.md.

Offline original SQLite HTML/CSS replay02 passes: both actual center hints now
compute correctly and their two formatting flags disappear. Six CSS values,
fifteen properties,six selectors,eleven float flags and one overflow remain.
No HTTP,image,used-layout,raster or script call; this is not whole-site acceptance.
Two earlier replay assertion errors are preserved and explicitly explained:
stylesheet installation invalidates presentation and changes accessibility
visibility, without mutating source DOM. Corrected checks verify raw DOM records,
post-install snapshots and revisions473→474→474 on unchanged sources/runtime.

Native-only primary-source work establishes the next ex x-height basis, but its
implementation remains open. Original research, SafeJS, real TTY, credentials,
passkey-device and challenge/human-handoff gates also remain open. The historical
86-host inventory gains no host; the overall browser goal stays active.

### September 13: SQLite image and document load; used layout remains blocked

A fresh native16960/0c2323f SQLite initial-load check makes three original
same-origin GET200s and commits one document titled SQLite Home Page. The same
12707-byte SVG banner now completes: natural392x176,278244decodedbytes,
3471819decodeWork. One formatting inspection returns; the single used-layout
attempt fails at the actual issue-free-profile guard. No used-layout artifact,
click, screenshot, second layout, script execution, retry or downstream action.
This is progress past the old image failure, not a whole-website pass.

The retained formatting vector is6CSSvalues/15CSSproperties/6CSSselectors/
11floatflags/1overflow/2HTMLpresentationhints. Do not infer every float is an
independent failure; exact declaration-level classification is a separate
offline task using original sealed HTML/CSS and new owners, not the closed live
session. No unsupported profile is waived and no page source is rewritten.

See SQLITE-CLIP-LIVE.md and native-sqlite-clip-september13 private receipts.
The original evidence verifier's incorrect zero-cumulative-counter assumption
is preserved; separate offline verification01 checks commits1 and historical
decodeWork against their recorded activity while retaining zero live resources.
The new seal and Main's read-only verification pass:289receipts/266originals
unchanged, zero additional HTTP. This verifies evidence, not the website.
No additional website run is needed for that verifier correction. The existing
86-host inventory gains no new host; working-website count remains unestablished.
All broader research, script, credential, passkey-device, SafeJS, TTY and
challenge/human-handoff gates stay open. Overall browser goal remains active.

### September 13: native SVG clipping implemented and gated

Native SVG now supports bounded local-fragment clip paths: raw basic/curved
silhouettes, per-definition unions, ancestor intersections, coordinate transforms,
nondegenerate object bounding boxes, CSS cascade and mutation, raster composition
and clip-aware hits without shrinking geometric bounding rectangles. Definitions
can be shared across inline SVG roots; isolated clip-style computation avoids
irrelevant paint-length overflows. No new dependency or raised decoder limit.
Nested/text/use/group clip children, HTML/basic-shape clipping, degenerate boxes
and full SVG/CSS conformance remain explicit limitations.

The clean selected gate passes **16,960/0/2 unchanged exclusions**, including
219 new cases; 326 suites, 325 strict roots, 704 manifest entries (378 not run).
Build/strict/format/source checks pass in native-svg-clip-september13-round01.
The setup-only round00 failure and focused strict-only annotation failure are
preserved. Original dirty work remains separate; no push. See SVG-CLIPPING.md.

All three retained IANA/Python/SQLite SVG decoder calls return successfully,
without HTTP/navigation; IANA/Python pixels remain exact. SQLite now decodes
393x177/10shapes/work3471819 with fractional intrinsic dimensions retained.
The capture harness still exits1 because it incorrectly demands transparent
pixels in the whole opaque SQLite image. Its false compound field and original
exit remain intact; successful native decoding is not relabeled as a passed
capture/visual/website check. CAPTURED-REVIEW.md explains the distinction.

A fresh pinned native SQLite initial-load check is prepared separately and has
not executed at this checkpoint. Whole-site layout, scripts, credentials,
passkey devices, SafeJS, real TTY, challenge/human-handoff and the original four
research topics remain separate open gates; the overall browser goal is active.

### September 13: fractional SVG image dimensions implemented and gated

Native SVG decoding now preserves fractional intrinsic dimensions separately
from bounded integer raster storage. Replaced layout uses the real dimensions
and ratio; image natural-dimension getters remain integer-valued. Ceil-sized
pixel allocation is checked against the caller's budget before rasterization.
Subpixel images are not mistaken for broken resources. No new runtime dependency
or raised limit; missing/percentage intrinsic sizing remains unsupported.

The clean selected gate passes **16,741/0/2 unchanged exclusions**, including 30
new cases; 322 suites, 321 strict roots and 700 manifest entries (378 not run).
Build/strict/format/source checks pass. Retained IANA/Python pixels stay exact.
SQLite now passes intrinsic sizing and reaches the real unsupported clip-path
guard. These three offline decodes make zero HTTP/navigation requests.

Native standards browsing adds three GET/200s and two parsed pages. Masking's
CRLF response exposes a provenance-adapter assumption before parsing; keep the
stopped evidence and fix source-position accounting in a new offline scope.
SQLite's separate native structure check identifies a transformed group clip,
not permission to strip it. See `SVG-IMAGE-INTRINSICS.md` for receipts and gaps.
Next: real clipping, then fresh bounded website checks. The four research
topics, broader compatibility/performance, credential/provider/passkey-device,
SafeJS and access-challenge gates remain open. No push; dirty work preserved.

### September 13: native SVG stroke implemented and gated

Native stroke now participates in CSS/presentation inheritance and the actual
scene renderer: bounded local-coordinate outlines, affine transforms, caps/
joins, local gradients, union alpha, individual shape opacity and stroke hit
targets. Percentage widths resolve against the used SVG viewport, not preferred
CSS root sizes. Malformed numeric declarations no longer override valid stroke
values. No new runtime dependency, discarded diagnostics or raised limits.

The clean selected gate passes **16,711/0/2 unchanged exclusions**, including 215
new cases; 321 suites, 320 strict roots, 699 manifest entries (378 not run).
Build/strict/format and source stability pass. Separate retained IANA/Python SVG
decodes preserve exact pixels. SQLite now passes the SVG CSS profile check and
stops at positive-integer intrinsic dimensions, before scene construction.
All three body checks are offline: zero HTTP/navigation and no website pass.

See `SVG-STROKE.md` for exact UTC receipts, bounds, source gaps and preserved
attempts. Next: fractional intrinsic SVG sizing and real clipping, then fresh
bounded website checks. Broader CSS/text/layout, the four requested research
topics, credential/provider/passkey-device, SafeJS and access-challenge gates
remain open. Pre-existing dirty work is preserved; no push.

### September 12: native SVG CSS fill paint implemented and gated

SVG fill/fill-opacity/fill-rule now use the actual native CSS cascade and scene
renderer, including case-sensitive local paint servers, fallback/no-paint,
currentColor, inherited opacity and winding rules. CSSOM/presentation changes
invalidate paint state. Unsupported SVG styles are not waived or stripped.

The clean selected gate passes **16,496/0/2 unchanged exclusions**, with 91 new
cases, 318 suites, 317 strict roots and 696 manifest entries (378 not run).
Build/strict/format pass. Exact retained IANA/Python SVG pixels stay unchanged;
SQLite still fails its SVG style profile. These three offline body checks make
zero HTTP/navigation requests and do not establish website acceptance.

See `SVG-CSS-PAINT.md` for evidence, source gaps and preserved failures. Next:
real SVG stroke/clipping and fractional intrinsic sizing, then fresh bounded
website checks; broader CSS/text/layout coverage, research, credential/provider/
passkey-device, SafeJS and access-challenge gates remain open. No push.

### September 12: concrete IANA CSS targets, not diagnostic waivers

A separate native static census identifies exact text-decoration/font-style,
pseudo-element/content, SVG CSS paint, background/effect and font/keyframe gaps.
It processes 878 rules/2,228 declarations without HTTP or page construction.
Proper selector validation distinguishes 35 unsupported pseudo-element rules
from 101 valid comma lists rejected only by a narrower single-selector probe.
Individual rule applicability remains unknown; raw counts are not active winners.

See `IANA-CSS-TARGETS.md` for provenance and preserved failed diagnostics. Next:
standards-backed CSS SVG fill/opacity/rule cascade and focused native regressions,
followed by sizing/stroke/clipping and new bounded live checks. The original
IANA/Python layout failures and SQLite precommit failure remain explicit.

### September 12: SQLite SVG paint and sizing gaps isolated

Fresh native SQLite testing fetches three original HTTP 200 responses but stops
before commit on the banner SVG. There are zero clicks or layout calls. Separate
offline checks of the exact captured image identify 49 unsupported inline SVG
paint-property diagnostics and native fractional dimensions from millimetres.
The first direct decoder stop is the CSS profile gate, not a proved size/clip
failure. No image changes, issue suppression or website retries are performed.

See `SQLITE-SVG-NATIVE-CHECK.md`. Next: implement real SVG CSS fill/opacity/rule
cascade, fractional intrinsic/raster sizing and required stroke/clipping semantics
with focused native regressions, then run a new bounded live check. Existing
IANA/Python SVG progress does not imply arbitrary SVG or complete website support.
The overall goal and broader research/device/SafeJS/access gates remain open.

### September 12: fresh Python SVG website check

The native browser commits the Python documentation homepage and completes all
three SVG-icon references through one shared image request. Eight HTTP 200
responses include the original imported basic.css. One formatting inspection
and one used-layout attempt follow; layout remains unsupported at the formatting
profile guard. Zero clicks, retries or post-failure page analysis are performed.

See `PYTHON-SVG-NATIVE-CHECK.md` for the fresh 22:54 UTC observations, exact
body/result hashes, owner cleanup and independently checked runtime identities.
The earlier zero-request syntax failure is preserved separately; setup repair
does not establish its underlying cause. Next: concrete CSS/layout regressions
and broader native-site testing, without waiving diagnostics or stripping CSS.
The overall browser goal and research/device/SafeJS/access gates remain open.

### September 12: fresh IANA SVG website check

The committed native SVG runtime now loads IANA's original logo at 234×72 and
commits the Example Domains document: three HTTP 200 responses, one navigation,
one commit, one formatting inspection and one used-layout attempt; zero clicks.
This is partial progress, not a website pass. Used layout stops at the issue-free
formatting-profile guard, with applicable CSS and float/display coordination
diagnostics still outstanding. No stylesheet stripping or issue waiver is used.

See `IANA-SVG-NATIVE-CHECK.md` for the fresh September 12, 22:43 UTC evidence,
body hashes in the private lane, independent before/after checks and observed
owner cleanup. The 16,405-case selected native gate was not rerun. Next: identify
the exact CSS constraints and repair supported behavior; continue Python and
varied-site checks. The overall browser goal and broader acceptance gates remain
open. No credentials, SafeJS, alternate browser or challenge bypass was used.

### September 12: bounded native SVG images and exact captured-logo checks

Native SVG image support now parses strict UTF-8 XML into a standalone SVG tree,
uses native stop CSS and inverse-affine linear gradients, and flows through the
existing image owner/CSP/layout/raster path. No HTML recovery wrapper, new runtime
dependency, external DTD/subresource loading or gradient-to-flat-paint substitution.

The clean selected gate passes **16,405/0/2 unchanged exclusions**: 315 suites,
314 strict roots, 459 new cases, 693 manifest entries (378 not run), 1,210 source
files and 2,028 compiled artifacts. Build/strict/format pass; pre-existing dirty
work stays excluded. Exact retained IANA and Python SVGs independently decode
to 234×72/40 shapes and16×16/2 shapes with real gradients under existing limits.
These two offline attempts made zero HTTP requests and are not website passes.

See `SVG-IMAGES.md` for hashes, timestamps, preserved failures and limits. Next:
fresh complete IANA/Python website flows; fuller SVG intrinsic sizing, author-CSS
fill, text/strokes/filters, templates and linearRGB. Positive integer absolute
image dimensions and the bounded UTF-8 static subset remain explicit. Broader
research, credential/provider/passkey-device, real TTY/SafeJS and challenge gates
remain open; no new acceptance is inferred from the native gate or captured logos.

September12 exact mixed stylesheet/image native control now passes on committed
15946/0076134. STYLESHEET-CSP-MIXED-CONTROL.md records one constructed native load
at21:31:25.667–21:31:25.724UTC:document+admittedPNG callbacks,0CSS callbacks/sheets,
complete2x4origin-clean PNG and1document commit. ZeroHTTP/layout/click acceptance;
this does not increase the86real attempted-host inventory or release test count.
Old15601control and image-candidate thirteenth-fixture failures remain unchanged.
Main21:32:35.628UTC readonly verification checks exact fixture identity, native
cleanup,1196source/2008compiled files,20release and8control receipts;13actual
committed runtime inputs already match the audited snapshot. Metadata/inline/
nonce/full-CSP limitations remain explicit. Next concrete browser gap is external
SVG image decoding, not image or ordinary-link CSP presence denial. Wider CSS,
research/performance/provider/passkey-device/SafeJS/challenge gates stay open.
Unrelated work remains preserved; no push.

September12 external stylesheet CSP closes the ordinary-link authorization gap.
STYLESHEET-CONTENT-SECURITY-POLICY.md records bounded style-src-elem/style-src/default
URL matching, enforcing-policy intersection, all supported native link/import
paths and checks before each manual redirect and CSS installation. Images/styles
share the metadata observer; unsupported meta remains latched, and CSP-bearing
inline-parent imports stay fail-closed. Independent CORS/SRI/MIME/origin/mixed-
content/resource/abort guards remain. Nonce/inline/full-CSP and metadata-construction
limits stay explicit; this is not complete untrusted-page CSP isolation.
Main734/734focused and finalrelease15946/0/2unchanged exclusions pass,77newcases.
Release2026-09-12T21:25:49.988Z–2026-09-12T21:29:36.666Z:306selected
suites from684manifest entries,305strict roots,1196source/2008compiled files and
1183unchanged tracked inputs. Other378manifest entries are unexecuted here.
Five obsolete legacy cases are updated, none removed or skipped; earlier focused,
worker and15944/2failed fullround00 evidence stays intact. Native primary-source
review verifies14sections and18receipts, without new HTTP or larger query bounds.
The prior IANA live check remains3GET200 followed by unsupported SVG, not website
acceptance. Next are the exact prior mixed-resource fixture and external SVG image
support; broader CSS/research/performance/provider/passkey-device/SafeJS/challenge
gates remain open. No dependencies or caps added, unrelated work preserved, no push.

September12 distinct post-image-CSP IANA native check is verified in
IANA-IMAGE-CSP-NATIVE-CHECK.md. Committed15869/04bc696 performs3GET200 at21:07:20.781–
21:07:21.620UTC, including32870decoded SVG response bytes. The previous own-CSP
policy denial is gone; first failure is now unsupported image e35, before commit.
0commits/clicks/format/layout, no retry/bypass/cap change or post-failure inspection.
This is not IANA functionality acceptance or a Cloudflare/server denial. Main's
independent readonly13actual-Git-object/26archive recapture and153-receipt sealed
verification passes21:11:43.150UTC. Old native15522 evidence remains unchanged;
the existing86-host attempted inventory does not expand. External-style CSP repair
is separately in progress; SVG, broader CSS/research/performance/provider/passkey-
device/SafeJS/challenge gates remain open. No push.

September12 native image CSP now compiles enforcing header policy lists instead
of rejecting every CSP-bearing document's images. IMAGE-CONTENT-SECURITY-POLICY.md
records immutable policy intersection, img-src/default-src fallback, URL-source
matching and checks before every native manual redirect plus returned URLs.
Independent origin/mixed-content/byte/MIME/decode/lifecycle and generic-fetch/
policy-aware-style guards remain. Meta image policies stay explicitly unsupported
and latched fail-closed; notification sharing preserves the32-handler ceiling.
Main661/661focused and the isolated fullgate15869/0/2unchanged exclusions pass at
20:54:07.560–20:57:52.980UTC:303selected suites,302strict roots,681manifest entries,
1192source/2004compiled files,1182unchanged tracked inputs and268new scoped cases.
Build, strict TypeScript, formatting and source stability pass. Prior exclusions,
runner/worker/registration failures and the pending style acceptance stay intact.
This is NOT complete browser-wide CSP. A valid plain-style-src-none counterexample
still fetches/installs a stylesheet; one exact native15601 control proves it
predates this image change. The12image lifecycle cases are selected; the worker's
thirteenth future stylesheet case remains a separately retained failing gate,
not a passing or newly skipped image test. Opaque custom fetch checks are only
post-response; native redirects have the stronger before-I/O boundary.
Next are a distinct bounded post-change website check and real stylesheet/meta
CSP enforcement. Wider CSS/functionality/research/performance/provider/passkey-
device/SafeJS/challenge gates remain open. No website pass or inventory expansion
is inferred, no dependency/cap increase is added, and no changes are pushed.

September12 fresh IANA public-document test is now verified and recorded in
IANA-NATIVE-PUBLIC-FLOW.md. Native15522/4306022 performs2GET200 at20:10:59.056–
20:10:59.642UTC:15836encoded/95297decoded bytes,111133combined. Before commit,
the original image owner reports policy-denied for the discovered logo SVG;
0image requests/bytes,0document commits/clicks/format/layout. This is our current
CSP image limitation, not a proved server/Cloudflare denial or SVG decode failure.
No post-failure page analysis, bypass, retry, alternate navigation or cap change.
The www.iana.org host already exists in the86-host inventory; no new attempted
host or working-website count is claimed. Main independently recaptures14actual
Git objects against28archives and passes the131-entry read-only verifier at
20:14:54.750UTC with settled instrumented owner cleanup. The runtime is the older
tested15522, not the subsequent15601 float repair. Image CSP support remains a
concrete gap; Python's residual CSS triage is independently underway on15601.
Broader functionality/research/performance/provider/passkey-device/SafeJS/challenge
gates remain open. Historical evidence and unrelated dirty work are preserved;
no changes are pushed.

September12 exact captured-Python replay on committed15601/9abc836 now eliminates
the false float ownership-count error. PYTHON-FLOAT-APPLICABILITY-REPLAY.md records
20:08:17.037–20:08:17.176UTC,8memory responses/72064decoded bytes,0wire/clicks,
1native commit/format/layout attempt,853nodes/revision860. Float diagnostics10→8
match8actual owners; ignored computed floats remain e344left/e730right. The first
layout failure is now the issue-free supported-formatting-profile guard; all
other measured CSS/display/overflow/position/clear issues and3unsupported py.svg
states remain. No CSS/DOM/resource/guard alterations or whole-page acceptance.
Main20:10:12.961UTC readonly verification passes11receipts, exact old/new runtime/
capture/diagnostic comparisons and instrumented owner cleanup. The first verifier's
report-versus-artifact hash mistake is retained and corrected from the original
sealed ledger, without another page replay. Prior evidence stays unchanged.
Fresh bounded IANA public-document testing is separately in progress on15522;
no result is yet claimed. Broader browser/research and acceptance gates stay open.

September12 native float diagnostics now follow actual floatSide ownership,
not every non-none computed float. FLOAT-APPLICABILITY.md records the one-line
formatter correction for ignored flex/grid-item and ordinary boxless floats;
computed values/blockification, real floats and independent unsupported guards
remain.79new cases,6superseded expectations, Main384/384focused and worker76/76
pass. Retained baseline, worker-oracle, missing-selected-file and Main strict
typing failures are not rewritten. Final clean isolated gate passes15601/0/
2unchanged exclusions at20:02:06.780–20:05:51.501UTC:299selected suites,
298strict roots,677manifest entries,1186source/1996compiled files and1180unchanged
tracked inputs. Build, strict TypeScript, formatting and source stability pass.
FLOAT-APPLICABILITY-SOURCE.md retains3fresh native W3C captures and the Flexbox
node-limit/first Display sampling gaps; Main14actualGit/28archive verification
passes over159receipts. The separate SOURCE-FOLLOWUP report establishes ordinary
contents box suppression and a qualified older local Flexbox editor-source rule;
the published Flexbox failure and unexamined Display Appendix B remain explicit.
Next is one exact captured-Python post-fix replay, not an inferred website pass.
Broader live/research/performance/provider/passkey-device/SafeJS/challenge gates
remain open. Pre-existing dirty work is preserved; no changes are pushed.

September12 corrected parent-owned Python offline diagnosis now reaches one
native document commit and formatting on15522 using all eight fresh responses.
PYTHON-FRESH-NATIVE-DIAGNOSIS.md records19:37:34.473–19:37:34.612UTC,
72064memory-decoded bytes,0wire requests/clicks,853nodes/revision860 and title
3.14.7 Documentation. The unchanged native engine retains three unsupported
py.svg states without an unsupported image-element diagnostic; no SVG pixels,
style/DOM/error changes or live acceptance are claimed. Styles have579rules,
1071declarations,5external sheets and1import. One layout attempt rejects with
Float formatting ownership does not match its diagnostics; independent CSS,
alignment, display, position and overflow issues remain. Main19:40:18.648UTC
readonly verification seals11receipts and checks exact inputs and owner cleanup.
PYTHON-FRESH-NATIVE-REPLAY.md separately preserves the first worker's header-object
prototype assertion:1native memory response/19434bytes despite its empty later
recording array,0commit/format/layout/network. Main14actualGit/28archive readonly
verification passes19:40:49.826UTC over its238-entry seal. That harness failure
is not a website defect. Next targeted code investigation is ignored-float
diagnostic applicability and ownership; it is not yet a tested repair. The overall
browser and wider acceptance gates remain open. No changes are pushed.

September12 focused CSP source extraction now covers all ten selected policy-list,
source-list, URL/expression, scheme/host/port/path and directive-fallback sections.
CSP-MATCHING-SOURCE.md records one offline native15421 parse at19:23:43.731–.969UTC,
zero HTTP,28732nodes,45368serialized bytes and18691native semantic bytes. All ten
targets are complete;64references remain unfollowed and external definitions are
not complete. The IP-host note/algorithm tension remains explicit. No policy
admission or CSP implementation is changed. Main independently recaptures16Git
objects matching32archives and verifies the132-entry seal at19:30:36.750UTC,
without reparsing or network. Earlier146-entry evidence stays byte-identical.
Next CSP work must resolve header-list extraction, URL/origin details and actual
request/redirect/meta integration before allowing resources; a matching helper
alone cannot justify disabling the conservative image-policy guard. The overall
browser, research and security acceptance gates remain open.

September12 fresh native Python initial-load evidence now has independent parent
verification. PYTHON-FRESH-NATIVE-INITIAL.md records8native GET/HTTP200 responses,
16924encoded/72064decoded bytes, including a genuine basic.css capture. At
19:19:31.654UTC the live harness stops before document commit on three py.svg
references with native error unsupported. Its generic resource-limit wrapper is
not measured capacity exhaustion: global image failure is null, and sampled
stylesheet resource errors are empty. No commit/click/formatting/layout occurs.
One bounded settlement sample proves instrumented owner cleanup. Main recaptures
16actual Git objects against32archives and runs the exact readonly verifier at
19:26:21.640UTC; the280-entry seal remains unchanged. No resource was added to
the historical seven-response corpus and no website acceptance is claimed.
A separately released offline native15522 diagnosis may observe these known
unsupported decoder states through the unchanged native fallback path; it cannot
clear errors, bypass policy/resource failures, modify DOM/CSS, retry live requests
or invent SVG pixels. Its outcome remains pending. Broader goal gates stay open.

September12 independently verified fresh HN navigation stops before commit on
native image-policy observations, not a server challenge:2GET/2HTTP200,
7652encoded/42510decoded bytes,0anchors/clicks/commits. HN-MODERN-NATIVE-FLOW.md
retains the original header-verifier failure and append-only corrected v2.
Independent19:14:49.563–19:14:49.981UTC review recaptures16Git objects, matches
32archives and passes10checks without page/network execution;291original files
remain unchanged. Navigation acceptance remains false.
PYTHON-MODERN-REPLAY.md records a distinct offline capture-completeness stop:
classic.css imports missing basic.css. Four adapter attempts serve three original
responses,29572decoded bytes,0wire requests and no commit/formatting/layout.
Independent19:17:09.240–19:17:09.915UTC review confirms16Git object identities,
13snapshot inputs and129unchanged originals; the exact readonly verifier passes.
No missing resource is fabricated or appended to the historical capture.
HN-CELL-SPACING-REPLAY.md then verifies the narrow native15522 repair on unchanged
captured HN bytes:all four tables compute0px spacing and table-hint issues drop
4to0; other issues and the used-layout rejection remain. One19:18:42.322–.468UTC
offline load serves two memory responses,42364bytes,0newHTTP/clicks; owners close.
Main19:20:28.799UTC readonly verification checks the11-entry new receipt seal,
capture/runtime identity and unchanged remaining issues without another replay.
The broader goal and website/research/performance/provider/passkey/device/SafeJS/
challenge gates remain open. Fresh Python and focused CSP matching investigations
have separate bounded authorizations; no outcome is claimed before evidence.

September12 native HTML table cellspacing now supplies a normal author hint for
both border-spacing axes through the shared nonnegative-integer pixel parser.
HTML-CELL-SPACING.md records101new cases, the failing pre-fix canonical fixtures,
preserved worker oracle failures and four updated legacy guard expectations.
Main focused637/637 and worker567/567 pass. The clean isolated native gate passes
15522/0/2unchanged exclusions at19:11:03.315–19:14:35.433UTC:297selected suites,
296strict roots,675manifest entries,1184source/1996compiled files,1173unchanged
tracked inputs. Build, strict TypeScript, formatting and source stability pass.
Only the HTML table cellspacing guard is removed; namespace, work/precision/
magnitude limits and unrelated table/font/overflow/image/CSP guards remain.
No live website or HN acceptance is inferred. Broader website/research/performance/
provider/passkey/device/SafeJS/challenge gates remain open; no changes are pushed.

September12 HN cached-page attribution on committed native15421 still rejects
used layout. HN-MODERN-NATIVE-DIAGNOSIS.md retains four offline attempts, including
two corrected harness mistakes: seven exact captured memory responses total,
162038decoded bytes, no new HTTP/click and no website acceptance. The completed
attribution identifies four cellspacing hints,61hidden-overflow table cells,
font-profile/CSS gaps and two native image-policy errors. The four table display
markers alone are not coordinator defects. Main's readonly verification checks
all four results, cleanup and unchanged release/capture inventories without
replaying a page. The separate new live HN report remains a distinct gate.
CSP-NATIVE-SOURCE.md records one native W3C GET and one offline parse,19sections
and64unfollowed references. Main independently recaptures16actual Git objects,
compares32archives and verifies its146-entry seal at19:07:50.181UTC. Full CSP
policy-list/URL/origin/redirect matching remains incomplete; no policy is bypassed.
The native browser goal and website/research/performance/provider/passkey/device/
SafeJS/challenge gates remain open. Historical evidence is not rewritten.

September12 fresh Selenium native reference navigation now passes on committed
native15421. The18:37:02.509–18:37:03.723UTC flow receives three HTTP200 responses,
performs one genuine observed e137 click and commits two distinct documents,
reaching resultPage.html with title We Arrive Here and verified history progress.
SELENIUM-EMPTY-IMAGE-FLOW.md records1674encoded/3630decoded bytes, retained250ms
pacing, native TLS/address checks, five policy observations and instrumented owner
cleanup. No retry, mock, forced destination navigation, new-host, whole-site,
paint, performance, form, provider or challenge acceptance is claimed.
Main's18:40:54.862–18:40:55.205UTC read-only verification separately recaptures
16actual Git objects matching32archives and passes10sealed-evidence checks over
277receipts,13snapshot inputs and1181source/1992compiled files. It imports no page,
reparses no HTML and performs no network replay; seal/ledger stay byte-identical.
Main's earlier ledger-filename setup error is retained privately and occurred
before Git recapture or verifier launch, not during another live attempt.
Historical Selenium failures remain unchanged. The bounded navigation gate is
now met for this flow; broader sites/research/performance/provider/passkey/device/
SafeJS/challenge gates remain open. No changes are pushed.

September12 new cached Selenium replay on committed native15421 now succeeds
at one used-layout attempt with63contexts. It retains the original3123byte HTML,
127byte GIF and197nodes; e168's no-src/no-alt state is no longer an element guard.
The table decomposition marker remains and is handled by the layout coordinator.
One parse and one exact-URL memory image response run18:33:06.674–18:33:06.762UTC;
there are0new HTTP requests and no click/navigation/raster acceptance claim.
SELENIUM-EMPTY-IMAGE-REPLAY.md preserves the new result separately from earlier
failed14922 evidence. Main's18:35:09.074UTC read-only verification checks recorded
results, stable release/capture hashes and the8entry post-run seal without page
import, parsing, decoding, layout or network. Fresh website/navigation and wider
research/performance/provider/passkey/device/SafeJS/challenge gates stay open.

September12 stable no-content images now retain native replaced boxes with zero
intrinsic dimensions and no aspect ratio, preserving authored dimensions, edges,
backgrounds, outlines and hit identity without inventing pixels. Source-less or
empty-source nonempty alt renders literal text in the supported terminal states.
Loaded/pending, policy/resource and unsupported profile guards remain explicit.
EMPTY-IMAGE.md records source scope, retained failures, independent review and
356new cases. The clean native gate passes15421/0/2unchanged exclusions
at2026-09-12T18:28:47.411Z–2026-09-12T18:32:05.312Z:295selected suites,
294strict roots,673clean manifest entries,1181source/1992compiled files.
Build, strict checking and owned formatting pass. This is not a new live website
or navigation acceptance run; prior Selenium failure evidence remains unchanged.
Broader website/research/performance/provider/passkey/device/SafeJS/challenge
gates stay open. No content removal, universal fallback size or bypass is added.

September12 separate native primary-source capture records image represented
content and completion conditions in IMAGE-SEMANTICS-SOURCE.md. One native GET
returned HTTP200, followed by one offline native parse; full current/pending
request-state definitions remain uncaptured. Missing versus empty attributes,
available-image versus text/nothing, and authored sizing remain distinct.
Main's18:15:20.812–18:15:21.143UTC read-only check independently recaptures nine
actual Git objects against both archives and verifies114sealed receipts, six
snapshot inputs,1177source/1992compiled files and20gate receipts. It imports no
page, reparses no HTML and sends no request. This is source evidence, not a new
website/layout/navigation pass. Empty-image implementation and broader website,
research, performance, provider/passkey/device/SafeJS/challenge gates remain open.

September12 plain fractional geometry fixes public collapsed Range deduplication
at its root and shares finite bounded coordinate comparisons with caret/selection.
No Range-error-string fallback or duplicate geometry scan remains.143new cases
have a byte-identical119pass/24fail baseline and143pass final suite;889related
cases pass. One old tiny literal-control expectation deliberately changes from
unsupported to clipped, without rewriting the historical14922 artifacts.
PLAIN-FRACTIONAL-EDITABLE.md records retained failures, strict/format validation,
independent review scope and the new15065passed/0failed/2unchanged-exclusion gate
at2026-09-12T17:49:28.212Z–2026-09-12T17:52:41.615Z:291suites,290strict roots,
669clean manifest entries,1177source/1992compiled files,fiveowned inputs plus
manifest. Real subpixel gaps, mixed identities/lines, nonfinite/summed-overflow
metrics and existing unsupported typography remain guarded. Prior Selenium
reports still use14922; the missing-src/alt image state/sizing policy and wider
website/research/performance/provider/passkey/device/SafeJS/challenge gates remain
open. Native tests are not a new live, navigation or whole-site acceptance run.

September12 separate image-loaded native replay narrows the remaining Selenium
guard without another live request. Original fresh HTML and127byte GIF feed one
native parse and one exact-URL memory callback at17:43:03.346–17:43:03.424UTC.
GIF87a decoding succeeds18x18/1296bytes; e170 is no longer deferred. e168 has no
src or alt and remains empty/complete with zero natural dimensions and the sole
element-layout-not-supported issue. The table marker is normal intermediate
coordinated representation, not itself a proven table bug. The one used-layout
attempt still fails: acceptance remains false. SELENIUM-TRANSFORM-IMAGE-REPLAY.md
preserves exact scope, native owner cleanup, lowered bounds, captured hashes and
all three earlier exploratory parse outcomes. A separate17:45:41.104–
17:45:41.197UTC read-only kernel-denied verification checks recorded results,
release/capture stability and the8entry post-run seal without page import,
parsing, decoding, layout or HTTP. This is Main's own verification, not independent
review or retrospective harness attestation. Missing-alt/unselected-image sizing
and state policy require dedicated implementation/tests; no image/content is
dropped or universal300x150 fallback invented to force a pass. Wider gates stay open.

September12 fresh post-casing Selenium flow on committed14922 remains partial:
simpleTest.html and its GIF return200, but the one genuine e137 link click fails
the local width/formatting-profile guard before any destination request. Native
navigation-flow acceptance is false; no retry, forced navigation, restriction or
challenge bypass. The17:31:40.097–17:31:40.962UTC run has two requests, one page
commit, clear exposed resource policies and proved instrumented-owner cleanup.
SELENIUM-TRANSFORM-FLOW.md retains this new run separately from the original.
Main's17:36:35.769–17:36:36.076UTC offline verification passes10checks, recaptures
24actual Git objects matching48archived copies, and checks310sealed receipts,
21snapshot inputs and all1176source/1992compiled files without page import,
HTML reparse or network replay. Seal and ledger remain byte-identical.
Separate cached formatting investigation is not a live image-loaded replay:
its first parse failed a harness revision assertion after changing the viewport;
the unchanged-default-viewport follow-up at17:36:10.852–17:36:10.923UTC observes
zero CSS issues but a deferred table e151 and two deferred images e168/e170.
Both diagnostic lanes and failures remain private original evidence; these are
investigation targets, not an established exact cause or successful click.
Broader sites/research, performance, provider/passkey/device/SafeJS and challenge
acceptance remain open; no new-host count or full-site support claim follows.

September12 post-casing cached Selenium CSS check on committed14922 observes
the identical six statements, with raw/applicable unsupported counts3→0:
capitalize/lowercase/uppercase are accepted without stripping CSS. One native
parse at17:29:16.916–17:29:16.981UTC retains197nodes/revision198; no new HTTP,
image hydration, layout or click. SELENIUM-TRANSFORM-CSS-CHECK.md preserves the
worker's sealed85entry result and its separately executed read-only verification.
Main's additional17:33:27.478–17:33:27.604UTC verification recaptures24actual Git
objects, links21snapshot inputs, checks the exhaustive seal and full1176source/
1992compiled inventories under socket/socketpair denial without page imports,
reparse or network replay. The initial parent pin-schema assertion stopped before
Git/child execution and remains preserved separately; no native probe was retried.
Historical four-issue and three-issue reports remain unchanged. CSS acceptance
does not establish full-page rendering or navigation; the separate fresh live
flow, broader website/research and provider/passkey/device/challenge gates remain
separate, with no new-host or performance claim.

September12 native case transformation supports inherited upper/lower/capitalize
with Unicode16 contextual casing, source-preserving expansions/deletions, language
metadata, intrinsic/wrapped layout and native range/selection/caret integration.
TEXT-TRANSFORM-NATIVE.md retains491new cases plus399newly selected existing cases,
the native source provenance, formatter-loss evidence and all review failures.
The initial14911passing candidate missed zero-font and floating-point geometry
defects. Eleven added cases and bounded source/containment corrections yield
14922passed/0failed/2unchanged exclusions in round01 at2026-09-12T17:21:44.328Z–
2026-09-12T17:24:56.781Z:290suites,289strict roots,668manifest entries,
1176source/1992compiled files,20owned inputs plus manifest. Build/strict/format
pass; independent review/follow-up remains separately scoped. Four pre-existing
stale CSS property-count failures outside this selection and the tiny unmarked
selection-control limitation remain explicit, not fixed or silently passed.
No live website/navigation, provider/passkey/device/SafeJS or challenge gate is
established by these native tests. The Selenium historical reports stay unchanged;
separate post-release cached/live observations and broader research remain open.

September12 native Unicode16 source research completes two bodyless GETs with200
responses and no retry, redirect or challenge at16:40:09.570–16:40:10.344UTC.
UNICODE-CASING-SOURCE.md preserves177selected plaintext rows:119SpecialCasing
plus58simple-titlecase differences, exact full bodies and source/license metadata.
This pins16.0.0 to the measured ICU77.1/Unicode16 runtime, not latest Unicode.
Main's separate16:58:37.071–16:58:37.411UTC read-only verification recaptures12
actual Git objects matching24archived copies, checks9snapshot inputs,126sealed
entries and full1165source/1976compiled inventories under socket/socketpair denial.
No native request, DOM/layout, page decode or Git executes inside that verifier;
bounded plaintext re-extraction is explicit. Case-rendering development and its
source-data generation are separate, not proven by this source capture. Wider
website, hardware/benchmark/Astra/Poe research, provider/passkey/device and
challenge acceptance gates remain open; no whole-site or global-host-count claim.

September12 post-indentation Selenium check on committed14032 independently
observes the same captured six statements, not a new live page: raw/applicable
unsupported CSS counts each drop4→3. Native div e136 text-indent:80% is accepted;
capitalize/lowercase/uppercase text-transform remain unsupported. One native
parse at16:23:10.903–16:23:10.953UTC yields197nodes/revision198, unchanged; no new
HTTP, image hydration, layout or click. SELENIUM-INDENT-CSS-CHECK.md retains source,
output and release pins; separate16:25:56.474–16:25:56.549UTC kernel-denied read-only
verification checks20sealed entries, nine actual-Git-linked snapshot inputs and
all1165source/1976compiled files without page imports/reparse. Main's execution
and verification are not an independent implementation review. Original live
partial and four-issue diagnostic remain unchanged; no full-page or navigation
acceptance and no new host. Text-transform is the next localized compatibility
gap, not permission to drop guards, strip CSS or retry a restricted website.

September12 CSS Text source research preserves the original single200response
followed by an absent-header capture-harness TypeError: zero native parses there.
TEXT-INDENT-TRANSFORM-SOURCE.md is not relabeled a successful capture workflow.
TEXT-INDENT-TRANSFORM-EXTRACTION.md records the separate native cached extraction
and its independent verification: one parse,12733nodes,74headings,10308 context
code units across indentation and transformation, no further HTTP/layout/scripts.
Main's additional16:07:21.958–16:07:22.164UTC read-only sealed check passes12groups,
recaptures17actual Git objects matching51archived copies, and confirms14snapshot
inputs and both original/new seals unchanged. Original extraction-receipt limits
remain explicit; no retrospective attestation or latest-remote-revision claim.
This is narrow source research, not completion of the broader LLM hardware,
benchmark, Astra/Twitter or Poe/Reddit research, credential/passkey/device gates,
or website/challenge acceptance. Attempted-host count remains87, not87site passes.

September12 native text indentation supports signed lengths/percentages, bounded
CSS math, inherited computation, hanging/each-line, own-block percentage basis,
wrapping/floats/atoms and consistent hit/paint geometry in the horizontal/LTR
profile. TEXT-INDENT-NATIVE.md records200 new cases and63 existing math cases
newly selected, not263 new tests. Independent review found oversized-indent
alignment/overflow beyond the initial14017 passing selection;15new regressions
fail before correction and pass after separating fitting from signed alignment
space. Corrected clean round01 passes14032 cases, zero failures and two unchanged
exclusions across271 suites; build, strict and formatting checks pass. Original
failures remain evidence, including the unrelated legacy intrinsic grid guard.
Source-capture failure and separate extraction are not relabeled. Text transform,
rich HTML buttons, live Selenium click/full-page, provider/passkey, SafeJS,
device/TTY, challenge-solving and measured timing-speedup acceptance remain open.

September12 separate offline native CSS localization on the exact captured
Selenium basic document identifies text-indent:80% and text-transform values
capitalize/lowercase/uppercase as its four applicable unimplemented-property
diagnostics. At15:28:04.980–15:28:05.031 UTC, one13769native HTML parse inspects
seven style-bearing owners,121CSS code units and six declarations; zero HTTP,
image hydration or layout. SELENIUM-SIMPLE-CSS-DIAGNOSTIC.md preserves the
pre-parse import-path failure and unchanged successful capture/runtime hashes.
Read-only kernel-denied verification15:32:53.085–15:32:53.161 UTC checks21sealed
entries and source1160/compiled1972 inventories without reparsing. This accounts
for the CSS counters, not every possible click/layout obstacle; neither CSS
feature is implemented by this diagnostic. These are concrete compatibility
follow-ups, alongside the still-pending real HTML button work. Do not drop
unsupported guards or relabel this offline finding as a live retry/success.

September12 separately declared Selenium basic-fixture testing uses committed13769.
Two GET200responses load simpleTest.html and its GIF,1423encoded/3250decoded
bytes total; the initial197node document commits. Eight native anchors yield
one genuine e137 reference click toward resultPage.html, which stops at the
unsupported document-width formatting guard before any destination request.
SELENIUM-SIMPLE-FLOW.md retains the15:21:45.553–15:21:46.395 UTC partial failure,
three clear exposed policy observations and261.055491ms request-start interval.
Four applicable CSS issue counters are observed live, not localized by that run.
No retry, post-stop analysis, successful hit/paint or full navigation acceptance
is claimed. Parent verification15:30:10.010–15:30:10.301 UTC checks17actual Git
objects against34archived copies,14inputs and221sealed entries across10groups
without page/network replay. Selenium is already in the87attempted-host union.
This is not a forms, button, speedup, security or whole-site acceptance pass.

September12 Selenium web-form testing retains a stopped partial result on
committed13588, not the later13769 alignment release. One GET200 response
(1233encoded/4988decoded bytes) precedes a before-wire local rejection of the
off-origin jsDelivr stylesheet. At15:13:09.715–15:13:10.434 UTC, no document
commit, control/anchor snapshot, click, form action or retry occurs. This is
the experiment's exact-origin admission boundary, not a proved server denial
or native browser defect. SELENIUM-WEB-FORM-FLOW.md preserves original errors,
cleanup and post-run tooling failures without replay. Parent verification at
15:19:53.550–15:19:53.879 UTC recaptures eight actual Git objects against both
archives, verifies five inputs/165sealed entries and seven flow-check groups
under kernel socket/socketpair denial. Flow acceptance remains false. Selenium
is already historical:87attempted hosts remain, not87working websites; jsDelivr
was discovered but not contacted. Broader gates and form-control coverage stay open.

September12 ordinary block-content alignment adds real descendant translation
without moving the owner's physical content box. Positional safe/unsafe and
distribution fallbacks, independent contexts, text/atoms/floats and empty-marker
native anchor policy are covered. BLOCK-CONTENT-ALIGNMENT.md retains original
0/4baseline, marker failures and obsolete-guard integration failures. Final
2026-09-12T15:12:20.251Z–2026-09-12T15:15:16.493Z UTC gate passes13769/0/2 across266selected
suites; build,265strict roots and13file formatting pass. This adds153new cases
and selects28existing cases, not181new tests. The clean657entry manifest and
1160source/1972compiled inventories exclude unrelated dirty work. Real HTML
button conversion/theme/fit-content/baseline/state remain pending, as do scroll,
block baseline-sharing and table-cell alignment. Two untracked suites retain
old alignment expectations outside this clean gate. No new live, performance,
provider/passkey, SafeJS/TTY/device or challenge acceptance is claimed.

September 12 cached block-alignment research uses committed13588 for exactly
one offline native parse of the unchanged September11 W3C capture. At
14:37:52.834–14:37:53.170 UTC, 76 observed headings yield the requested sections
5.1 introduction and5.1.1: 1506/1080 context code units, with zero HTTP or layout.
BUTTON-BLOCK-ALIGNMENT-SOURCE.md records non-normal independent formatting
contexts, block-axis collective alignment and the non-scroll safe-overflow rule;
fixed/auto extent and general button-baseline semantics remain unresolved.
Parent verifies eight actual Git objects/five inputs and 27 sealed private
files at14:43:04.440 UTC without reparsing. Old source receipts remain unchanged.
Separately, the pending button fixture removes an incorrect inline-strut
assumption: ordinary native comparators pass9px/8px heights, while both corrected
button cases still hit the unsupported rich-content guard at14:37:02.691 UTC.
Those unfinished tests/manifest edits are not in the13588 release; no button,
website, performance, provider, passkey or broader acceptance is claimed.

September 12 weather-service testing on committed13588 contacts one additional
host beyond the 86-host inventory: www.weather.gov. Eight GET200 responses
(one document, seven stylesheets; 46919 encoded /201151 decoded bytes) precede
a stop at the first exposed resource-policy observation, before page commit or
any anchor inspection/click. Twelve image denials and one CSS-import policy
issue are recorded; their exact underlying rule is not proved by the observation.
WEATHER-SERVICE-FLOW.md preserves the 14:32:15.255–14:32:17.731 UTC partial
failure, zero retries and seven measured request-start intervals of at least
250ms. This is not remote-arrival timing, NASA causality or whole-site success.
Parent verifies eight actual Git objects against both captures (five inputs)
and all 188 sealed entries at 14:43:03.776 UTC with no replay. The total is now
87 attempted hosts; the immutable seventeenth inventory remains an 86-host
snapshot from before this run. Broader gates stay open.

September 12 seventeenth website inventory records 86 attempted hosts, adding
only www.nasa.gov to the retained 85-host union; workingWebsiteCount stays null.
The metadata snapshot at 14:23:38.837 UTC distinguishes NASA's failed partial
load, Netlib's bounded FAQ success, Libjpeg's failed captured replay and known-
host source research. It does not include later request-start pacing acceptance
or any pending weather-service run. WEBSITE-TEST-INVENTORY-SEPTEMBER-12-
SEVENTEENTH-UPDATE.md and its JSON retain 17 untested candidate workflows.
Parent metadata verification passes at 14:27:34.817 UTC: 39 selected metadata
paths, seven actual committed metadata blobs, 391 inherited paths/1223 claims
classified before reads; 389 paths not rehashed, including all 47 predecessor
payload exclusions. Of 568 ledger claims, only 16 selected-target claims are
rehashed. No payload files, native runtime, live tests or historical edits.

September 12 request-start pacing strengthens the documented grant-only
contract: synchronous cookie/request startup now runs inside the owned origin
grant, and cooldown starts after invocation without waiting for the response.
Ten original-source regression failures are retained. The focused four-suite
gate passes 215 cases; build, 260-root strict checks, formatting and the broader
261-suite native gate pass 13588/0 with two unchanged exclusions at
14:20:48.559–14:23:43.100 UTC. Count growth is 28 new cases plus 59 pre-existing
pacing cases newly selected, not 87 new tests. The clean 653-entry manifest is
unchanged. REQUEST-START-PACING.md and REQUEST-PACING.md preserve the original
contract/history and distinguish in-memory constructor tests from real wire
timing. NASA causality, website improvements and speedup remain unproved;
rich-button descendants and all broader acceptance gates remain open.

September 12 NASA homepage testing on committed13501 adds one attempted host,
www.nasa.gov, beyond the retained 85-host inventory. One native GET returned
HTTP 200 (46546 encoded / 355707 decoded bytes); the next original stylesheet
attempt failed before a second recorded wire event with a wrapped ERR_ASSERTION.
No page committed or About/editorial link was clicked. NASA-ABOUT-FLOW.md keeps
the original 13:59:38.807–13:59:39.387 UTC failure, limits and missing assertion
detail: neither a NASA access denial nor an exact pacing root cause is proved.
Parent independently verifies 16 actual Git objects, 13 committed inputs and
153 sealed entries in 13 read-only groups at 14:13:25.842 UTC. No website retry,
credentials or broader acceptance. A separate fake-clock pacing regression
currently reproduces five short-start intervals; rich-button descendant layout
also remains unfinished with its two original native failures retained.

September 12 native button-layout source check uses committed13501 for one
GET20054444encoded/366253decoded bytes at13:46:51.121–13:46:51.250UTC. Fresh
WHATWGrendering bytes exactlymatch the originalnativeSeptember12capture and
reportSeptember8last-modified; no newhost or websiteinteraction. Native source02
retains1205-characterlayout+148-characterapplicability sections; source04 adds
threeCSSblocks withactualcontext, separating generalbutton defaults from
conditionalbidi/base-select rules. BUTTON-LAYOUT-SOURCE.md corrects a conflicting
externallookup assumption without inventing its versionhistory. Sourcebound
failures andshortincompleteexcerpts remain. Parent13actualGitinputs and69sealed
receipts verifyread-only underkernelsocketdenial at14:01:28.860UTC. This source
research doesnotimplementrichbuttons orcompleteanywebsite/security/performance
gate; actualdescendantlayout and independentGoCSS/CSP limitations remainopen.

September 12 captured Libjpeg replay on committed13501 confirms that the
former blanket float/container guard givesway to independent supported-profile
width rejection. One actualcurrentdocumentation click,3captured responses/
30178decodedbytes,zeroHTTP/newhosts at13:48:12.786–13:48:13.420UTC.12nonCSS/
39applicableCSS/4deferred remain; this is not successfuldocumentationnavigation
orfullpagegeometry. LIBJPEG-FLOAT-SHELL-REPLAY.md retains all170sealedentries
and failedpreflight .sha259 setup beforetheonlyreplay. Parent independently
verifies16actualGitobjects/13inputs/14readonlygroups at13:52:58.787UTC. Parent
postprocessing initially assumed Checks ratherthanGroups fields; existing
exit0output is schema-verified at13:53:54.809UTC without rerunningtheverifier.
All originalcaptures/failures stayunchanged. No broaderacceptance isclaimed.

September 12 fresh Netlib regression on committed13501 passes one genuine
homepage-to-FAQ flow:4GET20034762encoded/decoded bytes at13:43:44.718–
13:43:45.803UTC.21currentanchors yield ref e133; click commitsFAQ/newdocument/
title/history and11352codeunits ofreadabletext. Five exposedresource-policy
checks areclear, notinstantaneousdenialinstrumentation. Two nativeGIF initial
147x148frames remain; all4bodies match13226 onlyin post-live comparison.
NETLIB-FLOAT-SHELL-FLOW.md preserves theboundedpass and176sealedentries. Parent
verifies16actualGitobjects/13inputs/15readonlygroups at13:52:58.554UTC. Zero
newhosts, retries, mocks, redirects oradmissiondenials. This is not a general
performance benchmark or entireNetlib/browser acceptance. Historicalreports
and the85host inventory remainunchanged; broadergates stayopen.

September 12 sixteenth inventory records85attempted hosts, addingonlygo.dev
to the immutablefifteenth84host union; this is not85working websites. The two
Go13446flows and completedLibpng13446replay remain distinct from the13501
isolated source gate. Go stylesheetflow contract acceptance andfirst-policy-
denial-stop are explicitly unproved after56nonthrowingCSPimage denials.
WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SIXTEENTH-UPDATE.md and its schema3JSON
retain workingWebsiteCount:null. Parent independently rehashes319metadata
inputs andchecks2actual previous committed files at13:49:03.440UTC;47inherited
payload claims are copiedonly, not reopened or newly verified. This doesnot
repeat the prior checksum scopeexception. Pending13501Libjpeg/Netlib results
and laterbuttonsourceinvestigation are not folded into this datedsnapshot.
Historical reports remain unchanged and the broader acceptance gates stayopen.

September 12 native float-shell coordination gate passes13501/0/2,
adding55cases with1364focused passes across33suites.
FLOAT-SHELL-COORDINATION.md records ordinary float scopes with real flex/grid/
table shell heights, reflowed text, retained metadata and one atomic merge per
scope. Existing child-float/floating-container roots and grid atomic baseline
limitations remain guarded. New regressions reproduce then fix missing floated
atomic metrics and grid background hit ownership;14old blanket guards now check
real geometry without deleting cases. A mocked native grid-anchor click checks
actionability separately from live websites. Full gate2026-09-12T13:33:04.718Z–2026-09-12T13:35:58.306Z;
259selected/258strict/653manifest/1155source/1968compiled.
Historical failures and user residuals remain unchanged. Real Libjpeg/Go flows,
performance, research/providers/passkeys/devices/TTY/SafeJS/challenge acceptance
remain separate open gates; no whole-browser completion or push is claimed.

September 12 separate Go stylesheet-origin flow on committed13446 receives
threeGET200,39271encoded/175096decoded bytes at13:21:05.069–13:21:05.802UTC.
Homepage commits;96anchors inspected and one genuine current-ref documentation
click fails Rich button content layout is not implemented before destination.
The predeclared extra origin is only Google Fonts original-loader CSS. No
newhost is added beyond the first Go run; no source stripping, fallback or retry
occurs. IMPORTANT:56earlier nonthrowing CSP image policy denials did not cause
the promised immediate stop. First-policy-denial-stop coverage and contract
acceptance are therefore NOT proved. The later exception is only the first
recorded top-level failure, not the first policy denial. GO-STYLESHEET-
DOCUMENTATION-FLOW.md retains this limitation, original sources and155sealed
entries. Parent verifies13actualGit objects/10inputs/12readonly integrity groups
at13:30:57.972UTC without treating them as contract or website acceptance.
The first single-origin Go report remains unchanged; broader gates remain open.

September 12 Go documentation flow on committed13446 receives one native
GET200,12085encoded/64185decoded bytes at13:08:35.278–13:08:35.658UTC.
The original loader discovers a Google Fonts stylesheet, but the predeclared
single-origin policy rejects it before transport. Zero commits, anchor
inspections or clicks follow; this is a harness admission boundary, not a
server challenge or demonstrated layout defect. Onlygo.dev is attempted and
adds one to the84host inventory; a separate85host inventory update follows.
GO-DOCUMENTATION-FLOW.md preserves the failed flow and141sealedentries. Parent
verifies13actualGit objects/10inputs/12readonly groups at13:16:52.939UTC.
No origin expansion, stripping or retry occurs within that completed run.
A separately contracted followup admits only the observed public stylesheet
origin; its pending result is not folded into this historical observation.

September 12 fifteenth website inventory records84attempted hosts, not84
working websites. Onlylibjpeg-turbo.org extends the immutablefourteenth83host
union;www.libjpeg-turbo.org was allowed-only. WEBSITE-TEST-INVENTORY-SEPTEMBER-
12-FIFTEENTH-UPDATE.md and its schema3JSON preserve13226live evidence separately
from the13446isolated code gate, plus completedNetlib13226 and retained source
research. The inventory excludes the then-pending13446Libpng replay; its later
completed report is a separate dated result, not a rewritten inventory. Parent
checks321of322inputs and2actualprevious committed files at13:04:32.969UTC. One
inherited source checksum retains its explicit agent no-reopen scope exception;
parent verifies only that inherited digest and does not reopen that payload.
WorkingWebsiteCount remainsnull; all broader acceptance gates remain open.

September 12 captured Libpng replay on committed13446 confirms49to41 non-CSS
occurrences: eight cellpadding guards removed;33hard guards and8coordinator
markers remain, with8deferred subtrees. All16HTMLcells across8originaltables
compute64padding sides at5px. The genuine FAQ click still fails width resolution
before a destination request. Exactly23captured responses and zero HTTP/wire/
newhosts; no whole-page used geometry or live website acceptance is claimed.
LIBPNG-CELL-PADDING-REPLAY.md preserves the12:57:20.882–12:57:26.601UTC
observation. Parent independently verifies13actualGit objects/10snapshot inputs/
19readonly groups/237sealed entries at13:02:16.964UTC. Original row backgrounds
and the policy-denied SourceForge badge remain unchanged. Historical failures
and source/live evidence stay separate; the broader goal and acceptance gates
remain open.

September 12 libjpeg-turbo documentation flow on committed13226 receives three
GET200 responses,10690encoded/30178decoded bytes at12:26:18.000–12:26:18.978UTC.
Homepage commits; one genuine current-DOM documentation click on e124 stops at
Float integration with flex, grid and table reflow is not coordinated. There
is no destination request, retry, forced navigation or server challenge. This
independent coordination gap is not repaired by cellpadding support. Only
libjpeg-turbo.org is attempted; www remains allowed-only. It adds one host to
the preceding83-host inventory; a separate dated84-host update follows.
LIBJPEG-TURBO-DOCUMENTATION-FLOW.md preserves diagnostics and the failed flow.
Parent independently verifies11actualGit objects/eightinputs/12readonlygroups/
136sealedentries at12:30:10.928UTC. All historical artifacts remain unchanged.
The source release13446 is separately verified; this older13226 live result
does not establish new-release live acceptance or complete the broader goal.

September 12 native HTML cellpadding support adds220cases and passes13446 with
zero failures/two unchanged exclusions. Exact HTML table/row/group ownership,
streaming integer-prefix/-0 handling, four independent author-origin hints,
existing UA1px defaults, CSS overrides, native geometry/paint/hits and mutation
recovery are covered. New helper bounds parent reads and parses once per table;
raw input and side applications use existing work limits. Review caught an
introduced omitted-charge NaN; default debit1 plus finite-work/formatting and
capacity regressions repair it before release. No unrelated guards/caps relaxed.
The original old13226 canonical CSS control passes and three HTML hints fail;
identical formatted fixture bytes pass after repair. Focused1181/0 across22suites;
full256selected255strict650manifest clean gate passes build/strict/format/native.
HTML-CELL-PADDING.md preserves failed runs, exact native primary table-model
capture and corrected fixture assumptions. Existing percentage-table-width and
float/table coordination gaps remain explicit. New-release Libpng replay/live,
performance, research, providers/passkeys/devices/TTY/realSafeJS and challenge
acceptance remain separate; this feature does not complete the overall goal.

September 12 website inventory fourteenth update records 83 attempted hosts,
adding only www.vim.org. Its off-origin Kuwasha image was rejected before
native transport/DNS/wire and is not added. Working-website count remains null;
83 is not a compatibility-pass count. Parent independently rehashes all 259
consumed inputs and both committed previous-snapshot files at 12:18:54.221 UTC.
WEBSITE-TEST-INVENTORY-SEPTEMBER-12-FOURTEENTH-UPDATE.md and its JSON preserve
the 82-host snapshot and distinguish the failed bounded Vim flow, isolated
13226 gate, offline Libpng replay and incomplete primitive performance study.
The inventory's audit snapshot deliberately excludes Netlib13226/cellpadding
followups that were still pending in its task; their separately verified
reports are recorded in TASKS and add no hosts. No historical evidence, native
test results or wider research/provider/passkey/SafeJS/challenge gates are
rewritten or reclassified as successful website acceptance.

September 12 retained-spec/source investigation identifies the remaining HTML
cellpadding requirements: four cell-padding hints, permissive non-negative
integer-prefix parsing, existing 1px UA default, bounded ownership work and
author-cascade precedence. Applying four sides as one order-minus-two batch is
unsafe; the last side could outrank zero-specificity author CSS. No fix or new
tests are claimed. HTML-CELLPADDING-INVESTIGATION.md explicitly leaves general
HTML table membership unresolved because the linked tables.html is uncaptured.
The initial pre-import harness failure and successful self-directed attempt01
at 12:04:16.494–12:04:16.823 UTC remain; later parent instructions are not
retroactive authorization. No third extraction occurred. Parent verifies eight
release Git inputs plus 18 reviewed source files outside the kernel seal, then
checks all evidence/spec/release/source/compiled ledgers with sockets denied at
12:17:53.083 UTC. Two retained documents yield nine matches; no network, feature
test, live/replay or overall acceptance gate is completed by this investigation.

September 12 fresh Vim documentation test on committed 13226 stops at the
predeclared same-origin admission boundary, not a demonstrated browser-layout
failure or server challenge. Seven GET200 responses from www.vim.org carry
96397 encoded/113897 decoded bytes at 12:04:19.388–12:04:22.079 UTC. The next
Kuwasha image is rejected before native transport, DNS or wire; its host is not
counted. Zero document commits, inspected anchors or clicks; no retry or origin
expansion. One partial-document census is diagnostic context, not a render or
sole-cause claim. VIM-DOCUMENTATION-FLOW.md preserves the failed flow and cleanup.
Parent verifies 11 actual Git objects, eight inputs, 12 readonly groups and
153 sealed entries at 12:07:45.296 UTC. Vim adds one attempted/contacted host to
the prior 82-host inventory; a separate dated inventory update follows. This
is not evidence of 83 working websites or completion of the broader gates.

September 12 fresh Netlib regression on committed 13226 passes the actual FAQ
click: two committed documents, advancing history, changed document identity
and title, released old owner, readable destination text and loaded GIF frames.
The run at 12:09:17.417–12:09:18.308 UTC receives four GET200 responses totaling
34762 encoded/decoded bytes. All four bodies independently match both retained
12470 and 13042 captures. No retries, denials, redirects, mocks or new hosts.
NETLIB-BACKGROUND-COLOR-FLOW.md records the bounded success, not whole-site
parity. Parent verifies eight actual Git inputs and 37 readonly checks at
12:10:50.105 UTC. Historical artifacts remain unchanged. The sealed report
retains one trailing space on line9; staging explicitly records that exception
rather than rewriting evidence or claiming a clean default whitespace check.
Broader performance, research, credential, passkey, TTY, SafeJS and challenge
acceptance gates remain open and separate from this successful native flow.

September 12 paint-order performance observation compares committed 13042 and
13226 over precomputed native layouts. One BA process supplies 54 samples: new
median time is +3.3% for ordinary blocks, +10.5% for separate tables and -4.8%
for collapsed rowspan tables. These order-sensitive observations do not prove
a regression or speedup. The planned AB/BA pair is incomplete: the first run
failed a harness table-coordinator expectation before timing; both authorized
processes are consumed, and no extra benchmark runs were added. Item semantics
pass; collapsed charged work falls from 1046 to 832 in this fixture only.
LAYOUT-PAINT-ORDER-PERFORMANCE.md preserves failures, exact samples and limits.
Parent independently checks 18 actual Git inputs, all 1144/1148 source blobs,
39 sealed artifacts and 54 samples at 12:05:48.497 UTC. Git capture and strictly
socket-denied readonly verification remain separate. No full-browser speed,
website, credential, passkey, SafeJS or overall acceptance claim follows.

September12 captured Libpng replay on committed13226 confirms57to49 non-CSS
occurrences: eight bgcolor guards removed,41hard guards plus8table coordinator
markers remain. All8original rows retain source attributes and compute6blue/
2green backgrounds;8deferred subtrees remain. The actual FAQ click still fails
native width resolution before destination. Exactly23captured responses,zero
HTTP/wire/newhosts; this is not a live visit or full-page render/acceptance pass.
LIBPNG-BACKGROUND-COLOR-REPLAY.md preserves the11:54:48.647–11:54:54.343UTC
observation and all historical evidence. Parent independently verifies11actual
Git objects/8snapshot inputs/18readonly groups/228sealed entries at11:56:10.946UTC.
The broken SourceForge badge remains policy-denied without a request. Latest
website inventory stays82attempted hosts; performance,research,providers,
passkeys,devices,TTY,realSafeJS and challenge gates remain separate and open.

September12 native HTMLbackground-color gate adds184cases andpasses13226
with0failures/2unchanged exclusions. Fulllegacycolorconversion nowdrivesbgcolor
hints onHTMLbody/table/groups/rows/cells/marquee through theexistingcascade.
No strict-hexshortcut,dependency,capraise or unrelatedhintguard suppression.
Testingalsoreproducesandfixes collapsedCSSrowspanbackground/hit order:table
structuralbackgrounds precede owncellbackgrounds,thenexistingborderphase.
Marquee remainsstaticfallback; column behavior staysunchanged. Baseline01
old13042 has1pass/2fail;891focusedcases nowpass. HTML-BACKGROUND-COLOR.md
records253suites/252strict/647manifest,1148source/1964compiled,
1140unchangedinputs andfullgateUTC2026-09-12T11:39:05.200Z–2026-09-12T11:41:48.275Z.
PrimaryWHATWG evidencewasfetchedwithnativebrowsertransport,2GET200/no redirects,
thenparsedoffline. Allfailedfixtures/baselinesremain; pre-existingdirtywork
isexcluded. Fullcaptured/liveLibpng,performance,research,providers/passkeys/
devices/TTY/realSafeJS/challengeacceptance remainopen,notprovedbythisgate.

September12 fresh Netlib13042 regression PASSES the bounded homepage-to-FAQ
flow:21currentDOManchors inspected,one actual FAQclick,two committeddocuments,
checked URL/title/history,newdocument identity,oldowner released and11352text
codeunits. FourGET200 carry34762encoded/decoded bytes;no denials,mocks,retries
oraddedhosts. GIFinitialframes remain available in bothdocuments. Parent
verifies10actualGit inputs and37readonly checks at11:12:58.476UTC,and separately
comparesall4responsebody buffers with historical12470captures:identicalbytes.
NETLIB-QUIRKS-FLOW.md records actual11:10:36.349–11:10:37.263UTC observations,
not a rerun/rewrite of oldevidence. Cumulativeattemptedhostunion stays82;the
thirteenth inventory remains its own immutableearlier snapshot. This successful
publicflow doesnot establishwhole-siteparity orclose broaderacceptancegates.

September12 website inventory thirteenth update records82attempted hosts,
adding onlywww.tukaani.org;the bare allowedalias was never attempted. TwoGET200
carry10113encoded/32394decoded bytes. Homepage commits;14currentDOManchors
are inspected,and one genuine Tukaani developers/about click failsnativewidth
before destination. No denials,retries,bypass orwhole-sitepass. Parent verifies
10actualGit inputs and36readonlychecks;62consumed inventory hashes match.
TUKAANI-DOCUMENTATION-FLOW.md and WEBSITE-TEST-INVENTORY-SEPTEMBER-12-THIRTEENTH-UPDATE.md
retain distinct raw/applicable CSS andoverflow diagnostics,with no solecause
claim. The inventory includes separatezero-browser PCRE CSSattribution,not
newlive evidence ornewcode. Isolated13042gate andallbroaderacceptance remain
separate;historical reports andfailed preparations are unchanged.

September12 retained Libpng source census reconstructs49hard guard occurrences
across41distinct elements:31generic/16table/2inlinevertical,caused by43/16/2
attributes. Eight tabledisplay entries are coordinator markers,not missing
algorithms. Table-specific hints are8cellpadding=5 and8tr bgcolor rows(sixblue,
twogreen);vertical-align:middle failures are2radioinputs,not tablecells.
LIBPNG-PRESENTATION-HINT-CENSUS.md recommends bounded tr bgcolor support via
existing cascade/rowpaint,not suppression or an alreadyimplemented fix. Exact
serializedDOM/sourcepredicate linkage has documented original-ref/event gaps.
All failed imports,doctype roundtrip and parser attempts remain sealed. Parent
verifies13actualGit objects,10snapshot inputs,12readonly groups and280entries
at11:10:43.274UTC with unchanged ledger. No browser/replay/network/geometry run;
all fullwebsite,standards,research,device and other acceptance gates stay open.

September12 isolated PCRE captured-source attribution identifies active
a{text-decoration:underline;cursor:pointer} as the two applicable unsupported
property occurrences;each selector matches43 source anchors. Native whole-sheet
and statement diagnostics agree on6raw/2applicable issues,10source rules,
9retained rules and22declarations. Source262nodes/revision263 stays unchanged.
PCRE-CSS-SOURCE-CHECK.md preserves a prelaunch ledger-base failure and an
incorrect10-versus9 retained-rule oracle before corrected offline success.
Parent verifies20release receipts,1144source,1960compiled,10actualGit inputs
and the216entry original live ledger;27source-evidence receipts pass readonly
verification. Zero browser sessions/requests/clicks/newhosts. Genuine decoration
and cursor support with cascade/paint/interaction tests is the next narrow
PCRE opportunity,not diagnostic suppression or proof of final flow success.

September12 website inventory twelfth update records81 attempted hosts,
adding onlywww.pcre.org;the allowed bare alias was never attempted. TwoGET200
carry2905encoded/8579decoded bytes. One homepage commits;43actual anchors
are inspected,and one real documentation click fails native width before
destination. No denials,retries,bypass or working-site claim. Parent verifies
10actualGit inputs and36readonly checks;56inventory input hashes match.
PCRE-DOCUMENTATION-FLOW.md and WEBSITE-TEST-INVENTORY-SEPTEMBER-12-TWELFTH-UPDATE.md
keep this live13042 failure separate from the isolated13042 test pass and
zero-wire Libpng captured comparison. Existing historical evidence and all
broader browser acceptance gates remain unchanged.

September12 parent-verified captured Libpng comparison records12817 ->13042:
58 ->57 non-CSS guard occurrences and9 ->8 deferred entries;the badge now
uses a replaced imageAlternative while remaining broken,policy-denied,natural0
and undecoded. Each run uses23 original native mocks,zeroHTTP and adds nohosts.
One genuine FAQclick in each still fails native width before destination.
Parent checked10/13 actual Git objects,7/10snapshot inputs and14/16readonly
groups,with stable ledgers. LIBPNG-QUIRKS-COMPARISON.md qualifies eight table
display markers as coordinator entries,not proof of eight missing algorithms.
Original source,failed preparations,reports and historical paths remain intact.
The13042 isolated pass is not fullwebsite or liveacceptance;retained HTML/table
presentation hints and inlinealignment remain investigation targets.

September12 quirks-image follow-up adds mode-aware broken-image alternatives:
dimensioned quirks images use independent replaced sizing and clipped native
text;no/limited-quirks and auto-size quirks retain text layout. Original80x15
badge geometry,hit ownership and real ancestor default action pass while its
mixed-content image stays unfetched,broken,natural0 and undecoded. Direct glyph
painting fixes fractional rescaling and avoids whole-content scratch images.
QUIRKS-IMAGE-ALTERNATIVES.md records225new cases,759focused passes and the
2026-09-12T10:35:50.485Z–2026-09-12T10:38:30.544Z isolated gate:13042passed/0failed/2unchanged
exclusions,250selected suites,249strict roots,644manifest entries. Earlier
failures and corrected focus-oracle baselines remain preserved. Native-only
single-line fallback is not foreign-engine parity or full website acceptance;
all broader website/research/performance/provider/passkey/device/TTY/realSafeJS
and challenge-handling gates remain open.

September12 website evidence eleventh update keeps80 attempted hosts.
A separate Expat contract fetched only the exact already-observed Google
Fonts stylesheet once(HTTP200);six GET200 carried43608encoded/255948decoded
bytes. The homepage committed,and one genuine Documentation click failed at
native width resolution before destination navigation. There were no adapter
rejections,retries,fontbinary fetches or bypass. Parent verified11actual Git
inputs and36readonly checks. EXPAT-FONT-STYLESHEET-FLOW.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-12-ELEVENTH-UPDATE.md distinguish this12650
interaction failure from the original local admission failure and the newer
12817 isolated code gate. CSS/non-CSS guards are independent diagnostics,not
a sole-cause claim. Stylesheet200 is not installed-font or working-site
acceptance;historical failures and all broader browser gates remain open.

September12 website evidence tenth update records80 attempted hosts,not
80working sites:libexpat.github.io contacted,and fonts.googleapis.com locally
adapter-denied before transport under the original same-origin Expat contract.
3GET200 carried41186encoded/247529decoded bytes;zero documents committed or
clicks,one off-origin Google stylesheet admission rejection. Parent verified
11actual Git inputs and35readonly checks;no server/challenge/codec verdict
follows from that local boundary. EXPAT-DOCUMENTATION-FLOW.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-12-TENTH-UPDATE.md preserve the12650 live runtime
separately from the newer12817 native gate and zero-HTTP badge source check.
The separate font-asset contract is excluded from this inventory. Historical
evidence and workingWebsiteCount:null stay unchanged;broader gates remain open.

September12 captured Libpng badge paired-doctype check on12817/3890c33
now passes the HTML5 positive control at216x8 after the border fix;the exact
original quirks doctype still fails with one unsupported-element guard. Both
owners remain mixed-content policy-denied with zero HTTP/resources/decoded
bytes and clean teardown. LIBPNG-IMAGE-BORDER-SOURCE-CHECK.md preserves the two
earlier failed controls and verifies7 actual Git inputs plus full release
ledgers. This is not a full live replay,FAQ success or a new attempted host;
quirks rendering and the overall browser gates remain open.

September12 website evidence ninth update preserves78 recorded attempted
hosts,not78working websites. A new predeclared Libarchive contract admitted only
the exact previously observed public S3 ribbon image:HTML/CSS200,asset403,
3GET/7588encoded-and-decoded bytes,zero document commits/clicks,stopped without
retry or bypass. Parent verification checked11 actual Git inputs and35 readonly
evidence assertions. Original single-origin admission failure is unchanged.
LIBARCHIVE-PUBLIC-ASSET-FLOW.md and WEBSITE-TEST-INVENTORY-SEPTEMBER-12-NINTH-UPDATE.md
record this separately from native gates. Libpng had zero adapter rejections
but an image-owner mixed-content denial before any SourceForge request;this
is not a codec/server result and adds no host. Historical reports/seals and
workingWebsiteCount:null remain unchanged. Broader browser gates stay open.

September12 image-border follow-up:HTML img/object/image-input border
presentation hints now participate in the normal cascade; zero/invalid hints
do not erase author CSS. Native loaded-image geometry/raster/hits and the
standards-mode blocked SourceForge badge border-zero regression pass with
zero badge fetches. The original Libpng quirks fallback and full click remain
unresolved; no network/security policy was relaxed. HTML-IMAGE-BORDER.md records
167 new cases,475 focused passes,and the 2026-09-12T09:48:10.449Z–2026-09-12T09:50:47.980Z
isolated gate:12817passed/0failed/2unchanged exclusions,247selected suites,
246strict roots,641manifest entries. Baseline failure and14 incorrect new
dashed/dotted test fixtures are retained; unsupported styles still reject.
Live/provider/passkey/device/TTY/realSafeJS and broader research/performance/
challenge-handling outcomes remain separate and unverified.

September12 post-list-style verification:paired exact GnuPG HTML/CSS on12470
and12650 reduces raw unsupported-property diagnostics43→38 and applicable14→12;
other diagnostic categories are unchanged. Six navigation lists and one footer
list compute marker type:none. This is source-only evidence,not layout or live
navigation. Two warm serializer microbenchmarks show the complete-pending case
at0.295/0.299 of old median time with identical outputs;static cases show small
1.4–5.0% increases,not a statistically established whole-browser result. Every
workload and both runs are retained. GNUPG-LIST-STYLE-SOURCE-CHECK.md and
CSS-SERIALIZER-PERFORMANCE.md record bounds and hashes. Each probe verifies23
Git inputs and both source/compiled inventories;no HTTP/page session occurs.
The78-host inventory and all broader compatibility,performance,provider/passkey/
device/TTY/realSafeJS/research/challenge/handoff goals remain open. No push.

September12 Libpng candidate:23 native GETs on prior12470/e8375ac,
345538 encoded/366824 decoded bytes,
one committed homepage and one discovered FAQ click attempt that fails native
width resolution. No mocks,retries,off-origin denials or challenge verdict.
The retained census includes CSS/presentation/table/inline-alignment/image
limitations. Parent verifies12 Git blobs and36 readonly checks. The eighth
inventory records78 attempted hosts,not78 working websites;only www.libpng.org
is new. LIBPNG-DOCUMENTATION-FLOW.md preserves the exact older-runtime evidence.
The newer LIST-STYLE.md code gate is separate,not live Libpng/GnuPG acceptance.
Historical failures and Netlib's bounded success remain unchanged;the full
browser/performance/research/provider/passkey/device/TTY/realSafeJS/challenge
goals remain open. No bypass or push.

September12 native list-style improvement:180 new cases and690 focused
checks cover shorthand resets,type/position/image:none,CSS-wide inheritance,
variables,CSSOM/computed values and markers. The selected native gate passes
12650 cases with two unchanged exclusions;build/strict/format and audited
clean projections pass. Reviewer-found pending-shorthand round-trip regressions
are reproduced and repaired,including CSSOM component ordering. LIST-STYLE.md
records limitations and historical failures. Image marker URLs,unrepresentable
pending-group serialization and other GnuPG profiles remain open. This is not
live GnuPG acceptance;older Libpng12470 evidence is separate. Full browser,
performance/research,provider/passkey/device/TTY/realSafeJS and challenge goals
remain open. No limits raised,foreign dependency,bypass or push.

September12 live GIF follow-up:the committed12470 native runtime now completes
one genuine Netlib homepage-to-FAQ click,with two document commits,four GETs,
34762 transferred bytes and no mocks/retries. Parent verifies12 Git inputs and
37 readonly checks. A separate Libarchive candidate makes two GETs/7325 bytes
but stops before commit/click at the fixed harness origin boundary for an S3
image;S3 is never contacted. Its12 Git inputs/34 evidence checks pass. The new
seventh inventory records77 attempted hosts:previous75 plus Libarchive and the
locally denied S3 target,not77 working sites. Captured Netlib GIF decoding is
separate zero-network evidence. See NETLIB-GIF-FLOW.md,
LIBARCHIVE-DOCUMENTATION-FLOW.md,NETLIB-GIF-SOURCE-CHECK.md and
WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SEVENTH-UPDATE.md. Historical failures remain
unchanged;animation,broad compatibility,research,provider/passkey/device/TTY/
realSafeJS and challenge/human-handoff goals remain open. No bypass or push.

September12 native GIF improvement: image/gif dispatch and bounded GIF87a/89a
initial-frame rendering now validate every image frame before loading. Three
new suites add120 cases;573 focused checks and12470 selected native cases pass
with the same two exclusions. Build/strict/format and clean-input audit pass;
details and limitations are in GIF-IMAGES.md. A separate pre-existing Node
capability test outside the selected gate still fails49/1 on the old baseline.
Animation playback and wider compatibility remain open. The75 attempted-host
inventory and previous failed Netlib flow are unchanged; live navigation,
credentials/providers/passkeys/devices/TTY/realSafeJS and challenge handling
are not established by isolated native tests. No bypass or new dependency.

September12,2026 fresh Netlib12350 flow still fails its genuine FAQ click,
after two HTTP200 GETs and one commit. The old deferred center is no longer
the observed node;one img remains deferred with empty CSS diagnostic maps.
Its response declares image/gif and begins GIF87a;native PNG/JPEG-only dispatch
makes GIF support a concrete follow-up,not a verified decode or sole-cause claim.
Parent verifies35 checks,140/142-entry ledgers and eight actual Git inputs. See
`NETLIB-CENTER-FLOW.md` and `WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SIXTH-UPDATE.md`.
The attempted-host union remains75;historical outcomes are not rewritten. Next:
native GIF investigation and scoped CSS compatibility. Broader research/provider/
device/TTY/realSafeJS/challenge gates remain open;no destination success claimed.

September12,2026 GnuPG source-only CSS diagnosis on committed12350 retains
124 parsed rules and35 declaration-diagnostic candidates:ten current matches,
23 unmatched and two unsupported pseudo-element selectors with unknown counts.
Raw/applicable totals remain7/2 invalid values,43/14 properties and2/2 selectors.
See `GNUPG-CSS-COMPATIBILITY-DIAGNOSIS.md`. Font-family,variant/spacing,decorations,
list shorthand,shadows/radii and generated content remain separate features.
List-style shorthand is a concrete regression-backed next candidate,not a
reason to suppress diagnostics. Zero sessions/HTTP/images/geometry;owners close.
Host count75,historical failures and all broader acceptance gates remain open.

September12,2026 native center layout: HTML center now has block/text fallback
and inherited legacy descendant alignment. Used margins center normal blocks
with non-auto explicit margins,including clamped auto widths; computed CSS and
independent float/position/item ownership remain intact. The canonical12254
baseline fails before the change;96 new cases pass,with focused564/0
and selected native12350/0/two unchanged exclusions. Build,236 strict
roots,237 selected suites and631 clean manifest entries pass. See
`CENTER-ELEMENT.md`. The existing negative-center guard fixture now uses a
still-deferred fieldset instead; no independent guard is removed. Next: one fresh
Netlib native flow using the committed release. Historical75-host outcomes and
research/provider/device/TTY/realSafeJS/challenge gates remain unchanged and open.

September12,2026 GnuPG12254 captured replay gets beyond the old clearance-owner
guard but still fails at document-width supported-profile validation. Six exact
mocks include all four images; zero HTTP,one commit and one genuine FAQ click.
Clear requests fall8→2 while independent CSS counts and nine float diagnostics
remain. Parent verifies22 checks,282/284-entry ledgers and eight actual Git
outputs with no new page run. See `GNUPG-APPLICABILITY-FOLLOWUP.md` and
`GNUPG-CLEAR-APPLICABILITY-REPLAY.md`. Host count75 and historical live failures
remain unchanged. Next: Netlib center layout and regression-backed CSS/HTML
compatibility,not guard suppression. Research/provider/device/TTY/realSafeJS/
challenge acceptance remains open; no successful destination navigation claimed.

September12,2026 BusyBox source-only diagnosis on committed12254 isolates
the three raw CSS invalid-value diagnostics to font-family lists; two matching
rules explain the applicable count. Font-size percentages are not the cause.
Nine elements carry unsupported presentation hints,two table-hint owners and
three table-display guards remain. Images are deliberately unloaded,adding
three deferred boxes; this is not equivalent to the sealed live census. See
`BUSYBOX-COMPATIBILITY-DIAGNOSIS.md`. Zero HTTP/sessions and closed owners are
verified. Host count75 and live failure remain unchanged; font fallback,HTML
hints and table coordination need separate tested work. Broader gates stay open.

September12,2026 BusyBox live testing adds one recorded attempted host,bringing
the inventory to75,not75 working websites. Pinned12187 performs four HTTP200
GETs and one genuine About-link click,which fails at the width/profile guard.
Three deferred tables and independent presentation-hint/CSS diagnostics remain.
Parent verifies35 checks,152/154-entry ledgers and12 actual Git blobs without
another page run. See `BUSYBOX-DOCUMENTATION-FLOW.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-12-FIFTH-UPDATE.md`. New clear-applicability
native validation is not this live run. GnuPG captured follow-up,Netlib center
layout,BusyBox compatibility and all broader research/provider/device/TTY/
realSafeJS/challenge gates remain open; historical outcomes are not rewritten.

September12,2026 native clear applicability: inline, boxless, out-of-flow and
flex/grid item declarations retain their computed clear values without becoming
false clearance owners. Normal block/floating requests remain, and forged
inline-level coordinator owners are explicitly rejected. The unchanged12187
baseline reproduces the GnuPG-motivated owner guard;67 new cases now pass,
with focused479/0 and selected native12254/0/two unchanged exclusions.
Build,233 strict roots,234 selected suites and628 clean manifest entries pass.
See `CLEAR-APPLICABILITY.md`. Block-in-inline client geometry and independent
CSS/margin/float/flex/grid/table guards remain explicit. Next: one captured
GnuPG replay of the committed release, independently pinned BusyBox live testing,
then Netlib center layout. Historical74-host outcomes, research completeness
and provider/device/TTY/realSafeJS/challenge gates remain unchanged and open.
The separate pre-existing `inline flow-root` float-blockification gap identified
by source review is recorded but not runtime reproduced or changed here.

September12,2026 GnuPG12187 captured replay: six exact mocks and zero HTTP;
one commit and one genuine FAQ click still fail, now at the supported-block-owner
guard. Parent independently verifies22 checks,281/283-entry ledgers and13 actual
Git outputs. Raw/applicable invalid CSS counts fall13→7 and3→2, while other CSS
and float/clear diagnostics remain. A separate source-only12187 formatting probe
finds six inline anchors carrying clear:left plus two genuine block clear:both
owners. Its unloaded-image279 nodes are not the full replay's277. See
`GNUPG-CLEARANCE-FOLLOWUP.md` and `GNUPG-NONFLOATING-CLEARANCE-REPLAY.md`.
Next: correct clear applicability without stripping CSS or bypassing owner guards,
then resume the Netlib center implementation. Its canonical baseline01 now fails
on clean12187; the older12094 baseline is retained separately and only incidental
glyph-array ordering was normalized before any center implementation. Host count74,
historical/live outcomes and broader research/provider/device/TTY/realSafeJS/
challenge gates remain unchanged and open.

September12,2026 native non-floating clearance: physical source-ordered float
bottoms now position normal blocks before text/descendants and following static
positions. Leading ancestor struts are prepared before entry; zero-strut empty
clearance advances flow. Independent review exposed wrong ancestor origins and
stale later cached floors after an earlier no-op becomes real clearance. Two
and three unchanged regressions reproduced those errors before fixes. Four new
suites add93 cases; focused422/0 and final231-suite native12187/0 with two
unchanged exclusions pass, including230 strict roots and625 manifest entries.
See `NONFLOATING-CLEARANCE.md`. Nonzero-through/adjoining-empty and unresolved
escaped profiles, logical clear and independent CSS/flex/grid/table guards stay
explicit; no full CSS/browser parity claim. Next: one scoped captured GnuPG
replay of the committed release, plus Netlib center layout (its unchanged
synthetic baseline now fails on clean12094). Historical74-host/live outcomes,
research completeness and provider/device/TTY/realSafeJS/challenge gates remain
unchanged and open. No fresh website success follows from this native gate.

September 12, 2026 Netlib native flow: two real HTTP200 GETs,10631 encoded
and decoded bytes,one document commit and one genuine discovered FAQ click.
The click fails at the width/profile guard; the bounded census retains one
deferred center element and no CSS diagnostics. This is not sole-cause proof
or working-site acceptance. Parent verifies35 checks,146/148-entry ledgers
and13 actual Git blobs without another page run. Attempted-host inventory74
adds only www.netlib.org; see `NETLIB-DOCUMENTATION-FLOW.md` and
`WEBSITE-TEST-INVENTORY-SEPTEMBER-12-FOURTH-UPDATE.md`. Native12037 was used,
not the subsequent12094 font release. Next: non-floating clearance and center
layout while preserving all broader research/provider/device/TTY/realSafeJS
and challenge gates. No historical report is rewritten.

September 12, 2026 website evidence: the attempted-host inventory is now73,
not73 working sites, adding only the fresh IANA reserved-domain flow. Two real
HTTP200 GETs commit one document; a genuine discovered guide click fails at
float/flex/grid/table coordination. Parent verification passes35 checks and
13 actual Git blobs. The one full-image GnuPG12037 replay uses6 mocks, zero
HTTP and still fails, now at non-floating clearance; parent passes22 checks,
286/288-entry ledgers and14 actual Git outputs. See
`WEBSITE-TEST-INVENTORY-SEPTEMBER-12-THIRD-UPDATE.md`,
`IANA-RESERVED-DOMAINS-FLOW.md` and `GNUPG-FLOAT-ATOMIC-REPLAY.md`.
No historical flow is relabeled, and the subsequent12094 font release is not
live-site acceptance. Next: scoped non-floating clearance work and the separately
running Netlib flow, excluded from this snapshot until verified. Broader
research/provider/device/TTY/realSafeJS/challenge gates remain open.

September 12, 2026 native font-size keywords: all eight absolute keywords and
parent-relative larger/smaller now compute to native pixels, retaining inheritance,
root/rem, frozen identity, custom-property behavior and independent limits. The
eight-value table and 1.2 relative ratio are explicit native policy, not verified
Fonts 4/browser parity. An unchanged baseline geometry/raster/hit fixture fails
before and passes after; 57 new cases, focused 477/0 and the sealed 227-suite
native gate pass 12094/0 with two unchanged exclusions, 226 strict roots and
621 clean manifest entries. See `FONT-SIZE-KEYWORDS.md`. The verified GnuPG
captured replay still fails at non-floating clearance; the fresh IANA flow fails
at float/flex/grid/table coordination. Those observations used the earlier
12037 runtime and do not validate this release on live sites. Next: bounded
clearance implementation and fresh public documentation flows. Research
completeness and provider/device/TTY/realSafeJS/challenge gates remain open.

September12,2026 zlib CSS recovery replay: exactly one11952 native session
replays nine original responses with zeroHTTP, one page commit and one genuine
FAQ click. The invalid-rule diagnostic drops1→0 and one advisory discarded-rule
diagnostic replaces it; original76-characterstyle and other sourcebytes remain.
Center/table/HTMLpresentation guards still block the FAQ before any destination
request. Parent reproduces17 read-only checks and eight exact localGit outputs;
sealed original/replay evidence and sampledcleanup remain intact. See
`ZLIB-CSS-RECOVERY-REPLAY.md` and `ZLIB-CSS-RECOVERY-FOLLOWUP.md`. This closes the
scoped CSS-recovery comparison, not zlib website acceptance, and adds no host to
the72 attempted inventory. The newer12037 float release has separate GnuPG replay
and fresh IANA flow checks underway; do not merge their runtime/time scopes.

September12,2026 native float/inline-block coordination: shared bounded flow now
measures and places inline-blocks beside/inside floats and floats inside atomic
contexts. Review exposed and tests reproduced floated-child baseline leakage and
missing auto-width floating contributions; both are fixed, retaining actual
float boxes/height and normal-flow baselines. Five new suites add85 cases;
focused534/0 and sealed224-suite native12037/0 with2 unchanged exclusions pass,
including223 strict roots and618 clean manifest entries. The old nested-auto
rejection is now a measured-width success case; unsupported flex/grid/table,
nonfloating-clear and CSS profiles stay guarded. See `FLOAT-ATOMIC-COORDINATION.md`.
The native intrinsic policy is not full CSS sizing/height-dependent packing
parity. Next: new scoped captured GnuPG replay on this committed release, without
relabeling its original failed live flow. Broader site/provider/device/challenge
and research-completeness gates remain open.

September12,2026 GnuPG source-only triage: one socket-denied native formatting
build identifies seven inline-block navigation nodes in the float coordinator's
explicit rejected combination, beginning with list iteme48. No page session,
navigation, mock orHTTP; unloaded images make this279-node/two-deferred source
census distinct from the277-node/no-deferred live census. Nine float/eight clear
and independent CSS guards remain. See `GNUPG-FLOAT-DIAGNOSIS.md`. Next: minimize
inline-block navigation plus floated sibling, then implement bounded atomic/float
reflow coordination with geometry/raster/hit regression checks, not guard removal.

September12,2026 fresh GnuPG documentation flow: six native wireGETs, zero mocks,
one actual page commit and one genuine discovered FAQ click. The click fails
before any destination request at float integration with atomic/flex/grid/table
reflow; independent applicableCSS3/14/2 and float9/clear8 guards remain, with no
deferred subtree. Parent reproduces35 read-only checks,145/147-entry ledgers and
eight exact pinnedGit blobs; all sampled owner classes close. No retry, source
stripping, credentials or bypass. See `GNUPG-DOCUMENTATION-FLOW.md` and the complete
`WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SECOND-UPDATE.md` / matching reports JSON.
The exact union is now72 attempted hosts, not72 working sites. This flow uses
11901/1478cd7, not the later11952 CSS release; older outcomes and the RFC Editor
duplicate correction remain unchanged. Next: diagnose coordinated float reflow
from the capture, independently of remaining CSS guards; zlib CSS replay pending.

September12,2026 new Lua percentage-table replay: exactly one11901 native session
replays four unchanged captures with zeroHTTP; seven collapsed-border guards
drop to zero, but the genuine manual link still fails before any destination
request. Independent CSS/presentation/table display guards remain; bounded
extraction still fails and formatting work increases30299→31358. Parent reproduces
16 read-only checks,120 ledger entries and nine exact localGit outputs. Original
live/replay/corrected-source evidence stays immutable. See
`LUA-PERCENTAGE-TABLE-REPLAY.md` and `LUA-PERCENTAGE-FOLLOWUP.md`. This closes the
previous request for a newly scoped11901 comparison, not Lua website acceptance,
and adds no host to the71 attempted-host inventory. The later11952 CSS recovery
release has a separate zlib replay pending; provider/device/challenge gates remain.

September12,2026 native stylesheet recovery: exact stylesheet-boundary CDO/CDC
tokens are ignored without stripping HTML-style comment blocks or rewriting
source. Incomplete qualified rules at EOF retain a specific advisory diagnostic;
independent lexical, unsupported CSS and nested-context guards remain. The exact
captured zlib style fixture fails before and passes after with geometry/raster/
hits and original bytes checked. Three suites add51 cases; focused580/0 with
one existing exclusion and sealed219-suite native11952/0 with2 unchanged
exclusions pass, including218 strict roots and613 clean manifest entries.
See `CSS-STYLESHEET-RECOVERY.md`. This does not resolve the full zlib HTML center/
table/presentation profile, prove its FAQ click or close any live/device/provider/
challenge gate. Next: separately scoped capture replay on the released runtime;
keep the original live and replay outcomes immutable.

September12,2026 fresh zlib resource-budget flow: the new predeclared32-GET
scope makes9 actual GETs and commits the root document, then its genuine
discovered FAQ click fails native layout before any destination request. All
eight overlapping resources match the old captured encoded/decoded bytes; the
old8-GET failure remains unchanged. Parent reproduces38 checks and238/240-entry
seals, including the explicit21-input runtime pin and observed document/image/
event/control cleanup. Its nested Git-IPC verifier failure and exact-blob preload
correction are preserved, with no extra native run. The census exposes native
center/table, HTML-presentation and CSS-rule blockers; it is not a sole-cause
proof. See `ZLIB-RESOURCE-BUDGET-FLOW.md` and
`reports/zlib-resource-budget-2026-09-12.json`. This run uses11784/ffc7b2, not the
new11901 percentage-table release. The inventory stays71 unique attempted hosts,
not71 working sites; broader interactions and challenge/provider/device gates
remain open, and Lua still needs a new scoped check on the new release.

September12,2026 percentage cell widths: automatic tables now use simple CSS
percentage width preferences in both separate/collapsed models, with intrinsic
row/span maxima, constrained track allocation, spacing and actual box edges.
An unchanged failing geometry/hit fixture passes; three new suites add53 cases.
The final focused14 suites pass579/0 and sealed216-suite native gate11901/0 with
2 unchanged exclusions,215 strict roots and610 clean manifest entries. The
legacy intrinsic grid rejection is separately reproduced on clean source and
left outside the established gate. Cell max-width remains intentionally ignored;
percentage minimum/padding/height/mixed-math, root/group/row sizing, HTML width
hints and other independent profiles remain limited. Conservative intrinsic
bounds are not full CSS Tables3 parity. See `TABLE-PERCENTAGE-WIDTHS.md`.
Next: a newly scoped Lua capture replay on this actual release is still required;
the prior failed Lua click and fresh zlib11784 flow are not retroactively relabeled.

September12,2026 Lua collapsed-border replay and diagnostic correction: exactly
two offline native page runs retain the same four original responses, failed
manual click, one deferred table and seven collapsed-border guards. No new HTTP
or destination request; native DOM agrees, bounded extraction fails unchanged.
Parent reproduces27 original replay checks and113/115-entry ledgers, but also
finds a wrong `a` rule excerpt that those checks missed. The additive correction
audits all38 grouped records, fixes only the two inaccurate excerpts/offsets and
passes21 correction checks plus60 separate native-parser regression cases.
Original seals remain unchanged, with no third page replay. Parent invocation
failures/corrections are explicit. See `LUA-COLLAPSED-FOLLOWUP.md`,
`LUA-COLLAPSED-TABLE-REPLAY.md` and `LUA-CSS-DIAGNOSTIC-CORRECTION.md`.
Next gates: isolate the remaining table/CSS/presentation-hint blockers before
claiming Lua layout/navigation progress; use a newly scoped resource-budget
contract before another zlib flow. The71-host inventory and11848-pass selected
native gate remain distinct from live-site, credential/passkey-device, real
SafeJS/TTY, fingerprinting and challenge-handling acceptance. Overall goal open.

September12,2026 zlib live follow-up: the pinned11784 runtime returned eight
HTTP200 responses (one document/seven images), then stopped before transport of
the ninth resource at the fixed eight-GET cap. Zero commits/anchors/clicks;
formatting unobserved, not a native-layout or access-restriction verdict. Parent
reproduces37 evidence checks and150/152-entry seals; its initial Git-IPC verifier
failure and exact-blob preload correction remain explicit, with no live rerun.
`ZLIB-NATIVE-FLOW.md` and `WEBSITE-TEST-INVENTORY-SEPTEMBER-12-UPDATE.md` record
the outcome and complete71-unique-host inventory. Previous70-host records remain
unchanged. A separately scoped resource-budget follow-up is still needed before
zlib layout/navigation acceptance; Lua replay source-attribution review is pending.

September12,2026 collapsed-border model follow-up:64 deterministic dense-oracle
cases now cover32 generated grids in both resolver directions, cell/perimeter
widths, participant/occupancy order independence and exact work-budget edges.
The focused20 suites pass911 cases; the source-built213-suite clean regression
passes11848/0 with2 unchanged exclusions,212 strict roots and607 manifest entries.
No production/runtime or manifest change; the failed old-dist preparation stays
recorded separately. See `COLLAPSED-BORDER-MODEL-CHECK.md`. Lua replay and zlib live
follow-ups retain the independently sealed11784 runtime and separate acceptance
gates; this native-only result does not establish their website outcomes.

September12,2026,03:51 UTC: native automatic tables gain actual collapsed-border
conflict resolution, half-width sizing and shared single-alpha painting within
the existing none/hidden/solid profile. Sparse bounded edges retain spans,
row/group/table participants, transparent/hidden winners and physical hit
ownership. Original CSS/DOM remain intact; padding/spacing/empty-cells are ignored
for the collapsed model. Nested models, ancestor translation, relative overlays,
mutation caches and a genuine native pointer link flow have isolated coverage.
The unchanged failing baseline passes; five new suites add186tests. Final focused
847/0 and sealed gate11784/0/2 unchanged exclusions pass across213 selected suites,
212 strict roots,607 clean manifest entries,1103source/1944compiled files.
See COLLAPSED-TABLE-BORDERS.md. Two early type-check stops and two expanded fixture
failures are preserved. Column/caption/fixed/positioned-role and percentage
profiles remain guarded; nonzero borders on empty grids and float/table reflow
still need support. Native junction/max-half-edge policies are not full CSS
Tables3 harmonization or cross-engine pixel parity. Existing Lua/Man7 failed
clicks are not relabeled: bounded website/replay follow-ups remain required.
The broader performance, site interactions, crawler/challenge handling and
provider/device/TTY/real-runtime gates stay open; pre-existing edits are retained.

September12,2026,03:17 UTC: parent independently verifies the fresh Lua5.4
manual flow and paired Man7 captured-page replay on native11599 release0ca889d.
Lua makes4HTTP200 GETs/45114bytes, commits the contents page and genuinely clicks
the discovered manual.html link; native layout stops before destination transport.
Applicable CSS, presentation-hint and collapsed-table-border guards remain.
Actual document/image/event/control cleanup and24 evidence checks/121+123 ledgers
verify. The two Man7 offline runs use4mocks each/zeroHTTP: noscript deferral drops
5→4, but table/fieldset/CSS guards still block date(1). Parent reproduces40 passed
and1failed replay check: old mock pacing249.957322ms is below250ms, preserved without
retry. Both74+75 ledgers and sampled owner cleanup verify, not full acceptance.
The consolidated WEBSITE-TEST-INVENTORY-SEPTEMBER-12.md and matching JSON list
70 unique attempted hosts including new www.lua.org. Prior subtotals double-counted
www.rfc-editor.org already present in the54-host baseline:66/69/70 correct to
65/68/69, then Lua adds one. Historical reports/measurements remain unchanged.
This is not70 working websites. Next real gaps include collapsed table borders,
fieldset/legend and remaining applicable CSS; pacing-harness precision also needs
separate qualification. Genuine destination flows, broader performance/crawler
coverage and private provider/device/TTY/real-runtime gates remain open.

September12,2026,02:55 UTC: native noscript now follows the document's scripting
profile instead of an unconditional layout deferral. Disabled fallback children
use ordinary layout/paint/hit paths; active HTML noscript stays display:none even
against author!important. Early internal state preserves public parse-info timing;
owner-state fragment replacement, serialization escaping and text/label locators
have coverage. The corrected unchanged baseline fails before the fix and passes
after it. Three new suites add58checks; final focused570/0 and sealed release
11599/0/2 unchanged exclusions pass across208 selected suites,207 strict roots,
602 clean manifest entries. See NOSCRIPT.md, NOSCRIPT-SOURCE.md and
NOSCRIPT-SERIALIZATION-SOURCE.md. Native WHATWG acquisition retains threeGETs/five
offline sections; the separate serialization source adds one offline section and
zeroHTTP. Source checks and complete ledgers are independently reverified.
This is not full four-mode scripting, general scripting media-query support or
real SafeJS acceptance. Man7's other table/fieldset/CSS guards and its genuine
date(1) navigation remain unverified after this fix; Debian's bounded-budget stop,
other website workflows, performance, crawler/challenge handling and private
provider/device/TTY gates remain separate. Pre-existing edits stay unbundled.

September12,2026,02:22 UTC: parent independently verifies the fresh Man7 and
Debian native probes on actual11492 runtime99108ab. Man7's optional tracking-image
policy rejection stays local, allowing the initial ls(1) document to commit with
both original CSS loads; one genuinely discovered date(1) click still fails layout before
destination transport. Four HTTP200 GETs carry23256 encoded/39562 decoded bytes.
All36 assertions,104/106 ledgers and actual document/image/event/control cleanup
verify. Debian adds www.debian.org: eight HTTP200 GETs carry17557 encoded/52649
decoded bytes, then the ninth adapter entry is rejected at the eight-GET cap before
wire. No commit/discovery/click/census occurs; document/image cleanup verifies,
event/control cleanup remains unproved. All28 assertions and83/85 ledgers verify.
Neither flow retries or bypasses restrictions. The additive follow-up inventory
records70 attempted exact hosts, not70 working sites, without rewriting earlier
reports. See WEBSITE-TEST-FOLLOWUPS-SEPTEMBER-12.md and its machine-readable record.
Continue actual CSS/table/fieldset/noscript investigation, overflow work and varied
website coverage. Debian needs a separately scoped resource-budget follow-up;
its cap failure is not a browser-layout verdict. The full goal remains open.

September12,2026,02:13 UTC: `OPTIONAL-IMAGE-FAILURES.md` records five new native
session regressions establishing that existing local image failures preserve
original CSS/DOM, error/load ownership and genuine link navigation; shared-image
source recovery remains local, while global cancellation closes candidate owners
without replacing the previous page/history. The prior Man7 stop was a harness
global-abort policy, not an inherent native requirement. Clean baseline180 and
candidate185 checks pass in4 explicit suites. The sealed optional-image gate
passes build, strict, formatting and11504 selected native tests,0 failures and
the same2 exclusions,204 suites,203 strict roots,599 unchanged manifest entries.
All1928 compiled files match the prior float release byte-for-byte: production
is unchanged. Native image-session joins selected coverage with7 existing and5
new cases. Separate legacy grid failures and all live/provider/device/real
SafeJS/socket/TTY gates remain explicit. One bounded native Man7 policy follow-up
and one Debian docs probe run separately on the actual11492 release; do not
infer their results from this isolated gate. Continue varied site testing and
remaining CSS/overflow work; the overall browser goal stays open.

September12,2026,02:02 UTC: `FLOAT-DOCUMENT.md` records actual physical native
float document integration: source-ordered margin-box placement, text intervals,
ordinary/BFC height ownership, shrink-to-fit/replaced sizing, native paint/hits
and ordinary-flow static anchors. The corrected exact public-API baseline fails
the old width guard on clean d7dce49; the immutable fixture passes with the fix.
Six new suites add161 checks. Final focused validation passes888 checks in23
explicit suites. The sealed native-float-document-september12-round03 gate
passes build, strict checks, formatting and11492 selected native tests, with
zero failures and the same2 exclusions:203 suites,202 strict roots,599 manifest
entries,1069 unchanged tracked inputs,1091 source and1928 compiled files.
Twenty-one owned source/test files plus the clean manifest are release-verified;
pre-existing uncommitted work is excluded. Earlier strict-fixture and obsolete
blanket-float assertions, and the marker fixture correction, remain preserved
with their failed runs. General clearance, logical sides, atomic/modern-layout
interactions, positioned float reflow roots and overflow remain explicit gates.
Separate legacy grid failures remain outside this selected gate. No new live
website, credential/passkey-device, real SafeJS, socket/TTY or challenge success
is inferred. Continue captured-page and varied public-site testing, remaining
overflow/CSS work and optional-resource policy/failed-load cleanup;69 attempted
hosts still means attempts, not69 working websites. The overall goal remains open.

September12,2026,01:09 UTC: parent verifies `MAN7-MANUAL-FLOW.md` on the prior
11268 release. Three man7.org HTTP200 GETs return22573 encoded/37435 decoded
bytes. An original-loader c.statcounter.com image attempt is rejected before
transport; no wire call reaches that host. The harness aborts with zero commits,
discovery or clicks: a policy boundary, not a server/CAPTCHA/layout verdict.
Both exact hosts count under the existing pre-wire-attempt convention, taking
coverage67→69, not working-site passes. The new machine-readable daily expansion
records all three additions without rewriting historical inventory measurements.
All24 checks,54/56-entry ledgers, encoded/decoded/header/archive/report claims
verify. Document cleanup settles to zero; event/control/image-owner cleanup is
explicitly unproved. The offline timestamp precheck failure/draft remain preserved
with no native retry. NetBSD's sealed Markdown hard-break whitespace warning and
subsequent independent commit ownership/hash check are recorded in the private
NETBSD-COMMIT-CHECK-NOTE.md; no sealed report was reformatted. Continue full float
coordination, independent CSS/overflow/table work and varied public-site testing.
An optional-resource policy/failed-load cleanup follow-up needs its own bounded
task; neither widening origins nor bypassing access restrictions is authorized.

September12,2026,01:03 UTC: parent verifies the fresh NetBSD guide flow on prior
11268 release8daf14b. `NETBSD-GUIDE-FLOW.md` adds www.netbsd.org, coverage66→67
attempted hosts, not working-site passes. Two HTTP200 GETs return83873 bytes;
one genuine visible Introduction click fails the width-formatting guard with
unchanged history and zero mouse dispatch/destination request. Availability is
checked before URL deduplication. The separate census retains applicable CSS,
12 presentation hints and2 deferred table nodes; no sole cause is inferred.
All51 checks,43/54 ledger entries, body/header/archive metadata and actual owner
cleanup verify. The unsealed stale-path packaging failure and four exact failed
versions remain preserved; filesystem-only finalization performs no native retry.
Parent also preserves/corrects its initial old-schema byte-field assumption.
Man7 evidence audit and the broader float/overflow/website acceptance work remain
pending; full goal and isolated/live/provider/device/SafeJS gates stay open.

September12,2026,00:59 UTC: captured CSS2.2 float display adjustment now fixes
the genuine public-API regression where a floated inline span computed inline
instead of block. `FLOAT-DISPLAY.md` records the exact unchanged baseline fixture,
63 new passing checks,590 focused passes and the audited11331-check release gate
with2 unchanged exclusions,197 selected/196 strict/593 manifest,1084 source/1924
compiled and1080 unchanged tracked inputs. Build, strict and formatting pass;
the20-line owned styles delta excludes and preserves the pre-existing residual.
Specified CSS, inheritance, mutation and absolute/fixed float:none precedence
remain correct. Inline-table becomes table, not indiscriminately block. Modern
float display/applicability and boxless contents limitations remain explicit.
This is not full float DOM/text/height/paint integration; guards stay strict.
Fresh NetBSD/man7 probes use the prior11268 release and have separate pending
evidence audits, not live validation of this change. Keep the full browser goal,
independent overflow/CSS/table issues and live/provider/real SafeJS/device/TTY
acceptance gates open; no CAPTCHA or access-control bypass is implemented.

September 12,2026,00:37 UTC: parent verifies the captured curl replay's runtime,
original bodies, visibility-aware selection, cleanup and38/44-entry ledgers.
`CURL-LINK-SELECTION-REPLAY.md` uses11025 production,2 mocks/28849 decoded bytes
and zero wire. Actual native metadata excludes the first FAQ e82 below closed
details and selects visible e408; its one genuine click then fails the width-
formatting guard, not the original availability gate. No destination request or
mouse dispatch occurs, and attempted hosts stay66. Parent also finds an invalid
embedded packaging draft pin: it hashes the saved draft plus one final LF,
not the named saved file. `CURL-LINK-SELECTION-SEAL-NOTE.md` explains the trimming
defect additively; original bytes/receipts stay unchanged and the contemporaneous
untrimmed original is not independently archived. Its8/10/12-entry ledgers and46
source pins verify, with a separate verification-text quoting erratum preserved.
The native result is established within that scope, not blanket acceptance of
every packaging claim. Future archives must preserve raw bytes and verify
cross-file hash assertions after writing. `WEBSITE-TEST-EXPANSION-SEPTEMBER-12.md`
continues the inventory without relabeling replay as live success. Continue full
float/overflow coordination and varied-site testing; no access bypass is implied.

September 12,2026,00:35 UTC: parent independently verifies the new
`FLOAT-MARGINS-SOURCE.md`:9 checks/71 ledger entries,1 native HTTP200 GET and2
offline sections on11268 release8daf14b, with all prior seals unchanged. It
establishes adjoining-margin criteria, retained positive/negative extrema,
through-block positioning, computed-height dependencies, clearance exceptions
and noncollapsing float/BFC boundaries. It links the earlier anonymous-block
float anchor and preserves the source's conditional undefined negative-margin
case. Negative margins are not globally forbidden, and the current foundation's
nonnegative outer-extent restriction remains an explicit native subset. This
source read is not full float placement/text/height/paint integration or another
working-site pass. Continue coordinating those stages and independent overflow
behavior without suppressing unresolved formatting issues.

September 12,2026,00:21 UTC: native float foundations now provide bounded
same-BFC physical placement, source-order/clear constraints and line exclusion,
with sorted bottom events, immutable snapshots, aggregate work limits and clean
closure. Shared shrink-to-fit sizing is consumed by existing atomic inline
layout; its genuine native geometry/raster/hit fixture passes both clean old
production and the refactor. `FLOAT-FOUNDATION.md` distinguishes these foundations
from unfinished DOM/text/height/paint coordination: real float/overflow guards
remain strict, and OpenBSD actionability is not solved.128 new tests pass; the
sealed native-float-foundation-september12-round02 gate passes build, strict,
format and11268 checks with2 unchanged exclusions,195 selected/194 strict/591
manifest,1082 source/1924 compiled and1074 unchanged tracked inputs. The dirty
index residual is excluded and preserved. Two unrelated legacy grid assertions
also fail on unchanged clean HEAD and remain reported outside this selected
gate; no all-repository pass is claimed. Round01 preserves a pre-execution
configuration failure from selecting2 manifest-listed uncommitted tests absent
from the clean snapshot; those files were not bundled. `FLOAT-HEIGHT-SOURCE.md`
adds9 verified checks/56 ledger entries for fresh offline discovery+3 sections
on11080 production,4 owners closed and zero network. Native tests/source reads
do not establish live, provider/credential, real SafeJS/device/TTY or challenge
acceptance. Continue full float integration, overflow and varied-site testing.

September 12,2026,00:01 UTC: parent independently verifies the fresh curl
documentation attempt executed September 11 at23:56 UTC on11025 release4d11abd.
`CURL-DOCUMENTATION-FLOW.md` preserves2 actual HTTP200 GETs,6556 encoded/28849
decoded bytes,43 evidence checks and40/44-entry ledgers. New host curl.se raises
attempted-host coverage65→66, not66 working sites. The single FAQ click selects
the first occurrence of a duplicated URL and fails not-actionable before any
pointer action or destination request. The generic hidden/inert/disabled error
does not identify an ancestor or prove an engine bug. A separate bounded census
retains active CSS issues,9 deferred flex nodes,1 image and1 overflow; it is not
the established click cause. Native image policy denies the logo before wire
admission, not a server rejection. Actual owner cleanup and original bodies/pins
verify with no retry, resource rewrite, script, credential or bypass. Next
investigate visibility-aware native link selection using a separately authorized
offline replay, while retaining this first failure and the wider layout gates.

September 11,2026,23:57 UTC: parent independently verifies the new native
`FLOAT-SIZING-SOURCE.md` receipt:9 checks,76 ledger entries,1 native HTTP200 GET
and3 offline heading sections on the audited11025 release. It establishes float
shrink-to-fit's exact clamp formula, auto float margins, replaced-size distinctions,
ordered width constraints and same-BFC descendant-float auto-height inclusion.
It does not specify the exact intrinsic measurement algorithm or establish
general min/max-height, percentage heights, line-height or margin collapsing.
The preserved local final-audit quoting error required only a helper correction,
not a native rerun, extra request or additional extraction. Original bodies and
all earlier formatting/font/OpenBSD seals remain unchanged. Separate newly
authorized offline height/line-height source work will use11080 releasefb4ea24
and the accepted intact body, with zero network and its own limits/receipts.
No float layout or website actionability is claimed from source extraction;
keep actual placement, per-line exclusion, block/BFC height coordination,
paint/hit ownership and the independent overflow gates outstanding.

September 11,2026,23:52 UTC: generated absolute/fixed boxes now compute
float:none before native formatting and descendant inheritance, preserving the
authored inline value and priority. This fixes a false float blocker on genuinely
positioned boxes, not general float layout. `POSITIONED-FLOAT.md` and the audited
native primary source `FLOAT-FORMATTING-SOURCE.md` record the exact scope;
display:none and existing contents non-box behavior stay unchanged. A genuine
native checkbox click fails clean prior production and passes the fix;55 new
tests also verify cascade, frozen snapshots, containing blocks, stacking, raster,
hit ownership, fixed scrolling and restoration of real float/overflow guards.
The sealed native-positioned-float-september11-round01 gate passes build, strict,
format and11080 checks with2 unchanged exclusions,191 selected/190 strict/588
manifest entries,1077 source/1916 compiled and1073 unchanged tracked inputs.
The pre-existing dirty styles residual is excluded and verified unchanged.
The actual OpenBSD static float and3 overflow blockers remain unresolved; full
float placement/exclusion, shrink-to-fit sizing, auto heights, BFC ownership and
scroll-container integration still require substantive coordinated layout work.
Separate native float-sizing research and a fresh curl documentation flow use
their own authorizations and audited11025 runtime, not this in-progress release.
Keep the broad website/performance goal active; no live, credentials, real
SafeJS/device/TTY acceptance or challenge bypass follows from native checks.

September 11,2026,23:33 UTC: the new11025-pass font release4d11abd makes
two fresh HTTP200 GETs for the OpenBSD introduction and its intact stylesheet;
22855 bytes and both original hashes match the earlier successful destination
capture. Applicable CSS diagnostics now fall1→0, while raw3 property/1 value
diagnostics remain. Actual read-only font samples expose400/700 faces and
computed400 on the floated header; availability is not live rendering proof.
One genuine discovered Hardware Support fragment click still fails the native
width-formatting guard:1 float and3 overflow remain independent blockers.
`OPENBSD-FONT-WEIGHT-FLOW.md` seals44 evidence checks and44/48-entry ledgers;
parent independently verifies counters, original bodies, font/color observations,
census, actual1 event/1 image-owner cleanup and unchanged source/compiled pins.
`OPENBSD-INTRODUCTION-REPLAY.md` preserves the earlier offline header-prototype
harness failure (1 mock,0 wire); `OPENBSD-INTRODUCTION-REPLAY-FOLLOWUP.md`
preserves the separately authorized corrected replay (2 mocks,0 wire), whose
genuine click fails with1 applicable CSS property plus the same float/overflow
blockers on10715 production. No report is rewritten as successful. All request,
resource and authorization limits remain intact; attempted-host coverage stays65.
Continue real float layout and overflow/scroll-container work, varied-site testing
and the full performance goal; no bypass, credentials or additional gates inferred.

September 11,2026,23:25 UTC: authored CSS font-weight now computes numeric and
relative values separately from the native family's two actual400/700 bitmap
faces. Body text, native control captions and inside/outside numeric markers
paint the selected face; inline normal/bold keywords stay distinct from computed
400/700. Source requirements and bounded rendering limits are in
`FONT-WEIGHT.md` and `FONT-WEIGHT-SOURCE.md`. The sealed native-font-weight-
september11-round01 gate passes build/strict/format and11025 native checks with
2 unchanged exclusions,189 selected/188 strict/586 manifest,195 new tests,
1075 source/1916 compiled and1061 unchanged tracked inputs. Two dirty production
residuals are excluded and verified unchanged. A real checkbox regression fails
on clean old production and passes with normal-weight support; regular raster
behavior and resource bounds remain verified. This does not solve every layout
gate: the old10715 captured introduction replay proves1 float and3 overflow
blockers in addition to1 applicable CSS property. New-release live introduction
retesting remains separate and pending. Keep the full website/performance goal
active; no credentials, SafeJS/device/TTY acceptance or challenge bypass inferred.

September 11,2026,22:54 UTC: the fresh native OpenBSD FAQ-to-introduction flow
now succeeds on10715 release8936f29. One genuine discovered-anchor click commits
the HTTP200 destination;4 actual GETs transfer38561 bytes with no mock, retry,
fallback, identity override or cap change. Initial original HTML/CSS exactly
match both earlier failed fresh captures. Four read-only samples observe native
preference null/effective light; initial applicable CSS diagnostics are empty.
`OPENBSD-COLOR-SCHEME-FLOW.md` retains51/51 evidence checks,45/49-entry ledgers
and cleanup of2 actual event owners,2 image owners and both documents. Parent
independently verifies bodies, counters, preference samples and the genuine
click/history transition. Destination still has1 applicable CSS-property issue;
another destination interaction and whole-site compatibility remain unvalidated.
Attempted-host coverage stays65. Continue the broader website/performance goal
and investigate that residual without stripping CSS or bypassing access controls.

September 11,2026,22:50 UTC: explicit native UA color preference now supplies
light/dark/null state to CSS and native media-query observers, with null explicitly
meaning no active preference/effective light—not OS detection or a site override.
Per-tab host configuration survives navigation and initializes before loader
return; preference-only changes do not fabricate resize events. Bare queries and
three-valued unknown/negation behavior follow the bounded native source findings.
`COLOR-SCHEME.md`, `PREFERRED-COLOR-SCHEME-SOURCE.md` and `MEDIA-BOOLEAN-SOURCE.md`
record APIs, limits and the first source lane's preserved permissions exception.
One genuine checkbox click fails the clean old width guard and passes the new
default profile; active dark-only unsupported properties still fail closed.
The sealed native-color-scheme-september11-round01 gate passes build/strict/format
and10715 native checks with2 unchanged exclusions,182 selected suites/181 strict
roots/583 manifest entries,148 new tests,1071 source/1912 compiled files and1058
unchanged tracked inputs. Three pre-existing dirty source residuals are excluded
and verified intact. Live OpenBSD retesting on this release remains a separate
pending gate; prior failures and65 attempted-host inventory remain unchanged.
No CAPTCHA/access-control bypass, credential/provider, SafeJS, device or TTY
acceptance is inferred, and the broader website/performance goal remains active.

September 11,2026,22:12 UTC: fresh OpenBSD retesting on10390 retrieves the same
original HTML/CSS as the21:55 baseline, but its genuine Introduction link still
fails the width guard. Raw8 property/1 value diagnostics remain; only1 property
diagnostic is conservatively applicable. Raw media counts13 then15 and the1
table-shell census entry retain their actual scopes. `OPENBSD-NATIVE-FLOW.md`
and `OPENBSD-CSS-APPLICABILITY-FLOW.md` record two real HTTP200 GETs each, no
mock/retry/fallback,48/50 verified evidence checks, four ledgers and instrumented
owner cleanup. OpenBSD adds the65th attempted exact host, not a working-site
claim. The remaining unknown preferred-color-scheme condition requires correct
native preference semantics, not an invented false result or dropped CSS; primary
source investigation is underway. Keep genuine interaction, full CSS/table/CSP
compatibility, performance measurement and block-friction goals open.

September 11,2026,22:08 UTC: CSS diagnostic applicability now follows actual
selector matches and provable media inactivity while preserving raw diagnostics.
Unsupported-only matching rules, unknown selectors/media, loading/security errors
and ambiguous scanner recovery remain conservative blockers. Formatting consumes
the separate applicable map; original CSS/resources are not omitted. Media work
is bounded and cached per refresh. The genuine native checkbox click fails on
clean9b38bec at the old width guard and succeeds after this change; making its
unsupported rule match blocks the next click again. `CSS-DIAGNOSTIC-APPLICABILITY.md`
records10390 passing native tests,0 failures,2 existing exclusions,175 selected/
174 strict roots and579 manifest entries, including55 new cases. The audit checks
1066 source/1908 compiled inputs,5 owned files+manifest and2 preserved dirty
residuals. Original OpenBSD live baseline still fails its genuine link click;
new-release public-page retesting, full CSS/CSP/layout support, performance
measurements and the broader browser/block-friction goal remain outstanding.

September 11,2026,21:43 UTC: the first actual GNU software-page attempt returns
8 HTTP200 responses but aborts before page commit at the unchanged8-request
guard. `GNU-NATIVE-FLOW-FOLLOWUP.md` records8 admitted native/transport/wire
GETs,0 mocks,0 clicks and40 verified evidence checks with both receipt ledgers.
This is a harness-resource boundary, not a website denial or rendering pass;
full event/image-owner cleanup evidence is unavailable. The earlier preflight
path-comparison error remains in `GNU-NATIVE-FLOW.md` with0 network activity.
Original responses, caps and both historical lanes remain unchanged. GNU adds
the64th attempted exact hostname, not working-site coverage. This live attempt
uses the historical10123 release; new10335 import live acceptance remains open.
Continue with bounded lower-asset public documentation flows and original-page
CSS/CSP/layout recovery, without silently dropping resources or enlarging a
completed gate to claim success. The full browser goal remains active.

September 11,2026,21:48 UTC: parent verifies four native CSS primary-source
visits,4 actual GETs and8 offline native heading sections, with31 named checks
and all four evidence ledgers intact. `CSS-IMPORT-MODE-SOURCE.md` confirms the
Cascade4 import caller's style/no-cors arguments; credentials include is a
separate Values4 algorithm consequence, not inherited HTML crossorigin state.
Earlier Cascade5, Values and CSSOM reports retain their original unresolved
boundaries. These repeat already inventoried hosts and use the historical10123
release, not a live run of the new10335 import implementation. Referrer-policy,
final-response base assignment, cycle specification and full cross-edition
algorithm compatibility remain unverified; implementation acceptance gates and
the broader browser goal stay open. No credentials, scripts or alternate browser
were used for these bounded source visits.

September 11,2026,21:41 UTC: bounded native stylesheet imports now connect
original-source parsing, immutable occurrence graphs, document loading and the
actual cascade. Imports preserve source order, nested media and final-URL bases;
inline document URLs are not falsely treated as fetched CSS ancestors. Failed
children retain diagnostics; cycles, aborts, decoded URL controls and shared
resource budgets are covered. SRI precedes imports and new requests retain the
policy-aware transport/CSP guards. `CSS-IMPORTS.md` records10335 passing native
tests,0 failures,2 existing exclusions,173 selected/172 strict files and577 clean
manifest entries, including212 new cases. All8 owned sources/tests plus manifest,
1064 source/1908 compiled inputs and2 preserved dirty residuals are audited.
The first expanded run's5 cancellation/control regressions remain in evidence
and pass after fixes. These isolated results do not establish live imports or
original-page geometry/click acceptance. CSP enforcement, complete referrer and
Fetch/CSSOM behavior, layers/supports imports, background images, full CSS
compatibility and remaining website flows stay open. The broader browser goal
remains active; no credential/device/TTY/SafeJS or challenge-bypass gate is claimed.

September 11, 2026,21:07 UTC: the unchanged captured W3C table follow-up commits
via3 native mocks/0 wire requests. The released table coordinator retains5 roots,
40 rows and80 cells, but the genuine e96-to-e855 fragment click still fails the
width-profile guard. Retained non-advisory CSS diagnostics remain rejection
conditions even when the5 coordinated-shell counts match; no geometry refresh,
CSS omission or partial render is forced. `W3C-TABLE-DOCUMENT-REPLAY.md` records
49 verified evidence checks, both ledgers and unchanged original resource hashes.
The stalled worker was closed before execution; parent completed the single run.
This is not an authorization barrier or full-page pass. Next investigate the
remaining stylesheet/import acceptance prerequisites without suppressing evidence;
float/overflow, CSP/image/font and broader browser/research/credential gates stay
open. Attempted-host inventory remains63 and the overall goal remains active.

September 11, 2026,20:55 UTC: separate-border block-table document integration
passes the audited native gate:10123 passed,0 failed,2 unchanged exclusions;
170 selected files,169 strict roots,574 clean manifest entries. Real table cells,
rows/groups, anonymous repair, spanning, intrinsic widths, vertical alignment,
geometry, paint order and genuine pointer-click navigation are covered. All264
new table checks pass. Source1059/compiled1900 inventories and20 receipts verify;
24 owned source/test files exclude four independently preserved dirty residuals.
`TABLE-DOCUMENT-INTEGRATION.md` records the scope, earlier failed attempts and the
separately reproduced pre-existing intrinsic-suite failure. Captions, columns,
collapsed/fixed/inline tables, table items in Flex/Grid, unsupported percentage
cycles and positioning remain guarded; float/overflow and CSS/CSP/image/font
gates remain open. The prepared original-content W3C replay is not yet acceptance,
and no fresh website, credential/device/SafeJS, challenge bypass or complete
research outcome is inferred from the native gate. The broader browser goal stays
active.

September 11, 2026,20:31 UTC: fresh native SQLite documentation probe uses the
audited9859-pass table-foundation runtime. Three original-resource HTTP200 GETs
commit the page, but one genuine Getting Started click fails the formatting guard
(11 floats,3 presentation hints,1 overflow); destination is not requested. The SVG
banner resource is fetched but decoding remains unsupported. `SQLITE-NATIVE-FLOW.md`
retains raw evidence; parent verifies43 checks, both ledgers and3 body hashes.
Attempted-host inventory is63, not working-site coverage. No challenge bypass,
retry, script/credential/device probe or full-site acceptance is claimed. Table
document layout and the broader browser/research/credential gates remain open.

September 11, 2026 TESTPAGES-CLEAR-REPLAY.md verifies the committed9677 build
against two untouched captures:2 native/mock responses,0 wire and no new host.
Clear issues fall4 to0 with0 active floats; sampled e2606 still computes clear:both,
so the observed declaration was not erased. The512-ref bounded sample is not a
complete inventory of all4 earlier nodes. SVG e87/three shapes and numeric markers
remain intact; fill/select succeed, but the one genuine checkbox click still
fails the independent formatting guard. Table-row-group, overflow5, a presentation
hint, coordination and raw CSS/import diagnostics remain. All55 evidence checks,
both ledgers, capture hashes and zero cleanup verify. Continue actual table
document integration and resource-policy support; broader gates remain open.

September 11, 2026 TABLE-LAYOUT-FOUNDATION.md adds bounded cell-slot placement
and numerical auto-table column sizing for the observed W3C/Test Pages blockers.
Positive/zero rowspans, implied rows, group boundaries, overlap rejection,
colspans, intrinsic constraints and spacing have182 targeted passing cases.
The clean9859-case gate passes with2 existing exclusions,164 selected/163 strict
files and568 manifest entries; build/strict/format and source reviews pass.
The original fixture-default failure and type-narrowing compile failure remain
recorded. These helpers are not table rendering: next implement real CSS/HTML
table structures, cell measurement/reflow, row heights/alignment, paint and
geometry/hit ownership, then repeat genuine captured/fresh website actions.
Raw CSS/imports, native CSP image policy, research and broader gates remain open.

September 11, 2026 CLEAR-WITHOUT-FLOATS.md fixes real native clear behavior when
no float requires clearance. Computed declarations, geometry, pixels and hit
ownership remain intact; a genuine cleared-block checkbox fixture now clicks.
Active floats still retain float and clear guards, with unrelated CSS/layout
issues unchanged. The3pass/11fail baseline is retained;341 focused and9677 clean
native cases pass with2 existing exclusions,162 selected/161 strict files and566
manifest entries. Build/strict/format and independent source review pass. A copied
untracked legacy test was identified, its temporary edits reversed exactly, and
the final snapshot excludes it and all unrelated dirty work. Next replay unchanged
Test Pages content and integrate actual table placement/sizing/layout. Fresh W3C
tables, CSP image-policy handling, research and broader acceptance remain open.

September 11, 2026 W3C-TABLES-NATIVE-FLOW.md adds a fresh native-only visit to
the W3C CSS2.2 tables specification on the committed9614 build:3 wire HTTP200s,
0 mocks/redirects,251ms request spacing and no challenge or retry. The actual
table-layout anchor is discovered, but its one genuine click fails the formatting
guard without changing URL/history. Five deferred table elements are the sole
active formatting issue category; original CSS diagnostics and an unloaded import
remain separate. Nine image states reflect the native loader's conservative
CSP-presence denial, not server or harness access denial. All42 evidence checks,
both ledgers and body hashes verify; cleanup is zero. www.w3.org was already in
the attempted-host inventory, so it stays62, not62 working sites. Implement real
table placement/sizing/layout and proper resource-policy handling, then replay
unchanged captures; broader browser, research and credential gates remain open.

September 11, 2026 TESTPAGES-SVG-REPLAY-ROUND02.md tests the committed9614 build
against the same unchanged Test Pages HTML/CSS captures:2 native/mock responses,
0 wire and no new host coverage. Actual SVG e87 is now an admitted replaced node
with viewBox405x116 and3 original shapes; its former unsupported-element warning
disappears and deferred subtrees drop10 to9. Existing numeric markers remain.
Fill/select still succeed, but the genuine checkbox click still fails the
formatting-profile guard. Table-row-group, clear4, overflow5, a presentation hint
and original CSS diagnostics remain; scene admission is not whole-page rendering
or pointer acceptance. Census work rises12817 to189762 with SVG parsing under
unchanged budgets. Parent verifies51 checks, both ledgers, capture hashes and cleanup.
An initial replay-harness metadata-path failure launched no browser; its evidence
and lock remain intact, with the corrected run in a new lane. Continue native
table/layout/CSS work and fresh-site tests; research and broader gates stay open.

September 11, 2026 SVG-DOCUMENT-INTEGRATION.md connects bounded inline SVG scenes
to actual native replaced layout, viewBox sizing, filled-shape paint, analytic
descendant geometry and contour-aware hit testing. A real SVG-path fixture click
bubbles through an HTML anchor and navigates; no ancestor-click substitute is used.
Corrected baseline failures, the inline-fragment geometry failure and three review
findings are retained and fixed. The clean9614-case gate passes with2 unchanged
exclusions,160 selected/159 strict files and565 clean manifest entries; build,
strict and formatting pass. Unrelated dirty work remains excluded. SVG text,
strokes, markers, group effects and unsupported CSS remain explicit limitations.
Next replay unchanged Test Pages captures and test fresh native website actions;
table/float/clear/overflow, research, credentials/passkeys and broader gates remain
open. Native fixture success is not live-site, CAPTCHA or overall-goal completion.

September 11, 2026 SVG-FILL-FOUNDATION.md adds bounded native path parsing,
quadratic/cubic/elliptical-arc flattening and nonzero/evenodd RGBA fill primitives
for the observed Test Pages SVG blocker. Three independent review findings were
reproduced and fixed, with original failures retained;215 targeted cases and the
clean9356-case native gate pass, with2 unchanged exclusions. Build/strict/format
and source review pass;561 clean manifest entries exclude2 dirty additions.
This is not inline-SVG BrowserSession support: the SVG formatting guard remains.
Next integrate native scene construction, sizing/viewBox, paint inheritance,
transforms and correct descendant geometry/hit ownership, then replay unchanged
captures and fresh pages. Table/float/clear/overflow, research and broader gates
remain open; neither fixture pixels nor the62-host inventory proves completion.

September 11, 2026 RFC-EDITOR-NATIVE-FLOW.md adds a fresh native-only RFC9110
test on the9188 build: two HTTP200 wire GETs, no challenge, no retries and no
credential access. Native Introduction-anchor discovery succeeds, but its single
genuine click fails the formatting-profile guard without changing URL/history.
Float592, clear320, overflow162 and12 deferred tables are concrete remaining
layout gaps, alongside original CSS diagnostics and3 unloaded font imports.
All39 evidence checks and both ledgers verify; cleanup settles to zero. The
additive attempted-host inventory is now62, not62 working websites. Native SVG
foundation work remains separate and is not used by this frozen live build.

September 11, 2026 TESTPAGES-NUMERIC-MARKERS-REPLAY.md verifies the9188-build on
the same two unchanged captures:2 native/mock requests,0 wire and no new hostname.
All3 ordered-marker warnings disappear; native outside decimal metadata contains
ordinals1/2/3. Fill/select still succeed, but the one genuine checkbox click still
fails the unchanged formatting-profile guard, with no checkbox events. Remaining
deferred elements are concretely e87/svg and e2986/tbody, plus coordination
placeholders; clear4, overflow5, a presentation hint and raw CSS limitations remain.
The readonly census charges12817 work and3429 text units; it is not a geometry or
raster pass. All44 named checks and both ledgers verify, with zero cleanup state.
Next implement the remaining supported-profile gaps, not warning suppression;
fresh website interactions, research and broader acceptance gates remain open.

September 11, 2026 ORDERED-LIST-INTEGRATION.md adds actual decimal and
decimal-leading-zero glyphs, bounded HTML start/value/reversed numbering, rendered
owner grouping, correct marker extents and native link navigation beside ordinal10.
The original128pass/8fail baseline remains; targeted338 and clean9188-case native
gates pass, with2 unchanged exclusions. Build/strict/format and independent source
review pass; the558-entry candidate manifest excludes2 unrelated dirty entries.
No runtime dependency, global resource increase or actionability-guard bypass is
added. Alphabetic/Roman/custom counters remain unsupported, and the next unchanged
Test Pages capture replay must measure remaining table/clear/overflow/CSS blockers.
This is native fixture evidence, not new website coverage; broader gates remain.

September 11, 2026 TESTPAGES-CSS-CAPACITY-REPLAY.md verifies the9064-build against
the two unchanged live captures, with2 native/mocked requests and0 wire. The page
now commits with5929 rules,9701 declarations,367894 code units and1307941 work,
within unchanged declaration/source/work limits. Native textarea fill and a real
select-option change succeed; exactly one genuine checkbox click still fails the
issue-free formatting-profile guard, leaving the checkbox unchecked with0 events.
All41 named checks and both ledgers verify; cleanup is zero. A bounded census
separates copied CSS warnings from active limitations: deferred table-row-group,
one unsupported inline-block element, clear4, overflow5, ordered-list markers3
and a presentation hint, alongside coordination placeholders. These counts are not
a first-emitter trace or proof every flex placeholder is unsupported. Next resolve
the actual formatting limitations without weakening the actionability guard.
This is captured-site replay, not a new visit; attempted-host count remains61.

September 11, 2026 CSS-RULE-CAPACITY.md raises only the native default parsed-rule
ceiling from4096 to8192, based on5929 native-counted rules/9698 statements in the
unchanged captured Test Pages CSS. Source524288, declarations16384 and work5M
limits remain unchanged; no rule filtering or partial-style acceptance is added.
Original51pass/2fail regressions are retained; the155-case styles/session prototype
and audited9064-pass native gate succeed, with2 existing exclusions and unchanged
556-entry committed manifest. A synthetic5000-rule SRI stylesheet reaches a genuine
checkbox pointer gesture. Sidecar35 checks verify; analytical larger declaration
allowance is not the production default. Unrelated dirty styles/manifest work is
preserved and excluded. Captured-site replay is separately released to test the
whole document; aggregate cascade, real-site controls and full browser gates remain.

September 11, 2026 TESTPAGES-STYLESHEET-FLOW.md records a fresh9060-build live
follow-up at17:23 UTC: two actual native/wire GETs return200 for unchanged HTML
and original CSS. The same-origin policy is cors/same-origin, and the fresh CSS
digest matches archived native integrity metadata. The former guard is passed;
the next exact failure is initial-navigation:native-loader, CSS rule limit
exceeded with the existing4096-rule budget. There are zero document commits or
control/geometry actions; no full stylesheet or website acceptance is claimed.
All29 receipt checks plus12 additive provenance checks and both ledgers verify;
cleanup settles to zero. The61-host inventory is unchanged. Next investigate the
CSS budget failure without silently raising live caps or applying partial CSS.
Storage recovered after the earlier holds; parent released its unused reserve,
restored all four temporary snapshot copies to their original real directories,
and reverified source ledgers. Original failure evidence remains unchanged.

September 11, 2026 STYLESHEET-INTEGRATION.md adds explicit policy-aware stylesheet
fetching, bounded SHA256/384/512 integrity checks and per-hop CORS/redirect
credential handling without silently extending URL-only legacy callbacks. The
targeted loader/session check passes141 cases; source review and the audited
151-suite native gate pass9060 cases with the same2 explicit baseline exclusions.
Build/strict/format pass; header/meta CSP remains a fail-closed unsupported boundary
for this new path. Native SRI/HTML source evidence is retained, including failed
Fetch extraction at50001 nodes; this adds fetch.spec.whatwg.org for61 attempted
hosts, not61 working sites. Earlier native-gate ENOSPC and preparation failures
remain failures; no unowned data is deleted. Disk capacity remains tight. A fresh
Test Pages stylesheet/control run is separately released; website functionality,
full Fetch conformance and genuine pointer acceptance are not claimed by tests.

September 11, 2026 PYTHON-IMAGE-FALLBACK-REPLAY.md verifies real literal logo-alt
formatting children for both displayed broken images on the8831-pass build.
Their deferred placeholders disappear while images remain undecoded; the actual
Tutorial click still fails the formatting-profile guard. Original38/39 verifier
failure is preserved, with a separate48-check review confirming693 nodes plus70
markers equals763 budgeted boxes. TESTPAGES-SCOPED-CHECKBOX.md narrows225 global
checkboxes to3 actual form-owned candidates without raising the20 cap; one genuine
click then fails formatting. Native same-origin CSS metadata has both anonymous
crossorigin and SHA256 integrity, rejected before fetching. All39 scoped checks
and both lanes' receipt ledgers verify; zero wire and cleanup resources. Native
primary-source SRI/CORS research is underway; do not remove the guard without
correct request/redirect credential semantics. The attempted-host count remains60.

September 11, 2026 IMAGE-FALLBACK.md and IMAGE-FALLBACK-INTEGRATION.md implement
bounded native nonempty alternative text for eligible final-broken images, with
real glyphs, owner geometry/hits and fixture link navigation. Image decode/fetch
failure state remains visible; empty-alt/loading/quirks/responsive cases remain
explicit boundaries. Worker194-case validation and independent source review pass.
The expanded gate finds an unrelated stale Grid expectation; clean HEAD separately
reproduces29pass/1fail. The final gate passes8831 cases across149 native files with
TWO documented exclusions, not one; build/strict/format and source/snapshot checks
pass. No unrelated test is changed. A single unchanged-capture Python replay is
released on that immutable final build; full website/decoder acceptance remains open.

September 11, 2026 TESTPAGES-CONTROL-FLOW.md records a native301→200 form-page
navigation, real textarea fill and changed select choice ms4→ms1 with events.
Global checkbox discovery then exceeds the harness's20-candidate cap before any
click, so this is not browser pointer-failure evidence. Native stylesheet
integrity/CORS handling independently leaves the original CSS unloaded. All28
evidence/37 review checks and both receipt ledgers verify with zero cleanup.
The attempted-host total is now60, not60 passing websites. A narrower native
form-owner-scoped replay and exact stylesheet-attribute diagnosis are next;
no cap increase, password inspection, upload or form submission is authorized.

September 11, 2026 INTERNET-CHECKBOX-FLOW.md adds a fresh public native example:
four original same-origin GETs return200, the document commits, and two enabled
checkboxes are discovered. Native semantic inversion/restoration succeeds with
matching checked states and ordered click/input/change events; these are not
hit-tested pointer acceptance. One genuine pointer click then fails the formatting
profile guard without emitting a control event. All34 evidence checks and both
receipt ledgers verify; settled cleanup is zero. The additive attempted-host
inventory is now59, not59 passing sites. Test Pages control checks are separate
and in progress; original failures and pre-existing work remain preserved.

September 11, 2026 PYTHON-IMAGE-PREDICATES.md adds one unchanged-capture offline
native inspection: document mode is no-quirks, all three broken images have present
nonempty Python-logo alt text, no dimension attributes and computed auto sizes.
Two are displayed/deferred; the third is natively not displayed. All35 evidence
checks pass with zero wire/resource cleanup. These measured predicates match the
bounded text-fallback implementation scope, but no fix, decoding or click acceptance
is claimed by this run. The earlier image/formatting reports remain unchanged.

September 11, 2026 MDN-OUTSIDE-MARKERS-REPLAY.md records the unchanged nineteen
captures on the8529-pass build: one genuine click now completes formatting and
reaches positioned coordination beyond the earlier eligibility guard. It still
fails the formatting-profile gate;14 non-coordinated deferred nodes remain and
no used geometry or destination completes. Parent verifies all28 new receipts;
historical measurements and build identity remain unchanged. BROKEN-IMAGE-SOURCE.md
records one native WHATWG rendering GET and two extracted sections, with49 verified
receipts: stable represented text is non-replaced phrasing content, while stable
represented nothing retains a zero-natural-size replaced box. Missing/loading/
quirks branches take precedence and full image-state semantics remain a source
gap. Bounded fallback implementation proceeds without claiming SVG decoding.

September 11, 2026 OUTSIDE-BLOCK-MARKERS.md implements genuine owner-attached
outside markers for supported list items and summaries, including block content,
bounded layout/paint/hit/scroll coordination and unchanged principal DOM geometry.
Review exposes reference-action regressions on empty summaries, large leading and
double-click scrolling; baseline reproductions fail before correction, then all57
focused action cases pass. The final clean combined gate passes8643 native cases
across144 manifest-selected files, with the unchanged single exclusion; build,
strict and format pass under the explicit native guards. Source hashes and all16
owned files match the tested snapshot; closure review resolves all concrete findings.
The earlier8529 build's unchanged MDN replay now reaches positioned coordination
but fails the formatting-profile gate, with no completed geometry or destination.
That offline result is not live acceptance or validation of the later action fixes.

September 11, 2026 PYTHON-DOCS-FORMATTING.md verifies one offline navigation and
formatting build from seven unchanged captures, zero wire requests. The native
result has two broken-image element gaps, nine potentially coordinatable Flex/Grid
placeholders, two floats, one sticky-position and one overflow issue. All three
images share a fetched SVG but none decodes; fallback support is independent of
SVG decoding. Aggregate CSS warnings and an unloaded import remain separate from
active-node counts. All34 evidence/40 review checks and both receipt ledgers verify;
cleanup is zero. Native primary-source research for bounded broken-image fallback
is underway, not a claim that Python interaction or full styling now passes.

September 11, 2026 PYTHON-DOCS-QUEUED-FLOW.md verifies seven fresh native/wire
HTTP200 requests at unchanged underlying/advertised concurrency1. The index
commits and native Tutorial discovery succeeds; its genuine click fails at the
formatting-profile boundary, with no destination request. All39 original and82
additive checks pass and queue/session cleanup is zero. Parent verifies both
receipt ledgers. SELENIUM-FORMATTING-DIAGNOSTIC.md replays three unchanged
captures with zero wire requests: three coordinated Flex placeholders, hidden
overflow on the file input, four floated checkbox/radio controls and unsupported
color/range inputs are distinct from aggregate CSS parser diagnostics. All29
evidence checks and both ledgers verify. Neither is full-flow acceptance; the
attempted-host count remains58. Python formatting diagnosis is next, while old
admission and submit-click failures retain their original reports and measurements.

September 11, 2026 SELENIUM-PUBLIC-CSS-FLOW.md completes normal bounded admission
for original native-loader public HTTPS stylesheets. Three GETs return200; the
native document commits, text fill succeeds, and genuine submit click fails at
the issue-free formatting-profile boundary. Selecting the current placeholder
does not prove changed-choice behavior; no checkbox/submission/destination or
full styling acceptance is claimed. Parent verifies all receipts and37 evidence
checks, including zero-resource cleanup. The attempted-host total remains58.
An unchanged-capture formatting diagnostic will identify active missing features
without confusing stylesheet parser totals with actual layout blockers.

September 11, 2026 SESSION-REQUEST-SCHEDULING.md adds bounded shared native session
request admission at the transport's advertised capacity, with128 pending maximum,
FIFO fairness, cancellation and actual-settlement permit release. Legacy adapters
without advertised limits retain direct behavior; capture wrappers must forward
their unchanged underlying limit. Nine baseline failures become90 focused passes;
review then identifies stale queued bootstrap resources. Four reproductions fail,
and explicit bootstrap lifetime cancellation yields94 focused passes. The clean
final gate passes8339 native cases across137 files with unchanged historical
exceptions; build/strict/format also pass. The8335 gate remains historical and no
live follow-up used it. Fresh Python-documentation validation at the original
cap1 remains separate; pending outside-marker work is excluded from this gate.

September 11, 2026 SELENIUM-STYLESHEET-FLOW.md verifies the observed Bootstrap CSS
returns200, then records another harness-only admission boundary for original
datepicker CSS on unpkg.com. The additive attempted-host count is now58, not58
working sites; no native form action was reached. Old failed runs remain intact.
A separate original-loader public-HTTPS-CSS resource policy test is running.
LIST-MARKER-SOURCE.md records one native CSSLists GET and two bounded sections:
outside marker ownership/side/attachment are defined, but exact placement and
baseline/height effects are explicitly underdefined. Genuine native outside-block
marker implementation must document its policy rather than claiming conformance.

September 11, 2026 WEBSITE-TEST-EXPANSION-SEPTEMBER-11.md adds three exact attempted
hostnames after the54-host inventory: Selenium, its pre-wire-denied jsDelivr CSS,
and Python documentation, for57 combined attempted hosts, not passing sites.
PYTHON-DOCS-NATIVE-FLOW.md records HTTP200 then concurrent stylesheet/image
admission failure under maxConcurrent1; original caps and failed flow stay intact.
MDN-POSITIONING-REPLAY.md records one unchanged nineteen-response offline click
with the8321-pass build. Formatting fails on outside list-item markers with block
content before positioning, so it masks validation of the earlier e74 fix; no
geometry or destination is reached. Parent verifies both receipt ledgers. Genuine
outside-marker coordination, resource scheduling and the separately scoped
Selenium stylesheet/form follow-up remain next acceptance work.

September 11, 2026 SELENIUM-NATIVE-FORM.md adds a real Selenium form-page GET,
but initial navigation stops when the same-origin-only harness denies its
observed jsDelivr Bootstrap stylesheet before transport. This is harness admission,
not browser failure or form acceptance: two native request attempts, one wire
request, no form actions. Both original and additive receipt ledgers verify;
the additive review distinguishes immediate pending document cleanup from its
settled zero-resource state without rewriting the original verifier failure.
A separate test admitting that exact public stylesheet is the next step.

September 11, 2026 GRID-CHILD-POSITIONING.md resolves the overbroad direct-Grid
parent guard for explicit physical anchors against a non-Grid containing block
or viewport. It retains actual Grid-containing-block, static-Grid-anchor and
out-of-flow Grid-container boundaries in the lower-level coordinator as well.
The measured-menu and genuine fixture-click regressions reproduce fifteen
baseline failures, then pass all85 focused cases. The clean combined gate passes
8321 native cases across137 tracked files with the unchanged historical exception;
build, strict and format also pass. It includes the earlier percentage-row and
list-item fixes, whose prior combined gate independently passed8183. Native W3C
section evidence is in GRID-POSITIONING-SOURCE.md. Unchanged MDN replay, additional
public-site flows and broader research/auth/challenge acceptance remain separate.

September 11, 2026 WEBSITE-TEST-INVENTORY.md and the compact JSON inventory record
54 substantiated native-request hostnames, not 54 passing websites: twelve in the
browser/interaction corpus and 42 additional research/source/failed-attempt hosts.
The audit retains nineteen unattributed historical reports rather than guessing
their hosts. Seventeen proposed new targets plus an owned challenge fixture form
the next coverage queue. Record fetch, parse, runtime, layout, genuine actions
and cleanup separately; current MDN and broader acceptance gaps remain open.

September 11, 2026 LIST-ITEM-LAYOUT.md adds genuine marker-free and supported
symbolic list-item formatting, geometry, painting and hits without summary
activation or discarded markers. Counters, ambiguous ordered-list defaults and
outside markers with block content remain explicit limitations. The independent
clean gate passes 8175 selected native cases across 132 files; combined testing
with the percentage-row fix is next. MDN's absolute accessibility-menu boundary,
remaining CSS/foreign elements and broader website/research/auth gates stay open.

September 11, 2026 GRID-PERCENTAGE-ROWS.md resolves the nested percentage-row
finding with intrinsic-then-final track sizing, percentage gaps and preserved
container height. Eight baseline failures and the intermediate coordinator
height mismatch remain recorded. The clean Grid-only gate passes 8115 selected
native cases across 131 files with unchanged historical exceptions. The separate
list-item change still needs combined-source validation; neither MDN replay
includes these later fixes, and its absolute-child coordination remains open.

September 11, 2026 MDN-POSITIONED-GRID.md identifies the sole first-boundary match:
absolute ul.a11y-menu e74 under static Grid body e72, with top -320px, left/right
2px and all-auto Grid placement. It is not an in-flow Grid item, fixed element or
Grid container. A separate unchanged nineteen-response offline metadata pass
verifies this without click/geometry calls or wire traffic. Implement and test
its correct absolute containing-block/inset coordination rather than a generic
guard bypass; actual containing-block geometry and MDN rendering remain unproved.

September 11, 2026 GRID-ALIGNMENT-NATIVE.md closes the specific track-distribution
source gap with one native public W3C GET (HTTP200), 76 observed headings and two
successful bounded offline section extractions. Safe distributed fallbacks and
their overflow behavior now have primary source evidence; all49 receipts verify.
This is partial reader/source coverage, not rendered-page or general alignment
conformance, and does not complete the original four research topics.

September 11, 2026 MDN-GRID-LAYOUT.md records one unchanged offline native click
against all nineteen captured MDN responses using the frozen 8095-pass build.
Formatting now retains 1753 boxes, ten Grid shells and 47 Grid-item-marked nodes,
but these are not used geometry. The click first fails at positioned Grid
coordination; no rectangle or destination request completes. Fifty-four other
noncoordinated deferred nodes and the original CSS issues remain. Diagnose the
exact positioned nodes before implementing their containing-block/static-position
rules; no skipped guard, synthetic click or live-site success is claimed.

September 11, 2026 GRID-OVERFLOW.md records two corrected Grid overflow alignment
bugs, preserving five failing baseline cases and a subsequent clean8107-pass
native gate across131 files with unchanged historical exceptions. Auto margins
no longer suppress overflowing self-alignment, and distributed track fallbacks
stay at the safe start edge. The nested percentage-row finding remains open.
MDN's positioned Grid click boundary and other real-site/research/credential/
passkey/fingerprint/challenge requirements are not completed by these tests.

September 11, 2026 GRID-LAYOUT.md records real block Grid placement, track sizing,
native item reflow and shared geometry/paint/hit testing, including nested Grid
and Flex interoperation. The corrected clean gate passes 8095 selected native
cases across 131 files with unchanged historical exceptions; prior failed runs
remain preserved. The genuine fixture click is not live-site evidence. Replay
the unchanged captured MDN page, reproduce reviewed percentage/overflow edge
cases, and continue CSS/foreign-element compatibility, public-site testing and
the original research/credential/passkey/fingerprint/challenge acceptance work.

September 11, 2026 MDN-GRID-CSS-REPLAY.md verifies the frozen Grid foundation
build against all nineteen original MDN responses with zero wire traffic. Native
computed styles now retain body tracks, nested named tracks/areas and header/body
placement. Cascade work is 2894159 of the unchanged 5000000 limit; CSS remains
partial. Formatting still defers body grid and gives no descendant boxes. This
round01 replay does not validate the subsequent font fix, rendering or clicks.
The next production step is actual Grid placement, sizing and item reflow.

September 11, 2026 a Grid font-dependency regression is fixed at the tokenizer
boundary: line/area names resembling em/rem dimensions no longer cause font
resolution. GRID-CSS.md preserves four failing baseline cases and the subsequent
clean gate: 7208 passes across 117 selected native files, with the same existing
exceptions. True font-relative dimensions still require metrics. This is a
follow-up to the Grid CSS foundation, not Grid geometry or live-site acceptance.

September 11, 2026 GRID-CSS.md records production Grid grammar integration:
ten longhands and placement shorthands reach stylesheet/inline parsing, variables,
cascade, computed values, CSSOM and item blockification through display:contents.
Named lines/areas retain case and unsupported grammar remains explicit. Clean
validation passes 7203 selected native cases across 117 files, with the existing
exceptions; 239 cases are new Grid grammar/integration tests. Grid containers
still defer real geometry. Implement two-dimensional placement, track sizing and
item reflow, then verify actual MDN rendering/clicks and remaining CSS blockers.

September 11, 2026 GRID-SPEC-SECTIONS.md records twelve successful exact-title
section extractions through the native browser's captured-source replay, covering
Grid grammar, computation, placement and selected sizing stages. No navigation
or wire requests occurred; the existing reader/compiled evidence remains stable.
This resolves the earlier ambiguous heading selections, not full specification
coverage, implementation, rendering or completion of the four research topics.

September 11, 2026 GRID-READER-CANDIDATE-REPLAY.md verifies the fixed reader
against the captured W3C research workflow: one offline navigation discovers 114
headings and two observed-heading sections extract with zero wire traffic.
GRID-READER-OMITTED-LIST-REPLAY.md preserves the earlier harness accounting
failure before candidate execution; it is not a production-reader regression.
Existing isolated-check authorization covers this follow-up. Partial reader
semantics, two ambiguous research topics, actual Grid layout/native clicks and
the four original research topics remain open; no new full-suite run is claimed.

September 11, 2026 the semantic reader handles direct optional li endings in
omitted HTML lists while retaining their omitted root and foreign/malformed-input
guards. READER-OMITTED-LISTS.md records 128 focused passes, 11 preserved failing
baseline cases and 6805 selected native passes across 112 files with the documented
exceptions. Revalidate the exact W3C captured research flow and use only actually
discovered headings for bounded section extraction; no Grid or research completion
is inferred from native unit tests.

September 11, 2026 GRID-READER-DIAGNOSIS.md reproduces the W3C loader failure
without networking: the omitted-subtree stack rejects a list end after implicit
li endings in an object's HTML fallback. Bounded native token positions and an
independent file-only source correlation identify the exact construct. Original
child/evidence and a corrected postflight cleanup defect remain preserved.
Fix that scoped reader behavior without weakening foreign/omission boundaries,
then revalidate the captured research flow; Grid implementation stays open.

September 11, 2026 this browser fetches the W3C Grid specification with one
HTTP200 request, then the native semantic reader fails unsupported at loader.
GRID-SPEC-NATIVE-RESEARCH.md preserves the 957488-byte capture, failed research
result, zero extracted sections and verified cleanup. There is no general
authorization barrier or demonstrated challenge; inspect the exact reader error
offline before implementing a fix or claiming normative Grid findings.

September 11, 2026 exact paired replays verify the compound availability change
across all 323 MDN and 755 Wikipedia selector calls. MDN-COMPOUND-AVAILABILITY.md
records cascade work 3991128 -> 2891552 and the former hotspot 958911 -> 217.
WIKIPEDIA-COMPOUND-AVAILABILITY.md records only 2167 net units saved, with 55
calls costing more; no broad speedup is claimed. Results, specificity, CSS issues
and cleanup agree; public DOM query work and live grid/click gates are unchanged.
Wikipedia's historical stylesheet-query redaction remains an explicit limitation.

September 11, 2026 MDN-GRID-INTEGRATION.md maps the captured named tracks/areas,
minmax/fr syntax and display:contents ancestry into the real parser/cascade,
formatting, sizing/reflow and geometry paths. It identifies shared alignment,
height-definiteness, paint-order and non-grid CSS dependencies; it is source-only
architecture evidence, not implemented grid support. Primary-spec research through
this browser is separately scoped under existing public browsing authorization.
Implement the production path and preserve the original native-click acceptance.

September 11, 2026 stylesheet availability now checks same-element positive
ID/class/type intersections using the smallest complete index, with conservative
capped-index fallback and unchanged specificity/limits. COMPOUND-AVAILABILITY.md
records two failing unchanged-code work regressions, 172 focused passes and
6786 selected native passes across 112 files with the documented exceptions.
Independently compare complete MDN and Wikipedia captures for correctness and
work regressions; real grid layout, native clicks and broader goals remain open.

September 11, 2026 paired native MDN replays verify identical ordered node IDs,
specificities and errors across all 323 stylesheet selector calls. The predicate
ordering change reduces cascade work from 4790072 to 3991128 (16.68%), not a
measured wall-clock speedup. MDN-SELECTOR-TEST-ORDER.md preserves both runs,
unchanged CSS issues and complete cleanup. Separate native queries confirm the
958911-work baseline-indicator hotspot has empty same-element class intersections
despite individually present keys; investigate sound compound availability next.
Actual grid/CSS rendering, native clicks and broader original goals stay open.

September 11, 2026 exact MDN replay identifies the click's structural blocker:
body.page-layout computes to display:grid and is deferred before its link subtree
is formatted. MDN-NATIVE-FORMATTING.md records the absent e1673 box, five visited
nodes, unchanged width rejection, four rejecting CSS diagnostic categories and
72 independent verification checks. Implement actual grid/CSS coverage rather
than suppressing diagnostics or substituting block layout; nested grid and
display:contents, full native activation and broader acceptance remain unverified.

September 11, 2026 direct compound predicates now precede nested selector tests,
avoiding ancestor walks for locally false hover/visited/class/attribute checks.
COMPOUND-PREDICATE-ORDER.md records four preserved work-bound baseline failures,
151 focused passes and 6765 selected native passes across 112 files with the
documented exceptions. All operands, specificity and dependency admission remain
intact. Compare exact MDN results/work offline separately; the native click's
unsupported-formatting failure and the broader website/research gates remain open.

September 11, 2026 a fresh native MDN flow commits the full 19-response page,
discovers querySelectorAll in main content and attempts one genuine native click.
MDN-LOGICAL-AVAILABILITY-LIVE.md preserves the new failure: width resolution
rejects the unsupported formatting profile, not a work/resource limit. All
18 stylesheets load, no challenge is classified, and cleanup reaches zero pending
loads. Diagnose the exact formatting issues offline without bypassing geometry;
destination navigation, rendering, research and challenge effectiveness remain open.

September 11, 2026 the complete 19-response MDN offline replay now commits a
native document with all 18 stylesheets and bounded title/main-content evidence.
MDN-LOGICAL-AVAILABILITY-REPLAY.md records 4790072 cascade-work units under the
unchanged 5000000 cap, verified receipts and zero pending loads. The previously
largest selector did not improve: other impossible logical branches account for
the aligned 366946-unit selector-work reduction. CSS remains partial, and no
rendering/link activation/live acceptance or broader research completion follows
from replay. A fresh native link flow is the next separate acceptance check.

September 11, 2026 positive-logical stylesheet availability pruning passes 6737
selected native cases across 112 files with the documented exceptions.
LOGICAL-SELECTOR-AVAILABILITY.md records conservative OR/negation handling,
unchanged nested specificity and limits, plus the preserved failing work-bound
baseline. Replay the complete captured MDN bundle independently; no fresh live,
rendering, research or challenge-effectiveness completion is implied.

September 11, 2026 explicit stylesheet admission retrieves MDN's HTML and all
18 linked stylesheets, but native cascade work still exceeds its unchanged cap.
MDN-STYLESHEET-BUDGET-LIVE.md preserves that fresh failed flow; the independent
MDN-FULL-CSS-PROFILE.md attributes 4059662 completed selector-work units and a
958878-unit zero-match positive-logical ancestor hotspot before later winner-scan
exhaustion. Prune provably impossible logical alternatives without dropping
specificity or guards, then replay the complete bundle. Broader gates stay open.

September 11, 2026 the SDK exposes maxStylesheetRequests as a frozen session
limit, retaining default eight and accepting explicit bounded 1..128 allowances.
STYLESHEET-REQUEST-BUDGET.md records 6717 selected native passes across 112 files
with the documented exceptions, and a preserved unchanged-code baseline. No
network/CSS/work limits or completeness checks are bypassed. A separately scoped
MDN flow requests a 24-sheet allowance; live and broader gates remain unproven.

September 11, 2026 the fresh MDN run completes native loading/style computation
after nine HTTP200 responses, then the retained probe assertion rejects its
stylesheet-resource-limit issue before commit or click. MDN-CUSTOM-NOOP-LIVE.md
preserves the failed flow and pendingLoads settling from one to zero. Source
inspection confirms the session's separate eight-stylesheet request allowance;
review bounded resource admission for this multi-sheet page rather than dropping
the acceptance check. This is a resource/coverage gate, not an authorization or
proven CAPTCHA barrier. Research, rendering and broader goals remain unfinished.

September 11, 2026 the original nine-response MDN capture now commits natively
at 3728759 cascade-work units under the unchanged 5000000 limit, with expected
title/main heading and bounded DOM text. MDN-CUSTOM-NOOP-REPLAY.md records the
separate offline proof and clean settlement. Styling/resource coverage remains
partial; full rendering, click and live acceptance are not implied. A fresh
MDN native flow is separately scoped, while the original broader gates stay open.

September 11, 2026 a fresh CERN early-web native link flow passes: the observed
What's out there? anchor is clicked, its destination commits, and the replaced
document closes. CERN-NATIVE-FLOW.md records two real requests, two commits,
clean final cleanup, and the exact relative-has build used. This is navigation
evidence, not complete rendering, challenge avoidance or research completion.
MDN's separately improved capture and fresh live flow remain separate gates.

September 11, 2026 one-entry unchanged custom-declaration reuse passes 6689
selected native tests across 112 explicit files with the documented exceptions.
CUSTOM-NOOP-REUSE.md records the failing work-cap baseline and exact parent plus
declaration identity matching, without new retained result maps or higher limits.
The repeated MDN capture and independent CERN live click flow have separate
evidence; complete those reviews and continue the outstanding broader goals.

September 11, 2026 MDN replay after custom-map sharing reaches a later cascade
work failure in repeated charged value comparison, with no committed document.
MDN-CUSTOM-MAP-SHARING-REPLAY.md records the separate failed navigation and clean
offline cleanup. A single refresh-local no-op declaration recipe is now under
isolated validation; do not lower work accounting or infer live acceptance.
Continue varied-site native clicks and the original research/runtime goals.

September 11, 2026 unchanged inherited custom-property map reuse passes 6687
selected native tests across 112 explicit files with the documented exceptions.
CUSTOM-MAP-SHARING.md records the failing wildcard-theme retention baseline and
resolved-value/key-set identity reuse without increasing limits. Captured MDN
replay is separate and pending. Continue actual website flow verification and
Hacker News layout work; research and broader runtime/device gates remain open.

September 11, 2026 captured MDN replay completes the former fatal selector in
8390 work units but navigation now fails CSS variable retention; no document is
committed. MDN-RELATIVE-HAS-REPLAY.md preserves this separate outcome. The exact
Hacker News click blockers are a deferred center ancestor plus unsupported CSS
values/properties, documented in HN-NATIVE-FORMATTING.md. Reuse unchanged inherited
custom maps, retain genuine limits, and implement real layout support rather
than disabling click geometry checks. Full website flows and broader gates stay open.

September 11, 2026 relative :has candidate planning passes 6614 selected native
tests across 111 explicit files with the existing documented exceptions.
RELATIVE-SELECTOR-CANDIDATES.md records the failing unchanged-code MDN-pattern
regression, bounded descendant/child ranges, sibling fallback, and unchanged
limits. Captured MDN replay is separate and pending; continue live-flow checks,
Hacker News formatting diagnosis, research, and the outstanding broader gates.

September 11, 2026 an offline MDN CSS profile reproduces full-index :has scanning
at fatal selector call 146; MDN-NATIVE-PROFILE.md records the exact selector and
unchanged-budget costs. A separate live Hacker News homepage loads but native
link click fails its formatting profile, as preserved in HN-NATIVE-FLOW.md.
Repair relative-selector candidate work and diagnose the exact click formatting
issues; neither failed flow is a completed website or research acceptance gate.

September 11, 2026 native navigation failure-settlement regressions pass with
6591 selected native cases across 111 explicit files and the existing documented
exceptions. NAVIGATION-FAILURE-SETTLEMENT.md distinguishes eventual task cleanup
from immediate outer rejection; no counters or production semantics changed.
The MDN live cleanup observation remains historical and inconclusive. Continue
MDN selector-cost repair, varied-site flows, and the outstanding broader gates.

September 11, 2026 the separate MDN native link-activation attempt fails during
initial CSS/query loading after nine HTTP200 responses; no link is selected or
clicked. MDN-NATIVE-FLOW.md preserves the failed run and an immediate pendingLoads
count of one. Session jobs intentionally remain counted until underlying task
settlement, so this is not yet a proven leak. A separate captured-body CSS profile
is in progress; do not clear counters, raise budgets or infer rendering success.

September 11, 2026 format-independent research handoff passes 6543 selected native
tests across 110 explicit files with the documented baseline/strict exceptions.
RESEARCH-FORMAT-HANDOFF.md records pre-extraction native diagnostics, bounded word
lookahead, and six captured PyPI caller cases returning handoff without extraction.
The reader's absent hidden-content semantics remain explicit, not falsely fixed.
No live PyPI retry or challenge bypass occurs. Continue varied-site testing and
MDN's newly observed CSS/resource-cleanup diagnostics; broader gates remain open.

September 11, 2026 a separate native PyPI search reaches an HTTP200 Client Challenge
that the old classifier misses; PYPI-NATIVE-FLOW.md preserves the failed live run.
CLIENT-CHALLENGE.md records a paired-title/text recognition fix, 6431 selected
native passes with the documented exceptions, and same-body native replay now
returning a possible unspecified-provider challenge/handoff diagnostic. No live
retry, solver or bypass is attempted; PyPI search is still blocked. Verify caller
handoff and broader site coverage without treating detection as challenge evasion.

September 11, 2026 leading stylesheet trivia handling passes 6415 selected native
tests with the documented baseline/strict exceptions. CSS-LEADING-TRIVIA.md records
Python.org's captured homepage loading at 441906 work units and a separate fresh
structural search flow with preserved query state and 20 native result links.
The earlier literal-query check stays failed; relevance remains unverified. No
query/source limits are raised. Continue varied-site and challenge diagnostics;
rendering, scripts, research and credential/passkey acceptance remain open.

September 11, 2026 stylesheet selector-list admission passes 6406 selected native
tests with the documented baseline/strict exceptions. STYLESHEET-SELECTOR-LISTS.md
records per-top-level-branch component bounds, unchanged aggregate ordinary-query
limits and isolated cache modes. Python.org passes its former 120-branch failure
but now fails a selector text cap inflated by leading CSS comments. Next separate
stylesheet trivia, replay the unchanged captures, then run the fresh Python.org
search flow. Rendering, research and challenge-effectiveness gates remain open.

September 11, 2026 branch-local stylesheet matching and ancestor subtree bounds
pass 6377 selected native tests with the documented baseline/strict exceptions.
SELECTOR-ANCESTOR-RANGES.md records the repeated-key regression and fix, a captured
Wikipedia article loading at 4246822 unchanged-budget work units, and a separate
passing live portal/search/article flow. Python.org advances past query-work
exhaustion but still fails a 120-branch selector's component limit. Next investigate
bounded stylesheet-list handling, replay that capture, then run its fresh search
flow. Rendering, research, varied-site and challenge-effectiveness gates stay open.

September 11, 2026 required-positive-key pruning passes 6363 selected native tests
with the documented baseline/strict exceptions. SELECTOR-REQUIRED-KEYS.md records
a captured Wikipedia zero-match hotspot reduced from 2708379 to 11 work units,
but the article still fails later on broad edit-section ancestor matching.
Verified Python.org profiling independently exposes branch-by-candidate work and
repeated ancestor scans, not cache exhaustion. Next retain branch-local candidates
and safe ancestor subtree bounds, then validate and replay both sites without
raising limits. Full flows, rendering, research and challenge goals remain open.

September 11, 2026 at 08:21 UTC, a separate native Python.org search-flow attempt
receives HTTP200 for the homepage and three stylesheets but fails query work
before form discovery or submission. CSS-WORK-SITE-COVERAGE.md preserves the
four-response evidence, hashes, unchanged budgets and cleanup. Profile its
captured stylesheets alongside the Wikipedia article to avoid a portal-only
optimization; the remaining blocker is technical, not missing blanket permission.

September 11, 2026 bounded stylesheet candidate indexing passes 6354 native tests
across 109 selected files, with one reproduced baseline assertion excluded and
one unchanged test typing error outside the 108 strict roots. Same-body Wikipedia
loading now completes at 630524 style work units without raising the 5000000
budget. STYLESHEET-CANDIDATES.md records a fresh portal load, actual search-field
fill and native GET submission reaching an HTTP200 article via two redirects.
That article and its captured stylesheets expose another query-work failure;
the full form flow remains failed. Diagnose those captures next, without raising
limits. Full rendering, varied-site coverage, research, fingerprint/challenge
effectiveness and real credential/passkey-device acceptance remain outstanding.

September 11, 2026 native SVG/MathML namespace integration passes 6201 selected
native tests across 105 files, with one reproduced pre-existing test excluded
and one unchanged test typing error outside the 104 strict roots. Build and
feature formatting pass. NATIVE-FOREIGN-CONTENT.md preserves every failed attempt
and records a fresh Wikipedia HTTP200 response that gets past SVG rejection but
fails the CSS query-work budget. A zero-network parser-only replay confirms 21
SVG nodes, one HTML form and 13 inputs; no form interaction or painting passes.
Next optimize repeated stylesheet selector matching without raising budgets,
then rerun isolated checks and a separate fresh website flow. SVG/MathML painting,
broader namespace APIs, full research, performance, fingerprint/challenge and
real credential/passkey-device acceptance remain outstanding.

September 11, 2026 at 07:13 UTC, two zero-network follow-ups strengthen Bing
recovery evidence: the original failed body now loads under unchanged limits,
without changing its failed receipt, and the fresh body replays successfully.
Returned title/query links preserve the submitted Reddit/Poe query, but result
content supplies no verified Reddit opinions or explanation of the mismatch.
MALFORMED-ATTRIBUTES.md records both outcomes; research relevance remains open.

September 11, 2026 malformed-attribute recovery now preserves quote/apostrophe/<,
leading equals and normalized NULL names through native tokenization and parser
document construction without weakening normal setters. MALFORMED-ATTRIBUTES.md
records 4601/4601 selected native tests across 64 files, the preserved initial
four failures, and a separate fresh Bing HTTP200 load with nine headings. The
fresh response differs from the old failing body; successful loading does not
prove Reddit opinion relevance, CAPTCHA effectiveness or broad site support.
Keep researching the observed query/results mismatch and the remaining SVG,
performance, research, fingerprint and real credential/passkey requirements.

September 11, 2026 at 06:48 UTC, the recovered WHATWG capture yields its unique
foreign-content section through one zero-network native replay: 801 selected
nodes, 47631 JSONL bytes, unchanged pins/build and exit 0. READER-TABLE-SCOPE.md
links the bounded source findings. This advances specification research only;
integration-point dependencies, CDATA, native SVG semantics and rendering remain
unimplemented or unverified rather than implied by the extraction.

September 11, 2026 Bing diagnosis narrows the malformed-attribute failure to a
single U+0022 name on a div, reproduced by eight bounded native synthetic checks.
BING-ATTRIBUTE-BOUNDARY.md records the preserved initial observer failure and
separate zero-network reconstruction. No parser fix or Poe opinions are claimed;
next inspect attribute-name recovery together with document and serialization
constraints, then test the implementation before a separate fresh website run.

September 11, 2026 reader table-depth recovery is validated: omitted cell/row
ends now close ordinary descendants without increasing limits or changing
sanitized HTML bytes. READER-TABLE-SCOPE.md records the preserved five-case red
baseline, 3463/3463 passing selected native tests across 33 files, and a separate
fresh WHATWG HTTP200 capture with 140 headings. Its body hash matches the old
depth-failing capture; that original failure remains unchanged. The broader
SVG, malformed-attribute, website access, research, performance and real
credential/passkey gates remain open, not generally unauthorized.

September 11, 2026 website flows now exercise a real native DuckDuckGo form:
fill and requestSubmit reach an HTTP200 search result; the original harness's
case-comparison assertion failure remains preserved, with a separate passing
offline audit. Bounded link discovery then enables an observed NVIDIA DGX Spark
product visit and specification-section replay. WEBSITE-FLOWS-SEPTEMBER-11.md
records these sequences, manufacturer-claim qualifications and fresh failures:
Wikipedia SVG construction, Bing malformed attributes, WHATWG reader depth, and
OpenAI's Cloudflare403. Continue fixing these engine/reader gaps; Twitter/Poe
opinions, hardware recommendations, measured performance, CAPTCHA effectiveness
and credentials/passkey acceptance remain incomplete, not generally unauthorized.

On September 11, 2026 at 06:23 UTC, bounded native link discovery adds an explicit
URL-substring mode to pinned JSON replay without changing ordinary selector
semantics or raising full-page extraction limits. A cached NVIDIA index yields
16 links in 3,979 JSONL bytes with zero requests, including the observed DGX Spark
product route. RESEARCH-LINK-DISCOVERY.md records the API, original failures and
new evidence. Build, strict 32 roots, scoped lint and 3416/3416 selected native
tests pass, including 129 new cases; all 3060 prior case outcomes match. SVG,
malformed HTML attributes, implied table-depth accounting, real-site access
restrictions and the broader research/credentials/passkey gates remain open.

September 11, 2026 native-only research adds four bounded live requests: Camoufox
README, Hugging Face quantization documentation and RFC9110 return HTTP200;
the assigned NVIDIA DGX Spark route returns HTTP404. Local replay yields bounded
architecture and compatibility claims, not measured evasion or a hardware ranking.
WEBSITE-RESEARCH-SEPTEMBER-11-FOLLOWUP.md preserves exact times, source pins,
the Camoufox working-tree audit failure and the RFC local harness assertion
failure alongside their separate followups. Twitter/X Astra chatter and Reddit
Poe opinions remain unestablished. Continue usable-site discovery and functional
coverage; no completed research, CAPTCHA bypass or new secrets/passkey gate.

On September 11, 2026 at 05:56 UTC, research handles HTTP429 before primary
document parsing and blocks later stylesheet dispatch and batch URLs after an
observed rate limit. Bounded Retry-After advice is reported without sleeping,
retrying or imposing a persistent cooldown. RESEARCH-RATE-LIMIT.md records the
contract and preserved first fixture failure. Build, strict25 roots, scoped lint
and 3060/3060 isolated native cases pass, including 114 new cases; all2823 prior
reader-policy case outcomes match. Real network behavior, request coordination,
fingerprint/CAPTCHA effectiveness and secrets/passkey acceptance remain open.

On September 11, 2026 at 05:30 UTC, the explicit separate-omitted-raw-v1 reader
policy recovers a fresh SWE-bench DOM-reader load with unchanged admission caps:
HTTP200, 11 headings, one request and a closed transport. One independently
pinned local replay then extracts an observed benchmark section as JSON with
zero extra GETs. READER-OMITTED-RAW.md and SWE-BENCH-READER-RECOVERY.md record the
bounded raw-work/window contract, policy propagation and exact evidence.
Build, strict22 roots, scoped lint and 2823/2823 selected tests pass, including
222 new cases; all2601 retained baseline outcomes match. The first new test
typing failure is preserved. Old failed receipts remain ineligible. Continue
varied-site functionality/research, interactive behavior and crawler/CAPTCHA
friction work; no measured speedup, full-suite pass or completed secrets/passkey/
fingerprinting/research acceptance is claimed.

September 11, 2026 website work now includes successful native JSON reader
retrievals of the MMLU-Pro arXiv abstract and Apple Mac Studio specifications.
AMD returns a confirmed Cloudflare429 and is not retried. SWE-bench's reader
overflow is traced to omitted script text; the new explicit image-aware source
policy separately reaches EOF with 11 headings and extracts two observed method
sections from the pinned capture, with zero additional GETs and unchanged caps.
WEBSITE-COMPATIBILITY-SEPTEMBER-11.md records exact evidence and partial research
findings. The original DOM failure remains failed, not JSON-replay-admitted.
Next: bounded omitted-raw/retained-text accounting for large-page DOM reading;
continue varied-site functionality checks and research. No latest rankings,
LLM speed tests, CAPTCHA solution or completed X/Astra/Reddit/Poe research is
claimed. Real secrets/passkeys and broader runtime/device gates remain open.

On September 11, 2026 at 05:11 UTC, explicit balanced-source-elements-v2 accepts
void image starts in source headings and carries the policy through bounded
section extraction. Defaults/v1, source pins and existing budgets remain intact;
image attributes/alt are omitted and disclosed. Production build, strict two
roots, scoped lint and 1312/1312 isolated cases pass, with 90 new regressions.
SOURCE-HEADING-IMAGES.md records scope. The separate DOM reader script-text limit
and broader real-site/credential/passkey/fingerprinting gates remain open.

On September 11, 2026 at 04:54 UTC, research batches stop after a detected access
barrier or HTTP429, retaining the terminal report and making no further batch
requests. Production build, strict six roots, scoped lint and 561/561 isolated
native cases pass, including 11 new regressions. RESEARCH-WORKFLOW.md records
the exact scope; this is not a CAPTCHA solution or evidence of fewer live blocks.
The fresh AMD Cloudflare429 motivates this change; website compatibility and
the incomplete research remain active, not blocked on another general approval.

On September11,2026 at04:45 UTC, bounded capture-to-JSON replay passes all84 new
synthetic cases, production build, strict19 roots and seven-file lint. The20-file
native run has1733 passes and3 unchanged baseline selector failures; full-suite
success is not claimed. Replay requires independently pinned eligible captures,
keeps existing limits, validates classifier headers and clears owned decoded
buffers on failures/success. RESEARCH-JSON-REPLAY.md records the exact scope.
The separate SWE-bench4MB capture reaches HTTP200 but still exceeds reader.text;
it remains failed and cannot be promoted to replay content. Continue diagnosing
large omitted/raw text under explicit bounded policies, not silently raised caps.

On September 11, 2026 at 04:09 UTC, one new native-only SWE-bench website probe
hits the existing 2MB decoded-response cap at 2,009,628 observed bytes. It records
one request, no mocks/redirects and a closed transport, but no accepted HTTP
status, extraction or challenge classification. SWE-BENCH-WEBSITE-PROBE.md preserves
the failure, exact engine identity and measurements; no retry or alternate client
runs. This identifies large-page admission as the next website-compatibility
problem, not an authorization barrier or confirmed CAPTCHA. Investigate bounded
long-source discovery/replay and early response-head diagnostics; do not silently
raise defaults. No source-content or benchmark-ranking findings are established.

On September 11, 2026 at 04:01 UTC, the research helper exposes JSON/table
metadata and per-origin batch/transport pacing without changing defaults. All
196 new native cases pass, including selected challenge text beyond the whole-
document prefix. Production build, strict15 roots and three-file lint pass.
The broader16-file run has1489 passes and3 unchanged selector assertion failures;
baseline comparison reproduces those3 failures and13 existing selector type
diagnostics exactly. Full16 validation is not green. RESEARCH-WORKFLOW.md records
the contract, fixture corrections, scoped evidence and remaining live limitations.
Next: native-only public website testing, preserving challenge/login handoff,
then diagnose observed extraction or request failures without alternate clients.

Per-origin pacing passes isolated production build, two-root types and four-file
lint on September 11, 2026 at 03:17 UTC, then all 59 selected synthetic native
cases at 03:18 UTC. The validated source adds bounded FIFO admission, deadline/
abort/close handling, post-wait cookie refresh and an activity recheck after
synchronous cookie retrieval. REQUEST-PACING.md records the contract and exact
scope. Original lint and launcher failures remain in their historical lanes;
the earlier approval-service denial is no longer the current execution state.
No pacing live/performance or reduced-block/CAPTCHA result is claimed. Research,
real-site coverage and separate socket/TTY/SafeJS/device/vault gates stay open.

Table-source metadata passes all 418 selected native cases on September 11,
2026 at 03:15 UTC, following the prior isolated production build, six-root types
and scoped lint. Seven files receive unrestricted lint; only unchanged host
import organization is excluded, with exact two-hunk host admission enforced.
The JSON opt-in and reader preserve bounded allowed header/span strings without
inferring table relationships. TABLE-SOURCE-METADATA.md records actual results
and limits. Earlier denials and failures remain historical; real-site feature
validation, compact output, hardware/benchmark research and the broader browser
goal remain incomplete.

Combined validation on September 11, 2026 at 03:27 UTC passes production build,
strict eight-root types and all 477 selected native cases for the exact staged
table feature plus committed pacing. All 978 source inputs remain unchanged and
match the Git index afterward. This excludes unrelated dirty-worktree changes.
The first combined attempt's incorrect emit location and six spy failures are
preserved; only its validation harness is corrected for the successful fresh run.
Next: expose pacing and JSON table metadata in the research workflow, then use
separately authorized native website checks to measure extraction and barriers.

On September 10, 2026, the native browser reaches AMD's ROCm compatibility page
with one HTTP200 request, zero mocks/redirects, and an independently admitted
export after13 passing synthetic controls. ROCM-COMPATIBILITY-SOURCE.md records
the new evidence and keeps source01's historical failure unchanged. Selected
table boundaries work live, but header/span relationships are discarded and
marker labels occupy47.16% of this export. Next: bounded reader/extraction
relationship support and compact structured output, with separate tests.
Hardware/benchmark research remains partial; X/Astra and Reddit/Poe evidence,
real acceptance gates and the overall browser goal remain incomplete.

On September 10, 2026, the resumed cached-source workflow completes both pending
WebAuthn section extractions and separate independent verifier admissions, with
no newGET, credential or device access. PASSKEY-ATTESTATION-SOURCE-QUALIFICATION.md
records the actual four successful actions and retained procedural history.
The generating template allows map or array statements, while our helper is
map-only; this compatibility restriction must be resolved or explicitly retained
before integration. Byte/depth/profile decisions and real acceptance gates remain
open. Earlier unread-source notes are historical; the overall goal is incomplete.

On September 8, 2026, explicit user reauthorization allowed trial04's isolated
23-case native-control check only. All23 cases pass with unchanged31-input
authority and1748-file engine inventories. NATIVE-SECTION-TRIAL-04-CONTROLS.md
records the actual run and post-run audit. The earlier withdrawal remains
historical; this approval does not authorize further source extraction or
independent source verification. No website browsing or credential access was
included. Generating/none prose, passkey integration and separate live/device/
vault/SafeJS/TTY gates remain outstanding; the overall browser goal is incomplete.

BROWSER-RESEARCH-FOLLOWUP-SEPTEMBER-08.md consolidates the four requested topics
from existing admitted root reports, without a new source visit or benchmark run.
It separates hardware capacity claims from measured suitability and explains
MMLU-Pro, SWE-bench and LM-eval methods. Blocked X/Astra/Reddit access is not
actual chatter or opinion evidence. New table/policy tests do not promote
historical ROCm/NVIDIA gates. Current prices/rankings, matched performance,
source identity/opinion samples and all separate acceptance gates remain open;
historical reports and the ongoing browser goal are preserved.

The provisional private none-attestation projection now passes363 focused native
cases across three files:114new and249unchanged support cases. It supports a
strict canonical CTAP profile, conditionally retains structurally eligible packed
self statements, and otherwise emits none/empty while preserving authData bytes.
PASSKEY-NONE-ATTESTATION.md records build/types/lint, original no-test preflight
failure and fresh reviewed round02 with4413matching input pins. No broker/page/
provider integration, signature verification or full privacy guarantee is claimed.
Generating/none source qualifications, compatibility decisions and actual device/
vault/guest/live gates remain outstanding; denied RP work stays excluded. Reviewed
evidence is sealed with2900/2792 pins; the ongoing browser goal continues.

Packed-attestation source section119 now has a separately verified native export:
59blocks/15017bytes with no newGET. SOURCE-SECTION-PACKED-TRIAL.md records native
and verifier success,10syntax/94checker/23native controls, and the corrected
18actual-plus-declared-receipt outer checks without changing historical trial02.
Admitted prose resolves packed attStmt.x5c placement and self algorithm/signature
requirements; the staged privacy primitive remains provisional and unintegrated.
Generating/none source sections and actual crypto/device/vault/guest gates remain
outstanding; prior denials stay in force. Reviewed evidence is sealed with1058
readable-file pins, two explicitly unhashed mode000fixtures and three recorded
symlinks. No protected modes or old reports change; the browser goal continues.

Native Markdown now preserves selected table/row/cell boundaries explicitly,
including ordinary generic-inline thead/tfoot wrappers, without claiming grids,
headers, spans or source-layout associations. NATIVE-MARKDOWN-TABLE-BOUNDARIES.md
records239passing cases across three files:63new and176old retained, plus build,
strict types and scoped lint. The first native preflight naming failure remains
preserved; fresh native-only round02 uses unchanged code and4406matching inputs.
JSON/styles/reader selection and limits stay unchanged; markers count toward
existing budgets. Historical ROCm/source gates remain closed and the ongoing
browser goal continues. Independent integration review is clear;2947/2785-entry
final evidence inventories are audited and sealed without rerunning actions.

Research failures now retain genuine fixed network-policy reasons and validate
their two reserved serialized paths without minting native identity or changing
policy. `RESEARCH-POLICY-REASONS.md` records198passing cases across three files,
77new with121old cases retained, build/types/scoped lint success and4408matching
input pins. Original lint failure and bootstrap-review findings remain preserved;
fresh round02 fixes only missing-field fixture construction. Legacy default
serialization and resource-only behavior remain; invalid new reserved fragments
reject. Historical NVIDIA cause, all live/device/vault/guest gates and the ongoing
browser goal remain unchanged. Both evidence lanes are independently reviewed,
sealed with2941/2867-entry final inventories, and retained without rerunning them.

Historical section-trial isolation is qualified in `SOURCE-RECEIPT-HASH-SCOPE.md`:
trial02's outer pre/post checksum calls also included the source receipt, while
native decode/section extraction was namespace-bound. Retained checksum logs
support the distinction, not a new syscall trace, replay or receipt revalidation.
Old reports, exports, timings and verifier results remain untouched. Trial03's
declared-only correction and separate synthetic checker gate are still unvalidated;
no source/device/credential gate closes and the browser goal continues.

A fresh two-fixture native Markdown diagnostic now passes explicit representation
and safety checks with zero source GETs; independent artifact verification passes.
`NATIVE-MARKDOWN-TABLE-DIAGNOSTIC.md` preserves both false legacy raw-token verdicts,
actual escaped labels and concatenated table headers. The old failed ROCm control
and its unknown missing assertion remain unchanged; no table associations or GPU
facts are established. Initial harness review findings were fixed before execution,
not by changing fixtures/renderer/oracles. Bounded table extraction remains future
work, as do all live/device/vault/guest gates and the ongoing browser goal. All48
artifact entries pass final audit; the49-file frozen lane is bound by
dfc321fe2df4da51ca55d712b23c076240ca8a2f5a7aededa1c2f1db5be03eb6.

Passkey exception classification now uses private issuance identity and fresh fixed
errors, not instanceof/forwarding. `PASSKEY-ERROR-IDENTITY.md` records137passing
cases in three isolated files,20new and117unchanged, with2734matching input pins.
Initial fixture lint and actual134-pass/3-fail mock-interference run remain intact;
plain throwing handlers correct coverage without changing runtime or assertions.
Captured constructor/prototype forgeries do not authenticate, but replayed genuine
errors may retain canonical codes: issuance is not current-ceremony or human-consent
proof. Pending origin/RP source and tests remain separate; real-device/privacy/
vault/guest acceptance and the ongoing browser goal remain outstanding. Integration
review is clear;226frozen artifacts are bound by4685bd64ff528ff810d3eb027fdca4875ea7837636d2eefc7b97c54da760ade3.

The ROCm compatibility investigation stops before a live GET: one synthetic HTML
control passes, table control fails,11remain unrun. `ROCM-TABLE-CONTROL-TRIAL.md`
preserves the missing exact assertion/export and25verified frozen artifact hashes.
Static review finds raw-label versus escaped-Markdown checking and late failure
publication problems, not the historical failing predicate or hardware facts.
A fresh zero-GET diagnostic is being prepared separately; no old source/control
is rerun or relabeled, and no compatibility/access gate closes. Work continues.

Native network-policy errors now carry private fixed reasons at twelve existing
guards, without changing policy or public/research schemas. `NETWORK-POLICY-DIAGNOSTICS.md`
records128passing cases in two isolated files,48new and80unchanged,2731matching
input pins, build/types/scoped lint success, and all earlier helper/lint failures.
The getter authenticates error identity without fields/prototypes; unknown is not
permission. Existing outer error boundaries and request-ownership limits remain.
Historical NVIDIA refusal is not retrospectively diagnosed. Future bounded report
integration and all real-network/vault/device/TTY/SafeJS gates remain open; the
browser improvement goal continues. Integration review is clear;328frozen artifacts
are bound by64a992ee25bda7d2311a81042e4c13b72656d1c620be04ee11da403a9827fe43.

MMLU-Pro methodology research now has one native HTTP200 export and an independent
zero-GET verifier: `MMLU-PRO-BENCHMARK-METHOD.md`. Eight native and four status
controls pass;90frozen artifact hashes and source claims pass static review.
Author-described expanded choices, prompt sensitivity and extraction/retry limits
are separated from new measurements. Dataset quality, filtering/human-review
details, contamination and current model ranking remain unestablished. Evidence
stays partial; no linked dataset/paper/discussion, blocked endpoint or denied gate
is opened. The browser goal and all unrelated acceptance work continue.

Native challenge heuristics now preserve cutoff context: over-budget titles are
not complete anchored titles, and one bounded lookahead only qualifies existing
body boundaries without completing outside-budget markers. Confirmed headers
and public diagnostics remain unchanged. `CHALLENGE-TEXT-BOUNDARIES.md` records
171passing cases in two isolated files,48new regressions,123old cases with unchanged
test bytes and2725matching input pins. Build/types/scoped lint pass; the initial
test-only lint failure and pre-execution manifest correction remain intact. Null
stays inconclusive, not access clearance; historical blocks, denied gates and the
overall browser goal remain unchanged. Independent integration review is clear;
the137-file frozen ledger is cd2668c17ba3f5da0792b25485fddc574864dc164bfb5716912d9b9f72c6560b.

A fresh NVIDIA workstation-directory attempt stops with native network-stage
policy-denied and no admitted HTTP status, body or export. `NVIDIA-DIRECTORY-TRIAL.md`
records12passing controls, separately verified failure and28audited artifacts.
It is not the older product404, a confirmed redirect/challenge, or GPU evidence.
No retry/alternate endpoint occurs. More specific future native diagnostics cannot
retroactively identify this failure or reopen a denied gate; the goal continues.

Software post-consent exclusion now carries a private one-use error identity bound
to the original request signal. Only the live matching create broker promotes it
to fixed InvalidStateError; ordinary errors reaching the new mapping stay redacted.
`PASSKEY-CONSENTED-EXCLUSION.md` records227passing cases in five isolated files,
40new cases, all187old assertion names preserved and2724matching input pins.
All212frozen artifacts pass audit; integration review finds no actionable issue.
Build/types/scoped lint pass; the initial import-order lint failure and a locale-
ordering preflight refusal before tests remain intact. Trusted-provider provenance
is not human-consent proof; existing private-error/proxy handling, full lifetime/
attestation/page/device/vault/SafeJS gates remain open. No pending RP change or
other denied gate is reopened; the original browser goal continues.

Fresh browser-only research now adds native Apple specification, SWE-bench README
and lm-evaluation-harness README exports, each with separate controls, oneGET and
independent zero-GET verification. `BROWSER-RESEARCH-SEPTEMBER-08.md` distinguishes
vendor capacity from LLM performance, source-documented caching/scoring/backend
caveats from measured benchmark validity, and unpinned upstreammain from revisions.
A separate proposed NVIDIA endpoint returns404; its admitted failure supplies no
GPU facts and receives no retry/fallback. Static artifact/claim reviews retain
their independence limits and all original failures. No hardware winner, price,
ranking or contamination claim is made. X/Astra/Reddit and denied acceptance gates
remain closed; the original browser improvement goal continues.

The second identity-bound native prose trial extracts the credential-creation
method and its deeper exception summary:226blocks/20841UTF16 units,40636bytes,
23fresh passing controls and independent18input+1declaredreceipt/1748compiled/
51RUN admission. All253frozen artifacts and1748engine files pass final audit;
static evidence review finds no actionable issue. `SOURCE-SECTION-CREATE-TRIAL.md`
records the zero-GET native operation and its limits. Consent-conditioned exclusion errors corroborate the
bounded software fix; full page error/lifetime and conditional attestation
handling are not yet implemented by this evidence. The original browser goal
continues, historical readiness flags stay unchanged and denied gates stay closed.

Software passkey creation now defers exclusion membership checking until the
existing trusted host approval succeeds, retaining liveness and exclusion checks
before key generation or persistence. `PASSKEY-EXCLUSION-APPROVAL.md` records
187passing isolated native cases in four files,20new cases, two intentionally
updated old expectations, passing build/types/scoped lint and2718matching input
pins. All127frozen feature artifacts pass audit; static and integration reviews
find no actionable discrepancy. No guessed privacy timer, API/RP change or provider activation is added.
Full page consent/lifetime/attestation and other-provider privacy remain open;
pre-existing pending working changes are preserved, not execution-validated by
the isolated pass. Denied gates stay closed and the original browser goal continues.

The first identity-bound native prose trial now validates the captured bytes and
extracts Registration Ceremony Privacy without a new request. See
`SOURCE-SECTION-PRIVACY-TRIAL.md`:5blocks/1407UTF16 units,4836-byte native export,
23passing synthetic controls after a preserved22pass/1expectation failure, and
independent18input+1declaredreceipt/1748compiled/57RUN integrity. All405frozen
regular-file artifacts pass audit and independent evidence review finds no issue. The section
supports a pre-consent exclusion-disclosure boundary, not a complete create/consent
algorithm. Static review finds software exclusion checking before host approval;
the next bounded fix defers it to the existing post-approval/pre-key check, with
deterministic native regression tests. Old capture-readiness flags, denied parent-RP changes,
vault/device/page/SafeJS and blocked research gates remain unchanged; the original
browser improvement goal continues.

Identity-bound native section projection now shares one bounded traversal with
heading discovery, verifies exact source/anchors and publishes normalized blocks
only after a complete boundary. `SOURCE-SECTIONS.md` records1732passing cases in
seven files,217new section cases, all1515prior assertion names/test bytes preserved
and2717current/79scanner/92core/640source10/3design audited artifacts. Initial
test-only lint failure and harness review corrections are retained in200frozen
artifacts. No live prose,
capture replay, CLI or provider activation is claimed. Next is the exact engine
freeze, one-target native byte-validation/section wrapper, controls and fresh
authorization; source10's old replay-readiness flag stays false. Modern privacy,
provider/vault/device/page/consent and blocked research remain pending, denied gates
stay closed and the original browser improvement goal continues.

The fresh bounded raw-discard trial discovers230native heading candidates through
actualEOF without raising limits. `SOURCE-RAW-DISCARD-TRIAL.md` records one HTTP200
request,30raw steps/17elements, fresh5shell/81native/4817completion/3711inline/
120balanced/89cursor/383raw/256caller controls and passing1748compiled/49RUN
candidate integrity;640frozen artifacts and independent evidence review pass.
This is partial lexical discovery, not prose or current
privacy acceptance; base64 remains opaque and replay readiness false. Next is
identity-bound native section projection with synthetic tests and separately
authorized capture-byte validation/scoped replay or one fresh request. Historical
failures remain unchanged. Provider/vault/device/page/consent and blocked research
stay unresolved; denied gates stay closed and the original browser goal continues.

Explicit source-heading raw discard now selects six non-entity names with one
bounded native step per iteration, shared budgets/yields and frozen policy/counter
disclosures. `SOURCE-RAW-DISCARD.md` records1515passing cases in six files,72new
heading cases, all1443prior names preserved and2716current/92core/551source09
audited artifacts. Initial test-only lint failure is retained in79frozen artifacts.
Default grammar/report shape and legacy title/textarea remain unchanged. Next is
exact engine freeze, source10 operation/verifier integration, fresh controls and
authorization; no live recovery, prose, CLI or operation activation is claimed.
Modern privacy/provider/vault/device/page/consent and blocked research remain open;
stopped/denied probes stay closed and the original browser goal continues.

Bounded native raw-discard core now provides an explicit six-name, one-window
metadata-only step with private script-state continuation and unchanged ceilings.
`RAW-DISCARD-STEPS.md` records 1443 passing native cases in six files, 136 new
cases, all 1302 prior names preserved, build/strict/Biome and a passing audit of
2716 inputs plus 551 source09/48 prior-feature artifacts. Initial lint failure
and a static test correction are preserved in 92 frozen artifacts. Title/textarea
remain legacy entity-aware/window-bounded; no scanner/CLI/index activation or
source09 recovery is claimed. Next is separately reviewed explicit scanner opt-in,
truthful selected counters/disclosures, controls and any freshly authorized trial.
Modern privacy/section prose, provider/vault/device/page/consent and blocked
research gates remain unresolved; stopped/denied probes stay closed. Goal continues.

The fresh cursor-window trial now identifies raw at last committed source UTF16
1824525, retaining the65536/65537 window refusal with no tag/entity-mode/full-size
or payload claim. `SOURCE-CURSOR-WINDOW-TRIAL.md` preserves551artifacts, fresh
5shell/66native/4817completion/3711inline/120pair/89window/135caller controls and
passing1748-file/40RUN failure integrity. No historical error is enriched. Next is
an explicit bounded native non-entity raw-discard step design with finite state,
native script semantics and unchanged per-window/total budgets, not a cap increase
or assumed source recovery. Section prose/current privacy reading and provider/
vault/device/page/consent acceptance remain pending; blocked research is unresolved
and stopped/denied probes stay closed. The original browser goal continues.

Trusted native cursor-window diagnostics now identify next/raw/remainder and the
last committed input UTF16 coordinate on the same origin error, without source/name
disclosure or cap/grammar/accounting changes. `CURSOR-WINDOW-DIAGNOSTICS.md` records
1302passing native tests in five files,42new cases,1260unchanged prior assertion
names, build/strict/scoped Biome and independent review/audit of2716inputs,
527source08/48prior-feature artifacts. The record is origin attribution, not receiver
or source-byte identity; next/raw limit+1 remains a refusal sentinel. Source08 is
not retroactively identified. Next is source09 same-engine integration, fresh
controls/reviews and exact authorization. Modern privacy/provider/vault/device/page/
consent, blocked research and all stopped/denied gates remain open. Goal continues.

The balanced-heading source trial returns an actual cursor-window resource failure:
65537code units observed against65536, with no operation/position/token attribution,
candidates or capture. `SOURCE-BALANCED-TRIAL.md` preserves527artifacts, fresh
5shell/62native/4817completion/3711inline/120pair/109whole-receipt controls, and
passing1748-file/44RUN failure integrity. The caller seam preserves all checks and
now exercises policy-tuple comparison/metadata integration with explicitly synthetic
receipts. No source recovery or raw-token cause is inferred. Next is trusted finite
native cursor-window attribution without increasing limits; section-prose extraction
is designed but deferred. Modern privacy/provider/vault/device/page/consent, blocked
research and all stopped/denied gates remain open. The original browser goal continues.

Explicit headingInlinePolicy balanced-source-elements-v1 now supports bounded
balanced lexical source elements inside admitted headings, with64-unit names,
unchanged special-context exclusions/defaults, strict closes and exact selected
policy/limitations disclosure. It is not DOM/visibility/phrasing/private-content
truth. `SOURCE-BALANCED-INLINE.md` records1260passing tests in five native files,
167new cases, unchanged1093prior definitions, build/strict/scoped Biome, independent
review and reconciliation of2716inputs/424source07/48prior-feature artifacts. Source07's
unknown name/recovery remains unproven. Next is separately reviewed source08 policy
integration, intentional finite fixture migrations, controls and exact authorization.
Modern privacy, provider/vault/device/page/consent, blocked research and all stopped/
denied gates remain open. The original browser improvement goal continues.

The native inline-diagnostic trial now identifies non-inline-start under active
heading level2 at depth1, still at committed sourceUTF16 250858. The finite tag
label is other: no actual spelling or block/phrasing/custom semantics is known.
`SOURCE-INLINE-TRIAL.md` preserves424artifacts, the parent environment refusal then
fresh5shell/4817completion/3711inline/42native controls, and passing1748-file/39RUN
failure integrity. No candidate/text/capture or prior-transition proof exists.
Missing separate verifier capture files are disclosed, not reconstructed. Next
is a defensible explicit bounded lexical continuation design, not guessing tags,
loosening default grammar or replaying raw source. Modern privacy, provider/vault/
device/page/consent, blocked research and all stopped/denied gates remain open.
The original browser improvement goal continues.

Trusted sourceHeadingInlineDiagnostic now records the active heading's actual
rejection predicate, level, finite canonical tag and inline depth on the same
private-map-branded error. Grammar, earlier guard order, success/counters/limits,
error own shape and prior diagnostic schemas stay unchanged. `SOURCE-INLINE-DIAGNOSTICS.md`
records1093passing tests in five native files,237new cases, unchanged856prior
assertion names, build/strict/scoped Biome, independent static review and audit
of2716inputs/362source06/50prior-feature artifacts. No prior receipt is enriched
and no actual rejected live tag or source recovery is inferred. Next is separately
reviewed source07 wrapper/verifier/probe integration and exact source authorization.
Modern privacy, provider/vault/device/page/consent, blocked research and all stopped/
denied gates remain open. The original browser improvement goal continues.

The native head/table source trial now reaches an active heading-inline-structure
guard at sourceUTF16 250858, with no rejected tag/predicate detail, candidates,
text or capture. `SOURCE-HEAD-TABLE-TRIAL.md` preserves362 artifacts, fresh five
shell/28 native integration/4817 status controls and passing1748-file/37-artifact
failure integrity. An earlier coordinate is a different guard path, not numeric
progress/regression or proof of which implicit transition occurred. Next is a
trusted finite inline-diagnostic design preserving grammar and short-circuit order,
not blind tag acceptance or raw-source replay. Modern privacy, provider/vault/
device/page/consent, blocked research and all stopped/denied gates remain open.
The original browser improvement goal continues.

Explicit host-only headScopePolicy explicit-body-boundary-v1 now permits one
eligible leading head to end only at an actual body start, with bounded prefix/
ASCII-whitespace checks and permanently terminal disqualification. Defaults,
table policies, diagnostic schemas, limits and opaque suppression stay unchanged.
`SOURCE-HEAD-BOUNDARY.md` records856passing tests in five native files,66new cases,
unchanged790prior assertion names, build/strict/scoped Biome, independent review
and reconciliation of2716 inputs/334source/48prior-feature artifacts. No actual
source eligibility or recovery is inferred. Next is separately reviewed wrapper/
verifier provenance and fresh integration before one exact source authorization.
Modern privacy, provider/vault/device/page/consent, blocked research and all stopped/
denied gates remain open. The original browser improvement goal continues.

Explicit host-only optional-end-tags-v2 now adds only canonical thead-to-tbody
start replacement, preserving strict/default and v1 semantics, end/EOF rules,
opaque boundaries and every resource limit. `SOURCE-TABLE-SECTIONS.md` records
790passing tests in five native files,50new cases, build/strict/scoped Biome,
independent runtime review and reconciliation of2716 inputs/334source artifacts.
One prior unknown-policy fixture changes invalid v2 to invalid v3; no old test
definition is removed. Full-context byte-verified snapshots exclude pending work.
No source activation/recovery is claimed. A separately designed conservative
explicit-body head-boundary policy remains unimplemented; modern privacy,
provider/vault/device/page/consent, blocked research and all stopped/denied gates
remain open. The original browser improvement goal continues.

The separately authorized native scope-context trial still rejects at sourceUTF16
872144/td/table/depth31, now with an actual bounded outer-to-inner stack containing
head and accumulated table/thead/row/cell scopes. `SOURCE-SCOPE-CONTEXT-TRIAL.md`
preserves334 artifacts, fresh five shell/21 native integration/4817 status controls,
and passing1748-file/37-artifact failure integrity. No candidate/text/capture or
raw markup was read; the stack is not an intermediate history or DOM ancestry.
Next is bounded canonical-transition design, independent synthetic tests and review,
not arbitrary ancestor repair, bundled head recovery or a presumed live success.
Modern privacy, provider/vault/device/page/consent, blocked research and all stopped/
denied gates remain open. The original browser improvement goal continues.

Trusted sourceHeadingScopeContextDiagnostic now adds a private frozen four-field
error snapshot with actual policy and outer-to-inner finite scope names, bounded
by128 frames. Existing diagnostics, error shape, strict/selected grammar, reports
and limits remain unchanged. All740 tests in five explicit native files pass,
including45 new cases, with build/strict/scoped Biome and independent review.
An identity guard refused a reordered round01 test snapshot before execution;
the corrected whole-file mirror produces the exact tested round02 bytes. Audit
reconciles2716 inputs and328 preserved source artifacts. `SOURCE-SCOPE-CONTEXT.md`
records this and the unrun source-wrapper activation: the old872144/td/table/
depth31 receipt is not retroactively enriched. Next is explicit bounded context
integration and separate source authorization. Modern privacy/provider/device/
page/consent, blocked research and all stopped/denied gates remain open; the
original browser improvement goal continues.

The explicit native table-policy source trial reaches committed sourceUTF16
872144, later than834905, but still rejects expected td/observed table/depth31
without candidates, text or capture. `SOURCE-TABLE-TRIAL.md` preserves328 evidence
files, fresh five shell/20 native integration/4817 status controls and passing
1748-file/37-artifact failure integrity. Neither coordinate identifies complete
markup or proves an omitted-group pattern. Next is trusted bounded finite scope
context with unchanged grammar, followed by separate tests/review/authorization;
no blind recovery, raised limits or source/capture replay. Modern privacy,
provider/vault/device/page/consent, blocked research and all stopped/denied gates
remain open. The original browser improvement goal continues.

Explicit host-only tableScopePolicy optional-end-tags-v1 now handles a conservative
lexical cell/row/tbody omission subset using at most four tracked stack slots.
Strict/default grammar, reports and bounds remain unchanged; outer scopes stay
suppressed, rejected plans preserve original diagnostics, and no containers or
EOF closures are invented. All695 tests in five explicit native files pass,
including12 option and49 transition cases; build/strict/scoped Biome, independent
runtime review and2716-input/304-source-artifact reconciliation pass.
`SOURCE-TABLE-SCOPES.md` records the contract and evidence. This is not CLI/page/
source-wrapper activation or proof that actual W3C markup is recoverable; next
source use needs explicit policy integration and separate authorization. Modern
privacy/provider/device/page/consent, blocked research and all stopped/denied gates
remain open. The original browser improvement goal continues.

The latest separately authorized native WebAuthn source request now identifies
an actual scope mismatch: expected td, observed table, tracked depth27, at
last-committed sourceUTF16 position834905. It still fails without source text,
candidates or capture; this is not complete markup or proof of optional tags.
`SOURCE-SCOPE-DETAIL.md` preserves304 immutable artifacts, five shell controls,
14 native synthetic cases,4817 status rows and actual zero-GET integrity across
1748 compiled files/37 RUN artifacts. Next is conservative lexical table-scope
design and synthetic validation, not blind stack popping, raised limits or old
capture replay. Modern privacy/provider/device/page/consent, blocked research and
all stopped/denied gates remain open. The original browser goal continues.

Trusted sourceHeadingScopeDiagnostic now separates scope mismatch from nonplain
close using a private frozen five-field snapshot of finite expected/observed
scope constants and depth. Existing four-field diagnostics, short-circuit
precedence, strict parser behavior and bounds remain unchanged. All634 tests in
five explicit native files pass, including93 new cases; build/strict/scoped Biome,
independent review and2716-input/292-source-artifact reconciliation pass.
`SOURCE-SCOPE-DIAGNOSTICS.md` records44 immutable evidence files and limitations.
This does not identify the actual W3C closing tag/predicate: the new getter has
no CLI/page/source-wrapper activation, and old receipts remain unchanged. Next is
explicit bounded integration and separately authorized source diagnosis, not
guessed grammar recovery or capture replay. Password/provider/passkey/privacy,
device/page/consent, blocked research and all stopped/denied gates remain open;
the full original browser goal continues.

A fresh native W3C source attempt now identifies scope-close-structure at
last-committed sourceUTF16 position834905, but still rejects without candidates,
source extraction or capture. This is the guard, not an offending tag/byte offset
or proof of an optional-table-close issue. `SOURCE-SCOPE-FAILURE.md` preserves
the actual one200 request,292 evidence files and separate1748-file/36-artifact
integrity verification retaining failure/exit1. Five shell controls, ten actual-
native synthetic integration cases and4817 narrow verifier-status rows pass;
complete-header admission and independent static review are included. Next is
fixed predicate/scope metadata with unchanged grammar, not a guessed parser fix,
raised limits or capture replay. Modern privacy/provider/device/page/consent,
blocked research and all prior stopped/denied gates remain open. The full original
browser goal continues.

The corrected hardware-guide operation now succeeds through the actual native
transport, reader and extractor: one200 request,4281 encoded/10148 decoded bytes,
zero redirects/mocks and closed transport. Separate zero-request verification
checks1732 compiled files/36 RUN artifacts and exports10158 exact native bytes;
the guide remains mutable-master, partial/extracted-unverified, not a ranking.
`HARDWARE-MULTI-GPU-GUIDE.md` preserves293 evidence files, five shell controls,
ten actual-native admission cases including prior cookie failure controls, and
4817 passing narrow verifier-status rows. Native guide findings separate capacity
from mode/interconnect performance, tensor compatibility and KV/topology controls;
no current hardware ranking, body replay or benchmark is enabled.
The earlier failed request/evidence remains unchanged. Fresh diagnostic-source
preparation does not yet identify W3C's rejected construct or validate privacy.
Providers/passkeys/device/page/consent, blocked research and all prior stopped/
denied gates remain outstanding. The full original browser goal continues.

The hardware-guide operation now preserves an actual invalid-input/network
failure before any counted request: no response, bytes or source extraction.
Five supervisor and10 synthetic header checks pass, but their request replacement
did not exercise native request admission. The wrapper incorrectly supplied
cookieContext without a jar; a fresh unexecuted lane removes only that property
and prepares actual-native routed admission checks before any source retry.
`HARDWARE-SOURCE-ADMISSION.md` records the header-admission correction, fixture
limitations, all-1/zero-request failure and separate1732-file/40-artifact integrity
check. A generic nonzero-status verifier limitation remains explicitly open;
the frozen actual all-1 evidence is unchanged. Hardware findings, source admission,
privacy/providers/passkeys/device/page/consent, blocked research and all prior
stopped/denied gates remain outstanding. The full original browser goal continues.

A fresh native-only W3C source-heading request returns HTTP200 but rejects
unsupported structure; no candidates or capture are retained. Separate zero-GET
verification checks1748 compiled files and38 RUN artifacts while preserving
native-failure/exit1 and no replay readiness. Five supervisor controls and the
actual wrapper network-error projection control pass; historical failures remain
unchanged. `RESEARCH-SOURCE-HEADING-FAILURE.md` records the failed attempt, stale
verifier-pin refusal, evidence and limited challenge coverage. New trusted native
structure diagnostics expose only fixed reasons and last-committed UTF16 position:
all541 tests in five explicit files pass, including48 new cases; build, strict
types, scoped Biome and independent review pass. `SOURCE-HEADING-DIAGNOSTICS.md`
does not identify the actual rejected W3C construct or authorize a retry. Next:
fail-closed classifier-header admission, explicitly activated diagnostics and
separately authorized source operations. Hardware research remains unexecuted
pending its header fix; privacy/provider/device/page, blocked research and all
stopped/denied gates remain open. The full original browser goal continues.

Explicit host source-heading discovery now binds owned HTML bytes and exact
decoder identity to bounded native lexical candidates, without building a DOM
or fabricating selectors/visibility. All767 cases in the exact ten-file matrix
pass, including271 new cases; build/strict/scoped Biome pass. Real event-loop
yields, deadline checks, bounded escaped JSONL and original-view validation are
covered; the actual pre-fix OOB-view control fails as expected. Encoding sniff
factoring preserves its exact prior body/raw policy. `NATIVE-SOURCE-HEADINGS.md`
records the restricted lexical semantics and evidence, not a read of the failed
W3C source. Next are CLI/evidence activation, pinned anchor reuse/selection and
separately authorized source admission. The full browser goal, password/passkey/
privacy/device/page, research and stopped/denied gates remain open.

A bounded host-only native HTML token cursor now shares small input windows,
charges native work/issue attempts before publication and preserves terminal
quota/deadline/close behavior. All503 cases in the exact ten-file matrix pass,
including188 new cases; build, strict and scoped Biome pass. Independent review
fixed readonly construction and replaceable budget authority; two actual
pre-correction runtime controls fail as expected. `HTML-TOKEN-CURSOR.md` retains
initial failures, immutable evidence and the real synthetic parser-versus-token
differential. This is not source-heading discovery or a read of the failed W3C
source. Next are lexical discovery/identity/scheduling and separately authorized
source admission, not raised tree limits or automatic capture replay. All full
browser, privacy/device/page, research and stopped/denied gates remain open.

A separately authorized native long-profile source request reaches HTTP200 and
records a 2,739,242-byte decoded response, but parsing stops at document.nodes
50,001/50,000. No heading or source-text extraction succeeds. The zero-GET
verifier accepts receipt/input integrity while correctly retaining evidence-only/
native-failure and no replay readiness; no body decoding or retry follows.
`RESEARCH-LONG-SOURCE.md` preserves the actual failure, five passing synthetic
supervisor controls, corrected status/manifest handling and all prior evidence.
Next is a bounded native parsing/discovery design, not an automatic profile-limit
increase. Published privacy wording, device/page/consent integration, blocked
research sources and all stopped/denied gates remain open; the full goal stands.

Explicit long-v1 CLI admission now wires bounded native network/reader/capture/
heading operations, canonical effective-limit provenance, bounded JSONL with
truthful overflow outcomes, callback-aware one-write output and independently
pinned replay byte admission. All 239 new cases pass. The exact ten-file native
run records 1,121 passes and three unchanged selector assertion failures, which
reproduce against actual aa80b77; it is not a fully green matrix. Production
build, scoped Biome and nine-file strict checks pass; thirteen unchanged selector
type errors also reproduce exactly on the baseline. `RESEARCH-LONG-CLI.md`
preserves both review fixes, initial failures, the real MIME negative control and
all evidence boundaries. Publication/fresh source admission, real network/TTY,
attestation privacy and device/page gates remain open. No historical source is
retried, no stopped/denied gate is reopened, and the full browser goal continues.

Explicit trusted host capture/decode and inert HTML loading now support a
bounded long-v1 profile while omitted/default behavior stays unchanged. Actual
synthetic 2,000,001-byte and 4,000,000-byte capture→reader→heading chains pass;
the exact eight-file native matrix passes 590 cases (131 new), with build,
strict types and Biome passing. `RESEARCH-LONG-ADMISSION.md` preserves initial
type/lint and Markdown-fixture failures and the fixed tree/context ceilings.
CLI/network activation, profile-bearing bounded receipts/replay, live-source
admission and memory measurements remain separate next gates. No failed source
request is retried or privacy wording established; the full browser goal and
all existing stopped/denied, credential/device/page/privacy gates remain open.

Native network byte failures now carry trusted, immutable encoded/decoded
response/session counters through existing research diagnostics without raising
any limit or exposing error payloads. The exact four-file native matrix passes
148 cases (31 new); unchanged code yields 13 passes and 18 specifically missing
diagnostic failures. Build, strict types and Biome pass. See
`NETWORK-BYTE-DIAGNOSTICS.md` for preserved setup failure, synthetic-only scope
and the failed published-Level3/no-match draft source lanes. Neither source lane
establishes privacy wording. Long-document admission, published attestation
privacy rules, actual HTTP/device/page acceptance and all stopped/denied gates
remain open; no failed source request is retried and the full browser goal stands.

Assertion exceptional exits now enforce the existing absolute deadline even
when synchronous processing or a rejected promise crosses it before timer
dispatch. Five new finite regressions fail specifically against the actual
committed collector and pass with the two-line fix; the exact eight-file native
matrix passes 546 cases, with build, strict types and Biome passing. See
`CTAP-ASSERTION-DEADLINE.md` for preserved setup failure, negative control and
ownership/cleanup evidence. This is not the WebAuthn privacy-delay algorithm and
does not activate a provider or widen RP policy. The full browser goal and all
device, consent, page, privacy, cryptographic and stopped/denied gates remain open.

Internal registration now composes the actual MakeCredential encoder, modern
response parser and exclusive HID exchange with RP/UP/UV/algorithm/exclusion
binding, unsolicited-extension rejection and sensitive optional-field policy.
The exact ten-file native matrix passes 774 cases (151 new); build, strict types
and Biome pass. Four exceptional-deadline regressions also fail specifically
against preserved pre-fix code, proving the reviewed race is covered. See
`CTAP-REGISTRATION-TRANSACTION.md` for ownership, cleanup and source provenance.
The existing assertion exception path needs analogous targeted review/coverage.
Cryptographic trust, attestation privacy projection, provider/page integration,
genuine consent, real device/residency and all stopped/denied gates remain open.
No provider is activated or RP policy widened; the complete browser goal is active.

Bounded public credential-key and registration authenticator-data parsing now
checks public-only COSE profiles, algorithm/key-type matching, key-prefix and
extension boundaries, attested-data layout and backup-flag consistency. The exact
seven-file native matrix passes 788 cases (132 new), with build, strict types and
Biome passing; the prior 787-pass/one-fixture-failure run remains preserved.
`CTAP-CREDENTIAL-STRUCTURE.md` records native-only RFC source provenance, supported
profiles, local limits and ownership guarantees without claiming cryptographic
key validity or attestation trust. Outer CTAP/WebAuthn response integration, RP
and ceremony binding, extension policy, genuine consent and device/page gates
remain open. No provider is activated, no denied gate is reopened, and the full
browser goal remains active.

Native browsing now resolves the registration response-table discrepancy against
an officially linked CTAP 2.1 edition: fmt=1, authData=2 and map-valued attStmt=3.
Archived WebAuthn extraction separately establishes embedded credential-data
layout without claiming a complete COSE schema. The shared canonical decoder now
offers bounded prefix consumption while keeping whole-input decoding strict;
the exact six-file native matrix passes 733 cases (68 new), with build, strict
types and Biome passing. `CTAP-REGISTRATION-STRUCTURE.md` preserves two new GETs,
two offline replays and all historical identities; `CTAP-CBOR-PREFIX.md` records
the parser boundary. Full registration-response/COSE validation, attestation
trust, genuine consent and device/page acceptance remain open, as do the overall
browser goal and all existing stopped/denied gates.

Internal registration request encoding now maps trusted broker creation context
to bounded canonical CTAP MakeCredential bytes, preserving algorithm preference,
privacy-optional entity metadata and explicit resident/UV choices without carrying
GetAssertion's presence option. The exact seven-file native matrix passes 646
cases (132 new); build, strict test types and Biome pass. Native-only historical
source replay preserves its original receipt and leaves ambiguous response-table
details unimplemented. `CTAP-MAKE-CREDENTIAL-REQUEST.md` distinguishes serialization
from registration: no device/provider activation, PIN flow, attestation trust or
genuine consent is claimed. All stopped gates, pending parent-RP work and the
full browser goal remain unchanged and open.

Internal CTAP assertion collection now owns one exclusive HID scope across the
initial request, bounded continuations and explicit account selection. Replies
are structurally decoded, bound to the snapshotted RP/allow-list/UP/UV policy,
and cleaned up without letting an old abort close a subsequent connection owner.
The existing broker also rejects BS without BE. The isolated ten-file synthetic
matrix passes 781 cases (347 new), with build, strict types and Biome passing;
unchanged broker and reviewed collector baselines reproduce 16 and six finite
regressions respectively. `CTAP-ASSERTION-TRANSACTION.md` preserves the earlier
fixture failure and protocol/ownership limits. No parent-RP widening or device
provider is enabled. Signature verification, PIN/UV token flows, trusted device
allocation, genuine consent and full page/account acceptance remain separate
gates; the full browser goal and all stopped/denied boundaries remain unchanged.

Internal GetAssertion request encoding now maps broker-supplied RP/clientDataHash
and explicit credential/UV choices to canonical CTAP bytes, with command-inclusive
default/negotiated/HID size caps and owned temporary-buffer cleanup. The isolated
six-file native matrix passes 525 cases (121 new), with build, strict test types
and Biome passing. `CTAP-ASSERTION-REQUEST.md` records exact-wire, broker-context,
GetInfo-limit and in-memory framing evidence without claiming a new authenticator
provider. PIN/UV token flows, extensions, response/signature validation, owned
continuation, backup-state consistency and real-device/account/page gates remain
open. Full browser scope and all existing authorization boundaries are unchanged.

Passkey assertions now reject AT data and inconsistent ED/tail layouts without
changing RP scope or enabling a provider. The isolated exact-host native matrix
passes 104 cases across two files; unchanged broker code reproduces all seven
new malformed-layout regressions (20 other new cases pass). Focused build,
strict types and Biome pass. `PASSKEY-ASSERTION-LAYOUT.md` records native-only
historical and modern-development source evidence, including preserved valid
backup flags. Extension CBOR parsing, backup-state policy, signature validation,
PIN/UV/consent, actual authenticators and complete account authentication remain
open gates; a synthetic provider is not real passkey acceptance. The full browser
goal and existing authorization boundaries are unchanged.

Internal canonical CBOR request encoding now complements the CTAP decoder with
bounded UTF8/length/container handling, exact numeric/float representations and
owned sorted map output. The exact six-file synthetic matrix passes 493 cases
(204 new); four finite regressions fail on the reviewed pre-fix sparse-slot path
and pass after own-index checks. Focused build, strict types and Biome pass.
`CTAP-CBOR-ENCODING.md` separates generic encoding from command/schema/transport
budgets and real passkey success. Newly saved historical GetAssertion research
still leaves PIN/UV/consent, RP/clientData, signatures and continuation unresolved.
No new provider or actual device is enabled; all outstanding browser gates remain.

Native-only llama-bench research now records throughput scope, repetition/sample
output and scheduling/cache controls without presenting documentation examples
as new measurements. `LLAMA-BENCH-CONTROLS.md` distinguishes internal rates from
end-to-end latency and identifies missing matched MLX/cache/quality conditions.
The September 6, 2026 06:47:34.855 UTC observation remains partial/unverified on a
mutable source; 28 frozen artifacts preserve its original receipt and identities.
No benchmark, hardware ranking, model download or credential/device probe ran.
Historical hardware measurements and all outstanding browser gates stay unchanged.

An internal bounded CTAP CBOR decoder and GetInfo query now preserve exact integer
and option semantics, reject malformed/canonicality violations, and quarantine
malformed replies through the owned FIDO connection. The exact six-file synthetic
matrix passes 464 tests (228 new), with focused build, strict types and Biome
passing. `CTAP-GET-INFO.md` records the historical/RFC8949 NaN policy, immutable
native source evidence and fake-handle limits. No device was opened and no page
passkey provider was enabled: trusted allocation, real GetInfo, MakeCredential/
GetAssertion, RP binding, PIN/UV and human consent remain outstanding. Existing
stopped/denied gates and the overall browser goal remain active.

Native-only GetInfo/message-encoding research and the historical RFC7049 simple-
value reference now establish the next CTAP parser requirements, including
tri-state capability options, status/map framing, canonical encoding, unknown-key
handling and nesting/message bounds. Four separately authorized September 6, 2026
requests retain partial/unverified status and distinct body identities. See
`CTAP-GET-INFO-BOUNDARIES.md`: no parser, device query or passkey acceptance is
claimed; unusual key equality, malformed forms/UTF-8, trusted allocation and
human PIN/UV/consent still need work. The full browser goal remains active.

The constant-reference secret broker now stores the same resolver/provider/key
values that it validated, bypasses overridden function binding, and bounds copied
origin iteration before allocation can grow past 64 entries. Five finite new
regressions fail on unchanged bbdb048 and pass with the fix; endless-iterator
cases run only against the bounded implementation. The exact three-file matrix
passes 142 cases, including nine new unit/integration cases and mocked env/pass
provider selection. Focused build, strict types, Biome and independent static
review pass. `SECRET-PROVIDERS.md` records the trusted-host scope and limits:
this is not a demonstrated remote exploit or real-vault/full-browser acceptance.
Pre-existing credential, SafeJS, passkey and stopped/denied gates remain unchanged;
the full browser goal stays active.

Native-only benchmark research now records HELM's advertised standardization,
multi-metric and prompt-inspection facilities without treating them as validated
fairness, score significance or contamination controls. The September 6, 2026
05:48:20.441 UTC receipt is partial/unverified and its mutable source states
maintenance mode began June 1, 2026; policy details were not retrieved. See
`HELM-BENCHMARK-METHOD.md` for explicit comparison-evidence controls and preserved
hashes. No benchmark, linked source, credential/device or SDK probe ran. The
browser goal and existing stopped/denied acceptance gates remain unchanged.

An internal Node hidraw handle adapter now bridges explicitly granted nonblocking
handles to the owned FIDO connection. It enforces independent report IDs/sizes,
exact complete-report I/O, delayed empty-queue reads, no write retries, scratch
ownership and honest pending-operation closure. The exact six-file native matrix
passes 320 cases, including 92 new unit and six new integration cases; focused
build, strict typing and Biome pass. Initial 317-pass/3-fail evidence is preserved:
two cases exposed delayed close-failed state, and one exposed a parent test's
packet-count error. Initial review also corrected own-code accessors and a queued
close/public-settlement race. See `NODE-HIDRAW-TRANSPORT.md` and its cache evidence.
Four separately authorized native-only requests on September 6, 2026 narrow the
pinned Node open/flag-helper source questions, without proving installed behavior.
A separately authorized read-only class-directory listing found no visible
`/sys/class/hidraw`; no device was opened. Trusted device/descriptor association,
actual driver behavior, allocation/CBOR, human PIN/UV/consent and real relying-party
acceptance remain open. No provider, credential, SDK or denied/stopped gate was
activated, and the full browser goal remains active.

Owned allocated-channel FIDO HID CBOR exchanges now serialize normalized reports,
bound all-report/deadline work, drain CANCEL without inventing its own reply, and
quarantine uncertain I/O until pending operations and physical-close promises settle.
Independent review found and corrected options-getter ownership reentrancy and
discarded-response retention behind hung CANCEL writes. All337 cases in the exact
seven-file native scope pass, including64new cases; focused build, strict types and
Biome pass. `FIDO-HID-CONNECTION.md` separates local lifecycle ownership from actual
device/CID trust, CBOR interpretation and human consent. Two separate native Node
flag reads remain partial/unverified and do not prove nonblocking interruption.
Physical adapter/readiness/cleanup, trusted allocation, CBOR, PIN/UV and live-RP
acceptance remain open; no real provider or denied/stopped gate was activated.
The full browser/passkey goal remains active.

Native-only MLX-LM research now records quantization, rotating KV-cache size,
prefill steps and prefix reuse as explicit comparison variables rather than
hardware performance evidence. `MLX-MEMORY-CONTROLS.md` preserves the separate
September6,2026 00:21:17.729UTC receipt and its partial/unverified status; mutable
upstream documentation supplies no numerical generation benchmark or matched
hardware ranking. No model, benchmark, installation or system tuning ran, and
historical hardware measurements were not rewritten. Stopped Reddit/Astra/X and
all real credential/device/runtime gates remain unchanged; full browser goal active.

Native research now supports bounded literal `--find` line discovery before a
separately chosen `--lines` read, sharing unchanged text-loader admission and
preserving barrier/status handling without source previews or raw-body fallback.
All326 new cases pass; the exact twelve-file matrix is1045pass/3unchanged failures,
with those three selector expectations reproduced on untouched98c4572. Focused
build, strict typing, Biome and final bounded static review pass. Initial fixture
failures remain preserved. Separate September6,2026 native receipts at00:46:51.223
and00:47:39.369UTC demonstrate nine matching lines followed by a selected99-line
read; both remain partial/unverified with matching body hashes. See
`TEXT-LINE-DISCOVERY.md`. No actual credential/device/SDK or denied/stopped gate
was reopened; the overall browser and passkey goal remains active.

`NATIVE-HIDRAW-IO.md` records the historical September 5, 2026 pinned Node
v22.22.0/Linux v6.12 source boundaries and verified local receipt integrity;
retrievals remain partial/extracted-unverified, closed and not retried. This is
documentation, not a driver or real passkey success. Expected-size-plus-one and
one pending read/write remain untested design ideas. Node flags/readiness,
ioctl/sysfs association, permissions, exact report sizing, short I/O/disconnect,
actual abort and bounded shutdown remain open, followed by separately authorized
device access, trusted user consent/PIN/UV and real relying-party acceptance.
No new runtime/test/device/network probe ran for this note, and no existing
stopped or denied gate is cleared. The overall browser goal remains active.

Bounded FIDO HID descriptor semantics now derive independent candidate input/output
report metadata without opening or trusting a device. Whole-report ownership,
balanced state, bounded ranges and conservative ambiguity refusals prevent partial
report lengths or partial candidate success. All 123 cases in the exact three-file
native scope pass (99 new), with focused dependency-closure build, strict types and
Biome passing. Source review corrected range completion ordering and exposed mixed
short/extended endpoint normalization; the latter now fails closed with eight new
regressions. `FIDO-HID-DESCRIPTOR.md` preserves the initial 115-pass evidence and
distinguishes candidate policy from full HID/FIDO conformity. Physical descriptor
acquisition and Node I/O, transaction deadlines, CBOR and trusted human PIN/UV/consent
remain open. No actual device/provider activation or denied/stopped gate occurred;
the overall browser goal remains active.

Bounded HID short-item tokenization now supplies owned raw tokens with explicit
4096-byte/item policy caps, zero-byte progress, 0/1/2/4 framing and immediate
long/reserved refusal. All 124 cases in its exact three-file native scope pass,
including 24 new cases and resizable empty/out-of-bounds regressions; build,
strict corrected-fixture types and Biome pass. `HID-SHORT-ITEMS.md` retains the
fixed Linux v6.12 native-source receipts and separates implementation evidence
from normative/current-spec claims. This is lexical framing only: collection/
scope/usage/report-ID semantics, FIDO report metadata and Node physical I/O remain
open. No provider/device activation or denied/stopped gate was reopened.

Native-browser HID descriptor research now records a documented per-device sysfs
route and report-accounting examples, plus an independently retrieved manual
header-parsing guide. The September 5, 2026 23:11:33.782 and 23:16:37.720 UTC
receipts remain partial/unverified; no actual device/sysfs or source command ran.
`HID-DESCRIPTOR-DISCOVERY.md` preserves source inconsistencies and missing size,
long/reserved, scope and malformed-input rules instead of inventing a full parser.
Fixed-version implementation research is the next lexical prerequisite; Node
transport feasibility and physical passkey/human-consent gates remain open.

Pure allocated-channel FIDO HID response decoding now handles exact one-byte
KEEPALIVE and ERROR messages, preserving unknown values and owned channel bytes.
Its strict API rejects malformed/broadcast inputs without inferring transaction
completion, cancellation, ownership or human presence from status labels. The
exact five-file native scope passes 260 cases, including 35 new cases; build,
strict types and two-file Biome pass. `FIDO-HID-RESPONSE-CONTROL.md` separates the
historical native-browser source from chosen unknown-value/channel policies.
No new request or device/provider activation occurred. Physical transport,
descriptor/report metadata, transaction ownership/deadlines, CBOR and trusted
PIN/UV/consent remain open; all stopped/denied gates and the full goal remain active.

Bounded native heading discovery now supports `--headings`, returning sanitized
h1–h6 titles and uniquely root-anchored selectors for a later `--section`, with
explicit path/syntax limits and no automatic follow-up. Independent review caught
and corrected selector collisions, parser-component overflow and non-2xx outcome
handling. All 250 new cases pass; the exact twelve-file matrix has 939 passes and
three unchanged selector failures reproduced on untouched base4f6a1e0. Build,
strict new-test typing and six-file Biome pass. `HEADING-DISCOVERY.md` preserves
initial failures and review provenance. Separate native GETs at September 5, 2026
22:59:53.320 and 23:00:34.562 UTC demonstrate 116 discovered headings followed by
24,455 USB HID section bytes using the exact returned selector, both still partial
and unverified. No raw-source locator fallback was needed. This does not clear
SDK, credential, socket/TTY or device gates; the complete browser goal remains active.

The native-browser BFCL web-search follow-up now distinguishes a curated 100-question
category, shared search/fetch tools, simulated failures and answer matching from
general production-agent reliability. `BENCHMARK-WEB-SEARCH.md` retains the page's
July 2025 version dates and fresh September 5, 2026 22:08:48.453 UTC receipt without
claiming latest-version status, benchmark execution or a model ranking. One
authorized native GET remains partial/extracted-unverified. Historical V3 evidence
and stopped Reddit/Astra/X lanes stay unchanged; browser and passkey gates remain open.

Linux hidraw report-byte normalization now distinguishes numbered/unnumbered reads
from always-ID-prefixed writes, with explicit 7–64-byte metadata, strict IDs and
owned bounded buffers. The exact four-file synthetic native scope passes 225 cases,
including 83 new cases; build, strict types and two-file Biome pass. The separately
authorized native Linux-guide read at September 5, 2026 19:17:55.877 UTC remains
partial/extracted-unverified. `LINUX-HIDRAW-REPORTS.md` preserves that evidence and
the unresolved Node/ioctl/readiness, descriptor, permissions and ownership gates.
This is not a device driver or passkey completion. Browser heading discovery is
also still cumbersome for large pages despite bounded section extraction; improve
that agent-facing workflow without raw-source fallback or raised limits. The full
goal and all previously denied/stopped gates remain unchanged.

Pure FIDO HID INIT allocation now constructs broadcast nonce requests and parses
bounded nonce-correlated responses, rejecting reserved assigned channels and
preserving opaque CIDs, versions/capabilities and extension bytes. The exact
three-file synthetic native scope passes 142 cases, including 64 new allocation cases;
build, strict types and two-file Biome pass. `FIDO-HID-ALLOCATION.md` retains the
historical native-browser source and separates correlation from device trust.
No provider/device was activated. Descriptor/report-ID discovery, entropy,
channel ownership, deadlines, resync/CANCEL/CBOR and trusted human PIN/UV/consent
remain required. All denied/stopped gates stay unchanged; overall goal is active.

Bounded native heading-section extraction now supports `--section CSS` and a
native-reference core option, preserving source/document/output ceilings and
pre-selection barrier checks. All 172 new cases pass; the ten-file matrix has
752 passes and three unchanged selector failures reproduced on untouched HEAD.
Build, strict new-test typing and five-file Biome pass. A separate offline native
probe retains full extraction failure while reading the USB HID section; a fresh
native GET at September 5, 2026 18:55:21.811 UTC extracts 24,455 bytes, still
partial/extracted-unverified. `HEADING-SECTION-EXTRACTION.md` preserves the older
failed receipt, distinct response digests and exact limits. Review identified and
fixed excluded sibling enumeration; final-code offline replay matches the earlier
live extraction without a new request or relabeling that receipt. CTAP2 transaction,
device/report-ID/channel/cancellation and human credential/passkey gates remain
open; denied/stopped lanes remain unchanged. The complete browser goal stays active.

Native external-authenticator work now has builtin-only FIDO HID packet framing
and a bounded owned-message assembler, with 78 new synthetic native cases passing
across two named suites. Build/strict types and four-file Biome pass. A fresh
historical U2F HID source read supports the framing; a separate CTAP2 retrieval
failed native extraction and is not treated as equivalence evidence.
`FIDO-HID-FRAMING.md` keeps actual device access, descriptors/report IDs, nonce
allocation, transaction ownership/deadlines/cancellation, CTAP2 commands and trusted
human PIN/UV/consent as open prerequisites. No hardware provider was activated,
software substitute presented as hardware, dependency installed or denied gate
reopened. The complete browser/passkey goal remains active.

The browser-only MLCommons power follow-up is recorded in
`BENCHMARK-POWER-BOUNDARIES.md`. Its separately captured guide distinguishes
system-supply measurement and range discovery from testing; it does not measure
hardware efficiency or settle complete official power boundaries. The fresh
September 5, 2026 13:18:07.541 UTC receipt remains partial/extracted-unverified.
This durable note adds no request, benchmark run or acceptance claim.

The native research browser now supports bounded `--lines START:END` selection
from unchanged loaded plain-text/JSON documents, with exact line/span metadata,
existing output caps and pre-selection barrier checks. All 174 new native cases
pass; the eight-file matrix has 580 passes and three unchanged selector assertion
failures independently reproduced on HEAD. Build/types and six-file Biome pass.
`TEXT-LINE-EXTRACTION.md` records the new source eligibility/shape boundary and
remaining HTML/source-mapping limits. An authorized offline saved-DOM probe keeps
full extraction failing at the original cap while extracting five selected lines.
A separate fresh native GET at September 5, 2026 13:25:32.086 UTC extracts lines
5494–5520 from that large source, still partial/extracted-unverified. The original
12:52:51.535 UTC failed extraction is not rewritten. The complete browser goal,
foreign namespaces, real credential/passkey/device gates and denied/stopped lanes
remain open or stopped as previously recorded; this is not whole-browser parity.

HTML elements now reflect namespaceURI/localName/prefix, and Document/Element
provide bounded live namespace/local-name queries with case-sensitive matching,
wildcards, normalized nullable namespaces and shared collection accounting.
The clean seven-file native scope passes 178 cases (63 new); build/types and
four-file Biome pass. A separately authorized original-SafeJS namespace probe
passes 28 checks with full cleanup. `HTML-NAMESPACE-QUERIES.md` records the
HTML-only boundary: foreign construction, namespace-aware node modeling,
serialization, selectors, controls and rendering remain required before SVG or
MathML parsing can be enabled. An offline ordinary-loader replay also confirms
the saved Fetch Standard exceeds 50,000 nodes; no limit or historical result
was changed. DOM source capture succeeded but extraction failed, so normative
inspection is explicitly local raw-source analysis. The overall goal stays open.

The native-browser BFCL prompt-format follow-up now has a durable research note
in `BENCHMARK-FORMAT-ROBUSTNESS.md`. It separates representation robustness from
executed task success and records a prose/caption ordering conflict rather than
inventing a winner. One captured, hash-verified HTTP 200 read remains partial and
unverified; historical source dates are not current rankings or reproduced scores.
This documentation adds no benchmark execution or new acceptance claim.

The default host pass runner now requests cancellation of its owned POSIX process
group, with captured-PID admission, direct-child fallback, idempotent cleanup and
late-event guards. Agent constant references, origin checks and sealed-session
output isolation are unchanged. The clean native scope passes 296 cases across
four files, including 43 new default-runner cases; two targeted baseline failures
confirm the previous gap. A separately authorized synthetic Linux executable and
helper were both observed absent after cancellation, with generic rejection;
this is not real pass/GPG/vault or universal descendant-cleanup acceptance.
`PASS-RUNNER-CANCELLATION.md` records the Windows fail-closed default, best-effort
limits, source research and exact evidence. Build/types/Biome pass. All existing
passkey, credential, runtime and stopped research gates remain open or unchanged;
the overall browser goal remains active.

Native loader failures now carry optional, private-identity resource diagnostics
with an enumerated kind, unit, configured limit and observed count. Reader, text,
HTML parser/tokenizer and selected central document checks retain their budgets,
messages, cancellation precedence and cleanup. The clean 13-file native matrix
passes 529 cases (110 new), with no failures or skips; builds and strict new-suite
types pass. `LOADER-RESOURCE-DIAGNOSTICS.md` records partial instrumentation,
measurement semantics and validation evidence. A separately authorized offline
replay of the previously captured Fetch Standard hits reader.text at 1,057,108
UTF-16 units against 1,000,000; it makes no new request and does not rewrite the
original failed extraction. One authorized native NVIDIA known-issues follow-up
adds captured, partial hardware research, not measured performance or a purchase
recommendation. Existing denied/stopped runtime, credential, device, Reddit,
Astra and X gates remain unchanged. The overall browser goal remains open.

Native fetch now follows explicitly published, document-owned signal capabilities
through request/preflight/redirect cancellation and unread buffered response clones.
Registry quotas, private native followers, state-shadowing rejection, factory
ownership, source/binding closure and late accounting are covered by 80 new cases;
the nine-file clean native matrix passes 232 tests with no failures or skips.
Isolated build, strict tests and four-file Biome pass. `PAGE-FETCH-SIGNALS.md`
records host embedding via fetchSignals, buffered-body choices, retained failures
and the undeployed guest constructor/EventTarget/reason-identity/Streams work.
One native Fetch-standard read captured verified bytes but failed its loader limit;
bounded raw-source analysis is separate, not a rewritten extraction success.
No SafeJS/socket/device/credential probe or previously denied gate was reopened.
The complete browser goal and all outstanding acceptance requirements remain open.

An isolated public SafeJS host-constructor contribution now enables explicit
construct-only live capabilities, stable per-realm identity, retained arguments,
owner-context checks and direct/bound/adapter copy/replay rejection. Candidate and
pristine replay each pass 234 cases across eight named SDK files, including 103
new cases; scoped builds/types and new-file format/import checks pass. The
adversarial thenable fixture retains its intentional lint diagnostic, and all earlier
fixture failures remain recorded. `contributions/safejs-host-constructors.md`
states the narrower ownership guarantee and graph/continuation limitations.
The separate built-runtime probe was denied and not executed or retried; explicit
user approval is required. This is not selected SDK integration or deployed
AbortController/MutationObserver support, and it is not yet combined with guest
bytes. One native BFCL memory followup supplies historical research only. Existing
denied gates and the complete browser goal remain open; work continues elsewhere.

Native page User Timing now supplies mark/measure, ordered entry queries and
type/name clearing on the shared performance object, with bounded JSON-detail
snapshots, retained-handle accounting and close revocation. All 177 new cases pass;
the six-file clean matrix is 341 passed/two pre-existing binding-fixture failures,
independently reproduced unchanged. Build/strict types/scoped Biome pass. The final
actual original-SDK probe passes 85 checks including persistent guest/native DOM
state and cleanup; 680 SDK file hashes remain unchanged. `USER-TIMING.md` preserves
initial results, the earlier 85-check source/build checkpoint, primary spec reads
and explicit partial-profile limits. One native BFCL V4 article followup remains
benchmark research, not browser acceptance. Constructors, observers, general
structured clone, live application, credentials/device and other gates remain
open; no denied gate is reopened and the overall browser goal stays active.

Native research now has opt-in `--capture-body`: bounded exact primary decoded
bytes, independent canonical-base64/count/SHA256 validation, and retention through
barriers and loader/extraction failures without weakening navigation policy.
The clean scoped matrix passes 355 cases (138 new), with build/project/strict
types and scoped Biome passing. `NATIVE-RESEARCH.md` documents unsanitized-body
privacy, payload limits and incomplete replay/provenance semantics. Five fresh,
separately authorized native captures verify byte counts/digests with closed
transports. `RESEARCH-CAPTURE-2026-09-05.md` records hardware, benchmark and
public-post findings without treating partial extraction as verified source truth.
The X lane stopped conservatively at login chrome; no second post was requested.
Reddit denial and the official announcement barrier are not retried or bypassed.
Full/native runtime, live interoperability, device/vault and release acceptance
gates remain open; the overall browser goal stays active.

Independent verification now covers the actual guest-observed synthetic passkey
ceremony: separately parsed CBOR/COSE, RP/client-data/ID/flags/counters and ES256
signatures, with observed-signature and signed-client-data tamper rejection.
Both unchanged isolated SDK roots pass 32 actual probe checks with cleanup and
independentCryptoVerification=passed. The new native verifier suite passes 143
cases in both working and clean snapshots; scoped strict/types/build/Biome pass.
`PASSKEY-CRYPTO-VERIFICATION.md` records fixture restrictions, conservative
result-export accounting, review fixes, separate authorizations and preserved
historical evidence. No private key or provider-side public key supplies the
verification. Device/synchronized keys, real UV/consent, persistence, live sites
and default SDK integration remain open; the overall seven-day goal stays active.

An isolated SafeJS persistent-byte contribution now registers real guest
ArrayBuffer/Uint8Array/DataView, integrates graph copying/reflection/quotas and
rejects unsupported binary persistence explicitly. Candidate and pristine
two-patch replay each pass 682 cases across 22 named SDK files, with scoped
types/builds/Biome passing. Six independent review findings have targeted fixes
and regression coverage. `contributions/safejs-persistent-guest-bytes.md` records
the implementation, full-backing authority, initial failures and limitations.
Both isolated runtimes also pass the separately authorized actual synthetic
passkey bridge: 24 checks covering create/get, typed rejection and cancellation
cleanup. The browser probe now uses four required explicit returns; no SDK
semantics or authentication policy was changed to manufacture acceptance.
That byte-integration checkpoint did not independently verify cryptography; the
later verifier above now covers its synthetic ceremony. Physical/synchronized
keys, real user verification, persistence and live-site interoperability remain open.
The original selected SDK, historical failed probes and denied identity/wire/
parent-RP gates remain unchanged. This is an unselected, unpublished SDK
contribution, not deployed full passkey support. The overall browser goal stays
active; release integration and the other seven-day gates remain outstanding.

A dormant SDK binary-storage contribution now provides intrinsic-slot validation
and budgeted full-backing copies for native ArrayBuffer/Uint8Array/DataView.
The two additive upstream files are not selected by the browser or installed as
guest values. Separately authorized candidate and pristine patch-replay runs
each pass 64 cases across exactly two SDK unit files; focused types/build and
Biome pass. The 27-case baseline, 25-fail/11-pass explicit stub and intermediate
63-case run remain distinct. `contributions/safejs-binary-storage-foundation.md`
records whole-backing authority, private memo lifetime, retained-accounting gaps
and remaining interpreter/marshalling/digest/snapshot integration. Original SDK
and failed passkey evidence remain unchanged; no denied identity, wire or parent-RP
gate is reopened. The overall browser goal remains active.

Passkey byte investigation identifies a missing SDK-owned guest byte model,
not a browser setting: selected @poe-code/safe-js 0.0.1 has limited Float32 support
but lacks the required ArrayBuffer/Uint8Array/DataView contract. The actual
runtime failure remains unchanged. Two pre-existing host defects—overridable
view metadata and raw factory-publication errors—now have focused hardening:
99 buffer and 69 publication cases pass; six named suites total 356 passes in
each tree, with types/builds/strict/Biome passing. The unchanged old code fails
138 of the same 168 cases and passes 30; four existing suites pass 188 cases.
`PASSKEY-BYTE-BRIDGE.md` preserves the findings, initial fixture failures and
separate actual-runtime/device requirements. Exact isolated patch checks exclude
pending parent-RP work and preserve all prior deltas; no denied gate is reopened.

Native media now preserves unknown through Boolean composition, converts it
only at the public matches boundary, and distinguishes false unknown media
types from unknown feature conditions. All 129 new parser and 61 page cases
pass; nine named suites total 675 passes in each tree, with types/builds, strict
tests, formatting and scoped Biome passing. The unchanged old compiler fails
100 of those 190 cases and passes 90; its seven existing suites pass 485 cases.
`MEDIA-LOGIC-2026-09-05.md` records separate native evaluation/grammar evidence,
source review and preserved initial fixture/harness failures. Full lexical,
recovery and serialization conformance remains open. Existing page-test import
ordering is unchanged; no guest/device or denied-gate acceptance is inferred.

Unsupported-media fallback now retains its exact diagnostic without letting
that warning alone block supported native page/intrinsic layout and painting.
All other CSS/formatting admission and coordination checks remain. Thirty new
cases pass; eight named suites total 388 passes in each tree, with types/builds,
strict tests, formatting and test Biome passing. The unchanged old admission
fails 21 of the same 30 cases and passes nine. Existing source import-order
diagnostics remain separate and unchanged. `MEDIA-FALLBACK-2026-09-05.md`
preserves that evidence, initial harness failures, and thirteen bounded native
offline Error Handling scopes. At that checkpoint, unknown truth tables,
media-type negation and recovery remained open. The separate change above
addresses the first two; full MQ conformance/recovery remains outstanding.
Historical measurements and denied auth/runtime/wire gates are unchanged.

Numeric color media now implements an explicit partial logical RGB policy:
color8, color-index0 and monochrome0, sharing unchanged exposed Screen depth24.
Signed decimal literal, negative/large-value and existing range behavior pass
243 parser cases and 28 page/raster cases; nine named suites total 533 passes in
each tree, with types/builds/strict/Biome passing. The old parser independently
fails 103 of the 243 unit cases and passes 140; that snapshot is preserved.
Gamut, computed CSS integer math and physical or
normative headless-device conformance are not inferred. `BROWSER-IDENTITY.md`
records that boundary; all denied auth/runtime/wire gates remain untouched.

Color-media definitions are now admitted by a separate direct native offline
extraction: thirty scopes, with all prior failures preserved.
`COLOR-MEDIA-CONTRACT-2026-09-05.md` records integer range/negative semantics,
component versus palette/monochrome depth and separate gamut behavior. A separate
authorized native CSS Values read admits the signed-decimal literal grammar;
static review supports only an explicit partial logical RGB policy, not a
physical or normative headless claim. The bounded policy is implemented and
tested above without inferring device/gamut capability from RGBA storage.
Computed-integer,
runtime/device and full conformance gates remain open; no production behavior
changes belong to this research checkpoint.

Adjacent table-end accounting now retains one bounded source table suffix
instead of treating optional cells/rows/groups as ever-deeper nesting. It does
not discard wrappers/formatting or cross nested tables, and the final native
DOM guard remains essential for implicit containers. `NATIVE-RESEARCH.md`
records the scope: 148 new cases and 632 passes across nine named suites in
each tree, plus types/builds/strict/scoped checks. The old reader independently
fails 111 of the same cases and passes 37; its snapshot is retained. An offline
replay now loads the unchanged Media Queries body and extracts only its heading,
with zero new requests and no normative color-contract claim. The live receipt in
`COLOR-MEDIA-RESEARCH-2026-09-05.md` remains unchanged. Color-media consistency,
general table recovery and separately authorized live/guest/device gates remain
open; the overall browser goal remains active.

Native Screen work exposes a stable, lifecycle-checked viewport-backed capability
with six readonly values and unknown/private 24-bit depth. The logical exposed
area is not a physical display; DPR 1 and absent client-window outer dimensions
remain unchanged. `BROWSER-IDENTITY.md` records the explicit policy, unsupported
color/device media and deferred full Screen/WebIDL/guest/device acceptance.
All 34 new synthetic cases pass in both trees. Eight named suites produce
287 passes plus three reproduced baseline failures in the isolated tree and
292 passes plus four in the working tree; types/builds/strict/scoped checks pass.
The directly superseded screen-absence assertion is updated, not the unrelated
cleanup/global-list/onload failures. No full manifest or denied RP, identity
runtime, wire, device or actual guest gate ran; those approvals remain open.

Native Camoufox architecture research is preserved in
`CAMOUFOX-ARCHITECTURE-2026-09-05.md`: three actual native-browser requests,
217 partial scopes and original-body/build/source integrity checks. Adopt only
truthful consistency and host/page separation lessons; retain our independent
engine and SafeJS-only runtime. Upstream maintenance/detectability caveats are
explicit. No detector, challenge solver, Firefox/Xvfb, SDK or device acceptance
was attempted, and missing property-schema/version evidence remains open.

Scoped research CLI extraction now accepts one bounded native `--selector CSS`,
requires exactly one root and preserves original response/source provenance.
Header barriers precede loading; title and bounded visible-prefix diagnostics
precede selection, with selected-text classification afterward. This prevents
the tested benign-root masking cases without claiming exhaustive barrier
detection or confirmed access. `NATIVE-RESEARCH.md` records the contract and
limitations. The selector, reader, output, query, challenge, extraction, depth
and document-profile suites pass **605 cases across eight files in each tree**,
including 118 new regressions. Types/builds/strict/scoped checks pass; an offline
captured-body replay extracts a unique heading without raising the output limit.
The original live receipt remains distinct from replay. Full-native,
live scoped CLI, SafeJS, credentials and denied RP/identity gates remain open.

Standalone location: `~/project/agent-browser` as of September 3, 2026.
`MIGRATION.md` records the preserved history, independent tooling and native
validation boundary. Keep making atomic commits for completed new work; do not
push unless requested. The original browser scope and acceptance gates remain.

Started: September 1, 2026, approximately 14:58 UTC.
Original work window: through September 4, 2026, approximately 14:58 UTC.
Extended September 3: continue for seven more days, through September 10, 2026,
approximately 17:42 UTC. `SEVEN-DAY-PLAN.md` defines the current priorities and
acceptance gates without reducing the requested browser scope.
Status: active; foundation work, not a completed browser.

September 5 continuation: the user requested four days of native-browser research,
constant-reference password providers (`.env`, `pass`), passkeys, fingerprint
consistency and Cloudflare challenge investigation. `FOUR-DAY-AUTH-RESEARCH.md`
records the September 5–9 focus without shortening the existing September 10
overall window. Four browser-only research rounds have now run; blocked pages,
unverified social snippets and native SVG/CSS failures remain explicit, not
successful content-access claims. Credentials have synthetic validation and
passkeys now have encrypted local persistence. Real vaults and platform
authenticators remain unexercised; the actual SafeJS passkey probe failed and
the separate identity runtime probe awaits explicit approval.

Scope additions confirmed by the user: cover all Kitesurf features, provide a
playground comparable to `https://kitesurf.cloudflare.app/`, and make the agent
interface a Playwright-CLI-like superset. `COMPATIBILITY.md` is the explicit
feature ledger. "Better than curl" is the first milestone, not the final gate.

## Latest checkpoint

Native headless display defaults now expose DPR 1 and outer width/height 0,
sharing the DPR with CSS resolution and session viewport scale metadata while
keeping the logical layout viewport independent. Forty-four new cases pass in
each tree. The seven-file matrix retains independently reproduced failures:
253 passes/three baseline failures isolated, 258 passes/four baseline failures
working. Types/builds, strict touched-test types and scoped checks pass; this is
not a full green suite. `BROWSER-IDENTITY.md` records the exact stale assertions,
copied-scalar versus Window lifecycle limits and remaining Screen/zoom/guest
gates. The candidate manifest has 439 entries, with two extra pending parent-RP
entries only in the working tree. No physical display, challenge success or
denied-probe acceptance is claimed; the parent-RP commit still awaits approval.

Native-only CSSOM followup now provides the previously missing DPR/Screen/window
contracts. `CSSOM-IDENTITY-2026-09-05.md` records one successful request using the
already committed reader, 138 bounded live/offline scopes and preserved body
identity against the older failed receipt. It separates physical-device facts
from viewport-based exposed geometry and defines future native/runtime gates.
This documentation enables no geometry API, parent-RP scope or denied probe.

Native reader definition lists now account for optional dt/dd siblings without
false cumulative depth. Formatting reconstruction, genuine nesting, scope
barriers and unchanged resource ceilings remain guarded. Sixty-two new cases
yield 482 passes across eight named files in each tree; types/builds, strict
touched-test types and scoped Biome pass. The candidate manifest has 438 entries;
the working manifest has two additional pending parent-RP entries, excluded
from this validation and commit. `NATIVE-RESEARCH.md` records the regression-first
failures and byte-identical offline replay of a separately captured CSSOM page.
The parent-RP commit and both identity probes still require explicit approval.

Native-browser-only followups resolved the actual linked WHATWG RP predicate,
including its caller-public-suffix guard and ordinary same-origin redirect.
`PASSKEY-RP-BOUNDARY-2026-09-05.md` preserves the original failures, later scoped
source reads, timestamps and hashes rather than relabeling historical results.
This is research evidence only. The tested parent-RP expansion remains
uncommitted after its focused commit was denied; explicit informed user approval
is required before committing or activating that broader credential scope.
Neither identity probe is reopened by these source reads.

Explicit pinned-snapshot admission now verifies exact copied PSL bytes before
creating an immutable, module-branded matcher. Seventy-two new cases plus the
existing PSL suites yield 421 passes across three named files in each tree;
types/builds, strict new-test types and scoped Biome pass. The manifest has 437
entries. `PUBLIC-SUFFIX.md` separates approved-byte identity from freshness,
distribution and caller eligibility. This factory alone enables no permissions;
the parent-RP implementation and its origin-aware approval review remain in work.

A captured MDN page exposed a concrete reader bug: four inert `<?>` markers
were rejected as malformed declarations. The reader now recovers only that exact
token span, preserving issue accounting, malformed-input rejection and every
resource limit. Twenty-six new regressions yield 330 passes across six named
suites in each tree; types/builds, strict touched-test types and scoped Biome
pass. `NATIVE-RESEARCH.md` separates the original failed live capture from the
successful fixed offline replay. No new live fixed-browser or denied-probe
acceptance is claimed, and the manifest remains 436 entries.

Two acceptance boundaries remain explicitly closed: the newly prepared native
HTTP identity wire probe was denied pending specific user approval for its
loopback socket/listener, and the earlier actual SafeJS identity probe remains
separately denied. `BROWSER-IDENTITY.md` records that no new wire attempt ran.
Native-only WebAuthn RP research also produced no readable normative source:
`PASSKEY-RP-POLICY-2026-09-05.md` preserves resource/loader failures and the local
selected-RP/hash integration hazard. Offline PSL success grants no parent-RP
permission. The goal remains active; safe source work and named native tests
continue without retrying denied probes.

The complete pinned PSL source, preserved upstream license and same-revision
official vectors now have offline admission coverage. All 10,321 ICANN/PRIVATE
rules are admitted; 103 new cases include all 78 official vectors. Four named
suites yield 481 passes in each tree, with types/builds, strict new-test types and
scoped Biome passing. `PUBLIC-SUFFIX.md` and `vendor/public-suffix/README.md` record
exact provenance and limits; the manifest has 436 entries. This source-only
fixture enables no runtime permission: trusted distribution, update policy and
separate RP-ID/cookie/hardware acceptance remain outstanding.

Native hardware research now preserves a source-backed comparison procedure
separating prefill, depth-specific decode, serving concurrency, prompt-cache
effects and actual memory fit. `HARDWARE-BENCHMARK-PROTOCOL-2026-09-05.md` records
five attempts, four official documentation reads and 31 verified artifact
checksums. No benchmark, model download, installed-tool qualification or hardware
ranking is claimed; earlier measurement evidence remains unchanged.

Eighteen page-passkey regressions now verify actual native-document origins,
foreign-base/page-option spoofing resistance, pending URL invalidation and
provider-buffer isolation for create/get. Five named suites yield 237 passes
in each tree; types/builds, strict touched-test types and scoped Biome pass.
`PASSKEYS.md` preserves the separate synthetic page-adapter evidence. No
production change or runtime/device acceptance is inferred; the manifest remains
435 entries and outstanding browser/authenticator gates remain open.

A dependency-free public-suffix matcher now supports bounded trusted PSL text,
PRIVATE rules, wildcard/exception handling and canonical IDNA results. Its 246
cases plus existing broker/cookie suites produce 378 passes across three named
files in each tree; types/builds, strict test types and scoped Biome pass. The
manifest has 435 entries. `PUBLIC-SUFFIX.md` explains why incomplete data can
still produce unsafe exact matches: neither parent-RP nor Domain-cookie policy
is widened. Complete pinned data, notices/provenance, update handling and separate
consumer acceptance remain outstanding. Static review and 43 artifact checksum
checks support this isolated foundation, not full browser or hardware acceptance.

Passkey provider contexts now receive detached exact client-data bytes alongside
their SHA-256 hash. Twenty-four new cases plus four existing named suites yield
219 passes in each tree; types/builds, strict touched-test types and scoped Biome
pass. The explicit manifest has 434 entries. `PASSKEYS.md` records copy isolation,
nondefault-port origin preservation and backward compatibility. This addresses
one hardware-bridge prerequisite, not Windows Hello, actual SafeJS byte support,
device access or broader RP-domain permission. The goal remains active.

Native-only hardware-passkey research identifies a real external-key milestone
and concrete resident-ID, client-data, PIN/TTY and cancellation blockers.
`PASSKEY-HARDWARE.md` records nine attempts and five upstream manuals, with 17
verified artifact checksums. Neither checked FIDO command resolved in PATH;
nothing was installed or executed and no device/account was accessed. libfido2
is not an approved new dependency. Exact client-data transport and reviewed
public-suffix/RP handling are separate implementation followups, not hardware
acceptance claims.

Three further native-read Astra/X post bodies clarify the retrieved rollout,
benchmark and alignment claims without verifying product authenticity, access or
performance. `ASTRA-PROVENANCE-2026-09-05.md` preserves four new invocations,
September 3 displayed dates with unknown timezone, and the September 5 retrieval
window. All 37 saved checksum entries passed independent verification. Earlier
blocked routes and original research counts remain unchanged.

The regular CLI now supports an explicit partial reader profile with provenance
notices and fail-closed runtime/credential incompatibility checks. Forty-seven
new cases pass; seven named suites produce 360 passes in each tree, with scoped
checks and types/builds passing. A separately authorized fresh real loopback
service also completed eight CLI commands and one HTTP-200 Example Domain read,
then exited cleanly with its private runtime removed. `CLI.md` and
`NATIVE-RESEARCH.md` separate this narrow service/HTTP evidence from actual SafeJS,
real-vault, platform-authenticator and broad website gates. The manifest has 433
entries; original evidence and failures remain intact.

Reader provenance now survives snapshots, extraction, search and native command
dispatch, with plaintext warnings and metadata included in byte limits.
`NATIVE-RESEARCH.md` records 34 new cases and 190 passes across seven named suites
in each tree; types/builds and scoped checks pass. The manifest has 432 entries.
This is synthetic native-output validation; subsequent CLI reader-profile
service evidence is recorded separately, not retroactively included here.

A new native-only benchmark round retrieves six relevant extractions across five
works in eight attempts. `BENCHMARK-METHODOLOGY-2026-09-05.md` records contamination
test assumptions, explicitly excluded difficulty-estimation costs and uncertainty
limits, with primary-source/version attribution. All 31 saved checksums passed
independent verification. An unrelated seed and infrastructure failure remain
recorded; no new model evaluation, missing equation or ranking is inferred.

Explicit `AGENT_BROWSER_LANGUAGES` preferences now flow through native CLI hosts
and validated child-session initialization, with frozen canonical snapshots before
resource creation. `BROWSER-IDENTITY.md` documents defaults and existing-service
semantics. All 45 new cases pass; seven named suites produce 203 passes in each
tree, with types/builds, strict changed-test types and scoped Biome passing.
The manifest has 431 entries. Mocked configuration tests are not actual SafeJS,
process-isolation or guest navigator acceptance. The denied identity-runtime
gate still requires explicit user approval.

A separate native Reddit followup remains blocked: one previously unvisited,
source-linked thread returned HTTP 403 after an infrastructure-only retry.
`BROWSER-RESEARCH-2026-09-05.md` records two new invocations separately from the
original research, with 23 independently verified saved checksums. There are
still zero verified Reddit opinions/posting dates; browsing stopped at denial.

The configuration-to-form credential path now has 18 additional actual-file
synthetic checks: protected `.env`/JSON files, symlink/hardlink and permission
rejection, explicit rotation, and confidential native submission. Six named
suites produce 324 passes in each tree; types/builds and scoped checks pass.
`SECRET-PROVIDERS.md` distinguishes this real-filesystem synthetic evidence from
real vault, `pass`, live-site and runtime acceptance. The manifest has 429 entries.

An explicit host-only persistent passkey factory now connects encrypted storage
to registration/assertion publication, saves counters before returning results,
and rejects further ceremonies after uncertain writes. Reopening still requires
per-ceremony approval; UV stays false. `PASSKEYS.md` and `PASSKEY-STORAGE.md` retain
the rollback, key provisioning, recovery, trusted UI and actual runtime gates.
All 41 new persistence cases pass; seven named suites produce 359 passes in each
tree, with types/builds, strict new-test types and scoped Biome passing. The native
manifest has 428 entries, not a full-manifest pass. No real vault or live RP is
involved; the actual runtime and platform gates remain outstanding.

The native reader now counts adjacent optionally closed paragraphs/list items
without false nesting, while retaining actual nesting limits and identical
serialized output. `NATIVE-RESEARCH.md` records 32 new cases and 496 passes across
nine named suites in each tree, with types/builds and scoped checks passing.
The manifest remains at 427 entries. This is synthetic evidence only; earlier
live CSSOM loader failures have not yet been superseded by a completed follow-up.

Another browser-only hardware round retrieves seven readable measurement sources
in eight attempts. `HARDWARE-MEASUREMENTS-2026-09-05.md` preserves submitted rates,
missing/null metadata, workload mismatches and failed concurrency streams rather
than claiming a controlled ranking or purchase recommendation. Saved checksums
were independently verified; previous research counts and evidence remain intact.

The encrypted checkpoint file backend now has exclusive lifetime locks,
protected-file checks, verified atomic/fsynced publication and poisoned-instance
failure handling. `PASSKEY-STORAGE.md` records 58 new passing cases and 318 passes
across six named suites in each tree, with types/builds and scoped checks passing;
the native manifest has 427 entries. Actual private synthetic `/tmp` fixtures are
distinguished from earlier modeled ancestry. The later factory connects
save-before-result publication; real vaults, rollback/recovery and human approval
remain open.

Managed native sessions now coordinate truthful User-Agent/language defaults with
document-owned navigator identity while preserving explicit request overrides.
`BROWSER-IDENTITY.md` records 111 new passing cases and 328 passes across ten named
files in each tree; types/builds and scoped checks pass, with 426 manifest entries.
The actual SafeJS identity probe was denied pending explicit user approval and
must not be retried or worked around. Guest language-array stability/immutability,
custom-language child-process plumbing and production fingerprint/challenge
acceptance remain open. Non-runtime development continues.

An internal encrypted passkey checkpoint codec now preserves bounded P256 records
behind an explicit host-only encryption key. `PASSKEY-CHECKPOINTS.md` distinguishes
authenticated encryption and owned-buffer cleanup from still-unimplemented durable
counter updates, rollback protection, recovery, real approval and page-runtime
acceptance. All 65 new cases pass; five named suites produce 260 passes in each
tree, with types/builds, strict test typing and scoped checks passing. The native
manifest now has 423 entries. No agent-facing private-key export or ambient vault
discovery is added.

A separately authorized actual legacy SafeJS passkey gate now fails explicitly:
the selected experimental SDK lacks guest Uint8Array and ArrayBuffer constructors.
Shared credentials identity and Promise availability pass the diagnostic, and
owners close cleanly; registration/assertion/cancellation remain unverified.
`scripts/check-passkeys-runtime.ts` and `PASSKEYS.md` preserve the bounded manual
gate and original failure evidence without importing another engine, patching the
SDK or retrying a denied release download. Secure persistence, human approval and
released-runtime acceptance remain active work, not completed browser features.

Confidential-command review adds 13 regressions without a production change:
five named credential suites pass 306 cases in each tree, including 51 security
cases. Types/builds and strict test typing pass. `SECRET-PROVIDERS.md` records
the deliberately hostile-thenable lint exception and the unchanged live/runtime
security gates; no universal noninterference or timing guarantee is claimed.

Native research now conservatively recognizes the observed Poe login redirect
using the actual response URL and paired continuation markers. All 46 new cases
pass; seven named files yield 333 passes in each tree, with types/builds and scoped
checks passing. A separate authorized September 5, 03:16:54 UTC native-reader
request confirms a possible-login barrier, not authenticated content access.
`NATIVE-RESEARCH.md` preserves the new evidence separately from historical rounds;
the 422-entry manifest, actual SafeJS and real-provider gates are unchanged.

Native passkey ceremonies now connect an explicit trusted provider to
`navigator.credentials` through PageBindings/PageScripts options. `PASSKEYS.md`
documents exact-host HTTPS/RP binding, challenge handling, lifecycle cancellation,
public byte ownership and the registration-provider trust boundary. The optional
Node provider performs real ephemeral ES256 signing behind mandatory host approval;
it does not claim user verification, platform hardware or durable/synced keys.
All 195 new cases pass; ten named files yield 293 isolated passes and 298 working
passes plus the independently reproduced old non-callable-onload failure.
Types/builds, strict new-test types and scoped checks pass. Both manifests contain
422 entries. Real human-approval UI, secure persistence/recovery, actual SafeJS and
live relying-party acceptance remain priority gates, not completed features.

`BROWSER-RESEARCH-2026-09-05.md` now provides a durable four-topic synthesis of
133 native-browser topic attempts across two rounds, with four parent probes
kept separate. Its 32 source entries, 89 support checks and 164 stored checksums
were audited against saved extractions. Round two reached vendor specifications,
benchmark papers/methodology, nine dated X posts and five official Poe pages.
No dated Reddit thread body was verified, no comparative hardware speed/value
ranking was measured, and no production account entitlement or challenge bypass
was established. These research gaps and reader fidelity limits remain explicit.

### Prior research checkpoint

Opt-in native semantic research reading and challenge diagnostics now have
119 new passing cases and 287 passes across seven named files in both trees,
with project types/builds and scoped checks. `NATIVE-RESEARCH.md` preserves the
normal loader, reader omissions and new live evidence: Apple specifications
were read; the OpenAI announcement returned a confirmed Cloudflare challenge
and was not bypassed. Failure response metadata now survives parser errors.
Both manifests contain 418 entries. Four second research rounds used this
native reader; report paths remain separate from earlier measurements.
`BROWSER-FINGERPRINTING.md` records native capability gaps and reference-tool
architectural differences, not a production challenge-solving claim. Passkey
page integration and a durable native-only research synthesis remain in progress.

### Prior credential checkpoint

Reference-only credentials now support explicit `.env` and `pass` providers,
private CLI configuration and exact HTTPS origin binding. `SECRET-PROVIDERS.md`
documents the deliberately confidential session boundary: `fill-secret` seals
agent inspection before resolving a password, clears trace/export caches, and
allows only fixed action acknowledgments until close. Focus/beforeinput retyping
regressions are fixed at the native password-fill commit boundary. All 293 new
credential cases pass. The 14 named suites yield 509 isolated passes and 510
working passes plus one independently reproduced pre-existing element-offset
capability assertion; it is not hidden or fixed here. Types/builds and focused
checks pass. Both manifests contain 416 entries. Real vault/process/SafeJS and
post-login declassification gates remain open. Passkey core/page-adapter and
research-reader work is separate pending integration.

### Prior normalization checkpoint

Ordinary Text normalization now transfers removed-member and parent-before-member
range endpoints into the surviving Text node using private frozen metadata.
`NORMALIZE-RANGE-TRANSFER.md` records 83 new passing cases and 861 passes across
29 named files in each tree, project types/builds/scoped checks and native command
captures. All eight literal endpoint cases pass in both actual roots; 48 retained
PNGs preserve six baseline failures and two controls, with 1,600 changed pixels
only inside caret/highlight regions. Public records, scene geometry and CSS/
geometry counters retain baseline behavior; legitimate selection paint changes
are explicit. Both manifests contain 411 entries. Interior element carets,
arbitrary early native-listener ordering, unrestricted normalize reentry and
original full-native/runtime/live gates remain open. Historical checkpoints
below retain their original scope and measurements; pending work stays excluded.

Live ranges now acquire missing ancestor links when previously detached tracked
nodes enter new parents. `LATE-RANGE-ATTACHMENT.md` records 54 new passing cases
and 778 passes across 26 named files in each tree, types/builds/scoped checks and
independent complete raster comparisons. Script/container/fragment and fake-timer
details batching preserve correct logical indices without endpoint-reset masking.
Both manifests retain 408 entries. Normalize removed-member/parent-boundary
transfer, interior element-boundary carets, arbitrary early native-listener
ordering and original full-native/runtime/live gates remain open. No unrelated
pending work or command-capture acceptance is included.

Normalization now appends following text instead of whole-replacing the surviving
node, preserving its existing range offsets even on repeated no-op calls.
`NORMALIZE-SURVIVOR-RANGES.md` records 61 new passing cases and 642 passes across
21 named files in each tree, types/builds/scoped checks and independent complete
raster-buffer comparisons. Both manifests retain 405 entries. This is explicitly
only the survivor prerequisite: ranges in removed members and parent-before-merge
boundaries still require transfer. General late-attachment tracking, early native
listener ordering, prior imports and original full-native/runtime/live gates
remain open. No command capture or external acceptance is implied.

Direct native splitText now transfers live text/parent endpoints through shared
private mutation metadata; the canonical wrapper no longer restores stale
snapshots over native listener edits. `SPLIT-TEXT-RANGES.md` records 113 new passing
cases, 741 passes across 24 named files in each tree, types/builds/scoped checks
and 48 exact canonical/new-build PNGs; 64 images retain broken-baseline evidence.
Detached clamping, late attachment, following edits/removal and unchanged public
payloads are checked. Both manifests retain 402 entries. Normalize transfer,
general early native-listener ordering, prior imports and original full-native/
runtime/live gates remain open. No unrelated pending work is bundled.

Direct native CharacterData edits now preserve live ranges using private exact
operation metadata, matching existing owner/script wrapper behavior.
`CHARACTER-DATA-RANGES.md` records 93 new passing cases, 480 passes across sixteen
named files in each tree, types/builds/scoped checks, and 48 matching reference/
new-build captures; 64 PNGs retain broken-baseline evidence. Prepared layout
correctly repaints current selection without unnecessary revision or CSS work.
Both manifests retain 399 entries. Direct native split and normalize range
transfer, existing import diagnostics and original full-native/runtime/live
gates remain open. Public mutation payloads and pending work stay unchanged.

Native requestIdleCallback/cancelIdleCallback now use bounded software
opportunities, timeout fallback and two-phase callback ownership. `IDLE-CALLBACKS.md`
records 89 new passing cases, 263 isolated passes and 268 working passes plus one
independently reproduced pending onload failure across ten focused files.
Types/builds/scoped checks pass; factory-selected cancellation is repaired before
runtime startup. Both manifests retain 396 entries. Active evaluations remain
conservatively busy, so awaiting idle without positive timeout is a documented
limitation. Actual SafeJS, real idle scheduling, full-native/browser/live gates
and prior import diagnostics remain open. No unrelated pending work is bundled.

Native checkbox/radio accent-color now shares inherited declaration/CSSOM state
and an opaque, contrast-aware light-profile palette. `ACCENT-COLOR.md` records
115 new cases, passing 743 isolated / 744 working tests across twenty-one focused
files, types/builds/scoped checks and 48 native captures. All sixteen new-build
image pairs match; 3,916 changed pixels stay inside actual widget interiors.
Defaults, disabled/unchecked states, geometry and actions remain unchanged.
Both manifests retain 394 entries. Draft-derived currentcolor CSSOM serialization
has a documented historical WPT discrepancy; interoperability remains open.
Original full-native/browser/runtime/live gates and prior import diagnostics
remain outstanding. Historical reports and unrelated pending work are preserved.

Native controls and existing editable caret anchors now honor bounded CSS
caret-color, including inherited/current/auto colors, alpha and transparency.
`CARET-COLOR.md` records 116 new cases, passing 999 isolated / 1,000 working tests
across twenty-nine focused files, static/build/scoped checks and 54 native
captures. All eighteen new-build pairs match; only 176 intended caret pixels
change against explicitly documented default-CSS baselines. Both manifests
retain 392 entries. Existing import-order diagnostics and original full-native,
browser/runtime/live gates remain open; caret geometry/animation is not expanded.

Native root-scroll extent bounds now reuse intact presentation-only journals;
real dimensions, control values and lost/mixed history still rescan.
`ROOT-SCROLL-EXTENT-CACHE.md` records 34 new cases, passing 505 / nineteen-file
focused suites in both trees, static/build checks and 54 identical native
captures. Root/control sample scans fall eleven-to-two and six-to-one while CSS
counters stay unchanged and geometry remains current. Both manifests retain 390
entries. This is not layout caching or timing/RSS acceptance; original full-native,
browser/runtime/live gates remain open and historical evidence stays preserved.

Native root scrolling now reuses computed CSS without suppressing revision,
geometry, hit or pixel updates. `ROOT-SCROLL-CSS-CACHE.md` records 35 new cases,
passing 471 / seventeen-file focused suites in both trees, source/build/scoped
checks and 54 identical native captures. A bounded ten-action fixture reduces
completed cascades from eleven to two, retaining both genuine CSS-input rebuilds.
This does not cache layout or establish timing/RSS performance. Both manifests
retain 388 entries; denied full-native and original browser/runtime/live gates
remain open, with historical evidence and pending work preserved.

Native caret-only notifications now preserve computed CSS caches while keeping
document revisions and fresh values/selection pixels. `STYLE-PRESENTATION-CACHE.md`
records 42 new cases and passing 585 / nineteen-file focused suites in both trees.
The original styles-cache regression passes unchanged; older reports retain their
historical failure counts. Types/builds/scoped checks pass, 54 native captures
match exactly, and bounded identity/cascade samples confirm conservative reuse.
Both manifests retain 386 entries. Existing import-order diagnostics, denied full
native execution and all original browser/runtime/live acceptance gates remain open.

The legacy word-wrap name now shares canonical overflow-wrap cascade and CSSOM
state without duplicate longhands or declaration entries. `WORD-WRAP-ALIAS.md`
records 57 new passing cases; fifteen-file runs retain 582 isolated / 583 working
passes and the same reproduced baseline styles-cache failure. Types/builds and
scoped checks pass; ten alias captures match canonical output byte-for-byte.
Existing import-order diagnostics remain explicit. Both manifests retain 384
entries. Original browser/runtime/live gates remain open.

Ordinary inline text now supports bounded overflow-wrap emergency breaking with
grapheme preservation and correct anywhere/break-word intrinsic differences.
`OVERFLOW-WRAP.md` records 138 new passing cases, 939 isolated / 940 working passes
across twenty-four focused files with the same independently reproduced baseline
styles-cache failure. Types/builds/scoped checks pass; 180 default layouts remain
identical and ten native capture comparisons pass. Both manifests retain 382
entries. Full CSS/shaping/runtime/live gates and the overall browser goal remain open.

Native textarea Up/Down now follows shared visual rows, retains the preferred
column through short lines and supports anchored Shift movement. Reentrant
same-offset pointer resets survive caret notification. `TEXTAREA-VERTICAL-NAVIGATION.md`
records 100 new cases, passing 1,027 / thirty-two-file focused suites in both trees,
scoped static/build checks and sixteen native capture comparisons. Both manifests
retain 379 entries. Following-row affinity, logical Home/End, stateless widget
scrolling and all original browser/runtime/live gates remain explicit limitations.

Focused native controls now extend from their owned anchor on captured Shift-click,
including reverse selections and handler changes to live modifiers. Atomic owner
publication avoids an intermediate caret. `CONTROL-SHIFT-SELECTION.md` records
80 new cases, passing 816 / twenty-six-file focused suites in both trees, scoped
static/build checks and twelve native capture phases matching both builds.
Default coordinates/modifiers are snapshotted before handlers can override event
properties. Both manifests retain 376 entries. General drag/word/contenteditable pointer
selection, persistent widget scrolling and original browser/runtime/live gates stay open.

Primary mouse points now place native text-control carets using the displayed
texture and shared hit geometry, with focus-change safeguards and masked
code-point boundaries. `CONTROL-POINTER-CARETS.md` records 108 new cases, passing
736 / twenty-three-file focused suites in both trees, static/build checks and
twelve-phase native capture comparison. Both manifests retain 373 entries.
Pointer dragging/Shift-extension, persistent widget scrolling, full selection
APIs and the original browser/runtime/live gates remain open. Root disk pressure
was mitigated by verified snapshot relocation, not unrelated evidence deletion.

Native text controls now show keyboard selection, collapsed carets and bounded
focus-edge scrolling through one authoritative owned record, without fake
document Ranges or raw password metadata. `CONTROL-TEXT-SELECTION.md` records
143 new cases and passing 781 / twenty-one-file focused suites in both trees,
plus passing types/builds/strict checks and scoped Biome. Twelve-phase native
captures preserve state/boxes and match both builds byte-for-byte. Both manifests retain
370 entries. Full public control selection, pointer placement, persistent widget
scrolling, broader editing and the original runtime/live gates remain open.

Empty editor/paragraph carets now use shared font struts at actual placed blocks,
without placeholder DOM, fake glyphs, added layout lines or changed public Range
geometry. `EDITABLE-EMPTY-CARETS.md` records 88 new cases, passing 833 / twenty-six
file focused suites in both trees, types/builds/strict checks and ten-phase native
captures. Raster formatting passes; its one pre-existing parameter-assignment
lint failure remains explicit. Both manifests retain 366 entries. Natural empty
block height/pointer targeting, general caret affinity, full visual editing and
the original browser/runtime/live gates remain open. No denied full suite is run.

Direct paragraph caret checkpoint: `EDITABLE-PARAGRAPH-CARETS.md` keeps native
nonempty paragraph splits and host outer-edge select-all collapse visibly aligned
through direct p/div paragraphs. Public endpoints and Range geometry remain
unchanged. Sixty new cases and 609 / nineteen-file focused suites pass in both
trees with passing types/builds and scoped checks. Nine-phase captures change only
expected caret pixels; the working replay matches the isolated build exactly.
Both manifests retain 363 entries. Empty/general element carets, full visual
editing, full-suite authorization and all original external/browser gates remain
open; the existing denial is not retried or replaced with a broad filtered suite.

Live response-accounting checkpoint: `FETCH-BYTE-ACCOUNTING.md` integrates an
opaque document-owned ledger through the actual session fetch port. Concurrent,
failed and gzip-expanded native streams debit observed bytes before retention;
cancelled native consumers retain bounded lease capacity until actual drain.
Four new files add 122 cases; both focused suites pass 561 / seventeen files with
passing types/builds, strict checks and scoped Biome. Both manifests retain 361
entries. Newly guarded callback-only route tests have separate authorization;
the denied full suite is not retried or replaced. Future-allocation reservations,
unknown custom-provider traffic, RSS proofs, XHR and all external/runtime/browser
gates remain open. Earlier accounting-gap reports below remain historical.

Element-boundary painting checkpoint: `EDITABLE-ELEMENT-ENDPOINTS.md` connects
native Control/Meta select-all to glyph highlights and supports exact outer-edge
carets after ArrowLeft/Right without changing public Range endpoints. Ninety new
module cases and four native-host cases pass; final focused suites pass 384 /
thirteen files in both trees. Types/builds, strict changed-test checks and scoped
Biome pass. Fresh nine-phase selection and six-phase caret comparisons preserve
DOM/geometry/state and change only expected pixels. General element caret geometry,
controls/IME/full visual editing and all original browser gates remain open.
Both manifests retain 357 entries; full-suite authorization remains pending after
the recorded denial, with no broad filtered substitute or gated probe attempted.

Next native networking work: the preserved cache report
`parallel-fetch-accounting-9e5578a/REPORT.md` reproduces concurrent and failed-stream
page-accounting gaps with five matched in-memory stream fixtures. Its shared byte
ledger and bounded native-drain ownership design is not implemented; completed
page bodies, observed transport bytes, reservations and custom-provider coverage
must remain distinct. Existing response ceilings are not a total-allocation claim.

Native fetch-budget continuation: `FETCH-RESPONSE-BUDGETS.md` adds exhausted-page
admission checks and propagates narrowing response ceilings through the actual
session port to encoded/decoded native stream collection and routed responses.
Accessor/signal closure cannot admit work after owner shutdown. Both focused runs
pass 408 / twelve files; project types and explicit builds pass. Full-manifest
approval was denied before execution and is not retried or replaced with a broad
filtered suite. Both manifests retain all 355 entries; prior full counts remain
historical. Full-suite acceptance awaits explicit authorization. Page-level
concurrent reservations and rejected partial-stream accounting remain open, as do
XHR and all separately authorized runtime/live/transport/terminal acceptance gates.
Element-endpoint editable highlighting continues as an independent native lane.

Positioned-paint acceptance checkpoint: `POSITIONED-PAINT-ACCEPTANCE.md` integrates
nineteen native pixel/order/hit regressions from the independent outline-gap review.
Both focused runs pass 182 / five files; strict checks and scoped Biome pass. No
production rendering/parser change is justified or made. The prior full native
counts remain historical; this new explicit test joins the next combined run.
Network budget admission and backend response ceilings remain ongoing work, not
completed XHR or closed external/runtime gates.

Mixed-node highlight continuation: `EDITABLE-SELECTION-MIXED.md` maps text-endpoint
ranges across inline/block descendants while checking protected intermediate nodes.
Thirty-nine worker tests plus one actual-host replacement/cancellation/scroll case
are integrated; focused validation passes 271 / ten files in both trees. Twelve
module images and fresh host comparisons are inspected; only expected selection
pixels change. Full native validation passes 11,056 / 328 isolated files and
reports 12,187 passes with the same fifteen pending failures / 350 working files.
Both manifests contain the same 350 entries, with 22 preexisting uncommitted test
files absent from the archive. Independent pixel/order inspection resolves the
suspected root-scroll overlap as visible text in an unfilled outline-offset gap:
all 850 opaque border/outline pixels remain intact in both PNGs. No production
stacking change is justified; pixel equivalence alone is not CSS conformance.
Element endpoints and original
runtime/live/transport/terminal/browser gates remain open.

Continuation authorization: on September 4 the user requested continued work until
told to stop. The earlier five-hour checkpoint is not a new stop condition or a
reduction of the seven-day browser objective. Native Range lifetime hardening is
integrated; resumed workers are extending mixed-node highlighting and fixing
the independently reproduced exhausted-fetch-budget admission defect. Standard
XHR publication remains blocked by the inspected public runtime constructor and
live-property contract, not replaced with a spoofable factory alias.

Range lifetime checkpoint: `EDITABLE-RANGE-LIFETIME.md` releases private synchronous
Range registrations after replacement, paragraph insertion and content operations,
including exceptions and nested allocation failure. Public detach, selected Range
identity and the 4,096-live-Range cap are unchanged. Nine new tests include seven
reproduced old quota-cleanup failures. Verified focused tests pass 287 / eleven
files; types/builds, strict checks and four-file Biome pass. Full native validation
passes 11,016 / 327 isolated files and reports 12,147 passes with the same fifteen
pending failures / 349 working files. Eleven fresh before/after host PNGs and all
geometry/paint/state measurements are identical. No gated probe or dependency.

Sprint handoff: `FIVE-HOUR-SPRINT.md` records the September 4, 17:48 UTC native
delivery assessment, eight-worker contributions, exact manifest/archive distinction
and remaining work. Source checkpoint `6a29502` matches the tested isolated archive
across 987 non-report committed files. This is not full browser completion or
authorization to retry gated probes; outstanding gates below remain authoritative.

Selection highlight checkpoint: `EDITABLE-SELECTION.md` paints bounded same-text
focused editable selections through the existing glyph order. Native Shift+Arrow,
replacement, canceled input, terminal carets and fixed/root scrolling compose in
actual-host tests. Ten fresh module captures and combined before/after selection
frames were inspected; only selected backgrounds change in the eleven-phase
comparison. Focused validation passes 209 / ten files; types/builds, strict checks
and scoped formatting pass. Explicit native suites pass 11,007 / 326 isolated
files; working validation reports 12,138 passes with the same fifteen pending
failures / 348 files. Mixed-node/control selection, complex editing and original
runtime/live/transport/terminal acceptance gates remain open. All eight distinct
workers/reviewers are closed after delivery; no twenty-agent concurrency claim.

Terminal caret checkpoint: `EDITABLE-CARET-BREAKS.md` paints exact same-source
preserved-break endpoints through the existing prior-glyph paint position. Focused
tests pass 177 / nine files; types/builds, strict checks and scoped Biome pass.
Five inspected module captures and independent combined host comparisons show
only the two new terminal caret columns changing. Explicit native suites pass
10,975 / 325 isolated files and report 12,106 passes with the same fifteen pending
failures / 347 working files. Empty/all-break editors, general affinity and original
acceptance gates stay open.

Upload lifecycle checkpoint: `UPLOAD-LIFECYCLE.md` guards begin acknowledgements
against intervening target invalidation and prevents manager/retained-owner closure
from resuming attachment. Four reproductions fail against the preceding archive
and pass after the fixes. Core focused tests pass 197 / six files and extended
CLI checks pass 267 / nine files. Combined explicit native suites pass 10,942 / 324
isolated files and report 12,073 passes with the same fifteen pending failures
/ 346 working files. Types/builds, strict tests and scoped formatting pass.
Original socket/service/runtime/live/terminal gates remain open.

Focus setup lifetime checkpoint: `FOCUS-LIFECYCLE.md` prevents an in-progress
registration pool escaping reentrant document/runtime teardown. Four first/final
registration cases fail on the preceding archive and pass with the guarded
delegation; both focused runs pass 214 / ten files. Types/builds, strict checking
and scoped formatting pass. Combined full-suite validation follows the upload
lifecycle integration; no new runtime/live/terminal acceptance is inferred.

Editable caret checkpoint: `EDITABLE-CARET.md` paints existing collapsed shared
selection at determinate focused editable glyph edges, respecting native paint
order, crops, source color and fixed/root scroll. Focused tests pass 144 / eight
files; types/builds, strict checks and scoped formatting pass. Six native captures
and the combined host showcase are inspected; only caret pixels differ from its
before snapshot. Explicit native suites pass 10,934 / 322 isolated files and report
12,065 passes with the same fifteen pending failures / 344 working files. Empty/
terminal-break carets, highlights, IME and original runtime/live/terminal acceptance
remain open.

Range geometry checkpoint: `RANGE-GEOMETRY.md` adds guarded immutable client/bounding
rectangles from shared layout, with exact preserved-break source mappings. Actual
native commands test plaintext/rich editing, shared Range identity and fixed/root
scroll behavior. Focused tests pass 158 / seven files; types/builds, strict checks
and scoped Biome pass. A fresh 27-fixture comparison preserves prior geometry and
pixels, with work recorded separately. Explicit native suites pass 10,900 / 321
isolated files and report 12,031 passes with the same fifteen pending failures
/ 343 working files. Broader geometry, caret/highlight painting and original
acceptance gates remain open.

Paragraph merge checkpoint: `EDITABLE-BLOCK-MERGE.md` joins bounded adjacent rich
p/div siblings through Backspace/Delete, preserving left-block/inline identities
and typing at the shared Range join. Beforeinput, focus/selection, mutation and
abort guards remain authoritative. Focused tests pass 246 / seven files; types,
builds, strict tests and scoped Biome pass. Four inspected native command captures
retain fixed geometry/root scroll and identical canceled pixels. Final explicit
native suites pass 10,838 / 317 isolated files and report 11,969 passes with the
same fifteen pending failures / 339 working files. Complex editing
and original runtime/live/terminal acceptance remain open.

Upload checkpoint: `UPLOAD-COMMANDS.md` joins real CLI/private-file handling,
canonical chunk protocol, host/session queue and shared file selection. Genuine
CLI-to-host native fixtures cover visible multipart submission, stale capture,
queued/event interruption and lost commit replies without claiming rollback.
Four fresh v2 command captures retain fixed geometry/root scroll. Final focused
tests pass 348 / ten files; types/builds, strict checks and scoped Biome pass.
Explicit native suites pass 10,748 / 315 isolated files and report 11,879 passes
with the same fifteen pending failures / 337 working files. Chooser/guest File APIs,
actual socket/service authentication and original runtime/live gates remain open.

File-control rendering checkpoint: `FILE-CONTROL-RENDERING.md` adds visible native
file inputs using existing owned metadata without payload reads or owner creation.
Parent actual-host double-click tests now use visible file inputs for reset and
multipart submission; a fixed-control test preserves scrolled geometry/pixels.
Direct-file picker intent is explicitly unimplemented by the host. Focused suites
pass 166 / seven files, types/builds/strict checks and scoped Biome
pass, and three fresh native captures are inspected. Final explicit native suites
pass 10,517 / 309 isolated files and report 11,648 passes with the same fifteen
pending failures / 331 working files. Production upload wiring,
chooser/guest file APIs and original external acceptance gates remain open.

Public focus bridge checkpoint: `FOCUS-BRIDGE.md` binds final guarded focus/blur
methods to setup-registered public await-result identities. Native fixtures cover
listener prefixes, reentry, cancellation, revocation and fixed-root geometry;
ordinary async APIs retain Promises. The default 8,192 registration calls per
enabled page and nonrecycled publication slots are explicit. Provisioning stress
covers four pool sizes through 4,096 slots without raising independent runtime
quotas. Focused suites pass 227 / ten files; source types/builds, strict test checks
and scoped format/Biome checks pass. Final explicit native runs pass 10,493 / 308
isolated files and report 11,624 passes with the same fifteen pending failures /
330 working files. Released-SafeJS execution, URL constructors and original
browser/live/terminal gates remain open; configuration is not execution evidence.

Paragraph checkpoint: `EDITABLE-PARAGRAPHS.md` integrates bounded rich Enter,
Shift+Enter and plaintext LF insertion through actual native command routing.
Four inspected fixed-editor captures retain geometry/root scroll; cancellation
retains identical pixels and shared selection. Focused tests pass 204 / seven
files; types/builds, strict checks and scoped Biome pass. Explicit native suites
pass 10,451 / 306 isolated files and report 11,582 passes with the same fifteen
pending failures / 328 working files. Paragraph merging and original browser,
released-runtime, live and terminal gates remain open.

Static-position performance checkpoint: `POSITIONING-PERFORMANCE.md` integrates
per-pass anchor reuse for equivalent adjacent out-of-flow siblings without
raising budgets. Fresh compiled-before/after measurements complete 1,000 matching
targets; all seven jointly completed cases retain full geometry hashes, and two
inspected native-module captures retain byte-identical pixels. Distinct flow slots
still reach the original resource limit. Focused runs pass 277 / eight files;
types/builds, strict test checks and full scoped Biome pass. Authorized full
native validation passes 10,374 / 304 isolated files; working validation reports
11,505 passes and the same fifteen pending assertion failures / 326 files.
General layout scaling
and the original browser/runtime/live gates remain open.

Runtime-selection checkpoint: `RUNTIME-SELECTION.md` wires explicit legacy/
extension configuration through actual CLI/host/process/child factory boundaries.
Legacy remains default; readiness is labeled contract-shape-only, not execution.
Parent connected-client cases confirm that client settings do not reconfigure
the service. Focused runs pass 228 working / 226 isolated tests across twelve
files; the difference is two preexisting CLI-parser tests. Types/builds, strict
checks and scoped format/lint pass. Authorized full native runs pass 10,347 /
303 isolated files; working validation reports 11,478 passes and the same fifteen
pending assertion failures / 325 files. Public focus scheduling, URL constructors,
released-runtime/process/live/socket/terminal gates remain open; no probe ran.

Native double-click checkpoint: `DOUBLE-CLICK.md` connects actual CLI/host/session
dispatch to two guarded click defaults and one dblclick event. Own document
navigation reports interruption without replay; unsupported defaults remain
explicit. Three parent cases cover fixed scrolling and hidden-file reset/submit
integration. Focused runs pass 135 / six files; types/builds, strict test checks,
scoped formatting/lint and two inspected native command captures pass. Authorized
full native validation passes 10,216 / 298 isolated files; working validation
reports 11,347 passes and the same fifteen pending assertion failures / 320 files.
Visible
file controls, word selection, runtime/live/socket/terminal gates remain open.

Native file-selection checkpoint: `FILE-SELECTION.md` connects one document owner
to required-file validation, safe fakepath getters, silent guest clearing,
accepted reset and fresh post-submit serialization. Sixteen parent tests cover
the integrated paths; focused runs pass 188 / eight files. Authorized full native
validation passes 10,106 / 294 isolated files; working validation reports 11,237
passes and the same fifteen pending positioning/capability/onload failures / 316
files. Types/builds, strict test checks and scoped formatting/lint pass.
The default submission
limit remains 1 MiB, and File/FileList, chooser/painting and production upload
CLI/host wiring remain open. Parallel workers now own authenticated upload-server
and private CLI-client wiring; no gated probe ran.

Native positioning checkpoint: `ABSOLUTE-FIXED-LAYOUT.md` integrates bounded
absolute/fixed layout, static fallback, shared paint/hit geometry and offsets.
Seven reproduced fixed-target root-scroll failures are fixed; nine parent tests
also cover display:contents and pre-wrap/editing. Focused runs pass 385 / nine
files; isolated full native validation passes 10,036 / 291 files. Working native
validation reports 11,167 passes and 15 failures: fourteen obsolete expectations
in preserved pending layout/capability tests plus the known onload assertion.
Two inspected command captures retain viewport-fixed geometry and focus scroll.
Static-position scaling is an active follow-up; unsupported CSS, runtime, live,
socket and terminal gates remain open. No gated probe ran.

Native editable-keyboard checkpoint: `EDITABLE-KEYBOARD.md` integrates shared-DOM-
selection typing, range replacement, directional deletion and logical movement.
Fill places the caret before input. Three parent regressions cover indication
overrides and post-edit focus round trips; the obsolete Space fixture now checks
actual insertion and unchanged scrolling. Both focused runs pass 484 / fifteen
files; types/builds, strict checks, formatting and scoped lint pass. Four inspected
native command captures show replacement, canceled typing and deletion at stable
geometry with retained text identity. Authorized full native runs pass 9,951 /
288 isolated files; working validation reports 11,096 passes and the unchanged
pending onload assertion failure / 310 files.
Paragraph insertion, visual caret, composition and original browser/runtime gates
remain open; no gated probe ran.

Playground extraction checkpoint: `PLAYGROUND-EXTRACTION.md` integrates bounded
Markdown/JSON/snapshot downloads through actual native commands, with strict
session/document/root-scope matching, metadata and stale-read/URL cleanup. All ten
example cards use selected-session navigation and explicitly unverified labels;
TodoMVC routes come from upstream source, not executed examples. Both focused
runs pass 190 / seven files; types, builds, strict new-test checks and scoped
format/lint checks pass with an existing import-order diagnostic kept separate.
Authorized full native runs pass 9,882 / 286 isolated files; working validation
reports 11,027 passes and the unchanged pending onload failure / 308 files.
Real UI/download, framework, socket and
released-runtime gates remain open; no gated probe ran.

Native pre-wrap checkpoint: `PRE-WRAP.md` integrates preserved-whitespace soft
wrapping, hanging, source ownership and intrinsic measurement. The previously
failing editable-fill capture now uses real pre-wrap and visibly preserves
indentation/newlines/literal text. Both focused runs pass 390 / ten files; types,
builds, strict changed-test checks, formatting and scoped lint pass, with the
preexisting text-layout import-order diagnostic retained explicitly. Authorized
full native runs pass 9,854 / 284 isolated files; working validation reports
10,999 passes and the unchanged pending onload failure / 306 files. Unicode/layout expansion, caret painting and original
browser/runtime acceptance gates remain open; no gated probe ran.

Native Range/Selection checkpoint: `DOM-RANGES.md` integrates live native ranges,
partial content operations and a document-owned selection with shared document/
Window/global identity. Parent adds five page-binding identity/lifetime tests;
focused isolated checks pass 448 / sixteen files, while working checks report
453 passes and the unchanged pending Window-onload failure / sixteen files.
Types, builds, strict new-test checking and scoped lint pass. Authorized full
native runs pass 9,809 / 283 isolated files; working validation reports 10,954
passes and the unchanged pending onload failure / 305 files. Raw-mutation gaps, constructors,
selection events, geometry, caret/highlight painting and rich keyboard editing
remain open. No gated probe ran and no live/runtime acceptance is claimed.

Native cookie-command checkpoint: `COOKIE-COMMANDS.md` integrates list/get/set/
delete with the existing session jar and actual command queue. The CLI fixture
now uses production dispatch and covers tabless sessions, cross-session isolation,
navigation headers and trace secret omission. Host-only/security policy remains
unchanged. Focused native runs pass 264 / eight working and 262 / eight isolated
files; types, builds, strict new-test checking and scoped lint pass. Authorized
full native runs pass 9,765 / 279 isolated files; working validation reports
10,910 passes and the unchanged pending Window-onload assertion failure / 301
files. Live login, sockets and runtime/browser acceptance
remain open; the previously denied SafeJS probe remains unrun.

Native focus-options checkpoint: `FOCUS-OPTIONS.md` integrates the parallel
worker's element focus/blur actions, preventScroll, explicit focusVisible and
shared root centering. Parent review added four failing indication-reentrancy
cases and fixed stale scrolling before validation. Final focused runs pass 315 /
seven files; types/builds, strict checking and four-file lint pass in both trees.
Authorized full native runs pass 9,733 / 277 isolated files; working validation
reports 10,878 passes and the unchanged pending Window-onload assertion failure /
299 files. Three inspected native captures show prevented scroll, centering with
forced-hidden indication, and subsequent keyboard indication. Browser-synchronous
page focus methods remain gated on the actual guest-call contract, not replaced
by a falsely compatible Promise-returning stub. Original browser/runtime gates
stay open; no gated probe ran and the denied SafeJS probe remains unrun.

### Previous editable-fill checkpoint

Editable-fill checkpoint: `EDITABLE-FILL.md` adds real native/command text
replacement for editable containers and descendants, with root focus, cancelable
input, guarded DOM replacement, mutation publication and async/command abort.
All 49 final new tests fail on prior HEAD; three cases also reproduced incorrect
event semantics during implementation. Focused runs pass 303 / eight files;
types/builds, strict checking and six-file lint pass in both trees. Authorized
full native runs pass 9,686 / 276 isolated files; working validation reports
10,831 passes and the unchanged pending Window-onload assertion failure / 298
files. Four isolated native command captures show literal replacement, cancellation
and clearing with stable geometry. Selection/caret, rich keyboard editing and
runtime/browser gates remain open. A pre-wrap capture exposed an existing formatting
gap; successful captures use pre-line explicitly. The user's five-hour parallel
sprint is tracked in `FIVE-HOUR-SPRINT.md`, ending approximately 19:10 UTC on
September 4. The browser goal is unchanged; no gated probe ran and the denied
SafeJS probe remains unrun.

### Previous editable-region checkpoint

Editable-region checkpoint: `EDITABLE-FOCUS.md` adds shared contenteditable state,
root-editor native focusability and page-facing contentEditable/isContentEditable
properties. Inheritance, false islands, explicit tabindex, focus indication,
keyboard scroll protection, lifetime and mutation revalidation have native tests.
All 53 new tests fail on isolated prior HEAD; matching focused runs pass 308 /
seven files. Types/builds, strict new-test checking and seven-file lint pass in
both trees. Inspected isolated native captures show keyboard and pointer outlines
without geometry changes, and their removal after an editability property write.
Authorized full native runs pass 9,637 / 275 isolated files; working validation
reports 10,782 passes and the unchanged pending Window-onload assertion failure /
297 files. Actual content editing and active-page focus/blur methods/options/callback integration
remain open, as do all original browser/runtime gates. No gated probe ran; the
denied SafeJS probe remains unrun. The seven-day goal remains active.

### Previous focus-visible checkpoint

Focus-visible checkpoint: `FOCUS-VISIBLE.md` adds indication-aware native selector
and stylesheet matching, keyboard/pointer state, script-transfer inheritance and
generated-header ring gating. Indication-only changes refresh query state without
pretending focus moved or canceling armed Space activation. Reentrant blur-driven
focus retains its scoped hint; stale hit/event targets are rechecked. All 70 new
tests fail on isolated prior HEAD; two of these blur cases also reproduced a
bug during implementation. Matching focused runs pass 442 / ten files; types/builds,
strict checking of five tests and thirteen-file lint pass in both trees. Authorized
final full native runs pass 9,584 / 274 isolated files; the working run reports
10,729 passes and the unchanged pending Window-onload assertion failure / 296 files.
Inspected 270 by 200 native command captures distinguish pointer focus, keyboard
indication without movement, and subsequent pointer transfer. Next: page focus
options/preferences and broader default focus behavior. Full editing, outline
shapes/3D patterns, UA/shadow/accessibility and original browser/runtime gates stay
open. No gated probe ran; the denied SafeJS probe remains unrun. Historical evidence
and unrelated pending work stay separate; the seven-day goal is active.

### Previous authored-outline checkpoint

Authored-outline checkpoint: `OUTLINES.md` adds stylesheet/inline parsing,
computed/command inspection and native block, inline-fragment and replaced-control
painting. Solid, dashed, dotted, double and native auto outlines support offsets,
variables, explicit inheritance and existing length math without expanding layout
geometry or hit targets. All 62 new tests fail on isolated prior HEAD; focused
runs pass 260 / eight isolated files and 261 / eight working files. Types/builds,
strict checking of both affected tests and ten-file lint pass in both trees.
Authorized full native runs pass 9,515 / 273 isolated files; the working run reports
10,660 passes and the unchanged pending Window-onload assertion failure / 295 files.
Inspected 260 by 270 native command captures show distinct patterns and Tab-driven
focus feedback with unchanged geometry. Next: focus-visible matching and input
modality. Richer outline shapes/3D patterns, full UA/shadow/accessibility, real
TTY/PTY, socket, browser UI, live sites, released SafeJS and original browser gates
remain open. No gated probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated pending work stay separate; the seven-day goal is active.

### Previous generated-style checkpoint

Generated-style checkpoint: `GENERATED-STYLES.md` exposes native fallback header
styles through the shared immutable factory used by formatting. The generated
profile reports inherited typography/color/visibility, initial box/paint defaults,
inside disclosure markers and pointer eligibility without aliasing host styles or
inventing DOM nodes or used geometry. All 31 new tests fail on isolated prior HEAD;
matching focused runs pass 165 / six files. Types/builds, strict new-test checking
and four-file lint pass in both trees. Authorized full native runs pass
9,453 / 272 isolated files; the working run reports 10,598 passes and the unchanged
pending Window-onload assertion failure / 294 files. Inspected in-memory native
Tab/Enter/style/geometry output confirms inherited focus changes, stable references,
auto-versus-used width and open markers. Next: broader authored focus feedback and
CSS outline/focus-visible behavior. Full UA/shadow/accessibility, live website,
real TTY/PTY, socket, browser UI, released SafeJS and original browser gates remain
open. No gated probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated pending work stay separate; the seven-day goal is active.

### Previous generated-interface checkpoint

Generated-interface checkpoint: `GENERATED-INTERFACES.md` shows actual expanded/
collapsed and document-focus state in terminal rows, separately from selection.
Ten new terminal cases reproduce the missing state on prior HEAD; five new
mounted-playground cases already pass and add integration coverage rather than
claiming a playground fix. Actual terminal-loop tests use mocked streams; mounted
playground tests use DOM fixtures and in-memory transport. They cover generated
activation, guarded keys, scoped search invalidation, crops and stale cleanup.
Matching focused runs pass 145 / six files. Types/builds, strict test checking and
three-file lint pass in both trees. Authorized full native runs pass
9,422 / 271 isolated files; the working run reports 10,567 passes and the unchanged
pending Window-onload assertion failure / 293 files. Inspected native projection
frames show stable references and correct state. Next: generated style inspection
and broader focus-style behavior. Real TTY/PTY, socket, browser UI, live websites,
released SafeJS, full UA/shadow/accessibility and original browser gates remain
open. No gated probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated pending work stay separate; the seven-day goal is active.

### Previous generated-inspection checkpoint

Generated-inspection checkpoint: `GENERATED-INSPECTION.md` adds immutable native
header document/client bounds, generated command geometry with null DOM sizes,
and target-specific screenshot crops. Focused headers have bounded inset visual
feedback without DOM/layout changes, with shared clipping, stacking and raster
budgets. The 37 new cases produce 30 failures and seven passes on isolated prior
HEAD. Matching focused runs pass 144 / eight files; types/builds, strict new-test
checking and five-file lint pass in both trees. Authorized full native runs pass
9,407 / 270 isolated files; the working run reports 10,552 passes and the unchanged
pending Window-onload assertion failure / 292 files. Native Tab/Enter command
sequences produced inspected full/cropped screenshots and matching generated
geometry. Next: terminal/playground generated-target integration coverage and
remaining focus/style behavior. CSS outline/focus-visible, authored focus rings,
generated style inspection, localization, scoped ordering, platform accessibility,
UA/shadow and original browser/runtime gates remain open. No gated probe ran;
the denied SafeJS probe remains unrun. Preserve historical measurements and
unrelated pending work; the seven-day continuation remains active.

### Previous generated-agent checkpoint

Generated-agent checkpoint: `GENERATED-AGENT.md` publishes separate fallback
snapshot entries, bounded scanning/search, scoped snapshots, unique role locators
and native command click/hover/targeted press/scroll support. Readiness and
execution both use the generated header rather than exposed host-body space.
Generated/ordinary focus identity and stale scroll-event targets are rechecked;
ambiguous locator generation never returns a host alias. The 51 new cases produce
40 failures and 11 passes on isolated prior HEAD. Matching focused runs pass
334 / 12 files; types/builds, strict checking of both new tests and ten-file lint
pass in both trees. Authorized full native runs pass 9,370 / 268 isolated files;
the working run reports 10,515 passes and the unchanged pending Window-onload
assertion failure / 290 files. Actual role-locator command activation and
full-page artifact reads produced inspected 280-by-160 native PNGs with matching
snapshot state. Next: generated geometry/cropped capture inspection and visible
focus feedback. Full platform accessibility, localization, scoped ordering,
UA/shadow and original browser/runtime gates remain open. No gated probe ran;
the denied SafeJS probe remains unrun. Historical evidence and unrelated pending
work stay separate; the seven-day continuation remains active.

### Previous generated-focus checkpoint

Generated-focus checkpoint: `GENERATED-FOCUS.md` adds canonical fallback focus
identity, default Tab/Shift-Tab traversal, native pointer focus and Enter/Space
activation while page focus and key events retarget the real details host.
Replacement, disconnection, inertness, owner close and same-host identity changes
invalidate held-key intent. Existing tests reproduced three intermediate
reentrant cleanup crashes; they now pass with added generated hidden/style cases.
All 49 new cases fail on isolated prior HEAD; matching focused runs pass
310 / eight files in both trees. Both pass types/builds, strict new-test checking
and eight-file lint. Authorized full native runs pass 9,319 / 266 isolated files;
the working run reports 10,464 passes and the unchanged pending Window-onload
assertion failure / 288 files. Next: generated semantic snapshot exposure and
agent/locator publication, including session target validation. Full scoped tab
ordering, focus rings, localization, UA/shadow/accessibility, runtime/browser
gates and the original browser scope remain open. No gated probe ran and the
denied SafeJS probe remains unrun. Preserve historical evidence and unrelated
pending work; the seven-day continuation remains active.

### Previous generated-activation checkpoint

Generated-activation checkpoint: `GENERATED-ACTIVATION.md` connects generated
fallback identity to native direct and primary-pointer activation, host-retargeted
events, real attribute/group/toggle state and header-only receiving points.
Cancellation, reentrant mutation, stale targets, body/header drags, quotas and
aborted pointer cleanup are covered. Two reproduced stale-mouseup regressions
no longer fall through to ancestor navigation. The 37 new cases produce 27
failures and ten passes on isolated prior HEAD; matching focused runs pass
277 / eight files in both trees. Types/builds, strict new-test checking and
five-file lint pass in both; actual native pointer before/after captures were
inspected. Authorized full native runs pass 9,270 / 265 isolated files; the working
run reports 10,415 passes and the one unchanged pending Window-onload assertion
failure / 287 files. Next: generated focus/tab order,
keyboard, semantic snapshots and agent/locator publication. Do not claim complete
accessible fallback or general CLI generated-reference support. The unchanged
pending Window-onload expectation conflict, runtime/browser gates and original
scope remain open. No gated probe ran; the denied SafeJS probe remains unrun.
Historical evidence and unrelated work remain separate; the seven-day goal stays
active.

### Previous generated-summary foundation

Generated-summary foundation: `GENERATED-SUMMARIES.md` adds bounded, document-owned
fallback targets with references distinct from DOM nodes, native labels/markers,
header-only geometry and generated hit metadata. It preserves real host DOM
queries, children, text, references and page-facing hit targets. Generated
availability, identity, quotas, layout budgets, scrolling and overlap/inertness
are covered by 38 new tests; all 18 rendering cases fail on isolated prior HEAD.
Focused runs pass 306 / eight files in both trees; types/builds, strict checking
of both new files and eight-file lint pass in both. A native PNG was inspected,
not a reference browser. Authorized full native runs pass 9,233 / 264 isolated
files; the working run reports 10,378 passes and the one unchanged pending
Window-onload expectation failure / 286 files. Next: wire generated
targets into click/default actions, focus/tab order, keyboard activation and
semantic/agent publication. The visible fallback is not yet an actionable
semantic control. Localization, full UA/shadow/accessibility and original
runtime/browser gates remain open. The pending Window-onload expectation conflict
stays unchanged; no gated probe ran and the denied SafeJS probe remains unrun.
Historical evidence and unrelated work stay separate; the seven-day goal remains
active.

### Previous object-handler checkpoint

Object-handler checkpoint: `HANDLER-OBJECTS.md` fixes shared handler conversion
to retain object-valued slots and listener ordering without invoking noncallable
objects or reading their properties. Reentrant replacements, primitive clearing,
proxy safety, quotas and revocation are covered. The 31 new cases produce 30
failures and one pass on isolated prior HEAD; all now pass. Types/builds, strict
new-test checking and two-file lint pass in both trees. Matching focused tests
pass 145 / six isolated files; working tests report 150 passes and one failure
in a pre-existing, uncommitted Window-onload expectation that objects clear the
slot. That pending work stays unchanged and outside this commit; the working
tree is not all green. Authorized full native runs pass 9,195 / 262 isolated
files; the working run reports 10,340 passes and that one failure / 284 files.
Continue generated
fallback-control identity/geometry/activation and remaining event interfaces,
without aliasing a fallback button to the entire details body or adding fake
light-DOM nodes. Complete runtime, UA/shadow/accessibility and original gates
remain open. No gated probe ran; the denied SafeJS probe remains unrun.
Historical evidence and unrelated work remain separate; the seven-day goal stays
active.

### Previous toggle-handler checkpoint

Toggle-handler checkpoint: `TOGGLE-HANDLERS.md` wires owned `ontoggle` properties
on event-enabled script elements/documents and the page window to the existing
handler registry and disclosure task queue. Tests cover listener ordering,
replacement/removal, coalescing, reentrancy, target identity, propagation, error
reporting, quotas and close revocation. The 24 new cases produce 21 failures and
three passes on isolated prior HEAD. Focused runs pass 178 / six working files
and 172 / six isolated files; types/builds, strict new-test checking and
three-file lint pass in both. Authorized full native runs pass 10,310 / 283
working files and 9,164 / 261 isolated files.
Continue missing-summary fallback and remaining event interfaces. Inline source/
attribute synchronization, full callback/prototype/global/trust semantics,
UA/shadow/accessibility, released-runtime and original gates remain open. No
gated probe ran; the denied SafeJS probe remains unrun. Historical evidence and
unrelated pending work stay separate; the complete seven-day objective is active.

### Previous disclosure-marker checkpoint

Disclosure-marker checkpoint: `DISCLOSURE-MARKERS.md` adds generated primary
summary markers through native formatting, hit testing and raster paths, without
fake DOM children or extra client rectangles. Two list-style longhands support
six marker types, inheritance/cascade and live CSSOM. Outside inline placement
is supported; outside block content fails explicitly. The 28 new cases produce
27 failures and one pass on isolated prior HEAD. Matching focused runs pass
258 / eight working files and 257 / eight isolated files; types/builds, strict
new-test checking and eleven-file lint pass in both. A native PNG contact sheet
was visually inspected, not a reference-browser screenshot. Authorized full
native runs pass 10,286 / 282 working files and 9,140 / 260 isolated files.
Continue missing-summary fallback and remaining
event interfaces. General lists/counters, full marker styling/placement,
UA/shadow/accessibility, released-runtime and original acceptance gates remain
open. No gated probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated pending work remain separate; the seven-day objective
stays active.

### Previous named-disclosure checkpoint

Named-disclosure checkpoint: `DETAILS-GROUPS.md` implements exact nonempty-name
exclusivity across opening, renaming, parser/subtree insertion, detached/template
roots, replacement, clone/import and native property reflection. Automatic
closure shares focus/layout/snapshot state and ordered toggle/mutation paths.
Paired notification preflight preserves state on quota failure; two reproduced
observer regressions establish the opener-view invalidation fix. The 50 new cases
produce 44 failures and six passes on isolated prior HEAD. Focused runs pass
323 / seven files in both trees; types/builds, strict new-test checking and
five-file lint pass in both. Authorized full native runs pass 10,258 / 281
working files and 9,112 / 259 isolated files. Continue generated summaries/
markers and remaining event interfaces. Full UA/shadow/accessibility,
task-source/trusted-event, released-runtime and original browser parity gates
remain open. No gated probe
ran; the denied SafeJS probe remains unrun. Historical evidence and unrelated
pending work stay intact; the complete seven-day browser objective remains active.

### Previous disclosure-toggle checkpoint

Disclosure-toggle checkpoint: `DETAILS-TOGGLE.md` adds document-owned asynchronous
toggle tasks with state coalescing, native script event data and bounded lifetime/
pending work. Attribute, initial creation, clone/import and template-owner paths
share the queue; preflight guards preserve state on quota failures. Primary
dispatcher/document close cancels pending and controlled in-flight work. The 36
new cases produce 33 failures and three passes on isolated prior HEAD. Focused
runs pass 219 / seven files in both trees; types/builds, strict new-test checking
and six-file lint pass in both. Authorized full native runs pass 10,208 / 280
working files and 9,062 / 258 isolated files. Next: named disclosure group
exclusivity across parser/insertion/name changes. Global ToggleEvent/prototype/
handler, generated summary/marker, full task-source/trusted-event/UA/accessibility and browser parity
remain open. No gated probe ran; the denied SafeJS probe remains unrun. Historical
evidence and unrelated pending work remain intact; the complete seven-day browser
objective and original acceptance gates stay active.

### Previous disclosure-core checkpoint

Disclosure-core checkpoint: `DETAILS-CORE.md` adds native details/summary body
collapse, click/Enter/Space activation, `open` reflection and snapshot expanded
state. Shared layout, hit testing and focus exclude collapsed content without
removing DOM nodes. Closing details or replacing its primary summary clears
newly hidden focus. The 38 new cases produce 36 failures and two passes on
isolated prior HEAD; formatter, structural-focus and property-reflection
regressions reproduce before their fixes. Focused native runs pass 301 tests /
eight files in both working and isolated trees. Both pass types/builds, strict
checking of the new and adjusted label test, and fourteen-file lint. The label
fixture explicitly opens details to keep its interactive descendant visible.
Authorized full native runs pass 10,172 / 279 working files and 9,026 / 257
isolated files; preceding runs fail only the corrected label fixture.
Continue with coalesced toggle-event scheduling and named disclosure groups;
generated summary/marker, full UA/shadow/accessibility behavior and real browser
parity remain open. Historical evidence and unrelated pending work remain intact.
No gated probe ran; the denied SafeJS probe remains unrun, and the complete
seven-day browser objective and original acceptance gates stay active.

### Previous element-focus checkpoint

Element-focus checkpoint: `ELEMENT-FOCUS.md` adds `tabIndex` and `inert`
properties, with HTML integer-prefix parsing shared by native tab order and
element-specific getter defaults kept distinct from actionability. Inert attribute
mutations now clear focus before observers see state, across property, attribute,
toggle and attribute-node paths. Shared selectors, keyboard, geometry and snapshots
have native coverage. All 84 new cases fail on isolated prior HEAD and pass after
implementation; an initial integration failure identifies the stale inert-focus
state before its correction. Focused runs pass 217 / six files in both trees;
authorized full native runs pass 10,134 / 278 working files and 8,988 / 256 isolated
files. Both trees pass types/builds, strict new-test checking and five-file lint.
Historical evidence and unrelated pending work remain intact. Continue application
compatibility; full platform focus/event fixups, shadow/modal semantics,
released-SafeJS, live browser/site/socket/TTY and original acceptance gates remain
open. No gated probe ran; the denied SafeJS probe remains unrun and the complete
seven-day browser goal stays active.

### Previous name-collection checkpoint

Name-collection checkpoint: `NAME-COLLECTIONS.md` adds live
`document.getElementsByName()` results with exact name matching, shared node
identity and mutation-sensitive membership. The common collection owner now
reserves pending publications, releases failed factory caches and revokes leaked
access without invalidating separately published nested collections. All 42 new
cases fail on isolated prior HEAD and pass after implementation. Focused runs
pass 147 / six files in both trees; authorized full native runs pass 10,050 / 277
working files and 8,904 / 255 isolated files. Both trees pass types/builds, strict
new-test checking and three-file lint. Historical evidence and unrelated pending
work remain intact. Continue application compatibility; full NodeList/foreign-
content semantics, released-SafeJS, live browser/site/socket/TTY and original
acceptance gates remain open. No gated probe ran; the denied SafeJS probe remains
unrun and the complete seven-day browser goal stays active.

### Previous nth-token checkpoint

Nth-token checkpoint: `NTH-TOKENS.md` replaces raw An+B substring matching with
token-aware parsing in the shared selector compiler. Comments, escaped units and
keywords, signed offsets and filtered-child `of` boundaries work across queries,
styles and feature queries. Non-CSS whitespace and invalid token fusion remain
false/invalid rather than accidentally accepted. Native sibling mutation,
specificity, geometry and raster checks retain existing resource bounds.
Seventy-nine new cases pass; isolated prior HEAD fails 63 and passes 16. Focused
runs pass 416 / six files in both trees; authorized full native runs pass
10,008 / 276 working files and 8,862 / 254 isolated files. Both trees pass types/
builds, strict two-test checks and three-file lint. Historical evidence and
unrelated pending work remain intact. Continue application compatibility; full
selectors, released-SafeJS, live browser/site/socket/TTY and original acceptance
gates remain open. No gated probe ran; the denied SafeJS probe remains unrun and
the complete seven-day browser goal stays active.

### Previous selector feature-query checkpoint

Selector feature-query checkpoint: `SELECTOR-SUPPORTS.md` adds native
`selector()` conditions to both `CSS.supports()` and stylesheet `@supports`.
The existing compiler checks one complex selector recursively without querying
nodes or allocating document indexes. Comment boundaries survive both paths;
invalid/unsupported syntax is false while resource-limit errors propagate even
through Boolean operands. Sixty-five new cases pass; isolated prior HEAD fails
36 and passes 29. Three comment regressions also fail before correction.
Focused runs pass 395 / six files in both trees; authorized full native runs pass
9,929 / 275 working files and 8,783 / 253 isolated files. Both trees pass types/
builds, strict three-test checks and eight-file lint. Historical evidence and
unrelated pending work remain intact. Continue application compatibility; font
queries, full selector grammar, released-SafeJS, live browser/site/socket/TTY and
original acceptance gates remain open. No gated probe ran; the denied SafeJS
probe remains unrun and the complete seven-day browser goal stays active.

### Previous CSS feature-query checkpoint

CSS feature-query checkpoint: `CSS-SUPPORTS.md` adds shared `CSS.supports()`
overloads and stylesheet `@supports` decisions, including Boolean conditions,
escaped identifiers and quoted preludes. Known rendering gaps remain false rather
than being advertised from syntax acceptance alone. Nested media/source order,
inactive-branch diagnostics and existing stylesheet quotas have native coverage.
Seventy-four new cases all fail on isolated prior HEAD, then pass; two prelude
regressions also fail before correction within this checkpoint. Focused runs pass
308 / five files in both trees; authorized full native runs pass 9,864 / 274
working files and 8,718 / 252 isolated files. Both trees pass types/builds, strict
three-test checks and nine-file lint. Approved relocation of 70 old browser
snapshots preserves their contents and paths through symlinks while resolving
scratch exhaustion; historical reports and unrelated work remain intact. Continue
application-facing APIs and compatibility. Full grammar, selector/font feature
queries, released-SafeJS, live browser/site/socket/TTY and original acceptance
gates remain open. No gated probe ran; the denied SafeJS probe remains unrun and
the complete seven-day browser goal stays active.

### Previous page CSS utility checkpoint

Page CSS utility checkpoint: `PAGE-CSS.md` exposes document-owned `CSS.escape()`
on global and Window bindings. Identifier serialization, primitive conversion,
independent input/output quotas and owner revocation have native coverage; object
coercion and `CSS.supports()` remain explicitly unsupported. Escaped identifiers
drive existing page queries, targeted DOM mutation and shared stylesheet/layout
matching without broadening selectors. Failed/reentrant publication is covered.
Fifty-one new native cases pass and all fail on isolated prior HEAD. Focused runs
pass 197 / four working files and 191 / four isolated files. Full authorized native
runs pass 9,790 / 273 and 8,644 / 251; both trees pass types/builds, strict two-test
checks and five-file lint. Approved deletion of a completed reproducible scratch
snapshot relieves disk pressure; reports, logs and unrelated work remain intact.
Continue application-facing APIs and compatibility; full CSS namespace/feature
queries, released-SafeJS, live browser/site/socket/TTY and original acceptance gates
remain open. No gated probe ran; the denied SafeJS probe remains unrun and the
complete seven-day browser goal stays active.

### Previous shorthand serialization checkpoint

Shorthand serialization checkpoint: `INLINE-SHORTHAND-SERIALIZATION.md` compacts
supported border/flex/gap families with preferred candidate ordering, compatible
priorities and no repeated overlapping components. Unrelated pending groups no
longer suppress ordinary compaction. A parser-admission guard preserves longhands
when combined shorthand output would be discarded, including existing margin/
padding cases. Shared CSSOM/layout and serialized-attribute clone/import boundaries
have native tests; no private style state is copied into clones. Thirty new cases
pass; twenty-six fail on isolated prior HEAD. Focused runs pass 253 / eight files
in both trees; authorized full native runs pass 9,739 / 272 working files and
8,593 / 250 isolated files. Types/builds, strict new-test checking and two-file
lint pass in both trees. Historical evidence and unrelated pending work remain
intact. Continue JavaScript application and native style compatibility; full
CSSOM/property coverage/cloning, released-SafeJS, real browser/site/socket/TTY and
original acceptance gates remain open. No gated probe ran; the denied SafeJS probe
remains unrun and the seven-day browser goal remains active.

### Previous ordered inline/reset checkpoint

Ordered inline/reset checkpoint: `INLINE-ORDER-ALL.md` preserves ordinary CSSOM
enumeration across shorthand compaction and expands `all` over supported native
longhands. Component replacement/removal affects shared geometry and paint;
custom properties survive resets. Order-sensitive ordinary projections use the
existing document quotas, while explicit attribute/`cssText` replacement adopts
serialized order. Twenty-two new cases pass; sixteen fail on isolated prior HEAD.
An existing background fixture now budgets expanded reset components, rather than
relaxing resource limits. Focused runs pass 147 / five files in both trees;
authorized full native runs pass 9,709 / 271 working files and 8,563 / 249 isolated
files. Both trees pass types/builds, strict two-test checks and five-file lint.
Historical reports and unrelated pending changes remain separate. Continue native
application compatibility; full CSSOM serialization/property coverage/cloning,
released-SafeJS, real browser/site/socket/TTY and original acceptance gates remain
open. No gated probe ran; the denied SafeJS probe remains unrun and the seven-day
browser goal remains active.

### Previous pending CSSOM state checkpoint

Pending CSSOM state checkpoint: `INLINE-PENDING-STATE.md` implements document-owned
expanded longhand slots, partial removal and lower-priority component replacement.
CSSOM, native style resolution, geometry and pixels share retained declarations;
same-text attribute replacement resets hidden slots, owner close preserves DOM
styles, and document close releases state. Frozen validation/admission, reentrant
publication and three retention quotas have native coverage. Shared shorthand
parsing and linear whitespace trimming remove repeated and quadratic work exposed
by the long-source regression. Thirty-five new cases pass; nineteen selected
existing-API cases fail before implementation. Seven related pending CSSOM cases
and custom-property capability metadata are integrated. Focused runs pass 253 /
seven working files and 201 / six isolated files; authorized full native runs pass
9,687 / 270 and 8,541 / 248. Both trees pass types/builds, strict three-test checks
and eleven-file lint. Historical evidence and unrelated pending changes remain
intact; approved scratch cleanup resolved disk exhaustion. Full serialization/
`all`/cloning parity, released-SafeJS, real browser/site/socket/TTY and original
compatibility gates remain open. Continue native CSSOM ordering and application
compatibility without calling fixture evidence a runtime or browser-equivalence
pass. No gated probe ran; the denied SafeJS probe is unrun and the seven-day goal
remains active.

### Previous inline CSSOM priority checkpoint

Inline CSSOM priority checkpoint: `INLINE-STYLE-PRIORITY.md` makes priority reads
independent of value serialization and removes empty/null-to-empty values before
invalid-priority rejection. Twenty-six new cases include pending shorthand
families, component precedence, cache revocation and shared geometry/raster
invalidation; twenty-four fail on isolated prior HEAD. One historical browser
comparison becomes an explicit specification-based divergence check; its original
record is unchanged and no new browser-equivalence result is claimed. Focused
runs pass 118 / three working files and 111 / three isolated files. Full authorized
native runs pass 9,652 / 269 and 8,499 / 247; both trees pass types/builds, strict
two-test checks and four-file lint. Pending shorthand storage/enumeration, partial
removal/reprioritization, broader CSSOM, released-SafeJS and real browser/site/
socket/TTY gates remain open. Continue the shared native shorthand representation
rather than hiding unsupported mutations in string rewrites. Historical evidence
and unrelated pending changes remain intact. No gated probe ran; the denied SafeJS
probe stays unrun and the complete seven-day goal remains active.

### Previous CSS variable token checkpoint

CSS variable token checkpoint: `CSS-VARIABLE-TOKENS.md` corrects hash and
at-keyword consumption before function detection. Literal `#var(...)`/`@var(...)`
no longer create false dependencies or select incorrect fallbacks; real nested
functions and separated delimiters still substitute. Sixteen new native cases
include escaped names, cycles, CSSOM mutation, geometry and raster restoration;
twelve fail before correction. Current CSS syntax/substitution specifications
were checked without replacing the existing lazy cycle semantics with an older
static graph. Focused runs pass 117 / three files in both trees; full authorized
native runs pass 9,627 / 268 working files and 8,474 / 246 isolated files. Both
trees pass types/builds, strict checking of the changed test and two-file lint.
Historical reports and pending unrelated changes remain untouched. Continue
native style/layout compatibility; pending shorthand CSSOM, full tokenizer,
released-SafeJS, real browser/site/socket/TTY and original compatibility gates
remain open. No gated probe ran; the denied SafeJS probe remains unrun and the
complete seven-day goal stays active.

### Previous local trace review integration checkpoint

Local trace review integration checkpoint: `TRACE-REVIEW-CORE.md` integrates the
bounded, inert local JSON timeline, public review APIs and shared playground asset
paths. Stream cleanup no longer waits indefinitely for underlying cancellation;
viewer teardown removes control listeners, cancels reads and clears private text.
Eight new cases cover cleanup, remounts, exports and actual host-backed playground
flows; two regressions fail before correction. Forty-one pending parser/viewer
cases are integrated. Focused runs pass 128 / four files in both trees; full
authorized native runs pass 9,611 / 268 working files and 8,458 / 246 isolated
files. Both trees pass types/builds, strict three-test checks and ten-file lint.
Source cleanup completion, peak heap and actual browser/socket deployment are not
claimed. Historical reports and unrelated pending changes remain intact. Continue
native compatibility/layout integration; live sites, released-SafeJS, real TTY/PTY,
full human/agent arbitration and original compatibility gates remain open. No
gated probe ran; the denied SafeJS probe stays unrun and the complete seven-day
goal remains active.

### Previous native tracing integration checkpoint

Native tracing integration checkpoint: `TRACE-CORE.md` integrates bounded
per-session semantic recording, owned JSON artifacts, public recorder/reader APIs
and private CLI export/recovery. Serialization failures now count as omissions
rather than replacing successful results or original action errors; reader aborts
during consumer delivery no longer report success afterward. Ten new native cases
cover these paths/public exports; nine fail before correction. Forty-five pending
recorder/export cases and the injected-CLI trace case are integrated. Focused
runs pass 147 / seven files in both trees; full authorized native runs pass
9,603 / 268 working-tree files and 8,409 / 244 isolated files. Both trees pass
types/builds, strict three-test checks and twelve-file lint. The capture probe
receives only a PNG type discriminator and is compiled, not executed. Historical
evidence, pending review UI and unrelated layout changes remain intact. Next
integrate bounded local trace review with inert display and owner cleanup.
Continuous events/video/Playwright ZIP, full human/agent arbitration and original
runtime/site/device/socket/compatibility gates remain open. No gated probe ran;
the denied SafeJS probe stays unrun and the complete seven-day goal remains active.

### Previous private capture publication checkpoint

Private capture publication checkpoint: `CAPTURE-PUBLICATION.md` applies the
existing state-file ownership/directory policy to PNG/PDF saves through shared
helpers. It verifies temporary descriptor/path identity, privacy, link count and
length before publication, rechecks directories, and reports local temporary
cleanup independently of remote cleanup in JSON/plain CLI output. Thirteen new
filesystem and five injected-CLI cases fail fifteen new expectations on isolated
prior HEAD, then pass. Focused runs pass 125 / seven working files and 101 / six
isolated files; the difference is pending trace coverage. Authorized full native
runs pass 9,593 / 268 and 8,353 / 242. Both trees pass types/builds, strict four-test
checks and seven-file lint. State behavior and tests remain unchanged. Same-UID/
privileged path races, same-size in-place tampering, power-loss directory durability
and non-Unix equivalence are not claimed. Pending trace/export work and historical
evidence remain separate. Next integrate tracing/observability against the bounded
artifact and ownership contracts. No gated probe ran; the denied SafeJS probe
remains unrun, and full runtime/site/device/socket/portability compatibility and
the complete seven-day browser objective remain open.

### Previous native input UI checkpoint

Native input UI checkpoint: `INPUT-UI.md` integrates terminal targeted-key drafts
and playground keyboard/wheel controls. Optional press ownership guards now run
inside the command queue before target resolution/focus, preventing selectors
from retargeting a replacement document/session. Playground key actions use the
displayed owner, reject ownerless submissions and clear drafts on document change.
Twelve new native command cases fail ten on isolated prior HEAD; all six new UI
cases fail before correction. All eighteen pass after integration. Thirteen
pending playground cases and four terminal cases are integrated, with two key
command expectations updated for guards. Focused checks pass 139 / six files in
both trees. Authorized full native runs pass 9,575 / 267 working-tree files and
8,335 / 241 isolated files; both pass types/builds, strict four-test checks and
nine-file lint. Unrelated tracing/capture changes and historical evidence remain
intact. Next continue capture/export and observability integration; full human/
agent arbitration, OS/IME/clipboard behavior, continuous rendering and original
runtime/site/device/socket compatibility gates remain open. No gated probe ran;
the denied SafeJS probe remains unrun and the complete seven-day goal is active.

### Previous guarded playground integration checkpoint

Guarded playground integration checkpoint: `PLAYGROUND-TAB-CORE.md` integrates
displayed-index/key tab actions and the served local metadata module. Refresh now
rejects mismatched valid viewport keys or snapshot documents and clears stale
inspectors, drafts, captures and controls on current-generation failures. Late
errors cannot clear a newer session. Thirteen existing tab UI cases are promoted
unchanged; ten new consistency cases reproduce nine failures before correction.
Two new asset cases and expanded delivery coverage verify static module closure
and mocked HTTP policies without opening sockets. Focused native runs pass
130 / five working files and 117 / five isolated files; full authorized native
runs pass 9,557 / 266 and 8,300 / 240. Both trees pass types/builds, strict two-test
checks and five-file lint. Pending tracing, capture, wheel and targeted-key work
and historical evidence remain intact. Next integrate remaining keyboard/wheel
UI controls and their stale-owner/cancellation behavior. Full human/agent
arbitration, real-browser/socket/site/runtime compatibility and other original
gates remain open. No gated probe ran; the denied SafeJS probe remains unrun and
the complete seven-day browser objective remains active.

### Previous guarded terminal integration checkpoint

Guarded terminal integration checkpoint: `TERMINAL-TAB-CORE.md` promotes the
bounded tab menu and native controller with guarded selection/closure, explicit
close confirmation, new-tab prompts and blank/empty-session handling. Failed
page refreshes now clear old page references even for non-stale errors; subsequent
successful refresh restores actions. Fifteen new stream-backed checks reproduce
eleven pre-fix failures and then pass; the existing 29-case tab suite and four
native-session scenarios are promoted unchanged. Focused checks pass 117 / six
working files and 113 / six isolated files; unrelated targeted-key work stays
pending. Authorized full native runs pass 9,545 / 266 and 8,275 / 240, respectively.
Both trees pass types/builds, strict three-test checks and six-file lint. Initial
sandboxed full runs fail 28 private-file ownership checks because `/` appears
owned by UID 65534; the policy is retained and authorized reruns pass. No real
TTY/PTY, socket, live-site or SafeJS probe ran. Guarded playground integration
remains next; human/agent arbitration and the original runtime/site/device/
compatibility gates stay open. Historical evidence and unrelated pending work
remain intact, the denied SafeJS probe stays unrun and the seven-day goal is active.

### Previous guarded tab command checkpoint

Guarded tab command checkpoint: `TAB-IDENTITY.md` integrates session-unique row
keys and optional expected-key checks for indexed selection and indexed/implicit
closure. Checks run inside the serialized command after preceding actions, so
stale indices/selections cannot target a replacement tab. Rejection preserves
document owners and snapshot caches; matching closure retains normal cleanup.
The 28 new native/injected-CLI tests fail nineteen cases on isolated HEAD and
pass after integration; three existing guard tests are promoted unchanged.
Full native runs pass 9,530 / 265 working-tree files and 8,227 / 238 isolated
files; focused runs pass 182 / seven and 180 / seven. Both trees pass types/builds,
strict three-test checks and five-file lint. Original working bytes and unrelated
tracing/UI changes remain intact. Next integrate guarded terminal/playground tab
clients without treating native mocks as real TTY/socket acceptance.
`contributions/safejs-lazy-nested-methods-request.md` records the runtime contract
need in local draft commit 2c06897; no issue was posted or SDK modified. Guest
ordering, full compatibility and independent runtime/site/socket/TTY/physical-input
gates remain open. No gated probe ran; the denied SafeJS probe stays unrun and
the full seven-day browser goal remains active.

### Previous adjacent DOM integration checkpoint

Adjacent DOM integration checkpoint: `ADJACENT-CORE.md` integrates
insertAdjacentElement/Text with native mutation owners and precise capabilities.
Host-inclusive template preflight now prevents rejected text insertions from
leaking allocated nodes and reports template cycles as HierarchyRequestError
before movement. All 25 new cases fail on isolated HEAD; the integrated pre-fix
baseline reproduces twelve template failures. The unchanged 45-case pending
suite is promoted. Full native runs pass 9,502 / 263 working-tree files and
8,196 / 236 isolated files; focused runs pass 327 / eight and 324 / eight.
Both trees pass types/builds, strict three-test checks and five-file lint.
Original pending tests, unrelated source and historical measurements remain
intact. Read-only upstream inspection at e4e23699e696d320363da662d1d74475bb098d28
confirms setup-only nested registration and undefined host receivers; simply
forwarding the declared hook cannot implement lazy guest click methods safely.
Next record the precise owned lazy-method contract requirement and continue
independent JavaScript DOM coverage. No SDK was installed or executed and no
gated browser probe ran. Guest ordering, runtime/site/socket/TTY/physical-input
gates remain open; the denied SafeJS probe stays unrun and the seven-day browser
goal remains active.

### Previous programmatic activation cancellation checkpoint

Programmatic activation cancellation checkpoint: `PROGRAMMATIC-CANCELLATION.md`
adds optional abort forwarding to the native asynchronous click owner. Pending
click/forwarded-control/reset prefixes now unwind preactivation and per-element
guards; committed input state remains intact, and a pre-aborted recursive call
cannot disturb an existing activation. All 22 new native cases fail on both
pre-fix working code and isolated HEAD, then pass with signal forwarding. Full
native runs pass 9,477 / 262 working-tree files and 8,126 / 234 isolated files;
focused checks pass 312 / eleven in both trees. Types/builds, strict new-test
checks and two-file lint pass. Source changes do not alter activation algorithms.
Guest click remains absent: the public context declares nested operations, but
the browser adapter has not resolved setup-owned registration and lazy method/
receiver identity. Pinned upstream-source review is not released-SDK execution
evidence. Next resolve that public adapter boundary and retain an independent
guest `element.click(); readState()` ordering gate; no async/fire-and-forget
substitute is exposed. Historical reports and unrelated pending edits remain
intact. No gated probe ran; runtime/site/socket/TTY/physical-input gates and the
full seven-day browser goal remain open. The denied SafeJS probe stays unrun.

### Previous typing cancellation checkpoint

Typing cancellation checkpoint: `TYPING-CANCELLATION.md` forwards command and
native typing signals through character/press generators, and checks the shared
asynchronous action boundary before startup and after awaited event dispatch.
This stops late edits and false success when an abort microtask runs between
dispatch and the next generator step. Pending typing no longer holds the command
queue after abort/deadline; committed characters and independently held modifiers
remain, while owned key cleanup runs without later input replay. The 31-case
native suite fails 29 cases on isolated HEAD; a signal-only intermediate baseline
reproduces four boundary failures. Raw held-key cancellation already passes.
Full native runs pass 9,455 / 261 working-tree files and 8,104 / 233 isolated files;
focused runs pass 443 / sixteen and 440 / sixteen. Both trees pass types/builds,
strict new-test checks and four-file lint. The command-host patch contains only
signal forwarding, preserving unrelated pending work and historical reports.
Next audit guest programmatic activation exposure. Cancellation does not forcibly
stop listener code or roll back its independent side effects. Complete event-loop,
physical-input and independent runtime/site/socket/TTY gates remain open. No gated
probe ran; the denied SafeJS probe remains unrun and the seven-day goal is active.

### Previous native input checkpoint

Native input checkpoint: `INPUT-CORE.md` connects coordinate click/hover,
boundary events, focus/default activation, wheel input, held keyboard modifiers,
targeted press and state-dependent selectors through shared document owners.
Raw mouse methods and session adapters now interrupt pending event prefixes;
pre-aborted calls do not mutate input, while observed button state is not rolled
back. All 23 new tests fail on HEAD plus original helpers; the integrated
signal-omission baseline reproduces 12 failures. Twenty unchanged suites and
eight input-specific tracked test updates are integrated, including native label
coverage explicitly added to the test list. Full native runs pass 9,424 / 260
working-tree files and 8,073 / 232 isolated files; focused runs pass 940 / 29 and
937 / 29. Both trees pass types/builds, strict 29-test checks and 47-file lint.
The first isolated full run exposed two obsolete unpainted command fixtures;
their existing input updates fix them without weakening actionability. Pending
tracing/tab/adjacent-DOM work and historical evidence remain separate. Next audit
held-key/type cancellation and guest programmatic activation exposure; native
programmatic activation is not a guest HTMLElement.click claim. Full pointer
dispatch/capture, physical input, nested scrolling and independent runtime/site/
socket/TTY gates remain open. No gated probe ran, the denied SafeJS probe remains
unrun, and the full seven-day browser goal stays active.

### Previous hit/pointer-policy command checkpoint

Hit/pointer-policy command checkpoint: `HIT-CORE.md` connects shared hit regions,
inherited pointer-events CSS/CSSOM and guest node results to `hit-test`, plus
session/command `scroll-into-view`. Geometry reports its real scroll origin.
Optional event-action signal forwarding cancels a pending scroll listener prefix
without rolling back observed movement. The new 27-case suite fails 19 cases on
HEAD plus original helpers; a signal-omission baseline reproduces exactly one
pending-prefix cancellation failure. The unchanged 46-case hit suite is promoted.
Full native validation passes 9,386 / 258 working-tree files and 7,435 / 210 isolated
files; focused checks pass 348 / eleven and isolated 284 / ten. Types/builds,
strict four-test checks and seventeen-file lint pass in both trees. Obsolete
geometry/enumeration assertions are scoped to the integrated feature; pending
mouse/selector/tracing/keyboard/tab changes and historical reports remain intact.
Next integrate mouse boundary/focus/default activation and click/hover command
actionability. Injected CLI dispatch is not a real socket or physical-input gate.
Modal/shadow hit rules, transforms, nested scrolling/clipping, full positioning
and independent site/runtime/socket/TTY gates remain open. No gated probe ran;
the denied SafeJS probe remains unrun and the full seven-day goal stays active.

### Previous page scrolling binding/lifecycle checkpoint

Page scrolling binding/lifecycle checkpoint: `PAGE-SCROLL-CORE.md` connects
Window/root scrolling, readonly offset getters, visible-overflow extents and
scroll-into-view to the shared origin. Document notifications coalesce and bubble
to Window; source evaluation and callback prefixes defer delivery until explicit
wake boundaries. All 17 new injected-runtime cases fail on prior HEAD; a baseline
with bindings/metrics but without lifecycle hooks reproduces three ordering
failures. Five unchanged suites add 173 checks. Full native runs pass 9,359 / 257
working-tree files and 7,362 / 208 isolated files; focused checks pass 275 / ten
and isolated 266 / ten. Types/builds, strict seven-test checks and sixteen-file
lint pass in both trees. Original source/tests and historical reports remain
intact; unrelated base64/onload/hit-testing changes stay pending. Next integrate
coordinate hit testing, pointer/action routing and command capability reporting.
Native host-object/runtime injection is not SafeJS or physical-input acceptance.
Nested scrolling/clipping, scrollend/rendering-loop timing, quirks/RTL/full layout
and all independent site/runtime/socket/TTY gates remain open. No gated probe ran;
the denied SafeJS probe remains unrun and the full seven-day goal stays active.

### Previous viewport scrolling/offset core checkpoint

Viewport scrolling/offset core checkpoint: `SCROLL-CORE.md` connects the bounded
native origin to client geometry and viewport captures while preserving document
boxes, offsets, explicit clips and element crops. It fixes relative targets
incorrectly selecting static table ancestors. The new 28-case suite fails 23
cases on HEAD plus original owners; the integrated pre-fix tree reproduces all
three table-parent failures. Full native runs pass 9,342 / 256 working-tree files
and 7,172 / 202 isolated-commit files; focused runs pass 209 / seven and 130 / five.
Both trees pass types/builds, strict new-test checking and six-file lint. The
committed capability record does not claim unpromoted command/guest/event adapters.
Existing broader offset/viewport suites, unrelated pending work and historical
reports are preserved. Next integrate guest/root scrolling and offset getters,
then hit testing, pointer routing and scroll-into-view. Nested scrolling/clipping,
RTL origins, full positioning and independent runtime/site/socket/TTY gates remain
open. No gated probe ran; the denied SafeJS probe and full seven-day scope remain.

### Previous shared page-layout core checkpoint

Shared page-layout core checkpoint: `LAYOUT-CORE.md` promotes intrinsic text/box
measurement, coordinated page flex reflow/placement, atomic inline sizing, relative
translation, stacking-aware paint ordering and software replaced controls. Page
geometry/raster/PDF now consume the shared pipeline. All 33 new cases fail on
pre-integration HEAD and pass after integration; six unchanged suites add 439
checks. Full native validation passes 9,314 / 255 working-tree files and 7,144 /
201 isolated-core files; expanded checks pass 652 / 14 and isolated 651 / 14.
Types/builds, strict changed-test checks and 42-file lint pass in both trees.
Original source/test bytes and historical reports are preserved. Matching obsolete
layout rejection/enumeration assertions are updated rather than retaining false
unsupported claims. Scrolling origins and corrected pointer adapters remain outside
the commit; coordinate-dependent control tests stay pending, with native state
presentation covered separately. Next integrate scrolling/offset ownership and
coordinate routing against this pipeline. Full positioning/clipping/float/grid/table
layout, broader fonts/writing modes, custom select/rich controls/pickers, pending
CSSOM breadth and independent runtime/site/UI gates remain open. No gated probe
ran; the denied SafeJS probe remains unrun and the full seven-day goal stays active.

### Previous flex style/main-axis core checkpoint

Flex style/main-axis core checkpoint: `FLEX-CORE.md` promotes twelve flex
longhands, three shorthand owners, inherited/font-relative computation and the
bounded measured main-axis solver. Its existing 161-case suite is preserved;
33 new integration cases pass, with 31 failing on pre-integration HEAD plus the
helpers. Full native checks pass 9,281 / 254 working-tree files and 6,672 / 194
isolated-core files; focused checks pass 390 / six files and isolated 282 / five.
Types/builds, strict changed-test checks and ten-file lint pass in both trees.
Original source worktree bytes remain intact. Current-draft safe/unsafe normal
alignment is intentionally retained after withdrawing an outdated rejection
assumption; no false parser fix or weakened existing test is committed. The
isolated capability profile leaves page/nested/column/inline flex layout false:
measured main-axis resolution is not page flexbox. Next integrate intrinsic
measurement, atomic-inline sizing and flex reflow/placement with shared paint
ordering, then relative positioning, scrolling and coordinate routing. Custom
select/pickers, full layout compatibility, pending CSSOM slots and independent
runtime/site/UI gates remain open. No gated probe ran; the denied SafeJS probe
remains unrun and the full seven-day goal stays active.

### Previous flow cascade/CSSOM core checkpoint

Flow cascade/CSSOM core checkpoint: `FLOW-CORE.md` promotes six flow longhands,
overflow shorthand ownership, live computed reads and formatting recovery.
Explicit defaults render normally; unsupported winning values still reject
geometry/capture and recover after reset. All 48 new cases fail on HEAD plus
the helper and pass after integration. Full native checks pass 9,248 / 253
working-tree files and 6,478 / 192 isolated-core files; focused checks pass 277 /
six files and isolated 179 / five. Types/builds, strict changed-test checks and
nine-file lint pass in both trees. Original source worktree bytes remain intact.
The isolated capability profile deliberately leaves relative positioning and
stacking false; existing pending work retains its broader implementation. Draft
overflow computation remains explicitly distinct from the older published draft
and unproven live-browser behavior. Next integrate inline/flex/intrinsic sizing
and shared paint-order/relative paths, then scrolling and coordinate routing.
Clipping, full positioning, float/clear layout, custom select/pickers, pending
CSSOM slots and independent runtime/site/UI gates remain open. No gated probe
ran; the denied SafeJS probe remains unrun and the seven-day goal stays active.

### Previous solid-border core checkpoint

Solid-border core checkpoint: `BORDER-CORE.md` promotes focused physical border
cascade/CSSOM, normal-flow and ordinary-inline geometry, client sizes and software
painting. Width inheritance now uses zero for none/hidden parent borders without
discarding retained own widths; nine regressions fail before the fix in both
trees. All 43 new core cases pass. Full native validation passes 9,200 / 252
working-tree files and 6,430 / 191 isolated-core files. Focused checks pass 258 /
seven files; isolated regression checks pass 183 / seven. Types/builds, strict
changed-test checks and 22-file lint pass in both trees. Unrelated pending source
bytes and historical reports are preserved; the only new behavioral worktree
change is the inheritance fix. The isolated adapters retain the existing painting
schedule, not pending stacking/control/flex integrations. Next integrate remaining
inline/flex layout, paint ordering and scrolling before corrected coordinate
routing. Radius, border images, other line styles, broad writing modes, custom
select presentation/pickers, multiple selection, pending CSSOM slots and independent
runtime/site/UI gates remain open. No gated probe ran; the denied SafeJS probe
remains unrun and the full seven-day goal stays active.

### Previous CSS custom-property core checkpoint

CSS custom-property core checkpoint: `CSS-VARIABLES-CORE.md` promotes the pending
bounded helper and focused authored/cascade/computed/inline-CSSOM integration.
Names remain case-sensitive; inheritance, fallbacks, evaluated cycles and invalid
computed winners feed the existing geometry/paint/math owners. The 42 new core
cases have 26 failures on HEAD with only the helper and all pass after promotion.
Focused checks pass 249 / six files; isolated focused checks pass 189 / five files.
Full native validation passes 9,157 / 251 files; the isolated core tree passes
6,387 / 190 available files. Types/builds, strict changed-test checks and nine-file
lint pass in both trees. Original source/test worktree bytes remain unchanged;
unrelated border/flex/flow/pointer and selector changes stay outside this commit.
Raw unresolved shorthand CSSOM slots retain their explicit serialization and
partial-mutation limits; native factories/pixels are not runtime/browser parity.
Next promote border cascade/geometry, then remaining layout/paint/scrolling and
corrected coordinate adapters. Standard pending-substitution CSSOM slots, custom
select presentation/pickers, complete multiple selection, modal/flat-tree inertness
and broad site/runtime/UI compatibility remain open. No gated probe ran; the
denied SafeJS probe remains unrun and the full seven-day goal stays active.

### Previous CSS math core checkpoint

CSS math core checkpoint: `CSS-MATH-CORE.md` promotes the pending finite
length-math helper with focused box/inline declarations, font-basis ownership,
used-length and indefinite-height integration. Existing source worktree bytes
are unchanged; borders, insets, variables, flex and pointer work stay separate.
The new 63-case native suite has 31 failures on pre-promotion HEAD plus the
helper and passes after integration. Matching box/auto-width expectations are
promoted rather than retaining obsolete calc rejection assertions. Expanded
checks pass 391 / eight files; isolated focused checks pass 250 / six files.
Full native validation passes 9,115 / 250 files; the isolated promotion tree
passes 6,345 / 189 available files. Types/builds, strict changed-test checks and
ten-file lint pass in both trees. Native geometry/pixel equivalence is not live
reference-browser evidence. Next promote custom-property substitution and border
cascade/geometry, then remaining layout/paint/scrolling dependencies and corrected
coordinate adapters. Custom select presentation/pickers, complete multiple
selection, modal/flat-tree inertness, general CSS Values conformance and wider
browser/runtime compatibility remain open. No gated probe ran; the denied SafeJS
probe remains unrun and the full seven-day goal stays active.

### Previous coordinate-inertness checkpoint

Coordinate-inertness checkpoint: `COORDINATE-INERTNESS.md` adds a shared native
subtree predicate with charged ancestor/first-element scans. The pending hit-test
and mouse adapters now use the shared implicit-select-button rule; eight injected
coordinate regressions fail before those corrections and pass afterward. The
21 new core tests and 11 added adapter cases have distinct evidence scopes:
custom select descendants are not yet rendered, so injected native boxes/targets
do not prove custom-picker presentation or physical input. Expanded checks pass
262 / nine files; full native validation passes 9,052 / 249 files. The isolated
core patch passes 6,281 / 188 available files and 66 focused checks / two files.
Types/builds and changed-file lint pass in both trees. Only the owned predicate,
new core suite and checkpoint documents are committed; corrections in the four
pre-existing pending coordinate files remain in the worktree. An import audit
finds 29 pending modules in that closure. Next promote rendering/style prerequisites
in independently validated slices, then coordinate routing with its dependencies;
do not mistake this core commit for completed coordinate integration. Custom
select layout/pickers, modal/flat-tree inertness, multiple selection and broader
runtime/browser compatibility remain open. No gated probe ran, the denied SafeJS
probe remains unrun, and the full seven-day goal stays active.

### Previous select-keyboard core checkpoint

Select-keyboard core checkpoint: `SELECT-KEYBOARD-CORE.md` promotes the pending
navigation/typeahead helpers with a focused committed-keyboard adapter, label
helper and capability export. User keyboard choices now refresh selectedcontent
before native input/change notifications without broadening option-setter
triggers. Empty displayed-label attributes fall back to option text. Three
initial regressions fail before the fixes; 50 new tests and 223 focused checks
across seven files pass. The isolated focused run passes 149 / five files. Full
native validation passes 9,020 / 248 files; the isolated promotion tree passes
6,260 / 187 available files. Types, builds and six-file lint pass in both trees,
preserving unrelated pending work and original keyboard/index worktree bytes.
Next address coordinate implicit-inert targeting and picker/rendering breadth.
Complete multiple selection, fallback text, physical/held-key and task timing,
foreign content, framesets, quirks layout and cross-owner runtime observation
remain open. No gated probe ran; the denied SafeJS probe remains unrun,
independent acceptance gates remain open and the seven-day goal stays active.

### Previous selectedcontent checkpoint

Selectedcontent checkpoint: `SELECTEDCONTENT.md` adds native child cloning,
first-candidate/internal-disabled state, connection/removal updates, primary
promotion and parser option-pop/EOF timing. Explicit select value/index paths
and native select actions refresh copies; generic selectedness reset, option
attributes/setters and text changes do not gain an indiscriminate copy hook.
Three initial regressions and three draft reset-boundary regressions fail before
their fixes. All 44 new tests and 323 focused checks across eight files pass.
Full native validation passes 8,970 / 247 files; the isolated owned patch passes
6,210 / 186 available files. Types, builds and six-file lint pass in both trees,
preserving pending work. Next integrate the pending select-keyboard notification
path and coordinate inert targeting. Picker/rendering, fallback button text,
broader lifecycle/task timing, foreign content, framesets, quirks layout and
cross-owner runtime observation remain open. No gated probe ran; the denied
SafeJS probe remains unrun, independent acceptance gates remain open and the
seven-day goal stays active.

### Previous option disabled-boundary checkpoint

Option disabled-boundary checkpoint: `OPTION-DISABLED.md` replaces transitive
optgroup disabling with a shared nearest-group/boundary predicate in the native
control index and default-selection eligibility. Options retain own-attribute
precedence, and select/hr/datalist/option ancestors stop outer-group inheritance;
optgroups use only their own disabled flags. Three initial regressions fail
before the fix, including a lost successful form value. All 36 new tests and
253 focused checks across seven files pass. Full native validation passes
8,926 / 246 files; the isolated owned patch passes 6,166 / 185 available files.
Types, builds and four-file lint pass in both trees while preserving pending
work. Selectedcontent cloning remains unimplemented; its lifecycle and parser
option-pop requirements must not be replaced by indiscriminate mutation copying.
Coordinate inert targeting, picker behavior, foreign content, framesets, quirks
layout and cross-owner observer/runtime breadth remain open. No gated probe ran;
the denied SafeJS probe remains unrun, independent acceptance gates remain open
and the seven-day goal stays active.

### Previous select inertness checkpoint

Select inertness checkpoint: `SELECT-INERT.md` adds shared first-element-child
button detection to native reference actionability, direct/sequential focus,
label forwarding and semantic snapshots. Implicit inertness propagates through
the existing ancestor/inclusion paths without changing attributes, disabled
state or submit-button classification. A weak immutable-parent-view cache shares
prefix scans and refreshes through native mutation. Three initial regressions
fail before the fix; 45 new tests and 209 focused checks across eight files pass.
Full native validation passes 8,890 / 245 files; the isolated owned patch passes
6,130 / 184 available files. Types, builds and five-file lint pass in both trees,
preserving pending work. Coordinate hit-testing/mouse paths still need the same
implicit inert rule; this is not full input parity. Selectedcontent, picker
behavior, flat-tree/modal inertness, foreign content, framesets, quirks layout
and cross-owner observer/runtime breadth remain open. No gated probe ran; the
denied SafeJS probe remains unrun, independent acceptance gates remain open and
the seven-day goal stays active.

### Previous button Auto checkpoint

Button Auto checkpoint: `BUTTON-AUTO.md` unifies current computed button types
and submit-button classification across activation, form entries, submitter
resolution, implicit submission, constraint validation and native host getters.
Command-attribute presence and direct select parentage suppress Auto submission;
explicit submit/reset remain distinct. Current attributes and parentage are read
after mutations without new caches. Three initial regressions fail before the
fix; 48 new tests and 277 focused checks across nine files pass. Full native
validation passes 8,845 / 244 files; the isolated owned patch passes 6,085 / 183
available files. Types, builds and seven-file lint pass in both trees, preserving
pending work. Next address select-button implicit inertness and selectedcontent;
computed button types are not picker, command dispatch or actionability parity.
Foreign content, framesets, quirks layout and cross-owner observer/runtime
breadth remain open. No gated probe ran; the denied SafeJS probe remains unrun,
independent acceptance gates remain open and the seven-day goal stays active.

### Previous modern-select checkpoint

Modern-select checkpoint: `MODERN-SELECT.md` removes legacy select-only filtering
and select-in-table dispatch, preserving supported rich descendants through the
shared parser. Scope, implied ends, formatting and the input exception retain
distinct handling; keygen uses void insertion. Shared nearest-select ownership
excludes invalid datalist/hr/option and repeated-optgroup ancestor chains from
collections and native selection, including moves and cloning. Three initial
regressions fail before integration; 45 new tests and 324 focused checks across
nine files pass. Full native validation passes 8,797 / 243 files; the isolated
owned patch passes 6,037 / 182 available files. Types, builds and six-file lint
pass in both trees, preserving pending work. Next address select-button inertness
and selectedcontent behavior; keeping their nodes is not customizable picker,
rendering or interaction support. Foreign content, framesets, quirks layout and
cross-owner observer/runtime breadth remain open. No gated probe ran; the denied
SafeJS probe remains unrun, independent acceptance gates remain open and the
seven-day goal stays active.

### Previous EOF checkpoint

EOF checkpoint: `HTML-EOF.md` records bounded open-element diagnostics, actual
template-frame unwinding, text-mode EOF and literal tag-opener recovery. Optional
ends, virtual fragment roots and after-body EOF paths avoid false positives;
document-write boundaries still pause rather than finalize. Three initial
regressions fail before their fixes; 66 new tests and 428 focused checks across
ten files pass. Full native validation passes 8,752 / 242 files; the isolated
owned patch passes 5,992 / 181 available files. Types, builds and four-file lint
pass in both trees while preserving pending work. Next address modern select
tree construction and remaining tokenizer/runtime compatibility, rather than
treating diagnostic coverage as full conformance. Foreign content, framesets,
quirks layout and cross-owner observer/runtime breadth remain open. No gated
probe ran; the denied SafeJS probe remains unrun, independent acceptance gates
remain open and the seven-day goal stays active.

### Previous scaffold-publication checkpoint

Scaffold-publication checkpoint: `HTML-SCAFFOLD.md` replaces eager html/head/body
allocation with token-driven native identities. Startup has no parser-created
elements; comments and doctypes precede later allocations, explicit attributes
are present during insertion, and EOF supplies missing elements after mode
selection. Detachment preserves saved identities without reattachment; initial
attributes removed by insertion hooks are not merged back. Three initial and
two reentrancy regressions fail before their fixes; 33 new tests and 374 focused
checks across nine files pass. Full native validation passes 8,686 / 241 files;
the isolated owned patch passes 5,926 / 180 available files. Types, builds and
three-file lint pass in both trees, preserving pending work. Next address EOF
diagnostics and remaining parser/runtime compatibility. Modern select, foreign
content, full quirks layout and cross-owner observer/runtime breadth remain open.
No gated probe ran; the denied SafeJS probe remains unrun, independent acceptance
gates remain open and the seven-day goal stays active.

### Previous fragment-mode checkpoint

Fragment-mode checkpoint: `FRAGMENT-MODE.md` adds context document-mode inheritance
to ordinary and html-element fragments. Native innerHTML, outerHTML and all
adjacent insertion positions pass the context owner's mode, including detached,
synthetic-body and template contexts. Fragment doctypes cannot override it;
quirks table/paragraph recovery differs from no-quirks and limited-quirks. Two
initial regressions fail before the fix; 44 new tests and 289 focused checks
across seven files pass. Full native validation passes 8,653 / 240 files; the
isolated owned patch passes 5,893 / 179 available files. Types, builds and
three-file lint pass in both trees, excluding pre-existing pending work. Next
address provisional scaffold publication timing and remaining parser/runtime
compatibility. Full quirks layout, EOF diagnostics, modern select, foreign content
and cross-owner observer/runtime breadth remain open. No gated probe ran; the
denied SafeJS probe remains unrun, independent acceptance gates remain open and
the seven-day goal stays active.

### Previous parser-form checkpoint

Parser-form checkpoint: `PARSER-FORMS.md` records native parser-created form-owner
overrides for controls separated from their forms by table recovery. Shared
collections, submission preparation, reset, host bindings and radio grouping use
the same owner. Explicit attributes, control movement, fragment transfer and
clone/import retain distinct reset rules; template owners stay isolated. Three
initial regressions fail before integration; 40 new tests and 293 focused checks
across ten files pass. Full native validation passes 8,609 / 239 files; the
isolated owned patch passes 5,849 / 178 available files. Types, builds and six-file
lint pass in both trees, excluding pre-existing pending work. Next address
fragment mode inheritance and provisional scaffold publication timing. Historical
image/custom-element associations, EOF diagnostics, modern select and cross-owner
observer/runtime breadth remain open. No gated probe ran; the denied SafeJS probe
remains unrun, independent acceptance gates remain open and the seven-day goal
stays active.

### Previous head-mode checkpoint

Head-mode checkpoint: `HTML-HEAD.md` separates before-head, head, head-noscript
and after-head processing. Early end tags, comments and whitespace no longer
prematurely start the body; late metadata uses the saved head pointer without
leaving a temporary stack frame. Noscript respects the scripting mode, template
policies remain inert and after-head whitespace checks actual adjacency. Ten
initial cases and one whitespace case fail before their fixes; 54 new tests and
445 focused checks across ten files pass. Full native validation passes
8,569 / 238 files; the isolated owned patch passes 5,809 / 177 available files.
Types, builds and three-file lint pass in both trees. A related quota fixture now
explicitly enters the body; its assertion is unchanged. Pre-existing pending work
is excluded. Next address parser-created form-owner overrides, fragment mode
inheritance and provisional scaffold publication timing. EOF diagnostics, modern
select and cross-owner observer/runtime breadth remain open. No gated probe ran;
the denied SafeJS probe remains unrun, independent acceptance gates remain open
and the seven-day goal stays active.

### Previous document-closing checkpoint

Document-closing checkpoint: `HTML-CLOSING.md` preserves open ancestors across
body/html ends and separates after-body from after-after-body processing.
Trailing comments, whitespace, repeated scaffold attributes and scoped rejection
retain their distinct paths; quirks-mode table starts preserve open paragraphs.
Cached text coalescing checks actual adjacency and owner after native mutation.
Eleven initial cases, three coalescing cases and three mutation cases fail before
their fixes; 61 new tests and 391 focused checks across nine files pass. Full
native validation passes 8,515 / 237 files; the isolated owned patch passes
5,755 / 176 available files. Types, builds and three-file lint pass in both trees,
excluding pre-existing pending work. Next broaden before/after-head and head-
noscript modes, fragment mode inheritance and parser form-owner association.
Modern select, EOF diagnostics and cross-owner observer/runtime breadth remain
open. No gated probe ran; the denied SafeJS probe remains unrun, independent
acceptance gates remain open and the seven-day goal stays active.

### Previous body-scope checkpoint

Body-scope recovery checkpoint: `HTML-SCOPE.md` adds bounded normal, button and
list-item scope searches, implied ends and special-boundary ordinary end handling.
Paragraphs, headings, lists, buttons, form pointers and ruby recover without
unscoped ancestor popping; virtual fragment roots and template owners remain
isolated. Twelve initial regressions fail before the fix; 70 new tests and 307
focused checks across eight files pass. Full native validation passes 8,454 / 236
files; the isolated owned patch passes 5,694 / 175 available files. Types, builds
and four-file lint pass in both trees, excluding pre-existing pending work.
Next complete body/html and after-body scaffold transitions, quirks-dependent
table/paragraph handling, parser form-owner association and remaining modes.
Modern select, DOM adoption and cross-owner observer/runtime breadth remain open.
No gated probe ran; the denied SafeJS probe remains unrun. Independent acceptance
gates remain open and the seven-day goal stays active.

### Previous table checkpoint

Table recovery checkpoint: `HTML-TABLES.md` replaces table container heuristics
with bounded mode dispatch, scoped close/reprocessing and pending character
batches across parser writes. Inputs/forms and legacy select transitions retain
distinct handling; template owners remain isolated. Raw-text closing transitions
and actual-sibling foster coalescing fix additional reproduced regressions.
Three initial cases, two raw-text cases and two foster-text cases fail before
their fixes; 54 new tests and 260 focused checks across eight files pass. Full
native validation passes 8,384 / 235 files; the isolated owned patch passes
5,624 / 174 available files. Types, builds and three-file lint pass in both trees,
preserving pre-existing pending work. Next complete in-body scope/implied-end
handling, parser form-owner association and remaining mode interactions. Modern
select behavior, DOM adoption and cross-owner observer/runtime breadth remain
open. No gated probe ran; the denied SafeJS probe remains unrun, independent
acceptance gates remain open and the seven-day goal stays active.

### Previous formatting checkpoint

Formatting reconstruction checkpoint: `HTML-FORMATTING.md` adds bounded active
formatting entries, original-token attribute retention, three-equivalent-entry
pruning, marker isolation and adoption-agency repair. Cloning and foster moves
respect actual template owners; work/text/native quotas and repair-time
cancellation remain enforced. Three initial regressions fail before integration;
57 new tests and 242 focused checks across eight files pass. Full native validation
passes 8,330 / 234 files; the isolated owned patch passes 5,570 / 173 available
files. Types, builds and five-file lint pass in both trees, preserving pre-existing
pending work. Next address malformed-table recovery and complete insertion-mode,
scope and implied-end interactions. This is not DOM cross-document adoption or
full parser conformance. Cross-owner observer/runtime and template-extension
requirements remain open. No gated probe ran; the denied SafeJS probe remains
unrun, independent acceptance gates remain open and the seven-day goal stays active.

### Previous template-parser checkpoint

Template parser checkpoint: `TEMPLATE-PARSING.md` enables owner-aware template
tree construction, nested template insertion modes, scoped recovery, inert
script/policy handling and template-context fragment parsing. Template innerHTML
replaces real contents; adjacent/outer HTML retain their distinct DOM semantics.
Three initial regressions fail before implementation; 46 new tests and 343
focused checks across eleven files pass. Existing rejection fixtures now use
still-unsupported SVG without weakening state/allocation assertions. Full native
validation passes 8,273 / 233 files; the isolated owned patch passes 5,513 / 172
available files. Types, builds and ten-file lint pass in both trees, preserving
pre-existing pending work. Next address bounded active-formatting reconstruction,
adoption-agency and malformed-table recovery; this remains an HTML parser subset.
DOM adoption, cross-owner observer/runtime integration and template extensions
also remain incomplete. No gated probe ran; the denied SafeJS probe remains
unrun, independent acceptance gates remain open and the seven-day goal stays active.

### Previous template-binding checkpoint

Template bindings checkpoint: `TEMPLATE-BINDINGS.md` exposes stable read-only
`.content` capabilities and inert contents-owner bindings, with guarded initial
publication, failure cleanup and parent teardown. Main, auxiliary and contents
callers share HTML-document admission/resources while creations inherit the
actual caller's origin. Three initial regressions fail before implementation;
36 new tests and 274 focused checks across seven files pass. Full native
validation passes 8,228 / 232 files; the isolated owned patch passes 5,468 / 171
available files. Types, builds and three-file lint pass in both trees, preserving
pre-existing pending work. Next implement real template parser insertion modes,
owner-aware insertion and inert resource/policy behavior. Adoption, cross-owner
observer/runtime integration and broader compatibility remain incomplete. No
gated probe ran; the denied SafeJS probe remains unrun, independent acceptance
gates remain open and the seven-day goal stays active.

### Previous native-template checkpoint

Native template ownership checkpoint: `TEMPLATE-OWNERSHIP.md` creates separate
reused contents documents, stable fragment/host references, host-aware cycle and
depth checks, bounded graph cloning/import and owner-aware HTML serialization.
Shared quotas and per-document preflight cover both ordinary and contents nodes,
including larger supplied pools. Three initial regressions and three later
local-quota regressions fail before their fixes; 40 new tests and 262 focused
checks across seven files pass. Full native validation passes 8,192 / 231 files;
the isolated owned patch passes 5,432 / 170 available files. Types, builds and
three-file lint pass in both trees, preserving pre-existing pending work.
Next bind inert template contents safely and implement real parser insertion
modes; `.content`, template parsing and adoption are not completed by this core.
No gated probe ran; the denied SafeJS probe remains unrun, independent acceptance
gates remain open and the seven-day goal stays active.

### Previous parsed-doctype checkpoint

Parsed-doctype checkpoint: `PARSED-DOCTYPES.md` replaces raw declaration tokens
with structured name/identifier/force-quirks data, preserves the accepted initial
DocumentType and records no-quirks/quirks/limited-quirks mode decisions. ScriptDom
exposes compatMode; this is not quirks rendering or selector conformance, and
unsupported-layout diagnostics remain explicit. Three initial regressions fail
before integration; 90 new tests and 391 focused checks across eleven files pass.
Full native validation passes 8,152 / 230 files; the isolated owned patch passes
5,392 / 169 available files. Types, builds and nine-file lint pass in both trees,
with pre-existing pending work preserved. Next implement the actual template
content-document/parser model and track broader quirks behavior separately. No
gated probe ran; the denied SafeJS probe remains unrun, existing independent
acceptance gates remain open and the seven-day goal stays active.

### Previous inert-document checkpoint

Inert HTML document checkpoint: `HTML-DOCUMENTS.md` adds owned
`document.implementation.createHTMLDocument`, exact optional-title skeletons,
inherited origin identity, unrendered defaults, isolated page bindings and shared
auxiliary-family budgets. Nested calls share 16 lifetime creation admissions;
publication failures and initiating-owner teardown revoke and release candidates.
Three initial regressions fail before integration; 40 new tests and 357 focused
checks across ten files pass. Full native validation passes 8,062 / 228 files;
the isolated owned patch passes 5,302 / 167 available files. Types, builds and
four-file lint pass in both trees, with pre-existing pending work preserved.
Next preserve parsed doctype/compatibility metadata and implement the actual
template content-document/parser model. XML/adoption/prototype/runtime breadth
and existing independent gates remain open. No gated probe ran; the denied
SafeJS probe remains unrun and the seven-day goal stays active.

### Previous shared-resource checkpoint

Shared document-resource checkpoint: `DOCUMENT-RESOURCES.md` adds opt-in aggregate
document-count, node and retained-text limits, complete-copy preflight, per-payload
reentrant checks, content-free counters and family teardown. Four initial
regressions fail before integration; 45 new tests and 297 focused checks across
nine files pass. Full native validation passes 8,022 / 227 files; the isolated
owned patch passes 5,262 / 166 available files. Types, builds and three-file lint
pass in both trees. Existing pending changes remain outside the atomic checkpoint.
Next connect this owner to bounded inert HTML document creation, including nested
admission, defaults and inherited origin metadata. No `createHTMLDocument`, parsed
doctype or template completion is claimed. No gated probe ran; the denied SafeJS
probe remains unrun and the seven-day goal stays active.

### Previous document-type checkpoint

Document-type checkpoint: `DOCUMENT-TYPES.md` adds programmatic DocumentType
creation, owner-bound `document.implementation`, live `document.doctype`, native
metadata retention, cloning/import/equality and HTML serialization. Shared
hierarchy checks reject invalid doctype order before mutation. Four initial
regressions fail before implementation; 40 new tests and 334 focused checks across
nine files pass. Full native validation passes 7,977 / 226 files; the isolated
owned patch passes 5,217 / 165 available files. Types, builds and eight-file lint
pass in both trees, with existing pending work preserved outside the checkpoint.
This is document-creation groundwork, not completed template support: bounded
inert HTML document creation, parser DOCTYPE materialization and proper template
content ownership remain next. No gated probe ran and the seven-day goal stays
active; the denied SafeJS probe remains unrun.

### Previous node-publication checkpoint

Node-publication checkpoint: `SCRIPT-NODE-PUBLICATION.md` guards node, Attr and
NamedNodeMap publication against reentry, reused identities, provider failure
and owner closure. Captured callbacks stay unavailable until registration and
remain revoked after failure; pending work counts toward map/attribute quotas.
Native node identity registration no longer permits rebranding. Seven initial
regressions and a later owner-check regression fail before their fixes; 56 new
tests and 413 focused checks across eleven files pass. Full validation also caught
extra DOM reads; the guard now preserves the existing four-read textarea budget
without changing its test. Final full native validation passes 7,937 / 225 files;
the isolated owned patch passes 5,177 / 164 available files. Production/new-test
types, builds and six-file lint pass in both trees. Pre-existing pending work is
preserved outside this checkpoint. Native allocation rollback, other capability families
and independent runtime/site gates remain open. No gated probe ran; the denied
SafeJS probe stays unrun and the seven-day browser goal remains active.

### Previous document-import checkpoint

Document-import checkpoint: `DOCUMENT-IMPORT.md` connects `document.importNode`
to native subtree copying across authenticated script/attribute owners. Copies
use destination identity, URL context and quotas without moving the source or
copying registered listeners. Current boolean/dictionary options and teardown
revalidation have coverage; custom-element registries remain explicitly unsupported.
Five initial regressions fail before implementation; 58 new native cases and
270 focused tests across eight explicit files pass. Final full native validation
passes 7,881 / 223 files; the isolated owned patch passes 5,121 / 162 available
files. Types, builds and four-file lint pass in both trees, with pre-existing
pending changes preserved outside this checkpoint. This does not implement
cross-document adoption or close the runtime/framework/site acceptance gates.
The prior denied SafeJS probe remains unrun; the full seven-day goal stays active.

### Previous preflight-cache checkpoint

Preflight-cache checkpoint: `FETCH-PREFLIGHT-CACHE.md` adds bounded per-owner
method/header permission reuse to the connected page fetch path. Exact URL,
serialized origin and credential matching preserve request isolation; actual
response CORS checks still run on hits. Expiry, quotas, conservative failure
invalidation and document teardown bound retention. Four initial regressions
fail before implementation; 54 new tests cover cache and page-fetch integration,
with 147 focused tests passing across six explicit files. Full native validation
passes 7,823 / 222 files; the isolated owned patch passes 5,063 / 161 available
files. Production/new-test types, builds and six-file lint pass in both trees.
Pre-existing pending changes stay outside this checkpoint. The denied SafeJS
fetch probe remains unrun and no report was produced. No runtime/dependency or
historical evidence is replaced; wider runtime/site acceptance and the seven-day
browser goal remain open.

### Previous fetch-ownership checkpoint

Fetch response ownership checkpoint: `FETCH-RESPONSE-OWNERSHIP.md` fixes retained
unpublished bodies, stale publication after provider-triggered closure, Buffer
byte aliasing and overridable slice calls. Response/clone capability creation now
has reserved admission, unpublished/revoked guards and idempotent failure cleanup;
failed clones preserve their originals. Invalid providers reject before document
cleanup registration. Eleven initial regressions and five provider-construction
regressions fail before their fixes; 38 new tests cover the resulting ownership
contract, and focused checks pass 93 / four files. Failed construction remains
charged to cumulative admission, but no longer retains unreachable body bytes.
Full native validation passes 7,769 / 220 files; the isolated owned patch passes
5,009 / 159 available files. Production/new-test types, builds and two-source lint
pass in both trees. Pre-existing pending changes remain outside this checkpoint.
This improves the already-connected page fetch path while observer scheduling
remains open. No runtime/dependency is replaced and no gated probe is run; wider
fetch/runtime/site acceptance and the full seven-day browser goal remain active.

### Previous observer-callback checkpoint

Observer-callback checkpoint: `SCRIPT-MUTATION-OBSERVERS.md` connects ScriptDom
observer capabilities, native queues and retained record views to ordered callback
prefixes. Unique admission survives shared/early-settling Promises; async tails do
not block later observers, and close interrupts pending prefixes without revival.
Native resource-startup errors and sparse materialized arrays have regressions and
fixes. Fifty-nine new native tests include a 250-callback admission sequence; focused
checks pass 229 / five files. The API remains native-only, not a page global.
Full native validation passes 7,731 / 219 files; isolated owned-patch validation
passes 4,971 / 158 available files. Production/new-test types, builds and four-source
lint pass in both trees, with existing pending work preserved outside this commit.
Read-only pinned upstream source lacks a public notification-enqueue hook and can
run callback prefixes directly in an active host phase. The local draft
`contributions/safejs-observer-checkpoint-request.md` specifies the missing public
contract; no issue was posted, and duplicate search remains incomplete after HTTP
422. Runtime job ordering, actual guest construction/conversion, error reporting,
reclamation and all broader acceptance gates remain open.

### Previous record-capability checkpoint

Mutation-record capability checkpoint: `SCRIPT-MUTATION-RECORDS.md` connects native
records to ScriptDom node identity, read-only record properties and static indexed
added/removed lists. Lifetime record/string/node budgets cover delivered output,
not just queued native records. Batch admission and snapshots precede capability
provider entry; tests reproduce and fix a reentrant later-record budget bypass
and three node-provider closure/result defects. Fifty new tests include identity,
quota atomicity, snapshots, primitive item indices, foreign-node rejection and
revocation; focused validation passes 193 / four explicit files.
Full native validation passes 7,672 / 218 files; the isolated owned patch passes
4,912 / 157 available files. Production/new-test types, builds and four-source lint
pass in both trees. Pending ScriptDom/index/task-ledger work remains excluded from
the isolated checkpoint and commit, without changing historical measurements.
This is a record capability layer, not page MutationObserver construction or
delivery. The local adapter contract lacks a guest-microtask hook; no host-task
approximation, SDK workaround or newly authorized probe was substituted. Actual
runtime scheduling, callbacks, guest conversions/iteration and retained-object
reclamation remain next, with all wider acceptance gates open.

### Previous observer-ownership checkpoint

Observer-ownership checkpoint: `DOCUMENT-OBSERVERS.md` adds native observer handles,
atomic option validation/replacement, ancestor/type/attribute filtering and
per-observer old-value selection. Detached-subtree transients preserve source
identity; bounded queues support takeRecords, disconnect and explicit release.
Capture overflow poisons and clears the owner without interrupting DOM writes,
with generic resource-limit errors at checked consumer boundaries. Delivery is
an explicit native checkpoint protocol, not page callbacks or a host-microtask
substitute. Seventy-three new tests cover ordering, retention, options, teardown
and admission; focused checks pass 172 / four files.
Final full native validation passes 7,622 / 217 explicit files; the isolated
owned patch passes 4,862 / 156 available files. Production/new-test types and
builds pass in both trees, with three-source lint clean. Existing pending work
remains outside the isolated snapshot and commit; no gated probes were run.
Next: runtime-correct scheduling and callback ownership, authenticated page
capabilities, option conversion and guest record retention. This does not expose
page MutationObserver or close framework, SafeJS or real-site acceptance gates.

### Previous mutation-capture checkpoint

Mutation-capture checkpoint: `MUTATION-RECORDS.md` adds immutable native records
for attributes, character data and child lists, including old strings, ancestry,
logical siblings and grouped fragment/replacement operations. Three baseline
failures and two later replacement-shape regressions are fixed. Fifty new
tests include collector bounds/errors, quotas, page/HTML integration and a 4,000
text-node normalization case; focused checks pass 261 / nine files. Broad tests
catch a self-insertion view-cache regression; logical record capture now preserves
the no-op cache identity and revision, with a dedicated regression.
Final full native validation passes 7,549 / 216 files; the isolated owned patch
passes 4,789 / 155 available files. Production/new-test types, build and three-source
lint pass. Pending pointer/activation changes remain outside the isolated patch
and commit; the original pending document additions/removals are preserved.
This is the shared capture layer, not a page MutationObserver implementation.
Next are observer filtering/options, transient registrations, bounded queues and
runtime-correct delivery. All existing framework/live/runtime gates remain open.

### Previous input-stepping checkpoint

Input-stepping checkpoint: `INPUT-STEPPING.md` adds page `stepUp`/`stepDown`
for all seven applicable input types, sharing constraints and numeric serializers.
Seven initial regressions fail before implementation. One hundred new native
cases cover signed counts, alignment/bounds, numeric limits, calendar conversion,
ownership, event silence, quotas and closure; focused checks pass 537 / seven
files. Full native validation passes 7,499 / 215 files; an isolated owned patch
passes 4,739 / 154 available files. Production/new-test types, working build and
four-source lint pass. Exact arithmetic rejects nonrepresentable targets without
mutation; pre-existing pending work is excluded from the isolated checkpoint.
Fractional calendar/endpoint and periodic-time behavior remain explicit compatibility
work, alongside guest coercion and real runtime/site/socket/TTY acceptance gates.

### Previous numeric-property checkpoint

Numeric-property checkpoint: `INPUT-VALUE-NUMBER.md` adds live `valueAsNumber`
for all seven applicable input types. Native tests cover numeric/calendar
conversion, range sanitization, primitive coercion, exception ordering, quotas,
dirty/default ownership, cloning/reset, event silence and closure. Seven initial
getter regressions fail before implementation; 98 new cases and 541 focused
tests across eight files pass. Full native validation passes 7,399 / 214 files;
isolated owned-patch validation passes 4,639 / 153 available files. Both production
and new-test type checks, working build and four-source lint pass. The isolated
snapshot excludes pre-existing pending work. The bounded UTC calendar profile is distinct from
the broader string/constraint profile; object coercion and further numeric/date
APIs remain open. No website/socket/TTY/SafeJS acceptance gate is closed.

### Previous slider-key checkpoint

Slider-key checkpoint: `RANGE-KEYBOARD.md` adds arrows, Home/End and page steps
to native ranges with bounded decimal arithmetic, shared constraints and an
explicit any-step/direction policy. The command capability and library export
describe the partial profile. Three initial regressions fail; 52 new cases cover
keys, events, cancellation, callbacks, numeric limits, quotas and command routing.
Focused checks pass 224 / six files; full native checks pass 7,301 / 213 files.
Isolated compilation exposed missing navigation/Alt admission in the older
committed keyboard parser; slider-scoped support preserves its non-range limits
without bundling the pending keyboard rewrite. The isolated owned patch passes
production/new-test type checks and 4,541 / 152 available native files. Working
build and six-source lint pass. Pointer dragging, orientation/presentation,
platform event fidelity and real runtime/site/socket/TTY gates remain open.
No unapproved acceptance probe ran.

### Previous range-fill checkpoint

Range-fill checkpoint: `RANGE-FILL.md` connects range controls to direct native
fill and command action-wait admission. Requests that need clamping or rounding
fail before the action write; readonly is correctly inapplicable to range while
remaining effective for text/calendar controls. Focus-time constraints revalidate
and committed input/change events preserve listener rewrites. Three initial
regressions fail; 42 new cases include an injected command host and atomic quota
failure. Focused checks pass 189 / six files; full native checks pass 7,249 / 212
files. The isolated owned patch passes production/new-test type checks and 4,489 /
151 available native files. Build and four-source lint pass. Slider pointer/
keyboard interaction, presentation, numeric page methods and real runtime/site/
socket/UI acceptance remain open. No unapproved probe ran.

### Previous range-state checkpoint

Range-state checkpoint: `INPUT-RANGE.md` adds midpoint defaults, clamping and
exact decimal step alignment to range values. The native value owner preserves
current state across min/max/step/default edits, resets, type changes and Attr
operations. Range page assignments and input min/max/step reflection use the same
state. A same-attribute quota preflight closes a current-value allocation gap.
Three initial regressions fail before implementation; 60 new cases include a
finite-grid oracle and owner/atomicity coverage. Focused checks pass 437 / seven
files; full native checks pass 7,207 / 211 files. The isolated owned patch passes
production/new-test type checks and 4,447 / 150 available native files. Build and
nine-source lint pass. Range user actions/presentation/numeric methods, color and
pattern profiles, precision parity and runtime/site/socket/UI gates remain open.
No unapproved acceptance probe ran.

### Previous calendar-fill checkpoint

Calendar-fill checkpoint: `CALENDAR-FILL.md` connects all five calendar types to
native sync/async fill and the command action-wait gate. Values normalize before
the write, targets revalidate after focus callbacks, and direct input/change
commits avoid duplicate blur changes without erasing listener-created text edits.
Six initial regressions fail; 51 new cases include controlled async prefixes,
quota failures and an injected command host. Focused checks pass 261 / seven files;
the final full native suite passes 7,148 / 210 files. After removing a test-only
dependency on pre-existing placeholder work, the isolated owned patch typechecks
and passes 4,388 / 149 available native files. Build, strict new-test types and
five-source lint pass. Calendar character editing/pickers/numeric APIs, broader
fill types and actual runtime/site/socket/UI acceptance remain open. No unapproved
probe ran.

### Previous calendar-validation checkpoint

Calendar-validation checkpoint: `CALENDAR-VALIDITY.md` adds date/month/week/time/
local-datetime range and step flags to native forms and live page validity. Time
ranges can span midnight; independent range/step failures coexist. Calendar
arithmetic handles large years with bounded modular intermediates and no host
timezone dependency. Five initial regressions fail before implementation; 101
new cases include independent two-cycle day/week oracles and large-year checks.
Focused validation passes 470 / seven files; full native validation passes
7,097 / 209 files. The isolated owned patch typechecks and passes 4,337 / 148
available native files. Build, strict focused-test types and five-source lint
pass. Calendar editing/pickers/numeric page APIs, pattern/range/color profiles and
runtime/site/socket/UI acceptance remain open. No unapproved probe ran.

### Previous text-length checkpoint

Text-length checkpoint: `TEXT-LENGTH.md` adds native minlength/maxlength flags
with document-owned user-edit provenance, shared keyboard integer-limit parsing
and normalized API-value counting. Script assignments, including same-string
writes, clear provenance; canceled actions and rejected quota writes preserve it.
Reset, clone/import, type sanitization and close follow the native value owner.
All four initial regressions fail before implementation; 63 new cases pass.
Focused checks pass 381 / seven files; full native checks pass 6,997 / 208 files.
The isolated owned patch typechecks and passes 4,237 / 147 available native files.
Build, strict focused-test types and nine-source lint pass. Pattern and calendar
profiles, page length reflection, richer validation APIs and actual runtime/site/
socket/UI acceptance remain open. No unapproved acceptance probe ran.

### Previous live-validity checkpoint

Live-validity checkpoint: `VALIDITY-STATE.md` exposes stable readonly page validity
objects backed by shared native flags, rather than a single prioritized reason.
Numeric range/step and custom errors can coexist. Required-state evaluation now
distinguishes immutable controls and radios without a group name. Four initial
page regressions fail; 45 new cases include per-revision caching, bounded factory
admission, reentrancy and a reproduced escaped-getter revival fixed by state identity.
Focused validation passes 324 / seven files; full native validation passes
6,938 / 207 files. The isolated owned patch typechecks and passes 4,178 / 146
available native files. Build, strict test types and targeted lint pass. Unsupported
constraint profiles and per-flag queries within them, UI bad input, synchronous page
checks, complete reporting/WebIDL behavior and actual runtime/site/socket/UI gates
remain open. No unapproved acceptance probe ran.

### Previous custom-validity checkpoint

Custom-validity checkpoint: `CUSTOM-VALIDITY.md` adds document-owned custom
messages with normalized, atomic retained-text accounting. Page setters and
candidacy/message getters share native submission state; native check-validity
actions support synchronous or awaited controlled callbacks without submitting.
All six initial regressions fail. Fifty-three new cases cover candidate states,
detached trees, quotas, defaults/reset, cloning, closure and invalid-event ordering.
Focused validation passes 279 / six files; full native validation passes
6,893 / 206 files. The isolated owned patch typechecks and passes 4,133 / 145
available native files. Build, strict test types and targeted lint pass, preserving
pre-existing import order. Synchronous page checkValidity, full multi-flag validity,
localized/reporting UI, remaining constraints and actual runtime/site/socket/UI
acceptance remain open. No guest callback is treated as synchronously completed;
no unapproved acceptance probe ran.

### Previous numeric-constraint checkpoint

Numeric-constraint checkpoint: `INPUT-NUMBER.md` enables native number submission
checks for min/max/step instead of rejecting nonempty controls as unsupported.
Strict value admission remains shared; numeric attributes follow the distinct
HTML prefix parser. Bounded canonical-decimal arithmetic handles tiny steps and
overflowing differences without rounding a quotient into false validity. Seven
initial submission regressions fail; the two existing newline guards already pass.
The new 110-case file includes 5,265 lattice combinations, finite extremes, long
inputs, dynamic constraints, page values, defaults/reset and event ordering.
Focused validation passes 331 / seven files; full native validation passes
6,840 / 205 files. An isolated owned patch typechecks and passes 4,080 / 144
available native files. Build, strict test types and targeted lint pass. Numeric
precision parity, UI bad input, page validity/conversion/stepping, calendar
constraints and actual runtime/site/socket/UI gates remain open. No unapproved
probe ran; numeric validation does not imply those broader acceptance gates.

### Previous email-value checkpoint

Email-value checkpoint: `INPUT-EMAIL.md` adds native single/multiple-address
validation for form submission and corrects multiple token sanitization. Toggling
multiple no longer resurrects old whitespace; current/default dirtiness, copying,
reset and quota admission share the existing state owner. Eight baseline cases
fail; sixty-three new cases cover syntax, submit events, page properties, long
inputs and linear edge trimming. The reviewed native form-submit suite is now
explicitly allowlisted, with obsolete unsupported-email and raw-calendar fixtures
updated. Focused validation passes 239 / seven files; the final full native run
passes 6,732 / 204 files. An isolated owned patch typechecks and passes
3,972 / 143 available native files. Build, strict test types and targeted lint
pass. An earlier mixed-source run timed out on the new whitespace regression;
test limits were not increased. Email pattern/length/IDN UI behavior and actual
runtime/site/socket/UI acceptance remain open; no unapproved probe ran.

### Previous calendar-value checkpoint

Calendar-value checkpoint: `INPUT-CALENDAR.md` adds shared date/month/week/time/
local-datetime sanitization and native page setters without host Date/timezones.
Invalid input clears; local datetime normalizes; defaults, dirty state, copying,
reset and submission retain the existing native ownership rules. All 21 initial
regressions fail before the fix. Seventy-five new cases include 24,000 month-end
candidates across a full Gregorian cycle, week boundaries and 100,000-digit years.
Focused validation passes 175 / four files; full native validation passes
6,641 / 202 files. The isolated owned patch typechecks and passes 3,881 / 141
available native files. Build, strict test types and targeted lint/format pass.
Calendar constraints/pickers/fill/type, numeric/date conversion, range/color
sanitizers and actual runtime/site/socket/UI gates remain open. No unapproved
probe ran; form-data serialization does not establish validated-submit support.

### Previous input-type value checkpoint

Input-type value checkpoint: `INPUT-TYPE-VALUES.md` adds a native value-state owner
and shared mode/sanitizer helpers. Type changes transfer reflected defaults,
reset or preserve dirtiness appropriately and do not resurrect sanitized text.
File-mode reads do not expose value attributes as selected files. Thirteen
baseline regressions fail; thirty-six new cases cover mutation paths, reset,
copy/import, submission, exact retained-text costs, quota atomicity and closure.
Focused validation passes 181 / seven files; full native validation passes
6,566 / 201 files. The isolated owned patch
typechecks and passes 3,806 / 140 available native files. Build, strict test types
and targeted lint/formatting pass with pre-existing import order retained.
Complete sanitizers, native FileList, cursor state, non-type constraint mutations
and actual runtime/site/socket/UI acceptance remain open; no unapproved probe ran.

### Previous explicit-form cache checkpoint

Explicit-form cache checkpoint: `RADIO-FORM-CACHE.md` removes repeated root scans
for stable form-ID dependencies, including cached missing IDs and radios with
unrelated unique IDs. Five initial performance cases fail; twenty-five new cases
cover invalidation, negative results, retention, failure and closure. Constructing
1,000 radios drops from 523,499 to 21,002 native node reads; 100 group-name edits
after unrelated ID insertion drop from 51,200 to 900. Focused validation passes
60 / two files; full native validation passes 6,530 / 200 files. The isolated
patch typechecks and passes 3,770 / 139 available native files. Build, strict test
types and targeted lint/formatting pass. Cold/relevant-ID lookup, broader
structural scaling, parser form associations and actual runtime/site/socket/UI
acceptance remain open; no unapproved probe ran.

### Previous radio-state checkpoint

Radio-state checkpoint: `RADIO-STATE.md` fixes the reproduced radio selection bug
with a native checkedness owner that separates dirty/default/automatic peer state.
Attribute transitions, group/form/root changes, reset, clone/import and canceled
activation preserve actual selection rather than recomputing it from defaults.
Eight baseline cases failed; thirty-five new cases include 500 deterministic
model transitions and a 2,001-radio switch requiring at most six native node reads.
Focused validation passes 196 / nine files; full native validation passes 6,505 /
199 files. The isolated owned patch typechecks and passes 3,745 / 138 available
native files. Build, strict test types and targeted lint/formatting pass; existing
import ordering is preserved. Parser form associations, repeated structural work,
input type value transitions and actual runtime/site/socket/UI gates remain open.
No unapproved probe ran.

### Previous form-default checkpoint

Form-default checkpoint: `FORM-DEFAULTS.md` adds input defaultValue/defaultChecked
and textarea defaultValue through shared attribute/text owners. Clean textarea
values now ignore nested element text. Seven baseline reproductions fail;
forty-four new cases cover dirty state, reset, native submission, serialization,
checked selectors, quotas and closure. Focused validation passes 112 / six files;
full native validation passes 6,470 / 198 files. Build, strict test types and
targeted lint/formatting pass. An isolated test's
dependency on uncommitted placeholder support was removed; the corrected isolated
patch typechecks and passes 3,710 / 137 available native files. A separate native
reproduction exposes existing radio checked-attribute mutation ordering: the
earlier clean radio does not take selection from a later checked peer. Correct
the shared checkedness/dirty-state owner next. Actual runtime/site/socket/UI
acceptance and full form compatibility remain open; no unapproved probe ran.

### Previous numeric-reference checkpoint

Numeric-reference checkpoint: `HTML-NUMERIC-REFERENCES.md` adds missing-digit,
control and noncharacter diagnostics without changing decoded values. Discarded
duplicate attribute values now retain reference issues; their first value still
wins. Twenty-three initial reproductions failed; fifty-eight new cases now pass,
including every noncharacter, C0/C1 mappings and split-input retry behavior.
After correcting one ambiguous named-reference fixture, focused validation passes
185 tests / six files; full native validation passes 6,426 / 197 files. The
isolated patch passes typechecking and 3,666 tests / 136 available native files.
Build, strict test types and targeted lint/formatting pass. Full parser recovery,
source-input diagnostics and actual runtime/site/socket/UI acceptance remain
open; no unapproved probe has run.

### Previous attribute-order checkpoint

Attribute-order checkpoint: `ATTRIBUTE-ORDER.md` adds native getAttributeNames
and a shared ordered attribute representation without Proxy value dictionaries.
Integer-like names retain their slots across tokenization, mutation, frozen
snapshots, NamedNodeMap indices, Attr comparison, cloning/import and serialization.
After correcting a serializer fixture option, eight baseline reproductions failed
against original HEAD; twenty-five new cases now pass. Focused validation passes
196 tests / six files; full native validation passes 6,368 / 196 files. The
isolated patch passes typechecking and 3,608 tests / 135 available native files.
Build, strict test types and targeted lint/formatting pass. Namespace duplicates,
full WebIDL/prototypes and actual runtime/site/socket/UI gates remain open; no
unapproved probe has run.

### Previous attribute-contract checkpoint

Attribute-contract checkpoint: `ATTRIBUTE-OPERATIONS.md` adds native toggling and
presence queries, required-argument guards and own-attribute reads. Ten initial
reproductions failed; two additional failures exposed inherited-property leakage.
Forty-four new cases now cover no-op identity, control/style state, coercion,
Unicode names, closure and failure atomicity. Focused validation passes 121 tests
/ five files; full native validation passes 6,343 / 195 files. The isolated patch
passes typechecking and 3,583 tests / 134 available native files. Build, strict
test types and targeted lint/formatting pass. Attribute enumeration/order,
namespaces and actual SafeJS/site/socket/terminal/UI gates remain open; no
unapproved probe has run.

### Previous element-traversal checkpoint

Element-traversal checkpoint: `ELEMENT-TRAVERSAL.md` adds readonly native
element-child and element-sibling access, including CharacterData sibling lookup.
Eight initial reproductions failed; thirty-one new cases cover identity, mutation,
closure, cache bounds and recovery. An independently instrumented 3,000-child walk
builds once and uses 10,003 native tree reads, not repeated full sibling scans.
Focused validation passes 119 tests / five files; full native validation passes
6,299 / 194 files. The isolated patch passes typechecking and 3,539 tests / 133
available native files. Build, strict test types and targeted lint/formatting pass.
Live NodeLists, prototypes, actual SafeJS, framework/site, socket and terminal/UI
acceptance remain open; no unapproved probe has run.

### Previous dataset checkpoint

Dataset checkpoint: `DATASET.md` adds live native data-attribute properties with
bounded named setters/deleters, Attr identity, selector/serialization consistency
and failure atomicity. Shared attribute-name normalization now folds only ASCII,
preserving distinct Unicode names through parsing, creation and lookup. Sixteen
initial reproductions failed; forty-six new cases pass. Two reviewed offline
files restore nine omitted cases to the explicit allowlist. Focused validation
passes 132 tests / six files; full native validation passes 6,268 / 193 files.
The isolated patch passes typechecking and 3,508 tests / 132 available native
files. Build, strict test types and targeted lint/formatting pass. Actual SafeJS
named-property, framework/site, socket and terminal/playground gates remain open;
no unapproved probe has run.

### Previous live-collection checkpoint

Live-document-collection checkpoint: `DOCUMENT-COLLECTIONS.md` adds native links,
scripts, anchors, embeds and the plugins alias using the existing bounded owner.
Seventeen initial reproductions failed; thirty-eight new tests cover live member
updates, identity, filtered lookup, closure and resource-failure recovery. Focused
validation passes 104 tests / four files; the full native working tree passes
6,213 tests / 190 files. An isolated owned-patch snapshot passes typechecking and
3,453 tests / 129 available native files. Build, strict test types and targeted
lint/formatting pass. Guest-runtime, namespaces, framework/site, real socket and
terminal/playground acceptance remain open; no unapproved probe has run.

### Previous structural-document checkpoint

Structural-document checkpoint: `DOCUMENT-ELEMENTS.md` adds native body replacement
and direct-child head/body selection, sharing helpers with document title creation.
Eleven initial regressions failed; thirty-four new cases cover identity, moves,
no-op behavior, resource/cycle failures, native focus and downstream tree consumers.
Focused validation passes 109 tests / five files. The full working tree passes
6,175 tests / 189 native files with no unhandled errors. After correcting a setter
type annotation, build, strict test types and source lint/formatting pass. Foreign
adoption, DOMException parity, frameset browsing, guest-runtime, real-site, socket
and UI acceptance remain open; no unapproved live probe has run.

### Previous title checkpoint

Document-title checkpoint: `DOCUMENT-TITLE.md` adds live `document.title` and
`HTMLTitleElement.text`, with shared extraction semantics, literal mutation,
native identity and bounded atomic creation. Twenty initial cases failed before
implementation; thirty-two new cases now pass. Fourteen reviewed native extraction
tests are restored to the explicit allowlist without revising historical counts.
Focused validation passes 86 tests / four files; the full working tree passes
6,141 tests / 188 native files with no unhandled errors. Build, strict test types
and source lint/formatting pass. Guest-runtime, SVG/XML, real-site, socket and UI
acceptance remain open; native parser hooks do not count as SafeJS execution.

### Previous comment checkpoint

HTML comment checkpoint: `HTML-COMMENTS.md` replaces the closing-marker shortcut
with native comment states, preserving following markup, unfinished delimiters,
bogus-comment recovery and split-input diagnostic ordering. Nineteen initial
ordinary-comment and eight bogus-comment regressions failed before correction;
two intermediate rescan-accounting failures were also corrected. Seventy-seven
new native cases pass. Focused validation passes 205 tests / six files; the full
working tree passes 6,095 tests / 186 explicit native files with no unhandled errors.
Build, strict test types and two-source lint/formatting pass. Parser-write hooks
are native fixtures, not SafeJS execution. Processing instructions, template and
framework support, real-site, runtime, socket and UI acceptance remain open.

### Previous named-reference checkpoint

HTML named-reference checkpoint: `HTML-ENTITIES.md` adds the complete reviewed
WHATWG mapping, longest matching and attribute ambiguity handling to the shared
native parser. Twenty initial regressions failed; fifty new cases cover all 2,231
spellings, all parser-input splits, dynamic HTML and existing numeric behavior.
Focused validation passes 128 tests / five files; the full working tree passes
6,018 tests / 185 explicit native files with no unhandled errors. Build, strict
test types, five-source lint/format and byte-for-byte offline regeneration pass.
No runtime dependency is added. Template/framework, numeric diagnostic, released
SafeJS, real-site, socket and UI acceptance gates remain open. The unapproved
state-transport probe has not run.

### Previous timer checkpoint

Timer-ownership checkpoint: `TIMER-OWNERSHIP.md` reserves pending callbacks before
runtime entry, retains both completion phases and revokes records/alarms on close.
Seven native reproductions failed before the correction. Twelve new timer cases
pass alongside thirteen previously omitted cases; the reviewed fake-timer file is
now explicitly allowlisted. Focused validation passes 112 tests / five files;
the full native working tree passes 5,968 tests / 184 files with no unhandled errors.
Build, strict timer-test checking and source lint/formatting pass. These are native
ownership checks, not SafeJS, socket or website evidence. The state-transport probe
still requires new explicit authorization and has not run.

### Previous transport preparation

State-transport preparation: `STATE-TRANSPORT.md` and its separately gated script
cover real foreground-service/CLI state round trips, failure atomicity, isolation,
restart and private-file cleanup. Build, source formatting/lint and refusal without
the explicit probe flag pass. The socket/process authorization was declined:
the probe did not run and no live report was generated. Obtain new explicit
authorization before executing it. Native counts below are prior evidence,
not a new run or proof that these acceptance checks pass.

### Previous callback checkpoint

Callback-ownership checkpoint: `CALLBACK-OWNERSHIP.md` reserves admission and source
prefix barriers before runtime callback entry, counts invocations independently of
Promise identity, and releases admission only after both completion phases settle.
Four native reproductions failed before the fix; thirteen new cases now pass,
including reentrant startup, malformed phases, shutdown and 1,000 sequential calls.
Focused validation passes 83 tests / four explicit native files. Build, strict
runtime-test checking, test-file lint and two-source formatting pass; pre-existing
PageScripts import-order warnings are preserved.
The full working tree passes 5,943 tests / 183 explicit native files, with no
unhandled errors. No actual SafeJS or live acceptance probe is claimed.
The isolated change passes typechecking and 3,183 tests / 122 available allowlisted
files without the pre-existing unfinished feature work.

Next: approved released-SDK callback/lifetime and retained-graph performance gates,
plus real state-transfer socket/process and authentication acceptance. Native
adapter-contract tests are not evidence for those runtime, site or portability gates.

### Previous state-transfer checkpoint

State-transfer checkpoint: `STATE-TRANSFER.md` connects CLI `state-save`/`state-load`
to the private-file and atomic-owner layers. Transfers reserve bounded memory,
expire, are revoked on session recreation, and validate chunks/acknowledgements without
automatic commit replay. Actual CLI-entry tests round-trip more than 2 MiB through
an injected service and real private temporary files. HTTP and process frame limits
are checked separately; P12 is partial, not complete.

Forty-one new cases pass; focused regressions pass 225 tests / seven files. The
full working tree passes 5,930 tests / 183 explicit native files. Production build,
strict new-test checking, seven-source lint and eight-source formatting pass;
unrelated command-host import-order warnings remain preserved.
The isolated change passes typechecking and 3,170 tests / 122 available allowlisted
files without pre-existing unfinished features. No live/runtime probe is claimed.

Next: authorized real socket/process/runtime state round trips and authentication
reuse, then the plan's SafeJS compatibility and execution-cost gates. Native
injected-service/actor tests do not substitute for those acceptance gates.

### Previous state-file checkpoint

State-file checkpoint: `STATE-FILES.md` adds Node-only private JSON file save/load
for cookie/local-storage owners, with a 128 MiB ceiling, Unix ownership checks,
symlink/hard-link refusal, exclusive creation and explicit atomic overwrite.
Forty-six new native cases pass; focused state/cookie/storage coverage passes
135 tests / four explicit files. The UID-mapped sandbox fails the strict directory
policy; the authorized real-ownership run passes without weakening it.
The full native suite passes 5,889 tests / 181 files. Production build, strict new
test checking, two-source lint/format and package-subpath import checks pass.
The isolated change passes typechecking and 3,129 tests / 120 available allowlisted
files, without pre-existing unfinished features. No live/runtime gate is claimed.

Next: bounded session-scoped state transfer over command/process protocols, then
CLI `state-save`/`state-load` integration. Library file tests do not complete P12,
real authentication reuse, portability or live/runtime acceptance gates.

### Previous browser-state checkpoint

Browser-state checkpoint: `BROWSER-STATE.md` adds combined native cookie/local-storage
export and all-or-nothing replacement. Both owners validate before either changes;
existing owner identities and storage handles survive, session storage is retained,
and failed imports leave storage revisions unchanged. Local-state records reject
accessors and malformed arrays, with aggregate quotas enforced while staging.

Forty new cases pass; focused cookie/storage coverage passes 157 tests / five files.
The full working tree passes 5,843 tests / 180 explicit native files. Production
build, strict focused-test checking and five-source lint/format checks pass.
The isolated change passes typechecking and 3,083 tests / 119 available allowlisted
files without the pre-existing unfinished work. No live/runtime probe is claimed.

Next: private CLI `state-save`/`state-load` round trips with bounded reads, private
permissions, atomic writes and symlink/failure handling. Real authentication reuse
and live website, socket, real TTY/PTY and SafeJS acceptance gates remain open.

### Previous cookie-state checkpoint

Cookie-state checkpoint: `COOKIE-STATE.md` adds bounded native export and atomic
replacement, preserving host/path/security data, creation order and absolute
expiry without exposing state to page JavaScript. Thirty-nine new cases pass;
cookie/storage regressions total 104 tests across three files. The full working
tree passes 5,803 tests / 179 explicit native files, while the isolated staged
change passes 3,043 tests / 118 available files. Build, strict cookie-test checks
and three-file lint/format checks pass. No live/runtime probe is claimed.

Next: combine cookie and local-storage validation before either owner changes,
then implement private CLI `state-save`/`state-load` file round trips. This native
primitive does not complete those CLI or real authentication acceptance gates.

### Previous playground-tab checkpoint

Node-relations checkpoint: `contains`, `compareDocumentPosition`, `isSameNode`
and `isEqualNode` work on document/fragment/element/text/comment/attribute
capabilities. Bounded iterative traversal, owner revocation and live ordering are
tested, including actual experimental-SafeJS keyed reconciliation with native
snapshot evidence. Initial and final broad validation pass 3,004 tests across 117
explicit safe files; final/repeat actual-core probes pass 14 checks each. Build,
strict test typing, lint, formatting and whitespace checks pass. See
`NODE-RELATIONS.md`; this does not close framework, SDK, real-site or full DOM gates.

## Previous JPEG-performance checkpoint

JPEG performance checkpoint: scaled inverse transforms and cached chroma rows
replace repeated arithmetic. The measured one-megapixel image now decodes in
30,444,593 work units under the unchanged 33,554,432-unit page guard. Saved before
pixels match all 252 fixtures and the photo exactly. The actual experimental-SafeJS
agent loads the photo, sees its geometry, and exports verified PNG/PDF pixels.
Final validation: 2,924 tests pass across 116 explicit safe files; independent
252-fixture and actual-runtime 30-check probes pass twice. Paired five-run medians
are 81.356/78.170 ms versus the saved 155.700 ms baseline, with unchanged pixels
and resource limits. Build, strict test typing, lint and formatting pass.
See `JPEG-PERFORMANCE.md`; remaining graphics/codec, host, SDK and real-site gates
remain open. The full goal is still active.

## Previous JPEG-codec checkpoint

JPEG checkpoint: native TypeScript handles 8-bit Huffman baseline, extended-
sequential and progressive JPEG, grayscale/RGB/YCbCr, restart markers and bounded
coefficient reconstruction. PNG/JPEG share the page resource and renderer paths.
Independent Pillow comparisons cover 252 fixtures; actual experimental-SafeJS
loader/agent checks include both JPEG modes in PNG/PDF captures. See
`JPEG-DECODING.md`. The one-megapixel standalone benchmark exceeds the stricter
default page work budget; that large-photo gate remains open. So do remaining
formats/graphics, released-SDK and live-site acceptance. The goal remains active.

Validation: 2,831 tests pass across 114 explicit safe files, with 86 new JPEG cases.
The 252-fixture independent matrix and 26-check actual experimental-SafeJS agent
probe both pass twice. Eleven responsive/capture regression checks also pass.
Build, strict changed tests, lint/format, Python syntax and whitespace checks pass.
The measured large-photo page-budget failure remains explicit in both independent
reports; no decoder budget or acceptance criterion was relaxed to hide it.

## Previous loaded-image checkpoint

Loaded-image checkpoint: decoded page-owned PNGs now become normal-flow inline or
block replaced boxes, with intrinsic-ratio sizing, constraints, HTML dimension hints,
baseline/atomic wrapping and live geometry. Actual resource pixels flow through
shared document PNG/PDF painting, including alpha, padding and source replacement.
Eighteen actual experimental-SafeJS loader/agent assertions pass. See `IMAGE-LAYOUT.md`.
General image formats, responsive sources, fallback layout, full CSS/font/graphics
coverage, released-SDK and live-site acceptance remain open; the goal stays active.

Final validation: 2,745 tests pass across 112 explicit safe files, with 82 new
image-sizing/raster/layout cases. Eighteen actual experimental-SafeJS checks pass
twice, including real PNG transfers and exact PDF visual pixels. Eleven existing
responsive/capture checks pass. Build, strict changed tests, fifteen-file lint and
format checks, and whitespace checks pass. Initial failed fixture/capability tests
remain recorded separately; no live-site or released-SDK claim is added.

## Previous image-resource checkpoint

Image-resource checkpoint: the HTML/session loader now owns decoded PNG resources,
shared transfers, source replacement, cancellation and bounded retention. Live guest
image properties, decode promises, load/error handlers and `document.images` connect
to those resources. The new `images` command and image request journal expose actual
state. Real experimental-SafeJS loader/agent checks pass; image layout and painting
were still unsupported at this checkpoint. See `IMAGE-RESOURCES.md` for evidence.

Final validation: 2,663 tests pass across 109 explicit safe files, with 35 new
image-owner/session cases. Twelve actual experimental-SafeJS image checks pass
twice; eleven existing responsive/capture checks also pass. Build, strict changed
tests, lint, formatting and whitespace checks pass. The initial failed quota-cleanup
report is retained alongside final evidence; no live-site or released-SDK claim is added.

## Previous PNG-codec checkpoint

PNG codec checkpoint: native TypeScript decodes all legal static PNG color/depth
combinations, five filters, Adam7, palettes/transparency and stored/fixed/dynamic
zlib data. Exact-length allocation, checksums, stream validation and bounded work
protect the decoder. Independent Pillow checks validate actual pixels both ways.
`PNG-DECODING.md` lists the still-open page resource, HTML image, layout/compositing
and real-site integration tasks. Codec acceptance does not close K08 or the goal.

Validation: 2,613 tests pass across 106 explicit safe files, including 208 new codec
cases. Fifteen independent/native probe assertions pass, with exact pixel agreement
for 110 generated PNG fixtures and six independently encoded Pillow image modes.
The final suite and independent probe repeat successfully; thirteen existing
experimental-SafeJS PNG/PDF background assertions also pass. Build, strict changed
tests, lint, formatting and whitespace checks pass without adding a dependency.

## Previous compiled-media checkpoint

Compiled-media checkpoint: stylesheet and page media queries now share bounded
numeric comparisons, chained ranges, grouped Boolean conditions, aspect ratios
and native resolution. Page lists reuse compiled predicates instead of rescanning
query text for each read/notification. Eighty-seven new native cases pass; eleven
actual-core agent-command checks prove responsive callbacks, snapshots and native
PNG changes/restoration. Five native resource assertions pass. The local API
microbenchmark is not a browser-wide speedup or Worker acceptance claim.
`MEDIA-RANGES.md` records limits and remaining conformance/runtime/site gates.

Final validation: 2,405 tests pass across 104 explicit safe files. Quoted, escaped
and nested commas cannot become accidental matching query alternatives. Build,
strict changed-test checks, lint and formatting pass. The separate actual-core
alias regression retains thirteen passing behavior checks and one failing function
identity assertion; no released-SDK or live-site acceptance is claimed.

## Previous viewport-controls checkpoint

Playground viewport checkpoint: the UI now reads confirmed per-tab dimensions,
maintains explicit drafts/presets, and applies sizes through the actual agent API.
The new read-only viewport command returns an opaque owner/tab key. Guarded resize
rejects changed targets even when session-local tab IDs repeat after switching or
recreating a session. Mocked-UI/native-host tests cover resized PNG bytes, draft
preservation, stale capture revocation, delayed replies and disconnect. Actual-core
command evidence remains separate from the known media function-identity failure.
See `VIEWPORT-CONTROLS.md`; no live-site, visual UI or Worker claim is added.

Validation: 2,318 tests pass across 103 explicit safe files, with 14 new viewport
cases. Ten actual-core guarded-command assertions pass twice; frames are at most
1,347 bytes. Build, strict changed-test checks, lint and formatting pass. The
existing experimental-core function-alias identity failure remains a separate gate.

## Previous responsive-media checkpoint

Responsive media checkpoint: global/Window matchMedia, live readonly query lists,
Window dimensions, resize/change callbacks and legacy listeners now share native
CSS/event owners. The existing agent resize path schedules coalesced notifications;
orientation and initial-font em/rem dimensions also work in stylesheets.
Twenty-eight new native cases cover ordering, limits and cleanup. The actual
experimental-core probe records 13 successful behavioral checks and one retained
function-alias identity failure, leaving its overall result false. Do not count it
as full runtime acceptance or work around the SDK. See `MEDIA-QUERIES.md`.

All 2,304 tests in 103 explicit safe files pass. A separate nine-assertion
actual-core command probe proves resize-driven callbacks, snapshots, chunked PNG
changes/restoration and session cleanup over mocked transport; frames are at most
1,347 bytes. The full runtime probe retains its one identity failure.
No dependency, released-runtime switch, live-site or Worker claim is added.

## Previous solid-background checkpoint

Solid-background checkpoint: shared stylesheet/inline `background` expansion now
resets all eight components, preserves importance/order and exposes live owned
CSSOM aliases, shorthand removal and readonly computed values. Native PNG/PDF
outputs change with actual interpreted setters and return to identical bytes when
the color is restored. Thirteen actual experimental-core assertions pass.
`BACKGROUNDS.md` records the initial-only non-color profile: images, layers and
general background geometry remain unsupported. This resolves the specific
`background:red` fixture gap without rewriting its historical failed evidence.
No new live-site, Worker or released-SDK acceptance is claimed. All 2,276 tests
in 102 explicit safe files pass, including 30 new background cases. Both actual
background runs and the updated computed-style regression pass 13 assertions each.

## Previous PDF checkpoint

PDF checkpoint: the engine now produces real paginated PDF files, exposed through
the `pdf` command, private atomic CLI writes and playground downloads. Page images
come from native painting; compact positioned text remains independently
extractable. All pages reuse one layout, avoid cutting supported text intervals,
and obey page/pixel/glyph/work/output quotas. PNG/PDF share artifact capacity.

Eight real production-binding/experimental-SafeJS assertions pass with independent
Ghostscript parsing, exact three-page pixel comparisons and actual guest-modified
text extraction. They pass again after layout reuse and text compaction. Native
and mocked-client/UI tests cover xrefs, streams, errors, resource limits, large
chunked transfers, owner scope and private no-overwrite files.

The 1,000-row/20-page native fixture exports 781,334 bytes after text compaction,
versus 2,143,028 bytes before. Its current single-run time is 608.340 ms and peak
RSS 126,792 KiB; this does not prove Worker fit or a speed/memory improvement.
`PDF.md` records the evidence and limitations. Print CSS/full fonts, real-site/
live-frontend, released-SDK and full reference-parity gates remain open. No runtime
dependency or service was added; Ghostscript is an existing test validator only.

Final validation passes 2,246 tests across 101 safe files, plus build, strict
changed-test typechecking, focused lint/format and whitespace checks. Prior
actual-core PNG export and CharacterData/pixel probes pass nine and fifteen
checks after the final build. Recorded compact PDF/preview digests are verified.

## Previous checkpoints

Character-data checkpoint: text/comment capabilities now expose live data/length
and substring/append/insert/delete/replace methods. Text adds identity-preserving
splitting and contiguous wholeText; Node adds subtree normalization with retained
detached identities and whole-operation text-quota preflight.

Fifteen actual-core checks pass through production page bindings. Guest edits
change snapshots, measured layout and real capture sizes; splitting/normalization
preserve every pixel. Native tests cover UTF-16, argument conversion, exceptions,
resource failures, cleanup and a 5,000-node normalization run. The first probe's
unsupported fixture CSS shorthand rejection is retained; the corrected fixture
uses the existing supported longhand. `CHARACTER-DATA.md` records the profile.
No dependency, live service, mutation observer, Range or framework/site acceptance
was added or claimed. Full reference, released-SDK and Worker gates remain open.

2,209 tests pass across 98 safe files, including 22 new cases. Build, strict
changed-test typechecking, focused lint/format and whitespace checks pass. The
final-build actual-core repeat passes all 15 assertions; prior frame, size and
computed-style probes pass 11, 11 and 13 checks.

Animation-frame checkpoint: page-global and Window aliases now expose bounded
`requestAnimationFrame`, `cancelAnimationFrame` and a shared `performance` clock.
Ordered batch snapshots share one timestamp, observe cancellation, defer new
registrations and advance on callback prefixes rather than async results. The
clock anchors before lazy setup and is revoked with the page.

2,187 tests pass across 97 safe files. Native tests cover quotas, controlled
callback phases, invalid clock readings and a 512-callback batch using one alarm.
Actual production-binding probes pass 10 then 11 assertions on the existing
experimental SafeJS core, with all 11 repeated after the final build. Guest callbacks
change measured layout and real capture pixels; cancellation, ordinary rejection
isolation, readonly origin and cleanup pass. `ANIMATION-FRAMES.md` documents the
partial software-frame profile. No automatic painting, released-SDK async-tail
conformance, public-site or Worker acceptance is claimed.

Build, strict changed-test typechecking, focused lint/format and whitespace checks
pass. The post-format focused selection passes 125 tests across six files; prior
actual-core sizes, computed-style and geometry probes pass 11, 13 and 13 checks.

Element-size checkpoint: six client/offset size getters now read actual native
layout and are included in agent `geometry` inspection. Padding/content sizing,
integer rounding, root viewport handling, inline zeros and degenerate-fragment
unions have dedicated coverage. Lazy revision caching avoids DOMRect allocations
and repeated scans while preserving explicit unsupported-layout failures.

2,151 tests pass across 95 safe files, including 23 new cases. Eleven checks pass
through production page bindings and the existing experimental SafeJS core, with
a repeat; existing computed-style and geometry probes pass 13 each. Fourteen
native resource assertions validate shared layout, bounded lazy records and close
cleanup. Build, strict changed tests, lint and formatting pass. `ELEMENT-SIZES.md`
records the current profile and measurements; full browser/site/Worker gates remain.

Read-only upstream verification also confirms #550 closed at September 2,
19:43:35 UTC. Its final maintainer comment reports scoped SafeJS 0.1.40 released
with consumers/provenance verified upstream. The checked workspace/global roots
still lack that artifact, so no local release acceptance or default activation is
claimed. No denied download was retried; see `SAFEJS-UPSTREAM-MIGRATION.md`.

Inline-box checkpoint: horizontal inline margins and padding now participate in
real text layout, wrapping, client rectangles, computed styles, background paint
and element captures. Word grouping accounts for trailing padding before choosing
line breaks, including whitespace before closing tags. Signed margins, percentages,
empty boxes and nested background order have focused tests. `INLINE-BOXES.md`
records behavior, bounds, limitations and UTC-stamped evidence.

2,128 tests pass across 94 safe files, including 19 new cases. Nine actual-core
checks pass with a repeat. Build, strict changed tests, focused lint/format and
diff whitespace checks pass. Prior computed-style and client-geometry checks each
pass 13 assertions. The native PNG is visually inspected and independently
inflated. Allocation and large-resource probes pass six and seven checks with
the old target PNG unchanged. Rendering is somewhat slower in this single sample;
there is no speedup claim. Full reference coverage, real-site/frontend, released
SDK and low-memory Worker gates remain open. No dependency or live service added.

September 2, computed-style checkpoint: global/window `getComputedStyle` exposes
fresh readonly live declarations for 24 implemented longhands. It uses actual
cascade and normal-flow used dimensions, not inline values disguised as computed
pixels. Saved declarations follow revisions, detach/reattach and owner closure.
Object/argument quotas and unsupported pseudo/layout boundaries are explicit.

2,109 tests pass across 93 safe files, including eighteen new native/capability
cases and a production binding case. Build, strict changed tests and focused
lint/format checks pass. Thirteen checks pass through real production page bindings and the
existing experimental SafeJS core, with a repeat; prior geometry and structural
capture checks remain green. Twelve native resource assertions verify one layout
build for repeated reads and cache release on close. `COMPUTED-STYLES.md` records
measurements and limits. Full reference, real-site/frontend, released-SDK and
Worker gates remain open; no dependencies or live services were added.

September 2, layout-memory checkpoint: native painting and rectangle extraction
reuse relative glyph vectors instead of eagerly cloning every glyph into absolute
coordinates. Absolute vectors remain complete, frozen, stable and JSON/spread
visible when explicitly requested. Coordinate/work checks remain eager; no limits
or supported content were reduced. Empty vectors avoid lazy-reader overhead.

The 5,000-row capture now allocates 158,890 rather than 317,780 glyph records.
Its observed peak RSS moves from 199.4 to 175.4 MiB, with identical PNG bytes;
smaller samples are not universal RSS wins. `LAYOUT-MEMORY.md` records the limits
of these measurements. Full inspection still materializes both coordinate views.

2,090 tests pass across 92 safe files, including nine new ownership/materialization
tests. Final structural and native resource probes pass six and 21 assertions;
all 13/9/11 existing actual-core geometry/export/inline checks remain green.
Build, strict changed tests and focused formatting/lint pass. Low-memory Worker,
full reference coverage, released-SDK and real-site/frontend gates remain open.

September 2, inline-capture checkpoint: `screenshot` now clips supported wrapped
inline targets, sharing geometry extraction with page APIs and agent inspection
without a second layout pass. The playground accepts a capture target for Render,
Enter and PNG export, and clears stale scope/preview state across document changes.

2,081 tests pass across 91 safe files, including 23 new cases. Eleven actual
experimental-core checks validate interpreted geometry/event changes, independent
decoded pixels and private CLI files; a repeat passes. All 13 prior guest geometry
and nine capture-export checks remain green. Twenty-one native resource checks
pass, but the 5,000-row offscreen crop still peaks at 199.4 MiB. Full-document memory
is a next optimization target, not a completed low-memory/Worker gate.
`INLINE-CAPTURES.md` records evidence, bounds and limitations. Build, strict changed
tests, focused lint/formatting and diff checks pass. The full goal stays active.

September 2, client-geometry checkpoint: native normal-flow block and wrapped
inline rectangles now back page `getClientRects()`/`getBoundingClientRect()` and
the agent `geometry` command. Empty inline/BR anchors, padding, mixed baselines,
snapshot behavior, viewport/style invalidation, and bounded guest allocations
are tested. Native rectangles and bounding unions are cached per revision.

2,058 tests pass across 90 safe files, including 48 new cases. Thirteen actual
experimental-core checks and 18 native resource checks pass. Ten thousand cached
bounds reads take 3.53–4.27 ms in local single samples. `CLIENT-GEOMETRY.md` records
contracts, limits and evidence. Block-in-inline client ownership, full DOMRect
intrinsics, scrolling/hit testing, general CSS and live/released-SDK gates remain
open; this is not full browser geometry or completion of the browser goal.
The nine-check experimental-core capture regression keeps the prior PNG bytes
unchanged; the eight-check 5,000-paragraph paint regression also passes. Build,
strict changed-test checks, focused lint/formatting and diff checks pass.

September 2, PNG-compression checkpoint: the native encoder now defaults to a
bounded TypeScript fixed-Huffman/LZ77 compressor, retaining stored blocks when
compression would grow the output. No compression library or native runtime
dependency was added. Explicit stored mode remains available for callers/tests.

2,010 tests pass across 87 files, including 89 new codec/PNG/large-transfer cases.
Nine actual experimental-core export checks pass. Independent native inflate
proves the old and new 1,024 × 768 capture has identical scanlines while its PNG
shrinks from 3,146,804 to 52,889 bytes (98.3%). Three capture resource profiles pass
18 assertions; the largest drops from 131 to five frames and from 955.8 to 418.7 ms
in individual measurements. `PNG-COMPRESSION.md` records bounds, evidence and
trade-offs. Build, strict changed-test checks and focused lint/formatting pass.
Full CSS/JS/reference coverage and live-site/released-SDK gates remain open.

September 2, capture-export checkpoint: actual native PNGs now flow through the
`screenshot` command, session-owned bounded artifact chunks, atomic/private local
CLI saves, and the playground Render/PNG actions. Viewport and single normal-flow
block targets are supported. Frame limits stay unchanged; filenames never become
server-side writes. General inline bounds, full CSS and PDF remain open.

1,921 tests pass across 86 files, including 35 new artifact/client/CLI/UI/asset cases.
Nine actual experimental-core export checks pass; the transferred 1,024 × 768 PNG
is visually inspected. Three fresh-process transfer profiles pass 18 assertions;
the largest 2,048 × 1,024 capture takes 955.8 ms and peaks at 129.5 MiB RSS in one
run, without wire latency. `CAPTURE-EXPORT.md` records ownership, cleanup, resource
costs and test boundaries. No dependencies, services or default runtime changed.
New live-site/live-UI and released-SDK acceptance remain unproven. Goal active.

September 2, CSS-paint checkpoint: the shared stylesheet/inline color parser and
lazy paint cascade now drive actual document glyph colors, block/inline solid
backgrounds and root/body canvas propagation. Alpha, currentcolor inheritance,
normal-flow background ordering, line fragments and clipped paint work are covered.
Unsupported styling still fails closed; this is not general CSS capture.

1,886 tests pass across 80 files, including 86 new parser/cascade/pixel cases. Twelve
new actual experimental-core checks and 23 document/text regressions pass. An
interpreted click changes the real colored capture; its 640 × 600 PNG is visually
inspected. Three native resource profiles pass 24 assertions; the 5,000-paragraph
case retains 158,890 glyphs and peaks at 202.0 MiB RSS in one run. `CSS-PAINT.md`
records costs and limits. Build, strict changed-test checks and focused formatting/
lint pass. No dependencies, services or default runtime changed. Full CSS, client/
coordinate APIs, CLI screenshot/PDF, new live-site and released-SDK acceptance
remain open; the full goal remains active.

September 2, document-layout checkpoint: normal-flow vertical sizing now connects
measured lines and document-derived widths to actual block/glyph Y positions.
The implementation includes signed/transitive margin struts, empty-through rules,
padding/flow-root barriers, height constraints and definite percentage bases.
A bounded native painter captures the supported black-on-white text profile at
those coordinates; the new HTML fixture is not arranged in manual panels.

1,800 tests pass across 77 files, including 61 new geometry/raster cases and a
hundred generated margin-chain oracle fixtures. Eleven new actual experimental-
core checks and 27 text/formatting regressions pass. A native click changes height,
shifts following blocks and changes verified pixel output. The generated 640 × 600
document capture is visually inspected. Three resource profiles pass 24 assertions;
5,000 paragraphs retain 158,890 positioned glyphs and peak at 197.4 MiB RSS in one
run. Build, strict changed-test checks and formatting pass. `DOCUMENT-LAYOUT.md`
records the profile and costs. Full paint/styles, client/coordinate APIs, CLI
screenshot/PDF, public-site and released-SDK gates remain open. No dependencies,
services or default runtime changed; the full goal remains active.

September 2, text-layout checkpoint: the shared cascade and inline style bridge
now support five inherited typography properties. The native formatting/width
pipeline connects them to source-mapped, block-relative lines using the actual
built-in glyph metrics. Supported whitespace modes, soft wrapping, hard breaks,
tabs, alignment, mixed-size baselines, empty inline struts and explicit fallback
are covered without inventing page/client geometry.

1,739 tests pass across 75 files, including 72 new cases and 120 generated
source-split/width fixtures checked against a separate greedy-word oracle. Twelve
new actual experimental-core checks and 28 formatting/CSS regressions pass. A
native click changes interpreted fontSize and causes verified reflow; the measured
contexts are painted and visually inspected in explicitly manually placed panels.
Three native resource profiles pass 24 assertions; the 5,000-paragraph case emits
158,890 glyphs and peaks at 158.1 MiB RSS in one run. `TEXT-LAYOUT.md` records the
profile, evidence and remaining vertical/page-paint/public-site/released-SDK gates.
No dependency, service or runtime switch was made. The full goal remains active.

September 2, bitmap-renderer checkpoint: an original built-in printable-ASCII
font now supplies shared immutable masks/ink bounds and matching metrics to a
bounded RGBA painter. A local PNG encoder implements checksums and stored zlib
blocks without another dependency. Missing glyphs return explicit fallback status.

1,667 tests pass across 73 files, including 58 new font/raster/PNG cases. All
printable ASCII glyphs are checked at three integer scales; fractional/clipped
sampling and source-over alpha are tested. Independent CRC checks and Node zlib
inflation validate PNG pixels and exact/crossed stored-block boundaries. Build,
strict changed-test checks and formatting pass. A generated 720 × 384 atlas is
visually inspected and recorded with its digest. These are native-only primitives,
not document paint, line layout, a page screenshot or new real-site/SafeJS
acceptance. PNG data at that checkpoint was uncompressed. `BITMAP-RENDERER.md` records the
surface and limits. The full goal remains active.

September 2, formatting-tree checkpoint: bounded display decomposition now
builds anonymous blocks, splits inline ancestors around block children, handles
contents/root transformations and retains real source references. Unsupported
layout modes and unresolved CSS/HTML hints are explicit. An issue-free restricted
profile derives containing widths and accumulated horizontal offsets directly
from the document; no caller-supplied ancestry or fabricated rectangles are used.

1,609 tests pass across 70 files, including 43 new cases and sixty generated
mixed-flow forest/invariant fixtures. Fifteen new actual experimental-core checks
and 39 width/CSS/locator regressions pass. Three fresh-process native resource
profiles pass 27 assertions; the 5,000-row case creates 35,005 formatting records
and resolves 10,004 block widths, peaking at 146.3 MiB process RSS in one run.
Build, strict changed-test checks, formatting and diff checks pass. No dependency,
runtime switch or service change was made. Line/vertical layout, fuller UA/styles,
client rectangles, paint and public-site/released-SDK gates remain open in
`FORMATTING-TREE.md`; the full goal remains active.

September 2, horizontal width checkpoint: `resolveBlockWidth` now solves the
normal-flow non-replaced block width equation given an explicit definite
containing width. It resolves percentages, auto margins, sizing edges and min/max
constraints, preserving signed overflow and LTR/RTL end-margin rules. Source,
numeric and extent limits reject oversized calculations without clipping.

1,566 tests pass across 69 files, including 59 width cases and a deterministic
2,000-configuration conservation/constraint/mirror sweep. Thirteen new actual
experimental-core checks use a known containing-block fixture whose styles are
changed by interpreted handlers; another 26 CSS/locator regressions pass.
Build, strict changed-test checks, formatting and diff checks pass. No dependency,
runtime or service changed. This is not automatic document layout: formatting
tree discovery, other formatting modes, heights, inline measurement, client
rectangles and painting remain pending in `BLOCK-WIDTH.md`. The goal stays active.

September 2, CSS box-input checkpoint: the existing author cascade now handles
fifteen dimension/margin/padding/box-sizing longhands, physical-side shorthands
and supported absolute/viewport units. Native style inspection reports these
computed-subset values separately from visibility; percentages remain unresolved.
Sparse specified records and lazy immutable results avoid eagerly allocating box
records for every node. No geometry or getComputedStyle API is fabricated.

1,507 tests pass across 68 files, including 32 new box cases. Seventy actual
experimental-core checks pass, including thirteen new loader/stylesheet/style
mutation/resize cases. Three native-only resource regression profiles pass 141
assertions and close all 22 documents. Build, strict changed-test checks,
formatting and diff checks pass. No dependency or service changed.
`CSS-BOX.md` records the missing user-agent box sheet, formatting tree, used
geometry, paint/export and real-site gates. These layout prerequisites and the
full browser goal remain active, not satisfied by computed sizing inputs.

September 2, locator-generation checkpoint: `generate-locator` now produces
verified unique test-ID, exact role/name, attribute or CSS-path expressions.
The native literal parser accepts `locator('CSS')`, so generated output can
round-trip through existing actions and inspection. Raw CLI formatting is
available; structured results retain reference, revision and strategy metadata.
Structural paths are explicitly marked and can retarget after DOM reordering.

1,475 tests pass across 67 files, including 27 generation cases. Thirteen actual
experimental-core fixture checks and 37 locator/search/mock-terminal regressions
pass. Build, strict changed-test checks, focused formatting and diff checks pass.
No dependency, runtime switch or service changed. CLI-wire/public-site acceptance,
full codegen parity and the larger browser goal remain open. See
`LOCATOR-GENERATION.md` for escaping, bounds, stability and evidence.

September 2, native allocation checkpoint: immutable node reads now reuse a
per-owner cache with targeted invalidation for mutations, moves, fragment
consumption, indirect selection changes and closure. Saved records stay frozen
point-in-time views; detached nodes remain owned until close.

1,448 tests pass across 66 files, including 17 dedicated cache cases and a
300-step mixed-mutation model check. Another 120 actual experimental-core checks
pass. Thirty equivalent fresh-process native runs pass 1,206 correctness/cleanup
assertions and close all 186 documents. The large workload median falls from
745.2 to 451.5 ms and median peak RSS from 226.7 to 164.3 MiB. Churn peak RSS
does not improve. Build, strict changed-test checks and focused formatting pass.
No new dependency, SDK switch, service or live-site acceptance was introduced.
See `NODE-VIEW-CACHE.md`; larger memory costs and the full goal remain open.

September 2, resource/streaming-search checkpoint: five fresh-process native
session profiles now measure HTML loading, snapshots, search, actions, replacement,
diffs and cleanup. Initial evidence exposed a large-page search cutoff and an
incorrect harness expectation for truncated-snapshot resets. Search now streams
semantic entries without a serialized 1 MiB/10,000-entry cutoff, retaining bounded
result/context windows under unchanged matcher work/output limits. Default
snapshot and role-locator limits are unchanged; name/depth clipping stays visible.

1,431 tests pass across 65 files. Nine actual experimental-core large-page checks
and 28 search/mock-terminal/locator regressions pass. Five final native resource
profiles pass 201 correctness/cleanup assertions; all 31 page documents close.
The small run peaks at 63.4 MiB RSS, but the 5,000-row native-only run reaches
226.4 MiB. These are not interpreter, public-site or CLI cold-start measurements;
the larger memory cost is an open optimization target, not lightweight acceptance.
Initial failed reports are retained. Build, strict changed-test checks, focused
formatting and diff checks pass. No dependency, service or SDK switch was made.
See `SESSION-RESOURCES.md` and `SNAPSHOT-SEARCH.md`; the full goal stays active.

September 2, contextual HTML insertion checkpoint: page code can assign outerHTML
and call insertAdjacentHTML at all four positions. Native adjacent nodes retain
identity, listeners and current control values; replacements create new nodes
and leave old guest capabilities detached. Shared bounded staging validates
parse/depth/node/text/reference constraints before changing committed state.
Document roots, detached targets, fragment/html contexts, tables, form ancestors,
null conversion and inert inserted scripts have explicit tests and limitations.

1,421 tests pass across 65 files, including 26 new insertion cases. Twelve actual
experimental-core checks pass through an interpreted card UI driven by native
fill/click, plus 41 existing-core mutation/select/selection/wait regressions.
Build, strict changed-test checks, focused formatting and diff checks pass.
No dependency, default runtime or service changed. New public-site, live-terminal,
framework and released-artifact acceptance remain unverified. See `HTML-INSERTION.md`.

September 2, modern DOM mutation checkpoint: interpreted append/prepend,
replaceChildren, before/after/replaceWith and replaceChild now mutate the native
document, preserving moved node identities/listeners and stable references.
Text/comments receive ChildNode methods. Native replacement preflights depth,
cycles and references; script document hierarchy rules account for removed roots.
Conversion ordering, partial failure behavior and allocation limits are explicit
in `DOM-MUTATIONS.md`; no full DOM/framework or garbage-collection claim is made.

1,395 tests pass across 64 files, including 32 mutation cases and 726 model-checked
overlapping argument combinations. Twelve actual experimental-core fixture checks
exercise native fill/click into an interpreted task list, retained listeners after
reordering/replacement, semantic changes, fragments, text and cleanup. Another 29
existing-core selection/control/action-wait regression checks pass. Build, strict
changed-test checks, focused formatting and diff checks also pass. No dependency,
service, default-runtime or real-site/live-PTY acceptance change was made.

September 2, public-extension adapter checkpoint: `extensionPageRuntime` now
implements the inspected public extension contract, including exact globals,
explicit console ownership, retained timer arguments, original callback phase
promises, lazy setup, sanitized errors and fail-closed lifetime cancellation.
Native ports remain separate from interpreter ownership. The CLI/service default
has not switched, and no package was downloaded or dependency added.

1,297 tests pass across 60 files, including 19 adapter mock-contract cases.
Seven in-memory probes also pass 92 checks against the existing experimental
core through the legacy adapter. Build, strict changed-test checks, formatting
and diff checks pass. The raw released-SDK probe now checks console authorization
and fresh evaluation during a pending callback tail. A separate released-page
consumer covers native bindings, events, timers, storage and reload cleanup.
Both consumers compile but remain unrun against a released artifact; the new
adapter is not accepted for production. See `EXTENSION-RUNTIME.md` for gates.

The latest inspected #550 comment (September 2, 19:34 UTC) reports implementation
pushed at `7984fa903602e6561b342a140f472978827094b7` and release jobs queued.
Pinned source was inspected. This is not installed-artifact acceptance, confirmed
release publication or a new real-site/live-terminal result.

September 2, text-locator checkpoint: shared native targets now support literal
`getByText`, `getByLabel`, `getByPlaceholder`, `getByAltText` and `getByTitle`, in
addition to role/test-ID/CSS/ref targeting. Text queries use normalized complete
candidate text and smallest matching elements. Label queries respect native
association and ARIA-label precedence, including password fields; attribute
queries compare raw values as data. Hidden duplicates remain ambiguous. Native
actionability, bounded waiting, command deadlines and action ordering are unchanged.

1,278 tests pass across 59 files, including 37 new text/label/attribute parser,
resolution and resource cases plus a shared-host integration test. Eleven actual
experimental-core shared-host checks pass: interpreted fill/change/click handlers,
text-span bubbling, updated labels, timer-created targets, ambiguity rejection,
safe inspection and preserved snapshot-diff state. Label queries avoid copying
unrelated page text; text/cache/reference bounds fail closed rather than accepting
truncated uniqueness. Build, strict changed-test type checks, focused lint/format
and diff checks pass. No dependency or SDK switch was made. New fixtures are in
memory, not real-site/live-PTY/released-SDK or complete Playwright parity gates.

That checkpoint's #550 recheck found it open; the maintainer's September 2, 19:14 UTC
comment proposes explicit realm builtin-console authorization with ownership and
lifecycle tests. The later source observation is recorded in the latest checkpoint.

September 2, page-runtime checkpoint: the page owner now separates SDK-specific
realm/budget construction, result conversion, error identity and callback entry
points behind a runtime boundary. The legacy adapter remains the production
implementation. Trusted runtime factories can initialize bindings lazily, return
tagged failures and own public lifecycle APIs without requiring the legacy SDK's
global helpers or error constructor. Browser limits, prefix/result ordering,
sanitized results, cancellation and native-owner cleanup remain enforced.

1,240 tests pass across 58 files, including fourteen new runtime-owner contract
cases. Eighty-one actual experimental-core regressions pass across bindings (7),
terminal search (9), classList (14), storage (19), action waiting (8) and fetch/CORS
(24). Build, strict changed-test type checks, focused lint/format and diff checks
pass. These are in-memory fixtures; terminal streams are mocked.

Upstream #549 is confirmed closed. A separate, source-supported console ownership
enhancement was filed as poe-code #550 and its exact body verified; builtin
collision protection currently prevents an extension-owned global console from
sharing the browser Window console. No lexical rewrite, SDK patch or dependency
switch was added. The actual released-SDK adapter, new release acceptance,
real-site/live-PTY gates and full browser parity remain incomplete. See
`SAFEJS-UPSTREAM-MIGRATION.md` and the contribution draft for the precise boundary.

September 2, terminal-search checkpoint: `s`/`S` run bounded backend literal/regex
search beyond the locally retained snapshot. Results require fresh scoped
inspection before activation; `U` restores the root. Native document checks
reject navigation races, removed inspected nodes fall back to root on refresh,
and search text cannot become CLI options or switch sessions. Local `/` search
remains unchanged. See `TERMINAL.md` for controls and scope limitations.

1,226 tests pass across 57 files, including 41 terminal projection/mock-stream
tests. Nine actual experimental-core checks pass through an in-memory command
host and mock terminal streams: a target beyond the truncated root prefix is
found, inspected and activated, its interpreted mutation is visible, and the
observer/diff baseline and detach cleanup are preserved. Build, strict changed-
test type checks and focused formatting/lint pass. No dependencies, services or
SDK versions changed. Real-site/live-PTY and released-SDK acceptance remain open;
the separate legacy nested-callback gate remains failing, not silently waived.

September 2, snapshot-search checkpoint: `find` now returns live snapshot matches,
actionable refs, ancestor paths and context, with literal and bounded-NFA regex
matching. It does not consume snapshot-diff state or execute queries as code.
Compilation, matching and UTF-8 output have explicit bounds. See
`SNAPSHOT-SEARCH.md` for the implemented profile and remaining parity gates.

1,212 tests pass across 56 files, plus eight actual experimental-core command-host
search/action checks. A separate nested-callback diagnostic fails on the old
experimental runtime: plain async host methods return too early for synchronous
browser APIs. Its negative evidence is preserved in the migration document;
guest eventful methods were not papered over. No SDK/dependency switch or new
real-site/live-PTY acceptance is included.

September 2, script-form checkpoint: interpreted document.forms/form.elements
now expose live native ownership, including external controls. Multi-match named
lookups create bounded live radio groups whose values share native checked state.
Reflected metadata configures native GET/POST preparation; native radio actions
still run interpreted event handlers. See `SCRIPT-FORMS.md` for the supported
surface and missing guest submit/reset/validation/named-property APIs.

1,144 tests pass across 54 files, including sixteen new binding/collection cases.
Nine actual experimental-core form checks plus ten selection-state and eight
action-wait regressions pass. All new fixtures are in memory, without dependency
changes or new real-site/live-PTY/released-SDK acceptance.

September 2, persistent-selection checkpoint: DocumentTree now owns option
selectedness and dirtiness rather than re-deriving selection from attributes.
Moves/removals, mode changes, attribute nodes, copies and form resets update the
same native state used by scripts, snapshots and form preparation. Fallback
eligibility avoids repeated scans of a growing all-disabled option list. See
`SELECTION-STATE.md` for the bounded contract and remaining conformance gaps.

1,128 tests pass across 53 files, including 22 new state/mutation/resource cases.
Ten new actual experimental-core checks and nineteen property/waiting regressions
pass. No dependency/SDK changes or public-site/live-PTY acceptance are included.

September 2, script-select checkpoint: interpreted select/option properties now
share native control state, live options/selectedOptions collections, native
form serialization and action handlers. select.remove(index) removes the option
instead of accidentally removing the select. This fixes the property gap found
by the earlier action-wait probe. See `SCRIPT-SELECT.md` for the supported surface
and explicit dirtiness/mutation/collection-write limitations.

1,070 tests pass across 49 files, including nineteen new binding tests. Eleven
actual experimental-core checks exercise properties and form serialization;
eight action-wait and eight locator regressions pass. No SDK/dependency change,
public-site/PTY acceptance or service activation is included.

September 2, native action-wait checkpoint: shared-host click/fill/select/check/
uncheck now wait for the supported target/control readiness states, under the
existing command deadline. Queries are cached by document/revision; ambiguous
targets and stale refs fail, and an action is never replayed after dispatch.
Waiting cleans up on timeout/session close and respects native event-idle waits.
See `ACTION-WAITING.md` for the partial contract and remaining layout/ARIA gaps.

1,051 tests pass across 48 files, including thirteen new waiter cases and three
shared-host deadline/cleanup cases. Eight actual experimental-core command-host checks
exercise delayed interpreted DOM mutations. No dependency, released-SDK switch,
public-site/PTY acceptance or service activation is included in this checkpoint.

September 2, literal locator checkpoint: native targets now accept the supported
`getByRole`/`getByTestId` syntax alongside refs/CSS, without executing expressions.
The shared command path observes current names, labels, IDs and visibility,
rejects ambiguity, and retains ordinary actionability checks. Expanded role
candidate traversal and propagated name-truncation flags prevent false uniqueness
from collapsed descendants or clipped text. See `TARGET-LOCATORS.md`.

1,035 tests pass across 47 files, including 28 parser/resolution cases. Eight
actual experimental-core action checks pass, plus the fourteen class-list
regressions. Full ARIA semantics, other locator methods, regex/chaining,
auto-waiting, actual CLI/parity and released-SDK acceptance remain open. No
dependency, SDK modification/download, live-site/PTY run or service activation.

September 2, DOM inspection checkpoint: the additive `dom` command and exported
`inspectDom` read live native structure, current controls and stable refs with
explicit subtree/depth/node/content limits. A shared-session playground DOM pane
adds reference/selector scoping and Root reset, using inert text rather than
executing inspected markup. Password/file values are redacted in both attribute
and current-control paths. See `DOM-INSPECTION.md` for privacy and coverage limits.

1,006 tests pass across 46 files, including 22 inspector cases and terminal
regressions. Eight actual experimental-core checks verify post-script mutation,
redaction, scoped truncation and observational reads. No new dependency, SDK
download, service start, live-site/PTY probe or visual UI acceptance was added.
Inline tree expansion/highlighting, complete style/layout inspection and the
original broader browser/release acceptance gates remain open.

September 2, capability-construction checkpoint: `PageBindings` now constructs
the browser's native capabilities through a narrow context, independently of SDK
realm creation, evaluation, Budget and error constructors. `PageScripts` keeps its
existing public behavior while delegating this setup and cleanup. Both timer
surfaces now use returned retention registrations. Partial setup failure revokes
constructed capabilities; guest shutdown preserves native document interactions.

954 tests pass across 43 files, including twelve construction/lifecycle cases.
Seven actual experimental-core binding checks pass, plus the 19 storage/event,
21 navigation, 24 fetch/CORS and 14 class-list regressions. This advances the
released-SDK migration structure without claiming that migration has run. No
dependency, SDK patch/download, live-site/PTY run or service activation was added.

September 2, released-SDK probe preparation: a separate public-extension consumer
now requires an explicit local `@poe-platform/safe-js` artifact and exact version.
It prepares callback-phase, guest-retention, host-property, nested-operation and
cleanup gates without silently selecting the old experimental core. See
`SAFEJS-UPSTREAM-MIGRATION.md` for the command and remaining adapter differences.

942 tests pass across 42 files, including 24 release-loader selection tests.
The compiled probe is verified to exit nonzero and report zero completed checks
when no artifact is selected. These are loader/failure-path tests, **not released
SDK acceptance**. No package download, install, live-site/PTY execution or browser
runtime switch occurred. The previously denied download still needs permission;
upstream implementation/source observations are not a substitute for that gate.

September 2, class-list checkpoint: classList is now live and identity-preserving,
with bounded token mutation, value forwarding, indexing and iteration. Attribute
changes update the same native selectors/CSS/snapshots/actionability state. The
actual interpreter fixture reveals, activates and re-hides an action through
native agent clicks without another response. Atomic validation, resource limits,
cache reuse/recovery and old-owner revocation are tested in `CLASS-LISTS.md`.

918 tests pass across 41 files, including 35 class-list cases. Fourteen actual
interpreter checks pass, as do the earlier 19 storage/event, 21 navigation and
24 fetch/CORS checks. Strict compilation, formatting and diff checks pass.

DOMTokenList iterator helpers/prototypes and exception/coercion parity remain
incomplete. No SDK patch, dependency, native engine, live/PTY probe or service
activation was added. Full framework and broader browser acceptance remain open.

September 2, storage-event checkpoint: successful native mutations now capture
change records and notify eligible documents through a bounded session queue.
Source exclusion, origin/tab isolation, event-area identity, candidate commit,
cancellation, no-op suppression and capacity/lifetime limits are tested. The
actual SafeJS todo fixture now rerenders a second tab after an agent action in the
first, without reloading or fetching another response. `STORAGE-EVENTS.md` records
the contract, resource drops and explicit administrative-write semantics.

723 tests pass across 37 files. The coordinator/observer suite has thirteen cases;
the page-storage integration suite has thirty. Typechecking and formatting pass.
Nineteen interpreted storage/event workflow checks pass, as do the 21-check
navigation and 24-check fetch/CORS regressions.

Evidence uses in-memory responses and the existing experimental core. No new
dependency, SDK modification, live/PTY probe or service activation was added.
Named Storage properties, full scheduler/event conformance, frames, released-SDK
migration and the broader browser acceptance gates remain open.

September 2, page-storage checkpoint: parser/realm-owned localStorage and
sessionStorage methods now use the existing native stores, and document.cookie
uses the existing jar with HttpOnly protection. Origin/tab/session isolation,
opener copying, quotas, state import and revocation are tested. An actual SafeJS
todo fixture supports agent add/toggle/remove and reload persistence; it is our
own fixture, not public TodoMVC/framework acceptance. See `PAGE-STORAGE.md`.

707 tests pass across 36 files; twelve actual-interpreter workflow checks pass,
with the named-write gap recorded separately rather than counted as a feature.
The 21-check navigation and 24-check fetch/CORS interpreter regressions also pass.

Named Storage writes were tested and do not persist in the experimental core.
Current upstream named providers are read-only; enhancement #549 was filed and
its exact body verified, with no Proxy/state-mirror workaround. #547 was verified
closed with upstream release 0.1.36, but local released-package migration is still
unverified. Storage events, named properties, broader compatibility and denied
live/PTY gates remain open. No new dependency or service activation was added.

September 2, Location-navigation checkpoint: methods, Window/document setters and
URL components now use owned navigation; same-resource fragment URLs change
synchronously with deferred events. Cross-document replacement preserves adjacent
entries, and parser pushState branching discards forward history. Queue admission,
archive budgets, cancellation, policy, candidate retirement and diagnostics are
shared with guest History work. `PAGE-URLS.md` records the exact partial contract.

615 passing tests across 33 files are in `page-navigation-focused-2026-09-02.json`;
21 actual existing-core checks are in `page-navigation-safejs-fixture-2026-09-02.json`.
No new dependency, SDK modification, live connection, PTY or service activation.
Bare global Location assignment, full browser scheduling/component semantics,
released-SDK migration and denied live acceptance gates remain open. The 72-hour
goal is still active and the full requested browser is not complete.

September 2, guest-traversal checkpoint: History back/forward/go now queue owned
session navigation rather than rejecting or using only the local document list.
Parser requests wait for commit, current event dispatch finishes before traversal, and
retired/failed sources lose queued work. Stop/explicit navigation cancel requests;
per-tab pending/lifetime bounds and existing session/network policies apply.
Metrics and sanitized navigation-console records expose asynchronous outcomes.

592 tests pass across 32 files; eleven existing-core SafeJS checks exercise actual
interpreted back/forward/reload, cross-document parser requests, restoration and
cancellation over in-memory responses. No dependency, SDK change, live network,
service activation or previously denied gate was added. Location navigation,
complete task semantics, full cloning/identity and the full browser goal remain
unfinished. `PAGE-HISTORY.md` records the implemented contract and limitations.

September 2, page-History checkpoint: `PAGE-HISTORY.md` adds session-owned finite-JSON
state, push/replace methods and session-wide length to interpreted pages. Document
initialization restores state before parser scripts; reload/back branches retain
or discard forward documents correctly. Candidate initialization is idempotent,
validated and cleaned up on failure/cancellation without harming the old page.

Same-document traversal now delivers interpreted popstate/hashchange data in
prefix order; canceled event waits release the history queue. 557 tests pass
across thirty files, plus thirteen actual experimental-core SafeJS fixture checks.
No new dependencies, SDK changes, real network, service activation or previously
denied gates are involved. Guest traversal, Location navigation, complete cloning
and state identity remain open; the original full browser goal is unchanged.

September 2, page-URL checkpoint: `PAGE-URLS.md` records shared live Location
reads, DOM baseURI and reflected hyperlink/resource URLs. Interpreted code can
inspect the actual document URL and change a link's destination before the owning
browser follows it. Same-document navigation preserves the realm; replacement
revokes it. Location writes fail explicitly rather than pretending to navigate.

356 tests pass across twenty files; fifteen existing-core SafeJS checks verify
the real interpreter, DOM and navigation over in-memory responses. No dependency,
SDK change, service activation or denied live gate is involved. History and
Location-triggered navigation remain open; the document records the required
loader/session ownership integration instead of misrepresenting document-only
history as full browser history. The full browser goal remains incomplete.

September 2, redirect-mocking checkpoint: route fulfillment now accepts a single
Location header. Entirely mocked redirect chains use the native driver's method,
URL, deadline and resource policies; interpreted fetch retains per-hop CORS and
manual/error behavior. Duplicate Location declarations fail atomically. Adapters
without native route-aware redirects reject automatic mocked navigation rather
than committing a redirect body or silently falling through to the network.

290 tests pass across fourteen files; twenty-four existing-core SafeJS fixture
checks pass with in-memory transport. No dependencies, released-SDK verification,
service changes, public websites or previously denied live gates are involved.
Routing remains partial and the full browser goal remains incomplete.

September 2, native routing checkpoint: the Node adapter now offers the optional
`requestWithRoutes` transport capability. Session rules are checked inside the
existing redirect driver before DNS/exchange, preserving its policy, cookie,
method/body and lifetime handling. Mock bodies share transport byte budgets;
mock-only metric subsets distinguish them. Synchronous route work also receives
an absolute elapsed-time check. Other adapters retain the safe manual fallback.

284 tests pass across fourteen files, including twenty-one native-driver cases
with mocked DNS/wire exchange, real in-memory stream consumption, and actual
session HTML loading. Strict package/new-test compilation and formatting pass.
No live HTTP/TLS/site, service activation, dependency or SDK migration is claimed.
The full browser and previously denied live acceptance gates remain incomplete.

September 2, routing checkpoint: `ROUTING.md` adds session-owned route fulfillment,
listing and removal. Matched requests receive bounded replacement content without
calling the transport; the journal/Network pane records route IDs. Actual HTML,
stylesheets and interpreted JSON fetch use these responses in memory. URL matching
uses our bounded state machine. Rule matching/delivery failures cannot fall back
to the network, and automatic transport redirects fail closed while rules exist.

263 focused tests pass across thirteen files. Twenty existing-core SafeJS checks
also cover routed CORS responses, manual redirect hops and removal. No dependency,
SDK migration, service activation or previously denied live acceptance was added.
Header rewriting, binary/redirect/cookie mocks and full routing parity remain open;
the full browser goal is unchanged and incomplete.

September 2, 15:35 UTC: filed and verified poe-code #547 for explicit public
callback synchronous-prefix completion, separate from final async settlement.
The Markdown issue body matches GitHub. An in-memory probe against the existing
experimental public core passes eight contract checks, including pending-tail
listener progress, sync/async failures and close cancellation. This is not
released-SDK verification; the issue clearly requests API guidance/enhancement
rather than claiming a reproduced release defect. No completed issue was reopened.
`SAFEJS-UPSTREAM-MIGRATION.md` records the remaining integration and release gates.

September 2, CORS diagnostic checkpoint: page fetch reports per-hop permission
outcomes through a trusted observer to the owning navigation journal. HTTP
completion remains distinct from CORS permission, including a successful 204
preflight that prevents the actual request. CLI/API details and playground text
show the separate result. One-shot bounded annotations cannot revive evicted or
closed records; observer failures do not change fetch policy.

228 tests pass across twelve files, and sixteen existing-core SafeJS fixture
checks pass with in-memory transport. Package and changed-test strict compilation
pass. No dependency, SDK migration, public network, server, PTY, service restart
or upstream publication is involved. Published-SDK and denied live acceptance
gates remain outstanding; the full browser goal is not complete.

September 2, upstream migration audit: the authenticated GitHub API confirms
#540–#546 are closed. `SAFEJS-UPSTREAM-MIGRATION.md` records the inspected public
API at `3192ef3c52ea16f7b31704a70e75497049516787` and the integration gates.
Our installed SDKs are older; no released artifact was downloaded or tested.
Migration is not a package-name-only change: capability setup, tagged results,
lifetime cancellation and callback dispatch phases need explicit adaptation.
The public callback API exposes final completion, not the browser's separate
synchronous-prefix handle. Verify that boundary before replacing the adapter.
Previously denied download and live acceptance actions remain unperformed.

September 2, approximately 05:08 UTC: `PAGE-CORS.md` extends page fetch with CORS
response permission, unsafe-header/method preflights, exposed-header filtering,
credential-sensitive wildcards and redirect state. Origin-changing redirects strip
Authorization; tainted chains serialize Origin as null and do not restore default
cookies when returning to the original origin. Preflights share deadlines/body
bounds and cannot send the later request after permission denial or cancellation.

215 tests pass across eleven files; fifteen real-SafeJS mock-transport checks
include cross-origin PUT/preflight/JSON/DOM and denied-DELETE behavior. Strict
package and changed-test builds pass; Biome checks 168 files. No dependency, SDK
change, server, PTY, child-process/public-site probe, activation or publication.

The journal distinguishes preflight attempts but does not yet attach CORS response
visibility outcomes to completed HTTP entries. Permission caching, broader CORS
conformance, XHR/signals/streams and actual wire/multi-origin/site acceptance remain
open. Denied live gates were not rerun via another route. Full goal stays active.

September 2, approximately 04:58 UTC: `PAGE-FETCH.md` adds a document-owned fetch
port and bounded same-origin fetch/Response capabilities to configured SafeJS
page runtimes. The global and Window binding share ownership, cookies remain
host-controlled, redirects are checked hop by hop, response headers exclude
Set-Cookie, and consumption/cloning/deadlines/close release bounded body retention.
The request journal records fetch hops. CSP fails closed rather than being bypassed.

198 focused tests pass across ten files; ten real-SafeJS mock-transport checks
prove parsed script → Promise/JSON → interpreted callback → current DOM plus
pending-fetch cancellation without transport cooperation. Strict package and
changed-test builds pass; Biome checks 166 files. This reuses existing public
SafeJS hooks without changing the SDK or adding dependencies. No new server,
PTY, child-process/site probe, service activation or publication was performed.

This is an implementation stage, not reduced completion criteria. Next required
network work includes CORS/preflights/redirect tainting, XHR, iterable/constructor
APIs, guest signals, binary/streaming and real wire/multi-origin/site acceptance.
Previously denied gates remain unverified and were not rerun by another route.
The full 72-hour browser/playground/Playwright-superset goal remains active.

September 2, approximately 04:45 UTC: `NETWORK-JOURNAL.md` adds bounded redacted
metadata for document/script/stylesheet requests, CLI/API `requests` and
`request <index>`, and the playground Network pane. Journal ownership is explicit:
the latest network attempt per tab, including failures that retain the old page.
Same-document navigation retains the log; supersession, abort and close cannot
reintroduce late entries. Headers/bodies are not retained; paths are not generally
secret-scrubbed. The real HTML loader is exercised through an in-memory adapter.

The focused journal/session/command/parser/playground/mock-actor suite records
130 passes across six files. Strict package and changed-test builds pass; Biome
checks 163 files. No new dependency, SDK change, server, PTY, subprocess/site probe,
service activation or upstream publication. New live UI/CLI/site acceptance is
unverified; previously denied gates were not rerun through another route. Full
network traffic, fetch/XHR, interception and original superset scope remain open.
The 72-hour goal remains active.

September 2, approximately 04:32 UTC: `EXTRACTION.md` adds `extract [target]`
with Markdown or typed JSON-tree output from the current retained document.
Both formats carry stable refs and live metadata, enforce byte/node/depth bounds,
exclude field values and executable/hidden content, and filter link destinations.
Extraction neither fetches again nor consumes snapshot diff baselines. Empty
items, nested lists/quotes, code fences, URL entity escaping and inline flow have
regression coverage; documented structure/style limitations remain.

Ninety-five focused tests pass across five files, including 14 extractor cases;
strict package/changed-test builds and the 161-file Biome check pass. Seven checks
using the actual selected SafeJS interpreter verify script-created content and
later native-action callback mutations in memory. Two Bun public-core fixture
checks pass too. These create no HTTP server, PTY or browser service and are not
a substitute for denied public/terminal acceptance. New separate-CLI and download
gates remain unverified. No dependency, SDK, service activation or publication
changes. The original full browser/playground/superset goal remains active.

September 2, approximately 04:15 UTC: the terminal now wraps long entries,
scrolls by displayed rows and supports literal forward/backward search, including
multiple matches inside one entry. Stable action refs survive scrolling; character
anchors survive resize and unchanged observer refreshes. Protected values stay
out of the projection/search. Row metadata is per entry rather than per displayed
row, so a one-column million-row document does not require a million row objects.

Eighty focused tests pass across four files (27 terminal cases); strict package
and changed-test builds pass, and Biome checks 158 files. Three local synthetic
projection/resource cases pass bounded-frame, readable-tail and search checks.
They are not real browser, TTY, network or JavaScript compatibility measurements.
The denied real PTY/site gate remains unverified and is not rerun by another route.
No new dependencies, SDK edits, service activation or publication. Full terminal,
playground and engine compatibility scope remains active.

September 2, approximately 04:08 UTC: `TERMINAL.md` adds the `terminal [url]`
frontend for an existing named session. It projects stable semantic references,
supports keyboard link/form actions, URL entry and history, and observes agent
changes without consuming snapshot diffs. Bracketed paste cannot trigger hotkeys;
protected prompts, output escaping, bounded redraw/backpressure and detach cleanup
have focused tests. Native API request cancellation is additive.

Seventy focused tests pass across four files, including 17 terminal cases.
The separate API/server suite passed 19 tests, including explicit cancellation.
Strict package and changed-test compilation pass, and Biome checks 157 files.
The actual CLI/PTY/local-form/public-site probe is implemented but **not run**:
approval review denied its actual PTY, filesystem, loopback and session mutations
under the workspace dry-run rule. This is not real-terminal or site acceptance.
Two formatter command groups remain tracked after stdin stalls; stopping the
first group was denied. They are not claimed stopped; a regular-file-input
formatting pass completed without touching their processes.

No dependencies, SDK edits, services, commits, pushes or upstream publication.
Next: explicit permission for the real terminal acceptance gate, then remaining
terminal usability, playground and engine compatibility. The broader goal stays
active; the existing full scope is not reduced to this frontend.

September 2, approximately 03:53 UTC: `SAFEJS-COOPERATION.md` records cooperative
AST checkpoints that keep the guest job owned while allowing host deadlines and
heartbeats to progress. The source timeout, step/data bounds and process watchdog
are unchanged. Script shutdown now preserves native document interactions;
native navigation recovers a timed-out realm in the same actor. Failed realm
initialization also releases Date ownership before Budget reuse.

SDK focused/full runs pass 73/8104 tests; the existing 30 failed assertions,
54 failed files and six skips have identical failure identities. Browser tests
pass 1128/65 files, event-focused tests 70, strict builds and Biome 152 files.
All 46 automatic-script probe checks pass. Books/Quotes navigate in 1551/1479 ms
and remain readable, but both scripts time out: this is responsiveness and native
recovery, not dynamic-site compatibility. Timer/CLI checks pass 17/22.

No dependencies or production limit relaxation. Performance publication remains
paused; the separately tracked obsolete test process is not claimed stopped.
Next: remaining throughput and intrinsic gaps, extension lifecycle and the
original terminal/playground/Playwright-superset ledger. The 72-hour goal remains
active. Earlier checkpoint failures below remain historical evidence.

September 2, approximately 03:32 UTC: `SAFEJS-DATE.md` adds guest-owned timestamps,
realm-owned prototypes, calendar operations, coercion/JSON and explicit clocks.
Run current-time reads use the existing journal so completed reads replay without
re-reading the host clock. No native constructor/prototype is exposed to guest
code; temporary host calendar primitives remain an explicit implementation choice.
Date snapshots/copies and locale formatting reject instead of losing state.

Twenty-two new SDK tests pass; focused Date/random/JSON and Date/regex-boundary
runs pass 71 and 56 tests. The verified full SDK has 8089 passes and exactly the
prior 30 failed assertions/54 failed files, with six skips. An intermediate
snapshot regression was fixed; the legacy regex fixture now expects the additive
default Date binding while preserving its exact hash/graph checks. Browser tests
remain 1126/65, strict core/new-test/package builds pass, and Biome checks 152 files.
The combined contribution patch is refreshed and applicability-checked.

Forty local owned-process script checks pass, including Date state updated by a
native click. Both public diagnostic scripts pass their Date sites: Books reaches
String.replace coercion at offset 35950 (3301 ms), and Quotes reaches missing
Object.defineProperty at offset 30470 (8531 ms). **Both production navigations
fail the unchanged heartbeat**, at 2010/2011 ms. These are not successful public
dynamic-site gates. Timer/CLI checks pass 17/22; probe actors/services close.

No dependency, installed SDK, production bound, commit, push or upstream
publication changes. The detailed performance publication remains paused. One
obsolete first full-suite test process remains separately tracked after its
termination request was denied; it is not claimed cleaned up or used as final
verification. Next: remaining accounting/scheduling, descriptor/coercion gaps,
Date snapshot support and the original terminal/playground/superset ledger. The
72-hour goal stays active.

September 2, approximately 03:13 UTC: local retained-graph optimization preserves
primary memory checks, mutable children/prototypes and compile ownership while
reusing immutable shapes/descriptors and same-scope capture enumeration. Nineteen
new deterministic regressions pass; the focused SDK run passes 25 tests. The full
SDK has 8067 passes, with exactly the preceding 30 failed assertions/54 failed
files and six skips. Browser tests remain 1126/65, strict builds pass, and Biome
checks 152 files. The combined contribution patch is refreshed and verified
against the exact base (`SAFEJS-EXTENSIONS.md`).

Separate Books diagnostics drop from 8926 ms to observed 3424–4048 ms, but owned
navigation still fails the unchanged two-second heartbeat at 2009 ms. Both sites
still reach missing Date; automatic-site acceptance remains failed. Production
script probes pass 38 local checks plus one public reporting check. Timer checks
pass 17; CLI/paired API checks pass 22. Owned actors and temporary services close.
`SAFEJS-RETENTION-PERFORMANCE.md` distinguishes deterministic scan
work from variable timing evidence. No new dependency, installed SDK edit,
production limit change, upstream publication, commit or push. Performance issue
publication remains paused. Next: remaining cost/scheduling, Date and the original
terminal/playground/Kitesurf/Playwright-superset ledger. Goal stays active.

September 2, approximately 02:51 UTC: `DOM-ATTRIBUTES.md` adds document-owned
Attr identity, live named/indexed maps, value mutation, replacement/detachment and
script APIs. Browser tests pass 1126 cases across 65 files. The new generic SafeJS
named capability is filed as #546 (`SAFEJS-NAMED-HOST-OBJECTS.md`); nineteen new
SDK tests pass, with 8048 full-suite passes and exactly the prior 30 failed
assertions/54 failed files. The lightweight public core and new tests compile
strictly; the combined patch is refreshed and applicability-checked.

The automatic process probe passes 38 local fixture checks plus one public
reporting check. Quotes still stops at Date. Books repeatedly fails the unchanged
two-second heartbeat (2009 ms measured), so it does NOT pass owned navigation.
Separate diagnostics reach +new Date after about 8.9 seconds of evaluation.
Profiling identifies retained-graph accounting as the hot path; a minimal
public-core benchmark reproduces scaling without DOM/network/getter execution.
`SAFEJS-RETENTION-PERFORMANCE.md` preserves the evidence. Approval review denied
publishing that detailed performance report; no performance issue was created.
The Date evidence was added to #543 through an approved comment. Timer and CLI/API
regressions pass 17 and 22 checks, with owned actors/services closed. No new
dependencies, installed SDK changes, production limit changes, commits or pushes.
Next: bounded efficient accounting, effective scheduling, Date and the original
feature ledger. The complete 72-hour goal remains active, not narrowed to these
partial DOM/SDK additions.

September 2, approximately 02:28 UTC: `INLINE-STYLES.md` adds bounded, live
element.style declarations backed by real attributes. The browser owns parsing,
priority/shorthand handling, mutation and visibility invalidation; the existing
SafeJS public indexed capability supplies enumeration, with no SDK modification
or new dependency. Thirteen native-reference cases anchor 28 new tests. All
1115 browser tests across 63 files pass, with strict package/new-test compilation
and the configured 148-file Biome check. Automatic owned-process script checks
pass 37 assertions, including three new style/action/snapshot checks and two
public reporting checks. Books advances to missing DOM attribute objects at
`d.attributes[c].expando`; Quotes still needs Date (#543). Neither passes public
automatic JavaScript acceptance. Full CSSOM, getComputedStyle, layout and the
original terminal/playground/superset gates remain open. No installed SDK, live
service, dependency, commit or push changes. The reference session/server and
owned probe actors close. Next: DOM attributes, Date and the feature ledger.
The complete 72-hour goal remains active; this is another partial checkpoint.

September 2, approximately 02:06 UTC: tag/class queries and children now expose
live indexed collections with shared element identity (`LIVE-COLLECTIONS.md`).
The generic SafeJS indexed capability is implemented locally and filed as #545
(`SAFEJS-INDEXED-HOST-OBJECTS.md`), without native proxies or eager per-index
bindings. Browser tests: 1087 passes across 62 files; strict checks and Biome pass.
The final SDK has 8029 passes, retaining exactly the prior 30 failed assertions
and 54 failed files; 17 indexed tests are new. Final public-core probes pass
34 website-script checks, 17 timer checks and 22 executable CLI/paired-API checks.
Books advances to missing element.style.cssText; Quotes still needs Date (#543).
Both remain incompatible. Named properties, live NodeList, collection prototypes,
full DOM/CSSOM and all original terminal/playground/superset gates remain open.
The contribution patch is refreshed and applicability-checked. No dependencies,
installed SDK, live services, commits or pushes are changed. Next: style/CSSOM,
Date and the original feature ledger. The complete 72-hour goal remains active.

September 2, approximately 01:47 UTC: realm-owned Object intrinsics now support
cached type inspection and ordinary/null prototype reflection
(`SAFEJS-OBJECT-PROTOTYPE.md`). The 33 new SDK tests include native comparisons,
isolation, retained budgets and dump boundaries. Final native-config SDK results:
8012 passes, with exactly the same 30 failed assertions and 54 failed files as
the preceding checkpoint. Browser suite: 1075 passes; strict checks and Biome pass.
Final public-core process probes pass 30 website-script, 17 timer and 22 executable
CLI/paired-API checks. Both public sites remain incompatible: Books advances to
missing DOM getElementsByTagName; Quotes still needs Date (#543). The combined
patch is refreshed and applicability-checked. Object's dump binding intentionally
changes from namespace to constructor; intrinsic state serialization is limited.
No dependencies, installed SDK, live services, commits or pushes are changed.
Next: live DOM collection/query support and Date, while retaining all original
terminal/playground/superset acceptance gates. The complete goal remains active.

September 2, approximately 01:30 UTC: guest function properties, constructor
prototypes and bounded inheritance now work in the isolated public SafeJS core
(`SAFEJS-FUNCTION-OBJECTS.md`). Automatic page fixtures and native clicks exercise
the feature. The browser suite passes 1075 tests; 29 website-script, 17 timer and
22 actual CLI/paired-API checks pass. Strict package compilation and Biome pass.
The SDK adds 22 passes (7979 total), retaining exactly the same 30 failed
assertions and 54 failed files; the upstream gate remains non-green. Legacy
restoration-test type diagnostics are unchanged in an explicit baseline comparison.
The combined patch is refreshed and applicability-checked against the pinned base.
Real Books/Quotes scripts advance but still fail at Object prototype inspection
and Date respectively. Upstream #543/#544 are filed and verified open; #540's
extension lifecycle remains unfinished. No dependencies, installed SDK or live
services are changed. Next: upstream handoff and these intrinsic gaps, then the
remaining terminal/playground/Playwright-like superset ledger. Full goal active.

September 2, approximately 01:03 UTC: page-owned timeouts/intervals now support
cancellation, async callback phases, bounded cumulative work and real argument
identity (`PAGE-TIMERS.md`). Actual testing found the ordinary SafeJS host bridge
copied guest arguments; the generic opaque-reference fix lives in the public SDK
candidate, not in private browser imports (`SAFEJS-GUEST-REFERENCES.md`). Upstream
#542 is filed and verified open; #540's composable lifecycle is still unfinished.
The combined contribution patch passes applicability checks against the pinned
base. No dependencies or installed SDK were changed.

The final browser suite passes 1075 tests across 61 files. Strict package/changed
test compilation and the 143-file Biome check pass. Seventeen actual timer-process
checks (15 automatic fixtures plus two controlled public-document evaluations),
22 executable CLI/paired-API checks, and 27 website-script regression checks
(25 fixtures plus two public reporting checks) pass. Books' bounded full text
omits the appended marker, so the timer probe uses a scoped semantic snapshot and
records full-text truncation separately. Owned actors and the isolated CLI service
are closed. No new visual UI run is claimed. Public Books/Quotes automatic scripts
still fail compatibility; controlled timer injection is not dynamic-site acceptance.

The native-config SDK suite passes 7957 tests, with the same 30 failed assertions,
six skips and 54 failed files as the prior checkpoint, verified by report comparison.
Eleven reference tests are new passes; the upstream gate is not green. Next:
review upstream lifecycle/function-object progress and continue browser globals,
network APIs and the original terminal/playground/superset feature ledger.
The full 72-hour goal remains active, not reduced to this timer milestone.

September 2, approximately 00:39 UTC: bounded page-console diagnostics and shared
Console/HTML playground inspectors are implemented. `PAGE-CONSOLE.md` records
capture, filtering, ownership, sanitized failures and limits. The browser suite
passes 1059 tests across 60 files; strict package/test compilation and the
configured 140-file Biome check pass. Twenty actual executable CLI/paired-API
checks, 25 owned-process fixture checks plus two public reporting checks, and
21 watchable UI checks pass. The screenshot was visually inspected. HTML export
requests are implemented, but actual downloaded-file transfer remains unverified:
the observer service prohibits downloads. No access policy was bypassed. Both
public Books/Quotes sites still fail automatic JavaScript compatibility; these
reporting checks are not dynamic-site acceptance. The owned observer session and
isolated service are closed. #540/#541 remain open; no upstream implementation
handoff was verified. No dependencies or SafeJS source changes in this checkpoint.
Next: browser globals/lifecycle and the full terminal/playground/API feature ledger.
The full 72-hour goal remains active.

September 2, approximately 00:13 UTC: contextual HTML fragments, atomic innerHTML
replacement, bounded serialization and the additive `html [target]` command are
implemented. `HTML-CONTENT.md` records contexts, ownership and incomplete parser
semantics. The final browser suite passes 1046 tests across 59 files, including
actual separate CLI invocations and colgroup/BOM/comment regressions. Strict
compilation and the configured 138-file Biome check pass. The owned-process probe
passes 21 fixture checks plus two public reporting checks; the actual executable
CLI/paired-API probe passes 18 checks on public documents and isolated state.
These include real HTML extraction after controlled DOM edits, not dynamic-site
acceptance. Automatic Books/Quotes scripts still fail compatibility. Inserted
innerHTML scripts remain inert and make no script-resource request. #540/#541
were checked and remain open. No dependencies, SafeJS source, production services,
commits or pushes changed. Next: broader HTML/native-DOM conformance and missing
browser globals/lifecycle, alongside the original terminal/playground/API ledger.
The full 72-hour goal remains active.

September 1, approximately 23:57 UTC: document fragments and shallow/deep node
cloning now work through the actual page-owned SafeJS process. `DOM-FRAGMENTS.md`
records ordered child transfer, clone identity/listener separation, aggregate
budget preflights, document-child validation and detached control-root indexing.
The browser suite passes 1004 tests across 57 files; strict package/test compilation
and the configured 134-file Biome check pass. Eighteen actual-process fixture
checks plus two public reporting checks pass. Both public sites still fail dynamic
JavaScript compatibility; no fixture or reporting assertion is counted as site
acceptance. Upstream #540/#541 were checked and remain open without an implementation
handoff. No dependencies, SDK source, production services, commits or pushes changed.
Next: HTML fragment parsing/innerHTML and full native clone semantics, while
continuing the original terminal/playground/API parity and real-site gates.
The full 72-hour goal remains active.

September 1, after the upstream handoff: parser-integrated write/writeln now
supports bounded synchronous markup insertion and written external scripts.
`DOCUMENT-WRITE.md` records 983 passing browser tests, strict compilation/style
checks, and fourteen actual owned-process fixture plus two public reporting
assertions. Prepared written scripts retain their original base/URL/attributes
even if the caller changes or detaches them. Books now executes its fallback and
loads real jQuery, then reaches the same function-object blocker as Quotes (#541).
Neither site passes dynamic compatibility. Nested inline and post-parse writes
remain explicitly unsupported; controlled nested evaluation is requested under
#540. No dependency or installed SDK changes. Next: review upstream progress,
continue browser globals/lifecycle and the full terminal/playground feature ledger.
The 72-hour goal remains active, not reduced to this parser milestone.

September 1, after the 23:09 checkpoint: metered numeric regex backreferences and
lookahead now pass 66 new tests; two older unsupported-feature cases are replaced.
The regex directory passes 190 tests. The full SDK run adds 64 net passes (7946),
with the same 30 fixture failures, six skips and 54 failed file paths. Real jQuery
now parses, then fails at guest function properties/prototypes. Books still needs
document.write. Thirteen owned-process fixture/public-reporting checks still pass;
neither real site passes dynamic-script compatibility.

The user authorized upstream issue filing: `poe-platform/poe-code#540` requests
the public extension/persistent-realm API; #541 requests guest function properties
and constructor prototypes. Both were verified open. `SAFEJS-EXTENSIBILITY.md`
records the handoff, and `upstream-issues/` preserves the published bodies.
The draft extension acceptance tests are preserved separately and are not applied
or counted as implemented. Next: browser-side parser-integrated document.write,
while reviewing upstream progress instead of duplicating its extension framework.
No dependency, installed SDK, PR, commit, push or package publication changes.
The original browser/terminal/playground scope and 72-hour goal remain active.

September 1, approximately 23:09 UTC: actual public-script diagnostics isolate
three concrete compatibility gaps. SafeJS now accepts omitted constructor
arguments and consumes single-statement terminators correctly, including unbraced
do/while and nested if/else. All 37 new TDD cases pass; the parser directory passes
589 tests. The broad SDK suite adds 37 passes (7882 total), with the same 30 fixture
failures, six skips and 54 failed files; no dependencies are installed. Unmodified
public jQuery advances past both errors and now fails on regex backreferences;
Books to Scrape requires document.write. The owned-process loader retains eleven
passing HTTP-fixture checks and two public reporting checks, not passing dynamic
site acceptance. All 962 browser tests, strict package/new-SDK-test compilation
and the 131-file configured style check pass. Next: bounded numeric regex
backreferences and genuine parser
insertion for document.write. Contribution changes remain an unapplied upstream
candidate; no issue, PR, publication or installed-package change. Goal active.

September 1, approximately 22:58 UTC: `SCRIPT-LOADING.md` adds explicit automatic
classic mode inside owned processes. Parser advancement and execution share a
queue; blocking/deferred/async scripts, early native page ownership and basic
readiness/load events are integrated. All 962 browser tests and eleven actual
HTTP-fixture checks pass;
Books to Scrape and Quotes to Scrape expose recorded script-compatibility failures.
Sixteen earlier manual CLI/API real-site checks still pass. New regressions cover
post-parse failure cleanup, detached prepared scripts and URL capture before fetch
slot waits. Next: diagnose genuine site execution failures, then improve DOM,
source-error recovery, microtask fidelity, browser globals and module loading.
No dependencies or installed SafeJS changes; the goal remains active.

September 1, approximately 22:38 UTC: opt-in `AGENT_BROWSER_SAFEJS_ROOT` service
mode now routes actual CLI and paired playground API commands through one owned
process per named session. `PROCESS-CLI.md` records thirteen lifecycle/router
cases, asynchronous service cleanup, shorter external CLI deadlines and metadata
discovery from the running service. All 942 browser tests pass, along with sixteen
actual compiled-SDK CLI/API real-site checks and nineteen default-mode CLI checks.
No dependencies or installed SDK changes. Automatic page-script loading and full
lifecycle/dynamic-site acceptance remain the next substantive gates.

September 1, approximately 22:25 UTC: `PAGE-PROCESS.md` records one persistent
realm per document and an explicit owned-session process API. The entire native
session and DOM live with the interpreter, avoiding duplicated parent/child DOMs.
Hard command deadlines and independent idle heartbeat supervision terminate only
the affected actor and settle after confirmed exit. Eighteen actual compiled-SDK
real-site checks pass, as do 925 browser tests and 58 focused SafeJS source tests.
The contribution candidate also exposes safe structured-result copying through
the lightweight public core. No dependencies or installed SDK changes. CLI/server
process routing, automatic script loading and real dynamic-site acceptance remain
next gates; this is not browser-parity completion.

September 1, approximately 22:01 UTC: native fill/selection/check/click, focus,
keyboard and form actions now share sync/async event-step sequences. Sessions and
CLI commands use the async path. `NATIVE-SCRIPT-ACTIONS.md` records 908 passing
browser tests, seventeen actual compiled-SDK fixture/real-site checks and nineteen
passing actual CLI checks. Real native link clicks honor guest cancellation and
guest-rewritten fragments. A real-site shutdown failure exposed history archival
depending on live events; that root cause is fixed with five regression cases,
including refusal to silently resubmit stopped POST history. No new dependencies
or installed SDK changes. Process-owned page realms, script loading, complete
event-loop fidelity and dynamic-site performance remain next gates.

September 1, approximately 21:46 UTC: actual guest node add/removeEventListener
bindings now drive the owned dispatcher, with live event identity, once/passive
semantics, explicit input/keyboard/focus/submit fields and bounded async errors.
Trusted realm state aborts fatal dispatch; guest-spoofed error codes do not.
`SCRIPT-EVENTS.md` records 885 passing browser tests and forty compiled-core
fixture/real-site checks. The initial deliberate-loop timeout remains recorded;
bounded callback profiling is separate from functionality and not a fast-browser
claim. Retained-DOM callback cost also needs profiling/optimization. Native action
migration, page ownership and website script loading remain
next gates. The full objective stays active, with no new dependencies/publication.

September 1, approximately 21:32 UTC: SafeJS now has a tested persistent-callback
phase API and shared realm job queue. Fifteen new interpreter tests and ten new
browser controlled-dispatch tests pass; the full browser suite is 870/870 across
47 files. Twenty-five compiled-core checks pass, including explicit test callbacks
on two real public HTML loads. `CALLBACKS.md` separates this foundation from the
still-missing guest EventTarget bindings, native default-action integration,
process ownership and automatic website scripts. The broad SafeJS run adds fifteen
passes without new failed files; existing upstream tooling failures remain visible.
No dependency, installed SDK change or upstream publication is made.

September 1, approximately 21:11 UTC: the SafeJS source extension now includes
explicit live host objects, tested with 19 adversarial/functional cases. The browser
has an experimental `ScriptDom` binding to its own document tree, not copied DOM
records. Seven actual compiled-SDK fixture checks and six additional real-site
checks pass on Example Domain and Books to Scrape; injected test scripts modify
only local trees. The browser suite passes all 860 tests in 46 files. `SCRIPT-DOM.md`
records API coverage, resource samples and remaining process/event/script-loading
gates. No dependency is installed and automatic website scripts remain disabled.
An adversarial `then` accessor issue was fixed in SafeJS source, not worked around
in browser code. The broad upstream suite still has unrelated tooling failures.

September 1, approximately 20:51 UTC: an initial reusable SafeJS persistent-realm
extension is implemented in the isolated source checkout. Twenty-one new realm
tests and six compiled public-core consumer checks pass. Lexical state, closures,
object identity and compiled regexes survive separate evaluations without replay;
lifetime budgets, cancellation, retained promises and resource cleanup are tested.
`SAFEJS-EXTENSIONS.md` records the local contribution patch and remaining gaps.
Full upstream validation is not green with available shared tooling; missing
dependencies and Node-typing fixture errors remain visible in the reports. None
are installed to bypass the no-dependencies instruction. The browser foundation
suite has 853 passes in 45 files. Website scripts remain disabled and no runtime
installation, upstream publication or browser-parity claim is made.

September 1, approximately 20:40 UTC: the owned script-process layer now has a
parent-enforced watchdog, bounded protocol, empty environment, Node permission
flags and verified child cleanup. Thirteen focused tests and six installed-SDK
process assertions pass (`SCRIPT-PROCESS.md`). The user authorizes extending
SafeJS with a possible later contribution. A separate source checkout matches
v13.0.10; its scope baseline passes 28 tests and a TDD-first extension plan is in
that checkout's `docs/plans/browser-realms.md`. No installed runtime was patched,
no additional dependency was installed, and nothing was published. Reusable realm
and host-object semantics were still pending at that checkpoint; page scripts remain disabled.

September 1, approximately 20:21 UTC: the user confirmed no new dependencies and
explicitly allowed Poe Code SafeJS. The new experimental single-evaluation adapter
uses its already-installed public SDK, with no package install or lockfile change.
All 840 Node tests and 22 installed-SDK checks pass. `JS-RUNTIME.md` records the
capability boundary, limits, initial adapter-loading failure, and remaining DOM/
page-realm/lifecycle integration. Website scripts remain disabled; this is not
completion of M2 or the full browser goal.

Previous CSS checkpoint (September 1, approximately 20:05 UTC): the own-engine HTML
path now has a bounded display/visibility cascade, guarded external CSS loading,
CSS-aware snapshots/actions/focus, and per-tab `resize` plus `styles` CLI commands.
`CSS.md` records the boundary. All 820 Node regression tests and 243 focused Bun
core checks pass; 19 public separate-process CLI assertions pass, including real
catalog stylesheet application. The initial 813-pass/one-failure run is preserved
and its action-error precedence regression is fixed without weakening the test.
This advances K02/P08, not full CSS layout or full browser actionability. Website
JavaScript, visual rendering/exports and complete Kitesurf/Playwright parity remain
required work. The goal is active; no new dependency is approved or installed.

## Product contract

Build our own lightweight browser in TypeScript, suitable for agents and
meaningfully more useful than curl. Agents consume semantic document state and
stable references, execute actions, and observe the results. A Browsh-inspired
terminal/web view is an observer of the same session, not the agent's primary
input format. Kitesurf is an architectural reference, not a hosted dependency.

- No Chromium, Firefox, browser extension, CDP-connected browser, or browser
  service underneath this engine. Preserve `../browser-terminal` as the existing
  heavyweight alternative; do not silently fall back to it.
- Browser implementation is TypeScript: document model, browser API bindings,
  navigation, event/default-action behavior, policy, semantic layout and clients.
- A JavaScript interpreter is a building block, not a browser engine. The user
  explicitly permits existing Poe Code SafeJS; no other new dependency is allowed.
  Do not execute website code with host eval,
  `new Function`, Node's `vm`, or an unrestricted host worker.
- Cloudflare compatibility is optional. A normal low-resource machine is a
  valid target. Keep platform adapters separate from the document/browser core.
- Preserve Playwright CLI command/session conventions and add agent features.
  Unsupported responses are development gaps, never evidence of a functional
  superset. Test syntax, lifecycle and behavior, not only matching command names.
  Browser-specific launch/extension flags conflict with the independent-engine
  requirement; record that compatibility decision instead of silently launching
  Chrome or pretending to implement it.
- Website content is untrusted data, never trusted agent instructions. No claim
  of undetectability, bot-challenge bypass, or a genuine Chrome fingerprint.

## Dependency decision

Final direction: **no new dependencies; Poe Code SafeJS is explicitly allowed**.
Rebuild other needed functionality ourselves. Use SafeJS's public SDK, not copied
private internals or host eval. The experimental adapter is described in
`JS-RUNTIME.md`; no package was installed or upgraded to use it.

Historical requests, superseded by that decision:

1. `parse5`: standards-oriented HTML parser, already present transitively in the
   repository. Adapt its parsed tree into our document model. Parsing is not a
   full browser implementation.
2. `quickjs-emscripten`: isolated JavaScript evaluation with bounded memory,
   stack and execution time. The browser APIs and document implementation remain
   our TypeScript code. Start with a minimal VM bridge and deny host access.

Do not add either dependency, vendor it, or bypass approval by resolving private
transitive paths. Dependency-free model, policy, snapshots and tests can proceed.

September 1, 2026 update: a CLI permission request to install these two packages
was rejected because trusted user approval was still absent. Neither package was
installed, no dependency declaration was added and the workspace lockfile was
unchanged. Do not retry installation through another route. Explicit user consent
is required for the third-party downloads and manifest/lockfile updates.

HTML checkpoint: an original dependency-free TypeScript parser now enables bounded
real HTML reading/actions. It does not import, copy or vendor either requested
dependency. `HTML.md` documents the intentionally incomplete parser and verified
public workflows. Full parsing conformance and isolated page JavaScript remain
required. The later user-approved SafeJS direction resolves the runtime selection,
not the unfinished browser integration or language-compatibility work.

## Milestones

The time ranges are planning budgets, not a reason to delay working features.

### M0 — architecture and measurable acceptance (hours 0–6)

- [x] Create this task document and a separate `browser-agent` package.
- [x] Inspect current browser interfaces and existing dependencies.
- [x] Research the HTML parser and isolated JS runtime before requesting approval.
- [x] Define serializable agent actions/results, capability reporting and errors.
      The implemented command subset and explicit gaps are documented in `CLI.md`.
- [x] Implement and test our internal document model, stable references and mutation rules.
- [x] Implement bounded semantic snapshot foundations with hidden/password handling.
- [ ] Define navigation/resource policy and explicit runtime adapter contracts.

### M1 — better than curl without JavaScript (hours 6–18)

- [x] Implement a bounded Node host transport with pinned DNS, TLS verification,
      redirects, decompression, deadlines, cancellation and local security tests.
- [x] Probe four public HTTPS sites through that transport and preserve results.
- [x] Parse actual HTML into our document model with element identity preserved.
      The implemented subset and limits are in `HTML.md`; full conformance remains open.
- [ ] Fetch with redirect/timeout/size limits, correct decoding and cancellation.
- [ ] Prevent private-network access by default, including redirects, unusual IP
      syntax and DNS rebinding; tests explicitly opt in to local fixture origins.
- [ ] Implement isolated cookie jars, origin handling and navigation history.
- [ ] Implement click/fill/type/press, links, labels and basic native form actions.
- [ ] Stable references survive non-destructive changes and reject stale pages.
- [ ] Expose useful JSON CLI/library operations and deterministic local fixtures.
- [x] Demonstrate real-site document reading and multi-page navigation by refs.
      The public Books to Scrape CLI workflow follows parsed refs and traverses back.

### M2 — real page JavaScript, not host execution (hours 18–36)

- [x] Select the user-approved existing SafeJS runtime and verify its public SDK.
- [ ] Implement disposable persistent page realms and hard execution containment.
- [ ] Bridge our DOM through a narrow, validated capability boundary.
- [ ] Support script loading, event listeners, DOM mutation and default actions.
- [ ] Support bounded promises/timers, fetch/XHR and document lifecycle events.
- [ ] Add module loading and document the supported browser API surface.
- [ ] Enforce same-origin/CORS, storage and cookie isolation for script access.
- [ ] Bound script CPU, memory, callbacks, requests, output and navigation loops.
- [ ] Test hostile scripts, host-access attempts, infinite loops and teardown.
- [ ] Demonstrate an actual JavaScript-dependent public page and a local dynamic
      application whose content/actions cannot be obtained by curl alone.

### M3 — agent API and human observability (hours 36–48)

- [ ] Semantic snapshots, incremental changes, action readiness and useful errors.
- [ ] Bounded session/tab lifecycle and action ordering, including cancellation.
- [ ] Playwright CLI baseline command families, named sessions and selectors.
- [ ] Preserve command/result/error and artifact semantics with fixture workflows.
- [ ] Agent extensions: JSON mode, diffs, extraction, batches and resource budgets.
- [ ] Kitesurf-compatible CDP/DevTools surface backed by our engine, not Chrome.
- [ ] Text-first terminal projection, keyboard navigation and safe control codes.
- [ ] Playground URL entry, example corpus and inspect/screenshot/PDF/HTML actions.
- [ ] Inspector with page/text view, DOM, console, network and real memory metrics.
- [ ] Authenticated loopback HTTP API and a web observer of the same session.
- [ ] Stream state/text deltas instead of shipping raster screenshots by default.
- [ ] PNG/PDF exports rendered by our implementation, not outsourced to Chromium.
- [x] Implement native paginated PDF with independent parser/text/pixel checks,
      artifact transport, private CLI files and mocked playground downloads.
      The supported screen-layout profile and remaining print/live-site gates
      are recorded in `PDF.md`; this is not full browser print parity.
- [x] Build bounded normal-flow document geometry and native text-raster/PNG
      primitives, with actual interpreted-mutation and pixel fixtures. This is a
      restricted building block; the broader PNG/PDF/CLI gate above stays open.
- [ ] JS/CSS/SVG/canvas/iframe compatibility matrix and public TodoMVC variants.
- [ ] Dry-run transport mocks every mutation and exposes mocked changes to reads;
      no mode disclosure or accidental real network mutation from simulation.

### M4 — compatibility and resource evidence (hours 48–66)

- [ ] Check real websites across static content, navigation, forms and JavaScript.
- [ ] Record URLs, UTC times, actions, assertions, bytes, latency and failures.
- [ ] Test semantics on Node and Bun without relying on a desktop browser binary.
- [ ] Measure cold process startup, initial navigation, snapshot size and RSS.
- [ ] Compare raw fetch/curl output with our usable snapshot and action results.
- [ ] Soak repeated navigations, mutations and session closures for leaks.
- [ ] Profile expensive work; avoid screenshot/layout machinery agents do not need.

### M5 — final hardening and handoff (hours 66–72)

- [ ] Run focused and full package suites, typecheck, lint and security tests.
- [ ] Re-run real-site acceptance cases after final runtime changes.
- [ ] Inspect real CLI and streamed web output, not just generated fixtures.
- [ ] Publish reproducible commands, limitations and measured resource results.
- [ ] Audit every product requirement against code and evidence; retain failures.
- [ ] Audit every Kitesurf, playground and Playwright CLI row in `COMPATIBILITY.md`.
      Do not mark the overall goal complete while required rows remain unverified.
- [ ] Ensure no unrelated work, production service or dependency was changed.
- [ ] Only mark the goal complete when the useful browser and verification exist.

## Acceptance evidence

### HTML checkpoint — September 1, 2026

- 772 Node tests pass across 39 files. The original TypeScript tokenizer/tree builder
  plugs into CLI/session/playground loading, queries, snapshots, links and forms.
  No parser/runtime dependency or browser-engine fallback was added.
- 76 focused parser/decoder/form cases also pass on Bun; networking stays Node-only.
- All 17 public separate-process CLI checks pass, including Example Domain,
  table-based Hacker News content, Books to Scrape ref-driven product navigation,
  HTML back traversal, unsupported XML preservation and complete service cleanup.
- An actual parsed public httpbingo form accepts type/fill/check/Enter and returns
  all seven expected synthetic fields. No controls are constructed, attributes
  rewritten, listeners injected or validation bypassed. Empty optional email/time
  fields have tested emptiness semantics; nonempty type validation is still missing.
- All 17 UI assertions pass on desktop and at 390×844. Partial-parser/JS-off
  disclosure and real HTML are visible; private screenshots were inspected. The
  owned watchable session is closed/verified absent, the isolated service exited
  zero, and its connection file is gone. No production daemon restart occurred.
- `HTML.md` records omitted parsing states/entities/modes, explicit foreign-content/
  template failures, disabled scripts/resources and incomplete rendering. Basic
  parsing is not full Kitesurf/Playwright parity; the complete goal remains active.

### Keyboard checkpoint — September 1, 2026, 19:14 UTC

- 714 Node tests pass across 36 files; build, production/new-test typechecks and
  formatting pass. Focus, caret editing, cancellation, reentrant mutations,
  readonly/maxlength, tab order, Unicode deletion and implicit forms have tests.
- Separate actual CLI processes preserve focused selection and editing, then
  navigate using Enter and fill --submit. Focus is visible in semantic snapshots
  and queried through :focus/:focus-within. No CLI spelling-only pass is counted.
- 65 focused core/session cases pass on Bun without enabling its network backend.
- Two public keyboard command-host probes pass against httpbingo.org, using
  synthetic URL-encoded/multipart form values on a real loaded JSON document.
  Responses, submitter choice, focused snapshots and event sequence are checked.
  Controls are constructed and callbacks are host code, not parsed HTML or site JS.
- Both existing public label/reset/form echo probes also pass at 19:16 UTC after
  accounting for edited text's change event on focus loss, with zero listener errors.
- `KEYBOARD.md` records scope and gaps, including keyup-before-session-submit
  timing, IME/contenteditable/held-key omissions and code-point rather than
  grapheme/visual caret movement. No full compatibility row is complete.
- HTML parser and isolated-JavaScript dependency approval remains outstanding.
  No new dependency, lockfile edit, browser-engine fallback or daemon restart.

### Network checkpoint — September 1, 2026, 15:45 UTC

- 159 tests pass using the package's actual `test` script on Node 22.22.0.
  Build, compiled package self-imports, typecheck and Biome checks pass.
- 130 portable-core/host-guard checks pass on Bun 1.3.8. This is not a claim
  that the network backend is supported on Bun.
- Node real-site probes pass for Example Domain, Hacker News, Books to Scrape
  and the Quotes to Scrape JavaScript page's initial HTML shell. Final run:
  15:44 UTC; response latencies 50, 229, 62 and 53 ms respectively. These are
  individual observations, not general browser performance claims.
- `reports/network-sites-node-2026-09-01.json` records status, content markers,
  hashes, sizes and timing. No HTML parser, page JS, DOM action or renderer is
  involved, so browser-level real-site acceptance is still pending.
- Negative TLS tests caught a Bun incompatibility: the local server received
  a request before a custom hostname check rejected its certificate. The
  production adapter now refuses Bun; no weaker-verification fallback remains.
  `reports/bun-tls-ordering-2026-09-01.json` preserves the failing diagnostic;
  `scripts/check-bun-tls-ordering.ts` reproduces it locally.
- The Node TLS suite verifies original host/SNI, explicit fixture trust,
  default rejection of an untrusted certificate, hostname mismatch with zero
  HTTP requests received, and HTTPS downgrade denial. `NETWORK.md` records the
  host/runtime decision, current limits, references and unimplemented layers.
- HTML parser and isolated-JavaScript dependency approval remains outstanding.
  Cookies, actual navigation/history/actions, JS, layout and playground are
  still required. No Kitesurf/Playwright parity row is declared complete.

### Combined history checkpoint — September 1, 2026, 18:56 UTC

- 665 Node tests pass across 34 files; 46 focused history/archive/session tests
  pass on Bun without enabling its unsupported network adapter.
- Session `go`/`back`/`forward`, CLI `go-back`/`go-forward` and playground controls
  traverse actual combined same-/cross-document entries. Fresh loads restore
  bounded JSON state and keys; old DOMs stay closed rather than forming a BFCache.
- Reload preserves current state/keys/forward entries. New branches discard old
  forward history. Per-tab archive budgets evict inactive documents; origin-changing
  restoration redirects and closed POST entries fail explicitly rather than leaking
  state or silently replaying requests. Stop/supersession/history-mutation races pass.
- Thirteen public CLI assertions pass across separate processes, including real
  JSON/RFC back/forward, clean exit and connection-file removal. The initial report
  retained its stale expected-count failure (11 versus 13); it was corrected and rerun.
- Sixteen real-site UI assertions pass at desktop and 390×844 widths. Visual
  inspection caught and corrected a compressed mobile tab picker. The task-owned
  watchable session is closed and verified absent; isolated test services are stopped.
- `NAVIGATION-HISTORY.md` documents host/native API differences, bounds and gaps.
  HTML/isolated site JS, full history lifecycle/native bindings, BFCache, frame
  histories, POST confirmation and persistence remain open. No full parity row is
  marked complete. No new dependencies were installed; approval is still pending.

### Native form-navigation checkpoint — September 1, 2026, 18:38 UTC

- 638 Node tests pass across 32 files. The 40 new portable form-submission/session
  cases also pass on Bun; Node remains the supported network host.
- Submit-button/label activation now runs supported validation, cancelable submit
  events, current-value serialization and owned GET/POST navigation. Invalid or
  canceled forms return explicit metadata without pretending to navigate.
- A host `requestSubmit` API supports submitter overrides and explicit bounded
  file maps. Session/CLI results omit serialized values and file bytes. Missing
  constraints and new-window/named targets fail before network transmission.
- POST fragments do not take the GET-only same-document shortcut. Newer listener
  navigation, cancellation and late results cannot replace the wrong document.
  Committed POST results refuse implicit reload replay; 301/302/303 conversions
  to GET and 307/308 method preservation are tested with real local HTTP.
- Two public demo POSTs at 18:35 UTC pass through the session engine, load echo
  JSON into fresh trees, verify listener-updated values and multipart file contents,
  close old refs and reject automatic replay. These are constructed controls in
  loaded JSON, not parsed website forms or website JavaScript.
- `FORM-NAVIGATION.md` lists constraints and gaps: FormData/formdata, implicit
  keyboard submission, native FileList, other targets, full validity APIs and
  parsed-site/JS integration remain open. No compatibility row is declared complete.
- Build, production and new test-source typechecks, Biome and diff checks pass.
  No dependencies were installed; parser/runtime approval is still outstanding.

### Shared playground checkpoint — September 1, 2026

- 590 Node tests pass across 29 files, including token expiry/quotas, public shell
  restrictions, CLI-only approval/shutdown, window revocation, actual CLI approval
  and observer reads that do not consume agent snapshot diffs.
- The new UI uses the real command service for named sessions, tabs, navigation,
  semantic text/snapshots, counters, activity and supported CLI input. It neither
  replaces nor delegates document execution to the existing Chromium alternative.
- Connection uses an explicitly approved one-time pairing handle. No credentials
  in URLs/DOM/persistent browser storage; disconnected views are cleared.
- `PLAYGROUND.md` documents the runnable subset, boundaries and repeatable UI probe.
  Public JSON/RFC navigation and cross-process state are checked through the UI,
  not inferred from unit tests. Dated probe reports preserve failures as well.
- All 14 end-to-end UI assertions pass at desktop and 390×844 widths. Visual
  inspection caught and corrected a narrow-sidebar layout issue. The task-owned
  watchable session and isolated test services are closed; metadata cleanup was
  verified. Build, production/test-source typechecks, Biome and diff checks pass.
- This is not full Kitesurf playground parity: HTML/website JS, pixel rendering,
  exports, page console, streaming and full command families remain open. Parser/
  isolated-runtime dependency approval is still outstanding; none were installed.

### Executable CLI checkpoint — September 1, 2026, 18:05 UTC

- 564 Node tests pass across 27 files; 46 dispatcher/parser checks also pass on
  Bun. Build, production typecheck, new test-source typechecks and lint pass.
- The package declares `agent-browser` and supplies a built Node CLI. A foreground
  package-owned service retains named sessions across independent invocations;
  no production daemon, tmux session, dependency or other package was changed.
- Shared command dispatch implements the documented navigation/tab/storage/action/
  snapshot subset, bounded diffs and capability reporting. Unsupported commands,
  options and unfinished defaults fail explicitly; recognized syntax is not parity.
- Session commands are ordered, queued mutations check cancellation, and closing
  is out of band. The loopback API requires bearer auth, exact Host/Origin, bounded
  JSON, body deadlines and private owner-checked discovery files. Disconnects and
  shutdown cancel owned work. No page code can access host execution.
- Actual subprocess tests cover separate CLI invocations and foreground service
  startup/shutdown. Eleven public assertions pass for JSON/RFC text, in-memory
  storage persistence/isolation, reloads, expected HTML rejection and private-file
  cleanup. Test services are closed; credential values are not published.
- `CLI.md` documents how to run the useful subset now. The full scope remains:
  HTML parsing, isolated JavaScript, cross-document history, remaining CLI families,
  automatic service launch/recovery, rendering and the playground still need work.
  Its shared API is implemented, not its UI. No compatibility row is complete;
  parser/runtime dependency approval is still outstanding.

### Document-session checkpoint — September 1, 2026, 17:46 UTC

- 519 Node tests pass across 23 files; 59 focused session/history/text-loader
  checks also pass on Bun. Build, production typecheck, changed/new test-source
  typechecks and lint pass. The pre-existing TLS test-source typing issue remains.
- `BrowserSession` now owns tabs, storage, a cookie jar and transport. Explicit
  loader adapters transfer fresh document ownership; successful loads atomically
  replace the old tree, while errors and 204/205 preserve it. Reload invalidates refs.
- Same-resource fragment navigation retains the tree; cancellation reaches the
  queued history job before mutation. Superseded/closed/timed-out loads cannot
  commit. Reentrant cancellation is ordered; late trees are disposed. Unsettled
  adapters retain bounded job slots, while stopped deadlines are cleared immediately.
- A real text/JSON loader creates literal preformatted documents, never parses
  HTML or executes markup. Local HTTP tests cover redirects, cookie isolation,
  replacement and failed loads. Public RFC text/JSON load successfully, reload
  closes the old tree, and expected HTML rejection preserves the current page.
- Four public requests yield three commits and full cleanup. The 502,941-byte RFC
  load took 154 ms in that run; instantaneous process RSS was 78–79 MiB, not a peak
  or HTML/JS performance claim. A Domain cookie rejection is recorded, not hidden.
- `SESSION.md` documents the host API and loader/ownership contract. General HTML
  loading, page JavaScript, unified cross-document history, form submission,
  lifecycle events, other navigation targets, CLI persistence and playground are
  still incomplete. No parity row is marked complete; dependency approval remains
  outstanding and no dependencies, lockfiles or unrelated packages were changed.

### Cookie-session checkpoint — September 1, 2026, 17:32 UTC

- 477 Node tests pass across 20 files. All 55 cookie unit cases also pass on Bun.
  Build, production typecheck, standalone typechecks of the new cookie tests and
  lint pass. An ad-hoc typecheck of the existing TLS test file found its pre-existing
  `TLSSocket.servername` typing error; runtime TLS tests pass. See `COOKIES.md`.
- Bounded, independently owned cookie jars implement host/path scope, expiry,
  Secure/HttpOnly, prefix checks, conservative SameSite handling, quotas and cleanup.
  Unsupported Domain/Partitioned cookies are rejected and counted, never guessed
  into a broader credential scope. Registrable-domain/PSL support remains missing.
- Node transport now reads/writes jar state only with explicit cookie context.
  It recomputes headers per redirect, retains cross-site/origin redirect taint,
  handles response cookies before body processing and rejects raw Cookie overrides.
  Existing TLS verification still occurs before transmitting cookie-bearing HTTP.
- Public cookie-echo assertions pass for setting through a redirect, persistence,
  isolated jars and deletion through a redirect. Six small GET requests carry
  only fixed synthetic data; sanitized reports show all transports/jars closed.
- This is real HTTP session evidence, not parsed-site/browser acceptance. Page
  cookie bindings, profile lifecycle integration, parser/runtime, browser CLI and
  playground remain incomplete. Dependency approval is still outstanding; no
  dependency or lockfile was changed and no compatibility row is marked complete.

### Label/reset checkpoint — September 1, 2026, 17:20 UTC

- 409 Node tests pass across 18 files; 73 focused form-action/core checks also
  pass on Bun. Build, typecheck, focused test typechecking and lint pass.
- Labels share a revision-cached association index with snapshot names. Explicit
  `for`, implicit first-control associations, duplicate IDs, interactive descendants,
  callback reassociation, cancellation and disabled/inert controls are covered.
- Label forwarding and reset-button activation now execute instead of returning
  placeholder intents. Form reset dispatches its cancelable event, guards recursion,
  uses current form owners/defaults after callbacks and clears supported dirty state.
  It preserves indeterminate state and emits no fabricated input/change events.
- Reset plans are collected before mutations to prevent repeated select-index builds.
  Unsupported output controls fail before partial native reset. Intrinsic FileList,
  specialized input sanitization, custom elements and full DOM bindings are missing.
- Two public synthetic POSTs pass with label activation, reset/default assertions,
  refilling, event order, independently decoded fields/file content and closed transport.
  The documents and callbacks are constructed host fixtures, not parsed website JS.
- `FORM-ACTIONS.md` and new reports preserve these boundaries. HTML/runtime dependency
  approval is still outstanding; no dependency or lockfile change was made. The full
  browser, CLI superset, rendering and playground goals remain active and incomplete.

### History checkpoint — September 1, 2026, 17:05 UTC

- 383 Node tests pass across 16 files; the 172 history/URL/event/query checks
  also pass on Bun. Build, typecheck, focused test typechecking and lint pass.
- Same-document history now preserves isolated JSON state, queues back/forward
  traversal, enforces URL rewrite rules, prunes forward entries, evicts bounded
  old entries and rejects work on closure or quota exhaustion.
- Window event targets are optional in the event core and enabled for interaction
  documents. Popstate/hashchange use Window, not a fabricated document event path.
- Fragment navigation updates stored target state and snapshots without fetching.
  URL rewriting alone does not retarget `:target`. Tests caught and corrected that
  distinction; fragment lookup also checks raw values before decoded values.
- Base URL/target resolution is shared by links, form plans, snapshots and history.
  URL changes retain element references and appear in the document revision log.
- A constructed routing fixture exercises anchor intent, fragment selection,
  trusted host listener updates, semantic state and back navigation. This is not
  website JavaScript execution or parsed-site browser acceptance.
- Evidence: `HISTORY.md`, `reports/unit-node-2026-09-01-history.json` and
  `reports/history-core-bun-2026-09-01.json`. Earlier reports remain preserved.
- Full structured cloning, page History/Location bindings, scrolling/focus,
  cross-document loading, reload, frames, BFCache, CLI and playground remain open.
  Dependency approval remains absent. No new install attempt or workaround was
  made. Full Kitesurf and Playwright superset scope and parity gates are unchanged.

### Query checkpoint — September 1, 2026, 16:48 UTC

- 335 Node tests pass across 14 files, with zero failed/pending tests. The 104
  selector tests also pass on Bun; this does not enable Bun networking.
- `DocumentQueries` implements bounded selector parsing/matching, querySelector,
  static querySelectorAll, matches and closest. Lists, attributes, combinators,
  logical/relative selectors, filtered nth selectors and native control states
  use our document model; there is no external selector engine.
- Mutation-aware node indexes, LRU compiled selectors, memo budgets and close
  cleanup bound retained state. Malformed or unsupported selectors fail explicitly.
- Constructed 100/2,000/10,000-element fixtures verify matching, denial of expensive
  work and cleanup. The largest fixture observed roughly 25 ms construction,
  22 ms cold indexed ID lookup, 8/3 ms cached nth/relational queries and a 98 MiB
  process RSS sample. These are not full-browser or real-site performance claims.
- Evidence: `SELECTORS.md`, `reports/unit-node-2026-09-01-queries.json`,
  `reports/queries-bun-2026-09-01.json` and
  `reports/query-resources-node-2026-09-01.json`. Earlier evidence is preserved.
- HTML parsing and isolated runtime installation still need explicit approval.
  No parsed-site/website-JS/navigation/CLI/playground acceptance gate is complete.
  The full Kitesurf and Playwright superset requirements remain unchanged.

### Event/interaction checkpoint — September 1, 2026, 16:34 UTC

- 231 Node tests pass across 13 files. Build, typecheck, focused test-file type
  checking and Biome checks pass. No dependencies have been added.
- Document events implement capture/target/bubble propagation, cancellation,
  once/passive/abortable listeners, mutation-safe paths, bounded diagnostics,
  cleanup and nested dispatch/invocation budgets. Blocking host callbacks still
  require the future isolated runtime's interruption mechanism.
- Event-driven fill/check/select/click operations update our own control model.
  Checkbox/radio preactivation is visible to listeners and restored on canceled
  clicks. Agent check verifies the final state. Indeterminacy appears in snapshots.
- Link/submit/reset/label/picker defaults are explicit intents, not executed
  operations. No focus, keyboard, hit testing or browser submit pipeline yet.
- Four local HTTP roundtrips now use event-driven interactions. Two public demo
  POSTs at 16:31 UTC verify event order, an input-listener-updated field and form
  values; multipart also confirms file content. These use constructed documents
  and trusted host callbacks, not parsed site HTML or website JavaScript.
- Evidence: `EVENTS.md`, event/interaction tests and
  `reports/form-events-node-2026-09-01.json`. The final 231-test Node run is
  preserved in `reports/unit-node-2026-09-01-events.json`, with zero failures or
  pending tests. Previous reports remain preserved.
- Dependency approval for HTML parsing and isolated scripts remains outstanding.
  Full Kitesurf coverage, executable Playwright CLI superset behavior and the
  playground remain required and incomplete; no parity row is marked complete.

### State/form checkpoint — September 1, 2026, 16:20 UTC

- 195 Node tests pass across 11 files; build, typecheck and Biome checks pass.
- Isolated local/session storage has profile/tab/origin partitioning, opener
  copying, atomic local-state replacement, quotas and invalidated closed handles.
- Connected-document control helpers cover form ownership, inherited disability,
  radio/select state and fill/check/select updates. Snapshots use this state.
- Form planning supports URL-encoded, text/plain and multipart payloads, native
  successful controls, submitter overrides, bounded explicit upload bytes and
  line-ending/header escaping. It does not dispatch events or navigate.
- Document close hooks release control indexes; cleanup continues after failures.
- Four local HTTP peer roundtrips and two public demo POST echoes pass. Public
  checks at 16:15 UTC verify URL-encoded fields and multipart fields/file content.
  These use constructed documents, not parsed websites or browser submissions.
- The portable-core Bun diagnostic records 161 passed and one failed check:
  its native multipart reader loses the uploaded filename. Preserve the failure;
  Node encoding, peer and independent public service checks pass. Bun remains
  unsupported for network execution after the separate negative TLS diagnostic.
- See `STATE-FORMS.md` and `reports/README.md` for contracts, evidence and gaps.
  No browser compatibility row is complete. Dependency approval for HTML parsing
  and isolated page JavaScript is still pending; no dependency has been added.

### Foundation checkpoint — September 1, 2026, 15:19 UTC

- 49 package unit tests pass across CLI parsing, internal document mutation and
  semantic snapshots. TypeScript checking and Biome checking pass.
- Own document tree has bounded nodes/text/depth/change history, immutable read
  views, connected-node references and runtime mutation validation.
- Snapshot JSON has a measured UTF-8 byte ceiling, semantic depth/entry/string
  limits and truncation metadata. Text output strips terminal control codes.
- Password values, file-input paths and URL credentials are omitted. Snapshot
  diffs reset across documents/scopes and incomplete views rather than inventing
  deletions. These are targeted redactions, not general secret detection.
- Evidence: `src/cli-parser.test.ts`, `src/document.test.ts`,
  `src/snapshot.test.ts`. Command:
  `bun --bun node_modules/vitest/vitest.mjs run packages/browser-agent/src --maxWorkers=1`
  from the repository root. Vitest requires execution outside this environment's
  sandbox to start its worker; this is not a test skip.
- This checkpoint uses constructed document fixtures, not parsed real websites.
  HTML parsing, network navigation, isolated JavaScript, rendering, browser
  actions and the playground remain unimplemented. None of their parity rows
  are marked complete by these unit tests.
- Snapshot semantics currently cover a documented subset of native/ARIA roles,
  labels, control state and explicit hidden attributes, not the full accessible
  name algorithm or computed CSS visibility. Layout boxes are not fabricated.
- The temporary reference-inspection browser session was closed and its absence
  from the service session list verified. It was never our engine.

### What must make this better than curl

1. Read an actual page as compact text plus named, typed actionable elements.
2. Follow an element reference, keep session state, go back and continue browsing.
3. Fill and submit a designated test form with correct native control semantics.
4. Execute page JavaScript that changes the document and handles a click, then
   expose that changed document to the agent without a separate browser engine.
5. Observe the same session in a terminal/web text view.
6. Contain malicious or runaway website code and network requests.

### Real websites

Candidate corpus (availability and exact assertions must be checked at run time):

| Category | Candidate | Action policy |
| --- | --- | --- |
| Small static page | `https://example.com/` | Read and inspect a link. |
| Dense link listing | `https://news.ycombinator.com/` | Read; follow a public pagination link. |
| Catalog/navigation | `https://books.toscrape.com/` | Read; follow category/product/pagination refs. |
| Documentation | Public TypeScript or MDN documentation | Read headings, links, code and content. |
| JavaScript content | `https://quotes.toscrape.com/js/` | Read JS-generated content and public pagination. |
| JavaScript application | A public TodoMVC demonstration | Disposable demo-only interactions; no account. |
| Forms | A designated HTTP echo/test service | Only synthetic non-sensitive values. |

No purchases, messages, account changes, or writes to real user data. Public-site
network tests are opt-in and rate-limited; no automatic retries of mutations.
Do not include passwords, auth cookies, API keys or private responses in reports.
Record blocks/timeouts as results rather than changing the sample to hide them.

### Performance targets

Provisional goals to measure, not current claims: a small single-page session
under 100 MiB RSS, sub-second cold startup on this machine, and default semantic
output capped at 16 KiB. Report host/runtime/version, document complexity and
network latency separately. Larger JS applications may exceed the initial target;
publish those measurements and set explicit resource limits instead of pretending
all sites fit. A terminal display alone is not evidence of a lightweight engine.

## Research references

- Browsh design: https://www.brow.sh/docs/introduction/
  Its Firefox dependency is specifically not our implementation architecture.
- Kitesurf design: https://blog.cloudflare.com/kitesurf/
  Worker-native components and scoped capabilities are reference ideas only.
- Kitesurf functionality: https://developers.cloudflare.com/browser-run/kitesurf/
- Kitesurf playground: https://kitesurf.cloudflare.app/
- Playwright CLI: https://github.com/microsoft/playwright-cli
- HTML parsing: https://parse5.js.org/
- Runtime binding: https://github.com/justjake/quickjs-emscripten
- Host VM warning: https://nodejs.org/api/vm.html

Research checked September 1, 2026. No downloaded source has been copied into
this package, and no new dependency has been installed at this checkpoint.
