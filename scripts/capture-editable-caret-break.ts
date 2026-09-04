import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { documentGeometry } from "../src/document-geometry.js";
import { layoutDocument } from "../src/document-layout.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { existingDomRangeOwner } from "../src/dom-range.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { encodePng } from "../src/png.js";
import { rangeClientRects } from "../src/range-geometry.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const directory = process.argv[2];
if (!directory || process.argv.length !== 3 || !isAbsolute(directory))
	throw new Error("Provide one new absolute capture directory");
mkdirSync(directory, { mode: 0o700 });
const tree = parseHtmlDocument(
	`<style>
html,body{margin:0;padding:0;background:white;font-size:16px;line-height:24px;color:#202830}
main{margin:16px}p{margin:8px 0}#editor{width:440px;min-height:96px;padding:10px;background:#e8eef4;color:#004080;white-space:pre-wrap}
</style><main><p>Terminal plaintext Enter - native source breaks</p><div id="editor" contenteditable="plaintext-only">old</div><p>Exact Range position; preceding glyph paint order.</p><p>No empty-editor, IME, or runtime browser claim.</p></main>`,
	"https://fixture.invalid/caret-terminal-break-capture",
);
try {
	documentStyles(tree).setViewport(640, 280);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const actions = documentInteractions(tree);
	actions.fill(tree.reference(editor), "Alpha");
	const owner = existingDomRangeOwner(tree);
	if (!owner) throw new Error("Native fill did not publish selection");
	const captures = [];
	let cover: number | undefined;
	for (const phase of [
		"filled",
		"terminal-enter",
		"covered-enter",
		"consecutive-enter",
		"typed-beta",
	]) {
		if (phase === "terminal-enter") actions.keyboard.press("Enter");
		if (phase === "covered-enter") {
			const rect = rangeClientRects(owner.selection.getRangeAt(0))[0];
			cover = tree.createElement("div");
			tree.setAttribute(
				cover,
				"style",
				`position:absolute;left:${rect.x - 2}px;top:${rect.y - 2}px;width:7px;height:${rect.height + 4}px;background:#d03050;z-index:1`,
			);
			tree.append(tree.get(editor).parent as number, cover);
		}
		if (phase === "consecutive-enter") {
			if (cover !== undefined) tree.remove(cover);
			actions.keyboard.press("Enter");
		}
		if (phase === "typed-beta") actions.keyboard.type("Beta");
		const raster = rasterizeDocument(tree);
		const bytes = encodePng(raster.image);
		const filename = `${phase}.png`;
		writeFileSync(join(directory, filename), bytes, {
			flag: "wx",
			mode: 0o600,
		});
		const layout = layoutDocument(tree);
		const sourceBreaks = layout.contexts.flatMap((context) =>
			context.lines.flatMap((line) =>
				line.sourceBreak
					? [
							{
								context: context.id,
								line: line.index,
								baseline: line.baseline,
								sourceBreak: line.sourceBreak,
							},
						]
					: [],
			),
		);
		captures.push({
			phase,
			filename,
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			width: raster.image.width,
			height: raster.image.height,
			metrics: raster.metrics,
			editor: documentGeometry(tree).getBoundingClientRect(editor),
			rangeRects: rangeClientRects(owner.selection.getRangeAt(0)),
			sourceBreaks,
			text: tree.textContent(editor),
			selection: {
				anchor: owner.selection.anchor,
				focus: owner.selection.focus,
				type: owner.selection.type,
			},
		});
	}
	const report = {
		generatedAt: new Date().toISOString(),
		command: `node dist/scripts/capture-editable-caret-break.js ${directory}`,
		source: "synthetic-native-document",
		runtime: false,
		captures,
	};
	writeFileSync(
		join(directory, "evidence.json"),
		`${JSON.stringify(report, null, 2)}\n`,
		{ flag: "wx", mode: 0o600 },
	);
	console.log(
		JSON.stringify(
			captures.map(({ phase, bytes, width, height, metrics, rangeRects }) => ({
				phase,
				bytes,
				width,
				height,
				status: metrics.caretStatus,
				rangeRects,
			})),
			null,
			2,
		),
	);
} finally {
	tree.close();
}
