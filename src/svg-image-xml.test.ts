import { expect, it } from "vitest";
import {
	parseSvgImageXml,
	svgImageXmlLimits,
	type SvgXmlElement,
} from "./svg-image-xml.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";
const encoder = new TextEncoder();

it("does not make reserved future XML-prefixed namespace names fatal", () => {
	const result = parse(
		svg(`<XMLfuture:item/>`, `xmlns:XMLfuture="urn:future"`),
	);
	expect(element(result.root.children[0])).toMatchObject({
		name: "XMLfuture:item",
		localName: "item",
		namespaceURI: "urn:future",
	});
});

it("preserves SVG lexical casing and long opaque attribute values for the separate renderer", () => {
	const path = "0".repeat(2311);
	const result = parse(
		svg(
			`<linearGradient id="Paint" gradientUnits="userSpaceOnUse"><stop style="stop-color:#0673BA"/></linearGradient><path d="${path}" fill="url(#Paint)"/>`,
			`viewBox="0 0 16 16" xml:space="preserve"`,
		),
	);
	const gradient = element(result.root.children[0]);
	expect(gradient.name).toBe("linearGradient");
	expect(gradient.attributes[1]).toEqual({
		name: "gradientUnits",
		localName: "gradientUnits",
		namespaceURI: null,
		value: "userSpaceOnUse",
	});
	expect(result.root.attributes[1].name).toBe("viewBox");
	expect(result.root.attributes[2]).toEqual({
		name: "xml:space",
		localName: "space",
		namespaceURI: xmlNamespace,
		value: "preserve",
	});
	expect(
		element(result.root.children[1]).attributes.map(
			(attribute) => attribute.value,
		),
	).toEqual([path, "url(#Paint)"]);
});

it("decodes only the supplied byte view and leaves caller bytes unchanged", () => {
	const document = encoder.encode(svg());
	const storage = new Uint8Array(document.length + 4).fill(255);
	storage.set(document, 2);
	const before = storage.slice();
	const result = parseSvgImageXml(
		storage.subarray(2, storage.length - 2),
		() => {},
	);
	expect(result.root.namespaceURI).toBe(svgNamespace);
	expect(storage).toEqual(before);
});

