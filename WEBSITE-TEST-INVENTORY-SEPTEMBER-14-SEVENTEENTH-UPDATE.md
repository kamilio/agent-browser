# Website test inventory — September 14, seventeenth update

Append-only update; earlier sites, paths and outcomes remain historical.
This update adds a fresh live page check on the already-tested W3C domain.

| Website/page | New check | Result and boundary |
| --- | --- | --- |
| W3C CSS Text 3 | One anonymous native GET at 10:23:36 UTC on `be3aaf6`, then one offline native section extraction | HTTP 200; heading outline and section 7.2 extracted. Original offline harness fails a metadata assertion after extraction; independent artifact verification passes without rerunning the browser |

540,326 decoded bytes; one live request, zero redirects/retries/subresources,
scripts or credentials. No external browser or HTML parser substitutes. This is
semantic reader coverage, **not** correct CSS rendering or successful interaction.
The native receipt retains its partial/extracted-unverified status.

Source findings inform real letter-spacing implementation, including a newly
discovered computed-zero/CSSOM-normal distinction. See
`W3C-TEXT-SPACING-RESEARCH-SEPTEMBER-14.md` for scope, exact provenance and the
preserved harness failure. MDN ordinary clicking remains blocked as recorded
in the sixteenth update; this source check does not change that outcome.

Original four-topic research, broader live sites/forms and separate provider/
passkey/device, SafeJS, socket/TTY and challenge acceptance remain open.
