import { expect, it } from "vitest";
import {
	uploadCommandSummary,
	uploadRequest,
	uploadTarget,
} from "./upload-protocol.js";

const target = {
	documentId: "00000000-0000-0000-0000-000000000001",
	reference: "e1",
	version: 0,
};

it.each([
	null,
	{},
	[],
	{ ...target, path: "/private/file" },
	{ ...target, documentId: "wrong" },
	{ ...target, reference: "../file" },
	{ ...target, reference: "e0" },
	{ ...target, version: -1 },
	{ ...target, version: 0.5 },
	{ ...target, version: Number.MAX_SAFE_INTEGER },
])("rejects malformed or overbroad targets: %s", (value) => {
	expect(() => uploadTarget(value)).toThrow();
});

it.each([
	{ target, paths: ["/private/file"], files: [] },
	{ target, files: {} },
	{ target, files: [null] },
	{ target, files: [{ name: "file", bytes: 1, path: "/private/file" }] },
	{ target, files: [{ name: "file", bytes: 1, data: "AA==" }] },
	{ target, files: [{ name: "../file", bytes: 1 }] },
	{ target, files: [{ name: "file", bytes: -1 }] },
	{ target, files: [{ name: "file", bytes: 0.5 }] },
	{ target, files: [{ name: "file", bytes: Number.NaN }] },
	{ target, files: [{ name: "file", bytes: 1, type: "a\r\nb" }] },
	{ target, files: [{ name: "file", bytes: 8_388_609 }] },
])(
	"rejects metadata containing local paths, embedded data or invalid descriptors: %s",
	(value) => {
		expect(() => uploadRequest(value)).toThrow();
	},
);

it("copies and freezes metadata and redacts every command argument", () => {
	const value = {
		target: { ...target },
		files: [{ name: "private-name", bytes: 1 }],
	};
	const result = uploadRequest(value);
	value.target.reference = "e2";
	value.files[0].name = "different";
	expect(result.target.reference).toBe("e1");
	expect(result.files[0].name).toBe("private-name");
	expect(Object.isFrozen(result.files[0])).toBe(true);
	expect(
		uploadCommandSummary([
			"upload-write",
			"private-document",
			"private-transfer",
			"0",
			"0",
			"c2VjcmV0",
		]),
	).toEqual({ command: "upload-write", arguments: 5, redacted: true });
	expect(uploadCommandSummary(["/private/name"])).toEqual({
		command: "unsupported",
		arguments: 0,
		redacted: true,
	});
});

it("rejects accessor-based metadata before invoking it or allocating advertised bytes", () => {
	let reads = 0;
	const file = {
		name: "file",
		get bytes() {
			reads++;
			return Number.MAX_SAFE_INTEGER;
		},
	};
	expect(() => uploadRequest({ target, files: [file] })).toThrow(
		/data properties/,
	);
	expect(reads).toBe(0);
	expect(() =>
		uploadRequest({ target, files: [], [Symbol("hidden")]: "private" }),
	).toThrow(/record/);
});
