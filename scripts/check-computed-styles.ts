import { documentGeometry } from "../src/document-geometry.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{width:50%;font-size:8px;color:rebeccapurple} #target{width:50%;padding:5%;margin:0 auto}</style><main><div id="target">ab</div><span id="inline">ab cd</span></main>',
	"https://fixture.invalid/computed-styles",
);
documentStyles(tree).setViewport(400, 200);
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
		"Both production bindings expose live computed declarations",
		'var target = document.getElementById("target"); var saved = getComputedStyle(target); return saved !== window.getComputedStyle(target) && saved.width === "100px" && saved.height === "10px";',
	);
	await guest(
		"Indexed names, aliases, cssText and rule metadata",
		'return saved.length === 66 && saved[0] === "align-content" && saved.item(0) === saved[0] && saved.item(99) === "" && saved[99] === undefined && saved.cssText === "" && saved.parentRule === null && saved.getPropertyValue("COLOR") === saved.color;',
	);
	await guest(
		"Cascade inheritance and percentage used edges",
		'return saved.color === "rgb(102, 51, 153)" && saved.margin === "0px 40px" && saved.padding === "10px";',
	);
	await guest(
		"Read-only writes reject with DOM exception name",
		'var readOnly = false; try { saved.width = "1px"; } catch (error) { readOnly = error.name === "NoModificationAllowedError"; } return readOnly && saved.width === "100px";',
	);
	await guest(
		"Declaration mutation methods reject without changing inline style",
		'var methodReadOnly = false; try { saved.setProperty("color", "blue"); } catch (error) { methodReadOnly = error.name === "NoModificationAllowedError"; } return methodReadOnly && target.style.color === "";',
	);
	await guest(
		"Saved declaration follows real interpreted DOM mutation",
		'target.style.width = "25%"; target.style.color = "red"; return saved.width === "50px" && saved.color === "rgb(255, 0, 0)";',
	);
	documentStyles(tree).setViewport(800, 200);
	await guest(
		"Saved declaration follows native viewport changes",
		'return saved.width === "100px" && saved.padding === "20px";',
	);
	const builds = documentGeometry(tree).metrics().builds;
	await guest(
		"Repeated property reads reuse layout without allocating new declarations",
		'var total = 0; for (var index = 0; index < 50; index++) { if (saved.width === "100px") total++; } return total === 50;',
	);
	check(
		"Geometry snapshot build count stays constant",
		documentGeometry(tree).metrics().builds === builds,
	);
	await guest(
		"Inline dimensions remain computed, line-height resolves to pixels",
		'var inline = document.getElementById("inline"); inline.style.width = "50%"; inline.style.lineHeight = "1.5"; var inlineStyle = getComputedStyle(inline); return inlineStyle.width === "50%" && inlineStyle.lineHeight === "12px";',
	);
	await guest(
		"Detached styles empty and refill after reattachment",
		'var parent = target.parentNode; target.remove(); var empty = saved.length === 0 && saved.width === ""; parent.appendChild(target); return empty && saved.length === 66 && saved.width === "100px";',
	);
	await guest(
		"Pseudo-elements fail explicitly instead of pretending to match",
		'var unsupported = false; try { getComputedStyle(target, "::before"); } catch (error) { unsupported = true; } return unsupported;',
	);
	await guest(
		"Forged element arguments do not cross document capability boundary",
		"var rejected = false; try { getComputedStyle({}); } catch (error) { rejected = true; } return rejected;",
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
					"in-memory HTML through production PageScripts and PageBindings; no websites or sockets",
				runtime:
					"existing explicitly selected experimental SafeJS core; not released-SDK acceptance",
				passed,
				checks,
				geometry: documentGeometry(tree).metrics(),
			},
			null,
			2,
		),
	);
}
