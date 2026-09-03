import { compressZlib } from "./deflate.js";
import { AgentBrowserError } from "./errors.js";
import { type RasterImage, validateRaster } from "./raster.js";

export const pdfLimits = Object.freeze({
	maxPages: 32,
	maxPixels: 16_777_216,
	maxGlyphs: 100_000,
	maxBytes: 33_554_432,
	maxCompressionWork: 128_000_000,
});
export interface PdfGlyph {
	character: string;
	x: number;
	y: number;
	fontSize: number;
}
export interface PdfPage {
	image: RasterImage;
	height: number;
	glyphs: readonly PdfGlyph[];
}
const encoder = new TextEncoder();
function ascii(value: string) {
	return encoder.encode(value);
}
function number(value: number) {
	if (!Number.isFinite(value) || Math.abs(value) > 16_777_216)
		throw new AgentBrowserError("invalid-input", "Invalid PDF coordinate");
	return String(Math.round(value * 1_000_000) / 1_000_000);
}
function concatenate(parts: readonly Uint8Array[]) {
	const length = parts.reduce((total, part) => total + part.length, 0);
	if (length > pdfLimits.maxBytes)
		throw new AgentBrowserError("resource-limit", "PDF byte limit exceeded");
	const output = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}
function stream(dictionary: string, bytes: Uint8Array) {
	return concatenate([
		ascii(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`),
		bytes,
		ascii("\nendstream"),
	]);
}

class PdfObjects {
	private readonly objects: (Uint8Array | undefined)[] = [];
	private bytes = 0;
	reserve() {
		this.objects.push(undefined);
		return this.objects.length;
	}
	set(id: number, bytes: Uint8Array) {
		if (
			!Number.isInteger(id) ||
			id < 1 ||
			id > this.objects.length ||
			this.objects[id - 1]
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid PDF object assignment",
			);
		if (this.bytes + bytes.length > pdfLimits.maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"PDF object byte limit exceeded",
			);
		this.objects[id - 1] = bytes;
		this.bytes += bytes.length;
	}
	add(bytes: Uint8Array) {
		const id = this.reserve();
		this.set(id, bytes);
		return id;
	}
	finish(root: number) {
		const parts: Uint8Array[] = [
			ascii("%PDF-1.4\n"),
			new Uint8Array([37, 226, 227, 207, 211, 10]),
		];
		let offset = parts.reduce((total, part) => total + part.length, 0);
		const offsets = [0];
		for (let index = 0; index < this.objects.length; index++) {
			const body = this.objects[index];
			if (!body)
				throw new AgentBrowserError("invalid-input", "Unassigned PDF object");
			offsets.push(offset);
			const object = [ascii(`${index + 1} 0 obj\n`), body, ascii("\nendobj\n")];
			parts.push(...object);
			offset += object.reduce((total, part) => total + part.length, 0);
		}
		const entries = offsets
			.map(
				(entry, index) =>
					`${String(entry).padStart(10, "0")} ${index ? "00000 n" : "65535 f"} \n`,
			)
			.join("");
		parts.push(
			ascii(
				`xref\n0 ${offsets.length}\n${entries}trailer\n<< /Size ${offsets.length} /Root ${root} 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
			),
		);
		return concatenate(parts);
	}
}

