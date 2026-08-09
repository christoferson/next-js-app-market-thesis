/**
 * Pure scoring primitives (SPEC §11.5). All strategy math flows through
 * these functions so formulas are testable and never scattered across UI.
 */

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Linear interpolation, higher is better: 0 points at or below `zeroScoreAt`,
 * full `weight` at or above `fullScoreAt`.
 */
export function scoreHigherIsBetter(
  value: number,
  zeroScoreAt: number,
  fullScoreAt: number,
  weight: number
): number {
  if (fullScoreAt === zeroScoreAt) {
    return value >= fullScoreAt ? weight : 0;
  }
  const fraction = (value - zeroScoreAt) / (fullScoreAt - zeroScoreAt);
  return clamp(fraction, 0, 1) * weight;
}

/**
 * Linear interpolation, lower is better: full `weight` at or below
 * `fullScoreAt`, 0 points at or above `zeroScoreAt`.
 */
export function scoreLowerIsBetter(
  value: number,
  fullScoreAt: number,
  zeroScoreAt: number,
  weight: number
): number {
  if (zeroScoreAt === fullScoreAt) {
    return value <= fullScoreAt ? weight : 0;
  }
  const fraction = (zeroScoreAt - value) / (zeroScoreAt - fullScoreAt);
  return clamp(fraction, 0, 1) * weight;
}
