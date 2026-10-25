import { scaledNow } from './clock';

describe('scaledNow', () => {
  it('[M1-09] a scale of 1 returns the real time unchanged', () => {
    expect(scaledNow(1_000, 5_000, 1)).toBe(5_000);
  });

  it('[M1-09] the epoch itself maps to itself regardless of scale', () => {
    expect(scaledNow(1_000, 1_000, 1440)).toBe(1_000);
  });

  it('[M1-09] with the scale at 1440 a 22-hour flight completes in 55 ± 2 seconds', () => {
    const epochMs = 0;
    const twentyTwoHoursMs = 22 * 60 * 60 * 1000;
    const realElapsedMs = twentyTwoHoursMs / 1440;

    expect(realElapsedMs).toBeGreaterThanOrEqual(53_000);
    expect(realElapsedMs).toBeLessThanOrEqual(57_000);
    expect(scaledNow(epochMs, epochMs + realElapsedMs, 1440)).toBe(epochMs + twentyTwoHoursMs);
  });

  it('[M1-09] a larger scale amplifies the same real elapsed time further', () => {
    const withoutScale = scaledNow(0, 1_000, 1) - 0;
    const withScale = scaledNow(0, 1_000, 1440) - 0;
    expect(withScale).toBeGreaterThan(withoutScale);
    expect(withScale).toBe(1_000 * 1440);
  });
});
