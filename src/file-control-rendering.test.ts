import { afterEach, expect, it, vi } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import {
	controlRenderingCapabilities,
	describeControl,
	rasterizeControl,
} from "./control-rendering.js";
import { initialPaintStyle } from "./css-paint.js";
import { documentFiles, existingDocumentFiles } from "./document-files.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(attributes = "", css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input{font-size:8px}${css}</style><form id="form"><input id="file" type="file" ${attributes}></form>`,
		"https://fixture.invalid/file-control-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(320, 80);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#file") as number;
	const form = queries.querySelector("#form") as number;
	const descriptor = (fontSize = 8) => {
		const control = describeControl(tree, id, fontSize);
		if (!control) throw new Error("Missing file control");
		return control;
	};
	const select = (...names: string[]) => {
		const owner = documentFiles(tree);
		owner.replace(
			owner.capture(tree.reference(id)),
			names.map((name) => ({ name, data: new Uint8Array([1, 2, 3]) })),
		);
	};
	const paint = (width = 228, height = 16) =>
		rasterizeControl(descriptor(), width, height, initialPaintStyle, () => {});
	return { tree, id, form, descriptor, select, paint };
}

it.each([
	["", "Choose File", "No file selected"],
	["multiple", "Choose Files", "No files selected"],
])(
	"paints an empty file control with attributes %s without creating an owner",
	(attributes, buttonText, text) => {
		const { tree, descriptor } = fixture(attributes);
		expect(descriptor()).toMatchObject({
			kind: "file",
			buttonText,
			text,
			width: 228,
			height: 16,
		});
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			paintedControls: 1,
			paintedImages: 0,
		});
		expect(existingDocumentFiles(tree)).toBeUndefined();
		expect(controlRenderingCapabilities.fileChooser).toBe(false);
	},
);

it("uses the same owner as forms and interactions and never copies payload bytes", () => {
	const { tree, id, descriptor, paint } = fixture();
	const owner = documentFiles(tree);
	expect(documentInteractions(tree).files).toBe(owner);
	owner.replace(owner.capture(tree.reference(id)), [
		{
			name: "owned.txt",
			type: "text/plain",
			data: new Uint8Array(8 * 1024 * 1024),
		},
	]);
	const metadata = vi.spyOn(owner, "selectionMetadata");
	const copied = vi.spyOn(owner, "files").mockImplementation(() => {
		throw new Error("Byte-copy path called");
	});
	const submitted = vi
		.spyOn(owner, "filesForSubmission")
		.mockImplementation(() => {
			throw new Error("Submission-copy path called");
		});
	expect(descriptor()).toMatchObject({ text: "owned.txt" });
	paint();
	rasterizeDocument(tree);
	expect(metadata).toHaveBeenCalledWith(id);
	expect(copied).not.toHaveBeenCalled();
	expect(submitted).not.toHaveBeenCalled();
	expect(owner.metrics().bytes).toBe(8 * 1024 * 1024);
});

