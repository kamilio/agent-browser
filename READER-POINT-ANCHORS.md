# Passive definitions and reader point anchors

The native semantic reader retains `dfn` as a passive element, including its
escaped `id` and retained descendants. This fixes definition targets such as
CSSOM's `dom-element-getclientrects` and `dom-element-getboundingclientrect`.
Both default and long reader profiles use the same projection rule.

Other non-omitted elements whose tags are unwrapped retain their `id` as an
empty inert `span` at their opening position. Their content remains unwrapped;
the point anchor is not a wrapper and does not inherit active/custom-element
semantics. An unknown element's ID is not transferred to its first child.
Selecting that point anchor alone returns no descendant text. Use its retained
surrounding structure when reading context; it is not a full-fidelity DOM node.

Omitted script/style/control/template/foreign-content subtrees remain omitted,
including their IDs. Unsafe attributes stay excluded. Unknown elements still
count as unwrapped, while an ID actually retained is no longer counted as an
ignored attribute. Escaped output, source tokens/depth and final document nodes
remain bounded by existing limits; point anchors consume output and nodes.

Native fragment selection retains existing duplicate ordering, decoded-ID and
named-anchor behavior. This change does not establish scrolling, scripted
activation, hidden-content semantics or styled layout. No runtime is added.

## Focused verification

The full native loader finds both real CSSOM `dfn` nodes in the captured source;
the prior semantic reader finds neither on identical bytes. That comparison is
separate from algorithm extraction, and its initial text-field harness failure
remains recorded rather than rewritten as successful evidence.

There are 29 new anchor cases and nine independent caption-work cases. Against
unchanged production, these give 7 pass/31 fail: all 29 anchor cases and two
caption scaling cases fail. The first fixed run passes all new cases but finds
three old assertions expecting an unwrapped ID to disappear. Those assertions
now require a distinct empty point anchor, preserve child ownership, and still
reject an unrelated `name` target.

The final focused run passes 815 cases across 15 suites and 15 strict roots,
with zero failures or exclusions. Build, strict checking, formatting and source
stability pass. Evidence: `node_modules/.cache/native-validation/` under
`reader-anchor-work-september13/baseline01/`, `fixed00/` and `fixed01/`.
The initial `baseline00/` stops at formatting, before running any native cases.
See the thirteenth September 13 website inventory for broader validation and
separate captured-page follow-ups; fixture results alone prove neither.
