export function isRecordLike(body: unknown): body is Record<string, unknown> {
	return typeof body === 'object' && body !== null && !Array.isArray(body);
}
