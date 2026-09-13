export const cssPropertyAliases = Object.freeze({
	"-moz-box-sizing": "box-sizing",
	"-webkit-box-sizing": "box-sizing",
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
	if (name.startsWith("-webkit-"))
		return [name, camelName, camelName[0].toLowerCase() + camelName.slice(1)];
	return name === camelName ? [name] : [name, camelName];
}
