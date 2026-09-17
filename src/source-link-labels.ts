import { AgentBrowserError } from "./errors.js";

export type SourceLinkLabelPolicy = "source-aria-label-v1";

export const sourceLinkLabelLimits = Object.freeze({
	maxLinks: 128,
	maxLabelCodeUnits: 1024,
	maxTotalLabelCodeUnits: 16_384,
	maxSourceCodeUnitsPerLabel: 4096,
	maxScannedSourceCodeUnits: 65_536,
});

export interface SourceLinkLabels {
	readonly policy: SourceLinkLabelPolicy;
	readonly attribute: "aria-label";
	readonly rendered: false;
	readonly verified: false;
	readonly links: number;
	readonly truncatedLabels: number;
	readonly omittedCandidates: number;
}

function invalidInput(): AgentBrowserError {
	return new AgentBrowserError(
		"invalid-input",
		"Invalid source link label input",
	);
}

export function validateSourceLinkLabelPolicy(
	value: unknown,
): SourceLinkLabelPolicy | undefined {
	if (value === undefined || value === "source-aria-label-v1") return value;
	throw invalidInput();
}

function validateNode(node: unknown): asserts node is object {
	if (node === null || (typeof node !== "object" && typeof node !== "function"))
		throw invalidInput();
}

function safePrefixLength(source: string, limit: number): number {
	const length = Math.min(source.length, limit);
	if (length > 0 && length < source.length) {
		const previous = source.charCodeAt(length - 1);
		const next = source.charCodeAt(length);
		if (
			previous >= 0xd800 &&
			previous <= 0xdbff &&
			next >= 0xdc00 &&
			next <= 0xdfff
		)
			return length - 1;
	}
	return length;
}

interface Registration {
	readonly source: string;
	processed: boolean;
	annotation?: string;
}

export class SourceLinkLabelScope {
	private readonly registrations = new WeakMap<object, Registration>();
	private links = 0;
	private truncatedLabels = 0;
	private omittedCandidates = 0;
	private totalLabelCodeUnits = 0;
	private scannedSourceCodeUnits = 0;

	constructor(private readonly clean: (value: string) => string) {
		if (typeof clean !== "function") throw invalidInput();
	}

	bind(node: object, label: string): void {
		validateNode(node);
		if (typeof label !== "string" || this.registrations.has(node))
			throw invalidInput();
		this.registrations.set(node, { source: label, processed: false });
	}

	label(node: object): string | undefined {
		validateNode(node);
		const registration = this.registrations.get(node);
		if (!registration) return;
		if (!registration.processed) {
			registration.processed = true;
			registration.annotation = this.process(registration.source);
		}
		return registration.annotation;
	}

	report(): Readonly<SourceLinkLabels> {
		return Object.freeze({
			policy: "source-aria-label-v1",
			attribute: "aria-label",
			rendered: false,
			verified: false,
			links: this.links,
			truncatedLabels: this.truncatedLabels,
			omittedCandidates: this.omittedCandidates,
		});
	}

	private process(source: string): string | undefined {
		if (source.length === 0) return;
		const remainingLabelCodeUnits =
			sourceLinkLabelLimits.maxTotalLabelCodeUnits - this.totalLabelCodeUnits;
		const remainingSourceCodeUnits =
			sourceLinkLabelLimits.maxScannedSourceCodeUnits -
			this.scannedSourceCodeUnits;
		if (
			this.links >= sourceLinkLabelLimits.maxLinks ||
			remainingLabelCodeUnits <= 0 ||
			remainingSourceCodeUnits <= 0
		) {
			this.omittedCandidates++;
			return;
		}
		const scannedLength = Math.min(
			source.length,
			sourceLinkLabelLimits.maxSourceCodeUnitsPerLabel,
			remainingSourceCodeUnits,
		);
		const sourceLength = safePrefixLength(source, scannedLength);
		this.scannedSourceCodeUnits += scannedLength;
		const sourceClipped = sourceLength < source.length;
		const normalized = source
			.slice(0, sourceLength)
			.replace(/[\t\n\f\r ]+/g, " ")
			.trim();
		const name = this.clean(normalized);
		const nameLength = safePrefixLength(
			name,
			Math.min(
				sourceLinkLabelLimits.maxLabelCodeUnits,
				remainingLabelCodeUnits,
			),
		);
		if (nameLength === 0) {
			if (sourceClipped || normalized.length > 0) this.omittedCandidates++;
			return;
		}
		const truncated = sourceClipped || nameLength < name.length;
		this.links++;
		this.totalLabelCodeUnits += nameLength;
		if (truncated) this.truncatedLabels++;
		return `Source aria-label${truncated ? " (truncated)" : ""}: ${name.slice(0, nameLength)}`;
	}
}
