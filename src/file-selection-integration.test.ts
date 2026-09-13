import { afterEach, expect, it, vi } from "vitest";
import { controlValidity } from "./control-validity.js";
import { controlValue } from "./controls.js";
import { documentFiles, existingDocumentFiles } from "./document-files.js";
import type { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions, documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const result = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(result, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		return result;
	},
};

function fixture(extra = "") {
	const tree = parseHtmlDocument(
		`<form id="form" action="/upload" method="post" enctype="multipart/form-data"><input id="file" type="file" name="upload" required><button id="reset" type="reset">Reset</button>${extra}</form>`,
		"https://fixture.invalid/files",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const find = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	};
	const file = find("#file");
	const form = find("#form");
	const actions = documentInteractions(tree);
	const owner = documentFiles(tree);
	const reference = tree.reference(file);
	const formReference = tree.reference(form);
	const select = (name = "selected.txt", text = "owned bytes") =>
		owner.replace(owner.capture(reference), [
			{ name, type: "text/plain", data: new TextEncoder().encode(text) },
		]);
	return {
		tree,
		queries,
		find,
		file,
		form,
		actions,
		owner,
		reference,
		formReference,
		select,
	};
}

function body(request: { body?: Uint8Array | string }) {
	return typeof request.body === "string"
		? request.body
		: new TextDecoder().decode(request.body);
}

it("shares one selection owner across native interaction and form entry points", () => {
	const { tree, actions, owner, select, formReference } = fixture();
	expect(actions.files).toBe(owner);
	expect(new DocumentInteractions(tree).files).toBe(owner);
	select();
	const forms = new DocumentForms(tree, new DocumentEvents(tree));
	expect(forms.checkValidity(formReference)).toBe(true);
	expect(body(prepareFormSubmission(tree, formReference).request)).toContain(
		"owned bytes",
	);
	forms.reset(formReference);
	expect(owner.metrics().files).toBe(0);
});

it("updates required-file validity and safe filename values without byte copies", () => {
	const { tree, queries, file, actions, owner, select, formReference } =
		fixture();
	expect(controlValidity(tree, file).valueMissing).toBe(true);
	expect(queries.matches(file, ":invalid")).toBe(true);
	const copied = vi.spyOn(owner, "files");
	const submissionCopied = vi.spyOn(owner, "filesForSubmission");
	const revision = tree.revision;
	select("notes.txt");
	expect(tree.revision).toBeGreaterThan(revision);
	expect(controlValue(tree, file)).toBe("C:\\fakepath\\notes.txt");
	expect(controlValidity(tree, file).valid).toBe(true);
	expect(queries.matches(file, ":valid")).toBe(true);
	expect(actions.forms.checkValidity(formReference)).toBe(true);
	expect(tree.get(file).attributes.value).toBeUndefined();
	expect(copied).not.toHaveBeenCalled();
	expect(submissionCopied).not.toHaveBeenCalled();
});

it("serializes selected bytes through the normal multipart and GET preparation paths", () => {
	const { tree, form, select, formReference } = fixture();
	select("letter.txt", "current payload");
	const multipart = prepareFormSubmission(tree, formReference, {
		boundary: "owned-boundary",
	});
	expect(body(multipart.request)).toContain('filename="letter.txt"');
	expect(body(multipart.request)).toContain("current payload");
	tree.setAttribute(form, "method", "get");
	expect(prepareFormSubmission(tree, formReference).request.url).toBe(
		"https://fixture.invalid/upload?upload=letter.txt",
	);
});

it("refreshes selection after submit listeners instead of serializing a pre-event copy", () => {
	const { actions, select, form, formReference } = fixture();
	select("before.txt", "old bytes");
	actions.events.addEventListener(form, "submit", () =>
		select("after.txt", "fresh bytes"),
	);
	const result = actions.forms.requestSubmit(formReference);
	expect(result.invalid).toEqual([]);
	expect(result.submission).toBeDefined();
	const text = body(result.submission?.request ?? {});
	expect(text).toContain('filename="after.txt"');
	expect(text).toContain("fresh bytes");
	expect(text).not.toContain("old bytes");
});

it("observes selection cleared by a submit listener without rerunning constraint validation", () => {
	const { actions, owner, reference, select, form, formReference } = fixture();
	select();
	actions.events.addEventListener(form, "submit", () => owner.clear(reference));
	const result = actions.forms.requestSubmit(formReference);
	expect(result.invalid).toEqual([]);
	expect(body(result.submission?.request ?? {})).toContain('filename=""');
	expect(body(result.submission?.request ?? {})).not.toContain("owned bytes");
});

