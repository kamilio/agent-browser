# Website inventory: September 14 twentieth update

This append-only update adds one captured MDN observation, not a new live website
or domain. Earlier inventories, scope boundaries and failed results are unchanged.

| Website | Mode and UTC time | Verified result | Not verified |
| --- | --- | --- | --- |
| MDN querySelector documentation | Original captured corpus, September 14 at 12:13:35; native runtime b5d2efd | Same uncaptured background SVG stops navigation; actual post-close cleanup settles within the declared bound | Live access, completed initial navigation, query/click, destination, missing SVG pixels |

Exactly 19 captured responses / 270,288 decoded bytes are served once. The
20th adapter attempt is denied before transport. Zero wire requests, scripts,
queries, clicks, retries or additional response bytes. The browser stops at
`https://developer.mozilla.org/static/client/high.712917a113e51658.svg`.

The immediate snapshot retains 2,731 nodes, one pending loader and one queue
lease. All settle by the next metric sample, about 1.25 ms later, with one
document-close notification and a closed, empty image owner. Prepared and parent
observation verification pass; full-navigation acceptance remains false. This
does not retroactively pass the preceding immediate-cleanup observation.

See MDN-BACKGROUND-SETTLEMENT-SEPTEMBER-14.md for scope, exact metrics, hashes and
evidence paths. Native-gate rehashing is not another test-suite run. Original
research, other live testing candidates, providers/passkeys/devices, SafeJS,
socket/TTY and challenge handling remain separate open work. No new live-site
success or CAPTCHA bypass is claimed.
