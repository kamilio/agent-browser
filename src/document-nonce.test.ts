import { afterEach, expect, it, vi } from "vitest";
import { documentNonce, setDocumentNonce } from "./document-nonce.js";
import { bindDocumentScriptCsp } from "./document-script-csp.js";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { initializeScriptElement } from "./script-element-state.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object: object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};

function fixture() {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	return { tree, dom };
}

it("leaves unbound script nonce reflection unchanged", () => {
	const { tree, dom } = fixture();
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(tree.root, id);
	const script = dom.node(id);
	expect(Reflect.get(script, "nonce")).toBe("synthetic");
	expect(tree.get(id).attributes.nonce).toBe("synthetic");
	Reflect.set(script, "nonce", "changed");
	expect(tree.get(id).attributes.nonce).toBe("changed");
});

it("hides connected generic nonce attributes and selectors while preserving script IDL identity", () => {
	const { tree, dom } = fixture();
	bindDocumentScriptCsp(tree, {
		"content-security-policy": ["script-src 'nonce-synthetic'"],
	});
	const id = tree.createElement("script", { nonce: "synthetic" });
	const script = dom.node(id);
	tree.append(tree.root, id);
	expect(dom.node(id)).toBe(script);
	expect(Reflect.get(script, "nonce")).toBe("synthetic");
	expect(documentNonce(tree, id)).toBe("synthetic");
	expect(tree.get(id).attributes.nonce).toBe("");
	expect(Reflect.get(script, "getAttribute")("nonce")).toBe("");
	const query = Reflect.get(dom.document, "querySelector");
	expect(query('[nonce="synthetic"]')).toBeNull();
	expect(query('[nonce=""]')).toBe(script);
	expect(Reflect.get(script, "outerHTML")).not.toContain("synthetic");
});

it("captures before connection observers and never includes the stored nonce in mutation oldValue", () => {
	const { tree } = fixture();
	const seen: unknown[] = [];
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.onMutation((record) => {
		seen.push(tree.get(id).attributes.nonce, record.oldValue);
	});
	bindDocumentScriptCsp(tree, {});
	tree.append(tree.root, id);
	tree.setAttribute(id, "nonce", "replacement");
	tree.removeAttribute(id, "nonce");
	expect(seen).not.toContain("synthetic");
	expect(seen).not.toContain("replacement");
	expect(documentNonce(tree, id)).toBe("");
});

it("keeps raw parser inputs and detached snapshots immutable rather than rewriting evidence", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const raw = Object.freeze({
		nonce: "parser-synthetic",
		"data-proof": "original",
	});
	const id = tree.createParserElement("script", raw);
	const detached = tree.get(id);
	expect(detached.attributes.nonce).toBe("parser-synthetic");
	tree.append(tree.root, id);
	expect(documentNonce(tree, id)).toBe("parser-synthetic");
	expect(tree.get(id).attributes.nonce).toBe("");
	expect(raw.nonce).toBe("parser-synthetic");
	expect(detached.attributes.nonce).toBe("parser-synthetic");
});

it("tracks property, generic attribute and Attr.value changes without exposing stored values", () => {
	const { tree, dom } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("script", { nonce: "initial" });
	const script = dom.node(id);
	const attribute = Reflect.get(script, "getAttributeNode")("nonce");
	tree.append(tree.root, id);
	expect(attribute.value).toBe("");
	Reflect.set(script, "nonce", "from-idl");
	expect(documentNonce(tree, id)).toBe("from-idl");
	expect(attribute.value).toBe("");
	attribute.value = "from-attribute";
	expect(Reflect.get(script, "nonce")).toBe("from-attribute");
	expect(attribute.value).toBe("");
	tree.setAttribute(id, "nonce", "from-tree");
	expect(documentNonce(tree, id)).toBe("from-tree");
	expect(tree.get(id).attributes.nonce).toBe("");
	tree.removeAttribute(id, "nonce");
	expect(documentNonce(tree, id)).toBe("");
});

it("hides newly attached Attr values and non-script HTML nonce attributes", () => {
	const { tree, dom } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("div");
	tree.append(tree.root, id);
	const element = dom.node(id);
	const attribute = Reflect.get(dom.document, "createAttribute")("nonce");
	attribute.value = "attached-synthetic";
	Reflect.get(element, "setAttributeNode")(attribute);
	expect(attribute.value).toBe("");
	expect(tree.get(id).attributes.nonce).toBe("");
	expect(documentNonce(tree, id)).toBe("attached-synthetic");
});

it("retains hidden values through detach and clone without sharing native storage", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(tree.root, id);
	const copy = tree.clone(id);
	expect(documentNonce(tree, copy)).toBe("synthetic");
	setDocumentNonce(tree, copy, "copy-only");
	expect(documentNonce(tree, id)).toBe("synthetic");
	tree.remove(id);
	expect(documentNonce(tree, id)).toBe("synthetic");
	expect(tree.get(id).attributes.nonce).toBe("");
});

