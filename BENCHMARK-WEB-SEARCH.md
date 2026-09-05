# Web-search benchmarks: what the BFCL category establishes

This native-browser follow-up reads the BFCL V4 “Agentic — Part 1: Web Search”
methodology linked from the earlier captured V3 article. The page states release
July 17, 2025 and update July 20, 2025. Retrieval on September 5, 2026 does not
establish that V4 is the latest version or independently verify publication history.
No benchmark or model comparison ran locally.

## Documented method

The described category has 100 human-crafted multihop questions, with manually
documented subanswers and multiple-expert checks. Recent-but-stable facts encourage
web retrieval without deliberately moving the answer. Models get DuckDuckGo search
and URL-fetch tools with several output representations; probabilistic simulated
HTTP/network failures exercise recovery. Grading compares the separated final
answer with ground truth after lowercasing and punctuation removal. This is one
web-search category, not the entire BFCL evaluation.

Source: `https://gorilla.cs.berkeley.edu/blogs/15_bfcl_v4_web_search.html`,
methodology/tool/curation/grading passages in the saved native extraction,
lines 320–418. These are author-described procedures, not reproduced results.

## Strengths and limits

The following are reasoned implications, not additional study findings:

- Shared tools and stable targets can improve comparability, but do not establish
  transfer to interactive browsers, authenticated sites or different search engines.
- Human checks and explicit answers make grading inspectable, but do not eliminate
  future memorization, stale pages or changed search rankings.
- Answer matching reduces grading ambiguity, but can reject acceptable aliases and
  does not independently validate explanations, citations or the reasoning path.
- Injected failures test recovery choices, not representative production outage
  distributions. The inspected passages do not establish the probability or
  identical random failures across model runs.
- Carefully curated questions support controlled measurement, not comprehensive
  coverage of ambiguous, open-ended research. Do not substitute a score here for
  reliability across the browser's actual workload and permission boundaries.

The benchmark's permitted retries are not permission for this research browser
to retry a denied source or evade a barrier. Its evaluation policy and our live
access policy remain separate.

## Native-browser evidence

Evidence root: `node_modules/.cache/native-validation/benchmark-web-search/`.
The run is under `live-20260905T220754072638637Z/`; the directory suffix is a
preparation label, not the request timestamp. Actual response receipt was
**September 5, 2026 at 22:08:48.453 UTC**. One separately authorized GET returned
HTTP 200, no redirects or retries, exit 0 and closed transport. The frozen native
reader used unchanged limits, without rebuilding or using another engine.

- Receipt: 142,747 bytes; SHA-256 `d218c1d965ce50316cca5b24ba03906220e63a8b2cfb30087976581f8a999294`.
- Transport-decoded body: 74,993 bytes; SHA-256 `c6967f17bd54a2151940384075abb2af2a3adfc26ddec9f7afae411519977c62`.
- Native Markdown: 36,906 bytes; SHA-256 `7c6bf42b49551ac2e0fdb66d0e11ce6e6f03a8000812a76c84271ebe7145af9b`.

`REPORT.md`, the original JSONL, exact extracted Markdown, commands, UTC/status
files and independent verification retain the source and limits. Capture bytes
were decoded only for integrity, not read as a raw HTML fallback. No linked pages,
omitted charts, current leaderboard, benchmark execution or source scripts were
inspected. Reports remain partial/extracted-unverified; hashes prove local
consistency, not correctness, completeness or representative production success.
Existing V3 evidence and stopped Reddit, Astra-announcement and X lanes are unchanged.
