# Website test inventory — September 14, sixteenth update

Append-only update to the fifteenth and preceding inventories. **No new live
website or domain is tested.** Historical paths and results remain unchanged.

| Website/page | New check | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture; ordinary discovered-link click at 10:04:18 UTC on `be3aaf6` | Fails native document-width admission before pointer dispatch/destination request; 49 links found, selected `querySelectorAll()` link rediscovered |

All 19 original resources load, serving 270,288 bytes. No wire/scripts/new assets,
destination requests, fallback or retry. The destination is not captured and
must remain fail-closed. Current click diagnostics name 54 unsupported-property
occurrences rather than the earlier click's 78; both clicks remain failures.

The original verification failure (missing verifier import) is preserved. A
separate corrected verifier and independent parent check pass on the same failed
click observation, without rerunning the browser. Details and hashes are in
`MDN-CURRENT-CLICK-SEPTEMBER-14.md`. This is not a Cloudflare failure.

Next: implement genuine missing layout/text behavior, not target-only admission
or suppressed diagnostics. Existing Python two-page captured success, Wikipedia
geometry failure and earlier live checks retain their original runtimes/dates.
Original research, broader live sites/forms and separate provider/passkey/device,
SafeJS, socket/TTY and challenge acceptance remain open. Goal active; no push.
