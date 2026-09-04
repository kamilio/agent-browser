const associatedTags = new Set([
	"button",
	"fieldset",
	"input",
	"object",
	"output",
	"select",
	"textarea",
]);

export function isFormAssociatedTag(tag: string): boolean {
	return associatedTags.has(tag);
}
