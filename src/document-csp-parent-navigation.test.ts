import { afterEach, expect, it, vi } from "vitest";
import { documentImageContentSecurityPolicy } from "./document-image-content-security-policy.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	const html = tree.createElement("html");
	const body = tree.createElement("body");
	tree.append(tree.root, html);
	tree.append(html, body);
	return { tree, html, body };
}

it("reads parents across detached, attached, moved and removed subtrees", () => {
	const { tree, body } = fixture();
	const first = tree.createElement("section");
	const second = tree.createElement("section");
	const child = tree.createElement("span");
	expect(tree.parentOf(tree.root)).toBeNull();
	expect(tree.parentOf(first)).toBeNull();
	tree.append(first, child);
	expect(tree.parentOf(child)).toBe(first);
	expect(tree.isConnected(child)).toBe(false);
	tree.append(body, first);
	tree.append(body, second);
	expect(tree.parentOf(first)).toBe(body);
	expect(tree.isConnected(child)).toBe(true);
	tree.append(second, child);
	expect(tree.parentOf(child)).toBe(second);
	tree.remove(second);
	expect(tree.parentOf(second)).toBeNull();
	expect(tree.parentOf(child)).toBe(second);
	expect(tree.isConnected(child)).toBe(false);
	tree.remove(child);
	expect(tree.parentOf(child)).toBeNull();
	tree.append(first, child);
	expect(tree.parentOf(child)).toBe(first);
	expect(tree.isConnected(child)).toBe(true);
});

it("validates parent IDs and rejects lookup after document closure", () => {
	const { tree, body } = fixture();
	const foreign = fixture();
	for (const id of [
		0,
		-1,
		body + 0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER,
		foreign.tree.root,
	])
		expect(() => tree.parentOf(id)).toThrow(
			expect.objectContaining({ code: "not-found" }),
		);
	tree.close();
	for (const id of [tree.root, body, -1])
		expect(() => tree.parentOf(id)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
});

it("does not obtain snapshots for parent lookup or mutate retained get views", () => {
	const { tree, body } = fixture();
	const container = tree.createElement("div", { "data-state": "before" });
	const child = tree.createText("before");
	tree.append(container, child);
	const detached = tree.get(container);
	const text = tree.get(child);
	const get = vi.spyOn(tree, "get");
	expect(tree.parentOf(container)).toBeNull();
	expect(tree.parentOf(child)).toBe(container);
	expect(tree.parentOf(body)).not.toBeNull();
	expect(get).not.toHaveBeenCalled();
	get.mockRestore();
	tree.append(body, container);
	const attached = tree.get(container);
	const bodyBefore = tree.get(body);
	tree.setAttribute(container, "data-state", "after");
	tree.setData(child, "after");
	tree.append(body, child);
	tree.remove(container);
	expect(tree.parentOf(container)).toBeNull();
	expect(tree.parentOf(child)).toBe(body);
	expect(tree.get(container)).toMatchObject({
		parent: null,
		children: [],
		attributes: { "data-state": "after" },
	});
	tree.close();
	expect(detached).toMatchObject({
		parent: null,
		children: [child],
		attributes: { "data-state": "before" },
	});
	expect(attached).toMatchObject({ parent: body, children: [child] });
	expect(bodyBefore.children).toEqual([container]);
	expect(text).toMatchObject({ parent: container, data: "before" });
	for (const view of [detached, attached, bodyBefore, text]) {
		expect(Object.isFrozen(view)).toBe(true);
		expect(Object.isFrozen(view.children)).toBe(true);
		expect(Object.isFrozen(view.attributes)).toBe(true);
		expect(Object.isFrozen(view.control)).toBe(true);
	}
});

function insertionSnapshots(width: number, enforcePolicy: boolean) {
	const { tree, html, body } = fixture();
	const ancestors = new Set([tree.root, html, body]);
	if (enforcePolicy) documentImageContentSecurityPolicy(tree, []);
	const get = vi.spyOn(tree, "get");
	for (let index = 0; index < width; index++)
		tree.append(body, tree.createElement("div"));
	const counts = {
		ancestors: get.mock.calls.filter(([id]) => ancestors.has(id)).length,
		subtree: get.mock.calls.filter(([id]) => !ancestors.has(id)).length,
	};
	get.mockRestore();
	return counts;
}

it.each([32, 256])(
	"adds only subtree snapshots, not growing ancestor snapshots, for %i siblings",
	(width) => {
		const baseline = insertionSnapshots(width, false);
		const observed = insertionSnapshots(width, true);
		expect(baseline.ancestors).toBe(0);
		expect(observed.ancestors).toBe(0);
		expect(observed.subtree).toBe(baseline.subtree + width);
	},
);

it("preserves header image and stylesheet enforcement after sibling insertion", () => {
	const { tree, body } = fixture();
	const policy = documentImageContentSecurityPolicy(tree, [
		"img-src 'self'; style-src https://styles.example",
	]);
	for (let index = 0; index < 32; index++)
		tree.append(body, tree.createElement("div"));
	expect(() => policy.check("https://example.com/image.png")).not.toThrow();
	expect(() => policy.check("https://styles.example/image.png")).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(() =>
		policy.checkStylesheet("https://styles.example/main.css"),
	).not.toThrow();
	expect(() => policy.checkStylesheet("https://example.com/main.css")).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
});

it("scans nested metadata only after its detached subtree connects and retains denial", () => {
	const { tree, body } = fixture();
	const policy = documentImageContentSecurityPolicy(tree, []);
	const container = tree.createElement("div");
	const nested = tree.createElement("section");
	const meta = tree.createElement("meta");
	tree.append(container, nested);
	tree.append(nested, meta);
	tree.setAttribute(meta, "http-equiv", "CONTENT-SECURITY-POLICY");
	tree.setAttribute(meta, "content", "img-src *; style-src *");
	expect(() => policy.check("https://example.com/image.png")).not.toThrow();
	expect(() =>
		policy.checkStylesheet("https://example.com/main.css"),
	).not.toThrow();
	const walk = vi.spyOn(tree, "walk");
	tree.append(body, container);
	expect(walk).toHaveBeenCalledWith(container);
	expect(() => policy.check("https://example.com/image.png")).toThrow(
		"Meta image CSP",
	);
	expect(() => policy.checkStylesheet("https://example.com/main.css")).toThrow(
		"Meta stylesheet CSP",
	);
	tree.remove(meta);
	tree.remove(container);
	expect(() => policy.check("https://example.com/image.png")).toThrow(
		"Meta image CSP",
	);
	expect(() => policy.checkStylesheet("https://example.com/main.css")).toThrow(
		"Meta stylesheet CSP",
	);
});

it("detects connected meta attribute changes without weakening on later edits", () => {
	const { tree, body } = fixture();
	const policy = documentImageContentSecurityPolicy(tree, []);
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy-report-only",
		content: "img-src 'none'; style-src 'none'",
	});
	tree.append(body, meta);
	expect(() => policy.check("https://example.com/image.png")).not.toThrow();
	expect(() =>
		policy.checkStylesheet("https://example.com/main.css"),
	).not.toThrow();
	tree.setAttribute(meta, "http-equiv", "Content-Security-Policy");
	tree.removeAttribute(meta, "http-equiv");
	tree.setAttribute(meta, "content", "img-src *; style-src *");
	expect(() => policy.check("https://example.com/image.png")).toThrow(
		"Meta image CSP",
	);
	expect(() => policy.checkStylesheet("https://example.com/main.css")).toThrow(
		"Meta stylesheet CSP",
	);
});

