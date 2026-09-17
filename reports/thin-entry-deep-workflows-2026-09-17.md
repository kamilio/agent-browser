# Deep content from thin entry pages — September 17, 2026

Two fresh native requests follow literal same-origin article links found in
historical homepage captures reviewed as navigation-only. Both retrieve useful
source prose. The original homepage verdicts remain unchanged.

| Publisher | Response UTC, September 17 | HTML bytes | Markdown bytes | Eligible body paragraphs matched |
| --- | --- | ---: | ---: | ---: |
| EngineerFix | 04:46:38.402 | 152,036 | 7,291 | 19/19 |
| Biology Insights | 04:46:40.986 | 172,234 | 3,408 | 10/10 |

Exact source-linked targets:

```text
https://engineerfix.com/how-do-fuses-work/
https://biologyinsights.com/why-do-birds-chirp-before-a-storm/
```

Both return HTTP 200, complete captures, no output truncation and zero reported
tokenizer issues. All 29 selected `.entry-content` paragraphs over 80 normalized
characters match native Markdown; 26 are beyond the introductions. Comparison
normalizes entities, Markdown labels/escaping and whitespace. Short paragraphs,
lists, images, computed visibility and factual correctness are not fully audited.
EngineerFix retains an author biography outside the counted article body.

These are two new URLs, not two newly discovered working publishers: different
deep articles from both publishers were tested on September 16. No homepage is
revisited or rerated, and HTTP success is not a claim of full application support.

The live runtime corresponds to commit `372a5c8`, before the new 429 header fix.
Two exact-command offline proofs precede the two anonymous native GETs. There
are no retries, redirects, replacements, credentials, page scripts, alternate
clients or identity changes. All four proof/live child groups and observed live
connections close. Parent verifies the **64 sealed worker artifacts**, source/
compiled runtime pins, admission/input hashes and captured body/Markdown hashes.

Native results stay `extracted-unverified`, `contentSuccess: null`. No concrete
content-loss defect is found, no factual claims are endorsed, and no CAPTCHA or
reduced-blocking result is established. The historical 100-entry score remains
33 useful / 67 other rather than being updated from these different URLs.

Evidence: `reports/thin-entry-deep-workflows-2026-09-17.json` and private originals
in `node_modules/.cache/native-validation/thin-entry-deep-workflows-september17/`.
