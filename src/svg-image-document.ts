import { DocumentTree } from "./document.js";
import {
	foreignAttributeNamespace,
	svgNamespace,
	xlinkNamespace,
	xmlnsNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import {
	svgImageXmlLimits,
	type SvgXmlAttribute,
	type SvgXmlDocument,
	type SvgXmlNode,
} from "./svg-image-xml.js";

function malformed(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", message);
}

function limit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

class SvgImageDocumentBuilder {
	private nodes = 0;
	private sourceUnits = 0;
	private readonly seen = new Set<SvgXmlNode>();

	constructor(
		private readonly xml: Readonly<SvgXmlDocument>,
		private readonly tree: DocumentTree,
		private readonly charge: (amount: number) => void,
	) {}

	build(): number {
		this.list(this.xml.prolog);
		this.list(this.xml.epilog);
		if (
			this.xml.root?.kind !== "element" ||
			this.xml.root.localName !== "svg" ||
			this.xml.root.namespaceURI !== svgNamespace
		)
			malformed("SVG XML requires an SVG namespace svg root");
		for (let index = 0; index < this.xml.prolog.length; index++)
			this.project(this.xml.prolog[index], this.tree.root, 1, index, true);
		const root = this.project(
			this.xml.root,
			this.tree.root,
			1,
			this.xml.prolog.length,
		);
		for (let index = 0; index < this.xml.epilog.length; index++)
			this.project(
				this.xml.epilog[index],
				this.tree.root,
				1,
				this.xml.prolog.length + 1 + index,
				true,
			);
		if (this.nodes !== this.xml.nodes)
			malformed("SVG XML node count does not match the document");
		this.charge(2);
		return root;
	}

	private list(nodes: readonly SvgXmlNode[]) {
		if (!Array.isArray(nodes)) malformed("Invalid SVG XML node list");
		if (nodes.length > svgImageXmlLimits.maxNodes)
			limit("SVG XML document node limit exceeded");
	}

	private source(value: string) {
		if (typeof value !== "string") malformed("Invalid SVG XML string");
		if (value.length > this.xml.sourceCodeUnits - this.sourceUnits)
			limit("SVG XML document source limit exceeded");
		this.charge(value.length * 8 + 1);
		this.sourceUnits += value.length;
	}

	private name(value: {
		name: string;
		localName: string;
		namespaceURI: string | null;
	}) {
		if (typeof value.name !== "string" || typeof value.localName !== "string")
			malformed("Invalid SVG XML name");
		if (
			value.name.length > svgImageXmlLimits.maxNameCodeUnits ||
			value.localName.length > svgImageXmlLimits.maxNameCodeUnits
		)
			limit("SVG XML document name limit exceeded");
		this.source(value.name);
		this.charge(value.localName.length + 1);
		const colon = value.name.indexOf(":");
		if (
			!value.name ||
			!value.localName ||
			/[\s\0"'<>/=]/u.test(value.name) ||
			value.localName.includes(":") ||
			(colon < 0
				? value.name !== value.localName
				: colon === 0 || value.name.slice(colon + 1) !== value.localName)
		)
			malformed("Inconsistent SVG XML qualified name");
		if (
			value.namespaceURI !== null &&
			(typeof value.namespaceURI !== "string" || !value.namespaceURI)
		)
			malformed("Invalid SVG XML namespace");
		if (colon >= 0 && value.namespaceURI === null)
			malformed("SVG XML prefixed name lacks a namespace");
		return colon;
	}

	private attribute(attribute: SvgXmlAttribute): string {
		if (!attribute || typeof attribute !== "object")
			malformed("Invalid SVG XML attribute");
		const colon = this.name(attribute);
		this.source(attribute.value);
		if (
			attribute.namespaceURI !== null &&
			colon < 0 &&
			!(attribute.name === "xmlns" && attribute.namespaceURI === xmlnsNamespace)
		)
			malformed("Namespaced SVG XML attribute lacks a prefix");
		this.charge(attribute.localName.length + attribute.name.length + 8);
		const canonical =
			attribute.namespaceURI === xlinkNamespace &&
			["actuate", "arcrole", "href", "role", "show", "title", "type"].includes(
				attribute.localName,
			)
				? `xlink:${attribute.localName}`
				: attribute.name;
		const inferred = foreignAttributeNamespace(canonical);
		if (inferred && inferred.namespaceURI !== attribute.namespaceURI)
			unsupported(
				"SVG XML attribute namespace cannot be represented faithfully",
			);
		return canonical;
	}

	private project(
		node: SvgXmlNode,
		parent: number,
		depth: number,
		siblings: number,
		outside = false,
	): number {
		if (!node || typeof node !== "object") malformed("Invalid SVG XML node");
		if (this.nodes >= svgImageXmlLimits.maxNodes)
			limit("SVG XML document node limit exceeded");
		this.charge(8);
		if (this.seen.has(node)) malformed("Repeated SVG XML node");
		this.seen.add(node);
		this.nodes++;
		if (node.kind === "processing-instruction")
			unsupported("SVG XML processing instructions are not supported");
		if (node.kind === "element") {
			if (outside) malformed("SVG XML element outside the document root");
			if (depth > svgImageXmlLimits.maxElementDepth)
				limit("SVG XML document element depth exceeded");
			this.name(node);
			if (node.namespaceURI !== svgNamespace)
				unsupported("Non-SVG XML elements are not supported");
			if (!/^[a-z][a-z0-9_-]*$/i.test(node.localName))
				unsupported(
					"SVG XML element name cannot be represented by DocumentTree",
				);
			this.list(node.children);
			if (!Array.isArray(node.attributes))
				malformed("Invalid SVG XML attributes");
			if (node.attributes.length > svgImageXmlLimits.maxAttributesPerElement)
				limit("SVG XML document attribute limit exceeded");
			this.charge(4);
			const attributes: Record<string, string> = Object.create(null);
			let units = node.localName.length;
			for (const attribute of node.attributes) {
				const name = this.attribute(attribute);
				if (Object.hasOwn(attributes, name))
					unsupported("SVG XML attribute canonical-name collision");
				this.charge(name.length + 2);
				attributes[name] = attribute.value;
				units += name.length + attribute.value.length;
			}
			this.charge(units * 8 + node.attributes.length * 16 + 32);
			const id = this.tree.createParserElement(
				node.localName,
				attributes,
				svgNamespace,
			);
			this.charge(32 * (depth + siblings + 1));
			this.tree.append(parent, id);
			for (let index = 0; index < node.children.length; index++)
				this.project(node.children[index], id, depth + 1, index);
			return id;
		}
		if (node.kind !== "text" && node.kind !== "comment")
			malformed("Invalid SVG XML node kind");
		this.source(node.data);
		if (outside && node.kind === "text" && /[^\t\r\n ]/.test(node.data))
			malformed("Non-whitespace SVG XML text outside the document root");
		this.charge(node.data.length + 8);
		const id =
			node.kind === "text"
				? this.tree.createText(node.data)
				: this.tree.createComment(node.data);
		this.charge(32 * (depth + siblings + 1));
		this.tree.append(parent, id);
		return id;
	}
}

export function createSvgImageDocument(
	xml: Readonly<SvgXmlDocument>,
	charge: (amount: number) => void,
): { tree: DocumentTree; root: number } {
	if (!xml || typeof xml !== "object" || typeof charge !== "function")
		malformed("Invalid SVG XML document adapter input");
	for (const value of [xml.nodes, xml.sourceCodeUnits])
		if (!Number.isSafeInteger(value) || value < 1)
			malformed("Invalid SVG XML document bounds");
	if (xml.nodes > svgImageXmlLimits.maxNodes)
		limit("SVG XML document node limit exceeded");
	if (xml.sourceCodeUnits > svgImageXmlLimits.maxSourceCodeUnits)
		limit("SVG XML document source limit exceeded");
	charge(32);
	const tree = new DocumentTree("about:blank", {
		maxNodes: svgImageXmlLimits.maxNodes + 1,
		maxDepth: svgImageXmlLimits.maxElementDepth + 1,
		maxTextCodeUnits: svgImageXmlLimits.maxSourceCodeUnits * 2,
		maxChanges: 1,
	});
	try {
		const root = new SvgImageDocumentBuilder(xml, tree, charge).build();
		return { tree, root };
	} catch (error) {
		try {
			tree.close();
		} finally {
			throw error;
		}
	}
}
