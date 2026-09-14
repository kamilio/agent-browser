# Website test inventory — September 14, second update

**Adds one unchanged captured Python replay and one native standards GET plus
offline source parse.** It does not add successful Python navigation or fresh
live Python coverage. Earlier results retain their original paths in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-FIRST-UPDATE.md` and its predecessors.

| Site/scope | New evidence | Still not established |
| --- | --- | --- |
| `docs.python.org/3/`, original eight-resource replay | 01:18:52 UTC: sticky-position issue 1→0; raw issues 22→21; original discovered Tutorial click attempted | Successful click, whole-page geometry or paint; nested overflow remains the sole width-resolution blocker |
| `www.w3.org/TR/css-position-3/`, native source read | 00:36:30 UTC: one GET, HTTP 200; one live DOM plus one offline parse; complete sticky sections retained | Latest-edition assertion, live sticky rendering, full CSS conformance |
| Native root-scrollport sticky | 56 new cases; 1,003 focused passes; selected native gate 21,706 passed/0 failed/2 unchanged skips | Nested overflow, multiline/table sticky, complete website flows, performance or whole-browser acceptance |
| Supplemental pre-feature scroll-core | 25 passed/3 failed; the same three failures appear in the feature supplement | A passing supplemental suite; it remains unselected from the successful gate |

The Python replay serves exactly 72,064 unchanged decoded bytes from mixed
September 11/13 captures, with **zero HTTP requests**. The separate standards
read adds **one HTTP GET**; its returned edition is Working Draft, 7 October 2025.
These are distinct observations, not new broad website coverage. Wikipedia,
kernel.org and the other previously listed sites are not rerun here.

The full gate selects 424 files and 423 strict roots from 776 manifest entries;
352 files remain unselected. Historical failed rounds, pre-existing failures,
and unrelated uncommitted work remain preserved. Local feature commit: `7ec49ac`.
Nothing is pushed in this cycle.

Details: `STICKY-POSITIONING.md` and `STICKY-WEBSITE-SEPTEMBER-14.md`. Next targets
are real nested overflow/scroll integration, original-resource website flows and
repeatable performance. Credential/device/passkey, SafeJS, socket, real-TTY,
CAPTCHA and unfinished research acceptance gates remain open. Goal **ACTIVE**.
