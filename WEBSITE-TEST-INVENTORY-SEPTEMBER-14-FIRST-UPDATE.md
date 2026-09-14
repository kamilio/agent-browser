# Website test inventory — September 14, first update

**Adds one unchanged captured Python replay and one offline standards read;
no fresh live website request occurs in this update.** Earlier coverage and
remaining failures retain their original paths in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FORTY-THIRD-UPDATE.md` and its predecessors.

| Site/scope | New evidence | Still not established |
| --- | --- | --- |
| `docs.python.org/3/`, original eight-resource replay | 00:27:41 UTC: property issues 4→0; raw formatting issues 26→22; original discovered Tutorial click attempted | Successful click or full-page geometry/paint; sticky-position and overflow guards remain |
| Captured `www.w3.org/TR/css-text-3/` | 00:16:13 UTC: one native offline parse; full hyphenation section retained; no HTTP | Latest-edition check, language-complete typography or automatic dictionary support |
| Native discretionary hyphenation | 39 new cases; 721 focused passes; selected native gate 21,590 passed/0 failed/2 unchanged skips | Complete line breaking/shaping, performance or whole-browser acceptance |

Python serves exactly 72,064 unchanged decoded bytes from mixed September 11/13
captures. Both observations use the native engine; **zero new HTTP requests**
occur. Wikipedia and kernel.org are not rerun here. Their earlier results do
not become new validations through this update.

The full gate selects 421 files and 420 strict roots from 775 manifest entries;
354 files remain unselected. Separate credential/device/passkey, SafeJS, socket,
real-TTY, CAPTCHA and research acceptance gates remain open.

Details: `TEXT-HYPHENATION.md` and
`TEXT-HYPHENATION-WEBSITE-SEPTEMBER-14.md`. Next targets: sticky-position and
overflow integration, original-resource live flows, and separate repeatable
performance checks. Goal **ACTIVE**; local commits only, pre-existing work kept.
