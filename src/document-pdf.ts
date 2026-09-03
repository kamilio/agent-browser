import { initialPaintStyle } from "./css-paint.js";
import { type DocumentClip, prepareDocumentRaster } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { encodePdf, pdfLimits, type PdfGlyph, type PdfPage } from "./pdf.js";

export const documentPdfLimits = Object.freeze({
	maxWork: 128_000_000,
	...pdfLimits,
});

export function renderDocumentPdf(tree: DocumentTree) {
	const painter = prepareDocumentRaster(tree);
	const layout = painter.layout;
	const viewport = layout.text.horizontal.formatting.viewport;
	if (
		!Number.isSafeInteger(viewport.width) ||
		!Number.isSafeInteger(viewport.height) ||
		viewport.width < 1 ||
		viewport.height < 1 ||
		viewport.width > 4096 ||
		viewport.height > 4096 ||
		viewport.width * viewport.height > 4_194_304
	)
		throw new AgentBrowserError(
			"unsupported",
			"PDF requires an integer viewport within raster limits",
		);
	let work = layout.metrics.work + layout.text.metrics.work;
	let extent = Math.max(viewport.height, layout.flowHeight);
	const intervals: { top: number; bottom: number }[] = [];
	const allGlyphs: PdfGlyph[] = [];
	for (const box of layout.boxes)
		extent = Math.max(extent, box.borderY + box.borderBoxHeight);
	for (let index = 0; index < layout.contexts.length; index++) {
		const context = layout.contexts[index];
		for (const glyph of layout.text.contexts[index].glyphs) {
			if (
				!glyph.visible ||
				glyph.fontSize <= 0 ||
				glyph.kind === "tab" ||
				!(
					layout.text.horizontal.formatting.nodes[glyph.formattingId].paint ??
					initialPaintStyle
				).color[3]
			)
				continue;
			const top = context.contentY + glyph.y;
			const bottom = top + glyph.fontSize;
			if (
				glyph.x + glyph.advance <= 0 ||
				glyph.x >= viewport.width ||
				bottom <= 0
			)
				continue;
			extent = Math.max(extent, bottom);
			if (allGlyphs.length >= pdfLimits.maxGlyphs)
				throw new AgentBrowserError(
					"resource-limit",
					"PDF text limit exceeded",
				);
			allGlyphs.push({
				character: glyph.character,
				x: glyph.x,
				y: top,
				fontSize: glyph.fontSize,
			});
			intervals.push({ top, bottom });
		}
		for (const fragment of context.fragments)
			extent = Math.max(extent, fragment.y + fragment.height);
	}
	intervals.sort(
		(left, right) => left.top - right.top || left.bottom - right.bottom,
	);
	const joined: { top: number; bottom: number }[] = [];
	for (const interval of intervals) {
		const previous = joined.at(-1);
		if (previous && interval.top < previous.bottom)
			previous.bottom = Math.max(previous.bottom, interval.bottom);
		else joined.push({ ...interval });
	}
	const clips: DocumentClip[] = [];
	const height = Math.ceil(extent);
	let start = 0;
	let pixels = 0;
	while (start < height) {
		let end = Math.min(height, start + viewport.height);
		const crossing = joined.find(
			(interval) => interval.top < end && interval.bottom > end,
		);
		if (crossing) end = Math.floor(crossing.top);
		if (end <= start)
			throw new AgentBrowserError(
				"unsupported",
				"PDF page height cannot contain an unbroken text line",
			);
		pixels += viewport.width * (end - start);
		if (clips.length >= pdfLimits.maxPages || pixels > pdfLimits.maxPixels)
			throw new AgentBrowserError(
				"resource-limit",
				"PDF pagination limit exceeded",
			);
		clips.push(
			Object.freeze({
				x: 0,
				y: start,
				width: viewport.width,
				height: end - start,
			}),
		);
		start = end;
	}
	function* pages(): Generator<PdfPage> {
		for (const clip of clips) {
			const raster = painter.rasterize({ clip });
			work += raster.metrics.work;
			if (work > documentPdfLimits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"PDF document work limit exceeded",
				);
			const glyphs = allGlyphs
				.filter(
					(glyph) =>
						glyph.y + glyph.fontSize > clip.y && glyph.y < clip.y + clip.height,
				)
				.map((glyph) => ({ ...glyph, y: glyph.y - clip.y }));
			yield { image: raster.image, height: viewport.height, glyphs };
		}
	}
	const encoded = encodePdf(pages());
	return Object.freeze({
		bytes: encoded.bytes,
		width: viewport.width,
		height: viewport.height,
		clips: Object.freeze(clips),
		metrics: Object.freeze({ ...encoded.metrics, work, layoutPasses: 1 }),
	});
}
