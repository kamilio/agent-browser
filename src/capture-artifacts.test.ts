import { expect, it } from "vitest";
import {
	CaptureArtifacts,
	type CaptureDetails,
	captureArtifactLimits,
	decodeArtifactChunk,
	validateCaptureArtifact,
} from "./capture-artifacts.js";

const details: CaptureDetails = {
	mediaType: "image/png",
	partial: true,
	profile: "normal-flow-solid-colors",
	document: "doc",
	revision: 1,
	target: null,
	width: 100,
	height: 100,
	deviceScaleFactor: 1,
	hires: false,
	clip: { x: 0, y: 0, width: 100, height: 100 },
	paint: {
		work: 0,
		paintedGlyphs: 0,
		clippedGlyphs: 0,
		hiddenGlyphs: 0,
		blankGlyphs: 0,
		transparentGlyphs: 0,
		paintedBackgrounds: 0,
		inlineFragments: 0,
	},
};

it("owns immutable bytes and metadata without exposing another session", () => {
	const store = new CaptureArtifacts();
	const bytes = new Uint8Array(70_000).fill(42);
	const info = store.add("first", bytes, details);
	bytes.fill(0);
	expect(Object.isFrozen(info) && Object.isFrozen(info.clip)).toBe(true);
	expect(store.list("second")).toEqual([]);
	expect(() => store.read("second", info.id, 0)).toThrow("not found");
	expect(() => store.delete("second", info.id)).toThrow("not found");
	const chunk = store.read("first", info.id, 0);
	expect(chunk.bytes).toBe(65_536);
	expect(decodeArtifactChunk(chunk, info, 0).every((byte) => byte === 42)).toBe(
		true,
	);
	expect(store.read("first", info.id, 65_536)).toMatchObject({
		bytes: 4464,
		eof: true,
	});
	expect(store.read("first", info.id, 70_000)).toMatchObject({
		bytes: 0,
		eof: true,
		data: "",
	});
	store.clear("second");
	expect(store.metrics().bytes).toBe(70_000);
	store.clear("first");
	expect(store.metrics()).toMatchObject({ bytes: 0, artifacts: 0 });
	expect(() => store.read("first", info.id, 0)).toThrow();
});

it("never reuses artifact identities across stores or after clear", () => {
	const first = new CaptureArtifacts();
	const second = new CaptureArtifacts();
	const original = first.add("owner", new Uint8Array(64), details);
	first.clear("owner");
	expect(first.add("owner", new Uint8Array(64), details).id).not.toBe(
		original.id,
	);
	expect(second.add("owner", new Uint8Array(64), details).id).not.toBe(
		original.id,
	);
});

it("enforces record and retained-byte limits without evicting existing captures", () => {
	const store = new CaptureArtifacts();
	for (let index = 0; index < captureArtifactLimits.maxArtifacts; index++)
		store.add("owner", new Uint8Array(64), details);
	expect(() => store.add("owner", new Uint8Array(64), details)).toThrow(
		"storage limit",
	);
	expect(store.list("owner")).toHaveLength(8);
	store.clear("owner");
	const large = store.add(
		"owner",
		new Uint8Array(captureArtifactLimits.maxBytes),
		details,
	);
	expect(() => store.assertCapacity()).toThrow("storage limit");
	store.delete("owner", large.id);
	expect(store.metrics().bytes).toBe(0);
});

it.each([
	[-1, 1],
	[0, 0],
	[0, 65_537],
	[65, 1],
	[0.5, 1],
	[0, 1.5],
	[Number.NaN, 1],
])("rejects invalid ranges %s/%s", (offset, length) => {
	const store = new CaptureArtifacts();
	const info = store.add("owner", new Uint8Array(64), details);
	expect(() => store.read("owner", info.id, offset, length)).toThrow(
		"byte range",
	);
});

it("rejects forged, mismatched or noncanonical chunks and metadata", () => {
	const store = new CaptureArtifacts();
	const info = store.add("owner", new Uint8Array(64), details);
	expect(validateCaptureArtifact(info)).toBe(info);
	for (const change of [
		{ id: "../x" },
		{ bytes: Number.POSITIVE_INFINITY },
		{ mediaType: "text/html" },
		{ width: 4097 },
		{ partial: false },
	])
		expect(() => validateCaptureArtifact({ ...info, ...change })).toThrow();
	const chunk = store.read("owner", info.id, 0);
	for (const change of [
		{ id: "wrong" },
		{ offset: 1 },
		{ bytes: 63 },
		{ eof: false },
		{ encoding: "hex" },
		{ totalBytes: 65 },
		{ data: chunk.data.slice(1) },
		{ data: `${chunk.data.slice(0, -3)}B==` },
	])
		expect(() =>
			decodeArtifactChunk({ ...chunk, ...change }, info, 0),
		).toThrow();
});
