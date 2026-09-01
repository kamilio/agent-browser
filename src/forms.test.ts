import { expect, it } from "vitest";
import {
	fillTextControl,
	selectControlValues,
	setControlChecked,
} from "./controls.js";
import { DocumentTree } from "./document.js";
import { prepareFormSubmission } from "./forms.js";

function fixture(
	attributes: Record<string, string> = {},
	url = "https://example.com/page?old=1#section",
) {
	const tree = new DocumentTree(url);
	const form = tree.createElement("form", { id: "form", ...attributes });
	tree.append(tree.root, form);
	const add = (
		tag: string,
		attrs: Record<string, string> = {},
		parent = form,
		text = "",
	) => {
		const id = tree.createElement(tag, attrs);
		tree.append(parent, id);
		if (text) tree.append(id, tree.createText(text));
		return id;
	};
	const prepare = (options: Parameters<typeof prepareFormSubmission>[2] = {}) =>
		prepareFormSubmission(tree, tree.reference(form), options);
	return { tree, form, add, prepare };
}

it("constructs successful controls in document order and replaces a GET action's query", () => {
	const { tree, add, prepare } = fixture({
		action: "/search?discard=1#results",
	});
	add("input", { name: "q", value: "first" });
	add("input", { name: "q", value: "second" });
	add("input", { value: "no-name" });
	add("input", { name: "", value: "empty-name" });
	add("input", { name: "disabled", value: "omit", disabled: "" });
	add("input", { name: "readonly", value: "keep", readonly: "" });
	add("input", { name: "no", type: "checkbox" });
	add("input", { name: "yes", type: "checkbox", checked: "" });
	add("button", { name: "button", value: "omit" });
	add(
		"input",
		{ form: "form", name: "external", value: "included" },
		tree.root,
	);
	const result = prepare();
	const url = new URL(result.request.url);
	expect([...url.searchParams]).toEqual([
		["q", "first"],
		["q", "second"],
		["readonly", "keep"],
		["yes", "on"],
		["external", "included"],
	]);
	expect(url.pathname).toBe("/search");
	expect(url.hash).toBe("#results");
	expect(result.request.body).toBeUndefined();
	expect(result.request.method).toBe("GET");
});

it("uses current dirty control state without including inactive radios or disabled choices", () => {
	const { tree, add, prepare } = fixture();
	const input = add("input", { name: "text", value: "default" });
	fillTextControl(tree, tree.reference(input), "changed");
	const first = add("input", {
		name: "radio",
		type: "radio",
		value: "first",
		checked: "",
	});
	const second = add("input", {
		name: "radio",
		type: "radio",
		value: "second",
	});
	setControlChecked(tree, tree.reference(second), true);
	const select = add("select", { name: "choices", multiple: "" });
	add("option", { value: "one", selected: "" }, select);
	add("option", { value: "disabled", selected: "", disabled: "" }, select);
	add("option", { value: "two", selected: "" }, select);
	expect([...new URL(prepare().request.url).searchParams]).toEqual([
		["text", "changed"],
		["radio", "second"],
		["choices", "one"],
		["choices", "two"],
	]);
	setControlChecked(tree, tree.reference(first), true);
	selectControlValues(tree, tree.reference(select), ["two"]);
	expect(new URL(prepare().request.url).searchParams.get("radio")).toBe(
		"first",
	);
});

it("honors disabled fieldset legends, form reassociation and datalist exclusion", () => {
	const { tree, add, prepare } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const legend = add("legend", {}, fieldset);
	add("input", { name: "legend", value: "included" }, legend);
	add("input", { name: "fieldset", value: "omitted" }, fieldset);
	const datalist = add("datalist");
	add("input", { name: "datalist", value: "omitted" }, datalist);
	add("form", { id: "other" }, tree.root);
	add("input", { form: "other", name: "other", value: "omitted" });
	expect([...new URL(prepare().request.url).searchParams]).toEqual([
		["legend", "included"],
	]);
});

