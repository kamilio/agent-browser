import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type DocumentRaster,
	prepareDocumentRaster,
	rasterizeDocument,
} from "../src/document-raster.js";
import { documentScroll } from "../src/document-scroll.js";
import { domRangeOwner } from "../src/dom-range.js";
import {
	editableSelectionBackground,
	editableSelectionCapabilities,
} from "../src/editable-selection.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { encodePng } from "../src/png.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const directory = process.argv[2];
if (!directory || process.argv.length !== 3)
	throw Error("Provide one new native capture output directory");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const records: unknown[] = [];
function save(name: string, raster: Readonly<DocumentRaster>) {
	const png = encodePng(raster.image);
	let backgroundPixels = 0;
	for (let offset = 0; offset < raster.image.pixels.length; offset += 4)
		if (
			editableSelectionBackground.every(
				(value, channel) => raster.image.pixels[offset + channel] === value,
			)
		)
			backgroundPixels++;
	const filename = join(directory, `${name}.png`);
	writeFileSync(filename, png, { flag: "wx", mode: 0o600 });
	const record = {
		name,
		filename,
		sha256: createHash("sha256").update(png).digest("hex"),
		backgroundPixels,
		clip: raster.clip,
		metrics: raster.metrics,
	};
	records.push(record);
	return record;
}
function fixture(
	content = '<b id="first">hello</b><i id="last">world</i>',
	css = "",
	extra = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}body{font-size:16px;line-height:20px}#editor{white-space:pre-wrap;color:navy;width:300px;min-height:80px}#first{color:maroon}#last{color:navy}${css}</style><div id="editor" contenteditable>${content}</div>${extra}`,
		"https://fixture.invalid/editable-selection-mixed-capture",
	);
	documentStyles(tree).setViewport(320, 180);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	const first = tree.get(id("#first")).children[0];
	const last = tree.get(id("#last")).children[0];
	const root = id("#editor");
	const actions = documentInteractions(tree);
	actions.focus.focusElement(root, { preventScroll: true });
	const selection = domRangeOwner(tree).selection;
	return { tree, first, last, root, actions, selection };
}
const editor = fixture();
try {
	editor.selection.collapse(editor.first, 4);
	save("01-native-caret", rasterizeDocument(editor.tree));
	editor.actions.keyboard.press("Shift+ArrowRight");
	editor.actions.keyboard.press("Shift+ArrowRight");
	assert.equal(editor.selection.toString(), "ow");
	assert.notEqual(
		editor.selection.getRangeAt(0).start.node,
		editor.selection.getRangeAt(0).end.node,
	);
	const prepared = prepareDocumentRaster(editor.tree);
	const revision = editor.tree.revision;
	const layout = JSON.stringify(prepared.layout);
	const forward = save("02-native-mixed-shift", prepared.rasterize());
	assert.equal(forward.metrics.paintedSelectionGlyphs, 2);
	assert.equal(forward.metrics.paintedCarets, 0);
	assert.ok(forward.backgroundPixels > 0);
	editor.selection.setBaseAndExtent(editor.last, 1, editor.first, 4);
	const backward = save("03-backward-same-selection", prepared.rasterize());
	assert.equal(backward.sha256, forward.sha256);
	editor.selection.setBaseAndExtent(editor.first, 1, editor.last, 3);
	const widened = save("04-prepared-widened-mixed", prepared.rasterize());
	assert.equal(widened.metrics.paintedSelectionGlyphs, 7);
	assert.equal(editor.tree.revision, revision);
	assert.equal(JSON.stringify(prepared.layout), layout);
	save(
		"05-prepared-crop",
		prepared.rasterize({ clip: { x: 18, y: 2, width: 85, height: 25 } }),
	);
	editor.selection.setBaseAndExtent(editor.first, 4, editor.last, 1);
	editor.actions.keyboard.type("Q");
	assert.equal(editor.tree.textContent(editor.root), "hellQorld");
	assert.equal(editor.tree.get(editor.root).children.length, 2);
	const replaced = save(
		"06-native-mixed-replacement",
		rasterizeDocument(editor.tree),
	);
	assert.equal(replaced.metrics.selectionStatus, "collapsed");
	assert.equal(replaced.backgroundPixels, 0);
} finally {
	editor.tree.close();
}
const scenarios = [
	{
		name: "07-intermediate-font-spaces",
		content:
			'<span id="first">ABC</span><span style="font-size:24px;line-height:30px;padding:8px;color:green"> MID </span><span id="last">DEF</span>',
		css: "",
		extra: "",
		start: 2,
		end: 1,
	},
	{
		name: "08-multiline-source-breaks",
		content:
			'<span id="first">A \n</span><span>\n B</span><span id="last">C\n</span>',
		css: "",
		extra: "",
		start: 1,
		end: 2,
	},
	{
		name: "09-protected-intermediate-skip",
		content:
			'<span id="first">ABC</span><span contenteditable="false">LOCKED</span><span id="last">DEF</span>',
		css: "",
		extra: "",
		start: 1,
		end: 2,
	},
	{
		name: "10-later-opaque-cover",
		content: '<span id="first">ABC</span><span id="last">DEF</span>',
		css: "#cover{position:absolute;left:0;top:0;width:300px;height:80px;background:lime;z-index:2}",
		extra: '<div id="cover"></div>',
		start: 1,
		end: 2,
	},
	{
		name: "11-mixed-flow-fixed",
		content: '<span id="first">ABC</span><span id="last">DEF</span>',
		css: "#last{position:fixed;left:200px;top:80px}",
		extra: '<div style="width:500px;height:500px"></div>',
		start: 2,
		end: 1,
	},
];
for (const scenario of scenarios) {
	const item = fixture(scenario.content, scenario.css, scenario.extra);
	try {
		item.selection.setBaseAndExtent(
			item.first,
			scenario.start,
			item.last,
			scenario.end,
		);
		const record = save(scenario.name, rasterizeDocument(item.tree));
		if (scenario.name.includes("protected")) {
			assert.equal(record.metrics.selectionStatus, "outside-editable");
			assert.equal(record.backgroundPixels, 0);
		} else {
			assert.ok(record.metrics.paintedSelectionGlyphs > 0);
			if (scenario.name.includes("opaque"))
				assert.equal(record.backgroundPixels, 0);
		}
		if (scenario.name.includes("flow-fixed")) {
			documentScroll(item.tree).to(10, 40);
			const scrolled = save(
				"12-mixed-flow-fixed-scrolled",
				rasterizeDocument(item.tree),
			);
			assert.equal(scrolled.metrics.paintedSelectionGlyphs, 1);
			assert.equal(scrolled.metrics.clippedSelectionGlyphs, 1);
		}
	} finally {
		item.tree.close();
	}
}
const evidence = {
	timestamp: new Date().toISOString(),
	base: "ffd9d1513455b7cc6d606f4e779fb2864a523e47",
	profile:
		"fresh native in-memory shared Range, keyboard, layout and raster fixtures; no released runtime or external browser probes",
	capabilities: editableSelectionCapabilities,
	assertions: {
		nativeMixedShift: true,
		nativeMixedReplacement: true,
		backwardPixelsIdentical: true,
		preparedSelectionOnlyLayoutUnchanged: true,
		protectedIntermediateSkipped: true,
		laterOpaqueContentCoversHighlights: true,
	},
	records,
};
writeFileSync(
	join(directory, "evidence.json"),
	JSON.stringify(evidence, null, 2),
	{ flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify(evidence, null, 2));
