import { BASE_SPEED_KMH, MAX_DEATH_PROBABILITY, MIN_FLIGHT_MS } from './constants';
import { haversineKm } from './geo';
import { deathProbability, pickCause, sampleDeathFraction } from './hazard';
import { planFlight } from './plan';
import { mulberry32, streamFor } from './rng';
import { durationMs, effectiveSpeedKmh } from './speed';
import { ACROSS_THE_ROOM, LAX, LONDON, NYC, SYDNEY } from './__fixtures__/cities';

const T0 = 1_770_000_000_000; // a fixed epoch; the engine never reads a clock

describe('calibration against the original', () => {
  it('[M0-03] flies LA to NYC in about 22 hours, matching the original', () => {
    // This test IS the product spec. The original advertises 110 mph and
    // reports LA->NYC at 22 hours; both must stay true.
    const hours = durationMs(haversineKm(LAX, NYC), BASE_SPEED_KMH) / 3_600_000;
    expect(hours).toBeGreaterThan(21.5);
    expect(hours).toBeLessThan(23);
  });

  it('[M0-03] gives a 1000 km flight the original 0.2% risk', () => {
    const p = deathProbability({
      distanceKm: 1000,
      stormIntensity: 0,
      predatorPressure: 0,
      isFirstEverFlight: false,
    });
    expect(p).toBeCloseTo(0.002, 4);
  });

  it('[M0-03] floors a trivially short hop at the minimum flight time', () => {
    const plan = planFlight({
      origin: LAX,
      destination: ACROSS_THE_ROOM,
      departsAtMs: T0,
      seed: 1,
    });
    expect(plan.pub.arrivesAtMs - plan.pub.departsAtMs).toBe(MIN_FLIGHT_MS);
  });

  it('[M0-03] keeps even London to Sydney under the seven-day ceiling', () => {
    const plan = planFlight({ origin: LONDON, destination: SYDNEY, departsAtMs: T0, seed: 2 });
    const days = (plan.pub.arrivesAtMs - plan.pub.departsAtMs) / 86_400_000;
    expect(days).toBeGreaterThan(3);
    expect(days).toBeLessThan(7);
  });
});

describe('planFlight purity and determinism', () => {
  it('[M0-03] returns deep-equal results for identical inputs', () => {
    const input = { origin: LAX, destination: NYC, departsAtMs: T0, seed: 424242 };
    expect(planFlight(input)).toEqual(planFlight(input));
  });

  it('[M0-03] never reads the ambient clock', () => {
    const realNow = Date.now;
    Date.now = () => {
      throw new Error('planFlight must not read Date.now()');
    };
    try {
      expect(() =>
        planFlight({ origin: LAX, destination: NYC, departsAtMs: T0, seed: 7 }),
      ).not.toThrow();
    } finally {
      Date.now = realNow;
    }
  });

  it('[M0-03] produces different fates for different seeds on the same route', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 4000; seed++) {
      outcomes.add(
        planFlight({ origin: LONDON, destination: SYDNEY, departsAtMs: T0, seed }).secret.outcome,
      );
    }
    expect(outcomes.has('delivered')).toBe(true);
    expect(outcomes.has('died')).toBe(true);
  });
});

describe('the outcome is decided at release, and hidden', () => {
  it('[M0-03] keeps every hint of the outcome out of the public half', () => {
    // If any of this leaked, a client could show a user their bird is doomed
    // twenty hours in advance, and the product would be over.
    const plan = planFlight({ origin: LONDON, destination: SYDNEY, departsAtMs: T0, seed: 13 });
    const publicKeys = Object.keys(plan.pub);
    for (const forbidden of ['outcome', 'deathAtMs', 'deathFraction', 'deathPoint', 'cause']) {
      expect(publicKeys).not.toContain(forbidden);
    }
    expect(JSON.stringify(plan.pub)).not.toMatch(/died|hawk|storm|exhaustion/);
  });

  it('[M0-03] sets resolveAt to arrival for survivors and to death for the lost', () => {
    for (let seed = 0; seed < 500; seed++) {
      const plan = planFlight({ origin: LONDON, destination: SYDNEY, departsAtMs: T0, seed });
      if (plan.secret.outcome === 'delivered') {
        expect(plan.secret.resolveAtMs).toBe(plan.pub.arrivesAtMs);
        expect(plan.secret.deathAtMs).toBeNull();
        expect(plan.secret.cause).toBeNull();
      } else {
        expect(plan.secret.resolveAtMs).toBe(plan.secret.deathAtMs);
        expect(plan.secret.resolveAtMs).toBeLessThan(plan.pub.arrivesAtMs);
        expect(plan.secret.cause).not.toBeNull();
        expect(plan.secret.deathPoint).not.toBeNull();
      }
    }
  });
});

