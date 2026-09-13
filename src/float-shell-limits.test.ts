import { afterEach, expect, it } from "vitest";
import {
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const shells = [
	{
		kind: "flex",
		css: "#shell{display:flex}#content{width:36px}",
		markup: (content: string) =>
			`<div id="shell"><div id="content">${content}</div></div>`,
	},
	{
		kind: "grid",
		css: "#shell{display:grid;grid-template-columns:36px}",
		markup: (content: string) =>
			`<div id="shell"><div id="content">${content}</div></div>`,
	},
	{
		kind: "table",
		css: "#shell{border-spacing:0}td{padding:0;vertical-align:top}",
		markup: (content: string) =>
			`<table id="shell"><tr><td id="content">${content}</td></tr></table>`,
	},
];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:64px}#float{float:left;width:12px;height:16px}#shell{width:36px}.atom{display:inline-block;width:12px}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/float-shell-limits",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 96);
	return tree;
}

function expectFailure(
	tree: DocumentTree,
	code: "unsupported" | "resource-limit",
	options?: DocumentLayoutOptions,
	message?: RegExp,
) {
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree, options)).toThrow(
		expect.objectContaining({
			code,
			...(message ? { message: expect.stringMatching(message) } : {}),
		}),
	);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
}

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{ name: "text work", options: { text: { maxWork: 1 } } },
	{ name: "tokens", options: { text: { maxTokens: 1 } } },
	{ name: "combined lines", options: { text: { maxLines: 4 } } },
	{ name: "fragments", options: { text: { maxFragments: 1 } } },
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])(
	"enforces $name across float, shell and atomic owners without poisoning later layout",
	({ options }) => {
		const shell = shells[1];
		const tree = fixture(
			`<div id="float">FF</div><div id="outer">AA BB CC DD</div>${shell.markup('<span class="atom"><b>EE</b><br><b>GG</b></span>HH')}`,
			`${shell.css}main{width:36px}`,
		);
		expectFailure(tree, "resource-limit", options);
		const layout = layoutDocument(tree);
		expect(
			layout.contexts
				.flatMap((context) => context.glyphs)
				.filter((glyph) => glyph.character !== " "),
		).toHaveLength(16);
		expect(layout.metrics.lines).toBeGreaterThan(1);
		expect(Number.isSafeInteger(layout.metrics.work)).toBe(true);
		expect(layout.metrics.work).toBeGreaterThan(0);
	},
);

it.each(["float-first", "inline-block-first"])(
	"preserves the nesting ceiling through alternating %s owners ending in a shell",
	(order) => {
		const shell = shells[2];
		const wrappers =
			order === "float-first"
				? '<div class="nested-float"><div class="nested-atom">'
				: '<div class="nested-atom"><div class="nested-float">';
		const tree = fixture(
			`${wrappers.repeat(17)}${shell.markup("AA")}${"</div></div>".repeat(17)}`,
			`${shell.css}.nested-float{float:left;width:36px}.nested-atom{display:inline-block;width:36px}`,
		);
		expectFailure(tree, "resource-limit", undefined, /nesting limit/i);
	},
);

