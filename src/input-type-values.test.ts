import { afterEach, expect, it } from "vitest";
import { controlChecked, controlValue, inputType } from "./controls.js";
import {
	type DocumentAttribute,
	type DocumentNode,
	DocumentTree,
} from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(attributes: Record<string, string> = { value: "default" }) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement("input", attributes);
	tree.append(tree.root, id);
	return { tree, id, value: () => controlValue(tree, id) };
}

it.each(["hidden", "checkbox", "radio", "submit", "reset", "button", "image"])(
	"copies a nonempty current value into the default when entering %s",
	(type) => {
		const { tree, id, value } = fixture();
		tree.setControl(id, { value: "edited" });
		tree.setAttribute(id, "type", type);
		expect(tree.get(id).attributes.value).toBe("edited");
		expect(value()).toBe("edited");
		tree.setAttribute(id, "value", "new default");
		expect(value()).toBe("new default");
	},
);

it("resets value dirtiness when returning from a reflected mode", () => {
	const { tree, id, value } = fixture();
	tree.setControl(id, { value: "edited" });
	tree.setAttribute(id, "type", "hidden");
	tree.setAttribute(id, "value", "new default");
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("new default");
	tree.setAttribute(id, "value", "later");
	expect(value()).toBe("later");
});

it.each([false, true])(
	"does not resurrect text sanitized by a numeric transition when dirty=%s",
	(dirty) => {
		const { tree, id, value } = fixture({ value: "not numeric" });
		if (dirty) tree.setControl(id, { value: "edited text" });
		tree.setAttribute(id, "type", "number");
		expect(value()).toBe("");
		tree.setAttribute(id, "type", "text");
		expect(value()).toBe("");
		expect(tree.get(id).attributes.value).toBe("not numeric");
	},
);

it("does not restore whitespace removed by a URL type transition", () => {
	const { tree, id, value } = fixture({
		value: "  https://fixture.invalid/  ",
	});
	tree.setAttribute(id, "type", "url");
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("https://fixture.invalid/");
});

it("does not copy an empty current value over a reflected default", () => {
	const { tree, id, value } = fixture();
	tree.setControl(id, { value: "" });
	tree.setAttribute(id, "type", "button");
	expect(tree.get(id).attributes.value).toBe("default");
	expect(value()).toBe("default");
});

it("empties file-mode values rather than exposing text or value attributes", () => {
	const { tree, id, value } = fixture();
	tree.setControl(id, { value: "private text" });
	tree.setAttribute(id, "type", "file");
	expect(value()).toBe("");
	expect(tree.get(id).control.value).toBeUndefined();
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("default");
});

it.each(["remove", "attached-value", "replace-node"])(
	"applies type transitions through %s",
	(operation) => {
		const { tree, id, value } = fixture({ type: "number", value: "invalid" });
		if (operation === "remove") tree.removeAttribute(id, "type");
		else if (operation === "replace-node")
			tree.setAttributeNode(id, tree.createAttribute("type", "text"));
		else {
			const attribute = tree.getAttributeNode(id, "type");
			if (attribute === null) throw new Error("Missing type attribute");
			tree.setAttributeValue(attribute, "text");
		}
		expect(value()).toBe("");
		expect(tree.get(id).attributes.value).toBe("invalid");
	},
);

it("restores a clean value even when its default is set to the same attribute text", () => {
	const { tree, id, value } = fixture({ value: "invalid" });
	tree.setAttribute(id, "type", "number");
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("");
	tree.setAttribute(id, "value", "invalid");
	expect(value()).toBe("invalid");
});

it("keeps dirty sanitized values independent of later default changes", () => {
	const { tree, id, value } = fixture();
	tree.setControl(id, { value: "invalid" });
	tree.setAttribute(id, "type", "number");
	tree.setAttribute(id, "value", "123");
	expect(value()).toBe("");
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("");
	tree.clearControl(id, ["value"]);
	expect(value()).toBe("123");
});

