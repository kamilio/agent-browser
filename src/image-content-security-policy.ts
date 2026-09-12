import { ContentSecurityPolicy } from "./content-security-policy.js";

export class ImageContentSecurityPolicy extends ContentSecurityPolicy {
	constructor(documentUrl: string, headerValues: readonly string[]) {
		super(documentUrl, headerValues, "image");
	}
}
