export const htmlNamespace = "http://www.w3.org/1999/xhtml";
export const svgNamespace = "http://www.w3.org/2000/svg";
export const mathmlNamespace = "http://www.w3.org/1998/Math/MathML";
export const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
export const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";
export const xlinkNamespace = "http://www.w3.org/1999/xlink";

export function elementNamespace(node: { namespaceURI?: string }): string {
	return node.namespaceURI ?? htmlNamespace;
}

export function isHtmlElement(
	node: { kind?: string; tagName: string; namespaceURI?: string },
	tagName?: string,
): boolean {
	return (
		(node.kind === undefined || node.kind === "element") &&
		elementNamespace(node) === htmlNamespace &&
		(tagName === undefined || node.tagName === tagName)
	);
}

export interface AttributeNamespace {
	namespaceURI: string;
	prefix: string | null;
	localName: string;
}

export function foreignAttributeNamespace(
	name: string,
): AttributeNamespace | undefined {
	if (name === "xmlns")
		return { namespaceURI: xmlnsNamespace, prefix: null, localName: "xmlns" };
	const separator = name.indexOf(":");
	if (separator < 0) return undefined;
	const prefix = name.slice(0, separator);
	const localName = name.slice(separator + 1);
	if (prefix === "xml" && ["base", "lang", "space"].includes(localName))
		return { namespaceURI: xmlNamespace, prefix, localName };
	if (prefix === "xmlns" && localName === "xlink")
		return { namespaceURI: xmlnsNamespace, prefix, localName };
	if (
		prefix === "xlink" &&
		["actuate", "arcrole", "href", "role", "show", "title", "type"].includes(
			localName,
		)
	)
		return { namespaceURI: xlinkNamespace, prefix, localName };
	return undefined;
}