it("rejects invalid identities and string coercion and revokes storage with the document", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("script");
	const read = vi.fn(() => "synthetic");
	expect(() =>
		setDocumentNonce(tree, id, { toString: read } as unknown as string),
	).toThrow();
	expect(() => documentNonce(tree, { id } as unknown as number)).toThrow();
	expect(read).not.toHaveBeenCalled();
	setDocumentNonce(tree, id, "synthetic");
	tree.close();
	expect(() => documentNonce(tree, id)).toThrow(/closed/);
	expect(() => setDocumentNonce(tree, id, "replacement")).toThrow(/closed/);
});

it("invalidates warmed views and selectors at binding without fabricating mutation records", () => {
	const { tree, dom } = fixture();
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(tree.root, id);
	const before = tree.get(id);
	const query = Reflect.get(dom.document, "querySelector");
	expect(query('[nonce="synthetic"]')).toBe(dom.node(id));
	const collector = vi.fn();
	tree.onMutation(collector);
	const notifications = tree.mutationMetrics().notifications;
	const revision = tree.revision;
	const owner = bindDocumentScriptCsp(tree, {});
	expect(collector).not.toHaveBeenCalled();
	expect(tree.mutationMetrics().notifications).toBe(notifications);
	expect(tree.changesSince(revision).reset).toBe(true);
	expect(query('[nonce="synthetic"]')).toBeNull();
	expect(query('[nonce=""]')).toBe(dom.node(id));
	expect(tree.elementInfo(id).attributes.nonce).toBe("");
	expect(before.attributes.nonce).toBe("synthetic");
	owner.close();
	tree.setAttribute(id, "nonce", "after-close");
	expect(tree.get(id).attributes.nonce).toBe("");
	expect(documentNonce(tree, id)).toBe("after-close");
});

it("does not leak hidden values through removed, replaced or cloned Attr identities", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(tree.root, id);
	const captured = tree.getAttributeNode(id, "nonce");
	if (captured === null) throw new Error("Missing nonce attribute");
	const copied = tree.cloneAttribute(captured);
	expect(tree.getAttributeRecord(copied).value).toBe("");
	const replacement = tree.createAttribute("nonce", "replacement");
	expect(tree.setAttributeNode(id, replacement)).toBe(captured);
	expect(tree.getAttributeRecord(captured)).toMatchObject({
		value: "",
		ownerElement: null,
	});
	expect(documentNonce(tree, id)).toBe("replacement");
	expect(tree.removeAttributeNode(id, replacement)).toBe(replacement);
	expect(tree.getAttributeRecord(replacement)).toMatchObject({
		value: "",
		ownerElement: null,
	});
	expect(documentNonce(tree, id)).toBe("");
});

it("hides entire inserted fragments before an earlier observer can detach a descendant", () => {
	const { tree } = fixture();
	const fragment = tree.createFragment();
	const wrapper = tree.createElement("div");
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(wrapper, id);
	tree.append(fragment, wrapper);
	const snapshot = tree.get(id);
	const seen: unknown[] = [];
	tree.onMutation(() => {
		if (tree.isConnected(id)) tree.remove(id);
		seen.push(tree.get(id).attributes.nonce);
	});
	bindDocumentScriptCsp(tree, {});
	tree.append(tree.root, fragment);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.every((value) => value === "")).toBe(true);
	expect(snapshot.attributes.nonce).toBe("synthetic");
	expect(documentNonce(tree, id)).toBe("synthetic");
});

it("transfers hidden native nonce state across document and template clones without granting eligibility", () => {
	const { tree } = fixture();
	const { tree: destination } = fixture();
	bindDocumentScriptCsp(tree, {});
	const owner = bindDocumentScriptCsp(destination, {
		"content-security-policy": ["script-src 'nonce-synthetic'"],
	});
	const wrapper = tree.createElement("div");
	const id = tree.createElement("script", { nonce: "synthetic" });
	initializeScriptElement(tree, id, "dynamic");
	tree.append(wrapper, id);
	tree.append(wrapper, tree.createElement("template"));
	tree.append(tree.root, wrapper);
	const copy = destination.copyFrom(tree, wrapper);
	const copiedScript = destination.get(copy).children[0];
	destination.append(destination.root, copy);
	expect(documentNonce(destination, copiedScript)).toBe("synthetic");
	expect(destination.get(copiedScript).attributes.nonce).toBe("");
	expect(owner.allowsScript(copiedScript)).toBe(false);
	setDocumentNonce(destination, copiedScript, "copy-only");
	expect(documentNonce(tree, id)).toBe("synthetic");
});

