import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { snapshotDocument, renderSnapshot } from "../src/snapshot.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{width:48px;font-size:8px}#target{background-color:red}</style><main><span id="target">ab</span><!--marker--></main>',
	"https://fixture.invalid/character-data",
);
documentStyles(tree).setViewport(80, 40);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const queries = new DocumentQueries(tree);
const target = queries.querySelector("#target");
if (target === null) throw new Error("Missing fixture target");
const reference = tree.reference(target);
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
function capture() {
	return rasterizeDocument(tree, { element: reference }).image;
}
try {
	const initial = capture();
	await guest(
		"Native text data is a live CharacterData capability",
		'var target = document.getElementById("target"); var text = target.firstChild; return text.data === "ab" && text.length === 2 && text.nodeValue === text.data && text.textContent === text.data;',
	);
	await guest(
		"Actual guest edits mutate data and measured inline geometry",
		'text.appendData("cd"); text.insertData(1, "X"); text.deleteData(1, 1); text.replaceData(0, 1, "a"); return text.data === "abcd" && text.substringData(1, 2) === "bc" && target.getBoundingClientRect().width === 24;',
	);
	const edited = capture();
	check(
		"Edited text changes actual element capture width",
		initial.width === 12 &&
			edited.width === 24 &&
			edited.height === initial.height,
	);
	check(
		"Agent snapshots see the edited text",
		renderSnapshot(snapshotDocument(tree)).includes("abcd"),
	);
	await guest(
		"splitText returns the real adjacent node and stable identity",
		'var tail = text.splitText(2); return text.data === "ab" && tail.data === "cd" && tail === text.nextSibling && tail === target.childNodes[1] && tail.parentNode === target && text.wholeText === "abcd" && tail.wholeText === "abcd";',
	);
	const split = capture();
	check(
		"Splitting text preserves layout and every captured pixel",
		split.width === edited.width &&
			split.height === edited.height &&
			split.pixels.length === edited.pixels.length &&
			split.pixels.every((value, index) => value === edited.pixels[index]),
	);
	await guest(
		"normalize merges text without invalidating retained detached identities",
		'target.normalize(); return target.childNodes.length === 1 && target.firstChild === text && text.data === "abcd" && tail.data === "cd" && tail.parentNode === null && tail.wholeText === "cd";',
	);
	const normalized = capture();
	check(
		"Normalization preserves layout and every captured pixel",
		normalized.width === edited.width &&
			normalized.height === edited.height &&
			normalized.pixels.length === edited.pixels.length &&
			normalized.pixels.every((value, index) => value === edited.pixels[index]),
	);
	await guest(
		"Data null setter differs from method string conversion",
		'tail.data = null; var empty = tail.data === ""; tail.appendData(null); tail.insertData(0, undefined); return empty && tail.data === "undefinednull";',
	);
	await guest(
		"UTF-16 methods preserve surrogate code units",
		'var unicode = document.createTextNode("a😀b"); var half = unicode.substringData(2, 1); var other = unicode.splitText(2); return unicode.length === 2 && other.length === 2 && unicode.data.charCodeAt(1) === 55357 && half.charCodeAt(0) === 56832 && other.data.charCodeAt(0) === 56832;',
	);
	await guest(
		"Comment CharacterData remains separate from text-only APIs",
		'var comment = document.createComment("abc"); comment.replaceData(1, 1, "X"); return comment.data === "aXc" && comment.length === 3 && comment.splitText === undefined && comment.wholeText === undefined;',
	);
	await guest(
		"Out-of-range offsets surface IndexSizeError without mutation",
		'var previous = text.data; var errorName = ""; try { text.deleteData(99, 1); } catch (error) { errorName = error.name; } return errorName === "IndexSizeError" && text.data === previous;',
	);
	await guest(
		"Missing required arguments throw and unsigned-long conversion is applied",
		'var missing = false; try { text.substringData(0); } catch (error) { missing = error.name === "TypeError"; } return missing && text.substringData(4294967297, 2) === "bc" && text.substringData(0, -1) === "abcd";',
	);
	await guest(
		"Readonly lengths cannot overwrite native data",
		'try { text.length = 100; } catch (error) {} return text.length === 4 && text.data === "abcd";',
	);
	await page.close();
	tree.close();
	check(
		"Page/document close revokes DOM component owners",
		page.metrics().closed &&
			page.metrics().dom?.classLists.closed === true &&
			page.metrics().dom?.geometry.closed === true,
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
				fixture:
					"in-memory HTML through production PageScripts; no network or sockets",
				runtime:
					"explicit existing experimental SafeJS core, not released-SDK acceptance",
				passed,
				checks,
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
