const named: Readonly<Record<string, string>> = Object.freeze({
	amp: "&",
	AMP: "&",
	lt: "<",
	LT: "<",
	gt: ">",
	GT: ">",
	quot: '"',
	QUOT: '"',
	apos: "'",
	nbsp: "\u00a0",
	copy: "©",
	reg: "®",
	trade: "™",
	cent: "¢",
	pound: "£",
	yen: "¥",
	euro: "€",
	sect: "§",
	para: "¶",
	middot: "·",
	bull: "•",
	hellip: "…",
	ndash: "–",
	mdash: "—",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
	laquo: "«",
	raquo: "»",
	times: "×",
	divide: "÷",
	plusmn: "±",
	deg: "°",
	micro: "µ",
	shy: "\u00ad",
	ensp: "\u2002",
	emsp: "\u2003",
	thinsp: "\u2009",
	larr: "←",
	rarr: "→",
	uarr: "↑",
	darr: "↓",
	harr: "↔",
	ne: "≠",
	le: "≤",
	ge: "≥",
});
const legacy = new Set([
	"amp",
	"AMP",
	"lt",
	"LT",
	"gt",
	"GT",
	"quot",
	"QUOT",
	"nbsp",
	"copy",
	"reg",
	"cent",
	"pound",
	"yen",
	"sect",
	"para",
	"middot",
	"laquo",
	"raquo",
	"times",
	"divide",
	"plusmn",
	"deg",
	"micro",
	"shy",
]);
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
		/&(#(?:[xX][0-9a-fA-F]+|[0-9]+);?|[a-zA-Z][a-zA-Z0-9]*;?)/g,
		(whole: string, body: string, offset: number) => {
			const terminated = body.endsWith(";");
			const name = terminated ? body.slice(0, -1) : body;
			if (name.startsWith("#")) {
				const hexadecimal = name[1]?.toLowerCase() === "x";
				let point = Number.parseInt(
					name.slice(hexadecimal ? 2 : 1),
					hexadecimal ? 16 : 10,
				);
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
				}
				return String.fromCodePoint(point);
			}
			if (!Object.hasOwn(named, name) || (!terminated && !legacy.has(name))) {
				issue("unresolved-named-reference");
				return whole;
			}
			if (
				!terminated &&
				attribute &&
				/[=a-zA-Z0-9]/.test(value[offset + whole.length] ?? "")
			)
				return whole;
			if (!terminated) issue("missing-entity-semicolon");
			return named[name];
		},
	);
}
