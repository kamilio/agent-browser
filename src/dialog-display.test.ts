import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}${css}</style>${markup}`,
		"https://fixture.invalid/dialog-display",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing dialog fixture ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(100, 100);
	return { tree, queries, id, styles };
}

it.each(["", "open", "false", "0"])(
	"uses boolean open presence rather than its value %j",
	(value) => {
		const { tree, id, styles } = fixture(
			`<dialog id="closed"></dialog><dialog id="opened" open="${value}"></dialog>`,
		);
		expect(styles.get(id("#closed"))).toMatchObject({
			display: "none",
			displayed: false,
			visible: false,
		});
		expect(tree.get(id("#opened")).attributes.open).toBe(value);
		expect(styles.get(id("#opened"))).toMatchObject({
			display: "block",
			displayed: true,
			visible: true,
		});
	},
);

it("invalidates cached dialog and descendant styles when open changes", () => {
	const { tree, id, styles } = fixture(
		`<dialog id="target"><div id="child">Inside</div></dialog>`,
	);
	const target = id("#target");
	const child = id("#child");
	for (const inline of ["", "display:revert"]) {
		tree.setAttribute(target, "style", inline);
		expect(styles.get(target).display).toBe("none");
		expect(styles.get(child)).toMatchObject({
			display: "block",
			displayed: false,
		});
		tree.setAttribute(target, "open", "false");
		expect(styles.get(target).display).toBe("block");
		expect(styles.get(child).displayed).toBe(true);
		tree.removeAttribute(target, "open");
		expect(styles.get(target).display).toBe("none");
		expect(styles.get(child).displayed).toBe(false);
	}
});

it.each([false, true])(
	"retains the hidden-attribute default with open=%s",
	(open) => {
		const { tree, id, styles } = fixture(
			`<dialog id="target" ${open ? "open" : ""} hidden="false"></dialog>`,
		);
		const target = id("#target");
		expect(styles.get(target).display).toBe("none");
		tree.removeAttribute(target, "hidden");
		expect(styles.get(target).display).toBe(open ? "block" : "none");
		tree.setAttribute(target, "hidden", "");
		expect(styles.get(target).display).toBe("none");
	},
);

it.each([
	["block", "block", "block"],
	["inline", "inline", "inline"],
	["none", "none", "none"],
	["revert", "none", "block"],
	["initial", "inline", "inline"],
	["unset", "inline", "inline"],
	["inherit", "block", "block"],
] as const)(
	"resolves stylesheet and inline display:%s against dialog defaults",
	(value, closedDisplay, openDisplay) => {
		for (const inline of [false, true]) {
			for (const open of [false, true]) {
				const { id, styles } = fixture(
					`<main><dialog id="target" ${open ? "open" : ""} style="${inline ? `display:${value}` : ""}"></dialog></main>`,
					inline ? "" : `#target{display:${value}}`,
				);
				const expected = open ? openDisplay : closedDisplay;
				expect(styles.get(id("#target"))).toMatchObject({
					display: expected,
					displayed: expected !== "none",
				});
			}
		}
	},
);

it.each([false, true])(
	"allows ordinary author cascade overrides of hidden dialogs, important=%s",
	(important) => {
		const { tree, id, styles } = fixture(
			`<dialog id="target" open hidden style="display:none"></dialog>`,
			`#target{display:block${important ? "!important" : ""}}`,
		);
		const target = id("#target");
		expect(styles.get(target).display).toBe(important ? "block" : "none");
		tree.removeAttribute(target, "style");
		expect(styles.get(target).display).toBe("block");
		tree.removeAttribute(target, "open");
		expect(styles.get(target).display).toBe("block");
	},
);

