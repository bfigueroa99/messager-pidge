import { createFakeResolutionDeps, realResolutionDeps, type ResolutionResult } from './resolution-deps';

const RESOLVE_AT_MS = 1_700_000_079_380;

const DELIVERED_RESULT: ResolutionResult = {
  outcome: 'delivered',
  body: 'See you soon.',
  place: null,
  time: null,
};

describe('resolution-deps', () => {
  it('[M1-20] ten consecutive polls before resolution all return a null body', async () => {
    let nowMs = RESOLVE_AT_MS - 10_000;
    const deps = createFakeResolutionDeps({
      resolveAtMs: RESOLVE_AT_MS,
      result: DELIVERED_RESULT,
      now: () => nowMs,
    });

    for (let i = 0; i < 10; i++) {
      const result = await deps.poll('flight-1');
      expect(result).toBeNull();
      nowMs += 500;
    }
    expect(nowMs).toBeLessThan(RESOLVE_AT_MS);
  });

  it('[M1-20] a poll at or after resolveAtMs returns the resolved result', async () => {
    let nowMs = RESOLVE_AT_MS - 1;
    const deps = createFakeResolutionDeps({
      resolveAtMs: RESOLVE_AT_MS,
      result: DELIVERED_RESULT,
      now: () => nowMs,
    });

    expect(await deps.poll('flight-1')).toBeNull();
    nowMs = RESOLVE_AT_MS;
    expect(await deps.poll('flight-1')).toEqual(DELIVERED_RESULT);
  });

  it('[M1-20] a died outcome carries place and time but never a body', async () => {
    const diedResult: ResolutionResult = {
      outcome: 'died',
      body: null,
      place: 'Altoona, Pennsylvania',
      time: '11:41 PM',
    };
    const deps = createFakeResolutionDeps({
      resolveAtMs: RESOLVE_AT_MS,
      result: diedResult,
      now: () => RESOLVE_AT_MS,
    });

    const result = await deps.poll('flight-1');
    expect(result?.body).toBeNull();
    expect(result?.place).toBe('Altoona, Pennsylvania');
  });

  it('[M1-20] the honest placeholder rejects rather than silently returning null forever', async () => {
    await expect(realResolutionDeps.poll('flight-1')).rejects.toThrow(
      'no Supabase client wired into the mobile app yet',
    );
  });
});
