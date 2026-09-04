export const cssPropertyAliases = Object.freeze({
	"word-wrap": "overflow-wrap",
});

export function canonicalCssProperty(name: string): string {
	return name === "word-wrap" ? cssPropertyAliases[name] : name;
}
