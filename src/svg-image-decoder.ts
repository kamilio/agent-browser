import { AgentBrowserError } from "./errors.js";
import { pngDecodeLimits, type PngDecodeOptions } from "./png-decoder.js";
import type { RasterImage } from "./raster.js";
import { DocumentStyles } from "./styles.js";
import { createSvgImageDocument } from "./svg-image-document.js";
import {
	parseSvgImageXml,
	svgImageXmlLimits,
	type SvgXmlDocument,
} from "./svg-image-xml.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { imageSvgScene } from "./svg-scene.js";

export const svgImageDecodeLimits = Object.freeze({
	maxInputBytes: svgImageXmlLimits.maxInputBytes,
	maxWork: pngDecodeLimits.maxWork,
	maxDimension: pngDecodeLimits.maxDimension,
	maxPixels: pngDecodeLimits.maxPixels,
});

export interface DecodedSvgImage {
	readonly image: Readonly<RasterImage>;
	readonly intrinsic: Readonly<{ width: number; height: number }>;
	readonly work: number;
	readonly sourceCodeUnits: number;
	readonly xmlNodes: number;
	readonly shapes: number;
	readonly presentation: "static-native-subset";
	readonly ignoredMetadata: readonly string[];
	readonly doctype?: SvgXmlDocument["doctype"];
}

export function decodeSvgImage(
	input: Uint8Array,
	options: PngDecodeOptions = {},
): Readonly<DecodedSvgImage> {
	if (
		!(input instanceof Uint8Array) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["maxWork", "maxPixels"].includes(key))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid SVG decode arguments",
		);
	const maxWork =
		options.maxWork === undefined
			? svgImageDecodeLimits.maxWork
			: options.maxWork;
	const maxPixels =
		options.maxPixels === undefined
			? svgImageDecodeLimits.maxPixels
			: options.maxPixels;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > svgImageDecodeLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid SVG decode work limit",
		);
	if (
		!Number.isSafeInteger(maxPixels) ||
		maxPixels < 1 ||
		maxPixels > svgImageDecodeLimits.maxPixels
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid SVG decode pixel limit",
		);
	let work = 0;
	const charge = (amount: number) => {
		if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxWork - work)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG decode work limit exceeded",
			);
		work += amount;
	};
	const xml = parseSvgImageXml(input, charge);
	const { tree, root } = createSvgImageDocument(xml, charge);
	try {
		charge(1);
		if (work === maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG decode work limit exceeded",
			);
		const styles = new DocumentStyles(tree, {
			maxWork: Math.min(5_000_000, maxWork - work),
		});
		const metrics = styles.metrics();
		charge(metrics.work);
		if (Object.keys(metrics.issues).length)
			throw new AgentBrowserError(
				"unsupported",
				"SVG image styles require an issue-free supported profile",
			);
		const box = styles.box(root);
		function dimension(value: string): number {
			charge(value.length + 1);
			if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?px$/i.test(value))
				throw new AgentBrowserError(
					"unsupported",
					"SVG image requires absolute width and height",
				);
			const amount = Number.parseFloat(value);
			if (!Number.isFinite(amount) || amount <= 0)
				throw new AgentBrowserError(
					"unsupported",
					"SVG image requires positive intrinsic dimensions",
				);
			if (amount > svgImageDecodeLimits.maxDimension)
				throw new AgentBrowserError(
					"resource-limit",
					"SVG image dimension limit exceeded",
				);
			return amount;
		}
		const width = dimension(box.width);
		const height = dimension(box.height);
		charge(8);
		const columns = Math.ceil(width);
		const rows = Math.ceil(height);
		if (columns * rows > maxPixels)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG image pixel limit exceeded",
			);
		if (!Number.isFinite(columns / width) || !Number.isFinite(rows / height))
			throw new AgentBrowserError(
				"resource-limit",
				"SVG image raster scale overflow",
			);
		const scene = imageSvgScene(tree, root, charge, styles);
		const image = rasterizeSvgScene(scene, width, height, charge);
		return Object.freeze({
			image,
			intrinsic: Object.freeze({ width, height }),
			work,
			sourceCodeUnits: xml.sourceCodeUnits,
			xmlNodes: xml.nodes,
			shapes: scene.shapes.length,
			presentation: "static-native-subset",
			ignoredMetadata: Object.freeze(
				xml.doctype ? ["external-doctype-not-loaded"] : [],
			),
			...(xml.doctype ? { doctype: xml.doctype } : {}),
		});
	} catch (error) {
		if (error instanceof SyntaxError)
			throw new AgentBrowserError(
				"invalid-input",
				"Malformed SVG image geometry",
			);
		if (error instanceof RangeError)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG image geometry limit exceeded",
			);
		throw error;
	} finally {
		tree.close();
	}
}
