# Website test inventory — September 14, ninth update

**Adds one captured MDN diagnostic, not a new live website or domain.** The native
browser consumes the same original 19 responses/270,288 decoded bytes on the
new CSS diagnostic runtime `ea13cf6`. The single observation completes at
06:54:58.360–06:54:58.763 UTC, with zero wire requests, scripts or interaction.

One cached diagnostic read returns 128 rejection samples and explicitly reports
51 omitted instrumented occurrences. Of the retained samples, 53 have matched
selectors and active media; others are unmatched, inactive or uncertain. The
samples now identify concrete rejected properties/values, including five matched
prefixed text-decoration occurrences and `font:inherit`, plus masks, transforms,
logical spacing and unsupported units. These are not distinct bug counts or an
exhaustive list. See `MDN-CSS-DIAGNOSTIC-REPLAY.md` for details and evidence.

The new verifier and independent parent check pass. Formatting, raw/applicable
count maps and charged work remain unchanged from the previous captured replay;
no guard is weakened. The original failed MDN click is still not retested and
its destination remains uncaptured. No layout-width, geometry or raster check
is included. All historical paths and measurements are preserved.

Next: implement the identified compatibility behavior, verify it natively and
then recheck captured actions and broader public websites/forms. Research,
fresh live access, credentials/devices, SafeJS, socket, real TTY and challenge
gates remain open. Overall browser work remains **ACTIVE**. No push.
