import {
	pageDomConstructorBootstrapGlobal,
	pageDomInterfaces,
} from "./page-dom-constructor-bootstrap.js";
import type { ReleasedContext } from "./safejs-extension-types.js";

export function nativeDomConstructorBindings(
	owner: ReleasedContext,
	globals: Record<string, unknown>,
): Record<string, unknown> {
	const create = owner.createHostConstructor;
	const brand = globals[pageDomConstructorBootstrapGlobal];
	if (typeof create !== "function" || typeof brand !== "function")
		return globals;
	const constructors = new Map<string, object>();
	owner.onCleanup(() => {
		constructors.clear();
	});
	return {
		...globals,
		[pageDomConstructorBootstrapGlobal]: Object.assign(
			(value: unknown, name: unknown) => brand(value, name),
			{
				createConstructor(name: unknown) {
					owner.signal.throwIfAborted();
					if (
						typeof name !== "string" ||
						!Object.hasOwn(pageDomInterfaces, name)
					)
						throw new TypeError("Unknown DOM interface");
					const existing = constructors.get(name);
					if (existing) return existing;
					const definition = pageDomInterfaces[name];
					const parent = definition.parent
						? constructors.get(definition.parent)
						: undefined;
					if (definition.parent && !parent)
						throw new TypeError("DOM parent interface is not initialized");
					const interfaceValue = create.call(
						owner,
						name,
						() => {
							throw new TypeError("Illegal constructor");
						},
						{
							...(parent ? { parent } : {}),
							hasInstance: (value) => brand(value, name),
							constants: definition.constants,
						},
					);
					constructors.set(name, interfaceValue);
					return interfaceValue;
				},
			},
		),
	};
}
