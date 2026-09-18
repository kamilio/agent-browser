import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { DocumentWebSocketPolicy } from "./document-websocket-policy.js";
import { svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";

const trees: DocumentTree[] = [];
const documentUrl = "https://example.com/directory/page";

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function fixture(html = "<main></main>", url = documentUrl): DocumentTree {
	const tree = parseHtmlDocument(html, url);
	trees.push(tree);
	return tree;
}

function element(tree: DocumentTree, tagName: string): number {
	const found = [...tree.walk()].find(({ node }) => node.tagName === tagName);
	if (!found) throw new Error(`Missing ${tagName} fixture`);
	return found.node.id;
}

function observeCleanup(tree: DocumentTree) {
	const stopChange = vi.fn();
	const stopClose = vi.fn();
	const onChange = tree.onChange.bind(tree);
	const onClose = tree.onClose.bind(tree);
	vi.spyOn(tree, "onChange").mockImplementation((handler) => {
		stopChange.mockImplementation(onChange(handler));
		return stopChange;
	});
	vi.spyOn(tree, "onClose").mockImplementation((handler) => {
		stopClose.mockImplementation(onClose(handler));
		return stopClose;
	});
	return { stopChange, stopClose };
}

it.each([
	["/socket", "wss://example.com/socket"],
	["socket", "wss://example.com/directory/socket"],
	["../socket?room=one", "wss://example.com/socket?room=one"],
	["//other.example/socket", "wss://other.example/socket"],
	["https://other.example/socket", "wss://other.example/socket"],
	["WSS://OTHER.EXAMPLE:443/socket", "wss://other.example/socket"],
	["wss://example.com/%23socket", "wss://example.com/%23socket"],
	["wss://example.com/space here", "wss://example.com/space%20here"],
	["", "wss://example.com/directory/page"],
] as const)("resolves bounded WebSocket URL %s", (input, expected) => {
	const result = new DocumentWebSocketPolicy(fixture()).resolve(input);
	expect(result).toEqual({ url: expected, origin: "https://example.com" });
	expect(Object.isFrozen(result)).toBe(true);
});

it.each(["http://other.example/socket", "ws://other.example/socket"])(
	"allows insecure WebSockets only for an HTTP owner: %s",
	(input) => {
		const policy = new DocumentWebSocketPolicy(
			fixture("", "http://example.com:8080/page"),
		);
		expect(policy.resolve(input)).toEqual({
			url: "ws://other.example/socket",
			origin: "http://example.com:8080",
		});
		expect(policy.resolve("https://other.example/socket").url).toBe(
			"wss://other.example/socket",
		);
	},
);

it.each([
	"http://example.com/socket",
	"ws://example.com/socket",
	"ws://localhost/socket",
])("denies mixed content without upgrading or exempting %s", (input) => {
	const policy = new DocumentWebSocketPolicy(fixture(), ["connect-src *"]);
	expect(() => policy.resolve(input)).toThrow(
		"HTTPS documents require secure WebSocket connections",
	);
});

it.each([
	"wss://",
	"wss://[invalid]/socket",
	"wss://example.com:65536/socket",
	"wss://user:secret@example.com/socket",
	"wss://user@example.com/socket",
	"//user:secret@example.com/socket",
	"wss://example.com/socket#",
	"wss://example.com/socket#room",
	"/socket#",
	"#",
	"ftp://example.com/socket",
	"file:///socket",
	"data:text/plain,socket",
	"javascript:void(0)",
])("rejects invalid or disallowed target %s", (input) => {
	const policy = new DocumentWebSocketPolicy(fixture());
	expect(() => policy.resolve(input)).toThrow();
	expect(policy.resolve("/socket").url).toBe("wss://example.com/socket");
});

it.each([null, undefined, 42, true, [], {}, Object("/socket")])(
	"rejects non-string URL inputs without coercion: %j",
	(input) => {
		expect(() => new DocumentWebSocketPolicy(fixture()).resolve(input)).toThrow(
			"WebSocket URL must be a string",
		);
	},
);

it("does not invoke caller URL coercion hooks", () => {
	const stringify = vi.fn(() => "/socket");
	const policy = new DocumentWebSocketPolicy(fixture());
	expect(() => policy.resolve({ toString: stringify })).toThrow(
		"must be a string",
	);
	expect(stringify).not.toHaveBeenCalled();
});

it.each([
	"about:blank",
	"data:text/html,document",
	"file:///document",
	"wss://example.com/page",
])(
	"requires an HTTP(S) owner rather than inheriting origin from a base: %s",
	(url) => {
		const tree = fixture('<base href="https://example.com/">', url);
		expect(() => new DocumentWebSocketPolicy(tree)).toThrow(
			"must have an HTTP(S) origin",
		);
	},
);

it("follows current base and history URLs without changing the original owner origin", () => {
	const tree = fixture('<base href="https://other.example/channels/">');
	const base = element(tree, "base");
	const policy = new DocumentWebSocketPolicy(tree);
	expect(policy.resolve("one")).toEqual({
		url: "wss://other.example/channels/one",
		origin: "https://example.com",
	});
	tree.setAttribute(base, "href", "https://third.example/rooms/");
	tree.setUrl("https://example.com/history/page?state=2");
	expect(policy.resolve("two")).toEqual({
		url: "wss://third.example/rooms/two",
		origin: "https://example.com",
	});
	tree.remove(base);
	expect(policy.resolve("three")).toEqual({
		url: "wss://example.com/history/three",
		origin: "https://example.com",
	});
});

it("keeps response policy fixed when base, history and caller headers change", () => {
	const tree = fixture('<base href="https://allowed.example/channels/">');
	const headers = ["connect-src wss://allowed.example"];
	const policy = new DocumentWebSocketPolicy(tree, headers);
	headers[0] = "connect-src *";
	tree.setUrl("https://example.com/changed/page");
	tree.setAttribute(element(tree, "base"), "href", "https://blocked.example/");
	expect(() => policy.resolve("socket")).toThrow(
		"blocked by Content Security Policy",
	);
	expect(policy.resolve("wss://allowed.example/socket").origin).toBe(
		"https://example.com",
	);
});

it("does not weaken HTTPS mixed-content requirements for an HTTP base", () => {
	const policy = new DocumentWebSocketPolicy(
		fixture('<base href="http://other.example/">'),
	);
	expect(() => policy.resolve("socket")).toThrow(
		"require secure WebSocket connections",
	);
	expect(policy.resolve("wss://other.example/socket").origin).toBe(
		"https://example.com",
	);
});

it.each(["http://[", "data:text/plain,base", "javascript:void(0)"])(
	"uses document fallback instead of a later base after %s",
	(href) => {
		const tree = fixture(
			`<base href="${href}"><base href="https://other.example/">`,
		);
		const policy = new DocumentWebSocketPolicy(tree);
		expect(policy.resolve("socket").url).toBe(
			"wss://example.com/directory/socket",
		);
	},
);

it("rejects credentials inherited from a document base", () => {
	const policy = new DocumentWebSocketPolicy(
		fixture('<base href="https://user:secret@other.example/">'),
	);
	expect(() => policy.resolve("socket")).toThrow("credentials or fragments");
});

it("accepts exactly 4096 URL units and rejects source and normalization overflow", () => {
	const policy = new DocumentWebSocketPolicy(fixture());
	const prefix = "wss://example.com/";
	const boundary = prefix + "x".repeat(4096 - prefix.length);
	expect(policy.resolve(boundary).url).toBe(boundary);
	expect(() => policy.resolve(`${boundary}x`)).toThrow(
		"exceeds the length limit",
	);
	expect(() => policy.resolve(prefix + "é".repeat(800))).toThrow(
		"Normalized WebSocket URL exceeds the length limit",
	);
});

it("checks combined relative URL length after resolving the base", () => {
	const policy = new DocumentWebSocketPolicy(fixture());
	expect(() => policy.resolve("x".repeat(4090))).toThrow(
		"Normalized WebSocket URL exceeds the length limit",
	);
});

it("bounds the original document URL before registering policy listeners", () => {
	const tree = fixture("", `https://example.com/${"x".repeat(4096)}`);
	const change = vi.spyOn(tree, "onChange");
	const close = vi.spyOn(tree, "onClose");
	expect(() => new DocumentWebSocketPolicy(tree)).toThrow(
		"exceeds the length limit",
	);
	expect(change).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it.each(["base", "history"] as const)(
	"bounds a changed %s URL and unregisters a failed owner",
	(kind) => {
		const tree = fixture("<base>");
		const { stopChange, stopClose } = observeCleanup(tree);
		const policy = new DocumentWebSocketPolicy(tree);
		const oversized = `https://example.com/${"x".repeat(4096)}`;
		if (kind === "base")
			tree.setAttribute(element(tree, "base"), "href", oversized);
		else tree.setUrl(oversized);
		expect(() => policy.resolve("/socket")).toThrow("exceeds the length limit");
		expect(stopChange).toHaveBeenCalledTimes(1);
		expect(stopClose).toHaveBeenCalledTimes(1);
	},
);

it("enforces connect-src/default-src intersections before returning a target", () => {
	const policy = new DocumentWebSocketPolicy(fixture(), [
		"default-src wss:",
		"connect-src wss://allowed.example",
	]);
	expect(policy.resolve("wss://allowed.example/socket").url).toBe(
		"wss://allowed.example/socket",
	);
	expect(() => policy.resolve("wss://blocked.example/socket")).toThrow(
		"blocked by Content Security Policy",
	);
});

it("does not reinterpret HTTP(S) self as authorization for a WebSocket", () => {
	const policy = new DocumentWebSocketPolicy(fixture(), ["connect-src 'self'"]);
	expect(() => policy.resolve("/socket")).toThrow(
		"blocked by Content Security Policy",
	);
});

it("latches initial meta CSP denial even when metadata is later removed", () => {
	const tree = fixture(
		'<meta http-equiv="Content-Security-Policy" content="connect-src *">',
	);
	const change = vi.spyOn(tree, "onChange");
	const close = vi.spyOn(tree, "onClose");
	const policy = new DocumentWebSocketPolicy(tree);
	tree.remove(element(tree, "meta"));
	expect(() => policy.resolve("/socket")).toThrow(
		"Meta WebSocket CSP enforcement is not implemented",
	);
	expect(change).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it("observes inserted subtree metadata before synchronous removal and unregisters", () => {
	const tree = fixture();
	const { stopChange, stopClose } = observeCleanup(tree);
	const policy = new DocumentWebSocketPolicy(tree);
	const container = tree.createElement("section");
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "connect-src *",
	});
	tree.append(container, meta);
	expect(policy.resolve("/socket").url).toBe("wss://example.com/socket");
	tree.append(tree.root, container);
	tree.remove(container);
	expect(() => policy.resolve("/socket")).toThrow("Meta WebSocket CSP");
	expect(stopChange).toHaveBeenCalledTimes(1);
	expect(stopClose).toHaveBeenCalledTimes(1);
	policy.close();
	expect(stopChange).toHaveBeenCalledTimes(1);
	expect(stopClose).toHaveBeenCalledTimes(1);
});

it("latches meta http-equiv mutation despite immediate removal or weakening", () => {
	const tree = fixture("<meta>");
	const meta = element(tree, "meta");
	const policy = new DocumentWebSocketPolicy(tree);
	tree.setAttribute(meta, "http-equiv", "CONTENT-SECURITY-POLICY");
	tree.removeAttribute(meta, "http-equiv");
	tree.setAttribute(meta, "content", "connect-src *");
	expect(() => policy.resolve("/socket")).toThrow("Meta WebSocket CSP");
});

it("ignores detached, report-only, foreign and template-contained metadata", () => {
	const tree = fixture(
		'<meta http-equiv="content-security-policy-report-only" content="connect-src none"><template><meta http-equiv="content-security-policy"></template>',
	);
	const policy = new DocumentWebSocketPolicy(tree);
	tree.createElement("meta", { "http-equiv": "content-security-policy" });
	tree.append(
		tree.root,
		tree.createParserElement(
			"meta",
			{ "http-equiv": "content-security-policy" },
			svgNamespace,
		),
	);
	expect(policy.resolve("/socket").url).toBe("wss://example.com/socket");
});

it("ignores overlong non-CSP metadata without unbounded case folding", () => {
	const tree = fixture("<meta>");
	const meta = element(tree, "meta");
	tree.setAttribute(meta, "http-equiv", "X".repeat(65_536));
	const policy = new DocumentWebSocketPolicy(tree);
	tree.setAttribute(meta, "content", "connect-src none");
	expect(policy.resolve("/socket").url).toBe("wss://example.com/socket");
});

it("bounds lifetime metadata ancestry scans and permanently unregisters on exhaustion", () => {
	const tree = fixture();
	let parent = tree.root;
	for (let depth = 0; depth < 240; depth++) {
		const container = tree.createElement("section");
		tree.append(parent, container);
		parent = container;
	}
	const meta = tree.createElement("meta");
	tree.append(parent, meta);
	const { stopChange, stopClose } = observeCleanup(tree);
	const policy = new DocumentWebSocketPolicy(tree);
	for (let index = 0; index < 10_000; index++)
		tree.setAttribute(meta, "data-index", String(index));
	expect(() => policy.resolve("/socket")).toThrow(
		"WebSocket policy scan work limit exceeded",
	);
	expect(stopChange).toHaveBeenCalledTimes(1);
	expect(stopClose).toHaveBeenCalledTimes(1);
	tree.remove(meta);
	expect(() => policy.resolve("/socket")).toThrow(
		"WebSocket policy scan work limit exceeded",
	);
});

it("fails closed and unregisters when a metadata scan throws unexpectedly", () => {
	const tree = fixture("<meta>");
	const meta = element(tree, "meta");
	const { stopChange, stopClose } = observeCleanup(tree);
	const policy = new DocumentWebSocketPolicy(tree);
	vi.spyOn(tree, "walk").mockImplementationOnce(() => {
		throw new Error("scanner failed");
	});
	tree.setAttribute(meta, "data-changed", "true");
	expect(() => policy.resolve("/socket")).toThrow(
		"WebSocket document policy processing failed",
	);
	expect(stopChange).toHaveBeenCalledTimes(1);
	expect(stopClose).toHaveBeenCalledTimes(1);
});

it("rolls back the change subscription if close registration fails", () => {
	const tree = fixture();
	const { stopChange } = observeCleanup(tree);
	vi.spyOn(tree, "onClose").mockImplementationOnce(() => {
		throw new Error("cleanup capacity exhausted");
	});
	expect(() => new DocumentWebSocketPolicy(tree)).toThrow(
		"cleanup capacity exhausted",
	);
	expect(stopChange).toHaveBeenCalledTimes(1);
});

it("unregisters and latches CSP matching work exhaustion", () => {
	const tree = fixture();
	const { stopChange, stopClose } = observeCleanup(tree);
	const policy = new DocumentWebSocketPolicy(tree, [
		`connect-src ${"wss://blocked.example ".repeat(1000)}`,
	]);
	expect(() => policy.resolve(`wss://example.com/${"x".repeat(1000)}`)).toThrow(
		"CSP matching work limit exceeded",
	);
	expect(() => policy.resolve("wss://blocked.example/socket")).toThrow(
		"CSP matching work limit exceeded",
	);
	expect(stopChange).toHaveBeenCalledTimes(1);
	expect(stopClose).toHaveBeenCalledTimes(1);
});

it("rejects invalid response policies before registering listeners", () => {
	const tree = fixture();
	const change = vi.spyOn(tree, "onChange");
	const close = vi.spyOn(tree, "onClose");
	expect(
		() => new DocumentWebSocketPolicy(tree, ["connect-src *".repeat(4096)]),
	).toThrow("CSP headers exceed the length limit");
	expect(change).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it("recognizes document closure after unregistering a failed policy", () => {
	const tree = fixture('<meta http-equiv="content-security-policy">');
	const policy = new DocumentWebSocketPolicy(tree);
	tree.close();
	expect(() => policy.resolve("/socket")).toThrow("closed");
	policy.close();
});

it.each(["owner", "document"] as const)(
	"closes policy ownership and subscriptions idempotently with its %s",
	(kind) => {
		const tree = fixture();
		const { stopChange, stopClose } = observeCleanup(tree);
		const policy = new DocumentWebSocketPolicy(tree);
		if (kind === "owner") policy.close();
		else tree.close();
		expect(() => policy.resolve("/socket")).toThrow("closed");
		policy.close();
		expect(stopChange).toHaveBeenCalledTimes(1);
		expect(stopClose).toHaveBeenCalledTimes(1);
	},
);

it("rejects construction against an already closed document", () => {
	const tree = fixture();
	tree.close();
	expect(() => new DocumentWebSocketPolicy(tree)).toThrow("closed");
});