it("applies submitter overrides and includes only the chosen submit button", () => {
	const { tree, add, prepare } = fixture({ method: "get", action: "/default" });
	add("button", { name: "submit", value: "not-used" });
	const button = add("button", {
		name: "submit",
		value: "chosen",
		formaction: "/chosen?keep=1",
		formmethod: "POST",
		formenctype: "text/plain",
		formtarget: "_blank",
		formnovalidate: "",
	});
	const result = prepare({ submitter: tree.reference(button) });
	expect(result.request).toMatchObject({
		method: "POST",
		url: "https://example.com/chosen?keep=1",
		headers: { "content-type": "text/plain", origin: "https://example.com" },
	});
	expect(new TextDecoder().decode(result.request.body as Uint8Array)).toBe(
		"submit=chosen\r\n",
	);
	expect(result.target).toBe("_blank");
	expect(result.skipValidation).toBe(true);
	const wrong = add("button", { type: "button" });
	expect(() => prepare({ submitter: tree.reference(wrong) })).toThrow(
		"Invalid form submitter",
	);
});

it("normalizes line breaks and UTF-8 form URL encoding, including charset and dirname entries", () => {
	const { add, prepare } = fixture({ method: "post" });
	add(
		"textarea",
		{ name: "multi\nline", dirname: "direction", dir: "rtl" },
		undefined,
		"日本語\rfirst\nsecond",
	);
	add("input", { type: "hidden", name: "_charset_", value: "ignored" });
	const result = prepare();
	const body = new TextDecoder().decode(result.request.body as Uint8Array);
	expect([...new URLSearchParams(body)]).toEqual([
		["multi\r\nline", "日本語\r\nfirst\r\nsecond"],
		["direction", "rtl"],
		["_charset_", "UTF-8"],
	]);
	expect(result.request.url).toBe("https://example.com/page?old=1#section");
});

it("resolves relative actions against base href but keeps empty actions on the document URL", () => {
	const { tree, form, add, prepare } = fixture({ action: "relative" });
	add("base", { href: "https://other.example/base/" }, tree.root);
	expect(prepare().request.url).toBe("https://other.example/base/relative");
	tree.setAttribute(form, "action", "");
	expect(prepare().request.url).toBe("https://example.com/page#section");
});

it("serializes image submit coordinates without requiring a name", () => {
	const { tree, add, prepare } = fixture();
	const image = add("input", { type: "image" });
	expect([
		...new URL(
			prepare({
				submitter: tree.reference(image),
				imagePosition: { x: 12, y: 34 },
			}).request.url,
		).searchParams,
	]).toEqual([
		["x", "12"],
		["y", "34"],
	]);
	tree.setAttribute(image, "name", "point");
	expect([
		...new URL(prepare({ submitter: tree.reference(image) }).request.url)
			.searchParams,
	]).toEqual([
		["point.x", "0"],
		["point.y", "0"],
	]);
	expect(() =>
		prepare({
			submitter: tree.reference(image),
			imagePosition: { x: -1, y: 0 },
		}),
	).toThrow("coordinates");
});

it("produces multipart payloads parseable by the host's independent FormData implementation", async () => {
	const { tree, add, prepare } = fixture({
		method: "post",
		enctype: "multipart/form-data",
	});
	add("input", { name: "same", value: "one" });
	add("input", { name: "same", value: "two" });
	add("textarea", { name: "notes" }, undefined, "line1\nline2");
	const upload = add("input", { name: "upload", type: "file" });
	add("input", { name: "empty", type: "file" });
	const bytes = new Uint8Array([0, 1, 255, 13, 10]);
	const result = prepare({
		files: new Map([
			[
				upload,
				[{ name: "test.bin", type: "application/octet-stream", data: bytes }],
			],
		]),
		boundary: "fixture-boundary",
	});
	bytes.fill(99);
	const response = new Response(
		result.request.body as Uint8Array<ArrayBuffer>,
		{ headers: result.request.headers },
	);
	const formData = await response.formData();
	const wire = new TextDecoder().decode(result.request.body as Uint8Array);
	expect(wire).toContain('name="upload"; filename="test.bin"');
	expect(wire).toContain('name="empty"; filename=""');
	expect(formData.getAll("same")).toEqual(["one", "two"]);
	expect(formData.get("notes")).toBe("line1\r\nline2");
	const file = formData.get("upload") as File;
	expect(file.name).toBe("test.bin");
	expect(new Uint8Array(await file.arrayBuffer())).toEqual(
		new Uint8Array([0, 1, 255, 13, 10]),
	);
	expect((formData.get("empty") as File).size).toBe(0);
	expect((formData.get("empty") as File).name).toBe("");
	expect(tree.get(upload).attributes.value).toBeUndefined();
});

