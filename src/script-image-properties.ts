import type { DocumentImages } from "./document-images.js";
import type { DocumentTree } from "./document.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export function scriptImageProperties(
	tree: DocumentTree,
	id: number,
	ensureOpen: () => unknown,
	images: DocumentImages,
): NonNullable<ScriptHostObjectDefinition["properties"]> {
	return Object.fromEntries(
		(["width", "height"] as const).map((name) => [
			name,
			{
				get: () => {
					ensureOpen();
					const raw = tree.get(id).attributes[name] ?? "";
					const match = /^[\t\n\f\r ]*\+?([0-9]+)/.exec(raw);
					const value = match ? Number(match[1]) : Number.NaN;
					return value <= 4_294_967_295
						? value
						: images.get(id)[
								name === "width" ? "naturalWidth" : "naturalHeight"
							];
				},
				set: (value: unknown) => {
					ensureOpen();
					if (
						(value !== null && typeof value === "object") ||
						["function", "symbol", "bigint"].includes(typeof value)
					)
						throw new TypeError(
							"Image dimensions require primitive numeric input",
						);
					tree.setAttribute(id, name, String(Number(value) >>> 0));
				},
			},
		]),
	);
}
