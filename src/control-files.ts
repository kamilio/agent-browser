import { formControls, inputType, isControlDisabled } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import type { FormUpload } from "./forms.js";

export const fileSelectionLimits = Object.freeze({
	maxFiles: 64,
	maxControls: 128,
	maxFileBytes: 8_388_608,
	maxTotalBytes: 33_554_432,
	maxNameCodeUnits: 255,
	maxTypeCodeUnits: 256,
});

export type FileSelectionLimits = Readonly<
	Record<keyof typeof fileSelectionLimits, number>
>;
export type FileSelectionOptions = Partial<
	Record<keyof FileSelectionLimits, number>
>;

export interface FileSelectionTarget {
	readonly documentId: string;
	readonly reference: string;
	readonly version: number;
}

export interface FileSelectionMetadata {
	readonly name: string;
	readonly type?: string;
	readonly bytes: number;
}

export type FileSelectionInvalidation =
	| "selection"
	| "reset"
	| "mutation"
	| "close";

export function resolveFileSelectionLimits(options: FileSelectionOptions = {}) {
	const limits = Object.freeze({ ...fileSelectionLimits, ...options });
	for (const key of Object.keys(
		fileSelectionLimits,
	) as (keyof FileSelectionLimits)[])
		if (
			!Number.isSafeInteger(limits[key]) ||
			limits[key] < 1 ||
			limits[key] > fileSelectionLimits[key]
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid file selection limits",
			);
	return limits;
}

export function validateUploadMetadata(
	name: unknown,
	type: unknown,
	limits: FileSelectionLimits = fileSelectionLimits,
) {
	if (
		typeof name !== "string" ||
		!name ||
		name === "." ||
		name === ".." ||
		name.length > limits.maxNameCodeUnits ||
		/[/\\\p{Cc}\p{Cf}]/u.test(name)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Upload name must be a bounded basename",
		);
	if (
		type !== undefined &&
		(typeof type !== "string" ||
			type.length > limits.maxTypeCodeUnits ||
			/[^\x20-\x7e]/.test(type))
	)
		throw new AgentBrowserError("invalid-input", "Invalid upload content type");
}

function copyFiles(files: readonly FormUpload[]): readonly FormUpload[] {
	return Object.freeze(
		files.map((file) =>
			Object.freeze({
				name: file.name,
				type: file.type,
				data: new Uint8Array(file.data),
			}),
		),
	);
}

export class DocumentFileSelections {
	readonly limits;
	private readonly identity = crypto.randomUUID();
	private readonly selections = new Map<number, readonly FormUpload[]>();
	private version = 0;
	private bytes = 0;
	private count = 0;
	private closed = false;
	private readonly unsubscribe: (() => void)[] = [];
	private readonly invalidations = new Set<
		(reason: FileSelectionInvalidation) => void
	>();

	constructor(
		private readonly tree: DocumentTree,
		options: FileSelectionOptions = {},
	) {
		this.limits = resolveFileSelectionLimits(options);
		try {
			this.unsubscribe.push(tree.onClose(() => this.close()));
			this.unsubscribe.push(
				tree.onMutation((record) => {
					if (record.type === "childList" && record.removedNodes.length)
						this.invalidate("mutation");
					if (record.type === "attributes" && record.attributeName === "type") {
						const node = tree.get(record.target);
						if (node.tagName !== "input" || inputType(node) !== "file")
							this.remove(record.target);
						this.invalidate("mutation");
					}
				}),
			);
		} catch (error) {
			this.close();
			throw error;
		}
	}

	capture(reference: string): Readonly<FileSelectionTarget> {
		this.control(reference, true);
		return Object.freeze({
			documentId: this.identity,
			reference,
			version: this.version,
		});
	}

	get documentId() {
		return this.identity;
	}

	onInvalidate(handler: (reason: FileSelectionInvalidation) => void) {
		this.ensureOpen();
		if (typeof handler !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid selection invalidation handler",
			);
		if (!this.invalidations.has(handler) && this.invalidations.size >= 16)
			throw new AgentBrowserError(
				"resource-limit",
				"Selection invalidation listener limit exceeded",
			);
		this.invalidations.add(handler);
		return () => {
			this.invalidations.delete(handler);
		};
	}

	validateTarget(target: FileSelectionTarget, count: number) {
		this.ensureOpen();
		if (
			!target ||
			target.documentId !== this.identity ||
			target.version !== this.version
		)
			throw new AgentBrowserError(
				"stale-reference",
				"File selection target is stale",
			);
		const node = this.control(target.reference, true);
		if (
			!Number.isSafeInteger(count) ||
			count < 0 ||
			count > this.limits.maxFiles
		)
			throw new AgentBrowserError(
				"resource-limit",
				"File count limit exceeded",
			);
		if (count > 1 && !Object.hasOwn(node.attributes, "multiple"))
			throw new AgentBrowserError(
				"not-actionable",
				"File control does not allow multiple files",
			);
	}

	invalidateTargets() {
		this.ensureOpen();
		this.invalidate("mutation");
	}

