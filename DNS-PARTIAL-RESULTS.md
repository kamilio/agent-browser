# Partial DNS resolution results

The native Node transport resolves IPv4 A and IPv6 AAAA records concurrently.
Previously, a non-absence error from either query rejected the whole resolution,
even when the other query returned addresses. The default resolver now retains
all fulfilled address results before deciding whether resolution failed.

- If either family supplies addresses, every returned address still passes
  through the existing `NetworkPolicy.checkAddresses` validation before HTTP.
- A private, reserved or invalid address in any returned family still rejects
  the request under the default policy, even when another address is public.
- A results retain their order before AAAA results. The existing first-address
  selection is unchanged; no racing, alternate-address retry or extra query is
  introduced.
- When no address is available, a non-absence failure still reports
  `DNS resolution failed`. Only absent/empty results report
  `DNS returned no addresses`.
- Aborts, request deadlines, resolver cancellation/listener cleanup, DNS
  timeout/tries configuration, custom resolvers and HTTP/TLS policy are unchanged.

This is a partial-failure compatibility fix, not a DNS-latency optimization. The
resolver still waits for both family results. It does not race connections,
change browser identity, solve challenges or increase network limits.

`src/node-dns-partial-results.test.ts` uses mocked DNS and an explicitly refused
synthetic HTTP boundary. It proves address admission and rejection without any
real lookup, socket or HTTP response. See
`reports/dns-partial-results-2026-09-16.md` for baseline/final/negative controls.
No live website recovery or diagnosis of the earlier arXiv timeout is claimed.
