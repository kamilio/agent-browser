import { AgentBrowserError } from "./errors.js";

export const svgImageXmlLimits = Object.freeze({
	maxInputBytes: 1_048_576,
	maxSourceCodeUnits: 262_144,
	maxNodes: 4096,
	maxElementDepth: 64,
	maxAttributesPerElement: 128,
	maxNameCodeUnits: 1024,
});

export interface SvgXmlAttribute {
	readonly name: string;
	readonly localName: string;
	readonly namespaceURI: string | null;
	readonly value: string;
}
export interface SvgXmlElement {
	readonly kind: "element";
	readonly name: string;
	readonly localName: string;
	readonly namespaceURI: string | null;
	readonly attributes: readonly SvgXmlAttribute[];
	readonly children: readonly SvgXmlNode[];
}
export type SvgXmlNode =
	| SvgXmlElement
	| Readonly<{ kind: "text" | "comment"; data: string }>
	| Readonly<{ kind: "processing-instruction"; target: string; data: string }>;
export interface SvgXmlDocument {
	readonly root: SvgXmlElement;
	readonly prolog: readonly SvgXmlNode[];
	readonly epilog: readonly SvgXmlNode[];
	readonly sourceCodeUnits: number;
	readonly nodes: number;
	readonly doctype?: Readonly<{
		name: string;
		publicId?: string;
		systemId?: string;
	}>;
}

const svgNamespace = "http://www.w3.org/2000/svg";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";

function malformed(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}
function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", message);
}
function limit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}
function xmlCharacter(code: number) {
	return (
		code === 9 ||
		code === 10 ||
		code === 13 ||
		(code >= 0x20 && code <= 0xd7ff) ||
		(code >= 0xe000 && code <= 0xfffd) ||
		(code >= 0x10000 && code <= 0x10ffff)
	);
}
function space(character: string | undefined) {
	return (
		character === " " ||
		character === "\t" ||
		character === "\n" ||
		character === "\r"
	);
}
function nameStart(code: number) {
	return (
		code === 58 ||
		code === 95 ||
		(code >= 65 && code <= 90) ||
		(code >= 97 && code <= 122) ||
		(code >= 0xc0 && code <= 0xd6) ||
		(code >= 0xd8 && code <= 0xf6) ||
		(code >= 0xf8 && code <= 0x2ff) ||
		(code >= 0x370 && code <= 0x37d) ||
		(code >= 0x37f && code <= 0x1fff) ||
		(code >= 0x200c && code <= 0x200d) ||
		(code >= 0x2070 && code <= 0x218f) ||
		(code >= 0x2c00 && code <= 0x2fef) ||
		(code >= 0x3001 && code <= 0xd7ff) ||
		(code >= 0xf900 && code <= 0xfdcf) ||
		(code >= 0xfdf0 && code <= 0xfffd) ||
		(code >= 0x10000 && code <= 0xeffff)
	);
}
function nameCharacter(code: number) {
	return (
		nameStart(code) ||
		code === 45 ||
		code === 46 ||
		(code >= 48 && code <= 57) ||
		code === 0xb7 ||
		(code >= 0x300 && code <= 0x36f) ||
		(code >= 0x203f && code <= 0x2040)
	);
}
interface QualifiedName {
	name: string;
	prefix: string | null;
	localName: string;
}
interface RawAttribute extends QualifiedName {
	value: string;
}

class SvgXmlParser {
	private position = 0;
	private nodes = 0;
	private standalone = false;
	private doctype?: SvgXmlDocument["doctype"];
	private readonly namespaces: Map<string, string>;

	constructor(
		private readonly source: string,
		private readonly sourceCodeUnits: number,
		private readonly charge: (amount: number) => void,
	) {
		charge(4);
		this.namespaces = new Map([["xml", xmlNamespace]]);
	}

