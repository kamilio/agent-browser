# Website test inventory — September 13–14, forty-third update

**Adds one native standards-page read and one unchanged captured Python replay,
not a newly completed live website flow.** Earlier coverage remains in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FORTY-SECOND-UPDATE.md` and its predecessors.
Paths retain the September 13 preparation date; execution dates are explicit.

| Site/scope | New observation | Still not established |
| --- | --- | --- |
| `www.w3.org/TR/css-text-3/` | One native HTTP 200 GET, September 13 at 23:42:24.402 UTC; bounded native source extraction | Full rule coverage, latest-edition verification or rendered conformance |
| `docs.python.org/3/`, original eight-resource replay | September 14 at 00:04:34 UTC; CSS value issues 1→0, total formatting issues 27→26 | Successful Tutorial click, full-page geometry/paint or fresh live flow |
| Native justification regressions | 34 new cases; 569 focused passes; full gate 21,551/0/2 retained skips | General script shaping, all hanging/tab cases, performance or whole-browser acceptance |

The Python replay makes **zero new HTTP requests**, preserves the 72,064-byte
mixed September 11/13 fixture set, and attempts the original discovered click.
Four property occurrences, sticky positioning and overflow still prevent that
click. Unrelated float/display/clear diagnostics remain unchanged. Wikipedia
and kernel.org are **not rerun** in this update; their earlier measurements and
incomplete flows remain as recorded.

This cycle's only new network request is the bounded W3C source GET. No
credential/provider/device, passkey, SafeJS, real-TTY, broad socket or CAPTCHA
acceptance is established. No hardware/benchmark/Astra/Reddit-Poe research topic
is newly marked complete.

Details: `TEXT-JUSTIFICATION.md` and
`TEXT-JUSTIFICATION-WEBSITE-SEPTEMBER-13.md`. Next targets are remaining
hyphenation, sticky/overflow behavior and original-resource live flows, with
performance measured separately. Overall goal **ACTIVE**; local commits only.