it("accounts for hidden strings in clone preflight and failed writes", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const id = tree.createElement("script", { nonce: "x".repeat(100) });
	tree.append(tree.root, id);
	const destination = new DocumentTree("https://example.com", {
		maxTextCodeUnits: 20,
	});
	trees.push(destination);
	const count = destination.nodeCount;
	expect(() => destination.copyFrom(tree, id)).toThrow(/text limit/);
	expect(destination.nodeCount).toBe(count);
	const small = destination.createElement("script", { nonce: "tiny" });
	destination.append(destination.root, small);
	bindDocumentScriptCsp(destination, {});
	const collector = vi.fn();
	destination.onMutation(collector);
	expect(() => setDocumentNonce(destination, small, "x".repeat(100))).toThrow(
		/text limit/,
	);
	expect(documentNonce(destination, small)).toBe("tiny");
	expect(destination.get(small).attributes.nonce).toBe("");
	expect(collector).not.toHaveBeenCalled();
});

it("fails closed on nonce scan exhaustion without exposing later connected values", () => {
	const { tree } = fixture();
	const owner = bindDocumentScriptCsp(tree, {}, { maxScanWork: 2 });
	const wrapper = tree.createElement("div");
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(wrapper, id);
	tree.append(tree.root, wrapper);
	expect(owner.unsupported).toBe(true);
	expect(tree.get(id).attributes.nonce).toBe("");
	expect(documentNonce(tree, id)).toBe("synthetic");
	owner.close();
	const later = tree.createElement("script", { nonce: "later" });
	tree.append(tree.root, later);
	expect(tree.get(later).attributes.nonce).toBe("");
});

it("preserves frozen mutation identity and bounded accounting for hidden same-value writes", () => {
	const { tree } = fixture();
	const id = tree.createElement("script", {
		nonce: "synthetic",
		title: "visible",
	});
	tree.append(tree.root, id);
	const first = vi.fn();
	const second = vi.fn();
	tree.onMutation(first);
	tree.onMutation(second);
	bindDocumentScriptCsp(tree, {});
	const before = tree.mutationMetrics();
	tree.setAttribute(id, "nonce", "synthetic");
	tree.setAttribute(id, "title", "changed");
	expect(first).toHaveBeenCalledTimes(2);
	expect(second.mock.calls[0][0]).toBe(first.mock.calls[0][0]);
	expect(Object.isFrozen(first.mock.calls[0][0])).toBe(true);
	expect(first.mock.calls[0][0]).toMatchObject({
		type: "attributes",
		target: id,
		attributeName: "nonce",
		oldValue: "",
	});
	expect(first.mock.calls[1][0].oldValue).toBe("visible");
	expect(tree.mutationMetrics().notifications).toBe(before.notifications + 2);
	expect(tree.mutationMetrics().collectorFailures).toBe(
		before.collectorFailures,
	);
});

it("keeps hidden native strings budgeted and releases only detached Attr storage", () => {
	const { tree } = fixture();
	const id = tree.createElement("script", { nonce: "synthetic" });
	tree.append(tree.root, id);
	const captured = tree.getAttributeNode(id, "nonce");
	if (captured === null) throw new Error("Missing nonce attribute");
	const before = tree.resourceUsage();
	bindDocumentScriptCsp(tree, {});
	expect(tree.resourceUsage()).toEqual(before);
	const copy = tree.clone(id);
	expect(documentNonce(tree, copy)).toBe("synthetic");
	expect(tree.resourceUsage().textCodeUnits).toBe(
		before.textCodeUnits + "scriptnoncesynthetic".length,
	);
	tree.removeAttributeNode(id, captured);
	expect(tree.resourceUsage().textCodeUnits).toBe(
		before.textCodeUnits + "script".length - "synthetic".length,
	);
	expect(tree.getAttributeRecord(captured).value).toBe("");
});

it("does not hide foreign or qualified attributes that only spell nonce", () => {
	const { tree } = fixture();
	bindDocumentScriptCsp(tree, {});
	const foreign = tree.createParserElement(
		"script",
		{ nonce: "foreign" },
		svgNamespace,
	);
	tree.append(tree.root, foreign);
	expect(tree.get(foreign).attributes.nonce).toBe("foreign");
	const id = tree.createElement("script");
	tree.append(tree.root, id);
	tree.setAttribute(id, "x:nonce", "qualified");
	expect(tree.get(id).attributes["x:nonce"]).toBe("qualified");
	expect(documentNonce(tree, id)).toBe("");
	const captured = tree.getAttributeNode(id, "x:nonce");
	if (captured === null) throw new Error("Missing qualified attribute");
	expect(tree.getAttributeRecord(captured).value).toBe("qualified");
});
