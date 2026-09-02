# Live attribute nodes and maps

September 2, 2026. The browser now owns persistent Attr records and live
NamedNodeMap-style capabilities. Attributes are not fabricated snapshots and the
browser does not import SafeJS internals. The generic named capability is described
separately in `SAFEJS-NAMED-HOST-OBJECTS.md` and requested upstream as #546.

## Behavior

- `element.attributes` preserves map identity. Indexed access, item(),
  getNamedItem(), and supported named property access share the same Attr object
  as element.getAttributeNode(). Numeric indices are enumerable; dynamic named
  aliases are not. Map iteration uses the existing indexed capability.
- Changing an attached Attr's value, nodeValue or textContent updates the actual
  document attribute. Ordinary setAttribute changes the same record. Removing an
  attribute detaches the record with its last value, and re-adding that name
  creates a different identity even when no script reads between those changes.
- document.createAttribute(), element.setAttributeNode/removeAttributeNode and
  map.setNamedItem/removeNamedItem create, attach, replace and detach exact owned
  identities. An attached attribute cannot be reused on a different element until
  detached. Cross-document capabilities are rejected. Replaced nodes remain
  independently readable and mutable.
- Attr supplies name/localName/nodeName, nodeType 2, value/nodeValue/textContent,
  ownerElement/ownerDocument, specified, null namespace/prefix and the supported
  leaf-node properties. It has no tree parent or children. Clone creates a new
  detached attribute; cloning an element does not reuse original attribute nodes.
- The map reserves interface member names and prototype capability names.
  Attributes called length or __proto__ remain accessible through getNamedItem
  without overriding a capability or granting host prototype access.
- Real attribute mutation invalidates existing document queries, style visibility
  and semantic snapshots. The owned-process fixture removes the exact hidden Attr
  in a native button handler and makes the previously hidden content readable.

## Ownership and limits

DocumentTree owns attribute identity independently of script adapters, so direct
document mutations cannot bypass detach/replacement semantics. Materialized Attr
records count toward the existing document node budget. Their retained names and
values count toward its text budget in addition to the element's attribute data;
this is intentionally conservative. Attached writes check both retained and
element storage changes before mutation. Removed records retain their allocation
until document close, like other detached nodes. Close releases records and maps.

The script adapter allows at most 256 live maps and 4096 Attr capabilities per
document. Each map permits at most 4096 indexed names and 65,536 aggregate key
code units. The SDK independently meters provider calls, keys and value reads.
Reading/materializing an attribute may therefore fail a resource limit; it is
not an unlimited inspection operation. ScriptDom close revokes saved capabilities.

## Deliberate gaps

This is the current HTML model, not full DOM Attr conformance. Namespace creation
and adoption are absent; the map's namespace queries match only the actual null
namespace and exact stored local name. Qualified names are ordinary stored names,
not fabricated namespace identities. Namespace-aware element APIs, complete
interface prototypes, DOMException classes and all Node methods remain incomplete.
Object-to-string coercion remains rejected. Generic named capabilities disallow
guest mutation of their virtual property surface rather than offering arbitrary
expandos. Integer-like attribute-name ordering still follows the existing
string-record document representation; it is not full DOM insertion-order parity.

The implementation follows the DOM Standard's NamedNodeMap/Attr separation, but
does not claim a web-platform test suite or native-browser differential pass for
the whole interface. The Chromium alternative was not used as this engine.

## Evidence

- Four document-record and seven script-map tests cover ownership, identities,
  mutation, detach/re-add, replacement, cloning, namespaces, resource atomicity,
  foreign references and close. The complete browser suite passes 1126 tests
  across 65 files. Strict package/new-test compilation and 151-file Biome pass.
- `reports/attributes-process-sites-2026-09-02.json` runs automatic scripts and
  real actions in permission-restricted owned processes using the rebuilt public
  SDK. Local fixture checks pass; public outcomes are recorded separately.
- `reports/attributes-process-sites-initial-2026-09-02.json` preserves the first
  Books navigation timeout. Repeated owned Books navigation also times out under
  unchanged limits: the final probe identifies the heartbeat deadline at 2009 ms.
  This must not be represented as successful navigation or
  dismissed as a transient based solely on a later diagnostic run.
- `reports/site-script-errors-attributes-2026-09-02.json` uses a separate bounded
  diagnostic process, not the permission-restricted actor. Books passes the old
  attribute-object failure and reaches `+new Date` at offset 35484; Quotes still
  reaches Date.now at offset 3900. Both have UNBOUND_IDENTIFIER for Date. The new
  evidence is added to upstream #543; neither site passes automatic compatibility.
- `reports/attributes-timers-2026-09-02.json` and
  `reports/attributes-cli-2026-09-02.json` pass 17 and 22 controlled regression
  checks respectively. Their public-document injected evaluations do not prove
  unmodified website JavaScript compatibility or visual playground acceptance.

The full browser goal remains active. Date, the owned-navigation timeout,
namespace/prototype completeness and the original feature ledger remain work.
`SAFEJS-RETENTION-PERFORMANCE.md` records the CPU profile and bounded public-core
reproduction of the accounting slowdown behind the watchdog failure.
