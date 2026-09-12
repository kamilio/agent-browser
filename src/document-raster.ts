import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { paintSolidBorders } from "./border-raster.js";
import { rasterizeControl } from "./control-rendering.js";
import { transparentColor } from "./css-color.js";
import { initialPaintStyle, paintBackground } from "./css-paint.js";
import { rasterizeDisclosureMarker } from "./disclosure-marker.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { LayoutGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { paintImageAlternative } from "./image-alternative.js";
import {
	type DocumentBox,
	type DocumentLayout,
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import {
	type EditableCaretStatus,
	editableCaretLimits,
	paintEditableCaret,
	paintEmptyEditableCaret,
	prepareEditableCaret,
} from "./editable-caret.js";
import {
	type EditableSelectionStatus,
	editableSelectionLimits,
	paintEditableSelection,
	prepareEditableSelection,
} from "./editable-selection.js";
import { AgentBrowserError } from "./errors.js";
import { activeFocus } from "./focus.js";
import { matchFontWeight } from "./font-weight.js";
import { resolveVisualTarget } from "./generated-controls.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { layoutNumber } from "./layout-values.js";
import { projectFixedLayout } from "./out-of-flow-positioning.js";
import { paintOutline } from "./outline-raster.js";
import {
	type RasterImage,
	type Rgba,
	createRaster,
	paintBitmapGlyph,
	paintRasterImage,
	paintRasterRect,
} from "./raster.js";
import { documentStyles } from "./styles.js";
import { paintCollapsedTableBorders } from "./table-collapsed-raster.js";
import type { TextGlyph } from "./text-layout.js";

export interface DocumentClip {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface DocumentRasterOptions {
	layout?: DocumentLayoutOptions;
	clip?: DocumentClip;
	element?: string;
	maxWork?: number;
}
export interface DocumentRaster {
	stage: "normal-flow-text-raster";
	partial: true;
	layout: DocumentLayout;
	clip: Readonly<DocumentClip>;
	image: Readonly<RasterImage>;
	canvasBackground: Readonly<{ sourceRef: string | null; color: Rgba }>;
	metrics: Readonly<{
		work: number;
		paintedGlyphs: number;
		clippedGlyphs: number;
		hiddenGlyphs: number;
		blankGlyphs: number;
		transparentGlyphs: number;
		paintedBackgrounds: number;
		inlineFragments: number;
		paintedImages: number;
		paintedControls: number;
		paintedMarkers: number;
		borderPixels: number;
		outlinePixels: number;
		clippedControls: number;
		clippedMarkers: number;
		clippedImages: number;
		paintedCarets: number;
		clippedCarets: number;
		skippedCarets: number;
		caretStatus: EditableCaretStatus;
		caretWork: number;
		paintedSelectionGlyphs: number;
		clippedSelectionGlyphs: number;
		selectionPixels: number;
		selectionStatus: EditableSelectionStatus;
		selectionWork: number;
		selectionGeometryWork: number;
	}>;
}
export const documentRasterLimits = Object.freeze({ maxWork: 32_000_000 });

export function rasterizeDocument(
	tree: DocumentTree,
	options: DocumentRasterOptions = {},
): Readonly<DocumentRaster> {
	const maxWork = validateRasterOptions(options);
	documentScrollPosition(tree);
	return paintDocumentLayout(
		tree,
		layoutDocument(tree, options.layout),
		options,
		maxWork,
	);
}

export function prepareDocumentRaster(
	tree: DocumentTree,
	options: DocumentLayoutOptions = {},
) {
	documentScrollPosition(tree);
	const layout = layoutDocument(tree, options);
	const revision = tree.revision;
	return Object.freeze({
		layout,
		rasterize(options: Omit<DocumentRasterOptions, "layout"> = {}) {
			const maxWork = validateRasterOptions(options);
			tree.get(tree.root);
			if (Object.hasOwn(options, "layout") || tree.revision !== revision)
				throw new AgentBrowserError(
					"invalid-input",
					"Prepared raster layout is stale or cannot be replaced",
				);
			return paintDocumentLayout(tree, layout, options, maxWork);
		},
	});
}

function validateRasterOptions(options: DocumentRasterOptions) {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["layout", "clip", "element", "maxWork"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document raster options",
		);
	const maxWork =
		options.maxWork === undefined
			? documentRasterLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > documentRasterLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document raster work limit",
		);
	return maxWork;
}

function paintDocumentLayout(
	tree: DocumentTree,
	layout: DocumentLayout,
	options: DocumentRasterOptions,
	maxWork: number,
): Readonly<DocumentRaster> {
	const viewport = layout.text.horizontal.formatting.viewport;
	const scroll = documentScrollPosition(tree);
	layout = projectFixedLayout(layout, scroll, maxWork);
	let clip =
		options.clip === undefined
			? {
					x: scroll.x,
					y: scroll.y,
					width: viewport.width,
					height: viewport.height,
				}
			: options.clip;
	if (options.element !== undefined) {
		if (typeof options.element !== "string" || options.clip !== undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Choose an element reference or an explicit clip",
			);
		const element = resolveVisualTarget(tree, options.element).node;
		if (element.kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Capture target must be an element",
			);
		if (!documentStyles(tree).get(element.id).visible)
			throw new AgentBrowserError(
				"not-actionable",
				"Capture target is not visible",
			);
		const box = new LayoutGeometry(layout).getBoundingClientRect(
			options.element,
		);
		if (box.width <= 0 || box.height <= 0)
			throw new AgentBrowserError(
				"not-actionable",
				"Capture target has no painted area",
			);
		const left = Math.floor(box.left);
		const top = Math.floor(box.top);
		clip = {
			x: left,
			y: top,
			width: Math.ceil(box.right) - left,
			height: Math.ceil(box.bottom) - top,
		};
	}
	if (
		!clip ||
		typeof clip !== "object" ||
		Array.isArray(clip) ||
		Object.keys(clip).some(
			(key) => !["x", "y", "width", "height"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document raster clip",
		);
	layoutNumber(clip.x, true);
	layoutNumber(clip.y, true);
	layoutNumber(clip.width);
	layoutNumber(clip.height);
	layoutNumber(clip.x + clip.width, true);
	layoutNumber(clip.y + clip.height, true);
	const metrics = {
		work: 0,
		paintedGlyphs: 0,
		clippedGlyphs: 0,
		hiddenGlyphs: 0,
		blankGlyphs: 0,
		transparentGlyphs: 0,
		paintedBackgrounds: 0,
		inlineFragments: 0,
		paintedImages: 0,
		paintedControls: 0,
		paintedMarkers: 0,
		borderPixels: 0,
		outlinePixels: 0,
		clippedControls: 0,
		clippedMarkers: 0,
		clippedImages: 0,
		paintedCarets: 0,
		clippedCarets: 0,
		skippedCarets: 0,
		caretStatus: "absent" as EditableCaretStatus,
		caretWork: 0,
		paintedSelectionGlyphs: 0,
		clippedSelectionGlyphs: 0,
		selectionPixels: 0,
		selectionStatus: "absent" as EditableSelectionStatus,
		selectionWork: 0,
		selectionGeometryWork: 0,
	};
	const charge = (units = 1) => {
		metrics.work += units;
		if (metrics.work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Document raster work limit exceeded",
			);
	};
	charge(clip.width * clip.height);
	const image = createRaster(clip.width, clip.height, [255, 255, 255, 255]);
	const nodes = layout.text.horizontal.formatting.nodes;
	const caret = prepareEditableCaret(
		tree,
		layout,
		Math.min(maxWork, editableCaretLimits.maxWork),
	);
	const images = new Map(
		layout.text.horizontal.images.map((entry) => [entry.id, entry]),
	);
	const selection = prepareEditableSelection(
		tree,
		layout,
		Math.min(maxWork, editableSelectionLimits.maxWork),
	);
	const drawBackground = (
		originX: number,
		originY: number,
		width: number,
		height: number,
		color: Rgba,
	) => {
		if (!color[3] || width === 0 || height === 0) return;
		layoutNumber(originX, true);
		layoutNumber(originY, true);
		layoutNumber(width);
		layoutNumber(height);
		layoutNumber(originX + width, true);
		layoutNumber(originY + height, true);
		const left = Math.max(0, originX - clip.x);
		const top = Math.max(0, originY - clip.y);
		const right = Math.min(image.width, originX + width - clip.x);
		const bottom = Math.min(image.height, originY + height - clip.y);
		if (right <= left || bottom <= top) return;
		charge(
			Math.ceil(right - left + 1) * Math.ceil(bottom - top + 1) +
				Math.ceil(bottom - top + 1),
		);
		paintRasterRect(
			image,
			originX - clip.x,
			originY - clip.y,
			width,
			height,
			color,
		);
		metrics.paintedBackgrounds++;
	};
	const styles = documentStyles(tree);
	const drawOutline = (
		reference: string | undefined,
		horizontal: number,
		vertical: number,
		width: number,
		height: number,
	) => {
		if (!reference) return;
		metrics.outlinePixels += paintOutline(
			image,
			horizontal - clip.x,
			vertical - clip.y,
			width,
			height,
			styles.outline(tree.resolve(reference).id),
			charge,
		);
	};
	const focused = activeFocus(tree);
	const generatedFocus = tree.generatedFocusReference;
	const root = tree.get(tree.root).children.find((id) => {
		charge();
		return tree.get(id).kind === "element";
	});
	let canvasSource = root;
	let canvasColor = transparentColor;
	const suppressed = new Set<string>();
	if (root !== undefined) {
		suppressed.add(tree.reference(root));
		const rootPaint = styles.paint(root);
		if (styles.get(root).displayed) {
			let sourcePaint = rootPaint;
			if (
				tree.get(root).tagName === "html" &&
				paintBackground(rootPaint)[3] === 0
			) {
				const body = tree.get(root).children.find((id) => {
					charge();
					const node = tree.get(id);
					return node.kind === "element" && node.tagName === "body";
				});
				if (body !== undefined) {
					canvasSource = body;
					sourcePaint = styles.paint(body);
					suppressed.add(tree.reference(body));
				}
			}
			if (
				canvasSource !== undefined &&
				styles.get(canvasSource).displayed &&
				styles.get(canvasSource).display !== "contents"
			)
				canvasColor =
					sourcePaint["background-color"] === "currentcolor"
						? rootPaint.color
						: sourcePaint["background-color"];
		}
	}
	const canvasBackground = Object.freeze({
		sourceRef: canvasSource === undefined ? null : tree.reference(canvasSource),
		color: canvasColor,
	});
	drawBackground(clip.x, clip.y, image.width, image.height, canvasColor);
	const paintBox = (box: Readonly<DocumentBox>) => {
		charge();
		const node = nodes[box.id];
		if (!node.visible || !node.paint || node.kind === "replaced") return;
		if (!box.ref || !suppressed.has(box.ref))
			drawBackground(
				box.borderX,
				box.borderY,
				box.borderBoxWidth,
				box.borderBoxHeight,
				paintBackground(node.paint),
			);
		if (node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintSolidBorders(
				image,
				box.borderX - clip.x,
				box.borderY - clip.y,
				box.borderBoxWidth,
				box.borderBoxHeight,
				box,
				node.paint,
				charge,
			);
		drawOutline(
			box.ref,
			box.borderX,
			box.borderY,
			box.borderBoxWidth,
			box.borderBoxHeight,
		);
		if (
			node.generated?.ref === generatedFocus &&
			node.generated?.owner === focused &&
			tree.focusIndicated
		) {
			for (const [inset, color] of [
				[0, [0, 0, 0, 255]],
				[1, [255, 255, 255, 255]],
			] as const) {
				const width = box.borderBoxWidth - inset * 2;
				const height = box.borderBoxHeight - inset * 2;
				if (width <= 0 || height <= 0) continue;
				const horizontal = box.borderX + inset;
				const vertical = box.borderY + inset;
				const thickness = Math.min(1, width, height);
				drawBackground(horizontal, vertical, width, thickness, color);
				drawBackground(
					horizontal,
					vertical + height - thickness,
					width,
					thickness,
					color,
				);
				drawBackground(horizontal, vertical, thickness, height, color);
				drawBackground(
					horizontal + width - thickness,
					vertical,
					thickness,
					height,
					color,
				);
			}
		}
	};
	const paintGlyph = (glyph: Readonly<TextGlyph>, contentY: number) => {
		charge();
		if (!glyph.visible) {
			metrics.hiddenGlyphs++;
			return;
		}
		if (
			glyph.kind === "tab" ||
			glyph.fontSize === 0 ||
			(glyph.transformed === true &&
				glyph.character === "" &&
				glyph.advance === 0)
		) {
			metrics.blankGlyphs++;
			return;
		}
		const color = (nodes[glyph.formattingId].paint ?? initialPaintStyle).color;
		if (color[3] === 0) {
			metrics.transparentGlyphs++;
			return;
		}
		const weight = matchFontWeight(
			Number(nodes[glyph.formattingId].typography?.["font-weight"] ?? "400"),
		);
		const ink = bitmapGlyph(glyph.character, weight).ink;
		if (ink.width === 0 || ink.height === 0) {
			metrics.blankGlyphs++;
			return;
		}
		const scale = glyph.fontSize / bitmapFont.unitsPerEm;
		const originX = glyph.x - clip.x;
		const originY = contentY + glyph.y - clip.y;
		const left = Math.max(0, originX + ink.x * scale);
		const right = Math.min(image.width, originX + (ink.x + ink.width) * scale);
		const top = Math.max(0, originY + ink.y * scale);
		const bottom = Math.min(
			image.height,
			originY + (ink.y + ink.height) * scale,
		);
		if (right <= left || bottom <= top) {
			metrics.clippedGlyphs++;
			return;
		}
		charge(
			40 * (1 + Math.ceil(scale)) +
				Math.ceil(right - left + 1) * Math.ceil(bottom - top + 1),
		);
		paintBitmapGlyph(
			image,
			glyph.character,
			originX,
			originY,
			glyph.fontSize,
			color,
			weight,
		);
		metrics.paintedGlyphs++;
	};
	const paintImage = (id: number, borderX: number, borderY: number) => {
		charge();
		const used = images.get(id);
		const node = nodes[id];
		if (
			!used ||
			(!node.visible && !node.svg?.shapes.some((shape) => shape.visible))
		)
			return;
		const source =
			node.control || node.marker || node.svg || node.imageAlternative
				? undefined
				: documentImages(tree).decoded(tree.resolve(used.ref).id);
		if (
			!source &&
			!node.control &&
			!node.marker &&
			!node.svg &&
			!node.imageAlternative
		)
			throw new AgentBrowserError(
				"unsupported",
				"Image resource is no longer available for painting",
			);
		if (node.visible)
			drawBackground(
				borderX,
				borderY,
				used.borderBoxWidth,
				used.borderBoxHeight,
				paintBackground(node.paint ?? initialPaintStyle),
			);
		if (node.visible && node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintSolidBorders(
				image,
				borderX - clip.x,
				borderY - clip.y,
				used.borderBoxWidth,
				used.borderBoxHeight,
				used,
				node.paint ?? initialPaintStyle,
				charge,
			);
		const originX = borderX + used.borderLeft + used.paddingLeft - clip.x;
		const originY = borderY + used.borderTop + used.paddingTop - clip.y;
		const left = Math.max(0, originX);
		const top = Math.max(0, originY);
		const right = Math.min(image.width, originX + used.contentWidth);
		const bottom = Math.min(image.height, originY + used.contentHeight);
		if (
			right <= left ||
			bottom <= top ||
			used.contentWidth === 0 ||
			used.contentHeight === 0
		) {
			if (node.marker) metrics.clippedMarkers++;
			else if (node.control) metrics.clippedControls++;
			else metrics.clippedImages++;
			if (node.visible)
				drawOutline(
					node.ref,
					borderX,
					borderY,
					used.borderBoxWidth,
					used.borderBoxHeight,
				);
			return;
		}
		if (node.imageAlternative)
			paintImageAlternative(
				image,
				node.imageAlternative,
				originX,
				originY,
				used.contentWidth,
				used.contentHeight,
				(node.paint ?? initialPaintStyle).color,
				charge,
				matchFontWeight(Number(node.typography?.["font-weight"] ?? "400")),
			);
		else {
			charge(Math.ceil(right - left + 1) * Math.ceil(bottom - top + 1) * 4);
			paintRasterImage(
				image,
				node.marker
					? rasterizeDisclosureMarker(
							node.marker,
							used.contentWidth,
							used.contentHeight,
							(node.paint ?? initialPaintStyle).color,
							charge,
							matchFontWeight(
								Number(node.typography?.["font-weight"] ?? "400"),
							),
						)
					: node.control
						? rasterizeControl(
								node.control,
								used.contentWidth,
								used.contentHeight,
								node.paint ?? initialPaintStyle,
								charge,
								matchFontWeight(
									Number(node.typography?.["font-weight"] ?? "400"),
								),
							)
						: node.svg
							? rasterizeSvgScene(
									node.svg,
									used.contentWidth,
									used.contentHeight,
									charge,
								)
							: (source as NonNullable<typeof source>).image,
				originX,
				originY,
				used.contentWidth,
				used.contentHeight,
			);
		}
		if (node.visible)
			drawOutline(
				node.ref,
				borderX,
				borderY,
				used.borderBoxWidth,
				used.borderBoxHeight,
			);
		if (node.marker) metrics.paintedMarkers++;
		else if (node.control) metrics.paintedControls++;
		else metrics.paintedImages++;
	};
	for (const item of layoutContentItems(layout, charge)) {
		if (item.kind === "table-borders") {
			const segments = item.box.collapsedTableBorders ?? [];
			charge(segments.length);
			const visibleSegments = segments.map((segment) => {
				charge();
				return nodes[segment.ownerId]?.visible
					? segment
					: { ...segment, color: transparentColor };
			});
			metrics.borderPixels += paintCollapsedTableBorders(
				image,
				item.box.contentX - clip.x,
				item.box.contentY - clip.y,
				visibleSegments,
				charge,
			);
			continue;
		}
		if (item.kind === "marker") {
			const marker = item.marker;
			const node = nodes[marker.id];
			if (!node.visible || !node.outsideMarker) continue;
			const originX = marker.x - clip.x;
			const originY = marker.y - clip.y;
			if (
				originX + marker.width <= 0 ||
				originY + marker.height <= 0 ||
				originX >= image.width ||
				originY >= image.height
			) {
				metrics.clippedMarkers++;
				continue;
			}
			charge(Math.ceil(marker.width + 1) * Math.ceil(marker.height + 1) * 4);
			paintRasterImage(
				image,
				rasterizeDisclosureMarker(
					node.outsideMarker,
					marker.width,
					marker.height,
					(node.paint ?? initialPaintStyle).color,
					charge,
					matchFontWeight(Number(node.typography?.["font-weight"] ?? "400")),
				),
				originX,
				originY,
				marker.width,
				marker.height,
			);
			metrics.paintedMarkers++;
			continue;
		}
		if (item.kind === "box") {
			paintBox(item.box);
			paintEmptyEditableCaret(caret, item.box, image, clip, charge);
			continue;
		}
		if (item.kind === "image") {
			paintImage(item.box.id, item.box.borderX, item.box.borderY);
			continue;
		}
		if (item.kind === "glyph") {
			paintEditableSelection(selection, item.glyph, image, clip, charge);
			paintGlyph(item.glyph, item.contentY);
			paintEditableCaret(caret, item.glyph, image, clip, charge);
			continue;
		}
		const fragment = item.fragment;
		const node = nodes[fragment.formattingId];
		if (node.kind === "replaced") {
			paintImage(node.id, fragment.x, fragment.y);
			continue;
		}
		if (node.kind !== "inline" || !node.visible || !node.paint) continue;
		if (!paintBackground(node.paint)[3] && !fragment.borders) {
			drawOutline(
				node.ref,
				fragment.x,
				fragment.y,
				fragment.width,
				fragment.height,
			);
			continue;
		}
		metrics.inlineFragments++;
		drawBackground(
			fragment.x,
			fragment.y,
			fragment.width,
			fragment.height,
			paintBackground(node.paint),
		);
		if (fragment.borders && node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintSolidBorders(
				image,
				fragment.x - clip.x,
				fragment.y - clip.y,
				fragment.width,
				fragment.height,
				fragment.borders,
				node.paint,
				charge,
			);
		drawOutline(
			node.ref,
			fragment.x,
			fragment.y,
			fragment.width,
			fragment.height,
		);
	}
	if (caret.status === "ready") caret.status = "unsupported";
	metrics.caretStatus = caret.status;
	metrics.selectionStatus =
		selection.status === "ready" ? "unsupported" : selection.status;
	metrics.selectionWork = selection.work;
	metrics.selectionGeometryWork = selection.geometryWork;
	metrics.paintedSelectionGlyphs = selection.paintedGlyphs;
	metrics.clippedSelectionGlyphs = selection.clippedGlyphs;
	metrics.selectionPixels = selection.pixels;
	metrics.caretWork = caret.work;
	metrics.paintedCarets = Number(caret.status === "painted");
	metrics.clippedCarets = Number(caret.status === "clipped");
	metrics.skippedCarets = Number(
		!["painted", "clipped", "absent", "unfocused"].includes(caret.status),
	);
	return Object.freeze({
		stage: "normal-flow-text-raster" as const,
		partial: true as const,
		layout,
		clip: Object.freeze({ ...clip }),
		image,
		canvasBackground,
		metrics: Object.freeze(metrics),
	});
}
