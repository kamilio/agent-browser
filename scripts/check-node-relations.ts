import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<main id="root" title="list"><ul id="items"><li data-key="first">Alpha</li><li data-key="second">Beta</li></ul><button id="action">Reconcile</button></main>',
	"https://fixture.invalid/node-relations",
);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await guest(
		"Document, element and text capabilities share live containment",
		'var root = document.getElementById("root"); var list = document.getElementById("items"); var first = list.firstChild; var second = list.lastChild; return document.contains(first) && root.contains(first.firstChild) && !first.contains(root) && first.contains(first) && !first.contains(null) && !first.contains(undefined);',
	);
	await guest(
		"Position constants and ancestor/sibling masks survive the actual bridge",
		"return first.DOCUMENT_POSITION_FOLLOWING === 4 && first.DOCUMENT_POSITION_CONTAINED_BY === 16 && list.compareDocumentPosition(first) === 20 && first.compareDocumentPosition(list) === 10 && first.compareDocumentPosition(second) === 4 && second.compareDocumentPosition(first) === 2;",
	);
	await guest(
		"Cloning preserves structure without sharing node identity",
		"var copy = first.cloneNode(true); return copy.isEqualNode(first) && !copy.isSameNode(first) && first.isSameNode(list.firstChild) && first.compareDocumentPosition(list.firstChild) === 0 && !copy.isEqualNode(first.firstChild);",
	);
	await guest(
		"Disconnected comparisons are stable and antisymmetric",
		"var forward = copy.compareDocumentPosition(first); var reverse = first.compareDocumentPosition(copy); return (forward === 35 && reverse === 37 || forward === 37 && reverse === 35) && copy.compareDocumentPosition(first) === forward;",
	);
	await guest(
		"Attribute comparisons retain special order without child containment",
		'var rootId = root.getAttributeNode("id"); var title = root.getAttributeNode("title"); return rootId.compareDocumentPosition(title) === 36 && title.compareDocumentPosition(rootId) === 34 && root.compareDocumentPosition(title) === 20 && title.compareDocumentPosition(root) === 10 && !root.contains(title) && title.contains(title) && title.isSameNode(root.getAttributeNode("title"));',
	);
	await guest(
		"Attribute clones compare by name/value, not owner",
		"var titleCopy = title.cloneNode(); return titleCopy.isEqualNode(title) && !titleCopy.isSameNode(title) && titleCopy.getRootNode() === titleCopy && !titleCopy.contains(root);",
	);
	await guest(
		"Removed attributes become disconnected and can be reattached",
		'root.removeAttribute("title"); var detached = (root.compareDocumentPosition(title) & 33) === 33; first.setAttributeNode(title); return detached && first.compareDocumentPosition(title) === 20 && title.compareDocumentPosition(first) === 10 && title.ownerElement === first;',
	);
	await guest(
		"Fragments have independent roots until their children move",
		"var fragment = document.createDocumentFragment(); fragment.appendChild(copy); var contained = fragment.contains(copy) && copy.compareDocumentPosition(fragment) === 10; list.appendChild(fragment); return contained && fragment.childNodes.length === 0 && !fragment.contains(copy) && list.contains(copy) && (fragment.compareDocumentPosition(copy) & 33) === 33;",
	);
	await guest(
		"Comment and text equality observe kind and UTF-16 content",
		'var text = document.createTextNode("a😀b"); var comment = document.createComment("a😀b"); return !text.isEqualNode(comment) && text.isEqualNode(document.createTextNode("a😀b")) && !text.isEqualNode(document.createTextNode("a😀c")) && comment.isEqualNode(comment.cloneNode());',
	);
	await guest(
		"Invalid operands fail rather than acting like detached nodes",
		'var errors = 0; try { root.contains({nodeType: 1}); } catch(error) { if(error.name === "TypeError") errors++; } try { root.compareDocumentPosition(null); } catch(error) { if(error.name === "TypeError") errors++; } try { root.isEqualNode(); } catch(error) { if(error.name === "TypeError") errors++; } return errors === 3;',
	);
	await guest(
		"Guest keyed reconciliation uses containment, order and structural equality",
		'if (list.contains(copy) && !copy.isSameNode(first)) list.removeChild(copy); if (first.compareDocumentPosition(second) & first.DOCUMENT_POSITION_FOLLOWING) list.insertBefore(second, first); var desired = first.cloneNode(true); desired.firstChild.data = "Alpha updated"; if (!first.isEqualNode(desired)) list.replaceChild(desired, first); return list.firstChild === second && list.lastChild === desired && !list.contains(first) && first.parentNode === null && desired.isEqualNode(desired.cloneNode(true));',
	);
	const queries = new DocumentQueries(tree);
	const listId = queries.querySelector("#items");
	if (listId === null) throw new Error("Missing list");
	const children = tree.get(listId).children;
	check(
		"Native document records the guest reconciliation order and content",
		children.length === 2 &&
			tree.textContent(children[0]) === "Beta" &&
			tree.textContent(children[1]) === "Alpha updated",
	);
	const snapshot = renderSnapshot(snapshotDocument(tree));
	check(
		"Agent semantic snapshot sees the reconciled tree",
		snapshot.indexOf("Beta") < snapshot.indexOf("Alpha updated") &&
			snapshot.includes("Alpha updated"),
	);
	queries.close();
	await page.close();
	tree.close();
	check(
		"Actual runtime and document owners close",
		page.metrics().closed === true &&
			page.metrics().dom?.classLists.closed === true,
	);
	passed = true;
} finally {
	await page.close();
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				fixture:
					"production PageScripts over in-memory HTML; no network or sockets",
				limitations:
					"HTML/null-namespace node profile only; no Node constructor/prototype graph, shadow trees, full WPT run, framework or real-site acceptance",
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
