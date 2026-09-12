import { afterEach, expect, it } from "vitest";
import { controlChecked } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	isAdvisoryFormattingIssue,
	resolveFormattingPageWidths,
} from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const discarded = "discarded-incomplete-css-rule";
const advisory = `css:${discarded}`;
const pageUrl = "https://fixture.invalid/css-recovery";
const base = "html,body{margin:0;padding:0;font-size:8px;line-height:12px}";
const targetCss = "#target{width:24px;height:16px;background:red}";
const tail = "<!-- https://fixture.invalid/trailing -->";
const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
});

function inspect(tree: DocumentTree) {
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(64, 48);
	return { tree, styles, id };
}

function fixture(css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${base}</style><style id="sheet">${css}</style><div id="target">ab</div>`,
		pageUrl,
	);
	documents.push(tree);
	return inspect(tree);
}

it("accepts the exact advisory code without deleting formatting evidence", () => {
	const { tree, styles } = fixture(`${targetCss}${tail}`);
	expect(isAdvisoryFormattingIssue(advisory)).toBe(true);
	expect(styles.metrics().issues).toEqual({ [discarded]: 1 });
	expect(styles.metrics().applicableIssues).toEqual({ [discarded]: 1 });
	const formatting = buildFormattingTree(tree);
	expect(formatting.issues).toEqual({ [advisory]: 1 });
	expect(resolveFormattingPageWidths(formatting).widths.length).toBeGreaterThan(
		0,
	);
	expect(layoutDocument(tree).boxes.length).toBeGreaterThan(0);
});

it.each([
	discarded,
	`${advisory}-extra`,
	` ${advisory}`,
	"css:Discarded-incomplete-css-rule",
])("rejects the near-miss advisory spelling %j", (code) => {
	expect(isAdvisoryFormattingIssue(code)).toBe(false);
	const { tree } = fixture(targetCss);
	const formatting = buildFormattingTree(tree);
	expect(() =>
		resolveFormattingPageWidths({ ...formatting, issues: { [code]: 1 } }),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	["#target{animation-name:spin}", "unimplemented-css-property"],
	["#target{width:bananas}", "unimplemented-or-invalid-css-value"],
	["[data-state=]{width:12px}", "unimplemented-or-invalid-css-selector"],
	['@import "missing.css";', "css-import-not-loaded"],
])(
	"does not let advisory recovery mask independent unsupported CSS in %j",
	(css, issue) => {
		const { tree, styles } = fixture(`${targetCss}${css}${tail}`);
		expect(styles.metrics().issues[discarded]).toBe(1);
		expect(styles.metrics().applicableIssues[issue]).toBe(1);
		expect(buildFormattingTree(tree).issues).toMatchObject({
			[advisory]: 1,
			[`css:${issue}`]: 1,
		});
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("preserves native geometry, raster pixels, hits and original DOM source", () => {
	const source = `<!--${targetCss}-->${tail}`;
	const recovered = fixture(source);
	const clean = fixture(targetCss);
	const target = recovered.id("#target");
	expect(recovered.tree.textContent(recovered.id("#sheet"))).toBe(source);
	const rect = documentGeometry(recovered.tree).getBoundingClientRect(target);
	expect(rect).toEqual(
		documentGeometry(clean.tree).getBoundingClientRect(clean.id("#target")),
	);
	expect(rect).toMatchObject({ width: 24, height: 16 });
	const options = { clip: { x: 0, y: 0, width: 64, height: 48 } };
	expect(rasterizeDocument(recovered.tree, options).image.pixels).toEqual(
		rasterizeDocument(clean.tree, options).image.pixels,
	);
	expect(
		documentHitTesting(recovered.tree).elementFromPoint(rect.x + 2, rect.y + 2),
	).toBe(target);
	expect(buildFormattingTree(recovered.tree).issues).toEqual({ [advisory]: 1 });
});

it("invalidates geometry, hit testing and diagnostics after stylesheet mutations", () => {
	const { tree, styles, id } = fixture(`${targetCss}${tail}`);
	const target = id("#target");
	const sheet = id("#sheet");
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	const before = styles.metrics();
	const rect = geometry.getBoundingClientRect(target);
	expect(hits.elementFromPoint(20, 4)).toBe(target);
	const builds = hits.metrics().builds;
	tree.setTextContent(
		sheet,
		"<!--#target{width:12px;height:16px;background:blue}-->",
	);
	expect(geometry.getBoundingClientRect(target).width).toBe(12);
	expect(hits.elementFromPoint(20, 4)).not.toBe(target);
	expect(hits.metrics().builds).toBeGreaterThan(builds);
	expect(styles.metrics().issues).toEqual({});
	expect(rect.width).toBe(24);
	expect(before.issues).toEqual({ [discarded]: 1 });
	expect(before.applicableIssues).toEqual({ [discarded]: 1 });
	expect(Object.isFrozen(before.issues)).toBe(true);
	expect(Object.isFrozen(before.applicableIssues)).toBe(true);
	tree.setTextContent(sheet, `${targetCss}#target{animation-name:spin}${tail}`);
	expect(() => geometry.getBoundingClientRect(target)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	tree.setTextContent(sheet, `${targetCss}${tail}`);
	expect(geometry.getBoundingClientRect(target).width).toBe(24);
	expect(hits.elementFromPoint(20, 4)).toBe(target);
	expect(styles.metrics().issues).toEqual({ [discarded]: 1 });
});

