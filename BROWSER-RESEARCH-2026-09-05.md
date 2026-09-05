# Native-browser research synthesis — September 5, 2026

## Scope and evidence standard

For a local-LLM builder, benchmark reader, or prospective product user: these are practical conclusions from **saved native-browser extractions**, not a new browsing run, independent product verification, or comprehensive market survey. No external tools or new network requests were used for this synthesis. Source assertions are attributed below; workload choices and reporting recommendations are explicitly analytical inferences.

Evidence root **E** is `node_modules/.cache/native-validation/browser-research/`. Preserve the four topic directories' original `REPORT.md`, numbered JSONL, ledgers and `round-two/` artifacts. They are ignored cache evidence, not a durable full-response archive. The local claim/integrity audit is `node_modules/.cache/native-validation/browser-research/synthesis-audit/REPORT.md`.

Round two used `native-semantic-reader-v1`: scripts, styles, graphics and MathML were omitted, and hidden-content semantics were ignored. Extractions are partial; flattened tables, missing equations, nonvisible text and truncated posts limit interpretation. HTTP 200, `extracted-unverified`, or a null barrier **does not verify meaningful content**. Response-body hashes identify pre-loader bodies but cannot reconstruct them: full original bodies were not archived. Source identity is attribution from the saved URL/text, not independent authentication. Mutable URLs are retrieval snapshots, not pinned revisions or guarantees of present availability.

### What changed between rounds

| Topic | Round one, unchanged historical result | Round two, manually inspected meaningful content |
| --- | --- | --- |
| Hardware | 20 attempts; six useful documents, including one search page; vendor specs unavailable | 16 attempts; 15 useful responses: four vendor specs, six model cards, two runtime guides, two configurations and one benchmark manual |
| Benchmarks | 20 attempts; seven primary READMEs, no paper bodies | 16 attempts; 13 useful pages: four paper bodies, three methodology/docs pages, six abstracts/version pages; nine distinct works/projects |
| Astra/X | 20 attempts; two useful search pages, zero direct posts | 11 attempts; nine actual post pages: four OpenAI-attributed statements and five non-official reactions |
| Poe/Reddit | 16 attempts; one useful search page, zero official explanatory pages or Reddit bodies | 14 attempts; five official Poe pages; still zero Reddit thread bodies or verified Reddit posting dates |

Totals: **76 round-one attempts; 57 round-two attempts** (16 + 16 + 11 + 14), including restricted failures and authorized retries. The parent's two restricted reader-smoke failures plus two authorized attempts are **separate**, not added to topic totals. Useful-response categories are deliberately not compared as one success-rate metric: a vendor card, paper body, abstract and social post provide different evidence. This is improved research access through a different reader profile, not retroactive repair of round-one failures or rendered-browser parity.

All source-ledger retrieval times below are **September 5, 2026 UTC**, specifically saved `primaryResponse.receivedAt`, not publication time or extraction completion. Posting/update dates are separately identified; where absent, they remain unknown.

## 1. Local LLM hardware: choose a workload, not a universal winner

**Vendor snapshots:** Apple's extracted page labels the systems **M5 Max/M5 Ultra**, not the generations named in round-one search queries. It lists 36 GB unified memory for Max, with 48/64/128 GB options on the specified 40-core-GPU configuration; Ultra starts at 96 GB, with 256 GB and a 512 GB option on the specified 80-core-GPU configuration [H1]. These are source-listed configurations, not verified stock, release dates or purchase offers. NVIDIA lists 32 GB GDDR7 for RTX 5090 [H2]. Spark's specification lists 128 GB unified memory and 273 GB/s bandwidth [H3]. AMD lists a **processor maximum** of 128 GB, 256-bit LPDDR5x and up to LPDDR5x-8000 for AI Max+ 395—not a particular installed/OEM configuration [H4]. Advertised bandwidth is not measured LLM speed.