	replace(target: FileSelectionTarget, files: readonly FormUpload[]) {
		this.ensureOpen();
		const reference = target?.reference;
		const version = target?.version;
		if (
			!target ||
			target.documentId !== this.identity ||
			version !== this.version
		)
			throw new AgentBrowserError(
				"stale-reference",
				"File selection target is stale",
			);
		let node = this.control(reference, true);
		if (!Array.isArray(files))
			throw new AgentBrowserError("invalid-input", "Invalid file selection");
		const count = files.length;
		if (count > this.limits.maxFiles)
			throw new AgentBrowserError(
				"resource-limit",
				"File count limit exceeded",
			);
		if (count > 1 && !Object.hasOwn(node.attributes, "multiple"))
			throw new AgentBrowserError(
				"not-actionable",
				"File control does not allow multiple files",
			);
		let bytes = 0;
		const copied: FormUpload[] = [];
		for (let index = 0; index < count; index++) {
			const file = files[index];
			const name = file?.name;
			const type = file?.type;
			const data = file?.data;
			if (
				!file ||
				!(data instanceof Uint8Array) ||
				!(data.buffer instanceof ArrayBuffer)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload requires owned byte data",
				);
			validateUploadMetadata(name, type, this.limits);
			bytes += data.byteLength;
			if (
				data.byteLength > this.limits.maxFileBytes ||
				bytes > this.limits.maxTotalBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"File byte limit exceeded",
				);
			copied.push(Object.freeze({ name, type, data: new Uint8Array(data) }));
		}
		node = this.control(reference, true);
		if (version !== this.version)
			throw new AgentBrowserError(
				"stale-reference",
				"File selection target is stale",
			);
		if (count > 1 && !Object.hasOwn(node.attributes, "multiple"))
			throw new AgentBrowserError(
				"not-actionable",
				"File control does not allow multiple files",
			);
		const previous = this.selections.get(node.id) ?? [];
		const totalBytes =
			this.bytes -
			previous.reduce((sum, file) => sum + file.data.byteLength, 0) +
			bytes;
		const totalCount = this.count - previous.length + count;
		const totalControls =
			this.selections.size - (previous.length ? 1 : 0) + (count ? 1 : 0);
		if (
			totalBytes > this.limits.maxTotalBytes ||
			totalCount > this.limits.maxFiles ||
			totalControls > this.limits.maxControls
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Document file selection limit exceeded",
			);
		if (copied.length) this.selections.set(node.id, Object.freeze(copied));
		else this.selections.delete(node.id);
		this.bytes = totalBytes;
		this.count = totalCount;
		this.invalidate("selection");
		if ((previous.length || copied.length) && !this.closed)
			this.tree.invalidatePresentation();
		return Object.freeze({
			reference,
			files: copied.length,
			bytes,
			version: this.version,
		});
	}

	*replaceAction(
		target: FileSelectionTarget,
		files: readonly FormUpload[],
		onCommitted?: () => void,
	): EventAction<ReturnType<DocumentFileSelections["replace"]>> {
		const result = this.replace(target, files);
		onCommitted?.();
		const id = this.tree.resolve(result.reference).id;
		yield {
			target: id,
			event: new BrowserEvent("input", { bubbles: true, composed: true }),
		};
		if (!this.closed)
			yield {
				target: id,
				event: new BrowserEvent("change", { bubbles: true }),
			};
		return result;
	}

	files(reference: string): readonly FormUpload[] {
		const node = this.control(reference, false);
		return copyFiles(this.selections.get(node.id) ?? []);
	}

	selectionMetadata(id: number): readonly FileSelectionMetadata[] {
		const node = this.fileControl(id);
		return Object.freeze(
			(this.selections.get(node.id) ?? []).map((file) =>
				Object.freeze({
					name: file.name,
					type: file.type,
					bytes: file.data.byteLength,
				}),
			),
		);
	}

	filesForSubmission(): ReadonlyMap<number, readonly FormUpload[]> {
		this.ensureOpen();
		const files = new Map<number, readonly FormUpload[]>();
		for (const [id, selected] of this.selections)
			if (this.tree.isConnected(id)) files.set(id, copyFiles(selected));
		return files;
	}

	clear(target: string | number) {
		const node =
			typeof target === "number"
				? this.fileControl(target)
				: this.control(target, false);
		const changed = this.remove(node.id);
		this.invalidate("reset");
		if (changed && !this.closed) this.tree.invalidatePresentation();
	}

	resetForm(reference: string) {
		this.ensureOpen();
		const form = this.tree.resolve(reference);
		if (form.tagName !== "form")
			throw new AgentBrowserError("invalid-input", "Expected a form reference");
		let changed = false;
		for (const node of formControls(this.tree, form.id))
			if (this.remove(node.id)) changed = true;
		this.invalidate("reset");
		if (changed && !this.closed) this.tree.invalidatePresentation();
	}

	metrics() {
		return {
			files: this.count,
			bytes: this.bytes,
			controls: this.selections.size,
			version: this.version,
			closed: this.closed,
		};
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.selections.clear();
		this.bytes = 0;
		this.count = 0;
		this.invalidate("close");
		this.invalidations.clear();
		for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
	}

	private remove(id: number) {
		const files = this.selections.get(id);
		if (!files) return false;
		this.bytes -= files.reduce((sum, file) => sum + file.data.byteLength, 0);
		this.count -= files.length;
		this.selections.delete(id);
		return true;
	}

	private invalidate(reason: FileSelectionInvalidation) {
		this.version++;
		for (const handler of [...this.invalidations]) {
			try {
				handler(reason);
			} catch {}
		}
	}

	private control(reference: string, mutable: boolean) {
		this.ensureOpen();
		if (typeof reference !== "string")
			throw new AgentBrowserError("invalid-input", "Invalid element reference");
		const node = this.fileControl(this.tree.resolve(reference).id);
		if (mutable && isControlDisabled(this.tree, node.id))
			throw new AgentBrowserError("not-actionable", "File control is disabled");
		return node;
	}

	private fileControl(id: number) {
		this.ensureOpen();
		if (!Number.isSafeInteger(id) || id < 1)
			throw new AgentBrowserError("invalid-input", "Invalid file control ID");
		const node = this.tree.get(id);
		if (node.tagName !== "input" || inputType(node) !== "file")
			throw new AgentBrowserError("not-actionable", "Expected a file input");
		return node;
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Document file selections are closed",
			);
	}
}
