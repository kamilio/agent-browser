import { expect, it } from "vitest";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentLimits } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Node {
	contentWindow: Window | null;
	contentDocument: Node | null;
	defaultView: Window | null;
	body: Node;
	head: Node;
	ownerDocument: Node;
	readyState: string;
	domain: string;
	URL: string;
	baseURI: string;
	textContent: string;
	innerHTML: string;
	createElement(name: string): Node;
	appendChild(node: Node): Node;
	removeChild(node: Node): Node;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	querySelector(selector: string): Node | null;
}
interface Window {
	document: Node;
	window: Window;
	self: Window;
	parent: object;
	top: object;
	frameElement: Node;
	location: { href: string; assign(value: string): void };
	getComputedStyle(node: Node): { getPropertyValue(name: string): string };
}

function childWindow(frame: Node): Window {
	const window = frame.contentWindow;
	if (!window) throw new Error("Expected a blank frame window");
	return window;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};
function fixture(limits: Partial<DocumentLimits> = {}, hostFactory = factory) {
	const tree = parseHtmlDocument(
		"<body></body>",
		"https://fixture.example/join",
		{ limits },
	);
	const window = {};
	const interactions = new DocumentInteractions(tree);
	const dom = new ScriptDom(tree, hostFactory, {
		events: interactions.events,
		window,
		callbacks: {
			isClosed: () => false,
			startCallback() {
				throw new Error("Unexpected callback");
			},
		},
	});
	const document = dom.document as Node;
	const iframe = document.createElement("iframe");
	return { tree, dom, document, iframe, window };
}

it("creates a stable separate blank document only for a connected iframe", () => {
	const { tree, document, iframe, window } = fixture();
	try {
		expect(iframe.contentWindow).toBeNull();
		expect(iframe.contentDocument).toBeNull();
		document.body.appendChild(iframe);
		const child = childWindow(iframe);
		expect(child).not.toBe(window);
		expect(iframe.contentWindow).toBe(child);
		expect(iframe.contentDocument).toBe(child.document);
		expect(child.document).not.toBe(document);
		expect(child.document.defaultView).toBe(child);
		expect(child.document.URL).toBe("about:blank");
		expect(child.document.readyState).toBe("complete");
		expect(child.document.body.ownerDocument).toBe(child.document);
		expect(child.parent).toBe(window);
		expect(child.top).toBe(window);
		expect(child.frameElement).toBe(iframe);
		expect(child.window).toBe(child);
		expect(child.self).toBe(child);
		expect(child.location.href).toBe("about:blank");
		expect(() => child.location.assign("https://other.example/")).toThrow(
			/not implemented/,
		);
	} finally {
		tree.close();
	}
});

it("inherits the creator origin and base URL while keeping document mutations separate", () => {
	const { tree, dom, document, iframe } = fixture();
	try {
		document.head.innerHTML = '<base href="https://fixture.example/assets/">';
		document.body.appendChild(iframe);
		const child = childWindow(iframe);
		expect(child.document.domain).toBe("fixture.example");
		expect(child.document.baseURI).toBe(documentBaseUrl(tree));
		const node = child.document.createElement("span");
		node.setAttribute("id", "child-only");
		node.setAttribute("style", "color: red");
		child.document.body.appendChild(node);
		expect(document.querySelector("#child-only")).toBeNull();
		expect(child.document.querySelector("#child-only")).toBe(node);
		expect(child.getComputedStyle(node).getPropertyValue("color")).toBe(
			"rgb(255, 0, 0)",
		);
		expect(() => dom.getComputedStyle(node)).toThrow();
		expect(() => child.getComputedStyle(document.body)).toThrow();
	} finally {
		tree.close();
	}
});

it.each([
	"sandbox",
	"srcdoc",
	"credentialless",
])("withholds a child document for %s", (attribute) => {
	const { tree, document, iframe } = fixture();
	try {
		iframe.setAttribute(attribute, "");
		document.body.appendChild(iframe);
		expect(iframe.contentWindow).toBeNull();
		expect(iframe.contentDocument).toBeNull();
	} finally {
		tree.close();
	}
});

it.each([
	"https://other.example/",
	"/frame",
	"javascript:alert(1)",
	"data:text/html,frame",
])("does not load or expose %s", (src) => {
	const { tree, document, iframe } = fixture();
	try {
		iframe.setAttribute("src", src);
		document.body.appendChild(iframe);
		expect(iframe.contentWindow).toBeNull();
		expect(iframe.contentDocument).toBeNull();
	} finally {
		tree.close();
	}
});

it.each([
	"remove",
	"ancestor-remove",
	"src",
	"sandbox",
	"srcdoc",
])("revokes retained child capabilities on %s", (change) => {
	const { tree, document, iframe } = fixture();
	try {
		document.body.appendChild(iframe);
		const child = childWindow(iframe);
		const body = child.document.body;
		if (change === "remove") document.body.removeChild(iframe);
		else if (change === "ancestor-remove") document.body.innerHTML = "";
		else
			iframe.setAttribute(
				change,
				change === "src" ? "https://other.example/" : "",
			);
		expect(iframe.contentWindow).toBeNull();
		expect(() => child.document).toThrow(/closed/);
		expect(() => body.textContent).toThrow(/closed/);
		if (change === "remove") {
			document.body.appendChild(iframe);
			expect(iframe.contentWindow).not.toBe(child);
		}
	} finally {
		tree.close();
	}
});

