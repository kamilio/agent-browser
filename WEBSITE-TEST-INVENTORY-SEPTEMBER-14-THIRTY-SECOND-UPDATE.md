# Website inventory: September 14 thirty-second update

Four new public native-reader requests run21:27:12–21:27:13UTC on185415f with
compact tables, scripts/styles disabled and no mocked requests or HTTP redirects.
Three documents yield checked content, counting GitLab's explicitly partial
offline section recovery; Britannica remains restricted.

| Exact document URL | Result |
| --- | --- |
| `https://docs.docker.com/get-started/` | HTTP200;5,408 Markdown bytes;85ms. Getting-started content and tutorial links checked. |
| `https://docs.gitlab.com/ci/yaml/` | HTTP200;649,631 decoded bytes;480ms. Whole-output quota failure preserved. New offline outline finds175 headings, then actual returned selectors recover three useful sections without another request. |
| `https://discuss.python.org/` | HTTP200;6,550 Markdown bytes;307ms. Forum introduction and category navigation checked. This is not a thread-body or logged-in interaction claim. |
| `https://www.britannica.com/technology/artificial-intelligence` | HTTP403;30ms. Challenge classified before reader/navigation initialization; no article content, retry or bypass. |

The supervisor exits2 for mixed results, with no timeout or surviving process
group and empty private HOME/TMP. Original outcomes and `contentSuccess` fields
stay unchanged; semantic checks are separate evidence. Native content retrieval
does not establish visual, interactive, SafeJS, credential, performance-SLA or
research-completeness gates.

See `OUTPUT-LIMIT-HEADING-DISCOVERY.md` for the new offline path and retained
evidence locations. No historical report or earlier inventory total is rewritten.
