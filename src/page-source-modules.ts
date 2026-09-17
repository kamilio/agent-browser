import { AgentBrowserError } from "./errors.js";

export interface PageSourceModule {
	readonly id: string;
	readonly source: string;
}

export interface PageSourceImport {
	readonly referrer: string;
	readonly specifier: string;
	readonly id: string;
}

export interface PageSourceModuleOptions {
	readonly sources: readonly PageSourceModule[];
	readonly imports?: readonly PageSourceImport[];
}

export const pageSourceModuleLimits = Object.freeze({
	sources: 128,
	imports: 512,
	sourceCodeUnits: 262_144,
	totalSourceCodeUnits: 1_048_576,
	identifierCodeUnits: 4096,
	resolutions: 1024,
});

const signalAborted = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;

function invalidInput(): AgentBrowserError {
	return new AgentBrowserError(
		"invalid-input",
		"Invalid page source module input",
	);
}

function resourceLimit(): AgentBrowserError {
	return new AgentBrowserError(
		"resource-limit",
		"Page source module limit exceeded",
	);
}

function record(value: unknown): object {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw invalidInput();
	return value;
}

function ownData(value: object, key: string, optional = false): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (!descriptor) {
		if (optional && !(key in value)) return undefined;
		throw invalidInput();
	}
	if (!Object.hasOwn(descriptor, "value")) throw invalidInput();
	return descriptor.value;
}

function boundedArrayLength(value: unknown, limit: number): number {
	if (!Array.isArray(value)) throw invalidInput();
	const length = ownData(value, "length");
	if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0)
		throw invalidInput();
	if (length > limit) throw resourceLimit();
	return length;
}

function identifier(value: unknown): string {
	if (typeof value !== "string" || value.length === 0) throw invalidInput();
	if (value.length > pageSourceModuleLimits.identifierCodeUnits)
		throw resourceLimit();
	return value;
}

function sourceText(value: unknown, limit: number): string {
	if (typeof value !== "string") throw invalidInput();
	if (value.length > limit) throw resourceLimit();
	return value;
}

function checkCancellation(signal: unknown): void {
	let aborted: boolean;
	try {
		if (!signalAborted) throw invalidInput();
		aborted = signalAborted.call(signal);
	} catch {
		throw invalidInput();
	}
	if (aborted)
		throw new AgentBrowserError(
			"aborted",
			"Page source module operation aborted",
		);
}

export class PageSourceModuleRegistry {
	readonly #sources = new Map<string, Readonly<PageSourceModule>>();
	readonly #imports = new Map<string, Map<string, string>>();

	constructor(options: PageSourceModuleOptions) {
		const input = record(options);
		const sources = ownData(input, "sources");
		const sourceCount = boundedArrayLength(
			sources,
			pageSourceModuleLimits.sources,
		);
		const imports = ownData(input, "imports", true);
		const importCount =
			imports === undefined
				? 0
				: boundedArrayLength(imports, pageSourceModuleLimits.imports);
		if (sourceCount === 0) throw invalidInput();
		let totalSourceCodeUnits = 0;
		for (let index = 0; index < sourceCount; index++) {
			const entry = record(ownData(sources as object, String(index)));
			const id = identifier(ownData(entry, "id"));
			const source = sourceText(
				ownData(entry, "source"),
				pageSourceModuleLimits.sourceCodeUnits,
			);
			if (this.#sources.has(id)) throw invalidInput();
			totalSourceCodeUnits += source.length;
			if (totalSourceCodeUnits > pageSourceModuleLimits.totalSourceCodeUnits)
				throw resourceLimit();
			this.#sources.set(id, Object.freeze({ id, source }));
		}
		for (let index = 0; index < importCount; index++) {
			const entry = record(ownData(imports as object, String(index)));
			const referrer = identifier(ownData(entry, "referrer"));
			const specifier = identifier(ownData(entry, "specifier"));
			const id = identifier(ownData(entry, "id"));
			if (!this.#sources.has(referrer) || !this.#sources.has(id))
				throw invalidInput();
			let mappings = this.#imports.get(referrer);
			if (!mappings) {
				mappings = new Map();
				this.#imports.set(referrer, mappings);
			}
			if (mappings.has(specifier)) throw invalidInput();
			mappings.set(specifier, id);
		}
	}

	createScope(signal: AbortSignal, maxSourceCodeUnits: number) {
		checkCancellation(signal);
		if (!Number.isSafeInteger(maxSourceCodeUnits) || maxSourceCodeUnits <= 0)
			throw invalidInput();
		for (const module of this.#sources.values()) {
			if (module.source.length > maxSourceCodeUnits) throw resourceLimit();
		}
		let resolutions = 0;
		const chargeResolution = () => {
			if (resolutions >= pageSourceModuleLimits.resolutions)
				throw resourceLimit();
			resolutions++;
		};
		return Object.freeze({
			validateEntry: (source: string, filename: string | undefined): void => {
				checkCancellation(signal);
				const id = identifier(filename);
				const text = sourceText(source, maxSourceCodeUnits);
				if (this.#sources.get(id)?.source !== text) throw invalidInput();
			},
			resolve: (
				specifier: string,
				referrer: string,
				context: { signal?: AbortSignal },
			): Readonly<PageSourceModule> | undefined => {
				checkCancellation(signal);
				try {
					const contextSignal = ownData(record(context), "signal", true);
					if (contextSignal !== undefined) checkCancellation(contextSignal);
				} catch (error) {
					if (!(error instanceof AgentBrowserError && error.code === "aborted"))
						chargeResolution();
					throw error;
				}
				chargeResolution();
				const requested = identifier(specifier);
				const parent = identifier(referrer);
				const id = this.#imports.get(parent)?.get(requested);
				return id === undefined ? undefined : this.#sources.get(id);
			},
		});
	}
}
