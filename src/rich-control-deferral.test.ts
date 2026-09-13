import { afterEach, expect, it } from "vitest";
import { describeControl } from "./control-rendering.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	markup = '<button id="target" style="position:absolute"><span>Rich</span></button>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}fieldset{border:none;padding:0;margin:0}</style>${markup}`,
		"https://fixture.invalid/rich-control-deferral",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(240, 160);
	const target = queries.querySelector("#target");
	if (target === null) throw new Error("Missing rich-control fixture");
	return { tree, queries, target, reference: tree.reference(target) };
}

it.each([
	"<span>Rich</span>",
	'<img alt="Image">',
	"<svg><title>Icon</title></svg>",
	"<span hidden>Hidden</span>Text",
])(
	"defers rather than flattens positioned rich button content: %s",
	(content) => {
		const page = fixture(
			`<button id="target" style="position:absolute">${content}</button>`,
		);
		const revision = page.tree.revision;
		const source = serializeHtml(page.tree);
		expect(describeControl(page.tree, page.target, 8)).toBeUndefined();
		const formatting = buildFormattingTree(page.tree);
		const target = formatting.nodes.filter(
			(node) => node.ref === page.reference,
		);
		expect(target).toHaveLength(1);
		expect(target[0]).toMatchObject({
			kind: "deferred",
			deferredReason: "element-layout-not-supported",
			children: [],
		});
		expect(target[0].control).toBeUndefined();
		expect(formatting.issues["element-layout-not-supported"]).toBe(1);
		expect(formatting.metrics.deferredSubtrees).toBe(1);
		expect(page.tree.revision).toBe(revision);
		expect(serializeHtml(page.tree)).toBe(source);
	},
);

it.each(["Text", "<!-- comment -->Text", ""])(
	"preserves simple software button rendering: %s",
	(content) => {
		const page = fixture(`<button id="target">${content}</button>`);
		expect(describeControl(page.tree, page.target, 8)?.kind).toBe("button");
		const formatting = buildFormattingTree(page.tree);
		expect(formatting.issues).toEqual({});
		expect(
			formatting.nodes.find((node) => node.ref === page.reference),
		).toMatchObject({ kind: "replaced", control: { kind: "button" } });
	},
);

it.each(["geometry", "hit testing", "raster"])(
	"does not admit unsupported rich content to %s",
	(operation) => {
		const page = fixture();
		const inspect = () => {
			if (operation === "geometry")
				return documentGeometry(page.tree).getBoundingClientRect(page.target);
			if (operation === "hit testing")
				return documentHitTesting(page.tree).elementFromPoint(1, 1);
			return rasterizeDocument(page.tree);
		};
		expect(inspect).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it("retains fieldset ownership and sibling diagnostics around a rich button", () => {
	const page = fixture(
		'<fieldset><input id="search"><button id="target"><span>Search</span></button></fieldset><p id="tail">Tail</p>',
	);
	const formatting = buildFormattingTree(page.tree);
	const search = page.queries.querySelector("#search");
	const tail = page.queries.querySelector("#tail");
	if (search === null || tail === null) throw new Error("Missing siblings");
	expect(
		formatting.nodes.some((node) => node.fieldsetContent !== undefined),
	).toBe(true);
	expect(
		formatting.nodes.find((node) => node.ref === page.tree.reference(search)),
	).toMatchObject({ kind: "replaced", control: { kind: "text" } });
	expect(
		formatting.nodes.some((node) => node.ref === page.tree.reference(tail)),
	).toBe(true);
	expect(formatting.metrics.deferredSubtrees).toBe(0);
	expect(
		formatting.nodes.find((node) => node.ref === page.reference),
	).toMatchObject({ kind: "block", independentContext: true });
});

it("invalidates plain-to-rich-to-plain descriptor and formatting state", () => {
	const page = fixture('<button id="target">Simple</button>');
	expect(buildFormattingTree(page.tree).issues).toEqual({});
	const child = page.tree.createElement("span");
	page.tree.append(page.target, child);
	expect(describeControl(page.tree, page.target, 8)).toBeUndefined();
	const formatting = buildFormattingTree(page.tree);
	expect(formatting.issues).toEqual({});
	expect(
		formatting.nodes.find((node) => node.ref === page.reference),
	).toMatchObject({ kind: "block", independentContext: true });
	expect(
		formatting.nodes.some((node) => node.ref === page.tree.reference(child)),
	).toBe(true);
	page.tree.setTextContent(page.target, "Simple again");
	expect(describeControl(page.tree, page.target, 8)?.text).toBe("Simple again");
	expect(buildFormattingTree(page.tree).issues).toEqual({});
});

it("does not produce a deferred node for a hidden rich button", () => {
	const page = fixture('<button id="target" hidden><span>Rich</span></button>');
	const formatting = buildFormattingTree(page.tree);
	expect(formatting.issues).toEqual({});
	expect(formatting.nodes.some((node) => node.ref === page.reference)).toBe(
		false,
	);
});

it("keeps foreign same-name elements out of software-control description", () => {
	const page = fixture(
		'<svg><button id="target"><title>Foreign</title></button></svg>',
	);
	expect(describeControl(page.tree, page.target, 8)).toBeUndefined();
});

it.each(["descriptor", "formatting"])(
	"preserves resource-limit errors in %s",
	(operation) => {
		const page = fixture(`<button id="target">${"x".repeat(4097)}</button>`);
		const inspect = () =>
			operation === "descriptor"
				? describeControl(page.tree, page.target, 8)
				: buildFormattingTree(page.tree);
		expect(inspect).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("retains formatting budgets while representing a rich button as deferred", () => {
	const page = fixture();
	expect(() => buildFormattingTree(page.tree, { maxBoxes: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
