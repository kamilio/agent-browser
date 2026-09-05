import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { layoutControlText } from "./control-text-layout.js";
import {
	controlChecked,
	controlShowsPlaceholder,
	controlValue,
	inputType,
	isControlDisabled,
	optionLabel,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import { type PaintStyle, paintBackground, paintCaret } from "./css-paint.js";
import { existingDocumentFiles } from "./document-files.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { isInertSubtree } from "./inertness.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import {
	type Rgba,
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
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
	textScrolling: "focused-native-selection-edge",
	textSelection: "owned-native-keyboard-code-unit-selection",
	textCaret: "collapsed-focused-native-selection",
	placeholderState: "attribute-present-and-empty-api-value",
	placeholderWhileFocused: true,
	fileSelection: "owned-metadata-only",
	fileChooser: false,
	...controlRenderingLimits,
});
export const controlSelectionBackground: Rgba = Object.freeze([
	181, 213, 255, 255,
]);
export interface SoftwareControl {
	readonly kind:
		| "button"
		| "text"
		| "textarea"
		| "select"
		| "file"
		| "checkbox"
		| "radio";
	readonly text: string;
	readonly buttonText?: string;
	readonly fontSize: number;
	readonly width: number;
	readonly height: number;
	readonly disabled: boolean;
	readonly focused: boolean;
	readonly checked: boolean;
	readonly indeterminate: boolean;
	readonly placeholder: boolean;
	readonly selection?: NonNullable<
		ReturnType<typeof readNativeControlSelection>
	>;
}

export function describeControl(
	tree: DocumentTree,
	id: number,
	fontSize: number,
): SoftwareControl | undefined {
	const node = tree.get(id);
	let kind: SoftwareControl["kind"];
	let text = "";
	let valueLength = 0;
	let buttonText: string | undefined;
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
		valueLength = text.length;
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
		if (type === "file") {
			kind = "file";
			const multiple = Object.hasOwn(node.attributes, "multiple");
			buttonText = multiple ? "Choose Files" : "Choose File";
			const files = existingDocumentFiles(tree)?.selectionMetadata(id) ?? [];
			text =
				files.length > 1
					? `${files.length} files selected`
					: (files[0]?.name ??
						(multiple ? "No files selected" : "No file selected"));
		} else if (["checkbox", "radio"].includes(type))
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
			valueLength = value.length;
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
			: kind === "file"
				? 34 * advance + 24
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
	const disabled = isControlDisabled(tree, id);
	const focused = tree.activeElement === id;
	const selection =
		focused &&
		!disabled &&
		tree.isConnected(id) &&
		!isInertSubtree(tree, id) &&
		(kind === "textarea" ||
			(kind === "text" &&
				["text", "search", "url", "tel", "password"].includes(inputType(node))))
			? (readNativeControlSelection(tree, id) ??
				Object.freeze({
					anchor: valueLength,
					focus: valueLength,
					start: valueLength,
					end: valueLength,
					valueLength,
				}))
			: undefined;
	return Object.freeze({
		kind,
		text,
		...(buttonText === undefined ? {} : { buttonText }),
		fontSize,
		width,
		height,
		placeholder,
		disabled,
		focused,
		...(selection === undefined ? {} : { selection }),
		checked:
			kind === "checkbox" || kind === "radio"
				? controlChecked(tree, id)
				: false,
		indeterminate: kind === "checkbox" && node.control.indeterminate === true,
	});
}

