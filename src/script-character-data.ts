import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export const characterDataCapabilities = Object.freeze({
	partial: true,
	properties: ["data", "length", "wholeText"],
	methods: [
		"substringData",
		"appendData",
		"insertData",
		"deleteData",
		"replaceData",
		"splitText",
		"normalize",
	],
	units: "utf-16-code-units",
	liveRanges: false,
	mutationObservers: false,
});

function unsignedLong(value: unknown) {
	if (
		(value !== null && typeof value === "object") ||
		["function", "symbol", "bigint"].includes(typeof value)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Character data numeric object/symbol/bigint coercion is unsupported",
		);
	const number = Number(value);
	return Number.isFinite(number)
		? ((Math.trunc(number) % 4_294_967_296) + 4_294_967_296) % 4_294_967_296
		: 0;
}

export function scriptCharacterData(
	tree: DocumentTree,
	id: number,
	bindings: {
		read(id: number): Readonly<DocumentNode>;
		node(id: number): object;
		string(value: unknown): string;
	},
): Required<Pick<ScriptHostObjectDefinition, "properties" | "methods">> {
	const kind = bindings.read(id).kind;
	const result: Required<
		Pick<ScriptHostObjectDefinition, "properties" | "methods">
	> = {
		properties: {},
		methods: {
			normalize: () => {
				bindings.read(id);
				tree.normalize(id);
			},
		},
	};
	if (kind !== "text" && kind !== "comment") return result;
	const required = (args: readonly unknown[], minimum: number) => {
		bindings.read(id);
		if (args.length < minimum)
			throw new TypeError("Not enough character data arguments");
	};
	Object.assign(result.properties, {
		data: {
			get: () => bindings.read(id).data,
			set: (value: unknown) => {
				bindings.read(id);
				tree.setData(id, value === null ? "" : bindings.string(value));
			},
		},
		length: { get: () => bindings.read(id).data.length },
	});
	Object.assign(result.methods, {
		substringData: (...args: unknown[]) => {
			required(args, 2);
			return tree.substringData(
				id,
				unsignedLong(args[0]),
				unsignedLong(args[1]),
			);
		},
		appendData: (...args: unknown[]) => {
			required(args, 1);
			tree.replaceData(
				id,
				bindings.read(id).data.length,
				0,
				bindings.string(args[0]),
			);
		},
		insertData: (...args: unknown[]) => {
			required(args, 2);
			tree.replaceData(id, unsignedLong(args[0]), 0, bindings.string(args[1]));
		},
		deleteData: (...args: unknown[]) => {
			required(args, 2);
			tree.replaceData(id, unsignedLong(args[0]), unsignedLong(args[1]), "");
		},
		replaceData: (...args: unknown[]) => {
			required(args, 3);
			tree.replaceData(
				id,
				unsignedLong(args[0]),
				unsignedLong(args[1]),
				bindings.string(args[2]),
			);
		},
	});
	if (kind === "text") {
		result.properties.wholeText = {
			get: () => {
				bindings.read(id);
				return tree.wholeText(id);
			},
		};
		result.methods.splitText = (...args: unknown[]) => {
			required(args, 1);
			return bindings.node(tree.splitText(id, unsignedLong(args[0])));
		};
	}
	return result;
}
