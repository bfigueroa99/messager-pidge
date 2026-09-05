import { hashString, mulberry32, streamFor } from './rng';

describe('mulberry32', () => {
  // Golden vector. If a refactor changes the PRNG, every flight ever planned
  // would silently get a different fate — so this must fail loudly.
  it('[M0-03] reproduces its golden vector for seed 42', () => {
    const rand = mulberry32(42);
    const got = Array.from({ length: 8 }, () => Number(rand().toFixed(12)));
    expect(got).toEqual([
      0.60110375192, 0.448290558998, 0.85246579349, 0.669734041439, 0.174813898746,
      0.526592542185, 0.27322799433, 0.624744653935,
    ]);
  });

  it('[M0-03] is reproducible across independent instances', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('[M0-03] stays within [0,1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('[M0-03] has a roughly uniform mean over many draws', () => {
    const rand = mulberry32(31337);
    let sum = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) sum += rand();
    expect(sum / N).toBeCloseTo(0.5, 2);
  });
});

describe('streamFor', () => {
  it('[M0-03] gives each named stream an independent sequence', () => {
    // Without this, adding a new roll to the planner would shift every
    // subsequent draw and rewrite the fate of every future flight.
    const survival = streamFor(99, 'survival');
    const death = streamFor(99, 'death');
    expect(survival()).not.toBe(death());
  });

  it('[M0-03] is stable for the same seed and stream name', () => {
    expect(streamFor(5, 'weather')()).toBe(streamFor(5, 'weather')());
  });
});

describe('hashString', () => {
  it('[M0-03] is deterministic and distinguishes the stream names', () => {
    expect(hashString('survival')).toBe(hashString('survival'));
    expect(hashString('survival')).not.toBe(hashString('death'));
  });
});