function controlAccent(
	paint: PaintStyle,
): { readonly fill: Rgba; readonly mark: Rgba } | undefined {
	const specified = paint["accent-color"];
	if (specified === undefined || specified === "auto") return undefined;
	const color = specified === "currentcolor" ? paint.color : specified;
	const alpha = color[3] / 255;
	const fill: Rgba = [
		Math.round(color[0] * alpha + 255 * (1 - alpha)),
		Math.round(color[1] * alpha + 255 * (1 - alpha)),
		Math.round(color[2] * alpha + 255 * (1 - alpha)),
		255,
	];
	const linear = (channel: number) => {
		const normalized = channel / 255;
		return normalized <= 0.04045
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	};
	const luminance =
		0.2126 * linear(fill[0]) +
		0.7152 * linear(fill[1]) +
		0.0722 * linear(fill[2]);
	return {
		fill,
		mark:
			(luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
				? [0, 0, 0, 255]
				: [255, 255, 255, 255],
	};
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
	charge(
		columns * rows * 8 +
			(control.text.length + (control.buttonText?.length ?? 0)) * 64,
	);
	const textLayout =
		control.kind === "text" || control.kind === "textarea"
			? layoutControlText({
					kind: control.kind,
					text: control.text,
					fontSize: control.fontSize,
					columns,
					rows,
					placeholder: control.placeholder,
					selection:
						control.focused && !control.disabled
							? control.selection
							: undefined,
				})
			: undefined;
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
	if (textLayout) {
		for (const rectangle of textLayout.selectionRectangles)
			paintRasterRect(
				image,
				rectangle.x,
				rectangle.y,
				rectangle.width,
				rectangle.height,
				controlSelectionBackground,
			);
		for (const glyph of textLayout.glyphs) {
			if (!bitmapGlyph(glyph.character).supported)
				throw new AgentBrowserError(
					"unsupported",
					"Control caption glyph is not supported",
				);
			paintBitmapGlyph(
				image,
				glyph.character,
				glyph.x,
				glyph.y,
				control.fontSize,
				foreground,
			);
		}
		if (textLayout.caret)
			paintRasterRect(
				image,
				textLayout.caret.x,
				textLayout.caret.y,
				textLayout.caret.width,
				textLayout.caret.height,
				paintCaret(paint),
			);
		const clip = textLayout.clip;
		for (let row = 0; row < rows; row++)
			for (let column = 0; column < columns; column++)
				if (
					column < clip.x ||
					column >= clip.x + clip.width ||
					row < clip.y ||
					row >= clip.y + clip.height
				)
					image.pixels.set(fill, (row * columns + column) * 4);
		paintRasterRect(image, 0, 0, columns, 1, edge);
		paintRasterRect(image, 0, rows - 1, columns, 1, edge);
		paintRasterRect(image, 0, 0, 1, rows, edge);
		paintRasterRect(image, columns - 1, 0, 1, rows, edge);
		return image;
	}
	if (control.kind === "checkbox" || control.kind === "radio") {
		const accent =
			!control.disabled &&
			(control.checked ||
				(control.kind === "checkbox" && control.indeterminate))
				? controlAccent(paint)
				: undefined;
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
									? (accent?.mark ?? foreground)
									: (accent?.fill ?? fill);
					image.pixels.set(color, (row * columns + column) * 4);
				}
			return image;
		}
		if (accent)
			paintRasterRect(
				image,
				1,
				1,
				Math.max(0, columns - 2),
				Math.max(0, rows - 2),
				accent.fill,
			);
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
				accent?.mark ?? foreground,
			);
		}
		return image;
	}
	const advance =
		(bitmapFont.advance * control.fontSize) / bitmapFont.unitsPerEm;
	if (control.kind === "file") {
		const buttonText = control.buttonText ?? "Choose File";
		const buttonWidth = Math.min(
			columns - 1,
			Math.ceil(buttonText.length * advance + 12),
		);
		paintRasterRect(
			image,
			1,
			1,
			Math.max(0, buttonWidth - 1),
			Math.max(0, rows - 2),
			control.disabled ? [224, 224, 224, 255] : [240, 240, 240, 255],
		);
		if (buttonWidth > 0 && buttonWidth < columns - 1)
			paintRasterRect(image, buttonWidth, 1, 1, Math.max(0, rows - 2), edge);
		const vertical = Math.max(4, (rows - control.fontSize) / 2);
		if (control.fontSize > 0 && vertical + control.fontSize <= rows - 4)
			for (const [caption, start, end] of [
				[buttonText, 6, buttonWidth - 6],
				[control.text, buttonWidth + 6, columns - 6],
			] as const) {
				let horizontal = start;
				for (const character of caption) {
					if (horizontal + advance > end) break;
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
			}
		return image;
	}
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
	const vertical = Math.max(4, (rows - control.fontSize) / 2);
	if (control.fontSize > 0)
		for (const character of control.text) {
			if (horizontal + advance > columns - (control.kind === "select" ? 18 : 6))
				break;
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