it("retains the reported external SVG 1.1 doctype on a synthetic SVG without fetching or importing DTD defaults", () => {
	const source = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>`;
	const result = parse(source);
	expect(result.doctype).toEqual({
		name: "svg",
		publicId: "-//W3C//DTD SVG 1.1//EN",
		systemId: "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd",
	});
	expect(result.root.attributes).toEqual([
		{
			name: "xmlns",
			localName: "xmlns",
			namespaceURI: xmlnsNamespace,
			value: svgNamespace,
		},
	]);
	expect(result.nodes).toBe(1);
});
function svg(body = "", attributes = "") {
	return `<svg xmlns="${svgNamespace}"${attributes ? ` ${attributes}` : ""}>${body}</svg>`;
}
function parse(source: string) {
	return parseSvgImageXml(encoder.encode(source), () => {});
}
function fails(source: string, code = "invalid-input") {
	expect(() => parse(source)).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
}
function element(node: unknown): SvgXmlElement {
	if (
		!node ||
		typeof node !== "object" ||
		!("kind" in node) ||
		node.kind !== "element"
	)
		throw new Error("Expected XML element fixture");
	return node as SvgXmlElement;
}

it("returns independently expected qualified names, namespace declarations and unprefixed attributes", () => {
	const source = `<s:svg xmlns:s="${svgNamespace}" height="2"><metadata xmlns="urn:metadata" a="v"/><s:g/></s:svg>`;
	expect(parse(source)).toEqual({
		root: {
			kind: "element",
			name: "s:svg",
			localName: "svg",
			namespaceURI: svgNamespace,
			attributes: [
				{
					name: "xmlns:s",
					localName: "s",
					namespaceURI: xmlnsNamespace,
					value: svgNamespace,
				},
				{ name: "height", localName: "height", namespaceURI: null, value: "2" },
			],
			children: [
				{
					kind: "element",
					name: "metadata",
					localName: "metadata",
					namespaceURI: "urn:metadata",
					attributes: [
						{
							name: "xmlns",
							localName: "xmlns",
							namespaceURI: xmlnsNamespace,
							value: "urn:metadata",
						},
						{ name: "a", localName: "a", namespaceURI: null, value: "v" },
					],
					children: [],
				},
				{
					kind: "element",
					name: "s:g",
					localName: "g",
					namespaceURI: svgNamespace,
					attributes: [],
					children: [],
				},
			],
		},
		prolog: [],
		epilog: [],
		sourceCodeUnits: source.length,
		nodes: 3,
	});
});

it("preserves misc nodes, CDATA and PI data without interpreting their contents", () => {
	const source = `<?xml version="1.0" encoding="uTf-8" standalone="yes"?>\r\n<!--before--><?paint  ignored?>${svg(`<![CDATA[<&raw]]>plain&amp;<!--inside--><?keep data ?>`)} <?after?>`;
	const result = parse(source);
	expect(result.prolog).toEqual([
		{ kind: "text", data: "\n" },
		{ kind: "comment", data: "before" },
		{ kind: "processing-instruction", target: "paint", data: "ignored" },
	]);
	expect(result.root.children).toEqual([
		{ kind: "text", data: "<&raw" },
		{ kind: "text", data: "plain&" },
		{ kind: "comment", data: "inside" },
		{ kind: "processing-instruction", target: "keep", data: "data " },
	]);
	expect(result.epilog).toEqual([
		{ kind: "text", data: " " },
		{ kind: "processing-instruction", target: "after", data: "" },
	]);
	expect(result.nodes).toBe(10);
	expect(result.sourceCodeUnits).toBe(source.length);
});

it("normalizes literal EOL and attribute whitespace but retains referenced whitespace", () => {
	const result = parse(
		svg(
			"a\r\nb\rc\nd&#13;&#xA;&#9;\u0085",
			`value="a\t\r\nb\rc&#9;&#10;&#13;"`,
		),
	);
	expect(result.root.attributes[1].value).toBe("a  b c\t\n\r");
	expect(result.root.children).toEqual([
		{ kind: "text", data: "a\nb\nc\nd\r\n\t\u0085" },
	]);
});

it("decodes exactly five predefined entities and valid numeric scalar references", () => {
	const result = parse(
		svg(
			"&lt;&gt;&amp;&quot;&apos;&#65;&#x41;&#x1F642;&#x10FFFF;",
			`value="&lt;&amp;&quot;&apos;"`,
		),
	);
	expect(result.root.children).toEqual([
		{ kind: "text", data: "<>&\"'AA🙂\u{10ffff}" },
	]);
	expect(result.root.attributes[1].value).toBe("<&\"'");
});

it("supports a single optional UTF-8 BOM without counting it as source content", () => {
	const source = svg();
	const bytes = encoder.encode(`\ufeff${source}`);
	expect(parseSvgImageXml(bytes, () => {}).sourceCodeUnits).toBe(source.length);
	fails(`\ufeff\ufeff${source}`);
});

it("restores default and prefixed namespaces after nested shadowing", () => {
	const result = parse(
		svg(
			`<g xmlns="urn:outer" xmlns:p="urn:inner"><p:x/><x xmlns=""/></g><p:x/><g/>`,
			`xmlns:p="urn:original"`,
		),
	);
	const nested = element(result.root.children[0]);
	expect(nested.namespaceURI).toBe("urn:outer");
	expect(element(nested.children[0]).namespaceURI).toBe("urn:inner");
	expect(element(nested.children[1]).namespaceURI).toBe(null);
	expect(element(result.root.children[1]).namespaceURI).toBe("urn:original");
	expect(element(result.root.children[2]).namespaceURI).toBe(svgNamespace);
});

it("binds xml implicitly and resolves declarations after earlier prefixed attributes", () => {
	const result = parse(
		svg(
			"",
			`p:id="namespaced" id="plain" xmlns:p="${svgNamespace}" xml:lang="en" xmlns:xml="${xmlNamespace}"`,
		),
	);
	expect(result.root.attributes.slice(1, 3)).toEqual([
		{
			name: "p:id",
			localName: "id",
			namespaceURI: svgNamespace,
			value: "namespaced",
		},
		{ name: "id", localName: "id", namespaceURI: null, value: "plain" },
	]);
	expect(result.root.attributes[4]).toEqual({
		name: "xml:lang",
		localName: "lang",
		namespaceURI: xmlNamespace,
		value: "en",
	});
});

it("deeply freezes document, nodes, attributes and doctype metadata", () => {
	const result = parse(
		`<!DOCTYPE svg SYSTEM "unfetched.dtd">${svg('<!--x--><g a="b"/>')}`,
	);
	const check = (value: unknown) => {
		if (value && typeof value === "object") {
			expect(Object.isFrozen(value)).toBe(true);
			for (const child of Object.values(value)) check(child);
		}
	};
	check(result);
	expect(() => (result.root.children as unknown[]).push("changed")).toThrow();
});

it.each([
	`<?xml version="1.0"?>`,
	`<?xml version = '1.0' standalone = 'no' ?>`,
	`<?xml version="1.0" encoding="UTF-8"?>`,
])("accepts XML 1.0 declaration %s", (declaration) => {
	expect(parse(`${declaration}${svg()}`).root.localName).toBe("svg");
});

it.each([
	"",
	"<svg/>",
	`<svg xmlns="urn:wrong"/>`,
	`<SVG xmlns="${svgNamespace}"/>`,
	`${svg()}${svg()}`,
	`text${svg()}`,
	`${svg()}text`,
	`&#32;${svg()}`,
	` <?xml version="1.0"?>${svg()}`,
	`<?XML version="1.0"?>${svg()}`,
	`<?xml?>${svg()}`,
	`<?xml encoding="UTF-8" version="1.0"?>${svg()}`,
	`<?xml version="1.0" standalone="yes" encoding="UTF-8"?>${svg()}`,
	`<?xml version="1.0" version="1.0"?>${svg()}`,
	`<?xml version="1.0"standalone="no"?>${svg()}`,
	`<?xml version="1.x"?>${svg()}`,
	`<?xml version="2.0"?>${svg()}`,
	`<?xml version="1.0" standalone="maybe"?>${svg()}`,
	`<?xml version="1.0" encoding="8UTF"?>${svg()}`,
	`<?xml version="1.0" encoding=""?>${svg()}`,
	`<?xml version="1.0" extra="yes"?>${svg()}`,
	svg("<g></G>"),
	svg("<g>"),
	svg("</g>"),
	svg("<g a=unquoted/>"),
	svg(`<g a="one"a="two"/>`),
	svg(`<g a="one" a="two"/>`),
	svg(`<g a="<bad"/>`),
	svg(`<g a="truncated/>`),
	svg("<!--bad--comment-->"),
	svg("<!--bad--->"),
	svg("<!--unclosed"),
	svg("]]>"),
	svg("<![CDATA[unclosed"),
	svg("<?xml data?>"),
	svg("<?p:instruction data?>"),
	svg("<?p:q:r?>"),
	svg("<?keep!data?>"),
	svg("<?keep unclosed"),
	svg("<!DOCTYPE g>"),
	svg("<!ENTITY e 'x'>"),
	`<unknown/>${svg()}`,
	`${svg()}<!DOCTYPE svg>`,
	`<!DOCTYPE svg><!DOCTYPE svg>${svg()}`,
	`<!DOCTYPEsvg>${svg()}`,
	`<!DOCTYPE svg PUBLIC "name">${svg()}`,
	`<!DOCTYPE svg SYSTEM unquoted>${svg()}`,
	`<!DOCTYPE svg SYSTEM "file.dtd#part">${svg()}`,
	`<!DOCTYPE svg PUBLIC "bad\tidentifier" "file.dtd">${svg()}`,
])("rejects malformed XML without HTML recovery: %s", (source) => {
	fails(source);
});

