const encoder = new TextEncoder();

/**
 * Compare secrets without early returns to reduce timing side-channel leakage.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);

  let mismatchCount = leftBytes.length === rightBytes.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    if ((leftBytes[index] ?? 0) !== (rightBytes[index] ?? 0)) {
      mismatchCount += 1;
    }
  }

  return mismatchCount === 0;
}
