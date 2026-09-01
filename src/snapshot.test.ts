import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { diffSnapshots, renderSnapshot, snapshotDocument } from "./snapshot.js";

function fixture() {
	const tree = new DocumentTree("https://example.com/docs/");
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		text = "",
		parent = tree.root,
	) => {
		const element = tree.createElement(tag, attributes);
		tree.append(parent, element);
		if (text) tree.append(element, tree.createText(text));
		return element;
	};
	return { tree, add };
}

it("projects headings, links, named controls and readable content with stable refs", () => {
	const { tree, add } = fixture();
	const heading = add("h1", {}, "Agent guide");
	add("p", {}, "Read this guide before continuing.");
	const link = add("a", { href: "next" }, "Continue");
	add("label", { for: "query" }, "Search docs");
	const input = add("input", { id: "query", required: "" });
	tree.setControl(input, { value: "TypeScript" });
	const button = add("button", {}, "Search");
	const snapshot = snapshotDocument(tree);
	expect(snapshot.truncated).toBe(false);
	expect(snapshot.entries).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				ref: tree.reference(heading),
				role: "heading",
				level: 1,
				name: "Agent guide",
			}),
			expect.objectContaining({
				ref: tree.reference(link),
				role: "link",
				name: "Continue",
				href: "https://example.com/docs/next",
			}),
			expect.objectContaining({
				ref: tree.reference(input),
				role: "textbox",
				name: "Search docs",
				value: "TypeScript",
				required: true,
			}),
			expect.objectContaining({
				ref: tree.reference(button),
				role: "button",
				name: "Search",
			}),
		]),
	);
	expect(
		snapshot.entries.filter((entry) => entry.name === "Search"),
	).toHaveLength(1);
	expect(
		snapshot.entries.some((entry) => entry.name.includes("before continuing")),
	).toBe(true);
	for (const entry of snapshot.entries)
		expect(tree.resolve(entry.ref).id).toBeGreaterThan(0);
	expect(renderSnapshot(snapshot)).toContain(
		`- button "Search" [ref=${tree.reference(button)}]`,
	);
});

it("omits scripts, templates and semantically hidden subtrees even for scoped snapshots", () => {
	const { tree, add } = fixture();
	add("script", {}, "SECRET_SCRIPT");
	add("style", {}, "SECRET_STYLE");
	add("template", {}, "SECRET_TEMPLATE");
	for (const attributes of [
		{ hidden: "" },
		{ inert: "" },
		{ "aria-hidden": "true" },
	]) {
		const parent = add("div", attributes);
		const child = add("button", {}, "SECRET_CHILD", parent);
		expect(
			snapshotDocument(tree, { root: tree.reference(child) }).entries,
		).toEqual([]);
	}
	add("input", { type: "hidden", value: "SECRET_INPUT" });
	add("button", {}, "Visible");
	expect(JSON.stringify(snapshotDocument(tree))).not.toContain("SECRET");
});

it("preserves inline word boundaries instead of adding spaces between every DOM node", () => {
	const { tree, add } = fixture();
	const button = add("button", {}, "Java");
	add("span", {}, "Script", button);
	tree.append(button, tree.createText(" browser "));
	add("strong", {}, "guide", button);
	tree.append(tree.root, tree.createText(" \n\t "));
	const snapshot = snapshotDocument(tree);
	expect(snapshot.entries).toHaveLength(1);
	expect(snapshot.entries[0].name).toBe("JavaScript browser guide");
});

it("does not reveal password contents, file paths or URL credentials", () => {
	const { tree, add } = fixture();
	const password = add("input", {
		type: "PASSWORD",
		value: "SECRET_PASSWORD",
		"aria-label": "Password",
	});
	tree.setControl(password, { value: "SECRET_TYPED_PASSWORD" });
	add("input", { type: "file", value: "/SECRET/local/file.txt" });
	add(
		"a",
		{ href: "https://SECRET_USER:SECRET_PASSWORD@example.org/path" },
		"Open",
	);
	add("a", { href: "javascript:SECRET_CODE()" }, "Action");
	const snapshot = snapshotDocument(tree);
	expect(JSON.stringify(snapshot)).not.toContain("SECRET");
	expect(
		snapshot.entries.find((entry) => entry.ref === tree.reference(password)),
	).toMatchObject({ protected: true, name: "Password" });
	expect(
		snapshot.entries.find((entry) => entry.name === "Action"),
	).not.toHaveProperty("href");
	expect(snapshot.entries.find((entry) => entry.name === "Open")?.href).toBe(
		"https://example.org/path",
	);
});

it("resolves aria names, wrapping labels and checked state without renumbering", () => {
	const { tree, add } = fixture();
	add("span", { id: "description" }, "Notifications");
	const checkbox = add("input", {
		type: "checkbox",
		"aria-labelledby": "description",
		checked: "",
		disabled: "",
	});
	const label = add("label", {}, "Your name");
	const input = add("input", {}, "", label);
	const first = snapshotDocument(tree);
	expect(
		first.entries.find((entry) => entry.ref === tree.reference(checkbox)),
	).toMatchObject({ name: "Notifications", checked: true, disabled: true });
	expect(
		first.entries.find((entry) => entry.ref === tree.reference(input))?.name,
	).toBe("Your name");
	tree.setControl(checkbox, { checked: false });
	const second = snapshotDocument(tree);
	expect(
		second.entries.find((entry) => entry.ref === tree.reference(checkbox))
			?.checked,
	).toBe(false);
	const diff = diffSnapshots(first, second);
	expect(diff.reset).toBe(false);
	if (diff.reset) throw new Error("Unexpected reset");
	expect(diff.updated).toHaveLength(1);
	expect(diff.updated[0]).toMatchObject({
		ref: tree.reference(checkbox),
		checked: false,
	});
	expect(diff.removed).toEqual([]);
});

