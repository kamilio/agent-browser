import { AgentBrowserError } from "./errors.js";
import { decodeGif, type DecodedGif } from "./gif-decoder.js";
import { decodeJpeg, type DecodedJpeg } from "./jpeg-decoder.js";
import { decodeSvgImage, type DecodedSvgImage } from "./svg-image-decoder.js";
import {
	decodePng,
	type DecodedPng,
	type PngDecodeOptions,
} from "./png-decoder.js";

export const imageMediaTypes = Object.freeze([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/svg+xml",
] as const);
export type ImageMediaType = (typeof imageMediaTypes)[number];
export type DecodedImage =
	| (Readonly<DecodedPng> & { readonly mediaType: "image/png" })
	| (Readonly<DecodedJpeg> & { readonly mediaType: "image/jpeg" })
	| (Readonly<DecodedGif> & { readonly mediaType: "image/gif" })
	| (Readonly<DecodedSvgImage> & { readonly mediaType: "image/svg+xml" });

export function imageIntrinsicSize(
	decoded: Readonly<DecodedImage>,
): Readonly<{ width: number; height: number }> {
	return decoded.mediaType === "image/svg+xml"
		? decoded.intrinsic
		: decoded.image;
}

export function decodeImage(
	input: Uint8Array,
	mediaType: string,
	options: PngDecodeOptions = {},
): Readonly<DecodedImage> {
	if (mediaType === "image/png")
		return Object.freeze({ ...decodePng(input, options), mediaType });
	if (mediaType === "image/jpeg")
		return Object.freeze({ ...decodeJpeg(input, options), mediaType });
	if (mediaType === "image/gif")
		return Object.freeze({ ...decodeGif(input, options), mediaType });
	if (mediaType === "image/svg+xml")
		return Object.freeze({ ...decodeSvgImage(input, options), mediaType });
	throw new AgentBrowserError("unsupported", "Unsupported image response MIME");
}
