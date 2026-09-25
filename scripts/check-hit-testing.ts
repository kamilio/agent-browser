import { documentHitTesting } from "../src/hit-testing.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
if (
	process.argv.length > 3 ||
	(process.argv[2] !== undefined && process.argv[2] !== "--functional")
)
	throw new Error(
		"Only --functional is supported; the default includes the 256-query stress gate",
	);
const stress = process.argv[2] !== "--functional";
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<!doctype html><style>html,body{margin:0;padding:0}main{width:100%;font-size:8px;line-height:12px}#first,#last{width:50%;height:20px}#last{margin-top:-20px;background:blue}</style><main><div id="first">A</div><div id="last"></div></main>',
	"https://fixture.invalid/hit-testing",
);
documentStyles(tree).setViewport(100, 80);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const hits = documentHitTesting(tree);
const checks: {
	label: string;
	passed: boolean;
	elapsedMs?: number;
	errorCode?: string;
}[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const start = performance.now();
	const result = await page.evaluate(source).catch((error: unknown) => {
		checks.push({
			label,
			passed: false,
			elapsedMs: performance.now() - start,
			errorCode:
				error instanceof Error && "code" in error
					? String(error.code)
					: "unknown",
		});
		throw error;
	});
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
	checks[checks.length - 1].elapsedMs = performance.now() - start;
}
try {
	await guest(
		"Actual guest receives the native element identity in paint order",
		'var first = document.getElementById("first"); var last = document.getElementById("last"); return document.elementFromPoint(1, 3) === first && document.elementFromPoint(20, 3) === last;',
	);
	await guest(
		"Elements sequence is a static guest array ordered from topmost to root",
		"var sequence = document.elementsFromPoint(20, 3); return Array.isArray(sequence) && sequence.length === 5 && sequence[0] === last && sequence[1] === first && sequence[4] === document.documentElement;",
	);
	await guest(
		"Mutating the returned array does not corrupt native hits",
		"sequence.pop(); sequence[0] = null; return document.elementsFromPoint(20, 3).length === 5 && document.elementFromPoint(20, 3) === last;",
	);
	await guest(
		"Finite primitive conversion and viewport boundary behavior are observable",
		'return document.elementFromPoint("20", "3") === last && document.elementFromPoint(-1, 0) === null && document.elementsFromPoint(101, 0).length === 0 && document.elementFromPoint(100, 80) === document.documentElement;',
	);
	await guest(
		"Invalid numeric and missing arguments are rejected",
		"var caught = 0; try { document.elementFromPoint(NaN, 0); } catch(error) { caught++; } try { document.elementsFromPoint(1); } catch(error) { caught++; } return caught === 2;",
	);
	const before = hits.metrics();
	if (stress)
		await guest(
			"256 repeated guest hits preserve identity within the unchanged default deadline",
			"for (var index = 0; index < 256; index++) if (document.elementFromPoint(20, 3) !== last) return false; return true;",
		);
	else
		await guest(
			"A repeated query preserves identity",
			"return document.elementFromPoint(20, 3) === last;",
		);
	check(
		"Repeated queries reuse the region build",
		hits.metrics().builds === before.builds,
	);
	await guest(
		"Guest style mutation invalidates hit regions",
		'last.style.display = "none"; return document.elementFromPoint(20, 3) === first;',
	);
	await guest(
		"Restored display rebuilds native hits",
		'last.style.display = "block"; return document.elementFromPoint(20, 3) === last;',
	);
	documentStyles(tree).setViewport(50, 80);
	await guest(
		"Viewport resize changes percent-width hit regions",
		'return document.elementFromPoint(30, 3) === document.querySelector("main") && document.elementFromPoint(20, 3) === last;',
	);
	await guest(
		"Detach invalidates regions without forging the removed element",
		"last.remove(); return document.elementFromPoint(20, 3) === first;",
	);
	await guest(
		"Previously returned arrays remain snapshots",
		"return sequence.length === 4 && sequence[0] === null && sequence[1] === first;",
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
				profile: stress
					? "functional-and-256-query-stress"
					: "functional-only-no-stress-acceptance",
				checks,
				hitTesting: hits.metrics(),
				page: page.metrics(),
				fixture:
					"production PageScripts over in-memory HTML; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"normal-flow paint ordering only; no pointer-events CSS, transforms, positioned stacking, scrolling or full browser hit testing; the separate 256-query stress probe retains its default deadline",
			},
			null,
			2,
		),
	);
}
