import { expect, it, vi } from "vitest";
import {
	type ResponseAccountingLease,
	ResponseByteAccounting,
	claimResponseAccounting,
	validateResponseAccountingLease,
} from "./response-byte-accounting.js";

function rejects(operation: () => unknown, code = "invalid-input") {
	expect(operation).toThrowError(expect.objectContaining({ code }));
}

const invalid = [
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	null,
	"1",
	true,
	{},
	1n,
];

it.each([0, ...invalid])(
	"rejects invalid constructor limit %s without coercion",
	(value) => {
		rejects(() => new ResponseByteAccounting(value as number, 1));
		rejects(() => new ResponseByteAccounting(1, value as number));
	},
);

it("provides frozen detached scalar snapshots and opaque frozen handles", () => {
	const accounting = new ResponseByteAccounting(10, 2);
	const before = accounting.metrics();
	const lease = accounting.createLease();
	expect(Object.isFrozen(lease)).toBe(true);
	expect(Reflect.ownKeys(lease)).toEqual([]);
	expect(Object.isFrozen(before)).toBe(true);
	expect(before).toEqual({
		observedEncodedBytes: 0,
		observedDecodedBytes: 0,
		completedOnlyBytes: 0,
		nativeRequests: 0,
		completedOnlyRequests: 0,
		unmeteredFailures: 0,
		outstanding: 0,
		draining: 0,
		closed: false,
		overflowed: false,
		maxTotalBytes: 10,
		maxOutstanding: 2,
	});
	expect(
		Object.values(before).every(
			(value) => typeof value === "number" || typeof value === "boolean",
		),
	).toBe(true);
	validateResponseAccountingLease(lease);
	validateResponseAccountingLease(lease);
	const writer = claimResponseAccounting(lease);
	expect(Object.isFrozen(writer)).toBe(true);
	expect(Object.keys(writer).sort()).toEqual([
		"debit",
		"finish",
		"remainingBytes",
	]);
	writer.debit("decodedBytes", 3);
	accounting.close();
	expect(before.closed).toBe(false);
	expect(before.observedDecodedBytes).toBe(0);
	expect(accounting.metrics()).toMatchObject({
		observedDecodedBytes: 3,
		closed: true,
		outstanding: 1,
		draining: 1,
	});
	writer.finish();
});

it.each([
	undefined,
	null,
	1,
	"lease",
	false,
	{},
	Object.freeze({}),
	[],
	() => {},
	Symbol("lease"),
])("rejects forged handle %s without changing owner metrics", (value) => {
	const accounting = new ResponseByteAccounting(10, 1);
	const before = accounting.metrics();
	rejects(() => validateResponseAccountingLease(value));
	rejects(() => claimResponseAccounting(value));
	rejects(() => accounting.settle(value as ResponseAccountingLease, 1));
	rejects(() => accounting.abandon(value as ResponseAccountingLease));
	expect(accounting.metrics()).toEqual(before);
});

it("does not inspect forged getters or authenticate a clone or proxy of a real handle", () => {
	const accounting = new ResponseByteAccounting(10, 2);
	const lease = accounting.createLease();
	const inspect = vi.fn(() => {
		throw new Error("Unexpected handle inspection");
	});
	const forged = new Proxy(
		{},
		{ get: inspect, getPrototypeOf: inspect, ownKeys: inspect },
	);
	for (const value of [
		forged,
		{ ...lease },
		Object.create(lease),
		new Proxy(lease, {}),
	])
		rejects(() => claimResponseAccounting(value));
	expect(inspect).not.toHaveBeenCalled();
	expect(accounting.metrics()).toMatchObject({
		nativeRequests: 0,
		outstanding: 1,
	});
});

it("rejects cross-owner settlement and abandonment before mutation", () => {
	const first = new ResponseByteAccounting(10, 1);
	const second = new ResponseByteAccounting(10, 1);
	const lease = first.createLease();
	rejects(() => second.settle(lease, 4));
	rejects(() => second.abandon(lease));
	expect(first.metrics()).toMatchObject({
		outstanding: 1,
		completedOnlyBytes: 0,
	});
	expect(second.metrics()).toMatchObject({
		outstanding: 0,
		completedOnlyBytes: 0,
		unmeteredFailures: 0,
	});
	expect(first.settle(lease, 4)).toBe(true);
});

it("claims once without consuming another outstanding slot", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	expect(accounting.metrics()).toMatchObject({
		nativeRequests: 1,
		outstanding: 1,
		draining: 0,
	});
	rejects(() => claimResponseAccounting(lease));
	rejects(() => validateResponseAccountingLease(lease));
	rejects(() => accounting.createLease(), "resource-limit");
	writer.finish();
	writer.finish();
	expect(accounting.metrics().outstanding).toBe(0);
	rejects(() => claimResponseAccounting(lease));
	expect(() => accounting.createLease()).not.toThrow();
});

