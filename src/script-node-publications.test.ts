import { expect, it } from "vitest";
import { ScriptNodePublications } from "./script-node-publications.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

function operations(definition: ScriptHostObjectDefinition): (() => unknown)[] {
	return [
		() => definition.properties?.value.get(),
		() => definition.properties?.value.set?.("next"),
		() => definition.methods?.act(),
		() => definition.indexed?.length(),
		() => definition.indexed?.get(0),
		() => definition.named?.keys(),
		() => definition.named?.get("key"),
		() => definition.named?.set?.("key", "next"),
		() => definition.named?.delete?.("key"),
	];
}

function fixture() {
	let calls = 0;
	const record = () => {
		calls++;
		return "value";
	};
	const definition: ScriptHostObjectDefinition = {
		properties: { value: { get: record, set: record } },
		methods: { act: record },
		indexed: {
			maxLength: 8,
			length: () => {
				record();
				return 1;
			},
			get: record,
		},
		named: {
			maxKeys: 8,
			maxKeyCodeUnits: 100,
			enumerable: false,
			keys: () => {
				record();
				return ["key"];
			},
			get: record,
			set: record,
			delete: () => {
				record();
				return true;
			},
		},
	};
	let captured: ScriptHostObjectDefinition | undefined;
	let provide: (value: ScriptHostObjectDefinition) => object = () => ({});
	const owner = new ScriptNodePublications(
		{
			createHostObject(value) {
				captured = value;
				return provide(value);
			},
		},
		() => {},
	);
	return {
		owner,
		definition,
		calls: () => calls,
		provider: (value: typeof provide) => {
			provide = value;
		},
		captured: () => {
			if (!captured) throw new Error("Missing definition");
			return captured;
		},
		publish: () => owner.publish("node", 1, definition, () => {}),
	};
}

it("blocks every callback surface until publication finishes", () => {
	const data = fixture();
	data.provider((definition) => {
		for (const operation of operations(definition))
			expect(operation).toThrow("not published");
		expect(data.owner.metrics().pending).toBe(1);
		return {};
	});
	data.publish();
	expect(data.calls()).toBe(0);
	for (const operation of operations(data.captured())) operation();
	expect(data.calls()).toBe(9);
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 1,
		failed: 0,
	});
});

it("keeps captured callbacks permanently revoked after a factory exception", () => {
	const data = fixture();
	data.provider(() => {
		throw new Error("factory failed");
	});
	expect(data.publish).toThrow("factory failed");
	const captured = data.captured();
	data.provider(() => ({}));
	data.publish();
	for (const operation of operations(captured))
		expect(operation).toThrow("not published");
	expect(data.calls()).toBe(0);
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 1,
		failed: 1,
	});
});

it("keeps callbacks unavailable throughout registry commit", () => {
	const data = fixture();
	data.owner.publish("node", 1, data.definition, () => {
		for (const operation of operations(data.captured()))
			expect(operation).toThrow("not published");
	});
	expect(data.calls()).toBe(0);
});

it("revokes all callbacks when registration fails", () => {
	const data = fixture();
	expect(() =>
		data.owner.publish("node", 1, data.definition, () => {
			throw new Error("registration failed");
		}),
	).toThrow("registration failed");
	for (const operation of operations(data.captured()))
		expect(operation).toThrow("not published");
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 0,
		failed: 1,
	});
});

it("never reuses an identity whose registration failed", () => {
	const data = fixture();
	const capability = {};
	data.provider(() => capability);
	expect(() =>
		data.owner.publish("node", 1, data.definition, () => {
			throw new Error("failed");
		}),
	).toThrow("failed");
	expect(data.publish).toThrow("identity");
});

it("revokes all published callback surfaces at owner close", () => {
	const data = fixture();
	data.publish();
	data.owner.close();
	data.owner.close();
	for (const operation of operations(data.captured()))
		expect(operation).toThrow("closed");
	expect(data.publish).toThrow("closed");
	expect(data.calls()).toBe(0);
});

