import { afterEach, expect, it } from "vitest";
import { DocumentTree, type DocumentLimits } from "./document.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentResources } from "./document-resources.js";
import { DocumentQueries } from "./selectors.js";
import { parseHtmlDocument } from "./html-parser.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function document(limits: Partial<DocumentLimits> = {}) {
	const tree = new DocumentTree("https://example.com/", limits);
	trees.push(tree);
	return tree;
}

it("creates template contents in a separate shared native owner", () => {
	const tree = document();
	const first = tree.createElement("template");
	const second = tree.createElement("template");
	const content = tree.templateContent(first);
	expect(tree.templateContent(first)).toBe(content);
	expect(content.tree).not.toBe(tree);
	expect(tree.templateContent(second).tree).toBe(content.tree);
	expect(content.tree.url).toBe("about:blank");
	expect(content.tree.get(content.id).kind).toBe("fragment");
	expect(content.tree.get(content.id).parent).toBeNull();
	expect(tree.get(first).children).toEqual([]);
});

it("serializes template contents rather than ordinary template children", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("content"));
	tree.append(template, tree.createText("ordinary"));
	expect(serializeHtml(tree, template)).toBe("content");
	expect(serializeHtml(tree, template, { includeSelf: true })).toBe(
		"<template>content</template>",
	);
	expect(tree.textContent(template)).toBe("ordinary");
});

it("copies template contents without sharing their native identities", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("source"));
	const copy = tree.clone(template, true);
	const copied = tree.templateContent(copy);
	expect(copied.id).not.toBe(content.id);
	expect(copied.tree.textContent(copied.id)).toBe("source");
});

it("marks one inert template document and reuses it for nested templates", () => {
	const tree = document();
	const template = tree.createElement("TEMPLATE");
	const content = tree.templateContent(template);
	expect(tree.isTemplateContentsDocument).toBe(false);
	expect(content.tree.isTemplateContentsDocument).toBe(true);
	const nested = content.tree.createElement("template");
	const inner = content.tree.templateContent(nested);
	expect(inner.tree).toBe(content.tree);
	expect(content.tree.templateHost(content.id)).toEqual({ tree, id: template });
	expect(inner.tree.templateHost(inner.id)).toEqual({
		tree: content.tree,
		id: nested,
	});
	expect(Object.isFrozen(content)).toBe(true);
	expect(Object.isFrozen(content.tree.templateHost(content.id))).toBe(true);
});

it("keeps DOM ancestry, connectivity, queries and revisions separate from host ancestry", () => {
	const tree = document();
	const template = tree.createElement("template");
	tree.append(tree.root, template);
	const content = tree.templateContent(template);
	const revision = tree.revision;
	const child = content.tree.createElement("p", { id: "inside" });
	content.tree.append(content.id, child);
	expect(content.tree.isConnected(child)).toBe(false);
	expect(content.tree.rootOf(child)).toBe(content.id);
	expect(content.tree.get(child).parent).toBe(content.id);
	expect(tree.revision).toBe(revision);
	expect(tree.textContent(tree.root)).toBe("");
	expect([...tree.walk()].map(({ node }) => node.id)).toEqual([
		tree.root,
		template,
	]);
	const mainQueries = new DocumentQueries(tree);
	const inertQueries = new DocumentQueries(content.tree);
	expect(mainQueries.querySelector("#inside")).toBeNull();
	expect(inertQueries.querySelector("#inside")).toBeNull();
	expect(inertQueries.querySelector("#inside", content.id)).toBe(child);
});

it("keeps ordinary fragments unhosted and rejects invalid content queries", () => {
	const tree = document();
	expect(tree.templateHost(tree.createFragment())).toBeNull();
	expect(() => tree.templateContent(tree.createElement("div"))).toThrow(
		"Expected a template",
	);
	expect(() => tree.templateHost(tree.createText("x"))).toThrow(
		"Expected a document fragment",
	);
});

it("preflights first-template roots, fragments and text without partial nodes", () => {
	const tree = document({ maxNodes: 3 });
	const before = tree.resourceUsage();
	expect(() => tree.createElement("template")).toThrow("node limit");
	expect(tree.resourceUsage()).toEqual(before);
	const short = document({ maxTextCodeUnits: 7 });
	expect(() => short.createElement("template")).toThrow("text limit");
	expect(short.nodeCount).toBe(1);
});

