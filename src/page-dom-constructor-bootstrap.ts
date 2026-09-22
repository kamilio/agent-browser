export const pageDomConstructorBootstrapGlobal = "__agentBrowserDomHasInstance";
export const pageDomParserBootstrapGlobal = "__agentBrowserParseHtmlDocument";

// Host-backed nodes retain their capability identity. These constructors provide
// interface branding and selected methods; full prototype tables remain incomplete.
export const pageDomConstructorBootstrapSource = `
if (typeof __agentBrowserDomHasInstance === "function") {
	const hasInstance = __agentBrowserDomHasInstance;
	function install(name, Parent) {
		const Interface = Parent === null
			? class { constructor() { throw new TypeError("Illegal constructor"); } }
			: class extends Parent {};
		Object.defineProperty(Interface, "name", {value: name, configurable: true});
		Object.defineProperty(Interface, Symbol.hasInstance, {value: function(value) {
			try {
				if (this !== Interface) return Function.prototype[Symbol.hasInstance].call(this, value);
				return hasInstance(value, name);
			}
			catch (error) {
				if (error instanceof TypeError && (/^Unsupported sandbox value|^Guest prototype links/.test(error.message) || error.message === "Live host object descriptors are not supported.")) return false;
				throw error;
			}
		}});
		Object.defineProperty(Interface.prototype, Symbol.toStringTag, {value: name, configurable: true});
		Object.defineProperty(globalThis, name, {value: Interface, writable: true, configurable: true});
		return Interface;
	}
	const Node = install("Node", null);
	const Element = install("Element", Node);
	const HTMLElement = install("HTMLElement", Element);
	install("HTMLFormElement", HTMLElement);
	install("NamedNodeMap", null);
	install("SVGElement", Element);
	install("Document", Node);
	install("DocumentFragment", Node);
	install("DocumentType", Node);
	install("NodeIterator", null);
	const NodeFilter = install("NodeFilter", null);
	for (const [name, value] of [["FILTER_ACCEPT",1],["FILTER_REJECT",2],["FILTER_SKIP",3],["SHOW_ALL",4294967295],["SHOW_ELEMENT",1],["SHOW_ATTRIBUTE",2],["SHOW_TEXT",4],["SHOW_CDATA_SECTION",8],["SHOW_ENTITY_REFERENCE",16],["SHOW_ENTITY",32],["SHOW_PROCESSING_INSTRUCTION",64],["SHOW_COMMENT",128],["SHOW_DOCUMENT",256],["SHOW_DOCUMENT_TYPE",512],["SHOW_DOCUMENT_FRAGMENT",1024],["SHOW_NOTATION",2048]]) {
		Object.defineProperty(NodeFilter, name, {value, enumerable:true});
		Object.defineProperty(NodeFilter.prototype, name, {value, enumerable:true});
	}
	const CharacterData = install("CharacterData", Node);
	install("Text", CharacterData);
	install("Comment", CharacterData);
	if (typeof __agentBrowserDomMethods === "function") {
		const port = __agentBrowserDomMethods();
		const invoke = port.invoke;
		for (const [Interface, name] of [[Document, "getElementsByTagName"], [Element, "getElementsByTagName"], [Document, "createNodeIterator"], [Node, "cloneNode"]]) {
			const key = Interface.name + "." + name;
			const method = function(...args) { return invoke(this, key, ...args); };
			port.publish(key, method);
			Object.defineProperty(Interface.prototype, name, {value: method, writable:true, configurable:true});
		}
		for (const name of ["parentNode", "childNodes", "nextSibling"]) {
			const key = "Node." + name;
			const getter = function() { return invoke(this, key); };
			port.publish(key, getter);
			Object.defineProperty(Node.prototype, name, {get: getter, enumerable:true, configurable:true});
		}
	}
	for (const [name, value] of [["ELEMENT_NODE", 1], ["TEXT_NODE", 3], ["COMMENT_NODE", 8], ["DOCUMENT_NODE", 9], ["DOCUMENT_TYPE_NODE", 10], ["DOCUMENT_FRAGMENT_NODE", 11]]) {
		Object.defineProperty(Node, name, {value, enumerable: true});
		Object.defineProperty(Node.prototype, name, {value, enumerable: true});
	}
}
if (typeof __agentBrowserParseHtmlDocument === "function") {
	const parse = __agentBrowserParseHtmlDocument;
	const parsers = new WeakSet();
	const addParser = parsers.add.bind(parsers);
	const hasParser = parsers.has.bind(parsers);
	const domString = String;
	class DOMParser {
		constructor() { addParser(this); }
		parseFromString(input, type) {
			if (!hasParser(this)) throw new TypeError("parseFromString requires a DOMParser");
			if (arguments.length < 2) throw new TypeError("parseFromString requires two arguments");
			if (typeof input === "symbol") throw new TypeError("Invalid DOMParser input");
			const source = domString(input);
			if (typeof type === "symbol") throw new TypeError("Invalid DOMParser MIME type");
			const mime = domString(type);
			if (mime !== "text/html" && mime !== "text/xml" && mime !== "application/xml" && mime !== "application/xhtml+xml" && mime !== "image/svg+xml")
				throw new TypeError("Invalid DOMParser MIME type");
			return parse(source, mime);
		}
	}
	Object.defineProperty(DOMParser.prototype, Symbol.toStringTag, {value: "DOMParser", configurable: true});
	Object.defineProperty(globalThis, "DOMParser", {value: DOMParser, writable: true, configurable: true});
}
void 0;
`;
