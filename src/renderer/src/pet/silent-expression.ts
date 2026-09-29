// Mili: payloads without audio (idle expressions, interaction reactions and
// their reset) carry only an expression. Upstream applied expressions only
// inside the audio branch, so these were silently dropped.

/** Expression to apply for a payload without audio, or null. */
export function expressionForSilentPayload(
  audioBase64: string | null | undefined,
  expressions: ReadonlyArray<string | number> | null | undefined,
): string | number | null {
  if (audioBase64) return null;
  const first = expressions?.[0];
  return first === undefined ? null : first;
}
