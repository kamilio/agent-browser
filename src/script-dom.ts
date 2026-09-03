import { controlChecked, controlValue, inputType } from "./controls.js";
import { documentScriptState } from "./document-script-state.js";
import {
	documentBody,
	documentElement,
	documentHead,
	setDocumentBody,
} from "./document-elements.js";
import { documentImages } from "./document-images.js";
import { NodeRelations } from "./node-relations.js";
import { documentBaseUrl } from "./document-url.js";
import {
	documentTitle,
	setDocumentTitle,
	titleElementText,
} from "./document-title.js";
import { writeDocument } from "./document-write.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { ScriptDatasets } from "./script-dataset.js";
import { ElementTraversal } from "./element-traversal.js";
import {
	type DocumentElementSizes,
	documentElementSizes,
	elementSizeProperties,
} from "./element-sizes.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import { serializeHtml } from "./html-serialization.js";
import { sanitizeInputValue } from "./input-values.js";
import { InlineStyles } from "./inline-styles.js";
import { ComputedStyles } from "./computed-styles.js";
import { ScriptAttributes } from "./script-attributes.js";
import { ScriptClassLists } from "./script-class-list.js";
import { scriptCharacterData } from "./script-character-data.js";
import { ScriptCollections } from "./script-collections.js";
import {
	ScriptEventBindings,
	type ScriptEventOptions,
} from "./script-events.js";
import { scriptFormMethods, scriptFormProperties } from "./script-form.js";
import { ScriptValidity } from "./script-validity.js";
import { supportsConstraintValidation } from "./form-validation.js";
import { ScriptGeometry } from "./script-geometry.js";
import type { ScriptLocation } from "./script-location.js";
import { scriptMutationMethods } from "./script-mutations.js";
import { scriptSelectBindings } from "./script-select.js";
import type { ScriptStorage } from "./script-storage.js";
import { scriptUrlProperties } from "./script-urls.js";
import { DocumentQueries } from "./selectors.js";

export interface ScriptHostObjectDefinition {
	named?: {
		maxKeys: number;
		maxKeyCodeUnits: number;
		enumerable?: boolean;
		keys: () => readonly string[];
		get: (name: string) => unknown;
		set?: (name: string, value: unknown) => void;
		delete?: (name: string) => boolean;
	};
	indexed?: {
		maxLength: number;
		length: () => number;
		get: (index: number) => unknown;
	};
	properties?: Record<
		string,
		{ get: () => unknown; set?: (value: unknown) => void }
	>;
	methods?: Record<string, (...args: readonly unknown[]) => unknown>;
}

export interface ScriptHostObjectFactory {
	createHostObject(definition: ScriptHostObjectDefinition): object;
}

