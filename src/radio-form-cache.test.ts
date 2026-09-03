import { afterEach, expect, it } from "vitest";
import { controlChecked, formOwner } from "./controls.js";
import { type DocumentNode, DocumentTree } from "./document.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const form = tree.createElement("form", { id: "owner" });
	tree.append(tree.root, form);
	const add = (attributes: Record<string, string> = {}) => {
		const id = tree.createElement("input", {
			type: "radio",
			name: "group",
			form: "owner",
			...attributes,
		});
		tree.append(tree.root, id);
		return id;
	};
	return { tree, form, add };
}

function instrument(tree: DocumentTree) {
	const internals = tree as unknown as { node(id: number): DocumentNode };
	const original = internals.node.bind(tree);
	let reads = 0;
	internals.node = (id) => {
		reads++;
		return original(id);
	};
	return {
		reads: () => reads,
		reset: () => {
			reads = 0;
		},
	};
}

function construction(count: number, withIds: boolean) {
	const { tree, add } = fixture();
	const work = instrument(tree);
	let last = 0;
	for (let index = 0; index < count; index++)
		last = add({ ...(withIds ? { id: `radio-${index}` } : {}), checked: "" });
	const reads = work.reads();
	expect(controlChecked(tree, last)).toBe(true);
	return reads;
}

it.each([false, true])(
	"avoids repeated root scans while adding radios withIds=%s",
	(withIds) => {
		const reads = construction(1000, withIds);
		expect(reads).toBeLessThanOrEqual(40_000);
	},
);

it.each([false, true])(
	"keeps fixed-owner construction work near linear withIds=%s",
	(withIds) => {
		const small = construction(100, withIds);
		const large = construction(200, withIds);
		expect(large).toBeLessThanOrEqual(small * 2.2);
	},
);

it("reuses explicit owner lookup across name changes and unrelated ID insertions", () => {
	const { tree, form, add } = fixture();
	const radio = add({ checked: "" });
	for (let index = 0; index < 500; index++)
		tree.append(tree.root, tree.createElement("div", { id: `other-${index}` }));
	const work = instrument(tree);
	for (let index = 0; index < 100; index++)
		tree.setAttribute(radio, "name", `group-${index}`);
	expect(work.reads()).toBeLessThanOrEqual(2500);
	expect(formOwner(tree, radio)).toBe(form);
});

function cache(tree: DocumentTree) {
	return (
		tree as unknown as {
			checkedness: { formLookups: Map<string, number | null> };
		}
	).checkedness.formLookups;
}

function internal(tree: DocumentTree, form: number) {
	const id = tree.createElement("input", { type: "radio", name: "group" });
	tree.append(form, id);
	return id;
}

it("caches missing IDs without retaining arbitrary unrelated IDs", () => {
	const { tree, add } = fixture();
	const radio = add({ form: "missing", checked: "" });
	for (let index = 0; index < 300; index++)
		tree.append(
			tree.root,
			tree.createElement("div", { id: `unrelated-${index}` }),
		);
	const work = instrument(tree);
	for (let index = 0; index < 100; index++)
		tree.setAttribute(radio, "name", `name-${index}`);
	expect(work.reads()).toBeLessThanOrEqual(1500);
	expect([...cache(tree)]).toEqual([["missing", null]]);
});

it("invalidates a negative lookup when its form id appears", () => {
	const { tree, form, add } = fixture();
	const external = add({ form: "later", checked: "" });
	const peer = internal(tree, form);
	tree.setInputChecked(peer, true);
	expect(controlChecked(tree, external)).toBe(true);
	tree.setAttribute(form, "id", "later");
	expect(cache(tree).get("later")).toBe(form);
	expect(controlChecked(tree, external)).toBe(true);
	expect(controlChecked(tree, peer)).toBe(false);
});

it("invalidates a positive lookup when a masking non-form is inserted or removed", () => {
	const { tree, form, add } = fixture();
	const external = add({ checked: "" });
	const peer = internal(tree, form);
	const blocker = tree.createElement("div", { id: "owner" });
	tree.insert(tree.root, blocker, form);
	expect(cache(tree).get("owner")).toBe(blocker);
	tree.setInputChecked(peer, true);
	expect(controlChecked(tree, external)).toBe(true);
	tree.remove(blocker);
	expect(cache(tree).get("owner")).toBe(form);
	expect(controlChecked(tree, peer)).toBe(false);
});

it("invalidates duplicate form lookup on reorder without resurrecting a default", () => {
	const { tree, form, add } = fixture();
	const secondForm = tree.createElement("form", { id: "owner" });
	tree.append(tree.root, secondForm);
	const external = add({ checked: "" });
	const firstPeer = internal(tree, form);
	const secondPeer = internal(tree, secondForm);
	tree.setInputChecked(secondPeer, true);
	tree.insert(tree.root, secondForm, form);
	expect(cache(tree).get("owner")).toBe(secondForm);
	expect(controlChecked(tree, secondPeer)).toBe(false);
	tree.setInputChecked(firstPeer, true);
	expect(controlChecked(tree, external)).toBe(true);
});

