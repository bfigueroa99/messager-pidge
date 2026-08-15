import {
  arcSegments,
  bearingDeg,
  densify,
  haversineKm,
  interpolate,
  splitAtAntimeridian,
} from './geo';
import { LAX, LONDON, NYC, SYDNEY, TOKYO } from './__fixtures__/cities';
import { mulberry32 } from './rng';

describe('haversineKm', () => {
  it('[M0-02] measures LA to NYC as 3936 km, within 0.5%', () => {
    expect(haversineKm(LAX, NYC)).toBeCloseTo(3935.8, 0);
  });

  it('[M0-02] measures London to Sydney as 16994 km, within 0.5%', () => {
    const km = haversineKm(LONDON, SYDNEY);
    expect(Math.abs(km - 16994) / 16994).toBeLessThan(0.005);
  });

  it('[M0-02] is symmetric and zero for coincident points', () => {
    expect(haversineKm(LAX, NYC)).toBeCloseTo(haversineKm(NYC, LAX), 9);
    expect(haversineKm(LAX, LAX)).toBe(0);
  });
});

describe('interpolate', () => {
  it('[M0-02] returns the endpoints exactly at f=0 and f=1', () => {
    expect(interpolate(LAX, NYC, 0).lat).toBeCloseTo(LAX.lat, 9);
    expect(interpolate(LAX, NYC, 0).lon).toBeCloseTo(LAX.lon, 9);
    expect(interpolate(LAX, NYC, 1).lat).toBeCloseTo(NYC.lat, 9);
    expect(interpolate(LAX, NYC, 1).lon).toBeCloseTo(NYC.lon, 9);
  });

  it('[M0-02] clamps f outside [0,1] rather than extrapolating off the route', () => {
    expect(interpolate(LAX, NYC, -5)).toEqual(interpolate(LAX, NYC, 0));
    expect(interpolate(LAX, NYC, 5)).toEqual(interpolate(LAX, NYC, 1));
  });

  it('[M0-02] bows north of the chord — a great circle, not a straight line', () => {
    // Guards against someone "simplifying" slerp into a linear lat/lon blend.
    const mid = interpolate(LAX, NYC, 0.5);
    expect(mid.lat).toBeGreaterThan((LAX.lat + NYC.lat) / 2);
    expect(mid.lat).toBeCloseTo(39.5103, 2);
    expect(mid.lon).toBeCloseTo(-97.1601, 2);
  });

  it('[M0-02] returns a finite point for coincident and antipodal endpoints', () => {
    expect(interpolate(LAX, LAX, 0.5)).toEqual({ lat: LAX.lat, lon: LAX.lon });
    const antipode = { lat: -LAX.lat, lon: LAX.lon + 180 };
    const p = interpolate(LAX, antipode, 0.5);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lon)).toBe(true);
  });

  it('[M0-02] densified segment lengths sum to the great-circle distance', () => {
    const pts = densify(LAX, NYC, 64);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) sum += haversineKm(pts[i - 1]!, pts[i]!);
    expect(Math.abs(sum - haversineKm(LAX, NYC)) / haversineKm(LAX, NYC)).toBeLessThan(0.001);
  });

  it('[M0-02] holds the sum-of-segments property over 200 seeded random routes', () => {
    const rand = mulberry32(1337);
    for (let i = 0; i < 200; i++) {
      const a = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const b = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const direct = haversineKm(a, b);
      if (direct < 1) continue;
      const pts = densify(a, b, 64);
      let sum = 0;
      for (let j = 1; j < pts.length; j++) sum += haversineKm(pts[j - 1]!, pts[j]!);
      expect(Math.abs(sum - direct) / direct).toBeLessThan(0.005);
    }
  });
});

describe('bearingDeg', () => {
  it('[M0-02] gives LA to NYC an initial bearing of ~66 degrees', () => {
    expect(bearingDeg(LAX, NYC)).toBeCloseTo(65.92, 1);
  });

  it('[M0-02] always returns a value in [0,360)', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const a = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const b = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const deg = bearingDeg(a, b);
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThan(360);
    }
  });
});

describe('splitAtAntimeridian', () => {
  it('[M0-02] splits a Tokyo to LA route into two drawable segments', () => {
    // Without this the polyline streaks straight back across the whole map.
    expect(arcSegments(TOKYO, LAX).length).toBe(2);
  });

  it('[M0-02] leaves no segment containing a longitude jump over 180 degrees', () => {
    for (const seg of arcSegments(TOKYO, LAX)) {
      for (let i = 1; i < seg.length; i++) {
        expect(Math.abs(seg[i]!.lon - seg[i - 1]!.lon)).toBeLessThanOrEqual(180);
      }
    }
  });

  it('[M0-02] returns a single segment for a route that never crosses', () => {
    expect(arcSegments(LAX, NYC).length).toBe(1);
  });

  it('[M0-02] returns nothing for an empty path', () => {
    expect(splitAtAntimeridian([])).toEqual([]);
  });
});
