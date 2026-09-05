# Benchmark methodology: native-browser followup

September 5, 2026, 04:13:27.340–04:15:28.423 UTC: eight native-reader attempts
visited seven new URLs. Six relevant extractions represent five works: four paper
bodies, one companion abstract and one other abstract/metadata page. A sandbox
pre-response failure received one authorized retry; an unrelated HTTP-200 page
was excluded. These are new retrievals, not model evaluations or additions to the
original rounds' historical counts in `BROWSER-RESEARCH-2026-09-05.md`.

## Findings and practical implications

**Contamination tests have assumptions and blind spots.** Oren et al. compare
canonical and shuffled ordering likelihoods under an exchangeability assumption,
requiring log-probability access rather than just a chat interface. Their
limitations acknowledge missing multiple-test correction and more complex
partial contamination their test cannot exclude [C]. The GSM1k authors use fresh,
human-written and checked questions to investigate transfer, but acknowledge
nonidentical question distributions and distinguish contamination from indirect
benchmark tuning [G]. A performance gap is not a count of leaked questions.

**Some advertised inference budgets exclude preparation.** Snell et al.'s
Appendix C estimates question difficulty using verifier scores over 2,048 samples
per question, then explicitly excludes that estimation cost from the analysis
[T]. This does not mean all verifier or inference work was excluded. The authors
also distinguish predicted difficulty from oracle information and explore
sequential versus parallel generation. Their comparison is not an all-in
deployment cost or latency measurement.

**Confidence intervals cannot make different protocols comparable.** Biderman
et al. show model-dependent changes under different prompting and continuation
scoring choices. Their sampling uncertainty does not cover all prompt, retraining
or temporal variation [U]. The Marie et al. abstract reports historical reporting
problems in 769 machine-translation papers from 2010–2020 [M]; it does not measure
their current prevalence across all LLM evaluations, and its full methods were
not retrieved in this round.

Practical checklist, explicitly an inference from these sources: report exact
model/data revisions, prompt and scoring code, selection and tuning procedures,
oracle information, verifier/search/difficulty-estimation costs, latency and
parallelism. Keep within-protocol uncertainty separate from sensitivity to changed
protocols. Record per-example outputs when permitted. Neither a negative
contamination test nor a narrow error bar independently establishes validity.

## Primary-source ledger

Receipt times are September 5, 2026 UTC; publication/version dates are separate.
No claim is made that these are the latest revisions.

| ID | Primary source and version | Receipt UTC | Exact source URL |
| --- | --- | --- | --- |
| C | Oren et al., *Proving Test Set Contamination in Black Box Language Models*, v2, November 24, 2023 | 04:14:24.823 | `https://arxiv.org/html/2310.17623v2` |
| T | Snell et al., *Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters*, v1, August 6, 2024 | 04:14:25.244 | `https://arxiv.org/html/2408.03314v1` |
| U | Biderman et al., *Lessons from the Trenches on Reproducible Evaluation of Language Models*, v1, May 23, 2024 | 04:14:33.634 | `https://arxiv.org/html/2405.14782v1` |
| G | Zhang et al., *A Careful Examination of Large Language Model Performance on Grade School Arithmetic*, v1, May 1, 2024 | 04:15:27.899 | `https://arxiv.org/html/2405.00332v1` |
| M | Marie et al., *Scientific Credibility of Machine Translation Research: A Meta-Evaluation of 769 Papers*, August 2021, abstract only | 04:15:28.394 | `https://aclanthology.org/2021.acl-long.566/` |

The companion C abstract at `https://arxiv.org/abs/2310.17623` is not another
study. Its audited-model count differs from text in the body, so no preferred
headline count is selected. G's end-2025 release promise is in the past; this
round does not verify whether release occurred. The incorrect seed
`https://arxiv.org/abs/2411.00676` resolved to unrelated HIVE4MAT material and
contributes no benchmark findings.

## Evidence and limits

Original JSONL/stderr, commands, times, pre-loader response-body hashes, source
excerpts and omission reports remain under
`node_modules/.cache/native-validation/browser-research/benchmarks/methodology-followup/`.
`ATTEMPTS.md`, `EXCERPTS.md`, `evidence-index.json` and `REPORT.md` identify every
claim and attempt. The parent independently checked all 31 saved SHA-256 entries;
its read-only verification log is
`node_modules/.cache/native-validation/benchmark-methodology-parent-integrity.log`.

Only the native `native-semantic-reader-v1` runner accessed these pages. No
SafeJS, alternate browser, website scripts, account, credential or challenge
solver was used. All HTTP-200 outputs remain machine-labeled
`extracted-unverified`; relevance required inspecting saved text. Reader omission
counts for MathML subtrees in C/T/U/G are 125/81/163/23. Missing equations, chart
values and table structure were not reconstructed. Original HTTP bodies are not
archived, so their hashes alone cannot recover them. This convenience sample
supports methodological cautions, not present contamination rates or a ranking.
