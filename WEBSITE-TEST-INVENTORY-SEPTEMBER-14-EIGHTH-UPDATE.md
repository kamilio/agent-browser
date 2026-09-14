# Website test inventory — September 14, eighth update

**One new captured MDN diagnostic; no new live website or domain.** The standalone
native browser runs the original September 11 MDN querySelector-page capture on
committed generated-item runtime `97a98e1`, rather than the older ownership build.

The single navigation/default-formatting/hint-query check completes on September
14 at 06:23:50.942–06:23:51.344 UTC. All 19 resources/270,288 decoded bytes are
served once, with zero wire requests or denials. No click, width resolution,
geometry, rasterization, scripts or destination navigation occurs.

The complete raw issue map no longer reports the previous 29 generated-item
and six overlapping alignment occurrences. Counts change from 13 categories/
255 occurrences to 10/220; all remaining category counts are unchanged. The
2,054 formatting boxes, including seven outside markers, and all text units are
retained. This is real native formatting progress, not a full-page action pass
or a count of 35 independent bugs fixed.

The new verifier and independent parent check pass. The old failed verifier and
historical measurements remain untouched. Bounded sampling is still incomplete:
36 generated and 530 ordinary-inline candidates are unexamined. See
`MDN-GENERATED-ITEMS-REPLAY.md` for the complete diagnostic map and evidence.

The earlier MDN click remains failed evidence until separately retested, and its
destination is still uncaptured. Next: obtain actionable native CSS rejection
details, implement the next real compatibility behavior, then recheck actions
and broaden public website/form coverage. Original research, fresh live access,
credentials/devices, SafeJS, socket, real TTY and challenge gates remain open.
Overall browser goal stays **ACTIVE**. Nothing pushed.
