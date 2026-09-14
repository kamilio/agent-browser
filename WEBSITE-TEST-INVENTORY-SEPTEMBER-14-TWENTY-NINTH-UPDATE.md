# Website inventory: September 14 twenty-ninth update

This append-only update adds one strict full-resource MDN visit and seven fresh
native-reader requests. Across this update, eight document URLs and six hosts
are attempted; this is not a new global unique-host total. Original capture
paths, timestamps, failures and earlier inventory measurements are unchanged.

| Exact document URL | Mode | Result |
| --- | --- | --- |
| `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector` | Full-resource native |26 HTTP200 resources; initial document commits; strict formatting-census gate stops before discovery/click. |
| `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll` | Native reader |HTTP200; useful API explanation, syntax and examples extracted. |
| `https://news.ycombinator.com/` | Native reader |HTTP200; stories and article/comment URLs extracted, despite unsupported interactive geometry in earlier tests. |
| `https://docs.python.org/3/library/asyncio.html` | Native reader |HTTP200; useful documentation and code extracted. |
| `https://docs.python.org/3/library/asyncio-runner.html` | Reader; discovered link |HTTP200; runner API content extracted from a link in the preceding Python result. |
| `https://nvartolomei.com/dist-sys-classics/` | Reader; discovered HN link |HTTP200; distributed-systems reading list extracted. |
| `https://en.wikipedia.org/wiki/Large_language_model` | Reader; explicit seed |HTTP200; whole-document output quota hit; three useful sections recovered offline from the same captured HTML. |
| `https://www.reddit.com/r/PoeAI/` | Reader; explicit seed |HTTP403 network-security access block; no content success, retry or bypass. |

Runtime: `5c7a882003df9a558397e4a8ece1220023baa83e`. Strict MDN runs at17:21 UTC;
reader batches at17:27 and17:29 UTC on September14,2026. Six reader documents
yield verified useful content, counting Wikipedia's explicitly partial offline
sections; Reddit does not. Semantic URL following is not a native click claim.

Full evidence, exact timings, byte counts, limitations, original MDN verifier
failure and separate Accept-default reconciliation are documented in
`CONTENT-FIRST-BROWSING-SEPTEMBER-14.md`. The original failed whole-page Wikipedia
and Reddit observations remain intact. Browser, research, SDK, credential,
passkey, interaction and performance gates are not conflated with content access.