it("rejects closure during the provider without running commit", () => {
	const data = fixture();
	let committed = false;
	data.provider(() => {
		data.owner.close();
		return {};
	});
	expect(() =>
		data.owner.publish("node", 1, data.definition, () => {
			committed = true;
		}),
	).toThrow("closed");
	expect(committed).toBe(false);
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 0,
		closed: true,
	});
});

it("rejects closure during registration without publishing", () => {
	const data = fixture();
	expect(() =>
		data.owner.publish("node", 1, data.definition, () => data.owner.close()),
	).toThrow("closed");
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 0,
		closed: true,
	});
});

it("retains bounded indexed/named metadata and omits absent surfaces", () => {
	const data = fixture();
	data.publish();
	expect(data.captured().indexed).toMatchObject({ maxLength: 8 });
	expect(data.captured().named).toMatchObject({
		maxKeys: 8,
		maxKeyCodeUnits: 100,
		enumerable: false,
	});
	data.owner.publish("node", 2, {}, () => {});
	expect(Object.keys(data.captured())).toEqual([]);
});

it("checks ownership before and after synchronous callbacks", () => {
	const data = fixture();
	data.definition.methods = {
		act: () => {
			data.owner.close();
			return "stale";
		},
	};
	data.publish();
	expect(() => data.captured().methods?.act()).toThrow("closed");
});

it("allows nested publication of different IDs and releases each slot", () => {
	const data = fixture();
	let nested = false;
	data.provider(() => {
		if (!nested) {
			nested = true;
			data.owner.publish("node", 2, {}, () => {});
		}
		return {};
	});
	data.publish();
	expect(data.owner.metrics()).toMatchObject({
		pending: 0,
		published: 2,
		failed: 0,
	});
});

it("rejects same-kind/ID reentrancy but allows a different kind", () => {
	const data = fixture();
	let nested = false;
	data.provider(() => {
		if (!nested) {
			nested = true;
			expect(data.publish).toThrow("Reentrant");
			data.owner.publish("attribute-map", 1, {}, () => {});
		}
		return {};
	});
	data.publish();
	expect(data.owner.metrics().published).toBe(2);
});

it("bounds recursive publication to 128 active slots", () => {
	const data = fixture();
	let next = 1;
	let maximum = 0;
	data.provider(() => {
		maximum = Math.max(maximum, data.owner.metrics().pending);
		next++;
		if (next <= 128) data.owner.publish("node", next, {}, () => {});
		else
			expect(() => data.owner.publish("node", next, {}, () => {})).toThrow(
				"depth limit",
			);
		return {};
	});
	data.publish();
	expect(maximum).toBe(128);
	expect(data.owner.metrics()).toMatchObject({ pending: 0, published: 128 });
});

it("reserves identities across independent publication owners and kinds", () => {
	const first = fixture();
	const second = fixture();
	const capability = first.publish();
	second.provider(() => capability);
	expect(() => second.owner.publish("attribute-map", 2, {}, () => {})).toThrow(
		"identity",
	);
	first.owner.close();
	expect(second.publish).toThrow("identity");
});

it("consults the enclosing owner before starting the provider", () => {
	let provided = false;
	const owner = new ScriptNodePublications(
		{
			createHostObject() {
				provided = true;
				return {};
			},
		},
		() => {
			throw new Error("enclosing owner closed");
		},
	);
	expect(() => owner.publish("node", 1, {}, () => {})).toThrow(
		"enclosing owner closed",
	);
	expect(provided).toBe(false);
	expect(owner.metrics().pending).toBe(0);
});

it("does not start the provider if the enclosing-owner check closes publication", () => {
	let provided = false;
	const owner: ScriptNodePublications = new ScriptNodePublications(
		{
			createHostObject() {
				provided = true;
				return {};
			},
		},
		() => owner.close(),
	);
	expect(() => owner.publish("node", 1, {}, () => {})).toThrow("closed");
	expect(provided).toBe(false);
	expect(owner.metrics().pending).toBe(0);
});