it("shares the main document node budget with all contents and nested templates", () => {
	const tree = document({ maxNodes: 6 });
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.createElement("template");
	expect(tree.nodeCount + content.tree.nodeCount).toBe(6);
	expect(() => tree.createText("")).toThrow("node limit");
	expect(() => content.tree.createFragment()).toThrow("node limit");
});

it("shares text capacity without releasing detached template content", () => {
	const tree = document({ maxTextCodeUnits: 12 });
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	const text = content.tree.createText("four");
	content.tree.append(content.id, text);
	content.tree.remove(text);
	expect(() => tree.createText("x")).toThrow("text limit");
	content.tree.setData(text, "");
	tree.createText("more");
	expect(
		tree.resourceUsage().textCodeUnits +
			content.tree.resourceUsage().textCodeUnits,
	).toBe(12);
});

it("uses an existing document resource pool rather than multiplying quotas", () => {
	const pool = new DocumentResources({ maxNodes: 5 });
	const tree = new DocumentTree("about:blank", {}, pool);
	trees.push(tree);
	const sibling = new DocumentTree("about:blank", {}, pool);
	trees.push(sibling);
	tree.createElement("template");
	expect(pool.metrics()).toMatchObject({ documents: 3, nodes: 5 });
	expect(() => sibling.createText("x")).toThrow("node limit");
	tree.close();
	expect(pool.metrics()).toMatchObject({ documents: 1, nodes: 1 });
	sibling.createText("still open");
});

it("does not allocate an element when the shared document count is exhausted", () => {
	const pool = new DocumentResources({ maxDocuments: 1 });
	const tree = new DocumentTree("about:blank", {}, pool);
	trees.push(tree);
	expect(() => tree.createElement("template")).toThrow("document count limit");
	expect(tree.nodeCount).toBe(1);
});

it("prevents a template from entering its own contents", () => {
	const tree = document();
	const outer = tree.templateContent(tree.createElement("template"));
	const template = outer.tree.createElement("template");
	const inner = outer.tree.templateContent(template);
	expect(() => outer.tree.append(inner.id, template)).toThrow(
		"host graph cannot contain cycles",
	);
	expect(outer.tree.get(template).parent).toBeNull();
});

it("prevents indirect host cycles before detaching a moving subtree", () => {
	const tree = document();
	const content = tree.templateContent(tree.createElement("template"));
	const parent = content.tree.createElement("div");
	const template = content.tree.createElement("template");
	content.tree.append(parent, template);
	content.tree.append(content.id, parent);
	const inner = content.tree.templateContent(template);
	expect(() => content.tree.append(inner.id, parent)).toThrow(
		"host graph cannot contain cycles",
	);
	expect(content.tree.get(parent).parent).toBe(content.id);
	expect(content.tree.get(template).parent).toBe(parent);
});

it("checks hosts when fragments are spliced or children are replaced", () => {
	const tree = document();
	const outer = tree.templateContent(tree.createElement("template"));
	const fragment = outer.tree.createFragment();
	const template = outer.tree.createElement("template");
	outer.tree.append(fragment, template);
	const inner = outer.tree.templateContent(template);
	const existing = inner.tree.createText("existing");
	inner.tree.append(inner.id, existing);
	expect(() => inner.tree.append(inner.id, fragment)).toThrow(
		"host graph cannot contain cycles",
	);
	expect(() => inner.tree.replace(inner.id, template, existing)).toThrow(
		"host graph cannot contain cycles",
	);
	expect(inner.tree.get(inner.id).children).toEqual([existing]);
	expect(inner.tree.get(template).parent).toBe(fragment);
});

it("charges host edges against depth limits", () => {
	const tree = document({ maxDepth: 4 });
	const template = tree.createElement("template");
	tree.append(tree.root, template);
	const content = tree.templateContent(template);
	const nested = content.tree.createElement("template");
	content.tree.append(content.id, nested);
	const inner = content.tree.templateContent(nested);
	const text = inner.tree.createText("too deep");
	expect(() => inner.tree.append(inner.id, text)).toThrow("depth limit");
	expect(inner.tree.get(text).parent).toBeNull();
});

it("checks the complete hosted subtree depth before moving a template", () => {
	const tree = document({ maxDepth: 4 });
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("text"));
	const parent = tree.createElement("div");
	const child = tree.createElement("div");
	tree.append(parent, child);
	tree.append(tree.root, parent);
	expect(() => tree.append(child, template)).toThrow("depth limit");
	expect(tree.get(template).parent).toBeNull();
});