it("omits closed dialogs and descendants from formatting and snapshots, not queries", () => {
	const { tree, queries, id, styles } = fixture(
		`<dialog id="target"><div id="child"><button id="button">Inside dialog</button></div></dialog><p>Outside dialog</p>`,
	);
	const formatting = buildFormattingTree(tree);
	expect(formatting.metrics.deferredSubtrees).toBe(0);
	expect(formatting.issues).toEqual({});
	for (const selector of ["#target", "#child", "#button"]) {
		const target = id(selector);
		expect(queries.querySelector(selector)).toBe(target);
		expect(styles.get(target).displayed).toBe(false);
		expect(
			formatting.nodes.some((node) => node.ref === tree.reference(target)),
		).toBe(false);
	}
	expect(
		formatting.nodes.some((node) => node.text?.includes("Inside dialog")),
	).toBe(false);
	expect(
		formatting.nodes.some((node) => node.text?.includes("Outside dialog")),
	).toBe(true);
	expect(
		snapshotDocument(tree).entries.some((entry) =>
			entry.name.includes("Inside dialog"),
		),
	).toBe(false);
});

it("does not expose an open dialog beneath a closed dialog ancestor", () => {
	const { tree, id, styles } = fixture(
		`<dialog id="outer"><dialog id="inner" open><button id="child">Nested</button></dialog></dialog>`,
	);
	expect(styles.get(id("#inner"))).toMatchObject({
		display: "block",
		displayed: false,
	});
	expect(styles.get(id("#child")).displayed).toBe(false);
	const formatting = buildFormattingTree(tree);
	expect(formatting.metrics.deferredSubtrees).toBe(0);
	expect(formatting.issues).toEqual({});
	const geometry = documentGeometry(tree);
	expect(geometry.getClientRects(id("#child"))).toEqual([]);
	tree.setAttribute(id("#outer"), "open", "");
	expect(styles.get(id("#inner")).displayed).toBe(true);
	expect(buildFormattingTree(tree).issues).toEqual({
		"element-layout-not-supported": 1,
	});
	expect(() => geometry.getClientRects(id("#child"))).toThrow();
	tree.removeAttribute(id("#outer"), "open");
	expect(geometry.getClientRects(id("#child"))).toEqual([]);
	expect(findClickPoint(tree, id("#child")).blocked).toBe("no-box");
});

it("invalidates geometry and actionability when visible content enters a closed dialog", () => {
	const { tree, id } = fixture(
		`<main id="parent"><button id="button">Move me</button><dialog id="target"></dialog></main>`,
		"button{display:block;width:40px;height:20px}",
	);
	const button = id("#button");
	const geometry = documentGeometry(tree);
	const actions = documentInteractions(tree);
	expect(geometry.getBoundingClientRect(button).width).toBe(40);
	expect(findClickPoint(tree, button).point).toBeDefined();
	tree.append(id("#target"), button);
	expect(geometry.getClientRects(button)).toEqual([]);
	expect(geometry.getBoundingClientRect(button)).toMatchObject({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
	expect(findClickPoint(tree, button).blocked).toBe("no-box");
	expect(() => actions.click(tree.reference(button))).toThrow(/hidden/i);
	tree.append(id("#parent"), button);
	expect(geometry.getBoundingClientRect(button).width).toBe(40);
	expect(findClickPoint(tree, button).point).toBeDefined();
});

it.each(["open", 'style="display:block"'])(
	"preserves deferred rendering for visible dialogs with %s",
	(attributes) => {
		const { tree, id } = fixture(
			`<dialog id="target" ${attributes}><div id="child">Unsupported</div></dialog>`,
		);
		const formatting = buildFormattingTree(tree);
		expect(formatting.metrics.deferredSubtrees).toBe(1);
		expect(formatting.issues["element-layout-not-supported"]).toBe(1);
		expect(
			formatting.nodes.find(
				(node) => node.ref === tree.reference(id("#target")),
			),
		).toMatchObject({
			kind: "deferred",
			deferredReason: "element-layout-not-supported",
		});
		expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML dialog defaults to same-name nodes in %s",
	(namespace) => {
		const { tree, id, styles } = fixture(`<main id="parent"></main>`);
		const target = tree.createParserElement("dialog", {}, namespace);
		tree.append(id("#parent"), target);
		expect(tree.get(target).namespaceURI).toBe(namespace);
		expect(styles.get(target).display).toBe("inline");
		tree.setAttribute(target, "open", "");
		expect(styles.get(target).display).toBe("inline");
		tree.setAttribute(target, "style", "display:revert");
		expect(styles.get(target).display).toBe("inline");
		tree.removeAttribute(target, "open");
		expect(styles.get(target).display).toBe("inline");
	},
);
