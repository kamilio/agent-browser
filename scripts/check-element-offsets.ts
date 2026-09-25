import { documentGeometry } from "../src/document-geometry.js";
import { documentElementOffsets } from "../src/element-offsets.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<!doctype html><style>html{margin:0;padding:1px}body{margin:7px;padding:3px}main{width:100px;font-size:8px;margin:11px 0 0 5px;padding:2px}#target{margin:6px 0 0 4px;width:10px;height:5px;padding:1px}#wrap{width:24px;line-height:10px}</style><main><div id="target">a</div><div id="wrap">a <span id="inline">b cd ef</span></div></main>',
	"https://fixture.invalid/element-offsets",
);
documentStyles(tree).setViewport(400, 200);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const offsets = documentElementOffsets(tree);
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
		"Actual guest offset coordinates use the body padding edge and native parent identity",
		'var target = document.getElementById("target"); return target.offsetParent === document.body && target.offsetTop === 22 && target.offsetLeft === 14;',
	);
	await guest(
		"Body and root have no offset parent",
		"return document.body.offsetParent === null && document.body.offsetTop === 0 && document.body.offsetLeft === 0 && document.documentElement.offsetParent === null;",
	);
	await guest(
		"Wrapped inline offsets follow the first fragment rather than the bounding union",
		'var inline = document.getElementById("inline"); var rects = inline.getClientRects(); var bodyBox = document.body.getBoundingClientRect(); return rects.length > 1 && rects[0].left > inline.getBoundingClientRect().left && inline.offsetLeft === Math.round(rects[0].left - bodyBox.left) && inline.offsetTop === Math.round(rects[0].top - bodyBox.top);',
	);
	const before = offsets.metrics();
	const rectangles = page.metrics().dom?.geometry.created;
	const builds = documentGeometry(tree).metrics().builds;
	await guest(
		"Repeated guest reads retain stable values and parent identities",
		"var total = 0; for(var index = 0; index < 256; index++) { total += target.offsetLeft + target.offsetTop; if(target.offsetParent !== document.body) return false; } return total === 9216;",
	);
	check(
		"Cached reads do not allocate DOMRects, rebuild layout or repeat ancestor scans",
		offsets.metrics().work === before.work &&
			offsets.metrics().measurements === before.measurements &&
			page.metrics().dom?.geometry.created === rectangles &&
			documentGeometry(tree).metrics().builds === builds,
	);
	await guest(
		"Existing style assignment forwards to the same live declaration object",
		'var style = target.style; target.style = "margin-left:8px;width:10px;height:5px"; return target.style === style && style.marginLeft === "8px" && target.offsetLeft === 18;',
	);
	await guest(
		"Readonly offset properties cannot overwrite native measurements",
		"try { target.offsetLeft = 999; } catch(error) {} try { target.offsetParent = null; } catch(error) {} return target.offsetLeft === 18 && target.offsetParent === document.body;",
	);
	await guest(
		"Detachment and reinsertion invalidate cached parent and coordinates",
		"var parent = target.parentNode; target.remove(); var detached = target.offsetParent === null && target.offsetLeft === 0 && target.offsetTop === 0; parent.appendChild(target); return detached && target.offsetParent === document.body && target.offsetLeft === 18;",
	);
	await guest(
		"Visibility retains boxes while display none removes them",
		'target.style.visibility = "hidden"; var hidden = target.offsetLeft === 18; target.style.display = "none"; var absent = target.offsetParent === null && target.offsetLeft === 0 && target.offsetTop === 0; target.style.display = "block"; return hidden && absent && target.offsetLeft === 18;',
	);
	await guest(
		"Percentage offsets are measured from the current viewport",
		'document.body.style = "margin:0;padding:0"; document.documentElement.style = "padding:0"; var responsive = document.createElement("div"); responsive.style = "margin-left:10%;height:1px"; document.body.appendChild(responsive); return responsive.offsetLeft === 40 && responsive.offsetParent === document.body;',
	);
	documentStyles(tree).setViewport(640, 200);
	await guest(
		"Viewport changes invalidate cached offsets in the same guest realm",
		"return responsive.offsetLeft === 64 && responsive.offsetParent === document.body;",
	);
	await page.close();
	tree.close();
	check(
		"Document close releases offset and shared geometry state",
		offsets.metrics().closed &&
			offsets.metrics().retained === 0 &&
			documentGeometry(tree).metrics().rectangles === 0 &&
			page.metrics().dom?.elementOffsets.closed === true,
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
				offsets: offsets.metrics(),
				page: page.metrics(),
				fixture:
					"production PageScripts over in-memory HTML; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"normal-flow first-box offsets only; positioned containing blocks, borders, transforms, zoom, shadow trees and boxless offset parents remain unsupported",
			},
			null,
			2,
		),
	);
}