**Capacity arithmetic, not measurements:** using decimal GB, ideal weight storage is `total parameters × bits / 8`. The cards give 8.2B for Qwen3-8B, 30.5B total/3.3B active for Qwen3-30B-A3B, and 72.7B for Qwen2.5-72B [H5–H7]. At uniform four-bit precision these imply **4.10, 15.25 and 36.35 GB**, respectively, before scales, mixed-precision tensors, cache, workspace and system use. MoE active parameters are not the whole resident weight budget. Quantization's actual size and quality must be checked on the selected artifact; no quality-neutral compression or speedup is assumed.

For one conventional full-attention sequence, two-byte K/V elements and no sharing/compression, `2 × layers × KV heads × head dimension × tokens × bytes per element` estimates cache bytes. The saved Qwen3-8B config has 36 layers, eight KV heads and head dimension 128: **4.5 GiB at 32,768 tokens**, or 18 GiB at 131,072 [H8]. This is theoretical allocation, not a measured working set or validated long-context run. Its config says `max_position_embeddings=40960`; the card separately describes 32,768 native context and 131,072 with YaRN, warning that static scaling can affect shorter contexts [H5]. Input, generated reasoning/output and concurrent sequences all consume the budget.

| Workload tier — analytical shortlist | Practical implication and unresolved requirement |
| --- | --- |
| Occasional small-model chat | Start with existing compatible hardware and a quantized 8B-class model at modest context. Even small weights do not make long context free; measure usable memory before buying. |
| Single-user coding/chat, roughly 30B low-bit | A 32 GB RTX 5090 or appropriately configured larger-memory Mac is a capacity candidate, not a speed/value winner. Require compatible backend, exact quantization and context/workspace margin. |
| 70B-class dense low-bit inference | The 72.7B example's ideal four-bit weights already exceed a single 32 GB card. Investigate higher-memory Macs, Spark or a verified AI Max OEM system; do not equate total system RAM with free accelerator memory. |
| Long documents, concurrent sessions, larger resident models | Prioritize cache and workspace headroom; Ultra's 256/512 GB options expand nominal capacity. Validate actual model/runtime support and latency; memory capacity alone does not size multimodal processing or training. |

**No measured comparative ranking, hardware prices, stock checks, tokens/second or energy-efficiency results were obtained.** Round one's dollar bands remain unpriced planning hypotheses, not a purchase recommendation. `llama-bench` distinguishes prompt processing, generation, context depth and repeats, and excludes tokenization/sampling from its timing [H9]. Its example results are historical, not measurements of these candidates. A future comparison should hold model/artifact, backend/build, quantization, cache type, context occupancy, offload and concurrency explicit, and measure end-to-end latency separately.

Hardware selection is biased toward vendor material and one model family; used GPUs, complete OEM systems and alternative runtimes are not comprehensively covered.

### Hardware source ledger

