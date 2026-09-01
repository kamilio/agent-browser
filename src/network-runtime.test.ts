import { expect, it } from "vitest";
import { NodeNetworkTransport } from "./node-transport.js";

it("only enables networking on the verified Node host", () => {
	if (typeof Bun !== "undefined") {
		expect(() => new NodeNetworkTransport()).toThrow(
			"Networking requires Node.js",
		);
		return;
	}
	const client = new NodeNetworkTransport();
	expect(client.metrics().closed).toBe(false);
	client.close();
	expect(client.metrics().closed).toBe(true);
});