	parse(): Readonly<SvgXmlDocument> {
		this.charge(3);
		const prolog: SvgXmlNode[] = [];
		const epilog: SvgXmlNode[] = [];
		if (this.at("<?xml") && space(this.source[this.position + 5]))
			this.declaration();
		this.misc(prolog, true);
		if (!this.at("<") || this.at("</") || this.at("<!") || this.at("<?"))
			malformed("Missing XML document element");
		const root = this.element(1);
		if (root.localName !== "svg" || root.namespaceURI !== svgNamespace)
			malformed("SVG XML requires an SVG namespace svg root");
		this.misc(epilog, false);
		if (this.position !== this.source.length)
			malformed("Content after XML document element");
		this.charge(prolog.length + epilog.length + 8);
		return Object.freeze({
			root,
			prolog: Object.freeze(prolog),
			epilog: Object.freeze(epilog),
			sourceCodeUnits: this.sourceCodeUnits,
			nodes: this.nodes,
			...(this.doctype ? { doctype: this.doctype } : {}),
		});
	}

	private at(token: string) {
		this.charge(token.length);
		return this.source.startsWith(token, this.position);
	}
	private step(amount = 1) {
		this.charge(amount);
		this.position += amount;
	}
	private expect(token: string) {
		if (!this.at(token)) malformed("Malformed XML delimiter");
		this.step(token.length);
	}
	private copy(start: number, end = this.position) {
		this.charge(end - start + 1);
		return this.source.slice(start, end);
	}
	private whitespace() {
		const start = this.position;
		while (space(this.source[this.position])) this.step();
		this.charge(1);
		return this.position - start;
	}
	private requiredSpace() {
		if (!this.whitespace()) malformed("XML whitespace required");
	}
	private reserveNode() {
		if (this.nodes >= svgImageXmlLimits.maxNodes)
			limit("SVG XML node limit exceeded");
		this.charge(8);
		this.nodes++;
	}
	private dataNode(kind: "text" | "comment", data: string): SvgXmlNode {
		this.reserveNode();
		return Object.freeze({ kind, data });
	}
	private name(): string {
		const start = this.position;
		this.charge(1);
		if (!nameStart(this.source.codePointAt(this.position) ?? -1))
			malformed("Invalid XML name");
		while (this.position < this.source.length) {
			this.charge(1);
			const code = this.source.codePointAt(this.position) as number;
			if (!nameCharacter(code)) break;
			const units = code > 0xffff ? 2 : 1;
			if (this.position - start + units > svgImageXmlLimits.maxNameCodeUnits)
				limit("SVG XML name limit exceeded");
			this.step(units);
		}
		return this.copy(start);
	}
	private qualified(name: string): QualifiedName {
		this.charge(name.length * 4 + 4);
		const colon = name.indexOf(":");
		if (colon < 0) return { name, prefix: null, localName: name };
		const localName = name.slice(colon + 1);
		if (
			colon === 0 ||
			name.indexOf(":", colon + 1) >= 0 ||
			!nameStart(localName.codePointAt(0) ?? -1)
		)
			malformed("Invalid XML qualified name");
		return { name, prefix: name.slice(0, colon), localName };
	}
	private literal(): string {
		const quote = this.source[this.position];
		if (quote !== String.fromCharCode(34) && quote !== String.fromCharCode(39))
			malformed("XML literal must be quoted");
		this.step();
		const start = this.position;
		while (
			this.position < this.source.length &&
			this.source[this.position] !== quote
		)
			this.step();
		const value = this.copy(start);
		this.expect(quote);
		return value;
	}
	private equals() {
		this.whitespace();
		this.expect("=");
		this.whitespace();
	}

	private declaration() {
		this.expect("<?xml");
		this.requiredSpace();
		let stage = 0;
		for (;;) {
			const name = this.name();
			this.equals();
			const value = this.literal();
			this.charge(value.length + 1);
			if (stage === 0 && name === "version") {
				if (value !== "1.0") {
					if (value.length < 3 || value[1] !== "." || value[0] !== "1")
						malformed("Invalid XML version declaration");
					for (let index = 2; index < value.length; index++)
						if (value[index] < "0" || value[index] > "9")
							malformed("Invalid XML version declaration");
					unsupported("Only XML 1.0 is supported");
				}
				stage = 1;
			} else if (stage === 1 && name === "encoding") {
				for (let index = 0; index < value.length; index++) {
					const code = value.charCodeAt(index);
					const letter =
						(code >= 65 && code <= 90) || (code >= 97 && code <= 122);
					if (
						!letter &&
						(index === 0 ||
							!(
								(code >= 48 && code <= 57) ||
								code === 45 ||
								code === 46 ||
								code === 95
							))
					)
						malformed("Invalid XML encoding declaration");
				}
				if (!value) malformed("Empty XML encoding declaration");
				if (value.toLowerCase() !== "utf-8")
					unsupported("Only UTF-8 XML is supported");
				stage = 2;
			} else if ((stage === 1 || stage === 2) && name === "standalone") {
				if (value !== "yes" && value !== "no")
					malformed("Invalid XML standalone declaration");
				this.standalone = value === "yes";
				stage = 3;
			} else malformed("Invalid XML declaration ordering");
			const separation = this.whitespace();
			if (this.at("?>")) {
				this.step(2);
				return;
			}
			if (!separation) malformed("XML declaration fields require whitespace");
		}
	}

