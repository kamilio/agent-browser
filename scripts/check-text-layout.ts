import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
} from "../src/raster.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { type TextContext, layoutDocumentText } from "../src/text-layout.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
	throw new Error("Provide one PNG output path");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
const panels: { label: string; context: TextContext }[] = [];
let current: DocumentTree | undefined;
let completed = false;
let artifact: { output: string; bytes: number; sha256: string } | undefined;
const host = new BrowserCommandHost({
	createSession: () =>
		new BrowserSession({
			createTransport: () => ({
				async request(input) {
					return {
						url: input.url,
						status: 200,
						headers: {},
						body: new Uint8Array(),
						redirects: [],
						encodedBytes: 0,
						elapsedMs: 0,
					};
				},
				metrics: () => ({
					requests: 0,
					active: 0,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
					closed: false,
				}),
				close() {},
			}),
			loadDocument: (response, context) => {
				current = parseHtmlDocument(
					'<main id="panel" style="width:120px">alpha beta gamma</main><span id="trigger">Change</span>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				);
				return current;
			},
		}),
	evaluatePage: (page, source, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(source, { signal });
	},
});
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
function document() {
	if (!current) throw new Error("Missing fixture document");
	return current;
}
function context() {
	const tree = document();
	const result = layoutDocumentText(tree).contexts.find(
		(entry) => entry.ref && tree.resolve(entry.ref).attributes.id === "panel",
	);
	if (!result) throw new Error("Missing panel text context");
	return result;
}
function text(value: TextContext) {
	return value.lines.map((line) =>
		value.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Interpreted text fixture failed");
	return result.value;
}
try {
	await host.execute(["open", "https://fixture.invalid/text"]);
	const initial = context();
	check(
		"Initial lines use actual built-in glyph advances and document widths",
		JSON.stringify(text(initial)) === '["alpha beta","gamma"]' &&
			initial.textHeight === 40,
	);
	panels.push({ label: "INITIAL / 16PX / WIDTH 120", context: initial });
	await evaluate(
		'document.getElementById("trigger").addEventListener("click", function() { document.getElementById("panel").style.fontSize = "8px"; });',
	);
	await host.execute(["click", "#trigger"]);
	const smaller = context();
	check(
		"Native click runs an interpreted fontSize write and reflows source-mapped lines",
		text(smaller).length === 1 &&
			smaller.glyphs[0].fontSize === 8 &&
			smaller.lines[0].width === 96,
	);
	const inspected = (await host.execute(["styles", "#panel"])).data as {
		text: Record<string, string>;
	};
	check(
		"Agent style inspection exposes the same computed typography",
		inspected.text["font-size"] === "8px",
	);
	check(
		"A prior immutable result retains its original metrics",
		initial.glyphs[0].fontSize === 16 && initial.lines.length === 2,
	);
	panels.push({ label: "AFTER CLICK / 8PX / WIDTH 120", context: smaller });
	await evaluate(
		'document.getElementById("panel").style.whiteSpace = "pre"; document.getElementById("panel").textContent = "A\\tB\\nC";',
	);
	const pre = context();
	check(
		"Interpreted whiteSpace and textContent preserve tabs and hard breaks",
		JSON.stringify(text(pre)) === '["A\\tB","C"]' &&
			pre.glyphs[1].kind === "tab" &&
			pre.glyphs[1].advance === 42,
	);
	panels.push({ label: "PRE / TAB STOPS / HARD BREAK", context: pre });
	await evaluate(
		'document.getElementById("panel").style.whiteSpace = "nowrap"; document.getElementById("panel").textContent = "alpha beta gamma delta"; document.getElementById("panel").style.width = "48px";',
	);
	check(
		"Nowrap preserves measured overflow rather than truncating content",
		context().lines.length === 1 && context().lines[0].overflow > 0,
	);
	await evaluate(
		'document.getElementById("panel").style.whiteSpace = "normal"; document.getElementById("panel").style.width = "50%"; document.getElementById("panel").style.fontSize = "2vw"; document.getElementById("panel").style.textAlign = "center";',
	);
	await host.execute(["resize", "400", "300"]);
	const resized = context();
	check(
		"Logical resize updates font units, containing widths and alignment together",
		resized.contentWidth === 200 &&
			resized.glyphs[0].fontSize === 8 &&
			resized.glyphs[0].x === (200 - resized.lines[0].width) / 2,
	);
	panels.push({ label: "RESIZED / CENTERED / 2VW", context: resized });
	await evaluate('document.getElementById("panel").style.lineHeight = "0";');
	check(
		"Unitless zero line-height is honored without clamping glyph ink",
		context().textHeight === 0 && context().glyphs[0].y < 0,
	);
	await evaluate(
		'document.getElementById("panel").style.lineHeight = "normal"; document.getElementById("panel").textContent = "A 🙂 B";',
	);
	check(
		"Unsupported code points retain two-code-unit source locations and explicit fallback",
		context().glyphs.some(
			(glyph) =>
				glyph.character === "🙂" && glyph.codeUnits === 2 && !glyph.supported,
		),
	);
	const before = document().revision;
	layoutDocumentText(document());
	check(
		"Text layout is observational and does not mutate the native document",
		document().revision === before,
	);
	const image = createRaster(640, 330, [247, 249, 252, 255]);
	let originY = 16;
	for (const panel of panels) {
		paintRasterRect(image, 12, originY - 4, 616, 16, [25, 40, 60, 255]);
		let cursor = 20;
		for (const character of panel.label) {
			paintBitmapGlyph(
				image,
				character,
				cursor,
				originY,
				8,
				[255, 255, 255, 255],
			);
			cursor += 6;
		}
		originY += 24;
		paintRasterRect(
			image,
			18 + panel.context.contentX,
			originY,
			panel.context.contentWidth,
			panel.context.textHeight,
			[222, 234, 245, 255],
		);
		for (const glyph of panel.context.glyphs)
			if (glyph.visible && glyph.fontSize > 0 && glyph.kind === "glyph")
				paintBitmapGlyph(
					image,
					glyph.character,
					18 + glyph.x,
					originY + glyph.y,
					glyph.fontSize,
					[20, 35, 55, 255],
				);
		originY += panel.context.textHeight + 22;
	}
	const png = encodePng(image);
	writeFileSync(output, png);
	artifact = {
		output,
		bytes: png.length,
		sha256: createHash("sha256").update(png).digest("hex"),
	};
	check(
		"The measured contexts can be painted using the same masks without rewrapping",
		panels.length === 4 && originY <= image.height,
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	let revoked = false;
	try {
		layoutDocumentText(document());
	} catch {
		revoked = true;
	}
	check(
		"Closing the page revokes fresh layout reads and its interpreter owner",
		revoked && [...owners.values()].every((owner) => owner.closed),
	);
	completed = true;
} finally {
	host.close();
	for (const owner of owners.values()) await owner.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"existing-experimental-core-in-memory-typography-and-block-relative-text-lines",
				pageRendering: false,
				realWebsite: false,
				manualPanelPlacement: true,
				completed,
				passed: checks.filter((entry) => entry.passed).length,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
