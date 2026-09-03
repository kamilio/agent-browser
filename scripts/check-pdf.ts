import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { renderDocumentPdf } from "../src/document-pdf.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { createRaster } from "../src/raster.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const prefix = process.argv[2];
if (!prefix || process.argv.length !== 3)
	throw new Error("Provide a new artifact prefix");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{font-size:8px;line-height:10px;background-color:#123456;color:white}</style><main><span id="first">ONE</span><br>TWO<br>THREE</main>',
	"https://fixture.invalid/pdf",
);
documentStyles(tree).setViewport(64, 16);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let artifact: unknown;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
function ghostscript(options: string[]) {
	const result = spawnSync("gs", options, {
		timeout: 20000,
		maxBuffer: 8_388_608,
	});
	if (result.status !== 0)
		throw new Error(
			`Ghostscript failed: ${result.error?.message ?? result.stderr?.toString()}`,
		);
	return result.stdout;
}
function ppmPages(bytes: Uint8Array) {
	let offset = 0;
	const pages: { width: number; height: number; pixels: Uint8Array }[] = [];
	function token() {
		while (offset < bytes.length) {
			if (bytes[offset] === 35) {
				while (offset < bytes.length && bytes[offset] !== 10) offset++;
			} else if (bytes[offset] <= 32) offset++;
			else break;
		}
		const start = offset;
		while (offset < bytes.length && bytes[offset] > 32) offset++;
		return new TextDecoder().decode(bytes.subarray(start, offset));
	}
	while (offset < bytes.length) {
		if (token() !== "P6") throw new Error("Expected Ghostscript P6 page");
		const width = Number(token());
		const height = Number(token());
		if (
			token() !== "255" ||
			!Number.isSafeInteger(width) ||
			!Number.isSafeInteger(height) ||
			width < 1 ||
			height < 1 ||
			width * height > 4_194_304 ||
			bytes[offset] !== 10
		)
			throw new Error("Invalid Ghostscript page header");
		offset++;
		const end = offset + width * height * 3;
		if (end > bytes.length) throw new Error("Truncated Ghostscript page");
		pages.push({ width, height, pixels: bytes.slice(offset, end) });
		offset = end;
	}
	return pages;
}
try {
	const evaluated = await page.evaluate(
		'document.getElementById("first").firstChild.data = "EDIT"; return true;',
	);
	check(
		"Real interpreted page code changes the exported document",
		evaluated.ok && evaluated.value === true,
	);
	const pdf = renderDocumentPdf(tree);
	check(
		"Native pagination produces three bounded pages",
		pdf.metrics.pages === 3 && pdf.metrics.glyphs === 12,
	);
	const filename = `${prefix}.pdf`;
	await writeFile(filename, pdf.bytes, { flag: "wx", mode: 0o600 });
	const version = ghostscript(["--version"]).toString().trim();
	const rendered = ghostscript([
		"-q",
		"-dSAFER",
		"-dBATCH",
		"-dNOPAUSE",
		"-dPDFSTOPONERROR",
		"-sDEVICE=ppmraw",
		"-r96",
		"-sOutputFile=-",
		filename,
	]);
	const pages = ppmPages(rendered);
	check(
		"Independent Ghostscript parser renders every PDF page",
		pages.length === pdf.metrics.pages,
	);
	for (let index = 0; index < pages.length; index++) {
		const actual = pages[index];
		const expected = rasterizeDocument(tree, { clip: pdf.clips[index] }).image;
		let equal = actual.width === pdf.width && actual.height === pdf.height;
		for (let row = 0; row < actual.height && equal; row++)
			for (let column = 0; column < actual.width && equal; column++)
				for (let channel = 0; channel < 3; channel++) {
					const wanted =
						row < expected.height
							? expected.pixels[(row * expected.width + column) * 4 + channel]
							: 255;
					if (
						actual.pixels[(row * actual.width + column) * 3 + channel] !==
						wanted
					)
						equal = false;
				}
		check(
			`Independent page ${index + 1} pixels exactly match native painting plus white paper padding`,
			equal,
		);
	}
	const extracted = ghostscript([
		"-q",
		"-dSAFER",
		"-dBATCH",
		"-dNOPAUSE",
		"-dPDFSTOPONERROR",
		"-sDEVICE=txtwrite",
		"-sOutputFile=-",
		filename,
	]).toString("utf8");
	check(
		"Independent text extraction sees actual guest-modified text on all pages",
		["EDIT", "TWO", "THREE"].every((word) => extracted.includes(word)) &&
			!extracted.includes("ONE"),
	);
	const first = pages[0];
	const image = createRaster(first.width, first.height, [255, 255, 255, 255]);
	for (let pixel = 0; pixel < first.width * first.height; pixel++)
		image.pixels.set(
			first.pixels.subarray(pixel * 3, pixel * 3 + 3),
			pixel * 4,
		);
	await writeFile(`${prefix}.png`, encodePng(image), {
		flag: "wx",
		mode: 0o600,
	});
	artifact = {
		filename,
		preview: `${prefix}.png`,
		bytes: pdf.bytes.length,
		sha256: createHash("sha256").update(pdf.bytes).digest("hex"),
		ghostscriptVersion: version,
		clips: pdf.clips,
		metrics: pdf.metrics,
	};
	await page.close();
	tree.close();
	check(
		"Page export leaves no running realm after close",
		page.metrics().closed && page.metrics().pendingCallbacks === 0,
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
					"in-memory HTML, existing experimental SafeJS and installed Ghostscript as independent validator only; no network/sockets",
				passed,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
