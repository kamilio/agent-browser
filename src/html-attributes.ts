const orders = new WeakMap<object, Set<string>>();

export function htmlAttributeNames(
	attributes: Readonly<Record<string, string>>,
): string[] {
	const order = orders.get(attributes);
	return order ? [...order] : Object.keys(attributes);
}

export function htmlAttributeEntries(
	attributes: Readonly<Record<string, string>>,
): [string, string][] {
	return htmlAttributeNames(attributes).map((name): [string, string] => [
		name,
		attributes[name],
	]);
}

export function createHtmlAttributes(
	source?: Readonly<Record<string, string>>,
): Record<string, string> {
	const attributes: Record<string, string> = Object.create(null);
	if (source)
		for (const [name, value] of htmlAttributeEntries(source))
			setHtmlAttribute(attributes, name, value);
	return attributes;
}

export function setHtmlAttribute(
	attributes: Record<string, string>,
	name: string,
	value: string,
): void {
	let order = orders.get(attributes);
	const index = Number(name);
	if (
		!order &&
		Number.isInteger(index) &&
		index >= 0 &&
		index < 4_294_967_295 &&
		String(index) === name
	)
		order = new Set(Object.keys(attributes));
	attributes[name] = value;
	if (order) {
		order.add(name);
		orders.set(attributes, order);
	}
}

export function removeHtmlAttribute(
	attributes: Record<string, string>,
	name: string,
): void {
	if (Reflect.deleteProperty(attributes, name))
		orders.get(attributes)?.delete(name);
}

export function snapshotHtmlAttributes(
	attributes: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
	const snapshot = Object.freeze({ ...attributes });
	const order = orders.get(attributes);
	if (order) orders.set(snapshot, new Set(order));
	return snapshot;
}