it("retains finite metrics and final text counts through nested shell merging", () => {
	const shell = shells[0];
	const tree = fixture(
		`<div class="outer"><div id="float">${shell.markup('<span class="atom">AA</span>BB')}</div><div id="text">CC DD</div></div>`,
		`${shell.css}.outer{display:inline-block;width:64px}#float{width:36px;height:auto}`,
	);
	const layout = layoutDocument(tree);
	for (const metrics of [
		layout.metrics,
		layout.text.metrics,
		layout.text.horizontal.metrics,
	])
		for (const value of Object.values(metrics)) {
			expect(Number.isSafeInteger(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(0);
		}
	expect(layout.metrics.work).toBeGreaterThan(0);
	const glyphs = layout.contexts.flatMap((context) => context.glyphs);
	const lines = layout.contexts.flatMap((context) => context.lines);
	const fragments = layout.contexts.flatMap((context) => context.fragments);
	expect(glyphs.filter((glyph) => glyph.character !== " ")).toHaveLength(8);
	expect(layout.metrics).toMatchObject({
		boxes: layout.boxes.length,
		glyphs: glyphs.length,
		lines: lines.length,
	});
	expect(layout.text.metrics).toMatchObject({
		glyphs: glyphs.length,
		lines: lines.length,
		fragments: fragments.length,
	});
	for (const box of layout.boxes)
		for (const value of [
			box.contentX,
			box.contentY,
			box.contentWidth,
			box.contentHeight,
			box.borderX,
			box.borderY,
		])
			expect(Number.isFinite(value)).toBe(true);
});

it.each([
	{ ...shells[0], profile: "flex row", extra: "" },
	{
		...shells[0],
		profile: "flex column",
		extra: "#shell{flex-direction:column}",
	},
	{ ...shells[1], profile: "grid item", extra: "" },
	{ ...shells[2], profile: "table cell", extra: "" },
])(
	"rejects a float inside a $profile child without a float resolution context",
	({ css, markup, extra }) => {
		const tree = fixture(
			`<div id="float"></div>${markup('<div class="child-float">AA</div>BB')}`,
			`${css}${extra}.child-float{float:right;width:12px;height:8px}`,
		);
		expectFailure(
			tree,
			"unsupported",
			undefined,
			/Float content requires coordinated page layout/,
		);
	},
);

it.each(shells)(
	"keeps a floating $kind container root explicitly unsupported",
	({ css, markup }) => {
		const tree = fixture(
			`${markup("AA")}<div>BB</div>`,
			`${css}#shell{float:left}`,
		);
		expectFailure(tree, "unsupported");
	},
);

it.each([
	{
		name: "logical float side",
		css: "#float{float:inline-start}",
		message: /Logical float placement/,
	},
	{
		name: "logical clear side",
		css: "#after{clear:inline-end}",
		message: /Logical float clearance/,
	},
])(
	"preserves the $name guard in a scope containing a shell",
	({ css, message }) => {
		const shell = shells[1];
		const tree = fixture(
			`<div id="float"></div>${shell.markup("AA")}<div id="after">BB</div>`,
			`${shell.css}${css}`,
		);
		expectFailure(tree, "unsupported", undefined, message);
	},
);

it.each(shells.filter((shell) => shell.kind !== "table"))(
	"does not silently admit clear on a deferred $kind shell",
	({ css, markup }) => {
		const tree = fixture(
			`<div id="float"></div>${markup("AA")}`,
			`${css}#shell{clear:both}`,
		);
		expectFailure(
			tree,
			"unsupported",
			undefined,
			/Clearance requires a supported block owner/,
		);
	},
);

it("coordinates physical clearance on a supported deferred table shell", () => {
	const shell = shells[2];
	const tree = fixture(
		`<div id="float"></div>${shell.markup("AA")}`,
		`${shell.css}#shell{clear:both}`,
	);
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	const layout = layoutDocument(tree);
	const table = layout.text.horizontal.formatting.nodes.find(
		(node) => node.display === "table",
	);
	expect(table).toBeDefined();
	const box = layout.boxes.find((candidate) => candidate.id === table?.id);
	expect(box).toMatchObject({ borderX: 0, borderY: 16, borderBoxWidth: 36 });
	const glyphs = layout.contexts.flatMap((context) => context.glyphs);
	expect(glyphs.map((glyph) => glyph.character).join("")).toBe("AA");
	for (const glyph of glyphs) expect(glyph.y).toBeGreaterThanOrEqual(16);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("preserves an independent unsupported CSS diagnostic beside a coordinated shell", () => {
	const shell = shells[0];
	const tree = fixture(
		`<div id="float"></div>${shell.markup("AA")}`,
		`${shell.css}#content{animation-name:spin}`,
	);
	expectFailure(tree, "unsupported");
});

it("does not route a positioned subtree's uncoordinated float through the outer shell coordinator", () => {
	const shell = shells[1];
	const tree = fixture(
		`<div id="float"></div>${shell.markup("AA")}<div id="positioned"><div class="child-float">BB</div>CC</div>`,
		`${shell.css}#positioned{position:absolute;left:0;top:40px;width:36px}.child-float{float:left;width:12px;height:8px}`,
	);
	expectFailure(tree, "unsupported");
});
