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
	throw Error("Provide one new capture output directory");
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
	css = "",
	content = "NATIVE TEXT\nSELECT SPACE\nTHIRD LINE",
	extra = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}body{font-size:16px;line-height:20px}#editor{white-space:pre-wrap;color:navy;background:white;width:280px;min-height:80px}${css}</style><div id="editor" contenteditable>${content}</div>${extra}`,
		"https://fixture.invalid/editable-selection-capture",
	);
	documentStyles(tree).setViewport(320, 180);
	const target = new DocumentQueries(tree).querySelector("#editor");
	if (target === null) throw Error("Missing editor");
	const text = tree.get(target).children[0];
	const actions = documentInteractions(tree);
	actions.focus.focusElement(target, { preventScroll: true });
	const selection = domRangeOwner(tree).selection;
	selection.collapse(text, 0);
	return { tree, target, text, actions, selection };
}
const editor = fixture();
try {
	const prepared = prepareDocumentRaster(editor.tree);
	const revision = editor.tree.revision;
	const originalLayout = JSON.stringify(prepared.layout);
	save("01-collapsed-caret", prepared.rasterize());
	for (let index = 0; index < 6; index++)
		editor.actions.keyboard.press("Shift+ArrowRight");
	assert.equal(editor.selection.toString(), "NATIVE");
	const shifted = save("02-native-shift-arrow", prepared.rasterize());
	assert.equal(shifted.metrics.paintedSelectionGlyphs, 6);
	assert.equal(shifted.metrics.paintedCarets, 0);
	assert.ok(shifted.backgroundPixels > 0);
	editor.selection.setBaseAndExtent(editor.text, 7, editor.text, 25);
	const multiline = save("03-spaces-multiline", prepared.rasterize());
	assert.ok(multiline.metrics.paintedSelectionGlyphs > 6);
	save(
		"04-crop",
		prepared.rasterize({ clip: { x: 25, y: 15, width: 140, height: 45 } }),
	);
	assert.equal(editor.tree.revision, revision);
	assert.equal(JSON.stringify(prepared.layout), originalLayout);
	editor.selection.setBaseAndExtent(editor.text, 0, editor.text, 6);
	editor.actions.keyboard.type("EDITED");
	assert.ok(editor.tree.textContent(editor.target).startsWith("EDITED TEXT"));
	const replaced = save(
		"05-native-replacement",
		rasterizeDocument(editor.tree),
	);
	assert.equal(replaced.metrics.selectionStatus, "collapsed");
	assert.equal(replaced.backgroundPixels, 0);
} finally {
	editor.tree.close();
}
for (const position of ["relative", "fixed"]) {
	const item = fixture(
		`#editor{position:${position};left:20px;top:60px}`,
		"FLOW AND FIXED",
		'<div style="height:500px;width:500px"></div>',
	);
	try {
		item.selection.setBaseAndExtent(item.text, 0, item.text, 4);
		const prepared = prepareDocumentRaster(item.tree);
		save(`06-${position}-unscrolled`, prepared.rasterize());
		documentScroll(item.tree).to(10, 40);
		const scrolled = save(
			`07-${position}-scrolled`,
			rasterizeDocument(item.tree),
		);
		assert.equal(scrolled.metrics.paintedSelectionGlyphs, 4);
	} finally {
		item.tree.close();
	}
}
const covered = fixture(
	"#cover{position:absolute;left:0;top:0;width:280px;height:80px;background:lime;z-index:1}",
	"COVERED SELECTION",
	'<div id="cover"></div>',
);
try {
	covered.selection.setBaseAndExtent(covered.text, 0, covered.text, 7);
	const record = save("08-later-opaque-cover", rasterizeDocument(covered.tree));
	assert.equal(record.metrics.paintedSelectionGlyphs, 7);
	assert.equal(record.backgroundPixels, 0);
} finally {
	covered.tree.close();
}
const report = {
	date: new Date().toISOString(),
	base: "9751201b53bf146f1b258759c9a70a76b99cb531",
	profile:
		"fresh in-memory native keyboard/Range/raster fixtures; no runtime or external browser probes",
	capabilities: editableSelectionCapabilities,
	preparedSelectionOnlyLayoutUnchanged: true,
	records,
};
writeFileSync(
	join(directory, "evidence.json"),
	JSON.stringify(report, null, 2),
	{ flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
