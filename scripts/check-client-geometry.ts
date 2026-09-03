import { documentGeometry } from "../src/document-geometry.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { ScriptDom } from "../src/script-dom.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = await loadExtendedCore();
const tree = parseHtmlDocument(
	'<main style="width:18px;font-size:8px"><span id="target">ab cd</span><span id="empty"></span></main>',
	"https://fixture.invalid/geometry",
);
const dom = new ScriptDom(tree, core);
const realm = core.createRealm({
	bindings: { document: dom.document },
	maxEvaluations: 32,
	maxSourceLength: 16_384,
	sink: { log() {}, error() {} },
});
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string, setup?: string) {
	if (setup) await realm.evaluate(setup);
	check(label, (await realm.evaluate(source)).returnValue === true);
}
try {
	await guest(
		"Interpreted DOM reads native wrapped fragments",
		"saved.length === 2 && saved[0].width === 12 && saved[1].y === 11",
		'const target = document.getElementById("target"); const saved = target.getClientRects();',
	);
	await guest(
		"Indexed capabilities preserve item identity and out-of-bounds semantics",
		"saved.item(0) === saved[0] && saved.item(99) === null && saved[99] === undefined",
	);
	await guest(
		"Interpreted bounding rectangle unions real line fragments",
		"bounds.width === 12 && bounds.height === 18 && bounds.bottom === 19",
		"const bounds = target.getBoundingClientRect();",
	);
	await guest(
		"Guest rectangle writes change derived edges without changing native layout",
		"bounds.left === 15 && bounds.right === 20 && target.getBoundingClientRect().width === 12",
		"bounds.x = 20; bounds.width = -5;",
	);
	await guest(
		"toJSON exposes all eight numeric fields",
		"json.x === 20 && json.width === -5 && json.top === 1 && json.bottom === 19",
		"const json = bounds.toJSON();",
	);
	await guest(
		"Guest mutation reflows fresh geometry while saved lists stay snapshots",
		"target.getClientRects().length === 1 && target.getBoundingClientRect().width === 6 && saved.length === 2 && saved[0].width === 12",
		'target.textContent = "a";',
	);
	await guest(
		"Empty inline keeps a zero-width em-height rectangle",
		"empty.getClientRects().length === 1 && empty.getBoundingClientRect().width === 0 && empty.getBoundingClientRect().height === 8",
		'const empty = document.getElementById("empty");',
	);
	await guest(
		"Detached elements have no client rectangles",
		"detached.getClientRects().length === 0 && detached.getBoundingClientRect().height === 0",
		'const detached = document.createElement("div");',
	);
	await guest(
		"Visibility hidden retains layout; display none removes own geometry",
		"hiddenWidth === 6 && target.getClientRects().length === 0",
		'target.style.visibility = "hidden"; const hiddenWidth = target.getBoundingClientRect().width; target.style.display = "none";',
	);
	await guest(
		"Percentage block geometry follows the native viewport",
		"main.getBoundingClientRect().width === 640",
		'const main = document.querySelector("main"); main.style.width = "50%";',
	);
	documentStyles(tree).setViewport(100, 100);
	await guest(
		"Native viewport changes invalidate guest geometry cache",
		"main.getBoundingClientRect().width === 50",
	);
	const before = documentGeometry(tree).metrics().builds;
	await guest(
		"Repeated interpreted reads reuse one native layout snapshot",
		"sum === 5000",
		"let sum = 0; for (let index = 0; index < 100; index++) sum += main.getBoundingClientRect().width;",
	);
	check(
		"One build per revision, not per rectangle read",
		documentGeometry(tree).metrics().builds === before,
	);
	passed = true;
} finally {
	await realm.close();
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				fixture: "in-memory HTML; no websites, sockets, or browser engines",
				runtime:
					"existing explicitly selected experimental SafeJS core, not released-SDK acceptance",
				checks,
				passed,
				geometry: documentGeometry(tree).metrics(),
				script: dom.metrics().geometry,
			},
			null,
			2,
		),
	);
}
