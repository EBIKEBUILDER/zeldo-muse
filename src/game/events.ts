/**
 * Transient combat events: visual-only, never in the store.
 *
 * The simulation emits them (sword hits, breaks, deaths, hurts); the
 * actor sync drains the spark queue and the engine drains trauma for
 * camera shake. No React subscriber ever sees these.
 */

export type SparkKind = "hit" | "grass" | "pot" | "poof";

export interface Spark {
  x: number;
  z: number;
  kind: SparkKind;
}

const sparkQueue: Spark[] = [];

export function emitSpark(s: Spark): void {
  // Cap the queue so a wild frame can't flood the renderer.
  if (sparkQueue.length < 64) sparkQueue.push(s);
}

export function drainSparks(): Spark[] {
  return sparkQueue.splice(0, sparkQueue.length);
}

/** Camera shake trauma: 0 = none, 1 = full. Decays as it's consumed. */
let trauma = 0;

export function addTrauma(n: number): void {
  trauma = Math.min(1, trauma + n);
}

export function consumeTrauma(dt: number): number {
  const t = trauma;
  trauma = Math.max(0, trauma - dt * 2.2);
  return t;
}
