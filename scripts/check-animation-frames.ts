import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>#target{width:12px;height:8px;background-color:red;font-size:8px}</style><div id="target">a</div><div id="status">waiting</div>',
	"https://fixture.invalid/animation-frames",
);
documentStyles(tree).setViewport(80, 40);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const queries = new DocumentQueries(tree);
const status = queries.querySelector("#status");
const target = queries.querySelector("#target");
if (status === null || target === null)
	throw new Error("Missing fixture elements");
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let framesBeforeClose: unknown;
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
		"Performance is one owned Window/global capability",
		"var origin = performance.timeOrigin; var initial = performance.now(); return performance === window.performance && performance === self.performance && origin > 0 && initial >= 0 && performance.toJSON().timeOrigin === origin;",
	);
	await guest(
		"Origin is readonly and JSON projection does not mutate it",
		"var copy = performance.toJSON(); copy.timeOrigin = 0; try { performance.timeOrigin = 0; } catch (error) {} return performance.timeOrigin === origin && performance.toJSON().timeOrigin === origin;",
	);
	await guest(
		"Synchronous guest callbacks register without running inline",
		`
		var order = []; var stamps = []; var receivers = []; var canceled = 0;
		requestAnimationFrame(function(timestamp) {
			order.push("first"); stamps.push(timestamp); receivers.push(this === window);
			cancelAnimationFrame(canceled);
			requestAnimationFrame(function(nextTimestamp) {
				order.push("next"); stamps.push(nextTimestamp); receivers.push(this === window);
				var target = document.getElementById("target");
				target.style.width = "24px"; target.style.backgroundColor = "blue";
				document.getElementById("status").textContent = "done";
			});
		});
		canceled = requestAnimationFrame(function() { order.push("canceled"); });
		requestAnimationFrame(function() { order.push("error"); throw new Error("frame fixture rejection"); });
		requestAnimationFrame(function(timestamp) { order.push("last"); stamps.push(timestamp); receivers.push(this === window); });
		return order.length === 0;
	`,
	);
	const deadline = performance.now() + 750;
	while (
		tree.textContent(status) !== "done" &&
		performance.now() < deadline &&
		!page.closed
	)
		await new Promise((resolve) => setTimeout(resolve, 5));
	check(
		"Two native frame opportunities complete within the bounded fixture wait",
		tree.textContent(status) === "done",
	);
	await guest(
		"Batch order, cancellation, ordinary rejection isolation and next-frame deferral hold",
		'return order.join(",") === "first,error,last,next" && stamps.length === 3 && stamps[0] === stamps[1] && stamps[2] > stamps[1];',
	);
	await guest(
		"Frame callbacks receive Window and the shared elapsed clock",
		"return receivers[0] && receivers[1] && receivers[2] && stamps[0] >= initial && performance.now() >= stamps[2] && performance.timeOrigin === origin;",
	);
	await guest(
		"Frame DOM writes change actual layout and computed paint",
		'var target = document.getElementById("target"); return target.clientWidth === 24 && target.getBoundingClientRect().width === 24 && getComputedStyle(target).backgroundColor === "rgb(0, 0, 255)";',
	);
	const capture = rasterizeDocument(tree, { element: tree.reference(target) });
	check(
		"Explicit capture paints the frame's native geometry and blue background",
		capture.image.width === 24 &&
			capture.image.height === 8 &&
			capture.image.pixels[0] === 0 &&
			capture.image.pixels[1] === 0 &&
			capture.image.pixels[2] === 255 &&
			capture.image.pixels[3] === 255,
	);
	framesBeforeClose = page.metrics().animationFrames;
	check(
		"Completed frames leave no queued work or pending callback references",
		page.metrics().animationFrames?.active === 0 &&
			page.metrics().animationFrames?.pendingCallbacks === 0 &&
			page.metrics().animationFrames?.armed === false,
	);
	await guest(
		"A queued callback can be canceled from the alias",
		"var handle = window.requestAnimationFrame(function() { document.getElementById('status').textContent = 'unexpected'; }); cancelAnimationFrame(handle); return true;",
	);
	await page.close();
	tree.close();
	check(
		"Page close revokes the clock and clears frame state",
		page.metrics().performance.closed &&
			page.metrics().animationFrames?.closed === true &&
			page.metrics().animationFrames?.active === 0 &&
			page.metrics().animationFrames?.pendingCallbacks === 0 &&
			page.metrics().animationFrames?.armed === false,
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
					"in-memory HTML; synchronous guest frame callbacks only; no network or sockets",
				runtime:
					"explicit existing experimental SafeJS core, not released-SDK acceptance or async-tail scheduler conformance",
				passed,
				checks,
				framesBeforeClose,
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
