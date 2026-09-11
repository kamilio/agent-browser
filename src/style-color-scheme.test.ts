import { afterEach, expect, it, vi } from "vitest";
import { controlChecked } from "./controls.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
const baseCss = "html,body{margin:0;padding:0;font-size:8px;line-height:12px}";
const propertyIssue = "unimplemented-css-property";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "", head = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style>${head}<div id="target">Target</div>`,
		"https://fixture.invalid/color-scheme",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(800, 600);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, styles, id };
}

it("defaults to raw null with effective light and recascades on preference changes", () => {
	const { tree, styles, id } = fixture(
		"#target{display:none}@media (prefers-color-scheme:light){#target{display:block}}",
	);
	expect(styles.colorSchemePreference).toBeNull();
	expect(styles.metrics().colorScheme).toEqual({
		profile: "native-ua-color-preference",
		preference: null,
		effective: "light",
		systemIntegration: false,
		siteOverrides: false,
	});
	expect(Object.isFrozen(styles.metrics().colorScheme)).toBe(true);
	expect(styles.get(id("#target")).visible).toBe(true);
	const originalViewport = styles.viewport;
	const originalEnvironment = styles.mediaEnvironment;
	expect(originalEnvironment).toEqual({
		width: 800,
		height: 600,
		colorSchemePreference: null,
	});
	expect(Object.isFrozen(originalEnvironment)).toBe(true);
	for (const preference of ["dark", "light", null] as const) {
		styles.setColorSchemePreference(preference);
		expect(styles.colorSchemePreference).toBe(preference);
		expect(styles.metrics().colorScheme).toMatchObject({
			preference,
			effective: preference === "dark" ? "dark" : "light",
			systemIntegration: false,
			siteOverrides: false,
		});
		expect(styles.get(id("#target")).visible).toBe(preference !== "dark");
		expect(styles.viewport).toBe(originalViewport);
		expect(styles.mediaEnvironment).toEqual({
			width: 800,
			height: 600,
			colorSchemePreference: preference,
		});
		expect(Object.isFrozen(styles.mediaEnvironment)).toBe(true);
	}
	expect(originalEnvironment.colorSchemePreference).toBeNull();
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(
		layoutDocument(tree).contexts.some((context) => context.glyphs.length > 0),
	).toBe(true);
});

it("separates raw preference notifications from viewport-only notifications and no-ops", () => {
	const { tree, styles } = fixture();
	const media = vi.fn();
	const viewport = vi.fn();
	styles.onMediaChange(media);
	styles.onViewportChange(viewport);
	const revision = tree.revision;
	styles.setColorSchemePreference(null);
	styles.setViewport(800, 600);
	expect(tree.revision).toBe(revision);
	expect(media).not.toHaveBeenCalled();
	styles.setColorSchemePreference("light");
	expect(tree.revision).toBeGreaterThan(revision);
	expect(media).toHaveBeenCalledTimes(1);
	expect(viewport).not.toHaveBeenCalled();
	const lightRevision = tree.revision;
	styles.setColorSchemePreference("light");
	expect(tree.revision).toBe(lightRevision);
	styles.setColorSchemePreference(null);
	expect(media).toHaveBeenCalledTimes(2);
	styles.setViewport(500, 400);
	expect(media).toHaveBeenCalledTimes(3);
	expect(viewport).toHaveBeenCalledTimes(1);
	expect(styles.viewport).toEqual({ width: 500, height: 400 });
	expect(styles.mediaEnvironment).toEqual({
		width: 500,
		height: 400,
		colorSchemePreference: null,
	});
});

it.each(["", "LIGHT", "system", undefined, 1, false, {}])(
	"rejects invalid preference %j without changing state or notifying",
	(value) => {
		const { tree, styles } = fixture();
		styles.setColorSchemePreference("dark");
		const environment = styles.mediaEnvironment;
		const revision = tree.revision;
		const changed = vi.fn();
		styles.onMediaChange(changed);
		expect(() => styles.setColorSchemePreference(value as never)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(styles.colorSchemePreference).toBe("dark");
		expect(styles.mediaEnvironment).toBe(environment);
		expect(tree.revision).toBe(revision);
		expect(changed).not.toHaveBeenCalled();
	},
);

it("deduplicates each listener set and shares the sixteen-registration cap", () => {
	const { tree, styles } = fixture();
	const shared = vi.fn();
	const removeMedia = styles.onMediaChange(shared);
	styles.onMediaChange(shared);
	const removeViewport = styles.onViewportChange(shared);
	styles.onViewportChange(shared);
	for (let index = 0; index < 14; index++) styles.onMediaChange(() => {});
	expect(() => styles.onMediaChange(() => {})).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => styles.onViewportChange(() => {})).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	styles.setColorSchemePreference("dark");
	expect(shared).toHaveBeenCalledTimes(1);
	styles.setViewport(700, 600);
	expect(shared).toHaveBeenCalledTimes(3);
	removeMedia();
	removeMedia();
	const replacement = styles.onViewportChange(() => {});
	removeViewport();
	styles.setColorSchemePreference("light");
	styles.setViewport(600, 600);
	expect(shared).toHaveBeenCalledTimes(3);
	tree.close();
	replacement();
	expect(() => styles.onMediaChange(() => {})).toThrow(/closed/i);
	expect(() => styles.onViewportChange(() => {})).toThrow(/closed/i);
	expect(() => styles.setColorSchemePreference(null)).toThrow(/closed/i);
});

it.each(["inline", "external"] as const)(
	"filters %s dark-only diagnostics through nested media but blocks active unsupported CSS",
	(kind) => {
		const css =
			"@media (prefers-color-scheme:dark){@media (min-width:600px){#target{animation-name:spin}}}";
		const { tree, styles, id } = fixture(
			kind === "inline" ? css : "",
			kind === "external"
				? '<link rel="stylesheet" href="/sheet.css" media="screen">'
				: "",
		);
		if (kind === "external")
			styles.setExternalSheet(
				id("link"),
				"https://fixture.invalid/sheet.css",
				css,
			);
		expect(styles.metrics().issues[propertyIssue]).toBe(1);
		expect(styles.metrics().applicableIssues).toEqual({});
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(layoutDocument(tree).boxes.length).toBeGreaterThan(0);
		styles.setColorSchemePreference("dark");
		expect(styles.metrics().applicableIssues[propertyIssue]).toBe(1);
		expect(buildFormattingTree(tree).issues[`css:${propertyIssue}`]).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		styles.setViewport(400, 600);
		expect(styles.colorSchemePreference).toBe("dark");
		expect(styles.metrics().issues[propertyIssue]).toBe(1);
		expect(styles.metrics().applicableIssues).toEqual({});
		expect(layoutDocument(tree).boxes.length).toBeGreaterThan(0);
		styles.setViewport(800, 600);
		styles.setColorSchemePreference(null);
		expect(styles.metrics().applicableIssues).toEqual({});
	},
);

it("keeps unknown preference query values fail-closed", () => {
	const { tree, styles } = fixture(
		"@media (prefers-color-scheme:sepia){#target{animation-name:spin}}",
	);
	const issue = "unimplemented-or-invalid-media-query";
	for (const preference of [null, "light", "dark"] as const) {
		styles.setColorSchemePreference(preference);
		expect(styles.metrics().applicableIssues[issue]).toBeGreaterThan(0);
		expect(buildFormattingTree(tree).issues[`css:${issue}`]).toBeGreaterThan(0);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	}
});

it("baseline: native default light clicks a checkbox with dark-only unsupported CSS", async () => {
	const url = "https://fixture.invalid/color-scheme-click";
	const body = new TextEncoder().encode(
		`<!doctype html><style>${baseCss}@media (prefers-color-scheme:dark){#target{animation-name:spin}}</style><input id="target" type="checkbox">`,
	);
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				if (request.url !== url)
					throw new Error("Unexpected in-memory request");
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.byteLength,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: body.byteLength,
				decodedBytes: body.byteLength,
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
	await session.navigate(tab.id, url);
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing checkbox");
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(controlChecked(page.document, target)).toBe(false);
	await session.click(tab.id, page.document.reference(target));
	expect(controlChecked(page.document, target)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	const styles = documentStyles(page.document);
	expect(styles.colorSchemePreference).toBeNull();
	expect(styles.metrics().issues[propertyIssue]).toBe(1);
	expect(styles.metrics().applicableIssues).toEqual({});
	expect(requests.map((request) => request.url)).toEqual([url]);
});
