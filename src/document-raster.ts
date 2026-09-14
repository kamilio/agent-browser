import { bitmapFont } from "./bitmap-font.js";
import {
	backgroundAreas,
	paintBackgroundImage,
	type BackgroundGeometry,
} from "./background-raster.js";
import { backgroundImageUrl } from "./css-background.js";
import {
	prepareRoundedLayout,
	translateRoundedBox,
	type RoundedDecoration,
} from "./rounded-layout.js";
import { createRoundedBox, type RoundedBox } from "./rounded-box.js";
import { paintBorders } from "./border-raster.js";
import { rasterizeControl } from "./control-rendering.js";
import { initialBoxStyle } from "./css-box.js";
import { transparentColor } from "./css-color.js";
import { initialPaintStyle, paintBackground } from "./css-paint.js";
import { rasterizeDisclosureMarker } from "./disclosure-marker.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { LayoutGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { projectScrollLayout } from "./document-overflow.js";
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
import type { FormattingNode } from "./formatting-tree.js";
import { activeFocus } from "./focus.js";
import { bitmapGlyphInk, type NativeFontStyle } from "./font-style.js";
import { matchFontWeight } from "./font-weight.js";
import { resolveVisualTarget } from "./generated-controls.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { layoutNumber } from "./layout-values.js";
import { projectFixedLayout } from "./out-of-flow-positioning.js";
import { paintOutline } from "./outline-raster.js";
import {
	layoutOverflowClips,
	rasterOverflowClips,
	type OverflowClip,
} from "./overflow-clips.js";
import {
	type RasterImage,
	type Rgba,
	createRaster,
	paintBitmapGlyph,
	paintRasterImage,
	paintRasterRect,
	withRasterClips,
} from "./raster.js";
import { documentStyles } from "./styles.js";
import { paintCollapsedTableBorders } from "./table-collapsed-raster.js";
import type { TextGlyph } from "./text-layout.js";
import {
	paintInlineDecorationEdges,
	paintTextDecorations,
	prepareTextDecorations,
} from "./text-decoration-raster.js";

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
	layout = projectFixedLayout(
		projectScrollLayout(tree, layout, maxWork),
		scroll,
		maxWork,
	);
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
	const canvas = createRaster(clip.width, clip.height, [255, 255, 255, 255]);
	let image: Readonly<RasterImage> = canvas;
	const overflow = layoutOverflowClips(layout, charge);
	const clipViews = new Map<OverflowClip, Readonly<RasterImage>>();
	const destination = (chain: OverflowClip | undefined) => {
		if (!chain) return canvas;
		charge();
		let view = clipViews.get(chain);
		if (!view) {
			view = withRasterClips(
				canvas,
				rasterOverflowClips(chain, clip, charge),
				charge,
			);
			charge();
			clipViews.set(chain, view);
		}
		return view;
	};
	const nodes = layout.text.horizontal.formatting.nodes;
	const roundedItems = nodes.some((node) => node.radius)
		? [...layoutContentItems(layout, charge)]
		: undefined;
	const rounded = roundedItems
		? prepareRoundedLayout(layout, roundedItems, charge)
		: undefined;
	const localCurve = (box: RoundedBox | undefined) =>
		translateRoundedBox(box, -clip.x, -clip.y);
	let legendBoxes: Map<number, Readonly<DocumentBox>> | undefined;
	const legendBox = (id: number) => {
		if (!legendBoxes)
			legendBoxes = new Map(
				layout.boxes.map((box) => {
					charge();
					return [box.id, box] as const;
				}),
			);
		const box = legendBoxes.get(id);
		if (!box)
			throw new AgentBrowserError(
				"unsupported",
				"Missing rendered legend paint box",
			);
		return box;
	};
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
		curve?: RoundedBox,
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
		if (curve) charge(32 + Math.ceil(bottom - top + 1) * 2);
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
			localCurve(curve),
		);
		metrics.paintedBackgrounds++;
	};
	const styles = documentStyles(tree);
	const backgroundGeometry = (
		box: Readonly<{
			borderX: number;
			borderY: number;
			borderBoxWidth: number;
			borderBoxHeight: number;
			borderTop: number;
			borderRight: number;
			borderBottom: number;
			borderLeft: number;
			paddingTop: number;
			paddingRight: number;
			paddingBottom: number;
			paddingLeft: number;
		}>,
	): BackgroundGeometry => ({
		x: box.borderX - clip.x,
		y: box.borderY - clip.y,
		width: box.borderBoxWidth,
		height: box.borderBoxHeight,
		borderTop: box.borderTop,
		borderRight: box.borderRight,
		borderBottom: box.borderBottom,
		borderLeft: box.borderLeft,
		paddingTop: box.paddingTop,
		paddingRight: box.paddingRight,
		paddingBottom: box.paddingBottom,
		paddingLeft: box.paddingLeft,
	});
	const backgroundSource = (node: Readonly<FormattingNode>) => {
		const layer = node.paint?.background;
		if (!layer || backgroundImageUrl(layer["background-image"]) === undefined)
			return;
		const owner =
			node.generatedContent?.owner ??
			(node.ref ? tree.resolve(node.ref).id : undefined);
		if (owner === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Background image owner is unavailable",
			);
		const resources = documentImages(tree);
		const state = resources.background(owner, node.generatedContent?.name);
		if (state.state === "loading")
			throw new AgentBrowserError(
				"unsupported",
				"Background image is still loading",
			);
		return resources.decodedBackground(owner, node.generatedContent?.name);
	};
	const hasVisualBackgroundLayer = (node: Readonly<FormattingNode>) => {
		const paint = node.paint ?? initialPaintStyle;
		const layer = paint.background;
		return (
			layer !== undefined &&
			(backgroundImageUrl(layer["background-image"]) !== undefined ||
				(layer["background-clip"] !== "border-box" &&
					paintBackground(paint)[3] !== 0))
		);
	};
	const drawNodeBackground = (
		node: Readonly<FormattingNode>,
		geometry: BackgroundGeometry,
		decoration?: RoundedDecoration,
	) => {
		const paint = node.paint ?? initialPaintStyle;
		const layer = paint.background;
		if (!layer) {
			drawBackground(
				geometry.x + clip.x,
				geometry.y + clip.y,
				geometry.width,
				geometry.height,
				paintBackground(paint),
				decoration?.outer,
			);
			return;
		}
		if (
			hasVisualBackgroundLayer(node) &&
			(node.control ||
				node.buttonAppearance ||
				node.marker ||
				node.tableWrapper !== undefined ||
				node.tableGrid !== undefined ||
				node.collapsedBorderOwner !== undefined ||
				node.fieldsetLegend !== undefined)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Background layers on native controls or table wrappers are not supported",
			);
		charge(64);
		const outer = localCurve(decoration?.outer);
		const areas = backgroundAreas(geometry, layer, outer);
		const colorClip = {
			...areas.clip,
			x: areas.clip.x + clip.x,
			y: areas.clip.y + clip.y,
		};
		drawBackground(
			colorClip.x,
			colorClip.y,
			colorClip.width,
			colorClip.height,
			paintBackground(paint),
			colorClip,
		);
		const source = backgroundSource(node);
		if (source)
			metrics.paintedBackgrounds += paintBackgroundImage(
				image,
				source,
				layer,
				geometry,
				charge,
				outer,
			);
	};
	const textDecorations = prepareTextDecorations(tree, layout, charge);
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
	let canvasPaint = initialPaintStyle;
	const suppressed = new Set<string>();
	if (root !== undefined) {
		suppressed.add(tree.reference(root));
		const rootPaint = styles.paint(root);
		if (styles.get(root).displayed) {
			let sourcePaint = rootPaint;
			if (
				tree.get(root).tagName === "html" &&
				paintBackground(rootPaint)[3] === 0 &&
				backgroundImageUrl(
					rootPaint.background?.["background-image"] ?? "none",
				) === undefined
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
			) {
				canvasPaint = sourcePaint;
				canvasColor =
					sourcePaint["background-color"] === "currentcolor"
						? rootPaint.color
						: sourcePaint["background-color"];
			}
		}
	}
	const canvasBackground = Object.freeze({
		sourceRef: canvasSource === undefined ? null : tree.reference(canvasSource),
		color: canvasColor,
	});
	drawBackground(clip.x, clip.y, image.width, image.height, canvasColor);
	if (
		canvasPaint.background &&
		canvasSource !== undefined &&
		root !== undefined
	) {
		const rootBox = layout.boxes.find((box) => {
			charge();
			return box.ref === tree.reference(root);
		});
		if (
			backgroundImageUrl(canvasPaint.background["background-image"]) !==
			undefined
		) {
			if (!rootBox)
				throw new AgentBrowserError(
					"unsupported",
					"Canvas background positioning geometry is unavailable",
				);
			const source = backgroundSource({
				...nodes[rootBox.id],
				ref: tree.reference(canvasSource),
				paint: canvasPaint,
			});
			if (source) {
				const canvasClip = createRoundedBox(0, 0, image.width, image.height, [
					{ horizontal: 0, vertical: 0 },
					{ horizontal: 0, vertical: 0 },
					{ horizontal: 0, vertical: 0 },
					{ horizontal: 0, vertical: 0 },
				]);
				metrics.paintedBackgrounds += paintBackgroundImage(
					image,
					source,
					canvasPaint.background,
					backgroundGeometry(rootBox),
					charge,
					undefined,
					canvasClip,
					true,
				);
			}
		}
	}
	const paintBox = (
		box: Readonly<DocumentBox>,
		decoration?: RoundedDecoration,
	) => {
		charge();
		const node = nodes[box.id];
		if (!node.visible || !node.paint || node.kind === "replaced") return;
		const legend =
			node.fieldsetLegend === undefined
				? undefined
				: legendBox(node.fieldsetLegend);
		const borderOffset = legend
			? Math.max(0, (legend.borderBoxHeight - box.borderTop) / 2)
			: 0;
		const paintedBorderY = box.borderY + borderOffset;
		const paintedBorderHeight = box.borderBoxHeight - borderOffset;
		const exclusionTop = legend ? Math.min(paintedBorderY, legend.borderY) : 0;
		const borderExclusion = legend
			? {
					x: legend.borderX - clip.x,
					y: exclusionTop - clip.y,
					width: legend.borderBoxWidth,
					height:
						Math.max(
							paintedBorderY + box.borderTop,
							legend.borderY + legend.borderBoxHeight,
						) - exclusionTop,
				}
			: undefined;
		if (node.buttonAppearance) {
			if (hasVisualBackgroundLayer(node))
				throw new AgentBrowserError(
					"unsupported",
					"Background layers on native buttons are not supported",
				);
			const horizontal = box.borderX - clip.x;
			const vertical = box.borderY - clip.y;
			const left = Math.max(0, horizontal);
			const top = Math.max(0, vertical);
			const right = Math.min(image.width, horizontal + box.borderBoxWidth);
			const bottom = Math.min(image.height, vertical + box.borderBoxHeight);
			if (right > left && bottom > top) {
				if (decoration) charge(32 + Math.ceil(bottom - top + 1) * 2);
				charge(Math.ceil(right - left + 1) * Math.ceil(bottom - top + 1) * 4);
				paintRasterImage(
					image,
					rasterizeControl(
						node.buttonAppearance,
						box.borderBoxWidth,
						box.borderBoxHeight,
						node.paint,
						charge,
					),
					horizontal,
					vertical,
					box.borderBoxWidth,
					box.borderBoxHeight,
					localCurve(decoration?.outer),
				);
				metrics.paintedControls++;
			} else metrics.clippedControls++;
		} else if (!box.ref || !suppressed.has(box.ref))
			drawNodeBackground(
				node,
				backgroundGeometry({
					...box,
					borderY: paintedBorderY,
					borderBoxHeight: paintedBorderHeight,
				}),
				decoration,
			);
		if (node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintBorders(
				image,
				box.borderX - clip.x,
				paintedBorderY - clip.y,
				box.borderBoxWidth,
				paintedBorderHeight,
				box,
				node.paint,
				node.box ?? initialBoxStyle,
				charge,
				0,
				borderExclusion,
				localCurve(decoration?.outer),
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
		const style = (nodes[glyph.formattingId].typography?.["font-style"] ??
			"normal") as NativeFontStyle;
		const ink = bitmapGlyphInk(glyph.character, weight, style);
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
			style,
		);
		metrics.paintedGlyphs++;
	};
	const paintImage = (
		id: number,
		borderX: number,
		borderY: number,
		decoration?: RoundedDecoration,
	) => {
		charge();
		const used = images.get(id);
		const node = nodes[id];
		if (
			!used ||
			(!node.visible && !node.svg?.shapes.some((shape) => shape.visible))
		)
			return;
		if (node.emptyImage) documentImages(tree).get(tree.resolve(used.ref).id);
		const source =
			node.control ||
			node.marker ||
			node.svg ||
			node.imageAlternative ||
			node.emptyImage
				? undefined
				: documentImages(tree).decoded(tree.resolve(used.ref).id);
		if (
			!source &&
			!node.control &&
			!node.marker &&
			!node.svg &&
			!node.imageAlternative &&
			!node.emptyImage
		)
			throw new AgentBrowserError(
				"unsupported",
				"Image resource is no longer available for painting",
			);
		if (node.visible)
			drawNodeBackground(
				node,
				backgroundGeometry({ ...used, borderX, borderY }),
				decoration,
			);
		if (node.visible && node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintBorders(
				image,
				borderX - clip.x,
				borderY - clip.y,
				used.borderBoxWidth,
				used.borderBoxHeight,
				used,
				node.paint ?? initialPaintStyle,
				node.box ?? initialBoxStyle,
				charge,
				0,
				undefined,
				localCurve(decoration?.outer),
			);
		if (node.emptyImage) {
			drawOutline(
				node.ref,
				borderX,
				borderY,
				used.borderBoxWidth,
				used.borderBoxHeight,
			);
			return;
		}
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
				destination(overflow.get(id)?.content),
				node.imageAlternative,
				originX,
				originY,
				used.contentWidth,
				used.contentHeight,
				(node.paint ?? initialPaintStyle).color,
				charge,
				matchFontWeight(Number(node.typography?.["font-weight"] ?? "400")),
				(node.typography?.["font-style"] ?? "normal") as NativeFontStyle,
				localCurve(decoration?.content),
			);
		else {
			if (decoration) charge(32 + Math.ceil(bottom - top + 1) * 2);
			charge(Math.ceil(right - left + 1) * Math.ceil(bottom - top + 1) * 4);
			paintRasterImage(
				destination(overflow.get(id)?.content),
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
							(node.typography?.["font-style"] ?? "normal") as NativeFontStyle,
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
								(node.typography?.["font-style"] ??
									"normal") as NativeFontStyle,
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
				localCurve(decoration?.content),
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
	for (const item of roundedItems ?? layoutContentItems(layout, charge)) {
		if (overflow.size > 0) {
			charge();
			const chain =
				item.kind === "table-borders"
					? overflow.get(item.box.id)?.content
					: item.kind === "marker"
						? overflow.get(item.marker.id)?.content
						: item.kind === "glyph"
							? overflow.get(item.glyph.formattingId)?.border
							: item.kind === "fragment"
								? overflow.get(item.fragment.formattingId)?.border
								: overflow.get(item.box.id)?.border;
			image = destination(chain);
		}
		const decoration = rounded?.decorations.get(item);
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
					(node.typography?.["font-style"] ?? "normal") as NativeFontStyle,
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
			paintBox(item.box, decoration);
			paintEmptyEditableCaret(
				caret,
				item.box,
				destination(overflow.get(item.box.id)?.content),
				clip,
				charge,
			);
			continue;
		}
		if (item.kind === "image") {
			paintImage(item.box.id, item.box.borderX, item.box.borderY, decoration);
			continue;
		}
		if (item.kind === "glyph") {
			paintEditableSelection(selection, item.glyph, image, clip, charge);
			paintTextDecorations(
				textDecorations,
				item.glyph,
				item.contentY,
				image,
				clip,
				"before",
				charge,
			);
			paintGlyph(item.glyph, item.contentY);
			paintTextDecorations(
				textDecorations,
				item.glyph,
				item.contentY,
				image,
				clip,
				"after",
				charge,
			);
			paintEditableCaret(caret, item.glyph, image, clip, charge);
			continue;
		}
		const fragment = item.fragment;
		const node = nodes[fragment.formattingId];
		if (node.kind === "replaced") {
			paintImage(node.id, fragment.x, fragment.y, decoration);
			continue;
		}
		if (node.kind !== "inline" || !node.visible || !node.paint) continue;
		if (hasVisualBackgroundLayer(node))
			throw new AgentBrowserError(
				"unsupported",
				"Background layers on non-atomic inline fragments are not supported",
			);
		if (!paintBackground(node.paint)[3] && !fragment.borders) {
			paintInlineDecorationEdges(
				textDecorations,
				fragment,
				image,
				clip,
				charge,
			);
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
			decoration?.outer,
		);
		if (fragment.borders && node.collapsedBorderOwner === undefined)
			metrics.borderPixels += paintBorders(
				image,
				(decoration?.outer.x ?? fragment.x) - clip.x,
				(decoration?.outer.y ?? fragment.y) - clip.y,
				decoration?.outer.width ?? fragment.width,
				decoration?.outer.height ?? fragment.height,
				decoration?.borders ?? fragment.borders,
				node.paint,
				node.box ?? initialBoxStyle,
				charge,
				decoration ? 0 : fragment.borderHorizontalOffset,
				undefined,
				localCurve(decoration?.outer),
				decoration
					? {
							x: fragment.x - clip.x,
							y: fragment.y - clip.y,
							width: fragment.width,
							height: fragment.height,
						}
					: undefined,
			);
		paintInlineDecorationEdges(textDecorations, fragment, image, clip, charge);
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
		image: canvas,
		canvasBackground,
		metrics: Object.freeze(metrics),
	});
}