it.each(["TEXT", "unknown", "weeK", ""])(
	"uses HTML type states rather than raw attribute spellings: %s",
	(type) => {
		const { tree, id, value } = fixture({ type: "url", value: "  text  " });
		tree.setAttribute(id, "type", type);
		expect(inputType(tree.get(id))).toBe("text");
		expect(value()).toBe("text");
		tree.setAttribute(id, "type", "TEXT");
		expect(value()).toBe("text");
	},
);

it.each([false, true])(
	"preserves clean/dirty value semantics through copying when dirty=%s",
	(dirty) => {
		const source = fixture({ value: "invalid" });
		if (dirty) source.tree.setControl(source.id, { value: "invalid" });
		source.tree.setAttribute(source.id, "type", "number");
		source.tree.setAttribute(source.id, "type", "text");
		const clone = source.tree.clone(source.id);
		const target = fixture();
		const imported = target.tree.copyFrom(source.tree, source.id);
		for (const [tree, id] of [
			[source.tree, clone],
			[target.tree, imported],
		] as const) {
			expect(controlValue(tree, id)).toBe("");
			tree.setAttribute(id, "value", "new");
			expect(controlValue(tree, id)).toBe(dirty ? "" : "new");
		}
	},
);

it("preserves the attached default Attr identity while transferring the current value", () => {
	const { tree, id } = fixture();
	const attribute = tree.getAttributeNode(id, "value");
	if (attribute === null) throw new Error("Missing default Attr");
	tree.setControl(id, { value: "edited" });
	tree.setAttribute(id, "type", "checkbox");
	expect(tree.getAttributeNode(id, "value")).toBe(attribute);
	expect(tree.getAttributeRecord(attribute).value).toBe("edited");
	expect(serializeHtml(tree, id, { includeSelf: true })).toContain(
		'value="edited"',
	);
});

function textUsage(tree: DocumentTree) {
	const internals = tree as unknown as {
		nodes: Map<number, DocumentNode>;
		attributeRecords: Map<number, DocumentAttribute>;
		textCodeUnits: number;
	};
	let expected = 0;
	for (const node of internals.nodes.values()) {
		expected +=
			node.tagName.length +
			node.data.length +
			(node.control.value?.length ?? 0);
		for (const [name, value] of Object.entries(node.attributes))
			expected += name.length + value.length;
	}
	for (const attribute of internals.attributeRecords.values())
		expected += attribute.name.length + attribute.value.length;
	expect(internals.textCodeUnits).toBe(expected);
	return expected;
}

it.each([false, true])(
	"budgets the final transfer including materialized default Attr=%s",
	(materialized) => {
		const tree = new DocumentTree("about:blank", {
			maxTextCodeUnits: materialized ? 33 : 24,
		});
		documents.push(tree);
		const id = tree.createElement("input", { value: "a" });
		tree.append(tree.root, id);
		tree.setControl(id, { value: "bbbb" });
		if (materialized) tree.getAttributeNode(id, "value");
		textUsage(tree);
		tree.setAttribute(id, "type", "hidden");
		expect(textUsage(tree)).toBe(tree.limits.maxTextCodeUnits);
		expect(controlValue(tree, id)).toBe("bbbb");
	},
);

it.each([false, true])(
	"rejects the whole transition before mutation when Attr=%s makes it exceed quota",
	(materialized) => {
		const tree = new DocumentTree("about:blank", {
			maxTextCodeUnits: materialized ? 32 : 23,
		});
		documents.push(tree);
		const id = tree.createElement("input", { value: "a" });
		tree.setControl(id, { value: "bbbb" });
		const attribute = materialized ? tree.getAttributeNode(id, "value") : null;
		const before = tree.get(id);
		const revision = tree.revision;
		const bytes = textUsage(tree);
		expect(() => tree.setAttribute(id, "type", "hidden")).toThrow(/text limit/);
		expect(tree.get(id)).toBe(before);
		expect(tree.revision).toBe(revision);
		expect(textUsage(tree)).toBe(bytes);
		if (attribute !== null)
			expect(tree.getAttributeRecord(attribute).value).toBe("a");
		expect(controlValue(tree, id)).toBe("bbbb");
	},
);