it.each(["encodedBytes", "decodedBytes"] as const)(
	"records entire crossing and subsequent observed %s chunks",
	(kind) => {
		const accounting = new ResponseByteAccounting(5, 1);
		const writer = claimResponseAccounting(accounting.createLease());
		expect(writer.debit(kind, 5)).toBe(true);
		expect(writer.debit(kind, 0)).toBe(true);
		expect(writer.remainingBytes()).toBe(0);
		expect(writer.debit(kind, 1)).toBe(false);
		expect(writer.debit(kind, 2)).toBe(false);
		expect(
			accounting.metrics()[
				kind === "encodedBytes"
					? "observedEncodedBytes"
					: "observedDecodedBytes"
			],
		).toBe(8);
		expect(writer.debit(kind, 0)).toBe(false);
		expect(accounting.metrics().overflowed).toBe(false);
		expect(() => accounting.createLease()).toThrowError(
			"Fetch response body limit exceeded",
		);
		writer.finish();
	},
);

it("never adds encoded and decoded dimensions together", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	expect(writer.debit("encodedBytes", 10)).toBe(true);
	expect(writer.debit("decodedBytes", 10)).toBe(true);
	writer.finish();
	expect(accounting.settle(lease, 10)).toBe(true);
	expect(accounting.metrics()).toMatchObject({
		observedEncodedBytes: 10,
		observedDecodedBytes: 10,
		completedOnlyBytes: 0,
		completedOnlyRequests: 0,
	});
	expect(accounting.remainingBytes()).toBe(0);
});

it.each(["encodedBytes", "decodedBytes"] as const)(
	"does not reject the other dimension after excess in %s",
	(kind) => {
		const accounting = new ResponseByteAccounting(10, 2);
		const first = claimResponseAccounting(accounting.createLease());
		const second = claimResponseAccounting(accounting.createLease());
		expect(first.debit(kind, 11)).toBe(false);
		expect(
			second.debit(
				kind === "encodedBytes" ? "decodedBytes" : "encodedBytes",
				10,
			),
		).toBe(true);
		expect(accounting.remainingBytes()).toBe(0);
	},
);

it("revalidates remaining admission for a minted but unclaimed lease", () => {
	const accounting = new ResponseByteAccounting(5, 2);
	const first = accounting.createLease();
	const pending = accounting.createLease();
	const writer = claimResponseAccounting(first);
	writer.debit("decodedBytes", 5);
	rejects(() => validateResponseAccountingLease(pending), "resource-limit");
	rejects(() => claimResponseAccounting(pending), "resource-limit");
	expect(accounting.metrics()).toMatchObject({
		nativeRequests: 1,
		outstanding: 2,
	});
	accounting.abandon(pending);
	writer.finish();
	expect(accounting.metrics().outstanding).toBe(0);
});

it.each(invalid)(
	"rejects invalid debit and settlement length %s before mutation",
	(value) => {
		const accounting = new ResponseByteAccounting(10, 2);
		const lease = accounting.createLease();
		const writer = claimResponseAccounting(lease);
		const before = accounting.metrics();
		rejects(() => writer.debit("encodedBytes", value as number));
		rejects(() => writer.debit("decodedBytes", value as number));
		rejects(() => accounting.settle(lease, value as number));
		expect(accounting.metrics()).toEqual(before);
		expect(accounting.settle(lease, 0)).toBe(true);
	},
);

it("rejects an invalid byte kind and does not coerce numeric objects", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const writer = claimResponseAccounting(accounting.createLease());
	const coerce = vi.fn(() => 1);
	rejects(() => writer.debit("body" as "encodedBytes", 1));
	rejects(() =>
		writer.debit("encodedBytes", { valueOf: coerce } as unknown as number),
	);
	expect(coerce).not.toHaveBeenCalled();
	expect(accounting.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 0,
	});
});

it("adds completed-only fallback to decoded totals but not encoded totals", () => {
	const accounting = new ResponseByteAccounting(10, 2);
	const native = accounting.createLease();
	const fallback = accounting.createLease();
	const writer = claimResponseAccounting(native);
	writer.debit("encodedBytes", 8);
	writer.debit("decodedBytes", 2);
	expect(accounting.settle(fallback, 7)).toBe(true);
	expect(accounting.remainingBytes()).toBe(1);
	expect(writer.remainingBytes()).toBe(1);
	expect(writer.debit("decodedBytes", 2)).toBe(false);
	expect(writer.debit("encodedBytes", 2)).toBe(true);
	expect(accounting.metrics()).toMatchObject({
		observedEncodedBytes: 10,
		observedDecodedBytes: 4,
		completedOnlyBytes: 7,
		completedOnlyRequests: 1,
	});
});