it.each(["attribute", "attached-value", "replacement", "removal"])(
	"invalidates an owner id through the %s path",
	(operation) => {
		const { tree, form, add } = fixture();
		const radio = add({ checked: "" });
		const peer = internal(tree, form);
		if (operation === "attribute") tree.setAttribute(form, "id", "renamed");
		else if (operation === "removal") tree.removeAttribute(form, "id");
		else if (operation === "replacement")
			tree.setAttributeNode(form, tree.createAttribute("id", "renamed"));
		else {
			const attribute = tree.getAttributeNode(form, "id");
			if (attribute === null) throw new Error("Missing form ID");
			tree.setAttributeValue(attribute, "renamed");
		}
		expect(cache(tree).get("owner")).toBeNull();
		tree.setInputChecked(peer, true);
		expect(controlChecked(tree, radio)).toBe(true);
	},
);

it("invalidates both old and new ID dependencies without evicting unrelated owners", () => {
	const { tree, form, add } = fixture();
	add();
	add({ form: "new" });
	const other = tree.createElement("form", { id: "other" });
	tree.append(tree.root, other);
	add({ form: "other" });
	tree.setAttribute(form, "id", "new");
	expect(cache(tree).get("owner")).toBeNull();
	expect(cache(tree).get("new")).toBe(form);
	expect(cache(tree).get("other")).toBe(other);
});

it("invalidates an owner inside a removed subtree and resolves it on reattachment", () => {
	const { tree, form, add } = fixture();
	const container = tree.createElement("section");
	tree.append(tree.root, container);
	tree.append(container, form);
	const radio = add({ checked: "" });
	tree.remove(container);
	expect(cache(tree).get("owner")).toBeNull();
	tree.append(tree.root, container);
	expect(cache(tree).get("owner")).toBe(form);
	expect(formOwner(tree, radio)).toBe(form);
});

it("evicts cache entries only after the last referencing radio stops using them", () => {
	const { tree, add } = fixture();
	const first = add();
	const second = add();
	expect(cache(tree).size).toBe(1);
	tree.setAttribute(first, "form", "other");
	expect([...cache(tree).keys()].sort()).toEqual(["other", "owner"]);
	tree.setAttribute(first, "type", "text");
	expect([...cache(tree).keys()]).toEqual(["owner"]);
	tree.removeAttribute(second, "form");
	expect(cache(tree).size).toBe(0);
});

it("bounds negative lookup retention across repeated changes of explicit owner", () => {
	const { tree, add } = fixture();
	const radio = add();
	for (let index = 0; index < 500; index++) {
		tree.setAttribute(radio, "form", `missing-${index}`);
		expect(cache(tree).size).toBe(1);
	}
	tree.setAttribute(radio, "type", "text");
	expect(cache(tree).size).toBe(0);
	tree.setAttribute(radio, "type", "radio");
	expect([...cache(tree)]).toEqual([["missing-499", null]]);
});

it("does not preserve a stale lookup while the last radio changes type", () => {
	const { tree, form, add } = fixture();
	const radio = add({ checked: "" });
	tree.setAttribute(radio, "type", "text");
	tree.setAttribute(form, "id", "old");
	const replacement = tree.createElement("form", { id: "owner" });
	tree.append(tree.root, replacement);
	tree.setAttribute(radio, "type", "radio");
	expect(cache(tree).get("owner")).toBe(replacement);
});

it("keeps detached form references from poisoning connected owner lookups", () => {
	const { tree, form, add } = fixture();
	const connected = add();
	const detachedForm = tree.createElement("form", { id: "owner" });
	const detached = tree.createElement("input", {
		type: "radio",
		name: "group",
		form: "owner",
		checked: "",
	});
	tree.append(detachedForm, detached);
	expect(formOwner(tree, detached)).toBe(detachedForm);
	expect(cache(tree).get("owner")).toBe(form);
	tree.setInputChecked(connected, true);
	expect(controlChecked(tree, detached)).toBe(true);
	tree.insert(tree.root, detachedForm, form);
	expect(cache(tree).get("owner")).toBe(detachedForm);
});

it.each(["__proto__", "toString", "OWNER", ""])(
	"treats form IDs literally without prototype or case aliasing: %s",
	(name) => {
		const { tree, form, add } = fixture();
		tree.setAttribute(form, "id", name);
		add({ form: name });
		expect(cache(tree).get(name)).toBe(name === "" ? null : form);
	},
);

it("does not invalidate owner lookups when an attribute change fails its quota", () => {
	const { tree, form, add } = fixture();
	add();
	const revision = tree.revision;
	expect(() =>
		tree.setAttribute(form, "id", "x".repeat(tree.limits.maxTextCodeUnits + 1)),
	).toThrow(/text limit/);
	expect(tree.revision).toBe(revision);
	expect(cache(tree).get("owner")).toBe(form);
});

it("isolates cached form IDs between documents and releases them on closure", () => {
	const first = fixture();
	const second = fixture();
	first.add();
	second.add();
	const retained = cache(first.tree);
	first.tree.setAttribute(first.form, "id", "renamed");
	expect(cache(second.tree).get("owner")).toBe(second.form);
	first.tree.close();
	expect(retained.size).toBe(0);
	expect(cache(second.tree).get("owner")).toBe(second.form);
});
