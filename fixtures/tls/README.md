# Local TLS test fixture

This is a deliberately public, self-signed certificate and private key for
`fixture.test`, generated on September 1, 2026 with a ten-year lifetime.
They authenticate nothing outside the local test suite. Never use this key for
a service, real account or production certificate.

The tests supply this certificate as an explicit test-only trust anchor. Default
transports do not trust it. Tests cover a valid local TLS handshake, original
hostname/SNI after address pinning, untrusted certificates, hostname mismatch,
and rejection of an HTTPS-to-HTTP redirect. Neither OS trust stores nor the
runtime's global TLS configuration are changed. Running the tests does not need
OpenSSL; it was used only to generate these fixture files.