it.each([0, 3, 5, 7])(
	"settles native decoded deficit for completion length %s exactly once",
	(bodyBytes) => {
		const accounting = new ResponseByteAccounting(10, 1);
		const lease = accounting.createLease();
		const writer = claimResponseAccounting(lease);
		writer.debit("decodedBytes", 5);
		writer.finish();
		expect(accounting.settle(lease, bodyBytes)).toBe(true);
		expect(accounting.metrics()).toMatchObject({
			observedDecodedBytes: 5,
			completedOnlyBytes: Math.max(0, bodyBytes - 5),
			completedOnlyRequests: bodyBytes > 5 ? 1 : 0,
			outstanding: 0,
		});
		const snapshot = accounting.metrics();
		rejects(() => accounting.settle(lease, bodyBytes));
		rejects(() => accounting.settle(lease));
		expect(accounting.metrics()).toEqual(snapshot);
	},
);

it("records an entire rejected fallback deficit rather than truncating it", () => {
	const accounting = new ResponseByteAccounting(5, 1);
	const lease = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	writer.debit("decodedBytes", 2);
	writer.finish();
	expect(accounting.settle(lease, 8)).toBe(false);
	expect(accounting.metrics()).toMatchObject({
		observedDecodedBytes: 2,
		completedOnlyBytes: 6,
		completedOnlyRequests: 1,
	});
	expect(accounting.remainingBytes()).toBe(0);
});

it("counts unclaimed empty success without treating zero-byte settlement as admission", () => {
	const accounting = new ResponseByteAccounting(5, 2);
	const full = accounting.createLease();
	const empty = accounting.createLease();
	expect(accounting.settle(full, 6)).toBe(false);
	expect(accounting.settle(empty, 0)).toBe(true);
	expect(accounting.metrics()).toMatchObject({
		completedOnlyRequests: 2,
		completedOnlyBytes: 6,
		outstanding: 0,
	});
});

it.each(["encodedBytes", "decodedBytes"] as const)(
	"does not invalidate fully metered success because another operation exceeded %s",
	(kind) => {
		const accounting = new ResponseByteAccounting(5, 2);
		const completed = accounting.createLease();
		const later = accounting.createLease();
		const first = claimResponseAccounting(completed);
		const second = claimResponseAccounting(later);
		first.debit("decodedBytes", 2);
		first.finish();
		second.debit(kind, 6);
		expect(accounting.settle(completed, 2)).toBe(true);
		expect(accounting.metrics().completedOnlyBytes).toBe(0);
	},
);

it("does not make a decoded fallback fail because encoded traffic exceeded its dimension", () => {
	const accounting = new ResponseByteAccounting(5, 2);
	const native = claimResponseAccounting(accounting.createLease());
	const fallback = accounting.createLease();
	native.debit("encodedBytes", 6);
	expect(accounting.settle(fallback, 5)).toBe(true);
	expect(accounting.metrics()).toMatchObject({
		observedEncodedBytes: 6,
		completedOnlyBytes: 5,
	});
});

it.each(["settle-first", "abandon-first"])(
	"counts unclaimed rejection or abandonment once with %s",
	(order) => {
		const accounting = new ResponseByteAccounting(10, 1);
		const lease = accounting.createLease();
		if (order === "abandon-first") accounting.abandon(lease);
		expect(accounting.settle(lease)).toBe(false);
		accounting.abandon(lease);
		accounting.abandon(lease);
		expect(accounting.metrics()).toMatchObject({
			unmeteredFailures: 1,
			outstanding: 0,
			completedOnlyRequests: 0,
			observedDecodedBytes: 0,
		});
		rejects(() => claimResponseAccounting(lease));
		rejects(() => accounting.settle(lease));
	},
);

it("permits late unclaimed completion after abandonment and retains its failure history", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	accounting.abandon(lease);
	accounting.abandon(lease);
	rejects(() => claimResponseAccounting(lease));
	const next = accounting.createLease();
	expect(accounting.settle(lease, 7)).toBe(true);
	expect(accounting.settle(next, 4)).toBe(false);
	expect(accounting.metrics()).toMatchObject({
		unmeteredFailures: 1,
		completedOnlyRequests: 2,
		completedOnlyBytes: 11,
		outstanding: 0,
	});
});

