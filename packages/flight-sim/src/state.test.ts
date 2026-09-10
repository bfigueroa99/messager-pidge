import { haversineKm } from './geo';
import { planFlight } from './plan';
import { flightStateAt, lostStateAt } from './state';
import { formatDistance, formatEta } from './format';
import { LAX, NYC } from './__fixtures__/cities';

const T0 = 1_770_000_000_000;
const plan = planFlight({ origin: LAX, destination: NYC, departsAtMs: T0, seed: 11 });
const f = plan.pub;
const totalMs = f.arrivesAtMs - f.departsAtMs;

describe('flightStateAt', () => {
  it('[M0-04] sits at the origin before departure', () => {
    const s = flightStateAt(f, T0 - 1000);
    expect(s.phase).toBe('scheduled');
    expect(s.progress).toBe(0);
    expect(s.position).toEqual(LAX);
  });

  it('[M0-04] is at the destination once the arrival time has passed', () => {
    const s = flightStateAt(f, f.arrivesAtMs + 86_400_000);
    expect(s.phase).toBe('arrived');
    expect(s.progress).toBe(1);
    expect(s.remainingMs).toBe(0);
    expect(s.position).toEqual(NYC);
  });

  it('[M0-04] is exactly halfway at the halfway point', () => {
    const s = flightStateAt(f, T0 + totalMs / 2);
    expect(s.phase).toBe('in_flight');
    expect(s.progress).toBeCloseTo(0.5, 6);
    expect(s.position.lat).toBeCloseTo(39.5103, 2);
    expect(s.remainingKm).toBeCloseTo(haversineKm(LAX, NYC) / 2, 0);
  });

  it('[M0-04] advances monotonically and never rewinds', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const s = flightStateAt(f, T0 + (totalMs * i) / 100);
      expect(s.progress).toBeGreaterThanOrEqual(prev);
      prev = s.progress;
    }
  });

  it('[M0-04] is a pure function of time — reopening the app never replays a journey', () => {
    // Closing the app for six hours and reopening must land the bird exactly
    // where wall-clock time says it is, with no animation from where it was.
    const t = T0 + totalMs * 0.4;
    expect(flightStateAt(f, t)).toEqual(flightStateAt(f, t));
    const sixHoursLater = flightStateAt(f, t + 6 * 3_600_000);
    expect(sixHoursLater.progress).toBeGreaterThan(flightStateAt(f, t).progress);
  });

  it('[M0-04] points the bird along the arc, not straight at the destination', () => {
    const early = flightStateAt(f, T0 + totalMs * 0.05);
    const late = flightStateAt(f, T0 + totalMs * 0.95);
    expect(early.headingDeg).not.toBeCloseTo(late.headingDeg, 1);
  });
});

describe('lostStateAt', () => {
  it('[M0-04] pins a lost bird where it fell, forever', () => {
    const s = lostStateAt(f, 0.42);
    expect(s.phase).toBe('lost');
    expect(s.progress).toBe(0.42);
    expect(s.remainingMs).toBe(0);
    expect(lostStateAt(f, 0.42)).toEqual(s);
  });
});

describe('formatEta', () => {
  it('[M0-04] matches the original copy for a multi-day flight', () => {
    expect(formatEta(93_600_000)).toBe('1d 2h away');
  });

  it('[M0-04] renders hours and minutes under a day', () => {
    expect(formatEta(24_000_000)).toBe('6h 40m away');
  });

  it('[M0-04] renders minutes under an hour', () => {
    expect(formatEta(1_080_000)).toBe('18m away');
  });

  it('[M0-04] says "arriving" in the final minute', () => {
    expect(formatEta(30_000)).toBe('arriving');
    expect(formatEta(0)).toBe('arriving');
  });

  it('[M0-04] drops a zero remainder rather than printing "1d 0h"', () => {
    expect(formatEta(86_400_000)).toBe('1d away');
    expect(formatEta(7_200_000)).toBe('2h away');
  });

  it('[M0-04] never shows a percentage or a speed', () => {
    for (const ms of [30_000, 1_080_000, 24_000_000, 93_600_000]) {
      expect(formatEta(ms)).not.toMatch(/%|mph|km\/h/);
    }
  });
});

describe('formatDistance', () => {
  it('[M0-04] renders miles with a thousands separator and no decimals', () => {
    expect(formatDistance(5433, 'imperial')).toBe('3,376 mi');
  });

  it('[M0-04] renders kilometres the same way', () => {
    expect(formatDistance(5433, 'metric')).toBe('5,433 km');
  });

  it('[M0-04] handles short distances without a separator', () => {
    expect(formatDistance(8, 'metric')).toBe('8 km');
  });
});
