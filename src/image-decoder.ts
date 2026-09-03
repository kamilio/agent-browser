import { AgentBrowserError } from "./errors.js";
import { decodeJpeg, type DecodedJpeg } from "./jpeg-decoder.js";
import {
	decodePng,
	type DecodedPng,
	type PngDecodeOptions,
} from "./png-decoder.js";

export const imageMediaTypes = Object.freeze([
	"image/png",
	"image/jpeg",
] as const);
export type ImageMediaType = (typeof imageMediaTypes)[number];
export type DecodedImage =
	| (Readonly<DecodedPng> & { readonly mediaType: "image/png" })
	| (Readonly<DecodedJpeg> & { readonly mediaType: "image/jpeg" });

export function decodeImage(
	input: Uint8Array,
	mediaType: string,
	options: PngDecodeOptions = {},
): Readonly<DecodedImage> {
	if (mediaType === "image/png")
		return Object.freeze({ ...decodePng(input, options), mediaType });
	if (mediaType === "image/jpeg")
		return Object.freeze({ ...decodeJpeg(input, options), mediaType });
	throw new AgentBrowserError("unsupported", "Unsupported image response MIME");
}
