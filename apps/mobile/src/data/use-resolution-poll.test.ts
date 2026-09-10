import { act, renderHook, waitFor } from '@testing-library/react';

import { createFakeResolutionDeps, type ResolutionResult } from './resolution-deps';
import { useResolutionPoll } from './use-resolution-poll';

const T0 = 1_700_000_000_000;

const DELIVERED_RESULT: ResolutionResult = {
  outcome: 'delivered',
  body: 'See you soon.',
  place: null,
  time: null,
};

const DIED_RESULT: ResolutionResult = {
  outcome: 'died',
  body: null,
  place: 'Altoona, Pennsylvania',
  time: '11:41 PM',
};

const extractDelivered = (result: ResolutionResult) => (result.outcome === 'delivered' ? result.body : null);

describe('useResolutionPoll', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[M1-20] returns null for ten consecutive polls before resolution', async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    const deps = {
      poll: async (flightId: string) => {
        pollCount += 1;
        return createFakeResolutionDeps({ resolveAtMs: T0 + 1_000_000, result: DELIVERED_RESULT, now: () => T0 }).poll(flightId);
      },
    };
    const { result } = renderHook(() => useResolutionPoll(deps, 'flight-1', extractDelivered));

    for (let i = 0; i < 9; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }

    expect(pollCount).toBeGreaterThanOrEqual(10);
    expect(result.current).toBeNull();
  });

  it('[M1-21] reveals the extracted value once the predicate matches a resolved result', async () => {
    jest.useFakeTimers();
    let nowMs = T0 - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: T0, result: DELIVERED_RESULT, now: () => nowMs });
    const { result } = renderHook(() => useResolutionPoll(deps, 'flight-1', extractDelivered));

    expect(result.current).toBeNull();

    nowMs = T0 + 10;
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe('See you soon.');
  });

  it('[M1-21] never resolves when the predicate never matches (e.g. a died result reaching an arrival watcher)', async () => {
    jest.useFakeTimers();
    let nowMs = T0 - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: T0, result: DIED_RESULT, now: () => nowMs });
    const { result } = renderHook(() => useResolutionPoll(deps, 'flight-1', extractDelivered));

    nowMs = T0 + 10;
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
  });

  it('[M1-22] stops polling once a value is revealed', async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    const nowMs = T0;
    const deps = {
      poll: (flightId: string) => {
        pollCount += 1;
        return createFakeResolutionDeps({ resolveAtMs: T0, result: DIED_RESULT, now: () => nowMs }).poll(flightId);
      },
    };
    const extractDied = (result: ResolutionResult) => (result.outcome === 'died' ? result.place : null);
    const { result } = renderHook(() => useResolutionPoll(deps, 'flight-1', extractDied));

    await waitFor(() => expect(result.current).toBe('Altoona, Pennsylvania'));
    const countAtReveal = pollCount;

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(pollCount).toBe(countAtReveal);
  });

  it('[M1-22] resets to null when reused for a different flightId', async () => {
    const resolvedIds = new Set(['flight-A']);
    const deps = {
      poll: async (flightId: string) => (resolvedIds.has(flightId) ? DELIVERED_RESULT : null),
    };
    const { result, rerender } = renderHook(
      ({ flightId }: { flightId: string }) => useResolutionPoll(deps, flightId, extractDelivered),
      { initialProps: { flightId: 'flight-A' } },
    );
    await waitFor(() => expect(result.current).toBe('See you soon.'));

    rerender({ flightId: 'flight-B' });
    expect(result.current).toBeNull();
  });
});
