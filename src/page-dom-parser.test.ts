import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { HtmlDocumentFamily, documentOrigin } from "./html-document-family.js";
import {
	pageDomConstructorBootstrapSource,
	pageDomParserBootstrapGlobal,
} from "./page-dom-constructor-bootstrap.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface NodeView {
	nodeName: string;
	nodeType: number;
	body: NodeView;
	head: NodeView;
	defaultView: null;
	location: null;
	cookie: string;
	URL: string;
	contentType: string;
	compatMode: string;
	innerHTML: string;
	textContent: string;
	ownerDocument: NodeView;
	querySelector(selector: string): NodeView | null;
	implementation: { createHTMLDocument(): NodeView };
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const result = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(result, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		return result;
	},
};
function fixture(limits: Partial<DocumentLimits> = {}) {
	const tree = new DocumentTree("https://example.com/path/join", limits);
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	return {
		tree,
		dom,
		parse: (source: string) =>
			dom.parseFromString(source, "text/html") as NodeView,
	};
}
function realm() {
	const { tree, dom } = fixture();
	const context = createContext({
		[pageDomParserBootstrapGlobal]: (source: unknown, type: unknown) =>
			dom.parseFromString(source, type),
	});
	runInContext(pageDomConstructorBootstrapSource, context);
	return {
		tree,
		dom,
		context,
		evaluate: (source: string) => runInContext(source, context),
	};
}

it("parses an inert HTML document with the creator URL and parser-selected mode", () => {
	const { parse } = fixture();
	const parsed = parse(
		"<!doctype html><title>Detached</title><b>hello &amp; world</b>",
	);
	expect(parsed.body.innerHTML).toBe("<b>hello &amp; world</b>");
	expect(parsed.head.textContent).toBe("Detached");
	expect(parsed.body.ownerDocument).toBe(parsed);
	expect(parsed.URL).toBe("https://example.com/path/join");
	expect(parsed.contentType).toBe("text/html");
	expect(parsed.compatMode).toBe("CSS1Compat");
	expect(parse("<b>hello</b>").compatMode).toBe("BackCompat");
	expect(parsed.defaultView).toBeNull();
	expect(parsed.location).toBeNull();
	expect(parsed.cookie).toBe("");
});

it("preserves detached script and noscript content without executing it", () => {
	const { parse } = fixture();
	const parsed = parse(
		"<body><script>window.fixtureWasRun=1</script><noscript><b>visible</b></noscript><template><i>held</i></template>",
	);
	expect(parsed.querySelector("script")?.textContent).toBe(
		"window.fixtureWasRun=1",
	);
	expect(parsed.querySelector("noscript b")?.textContent).toBe("visible");
	expect(parsed.querySelector("template")?.innerHTML).toBe("<i>held</i>");
});

it("shares creation attempts with created HTML documents, including nested parsers", () => {
	const { parse, dom } = fixture();
	for (let i = 0; i < 8; i++)
		parse("<b>hello</b>").implementation.createHTMLDocument();
	expect(dom.metrics().documents).toMatchObject({
		attempts: 16,
		documents: 16,
	});
	expect(() => parse("")).toThrow("HTML document creation limit");
	expect(() =>
		(dom.document as NodeView).implementation.createHTMLDocument(),
	).toThrow("HTML document creation limit");
});

it("charges all parsed documents and later mutations to one node budget", () => {
	const { parse, dom } = fixture({ maxNodes: 10 });
	const first = parse("<b>hello</b>");
	expect(() => parse("<b>hello</b>")).toThrow("Shared document node limit");
	expect(dom.metrics().documents).toMatchObject({
		attempts: 2,
		documents: 1,
		nodes: 6,
	});
	expect(first.body.textContent).toBe("hello");
	expect(() => {
		first.body.innerHTML = "<i>a</i><i>b</i><i>c</i>";
	}).toThrow("Shared document node limit");
});

