import { describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";

describe("owned document attribute identity", () => {
	it("preserves identity through value changes and detaches old nodes on removal", () => {
		const tree = new DocumentTree("https://example.com/");
		const element = tree.createElement("div", { title: "before" });
		const original = tree.getAttributeNode(element, "TITLE");
		if (original === null) throw new Error("Missing attribute");
		expect(tree.getAttributeNode(element, "title")).toBe(original);
		tree.setAttribute(element, "title", "after");
		expect(tree.getAttributeRecord(original)).toMatchObject({
			name: "title",
			value: "after",
			ownerElement: element,
		});
		tree.removeAttribute(element, "title");
		tree.setAttribute(element, "title", "again");
		expect(tree.getAttributeRecord(original)).toMatchObject({
			value: "after",
			ownerElement: null,
		});
		expect(tree.getAttributeNode(element, "title")).not.toBe(original);
	});

	it("attaches, replaces, removes and reattaches the exact attribute object", () => {
		const tree = new DocumentTree("https://example.com/");
		const element = tree.createElement("div", { title: "before" });
		const other = tree.createElement("p");
		const original = tree.getAttributeNode(element, "title");
		const replacement = tree.createAttribute("TITLE", "replacement");
		expect(tree.setAttributeNode(element, replacement)).toBe(original);
		expect(tree.getAttributeNode(element, "title")).toBe(replacement);
		expect(tree.setAttributeNode(element, replacement)).toBe(replacement);
		expect(() => tree.setAttributeNode(other, replacement)).toThrow(/in use/i);
		tree.removeAttributeNode(element, replacement);
		expect(tree.setAttributeNode(other, replacement)).toBeNull();
		tree.setAttributeValue(replacement, "changed");
		expect(tree.get(other).attributes.title).toBe("changed");
	});

	it("shares text/node limits and leaves attached values unchanged after failure", () => {
		const tree = new DocumentTree("about:blank", {
			maxTextCodeUnits: 20,
			maxNodes: 3,
		});
		const element = tree.createElement("div", { title: "a" });
		const attribute = tree.getAttributeNode(element, "title");
		if (attribute === null) throw new Error("Missing attribute");
		expect(tree.nodeCount).toBe(3);
		expect(() => tree.createAttribute("next")).toThrow(/node limit/i);
		const revision = tree.revision;
		expect(() => tree.setAttributeValue(attribute, "longer-value")).toThrow(
			/text limit/i,
		);
		expect(tree.get(element).attributes.title).toBe("a");
		expect(tree.getAttributeRecord(attribute).value).toBe("a");
		expect(tree.revision).toBe(revision);
		tree.removeAttribute(element, "title");
		tree.setAttributeValue(attribute, "detached");
		expect(tree.getAttributeRecord(attribute).value).toBe("detached");
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(() => tree.getAttributeRecord(attribute)).toThrow(/closed/i);
	});

	it("rejects foreign and unrelated attribute records without mutation", () => {
		const tree = new DocumentTree("about:blank");
		const foreign = new DocumentTree("about:blank");
		const element = tree.createElement("div", { title: "a" });
		const unrelated = tree.createAttribute("title", "other");
		expect(() => tree.removeAttributeNode(element, unrelated)).toThrow(
			/not attached/i,
		);
		expect(() =>
			tree.setAttributeNode(element, foreign.createAttribute("title")),
		).toThrow(/attribute/i);
		expect(tree.get(element).attributes.title).toBe("a");
	});
});
