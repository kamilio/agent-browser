import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import {
	controlChecked,
	controlShowsPlaceholder,
	controlValue,
	inputType,
	isControlDisabled,
	optionLabel,
	selectedOptions,
	selectOptions,
} from "./controls.js";
import { paintBackground, type PaintStyle } from "./css-paint.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
	type Rgba,
} from "./raster.js";

export const controlRenderingLimits = Object.freeze({
	maxTextCodeUnits: 4096,
	maxAxis: 4096,
	maxPixels: 1_048_576,
});
export const controlRenderingCapabilities = Object.freeze({
	partial: true,
	profile: "agent-mono-software-controls",
	richButtonContent: false,
	platformAppearance: false,
	popup: false,
	textScrolling: false,
	placeholderState: "attribute-present-and-empty-api-value",
	placeholderWhileFocused: true,
	...controlRenderingLimits,
});
export interface SoftwareControl {
	readonly kind:
		| "button"
		| "text"
		| "textarea"
		| "select"
		| "checkbox"
		| "radio";
	readonly text: string;
	readonly fontSize: number;
	readonly width: number;
	readonly height: number;
	readonly disabled: boolean;
	readonly focused: boolean;
	readonly checked: boolean;
	readonly indeterminate: boolean;
	readonly placeholder: boolean;
}

export function describeControl(
	tree: DocumentTree,
	id: number,
	fontSize: number,
): SoftwareControl | undefined {
	const node = tree.get(id);
	let kind: SoftwareControl["kind"];
	let text = "";
	let widest = 0;
	if (node.tagName === "button") {
		if (node.children.some((child) => tree.get(child).kind === "element"))
			throw new AgentBrowserError(
				"unsupported",
				"Rich button content layout is not implemented",
			);
		kind = "button";
		text = tree
			.textContent(id)
			.replace(/[\t\n\f\r ]+/g, " ")
			.trim();
	} else if (node.tagName === "textarea") {
		kind = "textarea";
		text = controlValue(tree, id);
	} else if (node.tagName === "select") {
		if (
			Object.hasOwn(node.attributes, "multiple") ||
			Number(node.attributes.size ?? "1") > 1
		)
			return;
		kind = "select";
		const selected = selectedOptions(tree, id)[0];
		text = selected ? optionLabel(tree, selected.id) : "";
		const options = selectOptions(tree, id);
		if (options.length > 1024)
			throw new AgentBrowserError(
				"resource-limit",
				"Control option count limit exceeded",
			);
		let total = 0;
		for (const option of options) {
			const label = optionLabel(tree, option.id);
			total += label.length;
			if (
				label.length > controlRenderingLimits.maxTextCodeUnits ||
				total > 65_536
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Control option text limit exceeded",
				);
			widest = Math.max(
				widest,
				Array.from(label.replace(/[\t\n\f\r ]+/g, " ").trim()).length,
			);
		}
	} else if (node.tagName === "input") {
		const type = inputType(node);
		if (["checkbox", "radio"].includes(type))
			kind = type as "checkbox" | "radio";
		else if (["submit", "reset", "button"].includes(type)) {
			kind = "button";
			text = controlValue(tree, id);
		} else if (
			["text", "search", "url", "tel", "email", "password", "number"].includes(
				type,
			)
		) {
			kind = "text";
			const value = controlValue(tree, id);
			if (value.length > controlRenderingLimits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Control text limit exceeded",
				);
			text = type === "password" ? "*".repeat(value.length) : value;
		} else return;
	} else return;
	const placeholder = controlShowsPlaceholder(tree, id);
	if (placeholder) {
		if (
			node.attributes.placeholder.length >
			controlRenderingLimits.maxTextCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Control text limit exceeded",
			);
		text =
			kind === "textarea"
				? node.attributes.placeholder.replace(/\r\n?/g, "\n")
				: node.attributes.placeholder.replace(/[\r\n]/g, "");
	}
	if (text.length > controlRenderingLimits.maxTextCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Control text limit exceeded",
		);
	if (kind === "select") text = text.replace(/[\t\n\f\r ]+/g, " ").trim();
	if (
		!Number.isFinite(fontSize) ||
		fontSize < 0 ||
		fontSize > bitmapFont.maxFontSize
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Control font limit exceeded",
		);
	const count = (name: string, fallback: number) => {
		const value = node.attributes[name];
		if (!value || !/^\d+$/.test(value) || Number(value) < 1) return fallback;
		const number = Number(value);
		if (!Number.isSafeInteger(number) || number > 1000)
			throw new AgentBrowserError(
				"resource-limit",
				"Control dimension attribute limit exceeded",
			);
		return number;
	};
	const advance = (bitmapFont.advance * fontSize) / bitmapFont.unitsPerEm;
	const square = Math.max(12, fontSize);
	const width =
		kind === "checkbox" || kind === "radio"
			? square
			: kind === "text" || kind === "textarea"
				? count(kind === "textarea" ? "cols" : "size", 20) * advance + 12
				: Math.max(1, widest, Array.from(text).length) * advance +
					(kind === "select" ? 24 : 12);
	const height =
		kind === "checkbox" || kind === "radio"
			? square
			: (kind === "textarea" ? count("rows", 2) : 1) * Math.max(1, fontSize) +
				8;
	if (
		width > controlRenderingLimits.maxAxis ||
		height > controlRenderingLimits.maxAxis
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Control intrinsic dimension limit exceeded",
		);
	return Object.freeze({
		kind,
		text,
		fontSize,
		width,
		height,
		placeholder,
		disabled: isControlDisabled(tree, id),
		focused: tree.activeElement === id,
		checked:
			kind === "checkbox" || kind === "radio"
				? controlChecked(tree, id)
				: false,
		indeterminate: kind === "checkbox" && node.control.indeterminate === true,
	});
}

