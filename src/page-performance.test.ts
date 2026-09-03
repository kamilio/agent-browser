import { describe, expect, it } from "vitest";
import {
	PageClock,
	createPagePerformance,
	type PageClockSource,
} from "./page-performance.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

describe("owned page performance clock", () => {
	it("anchors at construction and measures monotonic elapsed milliseconds", () => {
		let reading = 125;
		const clock = new PageClock({ timeOrigin: 1000, now: () => reading });
		expect(clock.timeOrigin).toBe(1125);
		reading = 127.56;
		expect(clock.now()).toBe(2.5);
		reading = 126;
		expect(clock.now()).toBe(2.5);
		reading = 100;
		expect(clock.now()).toBe(2.5);
		reading = 128;
		expect(clock.now()).toBe(3);
		expect(clock.timeOrigin).toBe(1125);
		expect(clock.metrics()).toMatchObject({
			reads: 4,
			lastTimestamp: 3,
			precisionMs: 0.1,
		});
	});
	it("does not return negative elapsed time after a host rollback", () => {
		let reading = 10;
		const clock = new PageClock({ timeOrigin: 1000, now: () => reading });
		reading = 1;
		expect(clock.now()).toBe(0);
	});
	it("exposes one readonly capability with independent JSON records", () => {
		const clock = new PageClock({ timeOrigin: 1000, now: () => 5 });
		let definition!: ScriptHostObjectDefinition;
		const object = {};
		expect(
			createPagePerformance(
				{
					createHostObject: (value) => {
						definition = value;
						return object;
					},
				},
				clock,
			),
		).toBe(object);
		expect(definition.properties?.timeOrigin.set).toBeUndefined();
		expect(definition.properties?.timeOrigin.get()).toBe(1005);
		expect(definition.methods?.now()).toBe(0);
		const first = definition.methods?.toJSON() as { timeOrigin: number };
		first.timeOrigin = 0;
		expect(definition.methods?.toJSON()).toEqual({ timeOrigin: 1005 });
		clock.close();
		clock.close();
		expect(() => definition.properties?.timeOrigin.get()).toThrow(/closed/);
		expect(() => definition.methods?.now()).toThrow(/closed/);
		expect(() => definition.methods?.toJSON()).toThrow(/closed/);
		expect(clock.metrics().closed).toBe(true);
	});
	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"1",
	])("rejects invalid initial clock readings: %s", (reading) => {
		expect(
			() =>
				new PageClock({
					timeOrigin: 1000,
					now: () => reading,
				} as PageClockSource),
		).toThrow(/clock/);
	});
	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"1",
	])(
		"rejects invalid subsequent readings without poisoning metrics: %s",
		(value) => {
			let reading: unknown = 0;
			const clock = new PageClock({
				timeOrigin: 1000,
				now: () => reading,
			} as PageClockSource);
			reading = value;
			expect(() => clock.now()).toThrow(/clock/);
			expect(clock.metrics().reads).toBe(0);
			reading = 12;
			expect(clock.now()).toBe(12);
		},
	);
	it("rejects invalid sources and arithmetic overflow", () => {
		for (const source of [
			null,
			{},
			{ timeOrigin: Number.POSITIVE_INFINITY, now: () => 0 },
			{ timeOrigin: Number.MAX_VALUE, now: () => Number.MAX_VALUE },
		])
			expect(() => new PageClock(source as PageClockSource)).toThrow(/clock/);
	});
});