it.each(["parentOf", "walk"] as const)(
	"fails closed for images and styles after a %s traversal failure",
	(method) => {
		const { tree, body } = fixture();
		const policy = documentImageContentSecurityPolicy(tree, []);
		const failure =
			method === "parentOf"
				? new AgentBrowserError("not-found", "Unknown ancestor fixture")
				: new Error("Subtree traversal fixture failure");
		const traversal = vi.spyOn(tree, method).mockImplementation(() => {
			throw failure;
		});
		expect(() => tree.append(body, tree.createElement("div"))).not.toThrow();
		expect(traversal).toHaveBeenCalled();
		traversal.mockRestore();
		tree.append(body, tree.createElement("div"));
		const expected = expect.objectContaining({
			code: method === "parentOf" ? "not-found" : "policy-denied",
			message:
				method === "parentOf"
					? failure.message
					: "Image CSP metadata processing failed",
		});
		expect(() => policy.check("https://example.com/image.png")).toThrow(
			expected,
		);
		expect(() =>
			policy.checkStylesheet("https://example.com/main.css"),
		).toThrow(expected);
	},
);

it("debits exactly once per parent edge until the public metadata budget fails closed", () => {
	const { tree, body } = fixture();
	let parent = body;
	for (let depth = 0; depth < 238; depth++) {
		const element = tree.createElement("div");
		tree.append(parent, element);
		parent = element;
	}
	const meta = tree.createElement("meta");
	tree.append(parent, meta);
	const initialNodes = [...tree.walk()].length;
	const ancestorEdges = 241;
	expect(initialNodes).toBe(ancestorEdges + 1);
	const workLimit = 2_000_000;
	const successfulUpdates = Math.floor(
		(workLimit - initialNodes) / (ancestorEdges + 1),
	);
	let traversedEdges = 0;
	const parentOf = tree.parentOf;
	tree.parentOf = (id) => {
		const result = parentOf.call(tree, id);
		if (result !== null) traversedEdges++;
		return result;
	};
	try {
		const policy = documentImageContentSecurityPolicy(tree, []);
		expect(traversedEdges).toBe(0);
		for (let index = 0; index < successfulUpdates; index++)
			tree.setAttribute(meta, "data-index", String(index));
		expect(traversedEdges).toBe(successfulUpdates * ancestorEdges);
		expect(() => policy.check("https://example.com/image.png")).not.toThrow();
		expect(() =>
			policy.checkStylesheet("https://example.com/main.css"),
		).not.toThrow();
		const workBeforeFailure = initialNodes + traversedEdges + successfulUpdates;
		const edgesBeforeFailure = traversedEdges;
		const remainingWork = workLimit - workBeforeFailure;
		expect(remainingWork).toBeLessThan(ancestorEdges);
		tree.setAttribute(meta, "data-index", String(successfulUpdates));
		expect(traversedEdges - edgesBeforeFailure).toBe(remainingWork + 1);
		const expected = expect.objectContaining({
			code: "resource-limit",
			message: "Image CSP metadata work limit exceeded",
		});
		expect(() => policy.check("https://example.com/image.png")).toThrow(
			expected,
		);
		expect(() =>
			policy.checkStylesheet("https://example.com/main.css"),
		).toThrow(expected);
		tree.remove(meta);
		tree.append(body, tree.createElement("div"));
		expect(traversedEdges - edgesBeforeFailure).toBe(remainingWork + 1);
		expect(() => policy.check("https://example.com/image.png")).toThrow(
			expected,
		);
	} finally {
		tree.parentOf = parentOf;
	}
});