it("preflights hosted insertion depth before copying an incoming fragment", () => {
	const tree = document({ maxDepth: 3 });
	const template = tree.createElement("template");
	tree.append(tree.root, template);
	const content = tree.templateContent(template);
	const source = document();
	const fragment = source.createFragment();
	const parent = source.createElement("p");
	source.append(parent, source.createText("deep"));
	source.append(fragment, parent);
	const before = content.tree.resourceUsage();
	expect(() =>
		content.tree.insertChildrenFrom(content.id, source, fragment),
	).toThrow("depth limit");
	expect(content.tree.resourceUsage()).toEqual(before);
});

it("keeps foreign-node movement rejected rather than pretending adoption", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	expect(() => content.tree.append(content.id, template)).toThrow(
		"Unknown document node",
	);
});

it("copies nested contents, ordinary children and original payload state", () => {
	const source = document();
	const template = source.createElement("template", { id: "outer" });
	source.append(template, source.createText("ordinary"));
	const content = source.templateContent(template);
	const input = content.tree.createElement("input", {
		type: "text",
		value: "default",
	});
	content.tree.setControl(input, { value: "edited" }, "user");
	content.tree.setCustomValidity(input, "not copied");
	content.tree.append(content.id, input);
	const nested = content.tree.createElement("template");
	content.tree.append(content.id, nested);
	const inner = content.tree.templateContent(nested);
	inner.tree.append(inner.id, inner.tree.createText("nested"));
	const target = document();
	const copy = target.copyFrom(source, template);
	const copied = target.templateContent(copy);
	expect(target.textContent(copy)).toBe("ordinary");
	const copiedInput = copied.tree.get(copied.id).children[0];
	expect(copied.tree.get(copiedInput).control.value).toBe("edited");
	expect(copied.tree.wasUserEditedValue(copiedInput)).toBe(true);
	expect(copied.tree.getCustomValidity(copiedInput)).toBe("");
	expect(copied.tree).not.toBe(content.tree);
	const copiedNested = copied.tree.get(copied.id).children[1];
	const copiedInner = copied.tree.templateContent(copiedNested);
	expect(copiedInner.tree).toBe(copied.tree);
	expect(copiedInner.tree.textContent(copiedInner.id)).toBe("nested");
	source.close();
	expect(serializeHtml(target, copy)).toContain("nested");
});

it("creates empty contents for shallow template clones", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("not copied"));
	tree.append(template, tree.createText("ordinary"));
	const copy = tree.clone(template, true);
	const shallow = tree.copyFrom(tree, template, false);
	expect(serializeHtml(tree, copy)).toBe("not copied");
	expect(serializeHtml(tree, shallow)).toBe("");
	expect(tree.get(shallow).children).toEqual([]);
});

it("imports content fragments without carrying their external host link", () => {
	const source = document();
	const content = source.templateContent(source.createElement("template"));
	content.tree.append(content.id, content.tree.createText("copy"));
	const target = document();
	const fragment = target.copyFrom(content.tree, content.id);
	expect(target.templateHost(fragment)).toBeNull();
	target.append(target.root, fragment);
	expect(target.textContent(target.root)).toBe("copy");
});

it("preflights all nested clone node and text allocations", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	content.tree.append(content.id, content.tree.createText("payload"));
	for (const target of [
		document({ maxNodes: 4 }),
		document({ maxTextCodeUnits: 14 }),
	]) {
		const before = target.resourceUsage();
		expect(() => target.copyFrom(source, template)).toThrow("limit");
		expect(target.resourceUsage()).toEqual(before);
	}
});

it("preflights a missing template document before copying preceding ordinary nodes", () => {
	const source = document();
	const fragment = source.createFragment();
	source.append(fragment, source.createText("first"));
	source.append(fragment, source.createElement("template"));
	const pool = new DocumentResources({ maxDocuments: 1 });
	const target = new DocumentTree("about:blank", {}, pool);
	trees.push(target);
	expect(() => target.copyFrom(source, fragment)).toThrow(
		"document count limit",
	);
	expect(target.nodeCount).toBe(1);
});

it("serializes nested content with one global output limit and correct escaping", () => {
	const tree = document();
	const template = tree.createElement("template", { id: '"outer' });
	const content = tree.templateContent(template);
	const nested = content.tree.createElement("template");
	content.tree.append(content.id, nested);
	const inner = content.tree.templateContent(nested);
	inner.tree.append(inner.id, inner.tree.createText("<&"));
	const html =
		'<template id="&quot;outer"><template>&lt;&amp;</template></template>';
	expect(
		serializeHtml(tree, template, {
			includeSelf: true,
			maxCodeUnits: html.length,
		}),
	).toBe(html);
	expect(() =>
		serializeHtml(tree, template, {
			includeSelf: true,
			maxCodeUnits: html.length - 1,
		}),
	).toThrow("output limit");
});