it("keeps text accounting exact across repeated transfer, reset, Attr replacement and copying", () => {
	const { tree, id } = fixture();
	tree.getAttributeNode(id, "value");
	for (let index = 0; index < 40; index++) {
		tree.setControl(id, { value: `value-${index}` });
		tree.setAttributeNode(id, tree.createAttribute("type", "hidden"));
		textUsage(tree);
		tree.setAttributeNode(id, tree.createAttribute("type", "number"));
		textUsage(tree);
		tree.removeAttribute(id, "type");
		tree.clearControl(id, ["value"]);
		textUsage(tree);
	}
	tree.clone(id);
	textUsage(tree);
});

it("integrates reset and native form submission after a type transition", () => {
	const { tree, id, value } = fixture({ name: "field", value: "invalid" });
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	tree.append(form, id);
	tree.setAttribute(id, "type", "number");
	tree.setAttribute(id, "type", "text");
	const submitted = () =>
		new URL(
			prepareFormSubmission(tree, tree.reference(form)).request.url,
		).searchParams.get("field");
	expect(submitted()).toBe("");
	new DocumentForms(tree, new DocumentEvents(tree)).reset(tree.reference(form));
	expect(value()).toBe("invalid");
	expect(submitted()).toBe("invalid");
});

it("applies value transfer before the input joins a radio group", () => {
	const { tree, id } = fixture({ name: "group", checked: "", value: "old" });
	const peer = tree.createElement("input", {
		type: "radio",
		name: "group",
		checked: "",
	});
	tree.append(tree.root, peer);
	tree.setControl(id, { value: "edited" });
	tree.setAttribute(id, "type", "radio");
	expect(controlChecked(tree, id)).toBe(true);
	expect(controlChecked(tree, peer)).toBe(false);
	expect(controlValue(tree, id)).toBe("edited");
});

function page(tree: DocumentTree, id: number) {
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(target, name, { value: method });
			return target;
		},
	});
	return {
		dom,
		input: dom.node(id) as {
			type: string;
			value: unknown;
			defaultValue: unknown;
		},
	};
}

it("shares the transition with page type, value and defaultValue properties", () => {
	const { tree, id } = fixture();
	const { input } = page(tree, id);
	input.value = "edited";
	input.type = "hidden";
	expect(input.defaultValue).toBe("edited");
	input.defaultValue = "new";
	input.type = "text";
	expect(input.value).toBe("new");
});

it("allows clearing a file input but rejects nonempty page values", () => {
	const { tree, id } = fixture({ type: "file", value: "not a selected file" });
	const { input } = page(tree, id);
	expect(input.value).toBe("");
	input.value = "";
	input.value = null;
	expect(() => {
		input.value = "file.txt";
	}).toThrow(/only be cleared/);
	expect(input.value).toBe("");
	expect(input.defaultValue).toBe("not a selected file");
});

it("keeps ordinary and textarea type attributes unrelated to input value state", () => {
	const { tree } = fixture();
	for (const tag of ["div", "textarea"]) {
		const id = tree.createElement(tag);
		tree.setControl(id, { value: "edited" });
		tree.setAttribute(id, "type", "number");
		expect(tree.get(id).control.value).toBe("edited");
	}
});

it("releases dirty value ownership on closure", () => {
	const { tree, id } = fixture();
	const { dom, input } = page(tree, id);
	input.value = "edited";
	const dirty = (tree as unknown as { inputValues: { dirty: Set<number> } })
		.inputValues.dirty;
	expect(dirty.size).toBe(1);
	tree.close();
	expect(dirty.size).toBe(0);
	expect(() => {
		input.type = "hidden";
	}).toThrow(/closed/);
	dom.close();
});