it("does not count abandonment after successful settlement as an unmetered failure", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	accounting.settle(lease, 4);
	accounting.abandon(lease);
	expect(accounting.metrics()).toMatchObject({
		unmeteredFailures: 0,
		completedOnlyRequests: 1,
	});
	rejects(() => claimResponseAccounting(lease));
});

it.each(["abandon", "success", "failure"])(
	"keeps claimed capacity draining after %s until actual writer finish",
	(outcome) => {
		const accounting = new ResponseByteAccounting(20, 1);
		const lease = accounting.createLease();
		const writer = claimResponseAccounting(lease);
		writer.debit("decodedBytes", 2);
		if (outcome === "abandon") accounting.abandon(lease);
		else accounting.settle(lease, outcome === "success" ? 2 : undefined);
		expect(accounting.metrics()).toMatchObject({
			outstanding: 1,
			draining: 1,
			unmeteredFailures: 0,
		});
		rejects(() => accounting.createLease(), "resource-limit");
		expect(writer.debit("decodedBytes", 3)).toBe(true);
		writer.finish();
		writer.finish();
		expect(accounting.metrics()).toMatchObject({
			outstanding: 0,
			draining: 0,
			observedDecodedBytes: 5,
		});
		expect(() => accounting.createLease()).not.toThrow();
		if (outcome === "abandon") expect(accounting.settle(lease, 5)).toBe(true);
	},
);

it("releases finished native capacity even before provider outcome settlement", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	writer.debit("decodedBytes", 2);
	writer.finish();
	expect(accounting.metrics()).toMatchObject({ outstanding: 0, draining: 0 });
	const next = accounting.createLease();
	expect(accounting.settle(lease, 2)).toBe(true);
	writer.finish();
	expect(accounting.metrics().outstanding).toBe(1);
	accounting.abandon(next);
});

it("closes unclaimed leases but retains claimed leases until drained", () => {
	const accounting = new ResponseByteAccounting(20, 3);
	const unclaimed = accounting.createLease();
	const first = accounting.createLease();
	const second = accounting.createLease();
	const firstWriter = claimResponseAccounting(first);
	const secondWriter = claimResponseAccounting(second);
	firstWriter.debit("decodedBytes", 2);
	accounting.close();
	accounting.close();
	expect(accounting.metrics()).toMatchObject({
		closed: true,
		outstanding: 2,
		draining: 2,
		unmeteredFailures: 1,
	});
	rejects(() => accounting.createLease(), "closed");
	rejects(() => claimResponseAccounting(unclaimed));
	expect(firstWriter.debit("encodedBytes", 3)).toBe(false);
	expect(firstWriter.debit("decodedBytes", 4)).toBe(false);
	expect(accounting.settle(first, 6)).toBe(false);
	expect(accounting.settle(unclaimed, 5)).toBe(false);
	expect(accounting.metrics()).toMatchObject({
		observedEncodedBytes: 3,
		observedDecodedBytes: 6,
		completedOnlyBytes: 5,
		outstanding: 2,
		draining: 2,
	});
	firstWriter.finish();
	expect(accounting.metrics()).toMatchObject({ outstanding: 1, draining: 1 });
	secondWriter.finish();
	expect(accounting.metrics()).toMatchObject({ outstanding: 0, draining: 0 });
});

it("rejects debit after finish rather than losing late bytes silently", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const writer = claimResponseAccounting(accounting.createLease());
	writer.debit("decodedBytes", 2);
	writer.finish();
	const before = accounting.metrics();
	for (const bytes of [0, 1]) {
		rejects(() => writer.debit("encodedBytes", bytes), "closed");
		rejects(() => writer.debit("decodedBytes", bytes), "closed");
	}
	expect(accounting.metrics()).toEqual(before);
});

it("keeps tombstone accounting isolated from a different owner", () => {
	const first = new ResponseByteAccounting(10, 1);
	const second = new ResponseByteAccounting(10, 1);
	const lease = first.createLease();
	const writer = claimResponseAccounting(lease);
	first.abandon(lease);
	first.close();
	const before = second.metrics();
	writer.debit("decodedBytes", 11);
	first.settle(lease);
	writer.finish();
	expect(second.metrics()).toEqual(before);
	expect(second.remainingBytes()).toBe(10);
});

