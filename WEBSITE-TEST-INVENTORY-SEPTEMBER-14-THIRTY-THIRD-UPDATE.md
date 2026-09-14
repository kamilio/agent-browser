# Website inventory: September 14 thirty-third update

This update records three real native form attempts and three discovered-link
reader requests on `0dc3c27`. It covers six distinct document URLs, not 28 websites:
there are eight document GETs, including repeated initial form loads, and twenty
CSS/image GETs. All 28 real responses are HTTP 200, with no redirects or mocks.

| Exact document URL | Result |
| --- | --- |
| `https://lobste.rs/search` | Full native form loaded in three separate attempts. Fill/Enter works; label pointer click fails at unsupported layout; explicit Space on the radio works. Scripts off; CSS and logo fetched normally. |
| `https://lobste.rs/search?q=local+llm&what=comments&order=newest` | Actual native Enter submission, not an assembled URL. 28,949 Markdown bytes of comment results; query, result marker and story/permalink content checked. |
| `https://lobste.rs/search?q=local+llm&what=stories&order=newest` | Actual native Space/fill/Enter submission. 11,560 Markdown bytes; checked radio state, serialized values, result marker and follow-up links. |
| `https://eiln.github.io/posts/ane.html` | Discovered story link; native reader yields 52,954 Markdown bytes in 91ms. Neural Engine article body, task-descriptor code and DRAM-throughput section checked. |
| `https://www.xda-developers.com/raspberry-pi-boots-straight-into-local-llm/` | Discovered story link; native reader yields 29,260 Markdown bytes in 221ms. NightRun explanation and small-model discussion checked, not merely navigation/title text. |
| `https://lobste.rs/s/k99ryf/it_breaks_village_bevy_s_6th_birthday` | Discovered discussion link; native reader yields 28,400 Markdown bytes in 91ms. Actual comment text, comment permalinks and removed-comment marker checked. No posting or voting. |

The form attempts run at 22:03:09, 22:06:59 and 22:12:58 UTC respectively; the
reader batch runs 22:14:39–22:14:40 UTC on September 14, 2026. Reader timings are
individual CLI observations, not a benchmark or performance guarantee. Match and
comment counts on pages do not establish complete pagination coverage.

The failed pointer flow is exit 1 with no submission; both keyboard workflows and
the reader batch exit 0. All supervisors finish without timeout or surviving
child/process group, with empty private HOME/TMP and no stderr. The form flows
accept no cookies and release all document nodes. Reader captures remain
`extracted-unverified` with their original `contentSuccess: null`; separate
marker/hash verification establishes the stated content checks without rewriting
original evidence. All extraction profiles remain explicitly partial.

`NATIVE-CONTENT-SEARCH.md` gives the working operation sequence, regression
coverage, resource-reuse follow-up and evidence locations. Research completeness,
visual/pointer compatibility, scripts/SafeJS, credentials/passkeys and broader
website coverage remain open. No older inventory path, measurement or total is
rewritten, and no access restriction is bypassed.
