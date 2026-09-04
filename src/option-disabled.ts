interface OptionNode {
	parent: number | null;
	tagName: string;
	attributes: Readonly<Record<string, string>>;
}

export function optionDisabled(
	option: OptionNode,
	read: (id: number) => OptionNode | undefined,
): boolean {
	if (Object.hasOwn(option.attributes, "disabled")) return true;
	let current = option.parent;
	while (current !== null) {
		const ancestor = read(current);
		if (!ancestor) return false;
		if (["select", "hr", "datalist", "option"].includes(ancestor.tagName))
			return false;
		if (ancestor.tagName === "optgroup")
			return Object.hasOwn(ancestor.attributes, "disabled");
		current = ancestor.parent;
	}
	return false;
}
