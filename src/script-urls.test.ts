import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptLocation } from "./script-location.js";

interface UrlElement {
	href: string;
	src: string;
	origin: string;
	protocol: string;
	hostname: string;
	port: string;
	pathname: string;
	search: string;
	hash: string;
	baseURI: string;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	remove(): void;
	toString(): string;
}
interface LocationObject {
	href: string;
	origin: string;
	protocol: string;
	host: string;
	hostname: string;
	port: string;
	pathname: string;
	search: string;
	hash: string;
	assign(value: string): void;
	replace(value: string): void;
	reload(): void;
	toString(): string;
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		return target;
	},
};
function fixture(
	html = '<base href="/base/"><a id="link" href="child?q=1#part">link</a>',
) {
	const tree = parseHtmlDocument(html, "https://example.com/page?old=1#old");
	trees.push(tree);
	const location = new ScriptLocation(tree, factory);
	const dom = new ScriptDom(tree, factory, undefined, location);
	const document = dom.document as {
		location: LocationObject;
		baseURI: string;
		querySelector(selector: string): UrlElement;
		createElement(name: string): UrlElement;
	};
	return { tree, dom, document, location, link: document.querySelector("a") };
}

it("resolves hyperlink URLs while retaining raw attributes", () => {
	const { link, document } = fixture();
	expect(link.href).toBe("https://example.com/base/child?q=1#part");
	expect(link.toString()).toBe(link.href);
	expect(link.getAttribute("href")).toBe("child?q=1#part");
	expect([
		link.origin,
		link.protocol,
		link.hostname,
		link.port,
		link.pathname,
		link.search,
		link.hash,
	]).toEqual([
		"https://example.com",
		"https:",
		"example.com",
		"",
		"/base/child",
		"?q=1",
		"#part",
	]);
	expect(document.baseURI).toBe("https://example.com/base/");
	expect(link.baseURI).toBe(document.baseURI);
});

it("updates URL getters after base, attribute, and same-document URL changes", () => {
	const { tree, document, link } = fixture();
	document.querySelector("base").setAttribute("href", "/changed/");
	expect(link.pathname).toBe("/changed/child");
	document.querySelector("base").remove();
	tree.setUrl("https://example.com/next/page");
	expect(link.pathname).toBe("/next/child");
	link.href = "other";
	expect(link.getAttribute("href")).toBe("other");
	expect(link.href).toBe("https://example.com/next/other");
});

it("reflects component writes without navigating the document", () => {
	const { tree, link } = fixture();
	const before = tree.url;
	link.hostname = "other.example";
	link.port = "8443";
	link.pathname = "/new path";
	link.search = "q=two words";
	link.hash = "new part";
	expect(link.href).toBe(
		"https://other.example:8443/new%20path?q=two%20words#new%20part",
	);
	expect(link.getAttribute("href")).toBe(link.href);
	expect(tree.url).toBe(before);
});

it("resolves base.href against the document URL without applying itself twice", () => {
	const { tree, document, link } = fixture(
		'<base href="nested/"><a href="child">link</a>',
	);
	const base = document.querySelector("base");
	expect(base.href).toBe("https://example.com/nested/");
	expect(link.href).toBe("https://example.com/nested/child");
	base.href = "other/";
	expect(base.href).toBe("https://example.com/other/");
	expect(link.href).toBe("https://example.com/other/child");
	tree.setUrl("https://example.com/changed/page");
	expect(base.href).toBe("https://example.com/changed/other/");
	expect(link.href).toBe("https://example.com/changed/other/child");
});

it("preserves missing, empty, invalid, and non-HTTP hyperlink distinctions", () => {
	const { link } = fixture();
	link.removeAttribute("href");
	expect([link.href, link.origin, link.protocol, link.pathname]).toEqual([
		"",
		"",
		":",
		"",
	]);
	link.hash = "ignored";
	expect(link.getAttribute("href")).toBeNull();
	link.href = "";
	expect(link.href).toBe("https://example.com/base/");
	link.href = "http://[bad";
	expect(link.href).toBe("http://[bad");
	link.hostname = "ignored.example";
	expect(link.getAttribute("href")).toBe("http://[bad");
	link.href = "mailto:person@example.com";
	expect([link.protocol, link.origin, link.pathname]).toEqual([
		"mailto:",
		"null",
		"person@example.com",
	]);
});

it.each([
	"script",
	"img",
	"iframe",
	"input",
	"source",
	"video",
	"audio",
	"embed",
	"track",
])("reflects %s.src without creating a fetch capability", (tag) => {
	const { document } = fixture();
	const element = document.createElement(tag);
	expect(element.src).toBe("");
	element.src = "asset.js";
	expect(element.src).toBe("https://example.com/base/asset.js");
	expect(element.getAttribute("src")).toBe("asset.js");
	element.src = "http://[bad";
	expect(element.src).toBe("http://[bad");
});

it("restricts URL reflection to applicable element types", () => {
	const { document } = fixture();
	expect(document.createElement("div").href).toBeUndefined();
	const link = document.createElement("link");
	link.href = "/style.css";
	expect(link.href).toBe("https://example.com/style.css");
	expect(link.hostname).toBeUndefined();
	const area = document.createElement("area");
	area.href = "/map";
	expect(area.pathname).toBe("/map");
});

it("keeps Location on the document URL rather than the base URL", () => {
	const { tree, document, location } = fixture();
	expect(document.location).toBe(location.object);
	expect(document.location.href).toBe(tree.url);
	expect(document.location.pathname).toBe("/page");
	expect(document.location.toString()).toBe(tree.url);
	tree.setUrl("https://example.com/new?q=2#next");
	expect([
		document.location.pathname,
		document.location.search,
		document.location.hash,
	]).toEqual(["/new", "?q=2", "#next"]);
});

it("rejects unsupported Location mutations instead of pretending to navigate", () => {
	const { tree, document } = fixture();
	const before = tree.url;
	for (const key of [
		"href",
		"protocol",
		"host",
		"hostname",
		"port",
		"pathname",
		"search",
		"hash",
	] as const)
		expect(() => {
			document.location[key] = "/changed";
		}).toThrow("not implemented");
	for (const method of ["assign", "replace", "reload"] as const)
		expect(() => document.location[method]("/changed")).toThrow(
			"not implemented",
		);
	expect(() => {
		document.location = {} as LocationObject;
	}).toThrow("not implemented");
	expect(tree.url).toBe(before);
});

it("revokes retained Location and DOM URL capabilities on close", () => {
	const { tree, dom, document, link, location } = fixture();
	const held = document.location;
	dom.close();
	expect(() => link.href).toThrow("closed");
	location.close();
	expect(() => held.href).toThrow("closed");
	expect(() => held.assign("/later")).toThrow("closed");
	expect(tree.url).toContain("example.com");
});

it("revokes URL capabilities when their owning document closes", () => {
	const { tree, document, link } = fixture();
	const held = document.location;
	tree.close();
	expect(() => held.href).toThrow("closed");
	expect(() => link.href).toThrow("closed");
});

it("rejects object coercion without invoking host-side conversion", () => {
	const { link } = fixture();
	let calls = 0;
	const value = {
		toString() {
			calls++;
			return "/unexpected";
		},
	};
	expect(() => {
		link.href = value as unknown as string;
	}).toThrow("conversion");
	expect(() => {
		link.hash = value as unknown as string;
	}).toThrow("conversion");
	expect(calls).toBe(0);
});
