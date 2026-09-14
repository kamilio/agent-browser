export const cssPropertyAliases = Object.freeze({
	"-moz-box-sizing": "box-sizing",
	"-webkit-box-sizing": "box-sizing",
	"-moz-hyphens": "hyphens",
	"-ms-hyphens": "hyphens",
	"-webkit-hyphens": "hyphens",
	"-webkit-text-decoration": "text-decoration",
	"-webkit-text-decoration-line": "text-decoration-line",
	"-webkit-text-decoration-style": "text-decoration-style",
	"-webkit-text-decoration-color": "text-decoration-color",
	"word-wrap": "overflow-wrap",
});

export function canonicalCssProperty(name: string): string {
	return Object.hasOwn(cssPropertyAliases, name)
		? cssPropertyAliases[name as keyof typeof cssPropertyAliases]
		: name;
}

export function cssPropertyAccessors(name: string): readonly string[] {
	const camelName = name.replace(/-([a-z])/g, (_match, letter: string) =>
		letter.toUpperCase(),
	);
	if (name.startsWith("-webkit-") || name.startsWith("-ms-"))
		return [name, camelName, camelName[0].toLowerCase() + camelName.slice(1)];
	return name === camelName ? [name] : [name, camelName];
}
