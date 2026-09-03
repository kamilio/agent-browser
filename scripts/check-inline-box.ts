import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const filename = process.argv[2];
if (!filename || process.argv.length !== 3)
	throw new Error("Provide a new PNG output filename");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{width:26px;font-size:8px}#target{padding:0 2px;margin:0 1px;background-color:#8844ff;color:white}#empty{padding:0 3px;background-color:red}</style><main><span id="target">ab cd</span><span id="empty"></span></main>',
	"https://fixture.invalid/inline-box",
);
documentStyles(tree).setViewport(80, 40);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const queries = new DocumentQueries(tree);
const id = queries.querySelector("#target");
if (id === null) throw new Error("Missing target");
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let artifact: unknown;
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
		"Interpreted client geometry contains real sliced inline padding",
		'var target = document.getElementById("target"); var rects = target.getClientRects(); var style = getComputedStyle(target); return rects.length === 2 && rects[0].x === 1 && rects[0].width === 14 && rects[1].x === 0 && rects[1].width === 14 && style.paddingLeft === "2px" && style.marginRight === "1px";',
	);
	await guest(
		"Empty padded inline has geometry without text",
		'var empty = document.getElementById("empty"); return empty.textContent === "" && empty.getBoundingClientRect().width === 6;',
	);
	const target = tree.reference(id);
	const capture = rasterizeDocument(tree, { element: target });
	const viewport = rasterizeDocument(tree);
	const png = encodePng(capture.image);
	check(
		"Inline capture includes both fragments and their intervening gap",
		capture.image.width === 15 && capture.image.height === 18,
	);
	let equal = true;
	for (let row = 0; row < capture.image.height; row++) {
		const start =
			((row + capture.clip.y) * viewport.image.width + capture.clip.x) * 4;
		const actual = viewport.image.pixels.subarray(
			start,
			start + capture.image.width * 4,
		);
		const expected = capture.image.pixels.subarray(
			row * capture.image.width * 4,
			(row + 1) * capture.image.width * 4,
		);
		if (!actual.every((value, index) => value === expected[index]))
			equal = false;
	}
	check("Every capture pixel agrees with the native viewport crop", equal);
	const chunks: Uint8Array[] = [];
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	for (let offset = 8; offset < png.length; ) {
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
		if (type === "IDAT")
			chunks.push(png.subarray(offset + 8, offset + 8 + length));
		offset += length + 12;
	}
	const decoded = inflateSync(Buffer.concat(chunks));
	const rowBytes = capture.image.width * 4;
	let pixelsMatch = decoded.length === (rowBytes + 1) * capture.image.height;
	for (let row = 0; row < capture.image.height; row++) {
		const offset = row * (rowBytes + 1);
		if (
			decoded[offset] !== 0 ||
			!decoded
				.subarray(offset + 1, offset + 1 + rowBytes)
				.every(
					(value, column) =>
						value === capture.image.pixels[row * rowBytes + column],
				)
		)
			pixelsMatch = false;
	}
	check(
		"Independent native inflater verifies emitted PNG scanlines",
		pixelsMatch,
	);
	await writeFile(filename, png, { flag: "wx", mode: 0o600 });
	artifact = {
		filename,
		bytes: png.length,
		width: capture.image.width,
		height: capture.image.height,
		sha256: createHash("sha256").update(png).digest("hex"),
		pixelsSha256: createHash("sha256")
			.update(capture.image.pixels)
			.digest("hex"),
	};
	await guest(
		"Page writes update saved computed styles and fresh geometry",
		'target.style.paddingLeft = "6px"; target.style.paddingRight = "4px"; return style.paddingLeft === "6px" && target.getBoundingClientRect().width === 19 && rects[0].width === 14;',
	);
	const updated = rasterizeDocument(tree, { element: target });
	check(
		"Later native captures change after interpreted edge mutation",
		updated.image.width === 19 &&
			createHash("sha256").update(encodePng(updated.image)).digest("hex") !==
				createHash("sha256").update(png).digest("hex"),
	);
	await guest(
		"Signed margins affect position but do not pad the element border box",
		'target.style.marginLeft = "-2px"; return style.marginLeft === "-2px" && target.getClientRects()[0].x === -2 && target.getClientRects()[0].width === 18;',
	);
	await page.close();
	tree.close();
	check(
		"Closing releases geometry and resolved edge caches",
		documentGeometry(tree).metrics().rectangles === 0 &&
			documentGeometry(tree).metrics().usedStyles === 0,
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
					"in-memory native layout/PNG through production PageScripts; no network or sockets",
				runtime:
					"explicitly selected existing experimental SafeJS core; not released-SDK acceptance",
				passed,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
