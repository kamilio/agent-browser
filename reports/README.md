# Transport evidence — September 1, 2026

These files record **transport probes only**, not browser compatibility.
Checking a marker in downloaded HTML does not prove parsing, page JavaScript,
element actions, rendering, terminal browsing or playground operation.

- `network-sites-node-2026-09-01.json`: supported Node host; four read-only HTTPS
  probes with status/content checks, response hashes, body sizes and timings.
- `network-sites-bun-2026-09-01.json`: historical experiment, **not approval to
  use Bun networking**. These downloads succeeded before negative TLS tests
  exposed an unsafe validation order. The current adapter rejects Bun.
- `bun-tls-ordering-2026-09-01.json`: local negative TLS diagnostic. The required
  result is rejection before any HTTP request arrives. `passed: false` records
  a real incompatibility, not a skipped test or a production fallback.

RSS values in transport reports are process samples, not peak usage or an
estimate for a browser with page scripts/layout. HTTP response bodies and
credential-bearing headers are not retained. The JavaScript example records
only its initial HTML shell; no JavaScript was executed.