Paths in this table are relative to **E/local-llm-hardware/round-two/**. No source publication/update date was established except Spark's stated **August 25, 2026** update. Benchmark example timestamps are not the manual's publication date.

| ID | Exact source URL | Retrieved UTC | Raw record |
| --- | --- | --- | --- |
| H1 | `https://www.apple.com/mac-studio/specs/` | 02:44:42.753Z | `02-apple-escalated.jsonl:1` |
| H2 | `https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/` | 02:44:59.936Z | `03-vendor-specs.jsonl:1` |
| H3 | `https://docs.nvidia.com/dgx/dgx-spark/hardware.html` | 02:45:00.265Z | `03-vendor-specs.jsonl:2` |
| H4 | `https://www.amd.com/en/products/processors/laptop/ryzen/ai-300-series/amd-ryzen-ai-max-plus-395.html` | 02:45:00.385Z | `03-vendor-specs.jsonl:3` |
| H5 | `https://huggingface.co/Qwen/Qwen3-8B/raw/main/README.md` | 02:45:34.743Z | `04-model-cards.jsonl:1` |
| H6 | `https://huggingface.co/Qwen/Qwen3-30B-A3B/raw/main/README.md` | 02:45:34.799Z | `04-model-cards.jsonl:3` |
| H7 | `https://huggingface.co/Qwen/Qwen2.5-72B-Instruct/raw/main/README.md` | 02:45:57.451Z | `05-large-models-methodology.jsonl:1` |
| H8 | `https://huggingface.co/Qwen/Qwen3-8B/raw/main/config.json` | 02:46:40.558Z | `07-cache-configs.jsonl:1` |
| H9 | `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/llama-bench/README.md` | 02:45:57.569Z | `05-large-models-methodology.jsonl:3` |

## 2. Benchmarks: match the measurement to the claim

- **Contamination is not generalization.** LiveCodeBench's actual v2 paper describes dated contest windows and post-cutoff comparisons, with platform-dependent tests and generators for incomplete CodeForces tests [B1]. Those controls target contamination; they do not audit proprietary training corpora or establish workplace coding ability. Avoid treating the authors' contamination-free framing as an independently certified property.
- **Construct validity depends on scoring and information access.** SWE-bench's v3 paper uses repository issues/patches and tests, including fail-to-pass and pass-to-pass sets; BM25 retrieval and oracle files selected from the reference patch are different information conditions [B2]. BFCL V3 checks both end-of-turn state and required-call paths, with subset matching permitting additional calls and private attributes excluded [B5]. These are specific operational definitions, not interchangeable measures of general competence.
- **Saturation concerns discrimination, not AGI.** HLE's v11 body describes difficult expert questions, model screening, two-stage review and model-judged equivalent answer formats. It explicitly distinguishes closed-ended academic success from autonomous research [B3]. No September 5 saturation measurement or independent judge-reliability study was performed. Its retained forecast about exceeding a score by **the end of 2025** is historical text, even though its landing page states a July 28, 2026 revision; it is not evidence that the forecast came true.
- **Agent budgets and harnesses matter.** AI Agents That Matter compares simple retry/warming/escalation baselines with evaluated agents and reports repeated runs; its 2024 findings are not a verdict on all current architectures [B7]. The harness guide exposes generation repeats, majority-vote filtering, prompts/splits and optional decontamination, and asks for configuration plus code commit [B6]. A supported decontamination flag is not proof it was applied. Report sampling/tool/time budgets, failure handling, repeated-run uncertainty, token counts and dated cost assumptions before attributing gains to an agent design.
- **Hardware throughput is a different construct.** MLCommons' retrieved overview explicitly covers **MLPerf Inference v5.0**, with workload datasets, quality requirements and server latency constraints [B4]. It is not the complete latest submission/power rulebook or a current accelerator ranking. HELM's abstract supports a multi-metric framing beyond accuracy, but its paper-body extraction failed [B8]. SWE-agent was likewise abstract-only here; detailed interface ablations were not read [B9].

**Analytical reporting checklist:** pin dataset/version/split/time window and denominator; model plus agent/harness revision; retrieval/tool access and allowed test feedback; generation/retry/time budgets; judge/scoring; environment; exclusions/failures and uncertainty. Separate scientific comparisons from deployment costs and preserve token counts instead of presenting historical prices as current.

The four paper bodies are semantic text, **not complete rendered papers**. Missing MathML, figures and table relationships prevent reconstruction of omitted formulas/counts. Six abstract/version pages include companions to body reads, not six additional independent studies. Discovery favored known author/project URLs, so neither comprehensiveness nor independent consensus follows.

### Benchmark source ledger

Paths are relative to **E/benchmarks/round-two/**. Paper dates below were checked against saved abstract/version pages, not inferred from retrieval. B1's companion is `02-paper-entry-escalated.jsonl:1`; B2's is `03-core-papers.jsonl:3`; B3's is `04-full-methods.jsonl:3` (requested `https://lastexam.ai/paper`, final `https://arxiv.org/abs/2501.14249`); B7's is `06-harness-agents.jsonl:2`.

| ID | Exact source URL | Retrieved UTC | Raw record; source-stated version/date |
| --- | --- | --- | --- |
| B1 | `https://arxiv.org/html/2403.07974v2` | 02:45:21.848Z | `03-core-papers.jsonl:1`; v2, June 6, 2024 |
| B2 | `https://arxiv.org/html/2310.06770v3` | 02:45:53.461Z | `04-full-methods.jsonl:2`; v3, November 11, 2024 |
| B3 | `https://arxiv.org/html/2501.14249v11` | 02:46:17.742Z | `05-saturation-systems-tools.jsonl:1`; v11, July 28, 2026 |
| B4 | `https://docs.mlcommons.org/inference/` | 02:46:18.064Z | `05-saturation-systems-tools.jsonl:2`; v5.0 overview, update date unknown |
| B5 | `https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html` | 02:46:18.436Z | `05-saturation-systems-tools.jsonl:3`; released September 19, updated December 10, 2024 |
| B6 | `https://raw.githubusercontent.com/EleutherAI/lm-evaluation-harness/main/docs/task_guide.md` | 02:46:44.615Z | `06-harness-agents.jsonl:1`; update/commit date unknown |
| B7 | `https://arxiv.org/html/2407.01502v1` | 02:47:06.740Z | `07-agent-methods.jsonl:1`; v1, July 1, 2024 |
| B8 | `https://arxiv.org/abs/2211.09110` | 02:45:22.028Z | `03-core-papers.jsonl:2`; abstract only, v2 October 1, 2023 |
| B9 | `https://arxiv.org/abs/2405.15793` | 02:46:44.672Z | `06-harness-agents.jsonl:3`; abstract only, v3 November 11, 2024 |

## 3. Astra/X: direct statements and a small reaction sample

**What is now supported:** four directly extracted OpenAI-attributed principal posts, rather than round-one search snippets, use the public name GPT-6 Astra or discuss Astra [A1–A4]. Their statements must remain surface- and tier-specific:

- A1 says Astra powers GPT-6 Pro in Chat for Pro, Business and Enterprise users.
- A2 says Astra is available in ChatGPT Work and Codex for Pro, Enterprise and Business Premium users, plus the API, while Plus and Business rollout may take days. This is a published availability claim, **not verified account/API entitlement**; do not merge it with A1 into universal access.
- A3 introduces GPT-6 Astra and makes broad, promotional computer-use/speed claims. No attached video or benchmark replication was inspected. An embedded thread includes a truncated “Show more” passage; its unseen continuation is not evidence.
- A4's **August 7, 2026** statement describes treating Astra as OpenAI's first critical cybersecurity model and adding controls. It is not proof of an escape, an independently audited classification, or a continuing September 5 release pause.

**Five non-official principal posts** provide a narrow, mixed sample: Dylan asks about Plus access [A5]; Laks Dondeti asks about the Astra/Pro capability gap [A6]; Xeift jokes about Plus/Work naming [A7]; John Greg expresses excitement [A8]; Kai Morales makes a frontier-lab/breakout remark in the earlier cybersecurity thread [A9]. The joke/sarcasm readings are interpretation, not factual claims about renaming or model behavior. None supplies a reproducible hands-on benchmark. All were selected from replies around official posts, not a representative search sample; five accounts do not establish X consensus or sentiment proportions.

Four official posts are one publisher, not four independent authorities. Account attribution and displayed dates were read from permalink text, not independently authenticated. All nine pages also contain login prompts; partial extraction ignoring hidden-state semantics does not prove equivalent visibility for a logged-out rendered browser. Images, badges, videos and engagement counts were not used to validate claims.

The **official web announcement body remains unavailable**: the separate parent record for `https://openai.com/index/gpt-6-astra/`, received **02:43:20.402Z**, records HTTP 403 and a confirmed Cloudflare challenge (`E/reader-parent-escalated.jsonl:1`). No API identifier/specification, system card, production access or performance claim was independently verified. The challenged announcement and search were not bypassed or newly retried for this synthesis.

### X source ledger

Paths are relative to **E/astra-twitter/round-two/**. **Displayed post clocks have no timezone: they are not UTC.** Retrieval clocks are UTC. A3 was requested through `https://x.com/i/status/2095595741528125780` and resolved to the canonical URL listed; that is one response, not two sources.

| ID | Exact final source URL | Retrieved UTC | Displayed post timestamp, timezone unspecified | Raw record |
| --- | --- | --- | --- | --- |
| A1 | `https://x.com/OpenAI/status/2095998532692140283` | 02:44:51.327Z | 10:12 PM · Sep 4, 2026 | `02-x-escalated.jsonl:1` |
| A2 | `https://x.com/OpenAI/status/2095968413646737608` | 02:45:07.986Z | 8:13 PM · Sep 4, 2026 | `03-posts.jsonl:1` |
| A3 | `https://x.com/OpenAI/status/2095595741528125780` | 02:45:32.635Z | 7:32 PM · Sep 3, 2026 | `04-context-discovery.jsonl:1` |
| A4 | `https://x.com/OpenAI/status/2085801349866729975` | 02:45:33.372Z | 6:52 PM · Aug 7, 2026 | `04-context-discovery.jsonl:2` |
| A5 | `https://x.com/DylanMaster44/status/2096025060133794200` | 02:45:09.046Z | 11:58 PM · Sep 4, 2026 | `03-posts.jsonl:2` |
| A6 | `https://x.com/ldondeti/status/2095999129264828849` | 02:45:09.454Z | 10:15 PM · Sep 4, 2026 | `03-posts.jsonl:3` |
| A7 | `https://x.com/Xeift1/status/2096006208641773995` | 02:46:03.101Z | 10:43 PM · Sep 4, 2026 | `05-reactions.jsonl:1` |
| A8 | `https://x.com/JohnGregQuantum/status/2095969304432857095` | 02:46:03.442Z | 8:16 PM · Sep 4, 2026 | `05-reactions.jsonl:2` |
| A9 | `https://x.com/kaimorales_/status/2085806612443275317` | 02:46:03.916Z | 7:13 PM · Aug 7, 2026 | `05-reactions.jsonl:3` |

## 4. Poe/Reddit: official mechanics, still no Reddit consensus

Five actual official documents now support a platform-policy summary, **not user-satisfaction conclusions or independently tested enforcement**:

- **Aggregation and limits:** Terms of Service describes third-party-model bots/apps and limits expressed as messages, points or compute points [P1]. Terms of Sale says subscriptions provide periodic points, additional model access and longer context; bot costs can be inspected before messaging [P3]. These are published features, not proof of any specific model entitlement or superior value versus direct providers.
- **Rollover and purchases:** points do not roll over unless the plan specifically allows it. Additional points and optional threshold-based automatic purchases are described; pre-purchased points expire after one year [P3]. Do not retrofit these retrieval-date terms onto undated Reddit complaints.
- **An actual price snapshot, not inferred prices:** the public plan extraction lists **10 thousand points/day at $49.99/year** and **660 thousand points/month at $199.99/year**, with displayed monthly equivalents of $4.17 and $16.67 **billed annually** [P4]. These are two examples, not all plans or month-to-month quotes. The page specifies USD and regional tax/currency caveats. No checkout or billing-state interaction occurred; hidden-state semantics are omitted, so this is extracted official text, not a screenshot of a selected offer. Point periods and per-bot costs prevent deriving a universal cost per message.
- **Privacy depends on the interaction:** the Privacy Policy says chats/files reach relevant providers/developers and describes memory sharing [P2]. The Privacy Center distinguishes full-shield interactions (no provider training) from half-shield interactions that may reach developers/external resources and may be used for training; permissions can change the shield. It also says memory summaries may retain information after chat deletion unless separately deleted [P5]. These are Poe's descriptions, not a blanket confidentiality guarantee or an enforcement audit.

**Zero Reddit thread bodies and zero verified Reddit posting dates remain.** Round-two Yahoo snippets are unverified leads only; query years, search labels and account-looking excerpts do not establish authorship, posting date, current plan facts or consensus. No numerical satisfaction balance is justified. Five official pages are one publisher's perspective, not five independent user accounts.

Access diagnosis improved without changing history: Poe Help returned a confirmed HTTP-403 Cloudflare challenge; the attempted Reddit thread returned HTTP 403 with a network-security block; About/blog returned HTTP-200 login text, not their requested explanatory bodies. A Bing HTTP-200 loader failure is unknown content, not a proved challenge. These distinctions were checked in saved `02-initial-escalated.jsonl` and `03-public-pages.jsonl`; no login or bypass was attempted.

### Poe source ledger

Paths are relative to **E/poe-reddit/round-two/**. P1 was requested as `https://poe.com/tos`, P2 as `https://poe.com/privacy`; final URLs are listed. Update dates are document text, not verification of historical policy applicability.

| ID | Exact final source URL | Retrieved UTC | Raw record; source-stated update |
| --- | --- | --- | --- |
| P1 | `https://poe.com/pages/tos` | 02:46:00.287Z | `04-public-policy-discovery.jsonl:1`; March 19, 2026 |
| P2 | `https://poe.com/pages/privacy` | 02:46:00.355Z | `04-public-policy-discovery.jsonl:2`; April 30, 2026 |
| P3 | `https://poe.com/pages/terms-of-sale` | 02:46:41.333Z | `05-purchases-social-leads.jsonl:1`; March 19, 2026 |
| P4 | `https://poe.com/subscription_plans` | 02:46:41.627Z | `05-purchases-social-leads.jsonl:2`; date unknown |
| P5 | `https://poe.com/pages/privacy-center` | 02:47:08.480Z | `06-privacy-center.jsonl:1`; April 30, 2026 |

## Separate Reddit followup — 04:15 UTC

A later bounded native-only attempt selected one previously unvisited thread
from an ordinary link in the saved round-two research:
`https://www.reddit.com/r/PoeAI/comments/157caef/so_i_liked_poe_but_now/`.
This discovery title is not verified opinion content. A sandbox network failure
at 04:15:11 UTC was followed by one authorized navigation at 04:15:23 UTC, which
returned HTTP 403 and network-security denial text. Browsing stopped; no alternate
host, endpoint, login or challenge bypass was attempted.

The result remains **zero verified Reddit opinions or posting dates**. The
response arrived September 5, 2026 at 04:15:23.744 UTC, with 190,240 decoded bytes,
zero redirects and pre-loader body SHA-256
`dc131f91303300301ab1b23a7e3b0a084b9e325b318b2722d00fc637247b8b7a`.
The classifier reports possible access denial by an unspecified provider; this
is not evidence of a particular anti-bot vendor or a native parser defect.

These two invocations are separate from the 133 original topic attempts. Exact
commands, timestamps, artifact fingerprints, immutable JSONL/stderr and discovery
provenance remain in **E/reddit-poe-followup/REPORT.md** and its ledgers. The parent
independently verified all 23 saved checksum entries without rewriting evidence;
the log is `node_modules/.cache/native-validation/reddit-poe-followup-parent-integrity.log`.
No source content, posting date, representative sentiment or successful access
is inferred from a denial. Further Reddit attempts need materially changed,
explicitly authorized access conditions rather than repeated blocked requests.

## Remaining research and acceptance gates

- **Hardware:** exact artifact/working-set sizes, backend/OEM compatibility, matched-context repeated benchmarks, and complete-system US prices/availability. No universal best or price/performance ranking yet.
- **Benchmarks:** missing HELM/SWE-agent bodies, native math/figure fidelity, complete applicable MLPerf rules, independent contamination/validity studies, matched agent budgets and current saturation measurements.
- **Astra:** accessible primary announcement/specification/system-card bodies, independently checked account/API entitlement, reproducible evaluations and a broader dated hands-on sample. Do not bypass confirmed challenges.
- **Poe:** accessible Reddit bodies with actual post/comment dates and reply context across contrasting experiences; separately authorized account/billing/privacy checks if needed. Snippets cannot close this gate.

The saved research reports no real passwords, logins, solvers or private accounts used. This synthesis only reads local files and checks evidence consistency; it performs no live-site, model, socket, real TTY/PTY or SafeJS probe. Local audit success is **not** a native-test or live acceptance pass. No old report, source, manifest or `TASKS.md` is changed and no commit is made; the parent owns overall-browser gate tracking and any later commit.