describe('hazard model', () => {
  it('[M0-03] observed loss over 20000 seeds matches the modelled probability', () => {
    const expected = deathProbability({
      distanceKm: haversineKm(LAX, NYC),
      stormIntensity: 0,
      predatorPressure: 0,
      isFirstEverFlight: false,
    });
    let died = 0;
    const N = 20000;
    for (let seed = 0; seed < N; seed++) {
      if (planFlight({ origin: LAX, destination: NYC, departsAtMs: T0, seed }).secret.outcome === 'died') {
        died++;
      }
    }
    expect(died / N).toBeGreaterThan(expected - 0.004);
    expect(died / N).toBeLessThan(expected + 0.004);
  });

  it('[M0-03] rises monotonically with distance', () => {
    const at = (km: number) =>
      deathProbability({ distanceKm: km, stormIntensity: 0, predatorPressure: 0, isFirstEverFlight: false });
    expect(at(8)).toBeLessThan(at(559));
    expect(at(559)).toBeLessThan(at(3936));
    expect(at(3936)).toBeLessThan(at(16994));
  });

  it('[M0-03] never exceeds the 8% ceiling, however brutal the route', () => {
    expect(
      deathProbability({
        distanceKm: 40000,
        stormIntensity: 1,
        predatorPressure: 1,
        isFirstEverFlight: false,
      }),
    ).toBeLessThanOrEqual(MAX_DEATH_PROBABILITY);
  });

  it('[M0-03] never kills a first-ever bird', () => {
    expect(
      deathProbability({
        distanceKm: 40000,
        stormIntensity: 1,
        predatorPressure: 1,
        isFirstEverFlight: true,
      }),
    ).toBe(0);
    const plan = planFlight({
      origin: LONDON,
      destination: SYDNEY,
      departsAtMs: T0,
      seed: 3,
      isFirstEverFlight: true,
    });
    expect(plan.secret.outcome).toBe('delivered');
  });

  it('[M0-03] is zero for a zero-length route', () => {
    expect(
      deathProbability({ distanceKm: 0, stormIntensity: 0, predatorPressure: 0, isFirstEverFlight: false }),
    ).toBe(0);
  });

  it('[M0-03] places deaths mid-route rather than at the loft door', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 1000; i++) {
      const f = sampleDeathFraction(rand);
      expect(f).toBeGreaterThanOrEqual(0.02);
      expect(f).toBeLessThanOrEqual(0.98);
    }
  });

  it('[M0-03] picks ocean causes over water and land causes over land', () => {
    const ocean = new Set<string>();
    const land = new Set<string>();
    for (let s = 0; s < 300; s++) {
      ocean.add(pickCause(streamFor(s, 'cause'), { lat: 30, lon: -40 }, true));
      land.add(pickCause(streamFor(s, 'cause'), { lat: 40, lon: -95 }, false));
    }
    expect([...ocean].every((c) => ['exhaustion', 'lost_bearings', 'storm'].includes(c))).toBe(true);
    expect(land.has('hawk')).toBe(true);
  });
});

describe('weather', () => {
  it('[M0-15] slows a bird in a storm, and a tailwind relieves a headwind without exceeding calm', () => {
    const calm = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity: 0, distanceKm: 1000 });
    const stormy = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity: 1, distanceKm: 1000 });
    const stormyHeadwind = effectiveSpeedKmh({ windComponentKmh: -25, stormIntensity: 1, distanceKm: 1000 });
    const stormyTailwind = effectiveSpeedKmh({ windComponentKmh: 25, stormIntensity: 1, distanceKm: 1000 });
    const calmTailwind = effectiveSpeedKmh({ windComponentKmh: 25, stormIntensity: 0, distanceKm: 1000 });

    expect(stormy).toBeLessThan(calm);
    // a tailwind measurably relieves the extra penalty a headwind would add during the same storm
    expect(stormyTailwind).toBeGreaterThan(stormyHeadwind);
    // but it never turns a stormy or a calm flight into something faster than calm itself
    expect(stormyTailwind).toBeLessThanOrEqual(calm);
    expect(calmTailwind).toBeLessThanOrEqual(calm);
  });

  it('[M0-15] never exceeds the wind-free speed for the same storm and distance', () => {
    const storms = [0, 0.25, 0.5, 0.75, 1];
    const distances = [50, 1000, 3936, 16994, 50000];
    const winds = [-5000, -25, -1, 0, 1, 25, 5000];

    for (const stormIntensity of storms) {
      for (const distanceKm of distances) {
        const windFree = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity, distanceKm });
        for (const windComponentKmh of winds) {
          expect(effectiveSpeedKmh({ windComponentKmh, stormIntensity, distanceKm })).toBeLessThanOrEqual(
            windFree,
          );
        }
      }
    }
  });

  it('[M0-15] clamps an extreme headwind at the same bound as the boundary value, and a tailwind never past zero effect', () => {
    const absurdHeadwind = effectiveSpeedKmh({ windComponentKmh: -5000, stormIntensity: 0, distanceKm: 1000 });
    const cappedHeadwind = effectiveSpeedKmh({ windComponentKmh: -25, stormIntensity: 0, distanceKm: 1000 });
    expect(absurdHeadwind).toBe(cappedHeadwind);

    const absurdTailwind = effectiveSpeedKmh({ windComponentKmh: 5000, stormIntensity: 0, distanceKm: 1000 });
    const noWind = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity: 0, distanceKm: 1000 });
    expect(absurdTailwind).toBe(noWind);
  });

  it('[M0-03] tires a bird on very long hauls', () => {
    const short = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity: 0, distanceKm: 100 });
    const long = effectiveSpeedKmh({ windComponentKmh: 0, stormIntensity: 0, distanceKm: 16000 });
    expect(long).toBeLessThan(short);
    expect(long / short).toBeGreaterThan(0.8);
  });
});
