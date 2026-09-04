import { bitmapFont } from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";

export interface NativeControlSelection {
	readonly anchor: number;
	readonly focus: number;
	readonly start: number;
	readonly end: number;
	readonly valueLength: number;
}

export interface ControlTextLayoutInput {
	readonly kind: "text" | "textarea";
	readonly text: string;
	readonly fontSize: number;
	readonly columns: number;
	readonly rows: number;
	readonly placeholder: boolean;
	readonly selection?: NativeControlSelection;
}

export interface ControlTextRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface ControlTextGlyph extends ControlTextRectangle {
	readonly character: string;
	readonly offset: number;
	readonly codeUnits: number;
}

export interface ControlTextLayout {
	readonly clip: ControlTextRectangle;
	readonly glyphs: readonly ControlTextGlyph[];
	readonly selectionRectangles: readonly ControlTextRectangle[];
	readonly caret?: ControlTextRectangle;
	readonly scroll: Readonly<{ x: number; y: number }>;
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function boundary(text: string, offset: number) {
	const before = text.charCodeAt(offset - 1);
	const after = text.charCodeAt(offset);
	return !(
		before >= 0xd800 &&
		before <= 0xdbff &&
		after >= 0xdc00 &&
		after <= 0xdfff
	);
}

function checkedSelection(
	selection: NativeControlSelection | undefined,
	text: string,
	placeholder: boolean,
): NativeControlSelection | undefined {
	if (selection === undefined) return;
	if (!selection || typeof selection !== "object" || Array.isArray(selection))
		invalid("Invalid control text selection");
	const { anchor, focus, start, end, valueLength } = selection;
	const length = placeholder ? 0 : text.length;
	if (
		!Number.isSafeInteger(anchor) ||
		!Number.isSafeInteger(focus) ||
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		!Number.isSafeInteger(valueLength) ||
		valueLength !== length ||
		anchor < 0 ||
		anchor > length ||
		focus < 0 ||
		focus > length ||
		start !== Math.min(anchor, focus) ||
		end !== Math.max(anchor, focus) ||
		(!placeholder && (!boundary(text, anchor) || !boundary(text, focus)))
	)
		invalid("Invalid control text selection offsets");
	return { anchor, focus, start, end, valueLength };
}

function intersects(
	rectangle: ControlTextRectangle,
	clip: ControlTextRectangle,
) {
	const horizontal = rectangle.x - clip.x;
	const vertical = rectangle.y - clip.y;
	return (
		horizontal < clip.width &&
		horizontal > -rectangle.width &&
		vertical < clip.height &&
		vertical > -rectangle.height
	);
}

function finish(
	clip: ControlTextRectangle,
	glyphs: ControlTextGlyph[],
	selectionRectangles: ControlTextRectangle[],
	scroll: { x: number; y: number },
	caret?: ControlTextRectangle,
): ControlTextLayout {
	return Object.freeze({
		clip: Object.freeze(clip),
		glyphs: Object.freeze(glyphs),
		selectionRectangles: Object.freeze(selectionRectangles),
		...(caret === undefined ? {} : { caret: Object.freeze(caret) }),
		scroll: Object.freeze(scroll),
	});
}

export function layoutControlText(
	input: ControlTextLayoutInput,
): ControlTextLayout {
	if (!input || typeof input !== "object" || Array.isArray(input))
		invalid("Invalid control text layout input");
	const { kind, text, fontSize, columns, rows, placeholder } = input;
	if (kind !== "text" && kind !== "textarea")
		throw new AgentBrowserError("unsupported", "Unsupported control text kind");
	if (typeof text !== "string" || typeof placeholder !== "boolean")
		invalid("Invalid control text value");
	if (!Number.isFinite(fontSize) || fontSize < 0)
		invalid("Invalid control text font size");
	if (
		!Number.isSafeInteger(columns) ||
		!Number.isSafeInteger(rows) ||
		columns < 1 ||
		rows < 1
	)
		invalid("Invalid control text dimensions");
	if (
		text.length > 4096 ||
		fontSize > 512 ||
		columns > 4096 ||
		rows > 4096 ||
		columns * rows > 1_048_576
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Control text layout limit exceeded",
		);
	if (text.includes("\r") || (kind === "text" && text.includes("\n")))
		throw new AgentBrowserError(
			"unsupported",
			"Control text must use normalized line endings",
		);
	const selection = checkedSelection(input.selection, text, placeholder);
	const clip = {
		x: 6,
		y: 4,
		width: Math.max(0, columns - 12),
		height: Math.max(0, rows - 8),
	};
	const glyphs: ControlTextGlyph[] = [];
	const selectionRectangles: ControlTextRectangle[] = [];
	const scroll = { x: 0, y: 0 };
	const advance = (bitmapFont.advance * fontSize) / bitmapFont.unitsPerEm;
	if (fontSize === 0 || clip.width < advance || clip.height < fontSize)
		return finish(clip, glyphs, selectionRectangles, scroll);
	const top = kind === "textarea" ? 4 : Math.max(4, (rows - fontSize) / 2);
	const cells: ControlTextGlyph[] = [];
	let horizontal = 0;
	let row = 0;
	let offset = 0;
	let focusHorizontal = 0;
	let focusRow = 0;
	for (const character of text) {
		if (
			kind === "textarea" &&
			character !== "\n" &&
			horizontal + advance > clip.width
		) {
			horizontal = 0;
			row++;
		}
		if (!placeholder && selection?.focus === offset) {
			focusHorizontal = horizontal;
			focusRow = row;
		}
		cells.push({
			character,
			offset,
			codeUnits: character.length,
			x: clip.x + horizontal,
			y: top + row * fontSize,
			width: advance,
			height: fontSize,
		});
		offset += character.length;
		if (kind === "textarea" && character === "\n") {
			horizontal = 0;
			row++;
		} else horizontal += advance;
	}
	if (!placeholder && selection?.focus === text.length) {
		if (kind === "textarea" && horizontal + 1 > clip.width) {
			horizontal = 0;
			row++;
		}
		focusHorizontal = horizontal;
		focusRow = row;
	}
	if (selection) {
		if (kind === "text")
			scroll.x = Math.max(0, focusHorizontal + 1 - clip.width);
		else
			scroll.y =
				Math.max(0, focusRow - Math.floor(clip.height / fontSize) + 1) *
				fontSize;
	}
	for (const cell of cells) {
		const rectangle = {
			x: cell.x - scroll.x,
			y: cell.y - scroll.y,
			width: cell.width,
			height: cell.height,
		};
		if (!intersects(rectangle, clip)) continue;
		if (cell.character !== "\n")
			glyphs.push(
				Object.freeze({
					...rectangle,
					character: cell.character,
					offset: cell.offset,
					codeUnits: cell.codeUnits,
				}),
			);
		if (
			!placeholder &&
			selection &&
			cell.offset >= selection.start &&
			cell.offset < selection.end
		)
			selectionRectangles.push(Object.freeze(rectangle));
	}
	let caret: ControlTextRectangle | undefined;
	if (selection && selection.start === selection.end) {
		const rectangle = {
			x:
				clip.x +
				(kind === "textarea"
					? Math.min(focusHorizontal, clip.width - 1)
					: focusHorizontal) -
				scroll.x,
			y: top + focusRow * fontSize - scroll.y,
			width: 1,
			height: fontSize,
		};
		if (intersects(rectangle, clip)) caret = rectangle;
	}
	return finish(clip, glyphs, selectionRectangles, scroll, caret);
}
