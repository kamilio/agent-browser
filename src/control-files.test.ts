import { afterEach, expect, it, vi } from "vitest";
import {
	DocumentFileSelections,
	type FileSelectionMetadata,
	type FileSelectionOptions,
} from "./control-files.js";
import { DocumentTree } from "./document.js";
import { runEventAction, runEventActionAsync } from "./event-actions.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { type FormUpload, prepareFormSubmission } from "./forms.js";

const trees: DocumentTree[] = [];

function fixture(options: FileSelectionOptions = {}) {
	const tree = new DocumentTree("https://example.com/upload");
	trees.push(tree);
	const form = tree.createElement("form", {
		id: "upload",
		method: "post",
		enctype: "multipart/form-data",
	});
	tree.append(tree.root, form);
	const add = (attributes: Record<string, string> = {}, parent = form) => {
		const id = tree.createElement("input", {
			type: "file",
			name: "attachment",
			...attributes,
		});
		tree.append(parent, id);
		return tree.reference(id);
	};
	const reference = add();
	const selections = new DocumentFileSelections(tree, options);
	const events = new DocumentEvents(tree);
	return { tree, form, reference, selections, events, add };
}

function upload(name = "sample.txt", bytes = [65, 0, 255]): FormUpload {
	return { name, type: "text/plain", data: Uint8Array.from(bytes) };
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("copies input, returned lists, metadata, bytes and submission maps", () => {
	const { selections, reference, tree } = fixture();
	const input = upload();
	selections.replace(selections.capture(reference), [input]);
	input.data.fill(9);
	input.name = "changed";
	const first = selections.files(reference);
	expect(Object.isFrozen(first)).toBe(true);
	expect(Object.isFrozen(first[0])).toBe(true);
	first[0].data.fill(8);
	const map = selections.filesForSubmission() as Map<
		number,
		readonly FormUpload[]
	>;
	map.get(tree.resolve(reference).id)?.[0].data.fill(7);
	map.clear();
	expect(selections.files(reference)).toEqual([upload()]);
	expect(selections.metrics()).toMatchObject({
		files: 1,
		controls: 1,
		bytes: 3,
	});
});

it("atomically replaces a full budget instead of charging old plus new bytes", () => {
	const { selections, reference } = fixture({
		maxFileBytes: 3,
		maxTotalBytes: 3,
		maxFiles: 1,
	});
	selections.replace(selections.capture(reference), [upload()]);
	selections.replace(selections.capture(reference), [upload("replacement")]);
	expect(selections.files(reference)[0].name).toBe("replacement");
	const target = selections.capture(reference);
	expect(() =>
		selections.replace(target, [upload("oversize", [1, 2, 3, 4])]),
	).toThrow(/byte limit/);
	expect(selections.capture(reference)).toEqual(target);
	expect(selections.files(reference)[0].name).toBe("replacement");
});

it("rejects a malformed later file without partially replacing the old selection", () => {
	const { selections, reference, tree } = fixture();
	tree.setAttribute(tree.resolve(reference).id, "multiple", "");
	selections.replace(selections.capture(reference), [upload("old")]);
	const target = selections.capture(reference);
	expect(() =>
		selections.replace(target, [upload("new"), upload("../secret")]),
	).toThrow(/basename/);
	expect(selections.files(reference)[0].name).toBe("old");
	expect(selections.capture(reference)).toEqual(target);
});

it("checks single/multiple and rechecks disabled at commit", () => {
	const { selections, reference, tree } = fixture();
	const id = tree.resolve(reference).id;
	const target = selections.capture(reference);
	expect(() => selections.replace(target, [upload(), upload()])).toThrow(
		/multiple/,
	);
	tree.setAttribute(id, "multiple", "");
	selections.replace(target, [upload(), upload()]);
	const next = selections.capture(reference);
	tree.setAttribute(id, "disabled", "");
	expect(() => selections.replace(next, [])).toThrow(/disabled/);
	expect(() => selections.capture(reference)).toThrow(/disabled/);
	expect(selections.files(reference)).toHaveLength(2);
	selections.clear(reference);
	expect(selections.files(reference)).toHaveLength(0);
});

it("snapshots file fields once and ignores custom list iterators", () => {
	const { selections, reference } = fixture();
	let reads = 0;
	const file: FormUpload = {
		name: "stable",
		get data() {
			reads++;
			return reads === 1 ? Uint8Array.of(1) : new Uint8Array(10_000_000);
		},
	};
	const files = [file];
	files[Symbol.iterator] = function* () {
		while (true) yield file;
	};
	selections.replace(selections.capture(reference), files);
	expect(reads).toBe(1);
	expect(selections.metrics()).toMatchObject({ files: 1, bytes: 1 });
	expect(selections.files(reference)[0].data).toEqual(Uint8Array.of(1));
});

it("revalidates document and control state after reading caller-owned metadata", () => {
	const { selections, reference, tree } = fixture();
	selections.replace(selections.capture(reference), [upload("old")]);
	const id = tree.resolve(reference).id;
	const disabled: FormUpload = {
		name: "new",
		get data() {
			tree.setAttribute(id, "disabled", "");
			return Uint8Array.of(1);
		},
	};
	expect(() =>
		selections.replace(selections.capture(reference), [disabled]),
	).toThrow(/disabled/);
	expect(selections.files(reference)[0].name).toBe("old");
	tree.removeAttribute(id, "disabled");
	const resetting: FormUpload = {
		name: "new",
		get data() {
			selections.clear(reference);
			return Uint8Array.of(1);
		},
	};
	expect(() =>
		selections.replace(selections.capture(reference), [resetting]),
	).toThrow(/stale/);
	expect(selections.files(reference)).toHaveLength(0);
});

it("honors disabled fieldsets and the first legend exception, but not readonly or accept hints", () => {
	const { selections, tree, form, add } = fixture();
	const fieldset = tree.createElement("fieldset", { disabled: "" });
	const legend = tree.createElement("legend");
	tree.append(form, fieldset);
	tree.append(fieldset, legend);
	const blocked = add({}, fieldset);
	const allowed = add({ readonly: "", accept: "image/*" }, legend);
	expect(() => selections.capture(blocked)).toThrow(/disabled/);
	selections.replace(selections.capture(allowed), [upload()]);
	expect(selections.files(allowed)).toHaveLength(1);
});

it.each([
	[{ maxTotalBytes: 4 }, "byte"],
	[{ maxFiles: 1 }, "count"],
	[{ maxControls: 1 }, "control"],
])("bounds aggregate document selections: %s (%s)", (limits, _description) => {
	const { selections, reference, add } = fixture(limits);
	const other = add();
	selections.replace(selections.capture(reference), [upload()]);
	expect(() =>
		selections.replace(selections.capture(other), [upload()]),
	).toThrow(/Document file selection limit/);
	expect(selections.files(other)).toHaveLength(0);
	selections.clear(reference);
	selections.replace(selections.capture(other), [upload()]);
	expect(selections.metrics()).toMatchObject({
		files: 1,
		controls: 1,
		bytes: 3,
	});
});

it("counts empty files and rejects invalid metadata, shared bytes and limits", () => {
	const { selections, reference } = fixture({ maxFiles: 1 });
	selections.replace(selections.capture(reference), [upload("empty", [])]);
	expect(selections.metrics()).toMatchObject({ files: 1, bytes: 0 });
	for (const name of [
		"",
		".",
		"..",
		"dir/file",
		"dir\\file",
		"bad\nname",
		"a".repeat(256),
	])
		expect(() =>
			selections.replace(selections.capture(reference), [upload(name)]),
		).toThrow(/basename/);
	expect(() =>
		selections.replace(selections.capture(reference), [
			{ ...upload(), type: "x\r\ny" },
		]),
	).toThrow(/content type/);
	expect(() =>
		selections.replace(selections.capture(reference), [
			{ ...upload(), data: new Uint8Array(new SharedArrayBuffer(1)) },
		]),
	).toThrow(/owned byte/);
	expect(() => fixture({ maxFiles: 0 })).toThrow(/limits/);
	expect(() => fixture({ maxFiles: 65 })).toThrow(/limits/);
});

it("rejects cross-owner, replayed, removed and reset targets", () => {
	const first = fixture();
	const second = fixture();
	const target = first.selections.capture(first.reference);
	expect(() => second.selections.replace(target, [upload()])).toThrow(/stale/);
	first.selections.replace(target, [upload()]);
	expect(() => first.selections.replace(target, [])).toThrow(/stale/);
	const detached = first.selections.capture(first.reference);
	const id = first.tree.resolve(first.reference).id;
	first.tree.remove(id);
	first.tree.append(first.form, id);
	expect(() => first.selections.replace(detached, [])).toThrow(/stale/);
	const beforeReset = first.selections.capture(first.reference);
	first.selections.resetForm(first.tree.reference(first.form));
	expect(() => first.selections.replace(beforeReset, [upload()])).toThrow(
		/stale/,
	);
});

it("retains bounded detached selections without submitting them and clears on type transitions", () => {
	const { selections, tree, reference, form } = fixture();
	selections.replace(selections.capture(reference), [upload()]);
	const id = tree.resolve(reference).id;
	tree.remove(id);
	expect(selections.filesForSubmission().size).toBe(0);
	expect(selections.metrics().bytes).toBe(3);
	tree.append(form, id);
	expect(selections.files(reference)).toHaveLength(1);
	tree.setAttribute(id, "type", "text");
	tree.setAttribute(id, "type", "file");
	expect(selections.files(reference)).toHaveLength(0);
	expect(selections.metrics().bytes).toBe(0);
});

it("publishes bytes before noncancelable bubbling input then change", () => {
	const { selections, reference, events, form } = fixture();
	const calls: unknown[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(form, type, (event) => {
			event.preventDefault();
			calls.push([
				event.type,
				event.bubbles,
				event.composed,
				event.cancelable,
				selections.files(reference)[0].name,
			]);
		});
	const result = runEventAction(
		events,
		selections.replaceAction(selections.capture(reference), [upload()]),
	);
	expect(result).toMatchObject({ files: 1, bytes: 3 });
	expect(calls).toEqual([
		["input", true, true, false, "sample.txt"],
		["change", true, false, false, "sample.txt"],
	]);
});

it("supports asynchronous event actions and precommit cancellation", async () => {
	const { selections, reference, events } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		runEventActionAsync(
			events,
			selections.replaceAction(selections.capture(reference), [upload()]),
			controller.signal,
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(selections.metrics().files).toBe(0);
	await runEventActionAsync(
		events,
		selections.replaceAction(selections.capture(reference), [upload()]),
	);
	expect(selections.metrics().files).toBe(1);
});

it("emits no events on failed replacement and suppresses change after document close", () => {
	const { selections, reference, events, tree, form } = fixture();
	const calls: string[] = [];
	events.addEventListener(form, "input", () => {
		calls.push("input");
		tree.close();
	});
	events.addEventListener(form, "change", () => calls.push("change"));
	expect(() =>
		runEventAction(
			events,
			selections.replaceAction(selections.capture(reference), [
				upload("../bad"),
			]),
		),
	).toThrow();
	expect(calls).toEqual([]);
	expect(() =>
		runEventAction(
			events,
			selections.replaceAction(selections.capture(reference), [upload()]),
		),
	).toThrow(/closed/);
	expect(calls).toEqual(["input"]);
	expect(selections.metrics()).toMatchObject({
		closed: true,
		files: 0,
		bytes: 0,
		controls: 0,
	});
	expect(() => selections.filesForSubmission()).toThrow(/closed/);
	selections.close();
});

it("offers a silent reset hook for owned, external and disabled controls only after uncanceled reset", () => {
	const { selections, reference, events, tree, form, add } = fixture();
	const external = add({ form: "upload" }, tree.root);
	const unrelated = add({}, tree.root);
	for (const target of [reference, external, unrelated])
		selections.replace(selections.capture(target), [upload()]);
	tree.setAttribute(tree.resolve(external).id, "disabled", "");
	const forms = new DocumentForms(tree, events);
	const calls: string[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(tree.root, type, () => calls.push(type));
	events.addEventListener(form, "reset", (event) => event.preventDefault(), {
		once: true,
	});
	const canceled = forms.reset(tree.reference(form));
	if (canceled.reset) selections.resetForm(canceled.formRef);
	expect(selections.metrics().files).toBe(3);
	const accepted = forms.reset(tree.reference(form));
	if (accepted.reset) selections.resetForm(accepted.formRef);
	expect(selections.files(reference)).toHaveLength(0);
	expect(selections.files(external)).toHaveLength(0);
	expect(selections.files(unrelated)).toHaveLength(1);
	expect(calls).toEqual([]);
});

it("prepares exact multipart binary bytes from the document owner without a network request", () => {
	const { selections, reference, tree, form } = fixture();
	selections.replace(selections.capture(reference), [upload('a"b.txt')]);
	const submission = prepareFormSubmission(tree, tree.reference(form), {
		files: selections.filesForSubmission(),
		boundary: "native-selection-test",
	});
	const prefix =
		'--native-selection-test\r\nContent-Disposition: form-data; name="attachment"; filename="a%22b.txt"\r\nContent-Type: text/plain\r\n\r\n';
	const suffix = "\r\n--native-selection-test--\r\n";
	expect(submission.request.body).toEqual(
		new Uint8Array([
			...new TextEncoder().encode(prefix),
			65,
			0,
			255,
			...new TextEncoder().encode(suffix),
		]),
	);
	selections.clear(reference);
	expect(
		new TextDecoder().decode(
			prepareFormSubmission(tree, tree.reference(form), {
				files: selections.filesForSubmission(),
				boundary: "empty-test",
			}).request.body as Uint8Array,
		),
	).toContain('filename=""');
});

it("reads metadata for an 8MiB selection without allocating or copying file bytes", () => {
	const { selections, reference, tree } = fixture();
	const id = tree.resolve(reference).id;
	selections.replace(selections.capture(reference), [
		{
			name: "large.bin",
			type: "application/octet-stream",
			data: new Uint8Array(8_388_608),
		},
	]);
	const files = vi.spyOn(selections, "files").mockImplementation(() => {
		throw new Error("Unexpected file copy");
	});
	const allocate = vi.spyOn(globalThis, "Uint8Array").mockImplementation(() => {
		throw new Error("Unexpected byte allocation");
	});
	let metadata: readonly FileSelectionMetadata[];
	try {
		metadata = selections.selectionMetadata(id);
	} finally {
		allocate.mockRestore();
		files.mockRestore();
	}
	expect(metadata).toStrictEqual([
		{ name: "large.bin", type: "application/octet-stream", bytes: 8_388_608 },
	]);
	expect(Object.keys(metadata[0])).toEqual(["name", "type", "bytes"]);
	expect(Object.isFrozen(metadata)).toBe(true);
	expect(Object.isFrozen(metadata[0])).toBe(true);
});

it("returns immutable bounded metadata snapshots, including zero-byte files and omitted types", () => {
	const { selections, reference, tree } = fixture();
	const id = tree.resolve(reference).id;
	expect(selections.selectionMetadata(id)).toEqual([]);
	tree.setAttribute(tree.resolve(reference).id, "multiple", "");
	selections.replace(
		selections.capture(reference),
		Array.from({ length: 64 }, (_, index) => ({
			name: `${index}.bin`,
			data: new Uint8Array(),
		})),
	);
	const snapshot = selections.selectionMetadata(id);
	expect(snapshot).toHaveLength(64);
	expect(snapshot[0]).toStrictEqual({
		name: "0.bin",
		type: undefined,
		bytes: 0,
	});
	expect(Reflect.set(snapshot[0], "name", "mutated")).toBe(false);
	expect(Reflect.set(snapshot, "length", 0)).toBe(false);
	selections.replace(selections.capture(reference), [upload("replacement")]);
	expect(snapshot).toHaveLength(64);
	expect(snapshot[0].name).toBe("0.bin");
	expect(selections.selectionMetadata(id)).toEqual([
		{ name: "replacement", type: "text/plain", bytes: 3 },
	]);
});

it("allows metadata reads for disabled controls and reflects clear, reset and type transitions", () => {
	const { selections, reference, tree, form } = fixture();
	const id = tree.resolve(reference).id;
	selections.replace(selections.capture(reference), [upload()]);
	tree.setAttribute(id, "disabled", "");
	expect(selections.selectionMetadata(id)).toHaveLength(1);
	selections.clear(reference);
	expect(selections.selectionMetadata(id)).toEqual([]);
	tree.removeAttribute(id, "disabled");
	selections.replace(selections.capture(reference), [upload()]);
	selections.resetForm(tree.reference(form));
	expect(selections.selectionMetadata(id)).toEqual([]);
	selections.replace(selections.capture(reference), [upload()]);
	tree.setAttribute(id, "type", "text");
	expect(() => selections.selectionMetadata(id)).toThrow(
		/Expected a file input/,
	);
	tree.setAttribute(id, "type", "file");
	expect(selections.selectionMetadata(id)).toEqual([]);
});

it("reads detached retained inputs but rejects foreign, invalid, non-file and closed IDs", () => {
	const { selections, reference, tree, form } = fixture();
	selections.replace(selections.capture(reference), [upload()]);
	const id = tree.resolve(reference).id;
	tree.remove(id);
	expect(selections.selectionMetadata(id)).toEqual([
		{ name: "sample.txt", type: "text/plain", bytes: 3 },
	]);
	expect(() => selections.capture(reference)).toThrow(/Reference is no longer/);
	tree.append(form, id);
	expect(selections.selectionMetadata(id)).toHaveLength(1);
	const foreign = fixture();
	expect(() =>
		selections.selectionMetadata(foreign.tree.resolve(foreign.reference).id),
	).toThrow(/Unknown document node/);
	for (const invalid of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
		expect(() => selections.selectionMetadata(invalid)).toThrow(
			/Invalid file control ID/,
		);
	expect(() => selections.selectionMetadata(form)).toThrow(
		/Expected a file input/,
	);
	tree.close();
	expect(() => selections.selectionMetadata(id)).toThrow(/closed/);
});

it("clears detached disabled file inputs by ID without events or attribute/value writes", () => {
	const { selections, reference, tree, events, form } = fixture();
	const id = tree.resolve(reference).id;
	const target = selections.capture(reference);
	selections.replace(target, [upload()]);
	tree.setAttribute(id, "disabled", "");
	tree.remove(id);
	const saved = tree.get(id);
	const revision = tree.revision;
	const calls: string[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(id, type, () => calls.push(type));
	expect(() => selections.clear(reference)).toThrow(/Reference is no longer/);
	selections.clear(id);
	expect(selections.selectionMetadata(id)).toEqual([]);
	expect(selections.metrics()).toMatchObject({ files: 0, bytes: 0 });
	expect(tree.revision).toBe(revision + 1);
	expect(tree.get(id)).toBe(saved);
	expect(calls).toEqual([]);
	tree.append(form, id);
	tree.removeAttribute(id, "disabled");
	expect(() => selections.replace(target, [upload()])).toThrow(/stale/);
	expect(selections.selectionMetadata(id)).toEqual([]);
});

it("invalidates presentation after publishing replacement state and before input/change", () => {
	const { selections, reference, tree, events, form } = fixture();
	const id = tree.resolve(reference).id;
	const saved = tree.get(id);
	const revision = tree.revision;
	const calls: string[] = [];
	const mutations: unknown[] = [];
	tree.onMutation((record) => mutations.push(record));
	tree.onChange((change) => {
		if (change.kind === "style")
			calls.push(
				`style:${selections.selectionMetadata(id)[0]?.name ?? "empty"}`,
			);
	});
	for (const type of ["input", "change"])
		events.addEventListener(form, type, () => calls.push(type));
	runEventAction(
		events,
		selections.replaceAction(selections.capture(reference), [
			upload("selected"),
		]),
	);
	expect(calls).toEqual(["style:selected", "input", "change"]);
	expect(tree.revision).toBe(revision + 1);
	expect(tree.get(id)).toBe(saved);
	expect(mutations).toEqual([]);
	selections.clear(id);
	expect(calls.at(-1)).toBe("style:empty");
	expect(tree.revision).toBe(revision + 2);
	expect(mutations).toEqual([]);
});

it("does not invalidate presentation for empty-to-empty operations or failed replacement, but invalidates reset once", () => {
	const { selections, reference, tree, form, add } = fixture();
	const id = tree.resolve(reference).id;
	const other = add();
	const revision = tree.revision;
	const beforeClear = selections.capture(reference);
	selections.clear(id);
	selections.resetForm(tree.reference(form));
	selections.replace(selections.capture(reference), []);
	expect(tree.revision).toBe(revision);
	expect(() => selections.replace(beforeClear, [upload()])).toThrow(/stale/);
	expect(() =>
		selections.replace(selections.capture(reference), [upload("../bad")]),
	).toThrow(/basename/);
	expect(tree.revision).toBe(revision);
	selections.replace(selections.capture(reference), [upload()]);
	selections.replace(selections.capture(other), [
		{ name: "empty", data: new Uint8Array() },
	]);
	const beforeReset = tree.revision;
	selections.resetForm(tree.reference(form));
	expect(tree.revision).toBe(beforeReset + 1);
	expect(selections.selectionMetadata(id)).toEqual([]);
	expect(selections.selectionMetadata(tree.resolve(other).id)).toEqual([]);
	selections.resetForm(tree.reference(form));
	expect(tree.revision).toBe(beforeReset + 1);
});

it("rejects invalid or non-file numeric clear targets without changing another selection", () => {
	const { selections, reference, tree, form } = fixture();
	selections.replace(selections.capture(reference), [upload()]);
	const revision = tree.revision;
	for (const invalid of [0, -1, 0.5, Number.NaN])
		expect(() => selections.clear(invalid)).toThrow(/Invalid file control ID/);
	expect(() => selections.clear(form)).toThrow(/Expected a file input/);
	const foreign = fixture();
	expect(() =>
		selections.clear(foreign.tree.resolve(foreign.reference).id),
	).toThrow(/Unknown document node/);
	expect(tree.revision).toBe(revision);
	expect(selections.selectionMetadata(tree.resolve(reference).id)).toHaveLength(
		1,
	);
});