it.each([
	`<g xmlns:p=""/>`,
	`<g xmlns:xml="urn:wrong"/>`,
	`<g xmlns:xmlns="urn:wrong"/>`,
	`<g xmlns:p="${xmlNamespace}"/>`,
	`<g xmlns="${xmlNamespace}"/>`,
	`<g xmlns="${xmlnsNamespace}"/>`,
	`<g xmlns:p="${xmlnsNamespace}"/>`,
	`<p:g/>`,
	`<g p:id="x"/>`,
	`<xmlns:g/>`,
	`<g xmlns:p="urn:same" xmlns:q="urn:same" p:id="one" q:id="two"/>`,
	`<g xmlns:p="urn:one" xmlns:p="urn:two"/>`,
	`<:g/>`,
	`<g:/>`,
	`<a:b:c/>`,
	`<g :id="x"/>`,
	`<g p:1id="x" xmlns:p="urn:p"/>`,
])("rejects namespace well-formedness violations: %s", (body) => {
	fails(svg(body));
});

it.each([
	"&unknown;",
	"&AMP;",
	"&amp",
	"&;",
	"&#;",
	"&#x;",
	"&#X41;",
	"&#-1;",
	"&#0;",
	"&#xB;",
	"&#xD800;",
	"&#xDFFF;",
	"&#xFFFE;",
	"&#xFFFF;",
	"&#x110000;",
	"&#99999999999999999999;",
	"&#xG;",
])("rejects invalid or undeclared reference %s", (reference) => {
	fails(svg(reference));
	fails(svg("", `a="${reference}"`));
});