export function encodePdf(pages: Iterable<PdfPage>) {
	if (!pages || typeof pages[Symbol.iterator] !== "function")
		throw new AgentBrowserError("invalid-input", "PDF pages must be iterable");
	const objects = new PdfObjects();
	const catalog = objects.reserve();
	const pageTree = objects.reserve();
	const unicode = objects.add(
		stream(
			"",
			ascii(
				"/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /AgentBrowserUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n2 beginbfrange\n<20> <7E> <0020>\n<A0> <A0> <00A0>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n",
			),
		),
	);
	const font = objects.add(
		ascii(
			`<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding /ToUnicode ${unicode} 0 R >>`,
		),
	);
	const children: number[] = [];
	let pixels = 0;
	let glyphs = 0;
	let compressionWork = 0;
	for (const page of pages) {
		if (children.length >= pdfLimits.maxPages)
			throw new AgentBrowserError("resource-limit", "PDF page limit exceeded");
		if (!page || typeof page !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid PDF page");
		validateRaster(page.image);
		if (
			!Number.isSafeInteger(page.height) ||
			page.height < page.image.height ||
			page.height > 4096 ||
			page.image.width * page.height > 4_194_304 ||
			!Array.isArray(page.glyphs)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid PDF page dimensions or text",
			);
		pixels += page.image.width * page.image.height;
		glyphs += page.glyphs.length;
		if (pixels > pdfLimits.maxPixels || glyphs > pdfLimits.maxGlyphs)
			throw new AgentBrowserError(
				"resource-limit",
				"PDF pixel or text limit exceeded",
			);
		const commands = [
			`q\n${number(page.image.width * 0.75)} 0 0 ${number(page.image.height * 0.75)} 0 ${number((page.height - page.image.height) * 0.75)} cm\n/Im0 Do\nQ\n`,
		];
		let run:
			| { x: number; y: number; fontSize: number; end: number; codes: string[] }
			| undefined;
		const flush = () => {
			if (!run) return;
			commands.push(
				`BT /F1 ${number(run.fontSize * 0.75)} Tf 125 Tz 3 Tr 1 0 0 1 ${number(run.x * 0.75)} ${number((page.height - run.y - (run.fontSize * 7) / 8) * 0.75)} Tm <${run.codes.join("")}> Tj ET\n`,
			);
			run = undefined;
		};
		for (const glyph of page.glyphs) {
			if (
				!glyph ||
				typeof glyph.character !== "string" ||
				glyph.character.length !== 1 ||
				!Number.isFinite(glyph.x) ||
				!Number.isFinite(glyph.y) ||
				!Number.isFinite(glyph.fontSize) ||
				glyph.fontSize <= 0 ||
				glyph.fontSize > 512
			)
				throw new AgentBrowserError("invalid-input", "Invalid PDF text glyph");
			const code = glyph.character.charCodeAt(0);
			if (!((code >= 32 && code <= 126) || code === 160))
				throw new AgentBrowserError(
					"unsupported",
					"PDF text requires the supported bitmap font repertoire",
				);
			if (
				!run ||
				run.end !== glyph.x ||
				run.y !== glyph.y ||
				run.fontSize !== glyph.fontSize
			) {
				flush();
				run = {
					x: glyph.x,
					y: glyph.y,
					fontSize: glyph.fontSize,
					end: glyph.x,
					codes: [],
				};
			}
			run.codes.push(code.toString(16).padStart(2, "0"));
			run.end = glyph.x + glyph.fontSize * 0.75;
		}
		flush();
		const rgb = new Uint8Array(page.image.width * page.image.height * 3);
		for (let pixel = 0; pixel < page.image.width * page.image.height; pixel++) {
			const alpha = page.image.pixels[pixel * 4 + 3] / 255;
			for (let channel = 0; channel < 3; channel++)
				rgb[pixel * 3 + channel] = Math.round(
					page.image.pixels[pixel * 4 + channel] * alpha + 255 * (1 - alpha),
				);
		}
		const compressed = compressZlib(rgb, {
			maxWork: Math.max(1, pdfLimits.maxCompressionWork - compressionWork),
		});
		compressionWork += compressed.work;
		if (compressionWork > pdfLimits.maxCompressionWork)
			throw new AgentBrowserError(
				"resource-limit",
				"PDF compression work limit exceeded",
			);
		const image = objects.add(
			stream(
				`/Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Interpolate false`,
				compressed.bytes,
			),
		);
		const content = objects.add(stream("", ascii(commands.join(""))));
		children.push(
			objects.add(
				ascii(
					`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${number(page.image.width * 0.75)} ${number(page.height * 0.75)}] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`,
				),
			),
		);
	}
	if (!children.length)
		throw new AgentBrowserError(
			"invalid-input",
			"PDF requires at least one page",
		);
	objects.set(catalog, ascii(`<< /Type /Catalog /Pages ${pageTree} 0 R >>`));
	objects.set(
		pageTree,
		ascii(
			`<< /Type /Pages /Count ${children.length} /Kids [${children.map((id) => `${id} 0 R`).join(" ")}] >>`,
		),
	);
	const bytes = objects.finish(catalog);
	return Object.freeze({
		bytes,
		metrics: Object.freeze({
			pages: children.length,
			pixels,
			glyphs,
			compressionWork,
			bytes: bytes.length,
		}),
	});
}
