export function isRecordLike(body: unknown): body is Record<string, unknown> {
	return typeof body === 'object' && body !== null && !Array.isArray(body);
}

export function isServiceError(e: unknown): e is Error & {code: string; context?: unknown} {
	return (e instanceof Error) && ('code' in e);
}