it.each(["encodedBytes", "decodedBytes"] as const)(
	"saturates overflowing %s counters without unsafe arithmetic or false acceptance",
	(kind) => {
		const accounting = new ResponseByteAccounting(Number.MAX_SAFE_INTEGER, 2);
		const lease = accounting.createLease();
		const writer = claimResponseAccounting(lease);
		const pending = accounting.createLease();
		expect(writer.debit(kind, Number.MAX_SAFE_INTEGER)).toBe(true);
		expect(accounting.metrics().overflowed).toBe(false);
		expect(writer.debit(kind, 1)).toBe(false);
		expect(writer.debit(kind, 0)).toBe(false);
		expect(accounting.metrics()).toMatchObject({
			overflowed: true,
			[kind === "encodedBytes"
				? "observedEncodedBytes"
				: "observedDecodedBytes"]: Number.MAX_SAFE_INTEGER,
		});
		expect(accounting.remainingBytes()).toBe(0);
		rejects(() => accounting.createLease(), "resource-limit");
		rejects(() => claimResponseAccounting(pending), "resource-limit");
		expect(
			writer.debit(
				kind === "encodedBytes" ? "decodedBytes" : "encodedBytes",
				1,
			),
		).toBe(true);
	},
);

it("detects unsafe combined decoded plus fallback totals without summing them", () => {
	const accounting = new ResponseByteAccounting(Number.MAX_SAFE_INTEGER, 2);
	const lease = accounting.createLease();
	const fallback = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	writer.debit("decodedBytes", Number.MAX_SAFE_INTEGER);
	expect(accounting.settle(fallback, 1)).toBe(false);
	expect(accounting.metrics()).toMatchObject({
		observedDecodedBytes: Number.MAX_SAFE_INTEGER,
		completedOnlyBytes: 1,
		overflowed: true,
	});
	expect(writer.debit("decodedBytes", 0)).toBe(false);
	expect(writer.debit("encodedBytes", 1)).toBe(true);
	writer.finish();
	expect(accounting.settle(lease, Number.MAX_SAFE_INTEGER)).toBe(true);
});

it("saturates completed-only bytes while still recording late settlements", () => {
	const accounting = new ResponseByteAccounting(Number.MAX_SAFE_INTEGER, 2);
	const first = accounting.createLease();
	const second = accounting.createLease();
	expect(accounting.settle(first, Number.MAX_SAFE_INTEGER)).toBe(true);
	expect(accounting.settle(second, 1)).toBe(false);
	expect(accounting.metrics()).toMatchObject({
		completedOnlyBytes: Number.MAX_SAFE_INTEGER,
		completedOnlyRequests: 2,
		overflowed: true,
		outstanding: 0,
	});
	rejects(() => accounting.createLease(), "resource-limit");
});

it("retains numeric remaining after close without admitting new work", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const writer = claimResponseAccounting(accounting.createLease());
	writer.debit("decodedBytes", 3);
	accounting.close();
	expect(accounting.remainingBytes()).toBe(7);
	expect(writer.remainingBytes()).toBe(7);
	expect(writer.debit("decodedBytes", 0)).toBe(false);
	rejects(() => accounting.createLease(), "closed");
	writer.finish();
});

it.each([
	["abandon", "settle", "finish"],
	["abandon", "finish", "settle"],
	["settle", "abandon", "finish"],
	["settle", "finish", "abandon"],
	["finish", "abandon", "settle"],
	["finish", "settle", "abandon"],
])("preserves native lifecycle ordering %s -> %s -> %s", (...operations) => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	const writer = claimResponseAccounting(lease);
	writer.debit("decodedBytes", 2);
	let finished = false;
	let draining = false;
	for (const operation of operations) {
		if (operation === "finish") {
			writer.finish();
			finished = true;
		} else {
			draining = true;
			if (operation === "abandon") accounting.abandon(lease);
			else expect(accounting.settle(lease, 2)).toBe(true);
		}
		expect(accounting.metrics()).toMatchObject({
			outstanding: finished ? 0 : 1,
			draining: draining && !finished ? 1 : 0,
			observedDecodedBytes: 2,
			completedOnlyBytes: 0,
			unmeteredFailures: 0,
		});
	}
	const next = accounting.createLease();
	writer.finish();
	accounting.abandon(lease);
	expect(accounting.metrics().outstanding).toBe(1);
	rejects(() => accounting.settle(lease, 2));
	accounting.abandon(next);
});

it("consumes an unclaimed successful lease without requiring abandonment", () => {
	const accounting = new ResponseByteAccounting(10, 1);
	const lease = accounting.createLease();
	expect(accounting.settle(lease, 2)).toBe(true);
	rejects(() => validateResponseAccountingLease(lease));
	rejects(() => claimResponseAccounting(lease));
	rejects(() => accounting.settle(lease, 2));
	expect(accounting.metrics()).toMatchObject({
		outstanding: 0,
		completedOnlyRequests: 1,
		completedOnlyBytes: 2,
		unmeteredFailures: 0,
	});
});