	private misc(output: SvgXmlNode[], allowDoctype: boolean) {
		for (;;) {
			const start = this.position;
			if (this.whitespace()) {
				this.charge(1);
				output.push(this.dataNode("text", this.copy(start)));
			} else if (this.at("<!--")) {
				this.charge(1);
				output.push(this.comment());
			} else if (this.at("<?")) {
				this.charge(1);
				output.push(this.processingInstruction());
			} else if (allowDoctype && this.at("<!DOCTYPE")) {
				if (this.doctype) malformed("Duplicate XML doctype");
				this.parseDoctype();
			} else return;
		}
	}
	private parseDoctype() {
		this.expect("<!DOCTYPE");
		this.requiredSpace();
		const name = this.qualified(this.name()).name;
		const separation = this.whitespace();
		let publicId: string | undefined;
		let systemId: string | undefined;
		if (this.at("SYSTEM") || this.at("PUBLIC")) {
			if (!separation)
				malformed("Doctype external identifier requires whitespace");
			const isPublic = this.at("PUBLIC");
			this.step(6);
			this.requiredSpace();
			if (isPublic) {
				const literal = this.literal();
				this.charge(literal.length * 40 + 1);
				const parts: string[] = [];
				let pendingSpace = false;
				for (const character of literal) {
					const code = character.charCodeAt(0);
					if (character === " " || character === "\n") {
						pendingSpace = parts.length > 0;
						continue;
					}
					if (
						!(
							(code >= 65 && code <= 90) ||
							(code >= 97 && code <= 122) ||
							(code >= 48 && code <= 57) ||
							"-'()+,./:=?;!*#@$_%".includes(character)
						)
					)
						malformed("Invalid XML public identifier");
					if (pendingSpace) parts.push(" ");
					pendingSpace = false;
					parts.push(character);
				}
				publicId = parts.join("");
				this.requiredSpace();
			}
			systemId = this.literal();
			this.charge(systemId.length);
			if (systemId.includes("#"))
				malformed("XML system identifier cannot contain a fragment");
			this.whitespace();
		}
		if (this.at("[")) unsupported("XML internal DTD subsets are not supported");
		this.expect(">");
		this.charge(4);
		this.doctype = Object.freeze({
			name,
			...(publicId === undefined ? {} : { publicId }),
			...(systemId === undefined ? {} : { systemId }),
		});
	}
	private comment(): SvgXmlNode {
		this.expect("<!--");
		const start = this.position;
		while (this.position < this.source.length && !this.at("-->")) {
			if (this.at("--")) malformed("Double hyphen in XML comment");
			this.step();
		}
		const data = this.copy(start);
		this.expect("-->");
		return this.dataNode("comment", data);
	}
	private processingInstruction(): SvgXmlNode {
		this.expect("<?");
		const target = this.name();
		this.charge(target.length * 2);
		if (target.includes(":"))
			malformed("XML processing instruction target must be an NCName");
		if (target.toLowerCase() === "xml")
			malformed("Reserved XML processing instruction target");
		let data = "";
		if (!this.at("?>")) {
			this.requiredSpace();
			const start = this.position;
			while (this.position < this.source.length && !this.at("?>")) this.step();
			data = this.copy(start);
		}
		this.expect("?>");
		this.reserveNode();
		return Object.freeze({ kind: "processing-instruction", target, data });
	}
	private cdata(): SvgXmlNode {
		this.expect("<![CDATA[");
		const start = this.position;
		while (this.position < this.source.length && !this.at("]]>")) this.step();
		const data = this.copy(start);
		this.expect("]]>");
		return this.dataNode("text", data);
	}
	private reference(): string {
		this.expect("&");
		if (this.at("#")) {
			this.step();
			const hexadecimal = this.at("x");
			if (hexadecimal) this.step();
			const base = hexadecimal ? 16 : 10;
			let value = 0;
			let digits = 0;
			while (this.position < this.source.length && !this.at(";")) {
				this.charge(1);
				const code = this.source.charCodeAt(this.position);
				const digit =
					code >= 48 && code <= 57
						? code - 48
						: hexadecimal && code >= 65 && code <= 70
							? code - 55
							: hexadecimal && code >= 97 && code <= 102
								? code - 87
								: -1;
				if (digit < 0 || digit >= base)
					malformed("Invalid XML character reference");
				value = value * base + digit;
				if (value > 0x10ffff) malformed("XML character reference out of range");
				digits++;
				this.step();
			}
			if (!digits || !xmlCharacter(value))
				malformed("Invalid XML character reference scalar");
			this.expect(";");
			this.charge(2);
			return String.fromCodePoint(value);
		}
		const name = this.name();
		this.expect(";");
		this.charge(name.length);
		if (name.includes(":")) malformed("XML entity name must be an NCName");
		if (name === "amp") return "&";
		if (name === "lt") return "<";
		if (name === "gt") return ">";
		if (name === "quot") return String.fromCharCode(34);
		if (name === "apos") return String.fromCharCode(39);
		if (this.doctype?.systemId !== undefined && !this.standalone)
			unsupported(
				"Entity declarations in unread external DTDs are not supported",
			);
		malformed("Undeclared XML entity");
	}
	private value(quote?: string): string {
		this.charge(1);
		const parts: string[] = [];
		const begin = this.position;
		let start = this.position;
		while (this.position < this.source.length) {
			this.charge(1);
			const character = this.source[this.position];
			if (quote ? character === quote : character === "<") break;
			if (quote && character === "<")
				malformed("Literal less-than in XML attribute");
			if (!quote && this.at("]]>"))
				malformed("CDATA terminator in XML character data");
			if (
				character === "&" ||
				(quote && (character === "\t" || character === "\n"))
			) {
				this.charge(2);
				parts.push(this.copy(start));
				if (character === "&") parts.push(this.reference());
				else {
					this.step();
					parts.push(" ");
				}
				start = this.position;
			} else this.step();
		}
		this.charge((this.position - begin) * 2 + parts.length + 2);
		parts.push(this.copy(start));
		return parts.join("");
	}
	private binding(
		prefix: string,
		value: string,
		restore: [string, string | undefined][],
	) {
		this.charge(value.length + prefix.length + 6);
		if (
			prefix === "xmlns" ||
			value === xmlnsNamespace ||
			(prefix === "xml" ? value !== xmlNamespace : value === xmlNamespace) ||
			(prefix !== "" && value === "")
		)
			malformed("Reserved or empty XML namespace binding");
		restore.push([prefix, this.namespaces.get(prefix)]);
		this.namespaces.set(prefix, value);
	}
	private namespace(name: QualifiedName, attribute: boolean): string | null {
		this.charge(name.name.length + 1);
		if (attribute && (name.name === "xmlns" || name.prefix === "xmlns"))
			return xmlnsNamespace;
		if (name.prefix === null)
			return attribute ? null : this.namespaces.get("") || null;
		const uri = this.namespaces.get(name.prefix);
		if (!uri || name.prefix === "xmlns")
			malformed("Undeclared XML namespace prefix");
		return uri;
	}
	private element(depth: number): SvgXmlElement {
		if (depth > svgImageXmlLimits.maxElementDepth)
			limit("SVG XML element depth exceeded");
		this.reserveNode();
		this.expect("<");
		const name = this.qualified(this.name());
		this.charge(5);
		const raw: RawAttribute[] = [];
		const names = new Set<string>();
		const restore: [string, string | undefined][] = [];
		const attributes: SvgXmlAttribute[] = [];
		const children: SvgXmlNode[] = [];
		for (;;) {
			const separation = this.whitespace();
			if (this.at(">") || this.at("/>")) break;
			if (!separation) malformed("XML attributes require whitespace");
			if (raw.length >= svgImageXmlLimits.maxAttributesPerElement)
				limit("SVG XML attribute limit exceeded");
			const attribute = this.qualified(this.name());
			this.charge(attribute.name.length + 5);
			if (names.has(attribute.name)) malformed("Duplicate XML attribute name");
			names.add(attribute.name);
			this.equals();
			const quote = this.source[this.position];
			if (
				quote !== String.fromCharCode(34) &&
				quote !== String.fromCharCode(39)
			)
				malformed("XML attribute must be quoted");
			this.step();
			const value = this.value(quote);
			this.expect(quote);
			raw.push({ ...attribute, value });
		}
		for (const attribute of raw) {
			this.charge(1);
			if (attribute.name === "xmlns")
				this.binding("", attribute.value, restore);
			else if (attribute.prefix === "xmlns")
				this.binding(attribute.localName, attribute.value, restore);
		}
		const namespaceURI = this.namespace(name, false);
		this.charge(1);
		const expanded = new Map<string | null, Set<string>>();
		for (const attribute of raw) {
			const uri = this.namespace(attribute, true);
			this.charge(attribute.localName.length + 9);
			let locals = expanded.get(uri);
			if (!locals) {
				locals = new Set();
				expanded.set(uri, locals);
			}
			if (locals.has(attribute.localName))
				malformed("Duplicate expanded XML attribute name");
			locals.add(attribute.localName);
			attributes.push(
				Object.freeze({
					name: attribute.name,
					localName: attribute.localName,
					namespaceURI: uri,
					value: attribute.value,
				}),
			);
		}
		if (this.at("/>")) this.step(2);
		else {
			this.expect(">");
			for (;;) {
				if (this.position >= this.source.length)
					malformed("Unclosed XML element");
				if (this.at("</")) {
					this.step(2);
					const closing = this.name();
					this.charge(closing.length + name.name.length);
					if (closing !== name.name) malformed("Mismatched XML end tag");
					this.whitespace();
					this.expect(">");
					break;
				}
				this.charge(1);
				if (this.at("<!--")) children.push(this.comment());
				else if (this.at("<![CDATA[")) children.push(this.cdata());
				else if (this.at("<?")) children.push(this.processingInstruction());
				else if (this.at("<!")) malformed("Declaration inside XML element");
				else if (this.at("<")) children.push(this.element(depth + 1));
				else children.push(this.dataNode("text", this.value()));
			}
		}
		this.charge(restore.length * 2 + attributes.length + children.length + 8);
		for (let index = restore.length - 1; index >= 0; index--) {
			const [prefix, previous] = restore[index];
			if (previous === undefined) this.namespaces.delete(prefix);
			else this.namespaces.set(prefix, previous);
		}
		return Object.freeze({
			kind: "element",
			name: name.name,
			localName: name.localName,
			namespaceURI,
			attributes: Object.freeze(attributes),
			children: Object.freeze(children),
		});
	}
}