it("shares total document, node and text quotas and releases detached resources", () => {
	const { tree, document, iframe } = fixture({
		maxNodes: 20,
		maxTextCodeUnits: 80,
	});
	try {
		document.body.appendChild(iframe);
		const child = childWindow(iframe);
		const resources = tree.sharedResources();
		expect(resources.metrics().documents).toBe(2);
		child.document.body.textContent = "x".repeat(30);
		expect(() => {
			document.head.textContent = "x".repeat(30);
		}).toThrow(/text limit/);
		while (resources.metrics().nodes < 20) child.document.createElement("i");
		expect(() => document.createElement("i")).toThrow(/node limit/);
		document.body.removeChild(iframe);
		expect(resources.metrics().documents).toBe(1);
		expect(() => document.createElement("i")).not.toThrow();
	} finally {
		tree.close();
	}
});

it("bounds nested documents and preserves parent/top links", () => {
	const { tree, document, iframe, window } = fixture();
	try {
		document.body.appendChild(iframe);
		const first = childWindow(iframe);
		let parent = first;
		for (let i = 0; i < 14; i++) {
			const nested = parent.document.createElement("iframe");
			parent.document.body.appendChild(nested);
			const child = childWindow(nested);
			expect(child.parent).toBe(parent);
			expect(child.top).toBe(window);
			parent = child;
		}
		const excessive = parent.document.createElement("iframe");
		parent.document.body.appendChild(excessive);
		expect(() => excessive.contentWindow).toThrow(/document count limit/);
		expect(tree.sharedResources().metrics().documents).toBe(16);
		document.body.removeChild(iframe);
		expect(tree.sharedResources().metrics().documents).toBe(1);
		expect(() => parent.document).toThrow(/closed/);
	} finally {
		tree.close();
	}
});

it("caps repeated create/detach attempts and revokes frames on parent DOM closure", () => {
	const { tree, dom, document, iframe } = fixture();
	try {
		for (let i = 0; i < 16; i++) {
			document.body.appendChild(iframe);
			expect(iframe.contentWindow).not.toBeNull();
			document.body.removeChild(iframe);
		}
		document.body.appendChild(iframe);
		expect(() => iframe.contentWindow).toThrow(/creation limit/);
		dom.close();
		expect(tree.sharedResources().metrics().documents).toBe(1);
	} finally {
		tree.close();
	}
});

it("revokes the child window, document and styles on parent closure", () => {
	const { tree, document, iframe } = fixture();
	document.body.appendChild(iframe);
	const child = childWindow(iframe);
	const body = child.document.body;
	const style = child.getComputedStyle(body);
	tree.close();
	expect(() => child.document).toThrow(/closed/);
	expect(() => body.textContent).toThrow(/closed/);
	expect(() => style.getPropertyValue("color")).toThrow(/closed/);
});

it("releases a partially constructed document after shared quota rejection", () => {
	const { tree, document, iframe } = fixture({ maxNodes: 7 });
	try {
		document.body.appendChild(iframe);
		const resources = tree.sharedResources();
		const before = resources.metrics();
		expect(() => iframe.contentWindow).toThrow(/node limit/);
		expect(resources.metrics()).toEqual(before);
	} finally {
		tree.close();
	}
});

it("rejects reentrant frame publication without retaining an extra document", () => {
	let iframe: Node;
	const hostFactory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			if (definition.properties?.frameElement)
				expect(() => iframe.contentWindow).toThrow(/Reentrant/);
			return factory.createHostObject(definition);
		},
	};
	const f = fixture({}, hostFactory);
	iframe = f.iframe;
	try {
		f.document.body.appendChild(iframe);
		expect(iframe.contentWindow).not.toBeNull();
		expect(f.tree.sharedResources().metrics().documents).toBe(2);
	} finally {
		f.tree.close();
	}
});

it("rechecks frame policy after host publication and releases a rejected child", () => {
	let iframe: Node;
	const hostFactory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			if (definition.properties?.frameElement)
				iframe.setAttribute("sandbox", "");
			return factory.createHostObject(definition);
		},
	};
	const f = fixture({}, hostFactory);
	iframe = f.iframe;
	try {
		f.document.body.appendChild(iframe);
		expect(() => iframe.contentWindow).toThrow(/changed during publication/);
		expect(iframe.contentWindow).toBeNull();
		expect(f.tree.sharedResources().metrics().documents).toBe(1);
		expect(f.tree.mutationMetrics().collectorFailures).toBe(0);
	} finally {
		f.tree.close();
	}
});

it("withholds frames in inert created documents", () => {
	const { tree, document } = fixture();
	try {
		const implementation = Reflect.get(document, "implementation");
		const inert = implementation.createHTMLDocument("inert") as Node;
		const iframe = inert.createElement("iframe");
		inert.body.appendChild(iframe);
		expect(iframe.contentWindow).toBeNull();
		expect(iframe.contentDocument).toBeNull();
	} finally {
		tree.close();
	}
});
