import { expect, it, vi } from "vitest";
import { type PasskeyAuthenticator, PasskeyBroker } from "./passkeys.js";

const cases = [
	{ backupEligible: false, backedUp: false },
	{ backupEligible: false, backedUp: true },
	{ backupEligible: true, backedUp: false },
	{ backupEligible: true, backedUp: true },
].flatMap((backup) =>
	[false, true].flatMap((userVerified) =>
		[false, true].flatMap((extensionsIncluded) =>
			[0, 2, 32, 34].map((reservedMask) => ({
				...backup,
				userVerified,
				extensionsIncluded,
				reservedMask,
			})),
		),
	),
);

it.each(cases)(
	"checks synthetic BE=$backupEligible BS=$backedUp UV=$userVerified ED=$extensionsIncluded RFU=$reservedMask",
	async ({
		backupEligible,
		backedUp,
		userVerified,
		extensionsIncluded,
		reservedMask,
	}) => {
		const extensionData = new Uint8Array([
			0xa1, 0x64, 0x74, 0x65, 0x73, 0x74, 0xf5,
		]);
		const authenticatorData = new Uint8Array(
			37 + (extensionsIncluded ? extensionData.length : 0),
		);
		authenticatorData.set(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode("fixture.invalid"),
				),
			),
		);
		authenticatorData[32] =
			1 |
			(backupEligible ? 8 : 0) |
			(backedUp ? 16 : 0) |
			(userVerified ? 4 : 0) |
			(extensionsIncluded ? 128 : 0) |
			reservedMask;
		if (extensionsIncluded) authenticatorData.set(extensionData, 37);
		const credentialId = new Uint8Array([7, 8]);
		const signature = new Uint8Array([9]);
		const userHandle = new Uint8Array([6]);
		const originalAuthenticatorData = new Uint8Array(authenticatorData);
		const originalCredentialId = new Uint8Array(credentialId);
		const originalSignature = new Uint8Array(signature);
		const originalUserHandle = new Uint8Array(userHandle);
		const get = vi.fn<PasskeyAuthenticator["get"]>(async () => ({
			credentialId,
			authenticatorData,
			signature,
			userHandle,
			userConsented: true,
			userPresent: true,
			userVerified,
		}));
		const broker = new PasskeyBroker({
			capabilities: {
				algorithms: [-7],
				userVerification: userVerified,
				residentKey: false,
				attachment: "cross-platform",
			},
			create: async () => {
				throw new Error("Synthetic assertion fixture does not register");
			},
			get,
		});
		try {
			const result = broker.get(
				{
					challenge: new Uint8Array([1, 2, 3]),
					rpId: "fixture.invalid",
					allowCredentials: [
						{ type: "public-key", id: new Uint8Array(credentialId) },
					],
					userVerification: userVerified ? "required" : "discouraged",
				},
				{
					origin: "https://fixture.invalid",
					topLevel: true,
					isCurrent: () => true,
				},
			);
			if (backedUp && !backupEligible) {
				await expect(result).rejects.toMatchObject({
					name: "NotAllowedError",
				});
			} else {
				const credential = await result;
				expect(new Uint8Array(credential.response.authenticatorData)).toEqual(
					originalAuthenticatorData,
				);
				expect(credential.response.authenticatorData).not.toBe(
					authenticatorData.buffer,
				);
			}
			expect(get).toHaveBeenCalledTimes(1);
			expect(authenticatorData).toEqual(originalAuthenticatorData);
			expect(credentialId).toEqual(originalCredentialId);
			expect(signature).toEqual(originalSignature);
			expect(userHandle).toEqual(originalUserHandle);
		} finally {
			broker.close();
		}
	},
);