it("handles prototype-like tag and id names without inheriting fake roles", () => {
	const { tree, add } = fixture();
	add("constructor", {}, "Ordinary text");
	add("span", { id: "__proto__" }, "Safe label");
	add("button", { "aria-labelledby": "__proto__", role: "invalid button" });
	const snapshot = snapshotDocument(tree);
	expect(snapshot.entries.map((entry) => entry.role)).not.toContain(
		"constructor",
	);
	expect(snapshot.entries.find((entry) => entry.role === "button")?.name).toBe(
		"Safe label",
	);
});

it("enforces a UTF-8 byte budget for the entire JSON snapshot and text projection", () => {
	const { tree, add } = fixture();
	for (let index = 0; index < 100; index++)
		add("button", {}, `日本語 😀 ${index}`);
	for (const maxBytes of [256, 300, 1024, 4096]) {
		const snapshot = snapshotDocument(tree, { maxBytes });
		expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(
			maxBytes,
		);
		expect(snapshot.truncated).toBe(true);
		const rendered = renderSnapshot(snapshot, maxBytes);
		expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(maxBytes);
		expect(rendered).toContain("snapshot truncated");
	}
});

it("bounds entries, strings and semantic depth while preserving Unicode code points", () => {
	const { tree, add } = fixture();
	const main = add("main");
	add("button", {}, "AB😀CD", main);
	add("button", {}, "Second", main);
	const limited = snapshotDocument(tree, { maxStringLength: 3 });
	expect(limited.entries[1].name).toBe("AB");
	expect(limited.truncated).toBe(true);
	expect(snapshotDocument(tree, { maxEntries: 1 }).entries).toHaveLength(1);
	const shallow = snapshotDocument(tree, { maxDepth: 0 });
	expect(shallow.entries.map((entry) => entry.role)).toEqual(["main"]);
	expect(shallow.truncated).toBe(true);
});

it("strips terminal control codes and bidi formatting from untrusted text", () => {
	const { tree, add } = fixture();
	const unsafe = `${String.fromCharCode(27)}]0;bad title${String.fromCharCode(7)}Text\u202e Spoof`;
	add("button", { "aria-label": unsafe });
	const rendered = renderSnapshot(snapshotDocument(tree));
	expect(rendered).not.toContain(String.fromCharCode(27));
	expect(rendered).not.toContain(String.fromCharCode(7));
	expect(rendered).not.toContain("\u202e");
});

it("tracks insertion, removal and reordering and resets on scope or document changes", () => {
	const { tree, add } = fixture();
	const first = add("button", {}, "First");
	const second = add("button", {}, "Second");
	const before = snapshotDocument(tree);
	tree.append(tree.root, first);
	const afterMove = snapshotDocument(tree);
	const moved = diffSnapshots(before, afterMove);
	if (moved.reset) throw new Error("Unexpected reset");
	expect(moved.updated).toEqual([]);
	expect(moved.order).toEqual([tree.reference(second), tree.reference(first)]);
	tree.remove(first);
	const third = add("button", {}, "Third");
	const changed = diffSnapshots(afterMove, snapshotDocument(tree));
	if (changed.reset) throw new Error("Unexpected reset");
	expect(changed.removed).toEqual([tree.reference(first)]);
	expect(changed.updated[0].ref).toBe(tree.reference(third));
	expect(
		diffSnapshots(before, snapshotDocument(new DocumentTree(tree.url))).reset,
	).toBe(true);
	expect(
		diffSnapshots(
			before,
			snapshotDocument(tree, { root: tree.reference(second) }),
		).reset,
	).toBe(true);
	expect(diffSnapshots(snapshotDocument(tree), before).reset).toBe(true);
});

it("never infers removals from partial snapshots", () => {
	const { tree, add } = fixture();
	add("button", {}, "First");
	add("button", {}, "Second");
	const full = snapshotDocument(tree);
	const partial = snapshotDocument(tree, { maxEntries: 1 });
	expect(diffSnapshots(full, partial)).toEqual({
		reset: true,
		snapshot: partial,
	});
	expect(diffSnapshots(partial, full)).toEqual({ reset: true, snapshot: full });
	expect(diffSnapshots(undefined, full).reset).toBe(true);
});

it("rejects invalid limits, stale roots and closed documents", () => {
	const { tree, add } = fixture();
	for (const options of [
		{ maxBytes: 255 },
		{ maxEntries: 0 },
		{ maxDepth: -1 },
		{ maxStringLength: Number.NaN },
		{ maxBytes: Number.POSITIVE_INFINITY },
	])
		expect(() => snapshotDocument(tree, options)).toThrow(
			"Invalid snapshot limit",
		);
	const button = add("button", {}, "Temporary");
	tree.remove(button);
	expect(() =>
		snapshotDocument(tree, { root: tree.reference(button) }),
	).toThrow("no longer");
	expect(() => renderSnapshot(snapshotDocument(tree), 0)).toThrow("byte limit");
	tree.close();
	expect(() => snapshotDocument(tree)).toThrow("closed");
});
