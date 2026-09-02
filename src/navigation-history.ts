import { AgentBrowserError } from "./errors.js";
import type { HistoryArchive } from "./history.js";

interface Group {
	archive: HistoryArchive;
	post: boolean;
	bytes: number;
}
export interface TraversalTarget {
	readonly archive: HistoryArchive;
	readonly post: boolean;
	readonly sameDocument: boolean;
	readonly delta: number;
	readonly identity: object;
}
export interface SessionHistorySnapshot {
	index: number;
	length: number;
	entries: readonly {
		key: string;
		url: string;
		active: boolean;
		requiresResubmission: boolean;
	}[];
	retainedBytes: number;
	evictedDocuments: number;
}

const encoder = new TextEncoder();

export class NavigationHistory {
	private groups: Group[] = [];
	private index = -1;
	private evictions = 0;
	constructor(
		private readonly maxDocuments: number,
		private readonly maxBytes: number,
	) {}

	snapshot(current?: HistoryArchive): SessionHistorySnapshot {
		if (current) this.sync(current);
		const entries = this.groups.flatMap((group, index) =>
			group.archive.entries.map((entry, position) => ({
				key: entry.key,
				url: entry.url,
				active: index === this.index && position === group.archive.index,
				requiresResubmission: group.post,
			})),
		);
		return {
			index: entries.findIndex((entry) => entry.active),
			length: entries.length,
			entries,
			retainedBytes: this.groups.reduce(
				(total, group) => total + group.bytes,
				0,
			),
			evictedDocuments: this.evictions,
		};
	}

	target(current: HistoryArchive, delta: number): TraversalTarget | undefined {
		this.sync(current);
		const before = this.groups
			.slice(0, this.index)
			.reduce((total, group) => total + group.archive.entries.length, 0);
		let position = before + current.index + delta;
		if (position < 0) return;
		for (let index = 0; index < this.groups.length; index++) {
			const group = this.groups[index];
			if (position < group.archive.entries.length)
				return {
					archive: { ...group.archive, index: position },
					post: group.post,
					sameDocument: index === this.index,
					delta,
					identity: group,
				};
			position -= group.archive.entries.length;
		}
	}

	commitTraversal(target: TraversalTarget, archive: HistoryArchive) {
		const index = this.groups.findIndex((group) => group === target.identity);
		if (index < 0)
			throw new AgentBrowserError("aborted", "History target was discarded");
		const known = new Set(
			this.groups[index].archive.entries.map((entry) => entry.key),
		);
		const next = archive.entries.some((entry) => !known.has(entry.key))
			? this.groups.slice(0, index + 1)
			: [...this.groups];
		next[index] = this.group(archive, target.post);
		this.apply(next, index);
	}

	record(
		current: HistoryArchive | undefined,
		archive: HistoryArchive,
		post: boolean,
		replace: boolean,
	) {
		if (current) this.sync(current);
		if (replace && this.index >= 0) {
			const known = new Set(
				this.groups[this.index].archive.entries.map((entry) => entry.key),
			);
			const next = archive.entries.some((entry) => !known.has(entry.key))
				? this.groups.slice(0, this.index + 1)
				: [...this.groups];
			next[this.index] = this.group(archive, post);
			this.apply(next, this.index);
			return;
		}
		const next = this.groups.slice(0, this.index + 1);
		if (next.length) {
			const previous = next[next.length - 1];
			next[next.length - 1] = this.group(
				{
					...previous.archive,
					entries: previous.archive.entries.slice(
						0,
						previous.archive.index + 1,
					),
				},
				previous.post,
			);
		}
		next.push(this.group(archive, post));
		this.apply(next, next.length - 1);
	}

	replaceDocument(
		current: HistoryArchive | undefined,
		archive: HistoryArchive,
		post: boolean,
	) {
		const preview = new NavigationHistory(this.maxDocuments, this.maxBytes);
		preview.groups = [...this.groups];
		preview.index = this.index;
		if (current) preview.sync(current);
		const group = preview.groups[preview.index];
		if (!group) {
			preview.record(undefined, archive, post, false);
		} else {
			const next = preview.groups.slice(0, preview.index);
			const before = group.archive.entries.slice(0, group.archive.index);
			if (before.length)
				next.push(
					this.group({ entries: before, index: before.length - 1 }, group.post),
				);
			const active = next.length;
			next.push(this.group(archive, post));
			if (archive.entries.length === 1) {
				const after = group.archive.entries.slice(group.archive.index + 1);
				if (after.length)
					next.push(this.group({ entries: after, index: 0 }, group.post));
				next.push(...preview.groups.slice(preview.index + 1));
			}
			preview.apply(next, active);
		}
		this.groups = preview.groups;
		this.index = preview.index;
		this.evictions += preview.evictions;
	}

	close() {
		this.groups = [];
		this.index = -1;
	}

	previewLength(
		current: HistoryArchive | undefined,
		archive: HistoryArchive,
		options: {
			post: boolean;
			replace: boolean;
			replaceDocument?: boolean;
			target?: TraversalTarget;
			committed?: boolean;
		},
	) {
		const preview = new NavigationHistory(this.maxDocuments, this.maxBytes);
		preview.groups = [...this.groups];
		preview.index = this.index;
		if (options.committed) preview.sync(archive);
		else if (options.target) preview.commitTraversal(options.target, archive);
		else if (options.replaceDocument)
			preview.replaceDocument(current, archive, options.post);
		else preview.record(current, archive, options.post, options.replace);
		return preview.groups.reduce(
			(total, group) => total + group.archive.entries.length,
			0,
		);
	}

	private sync(archive: HistoryArchive) {
		if (this.index < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"No active navigation history",
			);
		const previous = this.groups[this.index];
		const known = new Set(previous.archive.entries.map((entry) => entry.key));
		const newBranch = archive.entries.some((entry) => !known.has(entry.key));
		const next = newBranch
			? this.groups.slice(0, this.index + 1)
			: [...this.groups];
		next[this.index] = this.group(archive, previous.post);
		this.apply(next, this.index);
	}

	private group(archive: HistoryArchive, post: boolean): Group {
		return {
			archive,
			post,
			bytes: archive.entries.reduce(
				(total, entry) =>
					total +
					encoder.encode(entry.serialized).byteLength +
					encoder.encode(entry.url).byteLength +
					entry.key.length,
				0,
			),
		};
	}

	private apply(input: Group[], active: number) {
		const next = [...input];
		let index = active;
		let bytes = next.reduce((total, group) => total + group.bytes, 0);
		let evictions = 0;
		while (next.length > this.maxDocuments || bytes > this.maxBytes) {
			if (next.length === 1)
				throw new AgentBrowserError(
					"resource-limit",
					"Current document exceeds navigation history budget",
				);
			const removed = index === 0 ? next.length - 1 : 0;
			bytes -= next[removed].bytes;
			next.splice(removed, 1);
			if (removed < index) index--;
			evictions++;
		}
		this.groups = next;
		this.index = index;
		this.evictions += evictions;
	}
}
