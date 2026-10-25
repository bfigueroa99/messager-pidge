/**
 * Every clock read anywhere in the app passes through this one function
 * (M1-09). `scale` amplifies elapsed *real* time relative to `epochMs`, so a
 * flight timed in real hours can be watched end to end in real seconds
 * without lying about how much simulated time actually passed — at
 * `realNowMs === epochMs` nothing has elapsed yet regardless of scale, and
 * every millisecond of real time after that counts for `scale` app-clock
 * milliseconds.
 *
 * Pure: `realNowMs` is a parameter, never read from `Date.now()` — the
 * caller, never this engine, decides what "real" is.
 */
export function scaledNow(epochMs: number, realNowMs: number, scale: number): number {
  return epochMs + (realNowMs - epochMs) * scale;
}
