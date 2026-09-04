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

function checkedInput(input: ControlTextLayoutInput): ControlTextLayoutInput {
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
	return { kind, text, fontSize, columns, rows, placeholder, selection };
}

interface HitStop {
	offset: number;
	horizontal: number;
	row: number;
}

function controlTextGeometry(
	input: ControlTextLayoutInput,
	collectStops: boolean,
) {
	const { kind, text, fontSize, columns, rows, placeholder, selection } = input;
	const clip = {
		x: 6,
		y: 4,
		width: Math.max(0, columns - 12),
		height: Math.max(0, rows - 8),
	};
	const scroll = { x: 0, y: 0 };
	const advance = (bitmapFont.advance * fontSize) / bitmapFont.unitsPerEm;
	const top = kind === "textarea" ? 4 : Math.max(4, (rows - fontSize) / 2);
	const cells: ControlTextGlyph[] = [];
	const stops: HitStop[] = [];
	const eligible =
		fontSize > 0 && clip.width >= advance && clip.height >= fontSize;
	const geometry = {
		clip,
		scroll,
		top,
		cells,
		stops,
		eligible,
		focusHorizontal: 0,
		focusRow: 0,
	};
	if (!eligible) return geometry;
	let horizontal = 0;
	let row = 0;
	let offset = 0;
	let focusHorizontal = 0;
	let focusRow = 0;
	const stop = () => {
		if (!collectStops || (placeholder && offset !== 0)) return;
		const previous = stops[stops.length - 1];
		if (
			previous?.offset === offset &&
			previous.horizontal === horizontal &&
			previous.row === row
		)
			return;
		stops.push({ offset, horizontal, row });
	};
	stop();
	for (const character of text) {
		if (
			kind === "textarea" &&
			character !== "\n" &&
			horizontal + advance > clip.width
		) {
			horizontal = 0;
			row++;
		}
		stop();
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
		stop();
	}
	if (kind === "textarea" && horizontal + 1 > clip.width) {
		horizontal = 0;
		row++;
		stop();
	}
	if (!placeholder && selection?.focus === text.length) {
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
	geometry.focusHorizontal = focusHorizontal;
	geometry.focusRow = focusRow;
	return geometry;
}

export function layoutControlText(
	input: ControlTextLayoutInput,
): ControlTextLayout {
	const checked = checkedInput(input);
	const { kind, fontSize, placeholder, selection } = checked;
	const { clip, scroll, top, cells, focusHorizontal, focusRow, eligible } =
		controlTextGeometry(checked, false);
	const glyphs: ControlTextGlyph[] = [];
	const selectionRectangles: ControlTextRectangle[] = [];
	if (!eligible) return finish(clip, glyphs, selectionRectangles, scroll);
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

function checkedOffsets(
	allowedOffsets: readonly number[] | undefined,
	input: ControlTextLayoutInput,
): ReadonlySet<number> | undefined {
	if (allowedOffsets === undefined) return;
	if (!Array.isArray(allowedOffsets))
		invalid("Invalid control text hit offsets");
	const count = allowedOffsets.length;
	if (!Number.isSafeInteger(count) || count < 1)
		invalid("Invalid control text hit offsets");
	if (count > 4097)
		throw new AgentBrowserError(
			"resource-limit",
			"Control text hit offset limit exceeded",
		);
	const length = input.placeholder ? 0 : input.text.length;
	const allowed = new Set<number>();
	let previous = -1;
	for (let index = 0; index < count; index++) {
		const offset = allowedOffsets[index];
		if (
			!Number.isSafeInteger(offset) ||
			offset <= previous ||
			offset > length ||
			(index === 0 && offset !== 0) ||
			!boundary(input.text, offset)
		)
			invalid("Invalid control text hit offsets");
		allowed.add(offset);
		previous = offset;
	}
	if (previous !== length) invalid("Invalid control text hit offsets");
	return allowed;
}

export function hitControlText(
	input: ControlTextLayoutInput,
	point: Readonly<{ x: number; y: number }>,
	allowedOffsets?: readonly number[],
): number | undefined {
	const checked = checkedInput(input);
	const allowed = checkedOffsets(allowedOffsets, checked);
	if (!point || typeof point !== "object" || Array.isArray(point))
		invalid("Invalid control text hit point");
	const { x, y } = point;
	if (!Number.isFinite(x) || !Number.isFinite(y))
		invalid("Invalid control text hit point");
	if (x < 0 || x >= checked.columns || y < 0 || y >= checked.rows) return;
	const { clip, scroll, top, stops, eligible } = controlTextGeometry(
		checked,
		true,
	);
	if (!eligible) return;
	if (checked.placeholder) return 0;
	const horizontal =
		Math.max(clip.x, Math.min(x, clip.x + clip.width)) - clip.x + scroll.x;
	const vertical = Math.max(clip.y, Math.min(y, clip.y + clip.height));
	let bestRowDistance = Number.POSITIVE_INFINITY;
	let bestHorizontalDistance = Number.POSITIVE_INFINITY;
	let bestRow = -1;
	let bestOffset: number | undefined;
	for (const stop of stops) {
		if (allowed && !allowed.has(stop.offset)) continue;
		const rowTop = top + stop.row * checked.fontSize - scroll.y;
		const relativeTop = rowTop - clip.y;
		if (relativeTop >= clip.height || relativeTop <= -checked.fontSize)
			continue;
		const rowDistance = Math.abs(vertical - (rowTop + checked.fontSize / 2));
		if (
			rowDistance < bestRowDistance ||
			(rowDistance === bestRowDistance && stop.row > bestRow)
		) {
			bestRowDistance = rowDistance;
			bestRow = stop.row;
			bestHorizontalDistance = Number.POSITIVE_INFINITY;
			bestOffset = undefined;
		}
		if (stop.row !== bestRow) continue;
		const distance = Math.abs(horizontal - stop.horizontal);
		if (
			distance < bestHorizontalDistance ||
			(distance === bestHorizontalDistance && stop.offset > (bestOffset ?? -1))
		) {
			bestHorizontalDistance = distance;
			bestOffset = stop.offset;
		}
	}
	return bestOffset;
}

export function moveControlText(
	input: ControlTextLayoutInput,
	direction: "up" | "down",
	preferredHorizontal?: number,
): Readonly<{ offset: number; horizontal: number }> | undefined {
	const checked = checkedInput(input);
	if (direction !== "up" && direction !== "down")
		invalid("Invalid control text navigation direction");
	if (
		preferredHorizontal !== undefined &&
		(!Number.isFinite(preferredHorizontal) ||
			preferredHorizontal < 0 ||
			preferredHorizontal > 4096)
	)
		invalid("Invalid control text preferred horizontal");
	if (checked.kind !== "textarea" || !checked.selection) return;
	const { stops, eligible } = controlTextGeometry(checked, true);
	if (!eligible) return;
	if (checked.placeholder) return Object.freeze({ offset: 0, horizontal: 0 });
	const canonical = new Map<number, HitStop>();
	for (const stop of stops) canonical.set(stop.offset, stop);
	const source = canonical.get(checked.selection.focus);
	if (!source) return;
	const horizontal = preferredHorizontal ?? source.horizontal;
	const row = source.row + (direction === "up" ? -1 : 1);
	let offset = direction === "up" ? 0 : checked.text.length;
	let distance = Number.POSITIVE_INFINITY;
	for (const stop of canonical.values()) {
		if (stop.row !== row) continue;
		const nextDistance = Math.abs(horizontal - stop.horizontal);
		if (
			nextDistance < distance ||
			(nextDistance === distance && stop.offset > offset)
		) {
			offset = stop.offset;
			distance = nextDistance;
		}
	}
	return Object.freeze({ offset, horizontal });
}
