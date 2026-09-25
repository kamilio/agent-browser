import { createHash } from "node:crypto";
import { documentGeometry } from "../src/document-geometry.js";
import { documentImages } from "../src/document-images.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { createRaster } from "../src/raster.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>html{margin:0}body{margin:0;border:5px solid black;padding:3px}#box{width:20px;height:10px;padding:3px;border:2px solid red}img{display:block;width:4px;height:2px;padding:1px;border:2px solid blue}button{font-size:8px;border:1px solid green}</style><div id="box"></div><img id="photo" src="/pixel.png"><button id="button">OK</button>',
	"https://fixture.invalid/borders",
);
documentStyles(tree).setViewport(100, 100);
const images = documentImages(tree, {
	fetch: async (url) => {
		const body = encodePng(createRaster(4, 2, [255, 0, 255, 255]));
		return {
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		};
	},
});
await images.settle();
const interactions = documentInteractions(tree);
const page = new PageScripts({ document: tree, interactions }, core);
const query = new DocumentQueries(tree);
const checks: { label: string; passed: boolean }[] = [];
const captures: { label: string; sha256: string; borderPixels: number }[] = [];
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
function capture(label: string) {
	const result = rasterizeDocument(tree);
	captures.push({
		label,
		sha256: createHash("sha256").update(result.image.pixels).digest("hex"),
		borderPixels: result.metrics.borderPixels,
	});
	return result;
}
try {
	await guest(
		"Actual guest reads border-box, padding-box and offset-parent coordinates",
		'var box=document.getElementById("box"); var style=getComputedStyle(box); return box.offsetWidth===30 && box.offsetHeight===20 && box.clientWidth===26 && box.clientHeight===16 && box.clientLeft===2 && box.clientTop===2 && box.offsetLeft===3 && box.offsetTop===3 && style.borderLeftWidth==="2px" && style.borderLeftColor==="rgb(255, 0, 0)";',
	);
	await guest(
		"Guest sees the loaded bordered PNG without confusing border and image dimensions",
		'var photo=document.getElementById("photo"); return photo.complete && photo.naturalWidth===4 && photo.naturalHeight===2 && photo.offsetWidth===10 && photo.offsetHeight===8 && photo.clientWidth===6 && photo.clientHeight===4 && photo.clientLeft===2;',
	);
	const initial = capture("initial");
	const photoId = query.querySelector("#photo");
	if (photoId === null) throw new Error("Missing image");
	const rect = documentGeometry(tree).getBoundingClientRect(photoId);
	const pixel = (column: number, row: number) =>
		Array.from(
			initial.image.pixels.slice(
				(row * initial.image.width + column) * 4,
				(row * initial.image.width + column) * 4 + 4,
			),
		).join(",");
	check(
		"Actual resource pixels appear inside blue CSS borders and separate padding",
		pixel(rect.x, rect.y) === "0,0,255,255" &&
			pixel(rect.x + 3, rect.y + 3) === "255,0,255,255" &&
			initial.metrics.paintedImages === 1 &&
			initial.metrics.paintedControls === 1 &&
			initial.metrics.borderPixels > 0,
	);
	await guest(
		"Guest CSSOM shorthand mutation updates live computed widths and geometry",
		'box.style.border="4px solid blue"; return box.style.border==="4px solid blue" && style.borderLeftWidth==="4px" && box.offsetWidth===34 && box.offsetHeight===24 && box.clientWidth===26;',
	);
	capture("wider-blue");
	check(
		"The changed border produces different actual pixels",
		captures[0].sha256 !== captures[1].sha256,
	);
	await guest(
		"Border-box changes preserve the distinct client and content areas",
		'box.style.boxSizing="border-box"; box.style.width="40px"; box.style.height="30px"; return box.offsetWidth===40 && box.offsetHeight===30 && box.clientWidth===32 && box.clientHeight===22 && style.width==="40px";',
	);
	await guest(
		"Guest installs a listener and identifies the same element on its border",
		'var clicks=0; box.addEventListener("click",function(){clicks++;}); var bounds=box.getBoundingClientRect(); return document.elementFromPoint(bounds.x+1,bounds.y+1)===box;',
	);
	const boxId = query.querySelector("#box");
	if (boxId === null) throw new Error("Missing box");
	const bounds = documentGeometry(tree).getBoundingClientRect(boxId);
	await interactions.mouse.moveAsync(bounds.x + 1, bounds.y + 1);
	await interactions.mouse.downAsync();
	await interactions.mouse.upAsync();
	await guest(
		"Native border targeting dispatches the real guest click listener",
		"return clicks===1;",
	);
	await guest(
		"None removes used border thickness while retaining CSSOM declared width",
		'box.style.borderStyle="none"; return box.style.borderLeftWidth==="4px" && style.borderLeftWidth==="0px" && box.clientLeft===0 && box.clientWidth===40;',
	);
	await guest(
		"Fractional border widths snap at scale one and old declarations remain live",
		'box.style.border="0.5px solid currentcolor"; box.style.color="green"; return style.borderLeftWidth==="1px" && style.borderLeftColor==="rgb(0, 128, 0)" && box.clientLeft===1;',
	);
	await guest(
		"Inherited currentcolor resolves against the child rather than the parent color",
		'document.body.style.borderColor="currentcolor"; document.body.style.color="red"; box.style.borderColor="inherit"; return style.borderLeftColor==="rgb(0, 128, 0)";',
	);
	await guest(
		"Removing the inline shorthand restores stylesheet borders without dropping other edits",
		'box.style.removeProperty("border"); return style.borderLeftWidth==="2px" && style.borderLeftColor==="rgb(255, 0, 0)" && box.style.borderLeftWidth==="" && box.style.width==="40px" && box.style.color==="green";',
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
				captures,
				page: page.metrics(),
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				fixture:
					"parsed document and in-memory PNG resource; no network, sockets or external browser",
				limitations:
					"solid block and replaced borders; inline fragmentation, radius, dashed and general CSS remain unsupported",
			},
			null,
			2,
		),
	);
}
