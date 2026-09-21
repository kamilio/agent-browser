import { bindDocumentIdentity, documentIdentity } from "./document-identity.js";
import { inheritDocumentBaseUrl } from "./document-url.js";
import { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { DocumentEvents } from "./events.js";
import { inheritDocumentOrigin } from "./html-document-family.js";
import { ScriptDom, type ScriptHostObjectFactory } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import { ScriptLocation } from "./script-location.js";

interface FrameGroup {
	attempts: number;
	readonly topWindow: object;
}
const groups = new WeakMap<DocumentTree, FrameGroup>();

interface BlankFrame {
	tree: DocumentTree;
	dom: ScriptDom;
	window: object;
}

// Initial unsandboxed about:blank documents only. Navigation, srcdoc and child
// script execution require a separate policy-aware loader and realm.
export class ScriptBlankFrames {
	private readonly frames = new Map<number, BlankFrame>();
	private readonly group: FrameGroup;
	private readonly unregisterMutation: () => void;
	private readonly unregisterClose: () => void;
	private closed = false;
	private publishing = false;

	constructor(
		private readonly parent: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly parentWindow: object,
		private readonly parentNode: (id: number) => object,
		private readonly callbacks?: ScriptCallbackRuntime,
	) {
		this.group = groups.get(parent) ?? { attempts: 0, topWindow: parentWindow };
		groups.set(parent, this.group);
		this.unregisterMutation = parent.onMutation(() => {
			for (const [id, frame] of this.frames)
				if (!this.supported(id)) {
					this.frames.delete(id);
					frame.tree.close();
				}
		});
		this.unregisterClose = parent.onClose(() => this.close());
	}

	get(id: number): BlankFrame | null {
		this.ensureOpen();
		if (!this.supported(id)) return null;
		const existing = this.frames.get(id);
		if (existing) return existing;
		if (this.publishing)
			throw new AgentBrowserError(
				"invalid-input",
				"Reentrant frame publication",
			);
		if (this.group.attempts >= 16)
			throw new AgentBrowserError(
				"resource-limit",
				"Blank frame creation limit exceeded",
			);
		this.group.attempts++;
		this.publishing = true;
		let tree: DocumentTree | undefined;
		try {
			tree = new DocumentTree(
				"about:blank",
				this.parent.limits,
				this.parent.sharedResources(),
			);
			const childTree = tree;
			groups.set(childTree, this.group);
			childTree.onClose(() => groups.delete(childTree));
			inheritDocumentOrigin(tree, this.parent);
			inheritDocumentBaseUrl(tree, this.parent);
			bindDocumentIdentity(tree, documentIdentity(this.parent));
			const html = tree.createElement("html");
			tree.append(tree.root, html);
			tree.append(html, tree.createElement("head"));
			tree.append(html, tree.createElement("body"));
			let dom: ScriptDom | undefined;
			let window: object;
			const assertActive = () => {
				this.ensureOpen();
				childTree.get(childTree.root);
			};
			const currentDom = () => {
				assertActive();
				if (!dom)
					throw new AgentBrowserError(
						"invalid-input",
						"Frame DOM is not published",
					);
				return dom;
			};
			const location = new ScriptLocation(tree, this.factory);
			window = this.factory.createHostObject({
				properties: {
					document: {
						get: () => {
							return currentDom().document;
						},
					},
					window: {
						get: () => {
							assertActive();
							return window;
						},
					},
					self: {
						get: () => {
							assertActive();
							return window;
						},
					},
					parent: {
						get: () => {
							assertActive();
							return this.parentWindow;
						},
					},
					top: {
						get: () => {
							assertActive();
							return this.group.topWindow;
						},
					},
					frameElement: {
						get: () => {
							assertActive();
							return this.parentNode(id);
						},
					},
					location: {
						get: () => {
							assertActive();
							return location.object;
						},
					},
				},
				methods: {
					getComputedStyle: (element, pseudo) => {
						return currentDom().getComputedStyle(element, pseudo);
					},
					getSelection: () => {
						return currentDom().getSelection();
					},
				},
			});
			const events = new DocumentEvents(tree, {}, { window: true });
			tree.onClose(() => events.close());
			dom = new ScriptDom(
				tree,
				this.factory,
				this.callbacks
					? { events, callbacks: this.callbacks, window }
					: undefined,
				location,
			);
			this.ensureOpen();
			if (!this.supported(id))
				throw new AgentBrowserError(
					"invalid-input",
					"Frame changed during publication",
				);
			const frame = { tree, dom, window };
			this.frames.set(id, frame);
			return frame;
		} catch (error) {
			tree?.close();
			throw error;
		} finally {
			this.publishing = false;
		}
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterMutation();
		this.unregisterClose();
		for (const frame of this.frames.values()) frame.tree.close();
		this.frames.clear();
	}

	private supported(id: number): boolean {
		const node = this.parent.get(id);
		return (
			isHtmlElement(node, "iframe") &&
			this.parent.isConnected(id) &&
			!["sandbox", "srcdoc", "credentialless"].some((name) =>
				Object.hasOwn(node.attributes, name),
			) &&
			(node.attributes.src === undefined ||
				node.attributes.src.trim() === "" ||
				node.attributes.src.trim() === "about:blank")
		);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Blank frames are closed");
		this.parent.get(this.parent.root);
	}
}