it.each([
	[64, 2],
	[128, 3],
])(
	"keeps raw counts and scopes applicable EOF diagnostics at width %i",
	(width, applicable) => {
		const source = `${targetCss}@media print{unfinished-print}@media screen{unfinished-screen}@media screen{@media (min-width:100px){unfinished-wide}}${tail}`;
		const { tree, styles } = fixture(source);
		styles.setViewport(width, 48);
		expect(styles.metrics().issues).toEqual({ [discarded]: 4 });
		expect(styles.metrics().applicableIssues).toEqual({
			[discarded]: applicable,
		});
		expect(buildFormattingTree(tree).issues).toEqual({
			[advisory]: applicable,
		});
		expect(layoutDocument(tree).boxes.length).toBeGreaterThan(0);
		styles.setViewport(width === 64 ? 128 : 64, 48);
		expect(styles.metrics().issues).toEqual({ [discarded]: 4 });
		expect(styles.metrics().applicableIssues).toEqual({
			[discarded]: width === 64 ? 3 : 2,
		});
	},
);

it.each(["maxCodeUnits", "maxWork"] as const)(
	"does not bypass stylesheet %s bounds by discarding marker tails",
	(limit) => {
		const source = `${targetCss}${tail.repeat(20)}`;
		const { tree } = fixture(source);
		const maximum =
			limit === "maxCodeUnits" ? base.length + source.length - 1 : 1;
		const styles = new DocumentStyles(tree, { [limit]: maximum });
		expect(() => styles.metrics()).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

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

it("clicks a native checkbox through mocked document and stylesheet imports and closes owners", async () => {
	const rootUrl = "https://fixture.invalid/root.css";
	const childUrl = "https://fixture.invalid/child.css";
	const html = `<!doctype html><style>${base}</style><link rel="stylesheet" href="/root.css"><input id="target" type="checkbox">`;
	const rootCss = '<!--@import "child.css";-->#target{margin:0}';
	const childCss = `<!--#target{width:16px;height:16px}-->${tail}`;
	const resources = new Map([
		[pageUrl, response(pageUrl, html, "text/html")],
		[rootUrl, response(rootUrl, rootCss, "text/css")],
		[childUrl, response(childUrl, childCss, "text/css")],
	]);
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const result = resources.get(request.url);
				if (!result)
					throw new Error(`Unexpected in-memory request: ${request.url}`);
				return result;
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
	const target = id("#target");
	const hits = documentHitTesting(tree);
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(controlChecked(tree, target)).toBe(false);
	await session.click(tab.id, tree.reference(target));
	expect(controlChecked(tree, target)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(styles.metrics().issues).toEqual({ [discarded]: 1 });
	expect(styles.metrics().applicableIssues).toEqual({ [discarded]: 1 });
	expect(styles.metrics().importedSheets).toBe(1);
	expect(buildFormattingTree(tree).issues).toEqual({ [advisory]: 1 });
	expect(requests.map((request) => request.url)).toEqual([
		pageUrl,
		rootUrl,
		childUrl,
	]);
	expect(closed).toBe(false);
	session.close();
	expect(closed).toBe(true);
	expect(hits.metrics().closed).toBe(true);
	expect(() => styles.metrics()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => tree.get(target)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(requests).toHaveLength(3);
});