export class ScriptDom {
	readonly document: object;
	readonly eventBindings?: ScriptEventBindings;
	private readonly queries: DocumentQueries;
	private readonly collections: ScriptCollections;
	private readonly inlineStyles: InlineStyles;
	private readonly attributes: ScriptAttributes;
	private readonly datasets: ScriptDatasets;
	private readonly elementTraversal: ElementTraversal;
	private readonly relations: NodeRelations;
	private readonly classLists: ScriptClassLists;
	private readonly validity: ScriptValidity;
	private readonly geometry: ScriptGeometry;
	private readonly elementSizes: DocumentElementSizes;
	private readonly computedStyles: ComputedStyles;
	private readonly capabilities = new Map<number, object>();
	private identities = new WeakMap<object, number>();
	private closed = false;
	private unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		events?: ScriptEventOptions,
		private readonly location?: ScriptLocation,
		private readonly storage?: ScriptStorage,
	) {
		if (typeof factory?.createHostObject !== "function")
			throw new AgentBrowserError(
				"unsupported",
				"SafeJS live host objects are required",
			);
		this.queries = new DocumentQueries(tree);
		this.inlineStyles = new InlineStyles(tree, factory);
		this.classLists = new ScriptClassLists(tree, factory);
		this.validity = new ScriptValidity(tree, factory);
		this.datasets = new ScriptDatasets(tree, factory);
		this.elementTraversal = new ElementTraversal(tree);
		this.geometry = new ScriptGeometry(tree, factory);
		this.elementSizes = documentElementSizes(tree);
		this.computedStyles = new ComputedStyles(tree, factory);
		this.relations = new NodeRelations(tree);
		this.attributes = new ScriptAttributes(
			tree,
			factory,
			(id) => this.node(id),
			this.relations,
		);
		this.collections = new ScriptCollections(tree, factory, (id) =>
			this.node(id),
		);
		this.unregisterClose = tree.onClose(() => this.close());
		try {
			if (events)
				this.eventBindings = new ScriptEventBindings(
					tree,
					factory,
					(target) => this.node(target),
					events,
				);
			this.document = this.node(tree.root);
		} catch (error) {
			this.close();
			throw error;
		}
	}

	node(id: number): object {
		const initial = this.read(id);
		const existing = this.capabilities.get(id);
		if (existing) return existing;
		const definition: Required<
			Pick<ScriptHostObjectDefinition, "properties" | "methods">
		> = {
			properties: {
				baseURI: {
					get: () => {
						this.read(id);
						return documentBaseUrl(this.tree);
					},
				},
				nodeType: {
					get: () =>
						({ document: 9, fragment: 11, element: 1, text: 3, comment: 8 })[
							this.read(id).kind
						],
				},
				nodeName: {
					get: () =>
						this.read(id).kind === "element"
							? this.read(id).tagName.toUpperCase()
							: this.read(id).kind === "fragment"
								? "#document-fragment"
								: `#${this.read(id).kind}`,
				},
				ownerDocument: {
					get: () =>
						this.read(id).kind === "document"
							? null
							: this.node(this.tree.root),
				},
				parentNode: { get: () => this.optional(this.read(id).parent) },
				parentElement: {
					get: () => {
						const parent = this.read(id).parent;
						return parent !== null && this.read(parent).kind === "element"
							? this.node(parent)
							: null;
					},
				},
				firstChild: { get: () => this.optional(this.read(id).children[0]) },
				lastChild: { get: () => this.optional(this.read(id).children.at(-1)) },
				nextSibling: { get: () => this.sibling(id, 1) },
				previousSibling: { get: () => this.sibling(id, -1) },
				childNodes: {
					get: () => this.read(id).children.map((child) => this.node(child)),
				},
				isConnected: {
					get: () => {
						this.read(id);
						return this.tree.isConnected(id);
					},
				},
				textContent: {
					get: () => {
						const node = this.read(id);
						return node.kind === "document"
							? null
							: node.kind === "element" || node.kind === "fragment"
								? this.tree.textContent(id)
								: node.data;
					},
					set: (value) => {
						this.read(id);
						this.tree.setTextContent(
							id,
							value === null ? "" : domString(value),
						);
					},
				},
				nodeValue: {
					get: () => {
						const node = this.read(id);
						return node.kind === "text" || node.kind === "comment"
							? node.data
							: null;
					},
					set: (value) => {
						const node = this.read(id);
						if (node.kind === "text" || node.kind === "comment")
							this.tree.setData(id, value === null ? "" : domString(value));
					},
				},
			},
			methods: {
				getRootNode: () => {
					this.read(id);
					return this.node(this.tree.rootOf(id));
				},
				cloneNode: (deep: unknown = false) => {
					this.read(id);
					return this.node(this.tree.clone(id, Boolean(deep)));
				},
				...scriptMutationMethods(this.tree, id, {
					read: (target) => this.read(target),
					identify: (value) => this.identify(value),
					node: (target) => this.node(target),
					string: domString,
				}),
				hasChildNodes: () => this.read(id).children.length > 0,
			},
		};
		if (initial.kind === "element" && initial.tagName === "title")
			definition.properties.text = {
				get: () => {
					this.read(id);
					return titleElementText(this.tree, id);
				},
				set: (value) => {
					this.read(id);
					this.tree.setTextContent(id, domString(value));
				},
			};
		const relations = this.relations.definition(id);
		Object.assign(definition.properties, relations.properties);
		Object.assign(definition.methods, relations.methods);
		const characterData = scriptCharacterData(this.tree, id, {
			read: (target) => this.read(target),
			node: (target) => this.node(target),
			string: domString,
		});
		Object.assign(definition.properties, characterData.properties);
		Object.assign(definition.methods, characterData.methods);
		const eventBindings = this.eventBindings;
		if (eventBindings)
			Object.assign(definition.methods, {
				addEventListener: (
					type: unknown,
					callback: unknown,
					options: unknown,
				) => {
					this.read(id);
					eventBindings.add(id, domString(type), callback, options);
				},
				removeEventListener: (
					type: unknown,
					callback: unknown,
					options: unknown,
				) => {
					this.read(id);
					eventBindings.remove(id, domString(type), callback, options);
				},
			});
		if (["document", "fragment", "element"].includes(initial.kind)) {
			for (const [name, method] of [
				["firstElementChild", "first"],
				["lastElementChild", "last"],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.optional(this.elementTraversal[method](id));
					},
				};
			definition.properties.childElementCount = {
				get: () => {
					this.read(id);
					return this.elementTraversal.count(id);
				},
			};
			Object.assign(definition.properties, {
				children: {
					get: () => {
						this.read(id);
						return this.collections.get(id, "children");
					},
				},
			});
			Object.assign(definition.methods, {
				querySelector: (selector: unknown) => {
					this.read(id);
					return this.optional(
						this.queries.querySelector(domString(selector), id),
					);
				},
				querySelectorAll: (selector: unknown) => {
					this.read(id);
					return this.queries
						.querySelectorAll(domString(selector), id)
						.map((child) => this.node(child));
				},
			});
		}
		if (["element", "text", "comment"].includes(initial.kind))
			for (const [name, method] of [
				["previousElementSibling", "previous"],
				["nextElementSibling", "next"],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.optional(this.elementTraversal[method](id));
					},
				};
		if (initial.kind === "document" || initial.kind === "element") {
			for (const [name, kind] of [
				["getElementsByTagName", "tag"],
				["getElementsByClassName", "class"],
			] as const)
				definition.methods[name] = (...args) => {
					this.read(id);
					if (args.length === 0)
						throw new AgentBrowserError(
							"invalid-input",
							"Collection query requires an argument",
						);
					return this.collections.get(id, kind, domString(args[0]));
				};
		}
		if (initial.kind === "document" || initial.kind === "fragment") {
			definition.methods.getElementById = (value: unknown) => {
				this.read(id);
				const wanted = domString(value);
				if (wanted === "") return null;
				for (const { node } of this.tree.walk(id))
					if (node.kind === "element" && node.attributes.id === wanted)
						return this.node(node.id);
				return null;
			};
		}
		if (initial.kind === "document") {
			definition.properties.title = {
				get: () => {
					this.read(id);
					return documentTitle(this.tree);
				},
				set: (value) => {
					this.read(id);
					setDocumentTitle(this.tree, domString(value));
				},
			};
			definition.properties.forms = {
				get: () => {
					this.read(id);
					return this.collections.get(id, "tag", "form");
				},
			};
			definition.properties.images = {
				get: () => {
					this.read(id);
					return this.collections.get(id, "tag", "img");
				},
			};
			for (const [name, kind, query] of [
				["scripts", "tag", "script"],
				["embeds", "tag", "embed"],
				["plugins", "tag", "embed"],
				["links", "links", ""],
				["anchors", "anchors", ""],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.collections.get(id, kind, query);
					},
				};
			if (this.storage)
				definition.properties.cookie = {
					get: () => {
						this.read(id);
						return this.storage?.readCookie();
					},
					set: (value) => {
						this.read(id);
						this.storage?.writeCookie(value);
					},
				};
			if (this.location)
				definition.properties.location = {
					get: () => {
						this.read(id);
						return this.location?.object;
					},
					set: (value) => this.location?.navigate(value),
				};
			Object.assign(definition.properties, {
				readyState: {
					get: () => {
						this.read(id);
						return documentScriptState(this.tree)?.readyState ?? "complete";
					},
				},
				currentScript: {
					get: () => {
						this.read(id);
						return this.optional(
							documentScriptState(this.tree)?.currentScript ?? undefined,
						);
					},
				},
				URL: {
					get: () => {
						this.read(id);
						return this.tree.url;
					},
				},
				documentURI: {
					get: () => {
						this.read(id);
						return this.tree.url;
					},
				},
				body: {
					get: () => {
						this.read(id);
						return this.optional(documentBody(this.tree));
					},
					set: (value: unknown) => {
						this.read(id);
						setDocumentBody(this.tree, this.identify(value));
					},
				},
				head: {
					get: () => {
						this.read(id);
						return this.optional(documentHead(this.tree));
					},
				},
				documentElement: {
					get: () => {
						this.read(id);
						return this.optional(documentElement(this.tree));
					},
				},
			});
			Object.assign(definition.methods, {
				write: (...values: readonly unknown[]) => this.write(values, false),
				createAttribute: (...args: readonly unknown[]) => {
					this.read(id);
					if (!args.length)
						throw new AgentBrowserError(
							"invalid-input",
							"Missing attribute name",
						);
					return this.attributes.create(domString(args[0]));
				},
				writeln: (...values: readonly unknown[]) => this.write(values, true),
				createDocumentFragment: () => {
					this.read(id);
					return this.node(this.tree.createFragment());
				},
				createElement: (name: unknown) => {
					this.read(id);
					return this.node(this.tree.createElement(domString(name)));
				},
				createTextNode: (data: unknown) => {
					this.read(id);
					return this.node(this.tree.createText(domString(data)));
				},
				createComment: (data: unknown) => {
					this.read(id);
					return this.node(this.tree.createComment(domString(data)));
				},
			});
		}
		if (initial.kind === "element") {
			Object.assign(definition.methods, this.attributes.elementMethods(id));
			definition.properties.dataset = {
				get: () => {
					this.read(id);
					return this.datasets.get(id);
				},
			};
			if (initial.tagName === "img") {
				const images = documentImages(this.tree);
				images.get(id);
				for (const name of [
					"complete",
					"currentSrc",
					"naturalWidth",
					"naturalHeight",
				] as const)
					definition.properties[name] = {
						get: () => {
							this.read(id);
							return images.get(id)[name];
						},
					};
				definition.properties.alt = {
					get: () => this.read(id).attributes.alt ?? "",
					set: (value) => {
						this.read(id);
						this.tree.setAttribute(id, "alt", domString(value));
					},
				};
				definition.methods.decode = () => {
					this.read(id);
					return images.decode(id);
				};
				if (this.eventBindings)
					for (const type of ["load", "error"])
						definition.properties[`on${type}`] = {
							get: () => {
								this.read(id);
								return this.eventBindings?.getHandler(id, type);
							},
							set: (value) => {
								this.read(id);
								this.eventBindings?.setHandler(id, type, value);
							},
						};
			}
			Object.assign(
				definition.properties,
				scriptFormProperties(
					this.tree,
					id,
					() => this.read(id),
					(target) => this.node(target),
					this.collections,
					domString,
					this.validity,
				),
			);
			Object.assign(
				definition.methods,
				scriptFormMethods(this.tree, id, () => this.read(id)),
			);
			if (supportsConstraintValidation(initial.tagName))
				definition.methods.setCustomValidity = (
					...args: readonly unknown[]
				) => {
					this.read(id);
					if (!args.length)
						throw new TypeError("setCustomValidity requires a message");
					this.tree.setCustomValidity(id, domString(args[0]));
				};
			definition.properties.classList = {
				get: () => this.classLists.get(id),
				set: (value) => this.classLists.setValue(id, value),
			};
			Object.assign(
				definition.properties,
				scriptUrlProperties(this.tree, id, () => this.read(id), domString),
			);
			if (initial.tagName === "a" || initial.tagName === "area")
				definition.methods.toString = () =>
					String(definition.properties.href.get());
			definition.properties.attributes = { get: () => this.attributes.map(id) };
			definition.methods.getClientRects = () =>
				this.geometry.getClientRects(id);
			definition.methods.getBoundingClientRect = () =>
				this.geometry.getBoundingClientRect(id);
			for (const name of elementSizeProperties)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.elementSizes.get(id)[name];
					},
				};
			definition.properties.style = {
				get: () => this.inlineStyles.get(id),
				set: (value) =>
					this.inlineStyles.replace(id, value === null ? "" : domString(value)),
			};
			Object.assign(definition.properties, {
				innerHTML: {
					get: () => {
						this.read(id);
						return serializeHtml(this.tree, id);
					},
					set: (value: unknown) => {
						this.read(id);
						setInnerHtml(this.tree, id, value === null ? "" : domString(value));
					},
				},
				outerHTML: {
					get: () => {
						this.read(id);
						return serializeHtml(this.tree, id, { includeSelf: true });
					},
					set: (value: unknown) => {
						this.read(id);
						setOuterHtml(this.tree, id, value === null ? "" : domString(value));
					},
				},
				tagName: { get: () => this.read(id).tagName.toUpperCase() },
				id: this.attribute(id, "id"),
				className: this.attribute(id, "class"),
				title: this.attribute(id, "title"),
			});
			Object.assign(definition.methods, {
				insertAdjacentHTML: (...args: readonly unknown[]) => {
					this.read(id);
					if (args.length < 2)
						throw new AgentBrowserError(
							"invalid-input",
							"Adjacent HTML requires position and markup",
						);
					insertAdjacentHtml(
						this.tree,
						id,
						domString(args[0]),
						domString(args[1]),
					);
				},
				getAttributeNode: (...args: readonly unknown[]) => {
					this.read(id);
					if (!args.length)
						throw new AgentBrowserError(
							"invalid-input",
							"Missing attribute name",
						);
					return this.attributes.get(id, domString(args[0]));
				},
				setAttributeNode: (attribute: unknown) =>
					this.attributes.set(id, attribute),
				removeAttributeNode: (attribute: unknown) =>
					this.attributes.remove(id, attribute),
				matches: (selector: unknown) => {
					this.read(id);
					return this.queries.matches(id, domString(selector));
				},
				closest: (selector: unknown) => {
					this.read(id);
					return this.optional(this.queries.closest(id, domString(selector)));
				},
			});
			if (initial.tagName === "input" || initial.tagName === "textarea") {
				definition.properties.value = {
					get: () => {
						this.read(id);
						return controlValue(this.tree, id);
					},
					set: (value) => this.setValue(id, value),
				};
			}
			if (initial.tagName === "input") {
				definition.properties.checked = {
					get: () => {
						this.read(id);
						return controlChecked(this.tree, id);
					},
					set: (value) => {
						this.read(id);
						this.tree.setInputChecked(id, Boolean(value));
					},
				};
			}
			const select = scriptSelectBindings(
				this.tree,
				id,
				() => this.read(id),
				(target) => this.node(target),
				this.collections,
				domString,
			);
			Object.assign(definition.properties, select.properties);
			Object.assign(definition.methods, select.methods);
		}
		const capability = this.factory.createHostObject(definition);
		if (!capability || typeof capability !== "object")
			throw new AgentBrowserError(
				"unsupported",
				"Invalid host object capability",
			);
		this.capabilities.set(id, capability);
		this.identities.set(capability, id);
		this.relations.register(capability, id);
		return capability;
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.eventBindings?.close();
		this.queries.close();
		this.collections.close();
		this.inlineStyles.close();
		this.attributes.close();
		this.datasets.close();
		this.elementTraversal.close();
		this.relations.close();
		this.classLists.close();
		this.validity.close();
		this.geometry.close();
		this.computedStyles.close();
		this.capabilities.clear();
		this.identities = new WeakMap();
		this.unregisterClose();
	}

	consoleLabel(value: object): string | undefined {
		const id = this.identities.get(value);
		if (id === undefined) return undefined;
		const node = this.read(id);
		return node.kind === "element"
			? `<${node.tagName}>`
			: node.kind === "fragment"
				? "#document-fragment"
				: `#${node.kind}`;
	}

	metrics() {
		return Object.freeze({
			classLists: this.classLists.metrics(),
			geometry: this.geometry.metrics(),
			computedStyles: this.computedStyles.metrics(),
			elementSizes: this.elementSizes.metrics(),
		});
	}

	getComputedStyle(element: unknown, pseudo?: unknown): object {
		return this.computedStyles.get(this.identify(element), pseudo);
	}

	private read(id: number): Readonly<DocumentNode> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script document is closed");
		return this.tree.get(id);
	}
	private optional(id: number | null | undefined) {
		return id == null ? null : this.node(id);
	}
	private identify(value: unknown) {
		const id =
			value && typeof value === "object"
				? this.identities.get(value)
				: undefined;
		if (id === undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a node from this script document",
			);
		this.read(id);
		return id;
	}
	private sibling(id: number, direction: number) {
		const parent = this.read(id).parent;
		if (parent === null) return null;
		const siblings = this.read(parent).children;
		return this.optional(siblings[siblings.indexOf(id) + direction]);
	}
	private write(values: readonly unknown[], newline: boolean) {
		this.read(this.tree.root);
		const parts: string[] = [];
		let length = newline ? 1 : 0;
		for (const value of values) {
			const text = domString(value);
			length += text.length;
			if (length > this.tree.limits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Document write text limit exceeded",
				);
			parts.push(text);
		}
		writeDocument(this.tree, parts.join("") + (newline ? "\n" : ""));
	}
	private attribute(id: number, name: string) {
		return {
			get: () => this.read(id).attributes[name] ?? "",
			set: (value: unknown) => {
				this.read(id);
				this.tree.setAttribute(id, name, domString(value));
			},
		};
	}
	private setValue(id: number, value: unknown) {
		const node = this.read(id);
		const text = value === null ? "" : domString(value);
		if (node.tagName === "textarea") {
			this.tree.setControl(id, { value: text.replace(/\r\n?/g, "\n") });
			return;
		}
		const type = inputType(node);
		if (type === "file") {
			if (text !== "")
				throw new DOMException(
					"File input values can only be cleared",
					"InvalidStateError",
				);
			this.tree.clearControl(id, ["value"]);
			return;
		}
		if (
			[
				"checkbox",
				"radio",
				"hidden",
				"submit",
				"image",
				"reset",
				"button",
			].includes(type)
		) {
			this.tree.setAttribute(id, "value", text);
			return;
		}
		if (
			![
				"text",
				"search",
				"tel",
				"url",
				"email",
				"password",
				"number",
				"range",
				"date",
				"month",
				"week",
				"time",
				"datetime-local",
			].includes(type)
		)
			throw new AgentBrowserError(
				"unsupported",
				"This input value mode is not implemented for scripts",
			);
		this.tree.setControl(id, {
			value: sanitizeInputValue(type, text, node.attributes),
		});
	}
}

export function domString(value: unknown): string {
	if (
		value !== null &&
		(typeof value === "object" ||
			typeof value === "function" ||
			typeof value === "symbol")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object-to-DOM-string conversion is not implemented",
		);
	return String(value);
}