it("keeps raw script text raw inside serialized template contents", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	const script = content.tree.createElement("script");
	content.tree.append(script, content.tree.createText("if (a < b) run('&');"));
	content.tree.append(content.id, script);
	expect(serializeHtml(tree, template)).toBe(
		"<script>if (a < b) run('&');</script>",
	);
});

it("revokes the associated document before host close callbacks run", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	let checked = false;
	tree.onClose(() => {
		checked = true;
		expect(() => content.tree.get(content.id)).toThrow("closed");
	});
	tree.close();
	expect(checked).toBe(true);
	expect(content.tree.resourceUsage()).toEqual({ nodes: 0, textCodeUnits: 0 });
	expect(() => tree.templateContent(template)).toThrow("closed");
});

it("continues parent cleanup after template-owner cleanup errors", () => {
	const tree = document();
	const content = tree.templateContent(tree.createElement("template"));
	content.tree.onClose(() => {
		throw new Error("inert cleanup");
	});
	let parentClosed = false;
	tree.onClose(() => {
		parentClosed = true;
	});
	expect(() => tree.close()).toThrow("Document cleanup failed");
	expect(parentClosed).toBe(true);
	expect(tree.nodeCount).toBe(0);
	expect(content.tree.nodeCount).toBe(0);
});

it("does not replace an explicitly closed contents owner with fresh identities", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.close();
	const before = tree.resourceUsage();
	expect(() => tree.templateContent(template)).toThrow("closed");
	expect(() => tree.createElement("template")).toThrow("closed");
	expect(tree.resourceUsage()).toEqual(before);
});

it("keeps parsed contents separate from ordinary template children", () => {
	const tree = parseHtmlDocument(
		"<template><p>not ordinary children</template>",
		"https://example.com",
	);
	trees.push(tree);
	const template = [...tree.walk()].find(
		({ node }) => node.tagName === "template",
	);
	if (!template) throw new Error("Missing template");
	expect(template.node.children).toEqual([]);
	const content = tree.templateContent(template.node.id);
	expect(content.tree.textContent(content.id)).toBe("not ordinary children");
});

it("preserves copied option and checkedness state in detached contents", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	const select = content.tree.createElement("select");
	const first = content.tree.createElement("option");
	const second = content.tree.createElement("option");
	content.tree.append(select, first);
	content.tree.append(select, second);
	content.tree.append(content.id, select);
	content.tree.setControl(second, { selected: true });
	const checkbox = content.tree.createElement("input", { type: "checkbox" });
	content.tree.setInputChecked(checkbox, true);
	content.tree.append(content.id, checkbox);
	const target = document();
	const copy = target.templateContent(target.copyFrom(source, template));
	const [copiedSelect, copiedCheckbox] = copy.tree.get(copy.id).children;
	const [copiedFirst, copiedSecond] = copy.tree.get(copiedSelect).children;
	expect(copy.tree.get(copiedFirst).control.selected).toBe(false);
	expect(copy.tree.get(copiedSecond).control.selected).toBe(true);
	expect(copy.tree.get(copiedCheckbox).control.checked).toBe(true);
	copy.tree.setAttribute(copiedCheckbox, "checked", "");
	copy.tree.removeAttribute(copiedCheckbox, "checked");
	expect(copy.tree.get(copiedCheckbox).control.checked).toBe(true);
});

it("checks copied content depth before creating target nodes", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	content.tree.append(content.id, content.tree.createElement("template"));
	const target = document({ maxDepth: 2 });
	expect(() => target.copyFrom(source, template)).toThrow(
		"Template graph depth limit",
	);
	expect(target.nodeCount).toBe(1);
	const shallow = target.copyFrom(source, template, false);
	expect(serializeHtml(target, shallow)).toBe("");
});

it("keeps aggregate clone quotas under reentrant native allocation", () => {
	const source = document();
	const fragment = source.createFragment();
	source.append(fragment, source.createText("a"));
	source.append(fragment, source.createElement("template"));
	source.append(fragment, source.createText("b"));
	const pool = new DocumentResources({ maxTextCodeUnits: 12 });
	const target = new DocumentTree(
		"about:blank",
		{ maxTextCodeUnits: 12 },
		pool,
	);
	trees.push(target);
	let interrupted = false;
	target.onChange(() => {
		if (interrupted) return;
		interrupted = true;
		target.createText("XXX");
	});
	expect(() => target.copyFrom(source, fragment)).toThrow("text limit");
	expect(interrupted).toBe(true);
	expect(pool.metrics().textCodeUnits).toBeLessThanOrEqual(12);
});