it.each([
	[0x80],
	[0xc0, 0x80],
	[0xc1, 0xbf],
	[0xc2],
	[0xe0, 0x80, 0x80],
	[0xed, 0xa0, 0x80],
	[0xed, 0xbf, 0xbf],
	[0xef, 0xbb],
	[0xf0, 0x80, 0x80, 0x80],
	[0xf0, 0x9f, 0x99],
	[0xf4, 0x90, 0x80, 0x80],
	[0xf5, 0x80, 0x80, 0x80],
	[0xff],
])("rejects malformed UTF-8 byte sequence %j", (...bytes) => {
	expect(() => parseSvgImageXml(new Uint8Array(bytes), () => {})).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each([0, 1, 8, 11, 12, 14, 31, 0xfffe, 0xffff])(
	"rejects forbidden literal XML character %i",
	(code) => {
		fails(svg(String.fromCodePoint(code)));
	},
);

it.each([
	9, 10, 13, 0x20, 0x7f, 0x85, 0xd7ff, 0xe000, 0xfffd, 0x10000, 0xeffff,
	0x10ffff,
])("retains valid referenced XML scalar %i", (code) => {
	expect(parse(svg(`&#${code};`)).root.children).toEqual([
		{ kind: "text", data: String.fromCodePoint(code) },
	]);
});

it.each([
	"_",
	"À",
	"Ø",
	"ø",
	"Ͱ",
	"Ϳ",
	"\u200c",
	"⁰",
	"Ⰰ",
	"、",
	"豈",
	"ﷰ",
	"𐀀",
	"\u{effff}",
	"a·\u0300‿",
])("supports XML 1.0 Fifth Edition name %s", (name) => {
	expect(element(parse(svg(`<${name}/>`)).root.children[0]).name).toBe(name);
});

it.each(["1name", "-name", ".name", "\u0300name", "×", "÷", ";", "\u{f0000}"])(
	"rejects invalid XML name start %s",
	(name) => {
		fails(svg(`<${name}/>`));
	},
);

it.each([
	`<?xml version="1.1"?>`,
	`<?xml version="1.0" encoding="UTF-16"?>`,
	`<?xml version="1.0" encoding="ISO-8859-1"?>`,
	`<!DOCTYPE svg []>`,
	`<!DOCTYPE svg [<!ENTITY expanded "text">]>`,
	`<!DOCTYPE svg [<!ENTITY remote SYSTEM "https://unfetched.invalid/entity">]>`,
	`<!DOCTYPE svg [<!ENTITY % parameter SYSTEM "https://unfetched.invalid/parameter">%parameter;]>`,
])("rejects unsupported declarations explicitly: %s", (declaration) => {
	fails(`${declaration}${svg()}`, "unsupported");
});

it("retains an external public doctype without retrieving it or requiring validity-only root-name agreement", () => {
	const result = parse(
		`<!DOCTYPE unrelated PUBLIC "  -//Example//DTD   SVG\r\n1.0//EN  " "https://unfetched.invalid/svg.dtd">${svg()}`,
	);
	expect(result.doctype).toEqual({
		name: "unrelated",
		publicId: "-//Example//DTD SVG 1.0//EN",
		systemId: "https://unfetched.invalid/svg.dtd",
	});
	expect(result.root.namespaceURI).toBe(svgNamespace);
});

it("never expands unresolved external-subset entities and distinguishes standalone undeclared entities", () => {
	fails(`<!DOCTYPE svg SYSTEM "unfetched.dtd">${svg("&p:external;")}`);
	fails(
		`<!DOCTYPE svg SYSTEM "unfetched.dtd">${svg("", `value="&external;"`)}`,
		"unsupported",
	);
	fails(
		`<!DOCTYPE svg SYSTEM "unfetched.dtd">${svg("&external;")}`,
		"unsupported",
	);
	fails(
		`<?xml version="1.0" standalone="yes"?><!DOCTYPE svg SYSTEM "unfetched.dtd">${svg("&external;")}`,
	);
	expect(
		parse(`<!DOCTYPE svg SYSTEM "unfetched.dtd">${svg("&amp;")}`).root.children,
	).toEqual([{ kind: "text", data: "&" }]);
});

it.each(
	[
		["SYSTEM", `SYSTEM "https://unfetched.invalid/explicit.dtd"`],
		[
			"PUBLIC",
			`PUBLIC "-//Example//DTD Explicit//EN" "https://unfetched.invalid/explicit.dtd"`,
		],
	].flatMap(([kind, identifier]) =>
		["", "no", "yes"].map((standalone) => ({ kind, identifier, standalone })),
	),
)(
	"accepts explicit markup with unread $kind subset and standalone=$standalone",
	({ kind, identifier, standalone }) => {
		const declaration = standalone
			? `<?xml version="1.0" standalone="${standalone}"?>`
			: "";
		const result = parse(
			`${declaration}<!DOCTYPE s:svg ${identifier}><s:svg xmlns:s="${svgNamespace}" value="A\t B &amp; &#xA;"><s:g>&lt;&#65;</s:g></s:svg>`,
		);
		expect(result.doctype).toEqual({
			name: "s:svg",
			systemId: "https://unfetched.invalid/explicit.dtd",
			...(kind === "PUBLIC"
				? { publicId: "-//Example//DTD Explicit//EN" }
				: {}),
		});
		expect(result.root.attributes).toEqual([
			{
				name: "xmlns:s",
				localName: "s",
				namespaceURI: xmlnsNamespace,
				value: svgNamespace,
			},
			{
				name: "value",
				localName: "value",
				namespaceURI: null,
				value: "A  B & \n",
			},
		]);
		expect(result.root.children).toEqual([
			{
				kind: "element",
				name: "s:g",
				localName: "g",
				namespaceURI: svgNamespace,
				attributes: [],
				children: [{ kind: "text", data: "<A" }],
			},
		]);
	},
);

it.each(
	[
		`SYSTEM "unfetched.dtd"`,
		`PUBLIC "-//Example//DTD Entity//EN" "unfetched.dtd"`,
	].flatMap((identifier) =>
		["", `<?xml version="1.0" standalone="no"?>`].map((declaration) => ({
			identifier,
			declaration,
		})),
	),
)(
	"classifies unread declarations as unsupported in text, attributes and namespace values: $identifier $declaration",
	({ identifier, declaration }) => {
		const prefix = `${declaration}<!DOCTYPE svg ${identifier}>`;
		fails(`${prefix}${svg("&unknown;")}`, "unsupported");
		fails(`${prefix}${svg("", `value="&unknown;"`)}`, "unsupported");
		fails(`${prefix}${svg("<p:g/>", `xmlns:p="&unknown;"`)}`, "unsupported");
	},
);

it.each([
	"",
	`<?xml version="1.0" standalone="no"?>`,
	`<?xml version="1.0" standalone="yes"?>`,
])(
	"does not invent declarations with no external subset: %s",
	(declaration) => {
		for (const doctype of ["", "<!DOCTYPE svg>"]) {
			fails(`${declaration}${doctype}${svg("&unknown;")}`);
			fails(`${declaration}${doctype}${svg("", `value="&unknown;"`)}`);
		}
	},
);

it.each([
	`SYSTEM "unfetched.dtd"`,
	`PUBLIC "-//Example//DTD Entity//EN" "unfetched.dtd"`,
])(
	"enforces standalone=yes declared-entity well-formedness with %s",
	(identifier) => {
		const prefix = `<?xml version="1.0" standalone="yes"?><!DOCTYPE svg ${identifier}>`;
		fails(`${prefix}${svg("&unknown;")}`);
		fails(`${prefix}${svg("", `value="&unknown;"`)}`);
		fails(`${prefix}${svg("<p:g/>", `xmlns:p="&unknown;"`)}`);
	},
);

it.each(["&p:unknown;", "&missing", "&#xD800;"])(
	"does not downgrade malformed references because an external subset is unread: %s",
	(reference) => {
		const prefix = `<!DOCTYPE svg SYSTEM "unfetched.dtd">`;
		fails(`${prefix}${svg(reference)}`);
		fails(`${prefix}${svg("", `value="${reference}"`)}`);
	},
);

it.each([
	"",
	`<!ENTITY internal "replacement">`,
	`<!ATTLIST svg default CDATA "value">`,
	`<!ENTITY % parameter SYSTEM "unfetched.dtd">%parameter;`,
])(
	"rejects internal subsets instead of ignoring their declarations: %s",
	(subset) => {
		fails(
			`<!DOCTYPE svg SYSTEM "unfetched.dtd" [${subset}]>${svg()}`,
			"unsupported",
		);
	},
);

it("retains valid public literal punctuation and opaque system literals without reference expansion", () => {
	const punctuation = "-'()+,./:=?;!*#@$_%";
	const result = parse(
		`<!DOCTYPE svg PUBLIC " A\r\n${punctuation}  Z " "a<&unknown;%parameter;'\r\nb">${svg()}`,
	);
	expect(result.doctype).toEqual({
		name: "svg",
		publicId: `A ${punctuation} Z`,
		systemId: "a<&unknown;%parameter;'\nb",
	});
	const quoted = parse(`<!DOCTYPE svg PUBLIC '-//Example//EN' 'a"b'>${svg()}`);
	expect(quoted.doctype).toEqual({
		name: "svg",
		publicId: "-//Example//EN",
		systemId: 'a"b',
	});
});

it.each(["\t", "é", "[", '"'])(
	"rejects disallowed public literal character %s",
	(character) => {
		fails(`<!DOCTYPE svg PUBLIC "${character}" "unfetched.dtd">${svg()}`);
	},
);

it.each([":svg", "svg:", "p:q:svg", "p:1svg"])(
	"requires a QName in a doctype: %s",
	(name) => {
		fails(`<!DOCTYPE ${name} SYSTEM "unfetched.dtd">${svg()}`);
	},
);

it("does not impose namespace validity or URI checking on opaque values", () => {
	const result = parse(
		svg(`<p:metadata id="has:colon"/>`, `xmlns:p="not a URI"`),
	);
	expect(element(result.root.children[0]).namespaceURI).toBe("not a URI");
	expect(element(result.root.children[0]).attributes).toEqual([
		{ name: "id", localName: "id", namespaceURI: null, value: "has:colon" },
	]);
});

it("rejects every proper prefix of a complete nested XML document", () => {
	const source = svg(
		`<g a="&amp;"><![CDATA[content]]><!--note--><?pi data?></g>`,
	);
	for (let length = 0; length < source.length; length++)
		fails(source.slice(0, length));
});

it("enforces immutable exact parser maxima", () => {
	expect(svgImageXmlLimits).toEqual({
		maxInputBytes: 1_048_576,
		maxSourceCodeUnits: 262_144,
		maxNodes: 4096,
		maxElementDepth: 64,
		maxAttributesPerElement: 128,
		maxNameCodeUnits: 1024,
	});
	expect(Object.isFrozen(svgImageXmlLimits)).toBe(true);
});

it("checks the byte cap before decoding and the UTF-16 cap before normalization", () => {
	let charged = 0;
	const charge = (amount: number) => {
		charged += amount;
	};
	expect(() => parseSvgImageXml(new Uint8Array(1_048_577), charge)).toThrow(
		"input byte limit",
	);
	expect(charged).toBe(0);
	expect(() =>
		parseSvgImageXml(new Uint8Array(1_048_576).fill(65), charge),
	).toThrow("source code-unit limit");
	expect(charged).toBeGreaterThan(0);
	fails(svg("\r\n".repeat(131_072)), "resource-limit");
});

it("accepts exactly 262144 source UTF-16 units and rejects the next unit", () => {
	const overhead = svg().length;
	const source = svg("a".repeat(262_144 - overhead));
	expect(parse(source).sourceCodeUnits).toBe(262_144);
	fails(svg("a".repeat(262_145 - overhead)), "resource-limit");
});

it("counts UTF-16 pairs rather than Unicode scalar counts against the source budget", () => {
	const body = "🙂".repeat(Math.floor((262_144 - svg().length) / 2));
	expect(parse(svg(body)).sourceCodeUnits).toBe(svg(body).length);
	fails(svg(`${body}🙂`), "resource-limit");
});

it("accepts 4096 nodes including the root and budgets misc nodes too", () => {
	const source = svg("<g/>".repeat(4095));
	expect(parse(source).nodes).toBe(4096);
	fails(svg("<g/>".repeat(4096)), "resource-limit");
	fails(`<!--extra-->${source}`, "resource-limit");
});

it("limits element depth to 64 independently of node count", () => {
	expect(parse(svg("<g>".repeat(63) + "</g>".repeat(63))).nodes).toBe(64);
	fails(svg("<g>".repeat(64) + "</g>".repeat(64)), "resource-limit");
});

it("counts namespace declarations in the 128 attributes per element budget", () => {
	const attributes = Array.from(
		{ length: 127 },
		(_, index) => `a${index}=""`,
	).join(" ");
	expect(parse(svg("", attributes)).root.attributes).toHaveLength(128);
	fails(svg("", `${attributes} extra=""`), "resource-limit");
});

it("bounds names to exactly 1024 UTF-16 units", () => {
	const name = "n".repeat(1024);
	expect(element(parse(svg(`<${name}/>`)).root.children[0]).name).toBe(name);
	fails(svg(`<${name}n/>`), "resource-limit");
	const unicode = "𐀀".repeat(512);
	expect(element(parse(svg(`<${unicode}/>`)).root.children[0]).name).toBe(
		unicode,
	);
	fails(svg(`<${unicode}n/>`), "resource-limit");
});

it("propagates the caller charge error unchanged before decode and during parser work", () => {
	const reason = new Error("Caller work budget exhausted");
	const bytes = encoder.encode(svg(`<g xmlns:p="urn:p" p:id="x">&amp;</g>`));
	for (const failAt of [1, 2, 3, 12, 60]) {
		let calls = 0;
		let caught: unknown;
		try {
			parseSvgImageXml(bytes, () => {
				if (++calls === failAt) throw reason;
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(reason);
		expect(calls).toBe(failAt);
	}
});

it("charges finite bounded linear work for text, references and nested namespace growth", () => {
	for (const source of [
		svg("&amp;".repeat(10_000)),
		svg("plain".repeat(10_000)),
		svg(
			Array.from(
				{ length: 63 },
				(_, index) => `<g xmlns:p${index}="urn:${index}">`,
			).join("") + "</g>".repeat(63),
		),
	]) {
		let work = 0;
		parseSvgImageXml(encoder.encode(source), (amount) => {
			expect(Number.isSafeInteger(amount)).toBe(true);
			expect(amount).toBeGreaterThanOrEqual(0);
			work += amount;
		});
		expect(work).toBeGreaterThan(source.length);
		expect(work).toBeLessThan(source.length * 100 + 1000);
	}
});

it.each([null, undefined, "<svg/>", [], new ArrayBuffer(8)])(
	"rejects invalid byte input %j",
	(input) => {
		expect(() =>
			parseSvgImageXml(input as unknown as Uint8Array, () => {}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([null, undefined, 1, {}])(
	"rejects invalid work callback %j",
	(charge) => {
		expect(() =>
			parseSvgImageXml(
				encoder.encode(svg()),
				charge as (amount: number) => void,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);
