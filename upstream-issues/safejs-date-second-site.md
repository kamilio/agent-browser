# Additional real-site evidence for #543

September 2, 2026: after implementing browser-owned inline styles and live
attribute nodes/maps, both unmodified public jQuery scripts now stop at Date.

- Books to Scrape, jQuery 1.9.1: `+new Date` at source offset 35484. SHA-256:
  `c12f6098e641aaca96c60215800f18f5671039aecf812217fab3c0d152f6adb4`.
- Quotes to Scrape JavaScript page: `Date.now` at offset 3900. SHA-256:
  `f16ab224bb962910558715c82f58c10c3ed20f153ddfaa199029f141b5b0255c`.

Both return UNBOUND_IDENTIFIER for Date through the actual compiled public realm
API, not an injected browser shim. This reinforces that a Date.now-only binding
will not cover both: construction and date-to-number conversion are also needed,
within the clock/replay and resource boundaries already requested here.
Neither site is claimed to pass automatic JavaScript compatibility.