it("drains content through an ordinary fragment insertion without copying its host", () => {
	const source = document();
	const content = source.templateContent(source.createElement("template"));
	const child = content.tree.createElement("div");
	content.tree.append(content.id, child);
	const destination = content.tree.createElement("section");
	content.tree.append(destination, content.id);
	expect(content.tree.get(content.id).children).toEqual([]);
	expect(content.tree.get(destination).children).toEqual([child]);
	expect(content.tree.templateHost(content.id)).not.toBeNull();
	expect(content.tree.get(content.id).parent).toBeNull();
});

it("closes imported contents independently of the source", () => {
	const source = document();
	const template = source.createElement("template");
	const original = source.templateContent(template);
	original.tree.append(original.id, original.tree.createText("source"));
	const target = document();
	const copied = target.templateContent(target.copyFrom(source, template));
	target.close();
	expect(() => copied.tree.get(copied.id)).toThrow("closed");
	expect(original.tree.textContent(original.id)).toBe("source");
});

it("preflights the host document's local node limit before allocating an owner", () => {
	const pool = new DocumentResources({ maxNodes: 20 });
	const tree = new DocumentTree("about:blank", { maxNodes: 1 }, pool);
	trees.push(tree);
	expect(() => tree.createElement("template")).toThrow("node limit");
	expect(pool.metrics()).toMatchObject({ documents: 1, nodes: 1 });
});

it("preflights the contents document's local node limit before allocating a host", () => {
	const pool = new DocumentResources({ maxNodes: 20 });
	const tree = new DocumentTree("about:blank", { maxNodes: 4 }, pool);
	trees.push(tree);
	const content = tree.templateContent(tree.createElement("template"));
	content.tree.createText("one");
	content.tree.createText("two");
	const before = pool.metrics();
	expect(() => tree.createElement("template")).toThrow("node limit");
	expect(pool.metrics()).toEqual(before);
});

it("preflights clone quotas in each destination document rather than charging all to one", () => {
	const source = document();
	const template = source.createElement("template");
	const pool = new DocumentResources({ maxNodes: 4 });
	const target = new DocumentTree("about:blank", { maxNodes: 2 }, pool);
	trees.push(target);
	const copy = target.copyFrom(source, template);
	expect(target.nodeCount).toBe(2);
	expect(target.templateContent(copy).tree.nodeCount).toBe(2);
	expect(pool.metrics().nodes).toBe(4);
});

it("budgets primary and content text separately inside a larger shared pool", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	content.tree.append(content.id, content.tree.createText("payload!"));
	const pool = new DocumentResources({ maxTextCodeUnits: 16 });
	const target = new DocumentTree("about:blank", { maxTextCodeUnits: 8 }, pool);
	trees.push(target);
	const copied = target.templateContent(target.copyFrom(source, template));
	expect(target.resourceUsage().textCodeUnits).toBe(8);
	expect(copied.tree.resourceUsage().textCodeUnits).toBe(8);
	expect(pool.metrics().textCodeUnits).toBe(16);
});

it("rejects a full content text budget before allocating a clone host", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	content.tree.append(content.id, content.tree.createText("1234567890123"));
	const pool = new DocumentResources({ maxTextCodeUnits: 100 });
	const target = new DocumentTree(
		"about:blank",
		{ maxTextCodeUnits: 16 },
		pool,
	);
	trees.push(target);
	const existing = target.templateContent(target.createElement("template"));
	existing.tree.append(existing.id, existing.tree.createText("used"));
	const before = pool.metrics();
	expect(() => target.copyFrom(source, template)).toThrow(
		"Document text limit",
	);
	expect(pool.metrics()).toEqual(before);
});

it("charges shallow clones in the inert owner to that same local document", () => {
	const pool = new DocumentResources({ maxNodes: 100 });
	const tree = new DocumentTree("about:blank", { maxNodes: 6 }, pool);
	trees.push(tree);
	const content = tree.templateContent(tree.createElement("template"));
	const nested = content.tree.createElement("template");
	const copy = content.tree.clone(nested, false);
	expect(content.tree.templateContent(copy).tree).toBe(content.tree);
	expect(content.tree.nodeCount).toBe(6);
	expect(pool.metrics().documents).toBe(2);
});
