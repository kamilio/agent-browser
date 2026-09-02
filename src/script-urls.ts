import { documentBaseUrl } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export function scriptUrlProperties(
	tree: DocumentTree,
	id: number,
	ensureOpen: () => unknown,
	stringify: (value: unknown) => string,
) {
	const node = tree.get(id);
	const hyperlink = node.tagName === "a" || node.tagName === "area";
	const attribute =
		hyperlink || node.tagName === "link" || node.tagName === "base"
			? "href"
			: [
						"script",
						"img",
						"iframe",
						"input",
						"source",
						"video",
						"audio",
						"embed",
						"track",
					].includes(node.tagName)
				? "src"
				: undefined;
	const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {};
	if (!attribute) return properties;
	const raw = () => {
		ensureOpen();
		return tree.get(id).attributes[attribute];
	};
	const parsed = () => {
		const value = raw();
		if (value === undefined) return undefined;
		try {
			return new URL(
				value,
				node.tagName === "base" ? tree.url : documentBaseUrl(tree),
			);
		} catch {
			return undefined;
		}
	};
	properties[attribute] = {
		get: () => parsed()?.href ?? raw() ?? "",
		set: (value) => {
			ensureOpen();
			tree.setAttribute(id, attribute, stringify(value));
		},
	};
	if (hyperlink) {
		properties.origin = { get: () => parsed()?.origin ?? "" };
		for (const name of [
			"protocol",
			"username",
			"password",
			"host",
			"hostname",
			"port",
			"pathname",
			"search",
			"hash",
		] as const)
			properties[name] = {
				get: () => parsed()?.[name] ?? (name === "protocol" ? ":" : ""),
				set: (value) => {
					ensureOpen();
					const text = stringify(value);
					const url = parsed();
					if (!url) return;
					url[name] = text;
					tree.setAttribute(id, "href", url.href);
				},
			};
	}
	return properties;
}
