/**
 * Server-side face descriptor comparison. Same Euclidean distance as client.
 * Used so the match decision cannot be faked by the client.
 */
export function descriptorDistanceServer(a: number[], b: number[]): number {
  if (a.length !== 128 || b.length !== 128) return Infinity;
  let sum = 0;
  for (let i = 0; i < 128; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Stricter threshold: same as client. Only server sets cookie if below this. */
export const FACE_MATCH_THRESHOLD = 0.38;