it("releases candidates that fail text limits or publication", () => {
	const { tree, dom, parse } = fixture({ maxTextCodeUnits: 32 });
	expect(() => parse("x".repeat(33))).toThrow("HTML source text limit");
	expect(dom.metrics().documents).toMatchObject({
		attempts: 1,
		documents: 0,
		nodes: 0,
		textCodeUnits: 0,
	});
	const other = new DocumentTree("https://other.example/");
	trees.push(other);
	const family = new HtmlDocumentFamily(other);
	try {
		expect(() =>
			family.parseHtml("<b>hello</b>", () => {
				throw new Error("publication failed");
			}),
		).toThrow("publication failed");
		expect(family.metrics()).toMatchObject({
			attempts: 1,
			documents: 0,
			nodes: 0,
			textCodeUnits: 0,
		});
	} finally {
		family.close();
	}
	expect(documentOrigin(tree).serialized).toBe("https://example.com");
});

it("revokes parsed documents and parser operations when their creator closes", () => {
	const { tree, parse } = fixture();
	const parsed = parse("<b>hello</b>");
	tree.close();
	expect(() => parsed.body).toThrow("closed");
	expect(() => parse("")).toThrow("closed");
});

it("rejects native argument errors and unsupported XML without allocating", () => {
	const { dom } = fixture();
	expect(() => dom.parseFromString({}, "text/html")).toThrow(
		"string arguments",
	);
	expect(() => dom.parseFromString("<root/>", "application/xml")).toThrow(
		"XML parsing is unsupported",
	);
	expect(dom.metrics().documents).toBeNull();
});

it("exposes a constructible parser with a branded method and two required arguments", () => {
	const { evaluate } = realm();
	expect(
		evaluate(
			'DOMParser.length + ":" + DOMParser.prototype.parseFromString.length',
		),
	).toBe("0:2");
	expect(evaluate("Object.prototype.toString.call(new DOMParser())")).toBe(
		"[object DOMParser]",
	);
	expect(
		evaluate(
			'new DOMParser().parseFromString("<b>hello</b>","text/html").body.innerHTML',
		),
	).toBe("<b>hello</b>");
	for (const source of [
		"DOMParser()",
		'DOMParser.prototype.parseFromString.call({},"","text/html")',
		'new DOMParser().parseFromString("")',
	])
		expect(evaluate(`try{${source};"accepted"}catch(error){error.name}`)).toBe(
			"TypeError",
		);
});

it("performs guest DOMString conversion in order before rejecting MIME values", () => {
	const { evaluate, dom } = realm();
	expect(
		evaluate(
			'var order=[]; new DOMParser().parseFromString({toString(){order.push("input");return "<b>hello</b>";}},{toString(){order.push("type");return "text/html";}});order.join(":")',
		),
	).toBe("input:type");
	for (const type of [
		'"TEXT/HTML"',
		'"text/html; charset=utf-8"',
		'Symbol("type")',
	])
		expect(
			evaluate(
				`try{new DOMParser().parseFromString("",${type});"accepted"}catch(error){error.name}`,
			),
		).toBe("TypeError");
	expect(
		evaluate(
			'try{new DOMParser().parseFromString(Symbol("input"),"text/html");"accepted"}catch(error){error.name}',
		),
	).toBe("TypeError");
	expect(dom.metrics().documents?.attempts).toBe(1);
});

it("preserves parser ownership when a publisher closes the creator", () => {
	const { tree } = fixture();
	const family = new HtmlDocumentFamily(tree);
	expect(() =>
		family.parseHtml("<b>hello</b>", () => {
			tree.close();
			return {};
		}),
	).toThrow("closed");
	expect(family.metrics()).toMatchObject({
		documents: 0,
		nodes: 0,
		textCodeUnits: 0,
		closed: true,
	});
});

it("keeps DOMString conversion and receiver checks after application intrinsic replacement", () => {
	const { evaluate } = realm();
	expect(
		evaluate(
			'String=function(){throw new Error("replacement");};WeakSet.prototype.add=function(){throw new Error("replacement");};WeakSet.prototype.has=function(){throw new Error("replacement");};new DOMParser().parseFromString("<b>hello</b>","text/html").body.innerHTML',
		),
	).toBe("<b>hello</b>");
});
