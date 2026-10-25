import { createClockDeps } from './clock-deps';

const EPOCH_MS = 1_700_000_000_000;

describe('clock-deps', () => {
  const originalE2e = process.env.EXPO_PUBLIC_E2E;
  const originalScale = process.env.EXPO_PUBLIC_TIME_SCALE;

  afterEach(() => {
    if (originalE2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
    else process.env.EXPO_PUBLIC_E2E = originalE2e;
    if (originalScale === undefined) delete process.env.EXPO_PUBLIC_TIME_SCALE;
    else process.env.EXPO_PUBLIC_TIME_SCALE = originalScale;
  });

  it('[M1-09] the scale is ignored unless the E2E flag is set', () => {
    delete process.env.EXPO_PUBLIC_E2E;
    process.env.EXPO_PUBLIC_TIME_SCALE = '1440';
    let realMs = EPOCH_MS;
    const clock = createClockDeps(EPOCH_MS, { realNow: () => realMs });

    realMs = EPOCH_MS + 1_000;
    expect(clock.now()).toBe(EPOCH_MS + 1_000);
  });

  it('[M1-09] EXPO_PUBLIC_E2E="true" activates EXPO_PUBLIC_TIME_SCALE', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    process.env.EXPO_PUBLIC_TIME_SCALE = '1440';
    let realMs = EPOCH_MS;
    const clock = createClockDeps(EPOCH_MS, { realNow: () => realMs });

    realMs = EPOCH_MS + 1_000;
    expect(clock.now()).toBe(EPOCH_MS + 1_000 * 1440);
  });

  it('[M1-09] a missing or invalid TIME_SCALE under E2E falls back to a scale of 1', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    process.env.EXPO_PUBLIC_TIME_SCALE = 'not-a-number';
    let realMs = EPOCH_MS;
    const clock = createClockDeps(EPOCH_MS, { realNow: () => realMs });

    realMs = EPOCH_MS + 1_000;
    expect(clock.now()).toBe(EPOCH_MS + 1_000);
  });

  it('[M1-09] EXPO_PUBLIC_E2E set to anything other than "true" is treated as off', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    process.env.EXPO_PUBLIC_TIME_SCALE = '1440';
    let realMs = EPOCH_MS;
    const clock = createClockDeps(EPOCH_MS, { realNow: () => realMs });

    realMs = EPOCH_MS + 1_000;
    expect(clock.now()).toBe(EPOCH_MS + 1_000);
  });

  it('[M1-09] a fresh clock anchored at a later epoch does not inherit earlier elapsed time', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    process.env.EXPO_PUBLIC_TIME_SCALE = '1440';
    // Simulates a screen mounted long after app boot: a clock created *now*
    // must anchor to *now*, not to some earlier instant, or the scaled
    // elapsed time since that earlier instant would already have run out
    // the flight before this screen ever rendered a frame.
    const laterEpochMs = EPOCH_MS + 60 * 60 * 1000;
    let realMs = laterEpochMs;
    const clock = createClockDeps(laterEpochMs, { realNow: () => realMs });

    expect(clock.now()).toBe(laterEpochMs);
    realMs = laterEpochMs + 1_000;
    expect(clock.now()).toBe(laterEpochMs + 1_000 * 1440);
  });
});
