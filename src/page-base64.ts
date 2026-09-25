import { AgentBrowserError } from "./errors.js";
import { domString } from "./script-dom.js";

const alphabet =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const pageBase64Limits = Object.freeze({
	inputCodeUnits: 262_144,
	outputCodeUnits: 262_144,
});

function inputString(args: readonly unknown[]): string {
	if (args.length === 0) throw new TypeError("A base64 argument is required");
	if (typeof args[0] === "symbol")
		throw new TypeError("Cannot convert a Symbol to a string");
	const value = domString(args[0]);
	if (value.length > pageBase64Limits.inputCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Base64 input exceeds its limit",
		);
	return value;
}

function invalidCharacter(): never {
	throw new DOMException(
		"Invalid base64 character or encoding",
		"InvalidCharacterError",
	);
}

export function pageBtoa(...args: readonly unknown[]): string {
	const input = inputString(args);
	if (Math.ceil(input.length / 3) * 4 > pageBase64Limits.outputCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Base64 output exceeds its limit",
		);
	let output = "";
	for (let offset = 0; offset < input.length; offset += 3) {
		const first = input.charCodeAt(offset);
		const second = offset + 1 < input.length ? input.charCodeAt(offset + 1) : 0;
		const third = offset + 2 < input.length ? input.charCodeAt(offset + 2) : 0;
		if (first > 255 || second > 255 || third > 255) invalidCharacter();
		output += alphabet[first >> 2];
		output += alphabet[((first & 3) << 4) | (second >> 4)];
		output +=
			offset + 1 < input.length
				? alphabet[((second & 15) << 2) | (third >> 6)]
				: "=";
		output += offset + 2 < input.length ? alphabet[third & 63] : "=";
	}
	return output;
}

export function pageAtob(...args: readonly unknown[]): string {
	let input = inputString(args).replace(/[\t\n\f\r ]/g, "");
	if (input.length % 4 === 0) input = input.replace(/={1,2}$/, "");
	if (input.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(input))
		invalidCharacter();
	if (Math.floor((input.length * 6) / 8) > pageBase64Limits.outputCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Base64 output exceeds its limit",
		);
	let output = "";
	let buffer = 0;
	let bits = 0;
	for (let offset = 0; offset < input.length; offset++) {
		buffer = (buffer << 6) | alphabet.indexOf(input[offset]);
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			output += String.fromCharCode((buffer >> bits) & 255);
			buffer &= (1 << bits) - 1;
		}
	}
	return output;
}
