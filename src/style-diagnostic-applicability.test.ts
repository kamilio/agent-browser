import { afterEach, expect, it } from "vitest";
import { controlChecked } from "./controls.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const pageUrl = "https://fixture.invalid/style-diagnostics";
const unsupported = "animation-name:spin";
const propertyIssue = "unimplemented-css-property";
const baseCss = "html,body{margin:0;padding:0;font-size:8px;line-height:12px}";
const content = '<div id="target">Target</div>';
const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
const controllers: AbortController[] = [];

afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function inspect(tree: DocumentTree) {
	const styles = documentStyles(tree);
	styles.setViewport(800, 700);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, styles, id };
}

function fixture(css: string, markup = content) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}</style><style id="sheet">${css}</style>${markup}`,
		pageUrl,
	);
	documents.push(tree);
	return inspect(tree);
}

function response(url: string, text: string, type: string): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

async function loadedFixture(
	markup: string,
	sheets: Readonly<Record<string, string>> = {},
) {
	const controller = new AbortController();
	controllers.push(controller);
	const requests: string[] = [];
	const tree = await loadBrowserDocument(
		response(
			pageUrl,
			`<!doctype html><style>${baseCss}</style>${markup}${content}`,
			"text/html",
		),
		{
			tabId: "style-diagnostics",
			signal: controller.signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 256,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
			initializeDocument: (document) => documents.push(document),
			fetchStylesheetWithPolicy: async (url) => {
				requests.push(url);
				if (!Object.hasOwn(sheets, url))
					throw new Error("Synthetic missing stylesheet");
				return {
					response: response(url, sheets[url], "text/css"),
					type: "basic",
				};
			},
		},
	);
	return { ...inspect(tree), requests };
}

function expectLayoutAllowed(tree: DocumentTree) {
	expect(buildFormattingTree(tree).issues).toEqual({});
	const layout = layoutDocument(tree);
	expect(layout.boxes.length).toBeGreaterThan(0);
	expect(layout.contexts.some((context) => context.glyphs.length > 0)).toBe(
		true,
	);
}

function expectLayoutBlocked(tree: DocumentTree, issue: string, count = 1) {
	expect(buildFormattingTree(tree).issues[`css:${issue}`]).toBe(count);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
}

it.each([
	["unmatched rule", `.missing{${unsupported}}`],
	["print media", `@media print{#target{${unsupported}}}`],
	[
		"inactive viewport media",
		`@media (min-width:1000px){#target{${unsupported}}}`,
	],
	[
		"nested media conjunction",
		`@media screen{@media (max-width:400px){#target{${unsupported}}}}`,
	],
])(
	"retains raw diagnostics from %s without rejecting native layout",
	(_name, css) => {
		const { tree, styles } = fixture(css);
		expect(styles.metrics().issues[propertyIssue]).toBe(1);
		expect(styles.metrics().applicableIssues).toEqual({});
		expectLayoutAllowed(tree);
	},
);

it.each([
	["unsupported-only", unsupported],
	["mixed declarations", `display:block;${unsupported}`],
	["hidden node", `display:none;${unsupported}`],
	["overridden declaration", `${unsupported};animation-name:none!important`],
])("keeps matching %s diagnostics conservative", (_name, declarations) => {
	const { tree, styles } = fixture(`#target{${declarations}}`);
	const count = declarations.includes("animation-name:none") ? 2 : 1;
	expect(styles.metrics().issues[propertyIssue]).toBe(count);
	expect(styles.metrics().applicableIssues[propertyIssue]).toBe(count);
	expectLayoutBlocked(tree, propertyIssue, count);
});

it("counts each applicable rule once rather than once for every matched node", () => {
	const { tree, styles } = fixture(
		`.matched{${unsupported}} .missing{${unsupported}}`,
		'<div class="matched">One</div><div class="matched">Two</div><div class="matched">Three</div>',
	);
	expect(styles.metrics().issues[propertyIssue]).toBe(2);
	expect(styles.metrics().applicableIssues[propertyIssue]).toBe(1);
	expectLayoutBlocked(tree, propertyIssue);
});

it.each([".missing:unknown-diagnostic-pseudo", "[data-state=]"])(
	"treats unresolved selector %s conservatively",
	(selector) => {
		const { tree, styles } = fixture(`${selector}{${unsupported}}`);
		expect(styles.metrics().issues[propertyIssue]).toBe(1);
		expect(styles.metrics().applicableIssues[propertyIssue]).toBe(1);
		expect(
			styles.metrics().applicableIssues[
				"unimplemented-or-invalid-css-selector"
			],
		).toBe(1);
		expectLayoutBlocked(tree, "unimplemented-or-invalid-css-selector");
	},
);

