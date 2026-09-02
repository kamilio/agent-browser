import { expect, it } from "vitest";
import { PlaygroundAuth } from "./playground-auth.js";

it("requires approval and delivers a distinct window token exactly once", () => {
	const auth = new PlaygroundAuth();
	const pair = auth.start();
	expect(auth.poll(pair.id)).toMatchObject({ approved: false });
	expect(auth.approve(pair.code.toLowerCase())).toEqual({ approved: true });
	expect(auth.approve(pair.code)).toEqual({ approved: true });
	const result = auth.poll(pair.id);
	if (!result.approved) throw new Error("Missing approval");
	expect(auth.authorize(result.token)).toBe(true);
	expect(new PlaygroundAuth().authorize(result.token)).toBe(false);
	expect(() => auth.poll(pair.id)).toThrow(/expired or unknown/);
	expect(auth.revoke(result.token)).toBe(true);
	expect(auth.authorize(result.token)).toBe(false);
});

it("expires pending and undelivered approvals after 90 seconds", () => {
	let now = 0;
	const auth = new PlaygroundAuth(() => now);
	const pending = auth.start();
	const approved = auth.start();
	auth.approve(approved.code);
	now = 90_000;
	expect(() => auth.approve(pending.code)).toThrow(/expired/);
	expect(() => auth.poll(approved.id)).toThrow(/expired/);
	expect(auth.metrics()).toEqual({ pending: 0, connected: 0, closed: false });
});

it("keeps delivered tokens for thirty minutes without extending on access", () => {
	let now = 0;
	const auth = new PlaygroundAuth(() => now);
	const pair = auth.start();
	auth.approve(pair.code);
	const result = auth.poll(pair.id);
	if (!result.approved) throw new Error("Missing approval");
	now = 1_799_999;
	expect(auth.authorize(result.token)).toBe(true);
	now++;
	expect(auth.authorize(result.token)).toBe(false);
});

it("bounds pending requests and live windows independently", () => {
	const auth = new PlaygroundAuth();
	const pairs = Array.from({ length: 8 }, () => auth.start());
	expect(() => auth.start()).toThrow(/Too many pending/);
	for (const pair of pairs) {
		auth.approve(pair.code);
		auth.poll(pair.id);
	}
	expect(() => auth.approve(auth.start().code)).toThrow(/Too many connected/);
	expect(auth.metrics()).toEqual({ pending: 1, connected: 8, closed: false });
	auth.close();
	expect(auth.metrics()).toEqual({ pending: 0, connected: 0, closed: true });
	expect(() => auth.start()).toThrow(/closed/);
});

it.each([null, 42, {}, "", "../secret", "x".repeat(1000)])(
	"rejects malformed pairing inputs %j",
	(value) => {
		const auth = new PlaygroundAuth();
		expect(() => auth.approve(value)).toThrow(/Invalid/);
		expect(() => auth.poll(value)).toThrow(/Invalid/);
		expect(auth.authorize(String(value))).toBe(false);
	},
);
