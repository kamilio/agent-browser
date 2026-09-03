export function htmlAttributeName(name: string): string {
	return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
