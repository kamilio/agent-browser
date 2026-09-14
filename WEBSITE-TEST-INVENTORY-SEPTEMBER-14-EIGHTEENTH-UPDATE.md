# Website test inventory — September 14, eighteenth update

Append-only update to the seventeenth and preceding inventories. **No new live
website or domain is tested.** Historical outcomes and execution paths remain.

| Website/page | New check | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture; ordinary discovered-link click at 10:55:31 UTC on committed `e5f76b6` | Initial navigation and link discovery succeed; click still fails native width admission before destination request. Unsupported-property occurrences fall 54→51; other exception categories stay unchanged |

Nineteen original responses, 270,288 bytes, 49 discovered links and 50,087 query
work. Zero wire/scripts/new assets/destination requests, force, fallback or retry.
This is a captured native interaction check, not a fresh live validation or
successful click. No Cloudflare challenge is involved in this failure.

Prepared and independent verification pass with stable inputs and clean closure.
The 23,097-pass native gate is rehashed, not rerun. Exact scope and evidence:
`MDN-LETTER-SPACING-CLICK-REPLAY.md`. Next implementation work should add real
background image behavior, not merely permit its currently rejected syntax.

Original research, Wikipedia geometry, broader live interactions and separate
credential/passkey/device, SafeJS, socket/TTY and challenge gates remain open.
