import { documentGeometry } from "../src/document-geometry.js";
import { documentElementSizes } from "../src/element-sizes.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<!doctype html><style>main{width:50%;font-size:8px}#target{width:50%;height:10.25px;padding:2.5px}#wrap{width:18px}</style><main><div id="target">a</div><div id="wrap"><span id="inline">ab cd</span></div><div><span id="empty"><br><br></span></div></main>',
	"https://fixture.invalid/element-sizes",
);
documentStyles(tree).setViewport(400, 200);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const sizes = documentElementSizes(tree);
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
		"Real page code reads rounded block padding sizes",
		'var target = document.getElementById("target"); return target.clientWidth === 105 && target.offsetWidth === 105 && target.clientHeight === 15 && target.offsetHeight === 15 && target.clientTop === 0 && target.clientLeft === 0;',
	);
	await guest(
		"Inline client sizes differ from wrapped offset sizes",
		'var inline = document.getElementById("inline"); return inline.clientWidth === 0 && inline.clientHeight === 0 && inline.offsetWidth === 12 && inline.offsetHeight === 18;',
	);
	await guest(
		"Offset height includes zero-width fragments excluded by the bounding shortcut",
		'var empty = document.getElementById("empty"); return empty.offsetWidth === 0 && empty.offsetHeight === 28 && empty.getBoundingClientRect().height === 8;',
	);
	await guest(
		"Root client size reports the actual viewport",
		"return document.documentElement.clientWidth === 400 && document.documentElement.clientHeight === 200;",
	);
	const before = sizes.metrics();
	const rectangles = page.metrics().dom?.geometry.created;
	await guest(
		"Repeated scalar getters remain stable",
		"var total = 0; for (var index = 0; index < 256; index++) total += target.clientWidth + target.offsetWidth; return total === 53760;",
	);
	check(
		"Repeated getters do not allocate DOMRect capabilities or rescan fragments",
		page.metrics().dom?.geometry.created === rectangles &&
			sizes.metrics().measurements === before.measurements &&
			sizes.metrics().work === before.work,
	);
	await guest(
		"Readonly size writes cannot replace measured values",
		"try { target.clientWidth = 999; } catch (error) {} return target.clientWidth === 105;",
	);
	await guest(
		"Interpreted style mutation reflows the next size read",
		'target.style.width = "20px"; target.style.padding = "3px"; return target.clientWidth === 26 && target.offsetHeight === 16;',
	);
	documentStyles(tree).setViewport(640, 320);
	await guest(
		"Viewport revisions invalidate cached root sizes",
		"return document.documentElement.clientWidth === 640 && document.documentElement.clientHeight === 320;",
	);
	await guest(
		"Detached and reattached elements do not return stale cached sizes",
		"var parent = target.parentNode; target.remove(); var detached = target.offsetWidth === 0 && target.clientHeight === 0; parent.appendChild(target); return detached && target.offsetWidth === 26;",
	);
	await page.close();
	tree.close();
	check(
		"Owner close releases both size and rectangle caches",
		sizes.metrics().closed &&
			sizes.metrics().retained === 0 &&
			documentGeometry(tree).metrics().rectangles === 0,
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
					"in-memory HTML through production PageScripts/PageBindings; no network or sockets",
				runtime:
					"explicitly selected existing experimental SafeJS core; not released-SDK acceptance",
				passed,
				checks,
				sizes: sizes.metrics(),
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
