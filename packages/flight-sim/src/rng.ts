/**
 * mulberry32: a small, fast, well-distributed 32-bit PRNG.
 *
 * Chosen because it is five lines, has no dependencies, and produces bit-identical
 * output in Hermes, Deno and Node. A flight's fate is rolled once on the server
 * and must stay reproducible forever, including in golden tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, so a stream name maps to a stable 32-bit offset. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type RngStream = 'survival' | 'death' | 'cause' | 'weather' | 'events';

/**
 * Give every kind of roll its own independent stream.
 *
 * If all rolls shared one sequence, inserting a single new `if` in the planner
 * would shift every subsequent draw and silently rewrite the outcome of every
 * future flight — breaking every golden test for reasons that look unrelated
 * to the change. Namespacing makes the model extensible.
 */
export function streamFor(seed: number, ns: RngStream): () => number {
  return mulberry32((seed ^ hashString(ns)) >>> 0);
}
