export const pageDomConstructorBootstrapGlobal = "__agentBrowserDomHasInstance";

// Host-backed nodes retain their capability identity. These constructors provide
// interface branding; their prototypes do not yet supply the DOM method tables.
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
	install("HTMLElement", Element);
	install("SVGElement", Element);
	install("Document", Node);
	install("DocumentFragment", Node);
	install("DocumentType", Node);
	const CharacterData = install("CharacterData", Node);
	install("Text", CharacterData);
	install("Comment", CharacterData);
	for (const [name, value] of [["ELEMENT_NODE", 1], ["TEXT_NODE", 3], ["COMMENT_NODE", 8], ["DOCUMENT_NODE", 9], ["DOCUMENT_TYPE_NODE", 10], ["DOCUMENT_FRAGMENT_NODE", 11]]) {
		Object.defineProperty(Node, name, {value, enumerable: true});
		Object.defineProperty(Node.prototype, name, {value, enumerable: true});
	}
}
void 0;
`;