export function rasterizeControl(
	control: SoftwareControl,
	width: number,
	height: number,
	paint: PaintStyle,
	charge: (amount: number) => void,
) {
	const columns = Math.ceil(width);
	const rows = Math.ceil(height);
	if (
		!Number.isFinite(columns) ||
		!Number.isFinite(rows) ||
		columns < 1 ||
		rows < 1 ||
		columns > controlRenderingLimits.maxAxis ||
		rows > controlRenderingLimits.maxAxis ||
		columns * rows > controlRenderingLimits.maxPixels
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Control raster limit exceeded",
		);
	charge(columns * rows * 8 + control.text.length * 64);
	const background = paintBackground(paint);
	const fill: Rgba = background[3]
		? background
		: control.disabled
			? [224, 224, 224, 255]
			: control.kind === "button"
				? [240, 240, 240, 255]
				: [255, 255, 255, 255];
	const edge: Rgba = control.focused ? [0, 96, 192, 255] : [96, 96, 96, 255];
	const foreground: Rgba =
		control.disabled || control.placeholder
			? [128, 128, 128, 255]
			: paint.color;
	const image = createRaster(columns, rows, fill);
	paintRasterRect(image, 0, 0, columns, 1, edge);
	paintRasterRect(image, 0, rows - 1, columns, 1, edge);
	paintRasterRect(image, 0, 0, 1, rows, edge);
	paintRasterRect(image, columns - 1, 0, 1, rows, edge);
	if (control.kind === "checkbox" || control.kind === "radio") {
		if (control.kind === "radio") {
			const radius = Math.min(columns, rows) / 2;
			for (let row = 0; row < rows; row++)
				for (let column = 0; column < columns; column++) {
					const distance = Math.hypot(
						column + 0.5 - columns / 2,
						row + 0.5 - rows / 2,
					);
					const color: Rgba =
						distance > radius
							? fill
							: distance > radius - 1
								? edge
								: control.checked && distance < radius / 2
									? foreground
									: fill;
					image.pixels.set(color, (row * columns + column) * 4);
				}
			return image;
		}
		if (control.checked || control.indeterminate) {
			const inset = Math.max(2, Math.floor(Math.min(columns, rows) / 4));
			const markHeight = control.indeterminate
				? Math.min(2, rows)
				: Math.max(0, rows - 2 * inset);
			paintRasterRect(
				image,
				inset,
				control.indeterminate ? Math.floor(rows / 2) : inset,
				Math.max(0, columns - 2 * inset),
				markHeight,
				foreground,
			);
		}
		return image;
	}
	const advance =
		(bitmapFont.advance * control.fontSize) / bitmapFont.unitsPerEm;
	const labelWidth = Array.from(control.text).length * advance;
	if (control.kind === "select" && columns >= 18 && rows >= 8)
		for (let row = 0; row < 4; row++)
			paintRasterRect(
				image,
				columns - 12 + row,
				Math.floor(rows / 2) - 2 + row,
				7 - row * 2,
				1,
				foreground,
			);
	let horizontal =
		control.kind === "button" ? Math.max(6, (columns - labelWidth) / 2) : 6;
	let vertical =
		control.kind === "textarea"
			? 4
			: Math.max(4, (rows - control.fontSize) / 2);
	if (control.fontSize > 0)
		for (const character of control.text) {
			if (character === "\n" && control.kind === "textarea") {
				horizontal = 6;
				vertical += control.fontSize;
				continue;
			}
			if (
				horizontal + advance >
				columns - (control.kind === "select" ? 18 : 6)
			) {
				if (control.kind !== "textarea") break;
				horizontal = 6;
				vertical += control.fontSize;
			}
			if (vertical + control.fontSize > rows - 4) break;
			if (!bitmapGlyph(character).supported)
				throw new AgentBrowserError(
					"unsupported",
					"Control caption glyph is not supported",
				);
			paintBitmapGlyph(
				image,
				character,
				horizontal,
				vertical,
				control.fontSize,
				foreground,
			);
			horizontal += advance;
		}
	return image;
}
