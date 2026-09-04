import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { domRangeOwner, existingDomRangeOwner } from "../src/dom-range.js";
import { editableCaretCapabilities } from "../src/editable-caret.js";
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
html,body{margin:0;padding:0;background:white;font-size:16px;color:#202830}
main{margin:16px}p{margin:12px 0}#editor{width:440px;padding:10px;background:#e8eef4;color:#004080;min-height:24px}
</style><main><p>Native editable caret - synthetic source only</p><div id="editor" contenteditable>Native caret</div><p>One nonblinking, source-colored glyph edge.</p><p>No selection highlight, IME, or control caret.</p></main>`,
	"https://fixture.invalid/editable-caret-capture",
);
try {
	documentStyles(tree).setViewport(640, 220);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const reference = tree.reference(editor);
	const actions = documentInteractions(tree);
	actions.focus.focus(reference);
	const captures = [];
	for (const phase of [
		"before",
		"filled",
		"typed",
		"covered",
		"noncollapsed",
		"blurred",
	]) {
		if (phase === "filled") actions.fill(reference, "Native caret");
		if (phase === "typed") actions.keyboard.type("!");
		if (phase === "covered") {
			const rect = rangeClientRects(
				domRangeOwner(tree).selection.getRangeAt(0),
			)[0];
			const cover = tree.createElement("div");
			tree.setAttribute(cover, "id", "cover");
			tree.setAttribute(
				cover,
				"style",
				`position:absolute;left:${rect.x - 2}px;top:${rect.y - 2}px;width:7px;height:${rect.height + 4}px;background:#d03050;z-index:1`,
			);
			tree.append(tree.get(editor).parent as number, cover);
		}
		if (phase === "noncollapsed") {
			const cover = new DocumentQueries(tree).querySelector("#cover");
			if (cover !== null) tree.remove(cover);
			const text = tree.get(editor).children[0];
			domRangeOwner(tree).selection.setBaseAndExtent(text, 0, text, 6);
		}
		if (phase === "blurred") {
			const text = tree.get(editor).children[0];
			domRangeOwner(tree).selection.collapse(text, tree.get(text).data.length);
			actions.focus.focus(null);
		}
		const raster = rasterizeDocument(tree);
		const bytes = encodePng(raster.image);
		const filename = `${phase}.png`;
		writeFileSync(join(directory, filename), bytes, {
			flag: "wx",
			mode: 0o600,
		});
		const owner = existingDomRangeOwner(tree);
		captures.push({
			phase,
			filename,
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			width: raster.image.width,
			height: raster.image.height,
			editor: documentGeometry(tree).getBoundingClientRect(editor),
			metrics: raster.metrics,
			state: {
				activeElement: tree.activeElement,
				ownerExists: owner !== undefined,
				anchor: owner?.selection.anchor ?? null,
				focus: owner?.selection.focus ?? null,
				selectionType: owner?.selection.type ?? "None",
				text: tree.textContent(editor),
			},
		});
	}
	const report = {
		generatedAt: new Date().toISOString(),
		command: `node dist/scripts/capture-editable-caret.js ${directory}`,
		source: "synthetic-native-document",
		runtime: false,
		capabilities: editableCaretCapabilities,
		captures,
	};
	writeFileSync(
		join(directory, "evidence.json"),
		`${JSON.stringify(report, null, 2)}\n`,
		{ flag: "wx", mode: 0o600 },
	);
	console.log(
		JSON.stringify(
			captures.map(({ phase, bytes, width, height, metrics }) => ({
				phase,
				bytes,
				width,
				height,
				status: metrics.caretStatus,
			})),
			null,
			2,
		),
	);
} finally {
	tree.close();
}