export function parseSvgImageXml(
	input: Uint8Array,
	charge: (amount: number) => void,
): Readonly<SvgXmlDocument> {
	if (!(input instanceof Uint8Array) || typeof charge !== "function")
		malformed("Invalid SVG XML parser input");
	if (input.byteLength > svgImageXmlLimits.maxInputBytes)
		limit("SVG XML input byte limit exceeded");
	charge(input.byteLength * 2 + 1);
	let decoded: string;
	try {
		decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			input,
		);
	} catch {
		malformed("Malformed UTF-8 XML input");
	}
	const start = decoded.charCodeAt(0) === 0xfeff ? 1 : 0;
	const sourceCodeUnits = decoded.length - start;
	if (sourceCodeUnits > svgImageXmlLimits.maxSourceCodeUnits)
		limit("SVG XML source code-unit limit exceeded");
	charge(sourceCodeUnits * 4 + 3);
	const parts: string[] = [];
	let segment = start;
	for (let index = start; index < decoded.length; ) {
		const code = decoded.codePointAt(index) as number;
		if (!xmlCharacter(code)) malformed("Invalid XML character");
		if (code === 13) {
			parts.push(decoded.slice(segment, index), "\n");
			index += decoded.charCodeAt(index + 1) === 10 ? 2 : 1;
			segment = index;
		} else index += code > 0xffff ? 2 : 1;
	}
	parts.push(decoded.slice(segment));
	return new SvgXmlParser(parts.join(""), sourceCodeUnits, charge).parse();
}