it.each([
	[
		"inactive global",
		"@media print{@unknown-diagnostic-rule { value:1 }}",
		false,
	],
	["active global", "@unknown-diagnostic-rule { value:1 }", true],
])("scopes %s at-rule diagnostics to supported media", (_name, css, active) => {
	const { tree, styles } = fixture(css);
	const issue = "unimplemented-css-at-rule";
	expect(styles.metrics().issues[issue]).toBe(1);
	expect(styles.metrics().applicableIssues[issue] ?? 0).toBe(active ? 1 : 0);
	if (active) expectLayoutBlocked(tree, issue);
	else expectLayoutAllowed(tree);
});

it("keeps unknown media conservative rather than proving it inactive", () => {
	const { tree, styles } = fixture(
		`@media (unknown-diagnostic-feature:1){#target{${unsupported}}}`,
	);
	const issue = "unimplemented-or-invalid-media-query";
	expect(styles.metrics().issues[propertyIssue]).toBe(1);
	expect(styles.metrics().applicableIssues[issue]).toBeGreaterThan(0);
	expectLayoutBlocked(tree, issue, styles.metrics().applicableIssues[issue]);
});

it.each([
	`.missing{${unsupported}; /* unterminated`,
	`@media print{.missing{${unsupported}; /* unterminated`,
])("does not suppress ambiguous scanner damage: %s", (css) => {
	const { tree, styles } = fixture(css);
	const issue = "unterminated-css-comment";
	expect(styles.metrics().issues[issue]).toBeGreaterThan(0);
	expect(styles.metrics().applicableIssues[issue]).toBeGreaterThan(0);
	expectLayoutBlocked(tree, issue, styles.metrics().applicableIssues[issue]);
});

it.each([false, true])(
	"preserves existing supports suppression (active: %s)",
	(active) => {
		const condition = active ? "display:block" : unsupported;
		const { tree, styles } = fixture(
			`@supports (${condition}){#target{${unsupported}}}`,
		);
		expect(styles.metrics().issues[propertyIssue] ?? 0).toBe(active ? 1 : 0);
		expect(styles.metrics().applicableIssues[propertyIssue] ?? 0).toBe(
			active ? 1 : 0,
		);
		if (active) expectLayoutBlocked(tree, propertyIssue);
		else expectLayoutAllowed(tree);
	},
);

it.each(["style", "link"] as const)(
	"conjoins %s media and imported media without losing raw counts",
	async (kind) => {
		const rootUrl = "https://fixture.invalid/root.css";
		const childUrl = "https://fixture.invalid/child.css";
		const leafUrl = "https://fixture.invalid/leaf.css";
		const rootText = '@import "child.css" (max-width:1000px);';
		const root =
			kind === "style"
				? `<style media="(min-width:600px)">${rootText}</style>`
				: '<link rel="stylesheet" href="/root.css" crossorigin media="(min-width:600px)">';
		const { tree, styles, requests } = await loadedFixture(root, {
			[rootUrl]: rootText,
			[childUrl]: '@import "leaf.css" (min-height:600px);',
			[leafUrl]: `#target{${unsupported}}`,
		});
		for (const [width, height, active] of [
			[500, 700, false],
			[800, 700, true],
			[1100, 700, false],
			[800, 500, false],
			[800, 700, true],
		] as const) {
			styles.setViewport(width, height);
			expect(styles.metrics().issues[propertyIssue]).toBe(1);
			expect(styles.metrics().applicableIssues[propertyIssue] ?? 0).toBe(
				active ? 1 : 0,
			);
			if (active) expectLayoutBlocked(tree, propertyIssue);
			else expectLayoutAllowed(tree);
		}
		expect(requests).toEqual(
			kind === "style" ? [childUrl, leafUrl] : [rootUrl, childUrl, leafUrl],
		);
	},
);

it("keeps inline declaration errors applicable even when the node is hidden", () => {
	const { tree, styles } = fixture(
		"",
		`<div style="display:none;${unsupported}">Hidden</div>${content}`,
	);
	expect(styles.metrics().issues[propertyIssue]).toBe(1);
	expect(styles.metrics().applicableIssues[propertyIssue]).toBe(1);
	expectLayoutBlocked(tree, propertyIssue);
});

it("keeps stylesheet load failures active even on a print-only link", async () => {
	const { tree, styles, requests } = await loadedFixture(
		'<link rel="stylesheet" href="/missing.css" crossorigin media="print">',
	);
	expect(requests).toEqual(["https://fixture.invalid/missing.css"]);
	expect(styles.metrics().issues["stylesheet-load-failed"]).toBe(1);
	expect(styles.metrics().applicableIssues["stylesheet-load-failed"]).toBe(1);
	expectLayoutBlocked(tree, "stylesheet-load-failed");
});