it.each([false, true])(
	"accepted reset clears selected files and invalidates captured targets with async=%s",
	async (async) => {
		const { actions, owner, reference, select, formReference, file, tree } =
			fixture();
		select();
		const target = owner.capture(reference);
		const input = vi.fn();
		const change = vi.fn();
		actions.events.addEventListener(file, "input", input);
		actions.events.addEventListener(file, "change", change);
		const result = async
			? await actions.forms.resetAsync(formReference)
			: actions.forms.reset(formReference);
		expect(result.reset).toBe(true);
		expect(owner.metrics()).toMatchObject({ files: 0, bytes: 0 });
		expect(controlValue(tree, file)).toBe("");
		expect(() => owner.replace(target, [])).toThrow(/stale/);
		expect(input).not.toHaveBeenCalled();
		expect(change).not.toHaveBeenCalled();
	},
);

it("canceled reset preserves selected bytes and the pending target", () => {
	const { actions, owner, reference, select, form, formReference } = fixture();
	select();
	const target = owner.capture(reference);
	actions.events.addEventListener(form, "reset", (event) =>
		event.preventDefault(),
	);
	expect(actions.forms.reset(formReference).canceled).toBe(true);
	expect(owner.metrics().files).toBe(1);
	expect(() => owner.replace(target, [])).not.toThrow();
});

it("failed reset preflight preserves file state and captured ownership", () => {
	const { actions, owner, reference, select, formReference } = fixture(
		"<output>unsupported</output>",
	);
	select();
	const target = owner.capture(reference);
	expect(() => actions.forms.reset(formReference)).toThrow(/output/);
	expect(owner.metrics().files).toBe(1);
	expect(() => owner.replace(target, [])).not.toThrow();
});

it("reset-button activation uses the same selected-file reset owner", () => {
	const { actions, tree, find, owner, select } = fixture();
	select();
	actions.click(tree.reference(find("#reset")));
	expect(owner.metrics().files).toBe(0);
});

it("guest value clearing rejects nonempty assignment and silently clears the shared selection", () => {
	const { tree, file, actions, owner, select } = fixture();
	select();
	const dom = new ScriptDom(tree, factory);
	const input = dom.node(file) as { value: string };
	const changed = vi.fn();
	actions.events.addEventListener(file, "change", changed);
	expect(input.value).toBe("C:\\fakepath\\selected.txt");
	expect(() => {
		input.value = "/private/path.txt";
	}).toThrow(/only be cleared/);
	expect(owner.metrics().files).toBe(1);
	input.value = "";
	expect(owner.metrics().files).toBe(0);
	expect(input.value).toBe("");
	expect(changed).not.toHaveBeenCalled();
});

it("retains detached file values and allows silent guest clearing without permitting a fresh upload", () => {
	const { tree, file, owner, reference, select } = fixture();
	select();
	const input = new ScriptDom(tree, factory).node(file) as { value: string };
	tree.remove(file);
	expect(input.value).toBe("C:\\fakepath\\selected.txt");
	expect(controlValidity(tree, file).valid).toBe(true);
	expect(owner.filesForSubmission().size).toBe(0);
	expect(() => owner.capture(reference)).toThrow(/Reference/);
	input.value = "";
	expect(owner.metrics().files).toBe(0);
	expect(input.value).toBe("");
});

it("preserves selections when the existing submission byte budget rejects the body", () => {
	const { tree, owner, select, formReference } = fixture();
	select("large.txt", "x".repeat(2048));
	expect(() =>
		prepareFormSubmission(tree, formReference, { maxBytes: 1024 }),
	).toThrow();
	expect(owner.metrics()).toMatchObject({ files: 1, bytes: 2048 });
});

it("keeps explicit library-provided file maps separate from the default document selection", () => {
	const { tree, file, owner, select, formReference } = fixture();
	select();
	const result = prepareFormSubmission(tree, formReference, {
		files: new Map([
			[
				file,
				[{ name: "library.txt", data: new TextEncoder().encode("explicit") }],
			],
		]),
	});
	expect(body(result.request)).toContain('filename="library.txt"');
	expect(owner.metrics().files).toBe(1);
});

it("document closure releases owned files and prevents singleton resurrection", () => {
	const { tree, owner, select } = fixture();
	select();
	tree.close();
	expect(owner.metrics()).toMatchObject({ closed: true, files: 0, bytes: 0 });
	expect(existingDocumentFiles(tree)).toBeUndefined();
	expect(() => documentFiles(tree)).toThrow(/closed/);
});

it("invalidates a retained guest validity object when files change", () => {
	const { tree, file, owner, select } = fixture();
	const input = new ScriptDom(tree, factory).node(file) as {
		validity: { valid: boolean; valueMissing: boolean };
		value: string;
	};
	const validity = input.validity;
	expect(validity.valueMissing).toBe(true);
	select();
	expect(input.validity).toBe(validity);
	expect(validity.valid).toBe(true);
	input.value = "";
	expect(validity.valueMissing).toBe(true);
	expect(owner.metrics().files).toBe(0);
});