it("updates one filename and a multiple count without changing intrinsic geometry", () => {
	const { tree, id, descriptor, select } = fixture("multiple");
	const before = documentGeometry(tree).getBoundingClientRect(id);
	select("one.txt");
	expect(descriptor().text).toBe("one.txt");
	select("one.txt", "two.txt");
	expect(descriptor().text).toBe("2 files selected");
	expect(documentGeometry(tree).getBoundingClientRect(id)).toEqual(before);
	select(...Array.from({ length: 64 }, (_, index) => `file-${index}.txt`));
	expect(descriptor().text).toBe("64 files selected");
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("clips a maximum-length name without widening, retaining paths or modifying attributes", () => {
	const { tree, id, descriptor, select, paint } = fixture(
		'value="/ignored/private/path"',
	);
	const attributes = { ...tree.get(id).attributes };
	select("a".repeat(255));
	expect(descriptor()).toMatchObject({ text: "a".repeat(255), width: 228 });
	const long = paint().pixels;
	select("a".repeat(24));
	expect(paint().pixels).toEqual(long);
	const formatting = JSON.stringify(buildFormattingTree(tree));
	expect(formatting).not.toContain("/ignored/private/path");
	expect(formatting).not.toContain("fakepath");
	expect(tree.get(id).attributes).toEqual(attributes);
	expect(tree.get(id).control.value).toBeUndefined();
});

it("honors disabled styling for an owned selection and inherited fieldset disability", () => {
	const { tree, id, descriptor, select, paint } = fixture();
	select("owned.txt");
	const enabled = paint().pixels;
	tree.setAttribute(id, "disabled", "");
	expect(descriptor()).toMatchObject({ disabled: true, text: "owned.txt" });
	expect(paint().pixels).not.toEqual(enabled);
	expect(
		Array.from(paint().pixels.slice((2 * 228 + 2) * 4, (2 * 228 + 2) * 4 + 4)),
	).toEqual([224, 224, 224, 255]);
	tree.removeAttribute(id, "disabled");
	const fieldset = tree.createElement("fieldset");
	tree.setAttribute(fieldset, "disabled", "");
	tree.append(tree.get(id).parent as number, fieldset);
	tree.append(fieldset, id);
	expect(descriptor().disabled).toBe(true);
});

it.each(["clear", "reset"])(
	"repaints after selection replacement and %s with no stale layout caption",
	(operation) => {
		const { tree, id, form, select, descriptor } = fixture();
		const before = rasterizeDocument(tree).image.pixels;
		select("first.txt");
		const selected = rasterizeDocument(tree).image.pixels;
		expect(selected).not.toEqual(before);
		select("second.txt");
		expect(rasterizeDocument(tree).image.pixels).not.toEqual(selected);
		if (operation === "clear") documentFiles(tree).clear(id);
		else documentInteractions(tree).forms.reset(tree.reference(form));
		expect(descriptor().text).toBe("No file selected");
		expect(rasterizeDocument(tree).image.pixels).toEqual(before);
	},
);

it("rejects stale replacement without changing displayed selection", () => {
	const { tree, id, select, descriptor } = fixture();
	const owner = documentFiles(tree);
	const stale = owner.capture(tree.reference(id));
	select("current.txt");
	expect(() =>
		owner.replace(stale, [{ name: "stale.txt", data: new Uint8Array() }]),
	).toThrow(/stale/);
	expect(descriptor().text).toBe("current.txt");
});

it("drops the filename on a type transition and returns empty on transition back", () => {
	const { tree, id, select, descriptor } = fixture();
	select("previous.txt");
	tree.setAttribute(id, "type", "text");
	expect(descriptor()).toMatchObject({ kind: "text", text: "" });
	expect(documentFiles(tree).metrics().files).toBe(0);
	tree.setAttribute(id, "type", "file");
	expect(descriptor()).toMatchObject({
		kind: "file",
		text: "No file selected",
	});
});

it("describes detached retained metadata but only paints connected controls", () => {
	const { tree, id, form, select, descriptor } = fixture();
	select("retained.txt");
	tree.remove(id);
	expect(descriptor().text).toBe("retained.txt");
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(0);
	documentFiles(tree).clear(id);
	expect(descriptor().text).toBe("No file selected");
	tree.append(form, id);
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("isolates document identity and rejects rendering after owner or document closure", () => {
	const first = fixture();
	const second = fixture();
	first.select("private.txt");
	expect(second.descriptor().text).toBe("No file selected");
	documentFiles(first.tree).close();
	expect(() => first.descriptor()).toThrow(/closed/);
	second.tree.close();
	expect(() => second.descriptor()).toThrow(/closed/);
	expect(existingDocumentFiles(second.tree)).toBeUndefined();
});

it("preserves matching geometry and pointer hit targets across both painted subregions", () => {
	const { tree, id } = fixture(
		"",
		"input{width:200px;height:24px;padding:3px;box-sizing:border-box}",
	);
	const rect = documentGeometry(tree).getBoundingClientRect(id);
	expect(rect).toMatchObject({ width: 200, height: 24 });
	const actions = documentInteractions(tree);
	for (const offset of [10, 150])
		expect(actions.mouse.move(rect.x + offset, rect.y + 8).reference).toBe(
			tree.reference(id),
		);
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
	expect(documentFiles(tree).metrics().files).toBe(0);
});

it("paints focus and CSS color without altering ownership or generating input/change", () => {
	const { tree, id, select, paint } = fixture();
	select("focus.txt");
	const actions = documentInteractions(tree);
	const changed = vi.fn();
	actions.events.addEventListener(id, "input", changed);
	actions.events.addEventListener(id, "change", changed);
	actions.focus.focus(tree.reference(id));
	expect(Array.from(paint().pixels.slice(0, 4))).toEqual([0, 96, 192, 255]);
	tree.setAttribute(id, "style", "color:red;background-color:yellow");
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
	expect(changed).not.toHaveBeenCalled();
	expect(documentFiles(tree).metrics().files).toBe(1);
});

it.each([
	[1, 1],
	[2, 2],
	[10, 16],
	[80, 16],
	[228.5, 16.5],
])(
	"clips file painting to %s by %s without overwriting its outer border",
	(width, height) => {
		const { paint, select } = fixture();
		select("a".repeat(255));
		const image = paint(width, height);
		expect(image.width).toBe(Math.ceil(width));
		expect(image.height).toBe(Math.ceil(height));
		expect(image.pixels.length).toBe(image.width * image.height * 4);
		for (let column = 0; column < image.width; column++) {
			expect(
				Array.from(image.pixels.slice(column * 4, column * 4 + 4)),
			).toEqual([96, 96, 96, 255]);
			const bottom = ((image.height - 1) * image.width + column) * 4;
			expect(Array.from(image.pixels.slice(bottom, bottom + 4))).toEqual([
				96, 96, 96, 255,
			]);
		}
	},
);

it("uses existing font and work budgets including both captions", () => {
	const { tree, descriptor } = fixture('size="999999"');
	expect(descriptor(0)).toMatchObject({ width: 24, height: 9 });
	expect(descriptor(16)).toMatchObject({ width: 432, height: 24 });
	expect(() => descriptor(bitmapFont.maxFontSize + 1)).toThrow(/font limit/);
	const charge = vi.fn();
	const control = descriptor();
	rasterizeControl(control, 228, 16, initialPaintStyle, charge);
	expect(charge).toHaveBeenCalledWith(
		228 * 16 * 8 +
			(control.text.length + (control.buttonText?.length ?? 0)) * 64,
	);
	expect(() =>
		rasterizeControl(control, 4097, 1, initialPaintStyle, charge),
	).toThrow(/raster limit/);
	expect(() =>
		rasterizeControl(control, 2048, 2048, initialPaintStyle, charge),
	).toThrow(/raster limit/);
	expect(() => rasterizeDocument(tree, { maxWork: 1 })).toThrow(/limit/);
});

it("retains explicit unsupported-glyph behavior rather than claiming full filename typography", () => {
	const { select, descriptor, paint } = fixture();
	select("文.txt");
	expect(descriptor().text).toBe("文.txt");
	expect(() => paint()).toThrow(/glyph is not supported/);
});

it("keeps visible file-input forms issue-free for submit/reset button geometry and native actions", () => {
	const { tree, id, form, select } = fixture();
	const actions = documentInteractions(tree);
	for (const type of ["submit", "reset"]) {
		const button = tree.createElement("button");
		tree.setAttribute(button, "type", type);
		tree.setTextContent(button, type);
		tree.append(form, button);
		select("visible.txt");
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(228);
		expect(
			documentGeometry(tree).getBoundingClientRect(button).width,
		).toBeGreaterThan(0);
		const result = actions.click(tree.reference(button));
		if (type === "submit")
			expect(result.defaultAction).toMatchObject({
				kind: "submit",
				formRef: tree.reference(form),
			});
		else expect(result.reset?.reset).toBe(true);
	}
	expect(documentFiles(tree).metrics().files).toBe(0);
	expect(buildFormattingTree(tree).issues).toEqual({});
});

it("keeps fixed file-control geometry and pixels anchored while the root scrolls", () => {
	const { tree, id, select } = fixture(
		"",
		"form{width:500px;height:800px}#file{position:fixed;left:20px;top:12px}",
	);
	select("fixed.txt");
	const geometry = documentGeometry(tree).getBoundingClientRect(id);
	const before = rasterizeDocument(tree).image;
	const scroll = documentScroll(tree);
	scroll.to(40, 200);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toEqual(geometry);
	expect(rasterizeDocument(tree).image.pixels).toEqual(before.pixels);
	const crop = rasterizeDocument(tree, { element: tree.reference(id) });
	expect(crop.image).toMatchObject({ width: 228, height: 16 });
	documentInteractions(tree).focus.focusElement(id);
	expect(scroll.get()).toEqual({ x: 40, y: 200 });
	expect(documentGeometry(tree).getBoundingClientRect(id)).toEqual(geometry);
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});