it("emits exact canonical multipart bytes independently of a host FormData reader", () => {
	const { add, prepare } = fixture({
		method: "post",
		enctype: "multipart/form-data",
	});
	const file = add("input", { name: "file", type: "file" });
	const source = new Uint8Array([0, 1, 255, 13, 10]);
	const result = prepare({
		boundary: "fixed",
		files: new Map([[file, [{ name: "data.bin", data: source }]]]),
	});
	source.fill(99);
	const expected = new Uint8Array([
		...new TextEncoder().encode(
			'--fixed\r\nContent-Disposition: form-data; name="file"; filename="data.bin"\r\nContent-Type: application/octet-stream\r\n\r\n',
		),
		0,
		1,
		255,
		13,
		10,
		...new TextEncoder().encode("\r\n--fixed--\r\n"),
	]);
	expect(result.request.body).toEqual(expected);
});

it("escapes multipart header fields and rejects boundary collisions and MIME header injection", () => {
	const { add, prepare } = fixture({
		method: "post",
		enctype: "multipart/form-data",
	});
	add("input", { name: 'line\n"name', value: "value" });
	const upload = add("input", { name: "upload", type: "file" });
	const result = prepare({
		files: new Map([
			[upload, [{ name: 'line\r"file', data: new Uint8Array() }]],
		]),
		boundary: "fixed",
	});
	const body = new TextDecoder().decode(result.request.body as Uint8Array);
	expect(body).toContain('name="line%0D%0A%22name"');
	expect(body).toContain('filename="line%0D%22file"');
	expect(() =>
		prepare({
			files: new Map([
				[
					upload,
					[
						{
							name: "file",
							type: "text/plain\r\nx-evil: yes",
							data: new Uint8Array(),
						},
					],
				],
			]),
		}),
	).toThrow("Invalid form upload");
	expect(() =>
		prepare({
			files: new Map([
				[
					upload,
					[
						{
							name: "file",
							data: new TextEncoder().encode("\r\n--fixed\r\nspoof"),
						},
					],
				],
			]),
			boundary: "fixed",
		}),
	).toThrow("collides");
});

it("uses only filenames for GET or URL-encoded file controls, not file payload bytes", () => {
	const { tree, form, add, prepare } = fixture();
	const upload = add("input", { name: "upload", type: "file" });
	const options = {
		files: new Map([
			[upload, [{ name: "name.txt", data: new Uint8Array(4096) }]],
		]),
		maxBytes: 256,
	};
	expect(new URL(prepare(options).request.url).searchParams.get("upload")).toBe(
		"name.txt",
	);
	tree.setAttribute(form, "method", "post");
	expect(
		new TextDecoder().decode(prepare(options).request.body as Uint8Array),
	).toBe("upload=name.txt");
});

it("fails closed on unsupported schemes, encodings, dialog submissions and resource limits", () => {
	const { tree, form, add, prepare } = fixture({ method: "post" });
	add("input", { name: "large", value: "x".repeat(1000) });
	const revision = tree.revision;
	expect(() => prepare({ maxBytes: 20 })).toThrow("limit");
	expect(tree.revision).toBe(revision);
	tree.setAttribute(form, "action", "javascript:alert(1)");
	expect(() => prepare()).toThrow("Only HTTP");
	tree.setAttribute(form, "action", "https://example.com");
	tree.setAttribute(form, "accept-charset", "windows-1252");
	expect(() => prepare()).toThrow("UTF-8");
	tree.removeAttribute(form, "accept-charset");
	tree.setAttribute(form, "method", "dialog");
	expect(() => prepare()).toThrow("Dialog");
	expect(() => prepare({ maxEntries: 0 })).toThrow("Invalid form limits");
});