it("invalidates applicability after selector, DOM and stylesheet text changes", () => {
	const { tree, styles, id } = fixture(`.matched{${unsupported}}`);
	expectLayoutAllowed(tree);
	tree.setAttribute(id("#target"), "class", "matched");
	expectLayoutBlocked(tree, propertyIssue);
	tree.setAttribute(id("#target"), "class", "other");
	expectLayoutAllowed(tree);
	const added = tree.createElement("div", { class: "matched" });
	tree.append(id("body"), added);
	expectLayoutBlocked(tree, propertyIssue);
	tree.remove(added);
	expectLayoutAllowed(tree);
	tree.setTextContent(id("#sheet"), `#target{${unsupported}}`);
	expectLayoutBlocked(tree, propertyIssue);
	tree.setTextContent(id("#sheet"), "#target{display:block}");
	expect(styles.metrics().issues[propertyIssue]).toBeUndefined();
	expectLayoutAllowed(tree);
});

it("recomputes diagnostic selector matches after genuine inline CSSOM mutations", () => {
	const { tree, styles, id } = fixture(`[style*="width"]{${unsupported}}`);
	const inline = new InlineStyles(tree, {
		createHostObject(definition: ScriptHostObjectDefinition): object {
			const object = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, descriptor);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	});
	const style = inline.get(id("#target")) as {
		setProperty(name: string, value: string): void;
		removeProperty(name: string): string;
	};
	expectLayoutAllowed(tree);
	style.setProperty("width", "40px");
	expect(styles.box(id("#target")).width).toBe("40px");
	expectLayoutBlocked(tree, propertyIssue);
	expect(style.removeProperty("width")).toBe("40px");
	expect(styles.metrics().issues[propertyIssue]).toBe(1);
	expect(styles.metrics().applicableIssues[propertyIssue]).toBeUndefined();
	expectLayoutAllowed(tree);
});

it("returns frozen, stable raw and applicable diagnostic snapshots", () => {
	const { tree, styles, id } = fixture(`.matched{${unsupported}}`);
	const before = styles.metrics();
	expect(Object.isFrozen(before)).toBe(true);
	expect(Object.isFrozen(before.issues)).toBe(true);
	expect(Object.isFrozen(before.applicableIssues)).toBe(true);
	expect(before.issues[propertyIssue]).toBe(1);
	expect(before.applicableIssues).toEqual({});
	tree.setAttribute(id("#target"), "class", "matched");
	const after = styles.metrics();
	expect(after.applicableIssues[propertyIssue]).toBe(1);
	expect(Object.isFrozen(after.applicableIssues)).toBe(true);
	expect(before.applicableIssues).toEqual({});
	expect(before.issues[propertyIssue]).toBe(1);
});

it.each(["maxRules", "maxDeclarations", "maxCodeUnits", "maxWork"] as const)(
	"does not bypass %s caps for unsupported unmatched rules",
	(limit) => {
		const tree = parseHtmlDocument(
			`<style>.missing{${unsupported}} .absent{${unsupported}}</style>${content}`,
			pageUrl,
		);
		documents.push(tree);
		const styles = new DocumentStyles(tree, { [limit]: 1 });
		expect(() => styles.metrics()).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("preserves native formatting and layout work limits after diagnostics are filtered", () => {
	const { tree } = fixture(`.missing{${unsupported}}`);
	expectLayoutAllowed(tree);
	expect(() => buildFormattingTree(tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("clicks a native checkbox despite unmatched and print-only CSS diagnostics", async () => {
	const html = `<!doctype html><style>${baseCss}.future{${unsupported}} @media print{#target{${unsupported}}}</style><input id="target" type="checkbox">`;
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				if (request.url !== pageUrl)
					throw new Error("Unexpected in-memory request");
				return response(request.url, html, "text/html");
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, pageUrl);
	const page = session.page(tab.id);
	const { tree, styles, id } = inspect(page.document);
	const targetId = id("#target");
	const reference = tree.reference(targetId);
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(targetId, type, () =>
			events.push(type),
		);
	expect(controlChecked(tree, targetId)).toBe(false);
	await session.click(tab.id, reference);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(controlChecked(tree, targetId)).toBe(true);
	expect(styles.metrics().issues[propertyIssue]).toBe(2);
	expect(styles.metrics().applicableIssues).toEqual({});
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(
		layoutDocument(tree)
			.text.contexts.flatMap((context) => context.fragments)
			.some(
				(fragment) =>
					fragment.ref === reference &&
					fragment.width > 0 &&
					fragment.height > 0,
			),
	).toBe(true);
	tree.setAttribute(targetId, "class", "future");
	expect(styles.metrics().applicableIssues[propertyIssue]).toBe(1);
	await expect(session.click(tab.id, reference)).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(controlChecked(tree, targetId)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([pageUrl]);
});
