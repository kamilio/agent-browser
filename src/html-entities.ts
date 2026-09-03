import { namedHtmlEntities } from "./html-named-entities.js";

const maxNameLength = 32;
const replacements = [
	0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
	0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d,
	0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e,
	0x178,
];

export function decodeHtmlEntities(
	value: string,
	attribute: boolean,
	issue: (code: string) => void,
): string {
	return value.replace(
		/&(#(?:[xX][0-9a-fA-F]*|[0-9]*);?|[a-zA-Z0-9]+;?)/g,
		(whole: string, body: string, offset: number) => {
			const terminated = body.endsWith(";");
			const name = terminated ? body.slice(0, -1) : body;
			if (name.startsWith("#")) {
				const hexadecimal = name[1]?.toLowerCase() === "x";
				const digits = name.slice(hexadecimal ? 2 : 1);
				if (!digits) {
					issue("missing-numeric-entity-digits");
					return whole;
				}
				let point = Number.parseInt(digits, hexadecimal ? 16 : 10);
				if (!terminated) issue("missing-entity-semicolon");
				if (
					point === 0 ||
					point > 0x10ffff ||
					(point >= 0xd800 && point <= 0xdfff)
				) {
					issue("invalid-numeric-entity");
					point = 0xfffd;
				} else if (point >= 0x80 && point <= 0x9f) {
					issue("legacy-numeric-entity");
					point = replacements[point - 0x80];
				} else if (
					(point >= 1 && point <= 8) ||
					point === 0x0b ||
					point === 0x0d ||
					(point >= 0x0e && point <= 0x1f) ||
					point === 0x7f
				) {
					issue("control-numeric-entity");
				} else if (
					(point >= 0xfdd0 && point <= 0xfdef) ||
					(point & 0xffff) >= 0xfffe
				) {
					issue("noncharacter-numeric-entity");
				}
				return String.fromCodePoint(point);
			}
			for (
				let length = Math.min(body.length, maxNameLength);
				length > 0;
				length--
			) {
				const candidate = body.slice(0, length);
				if (!Object.hasOwn(namedHtmlEntities, candidate)) continue;
				const complete = candidate.endsWith(";");
				if (
					!complete &&
					attribute &&
					/[=a-zA-Z0-9]/.test(value[offset + length + 1] ?? "")
				)
					return whole;
				if (!complete) issue("missing-entity-semicolon");
				return namedHtmlEntities[candidate] + body.slice(length);
			}
			if (terminated) issue("unresolved-named-reference");
			return whole;
		},
	);
}
