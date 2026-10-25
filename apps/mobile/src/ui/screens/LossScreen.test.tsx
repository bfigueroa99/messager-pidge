import { act, render, screen, waitFor } from '@testing-library/react';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import { createFakeResolutionDeps, type ResolutionResult } from '../../data/resolution-deps';
import { LossScreen } from './LossScreen';

const T0 = 1_700_000_000_000;

const FLIGHT: PublicFlight = {
  origin: { lat: 34.0522, lon: -118.2437 },
  destination: { lat: 40.7128, lon: -74.006 },
  departsAtMs: T0,
  arrivesAtMs: T0 + 79_380_000,
  distanceKm: 3936,
  initialBearingDeg: 66,
  effectiveSpeedKmh: 178.3,
  simVersion: 1,
};

const VIEWPORT: Viewport = { width: 393, height: 400 };

const DIED_RESULT: ResolutionResult = {
  outcome: 'died',
  body: null,
  place: 'Altoona, Pennsylvania',
  time: '11:41 PM',
};

const DELIVERED_RESULT: ResolutionResult = {
  outcome: 'delivered',
  body: 'See you soon.',
  place: null,
  time: null,
};

function renderLossScreen(props: Partial<Parameters<typeof LossScreen>[0]> = {}) {
  const deps = props.deps ?? createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DIED_RESULT, now: () => T0 });
  return render(
    <LossScreen
      deps={deps}
      flightId="flight-1"
      flight={FLIGHT}
      originName="Los Angeles"
      destinationName="New York"
      birdName="Wren"
      viewport={VIEWPORT}
      now={() => T0}
      {...props}
    />,
  );
}

describe('LossScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[M1-22] renders the flight screen, unresolved, before resolution', () => {
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DIED_RESULT, now: () => T0 });
    renderLossScreen({ deps, now: () => T0 });

    expect(screen.getByTestId('flight-screen')).toBeTruthy();
    expect(screen.queryByTestId('loss-screen')).toBeNull();
  });

  it('[M1-22] the loss screen names the place and time within 2 seconds of the bird being lost', async () => {
    jest.useFakeTimers();
    let nowMs = FLIGHT.arrivesAtMs - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DIED_RESULT, now: () => nowMs });
    renderLossScreen({ deps, now: () => nowMs });

    expect(screen.queryByTestId('loss-screen')).toBeNull();

    nowMs = FLIGHT.arrivesAtMs + 10;
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('loss-screen')).toBeTruthy();
    expect(screen.getByText('Wren did not arrive. Taken near Altoona, Pennsylvania, at 11:41 PM. The note was not recovered.')).toBeTruthy();
  });

  it('[M1-22] a cold start after the bird is lost shows the memorial with no animation', async () => {
    const afterResolution = FLIGHT.arrivesAtMs + 60_000;
    const deps = createFakeResolutionDeps({
      resolveAtMs: FLIGHT.arrivesAtMs,
      result: DIED_RESULT,
      now: () => afterResolution,
    });
    renderLossScreen({ deps, now: () => afterResolution });

    await waitFor(() => expect(screen.getByTestId('loss-screen')).toBeTruthy());
    expect(screen.queryByTestId('flight-screen')).toBeNull();
  });

  it('[M1-22] never shows the memorial for a flight that was delivered', async () => {
    jest.useFakeTimers();
    let nowMs = FLIGHT.arrivesAtMs - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DELIVERED_RESULT, now: () => nowMs });
    renderLossScreen({ deps, now: () => nowMs });

    nowMs = FLIGHT.arrivesAtMs + 10;
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTestId('loss-screen')).toBeNull();
    expect(screen.getByTestId('flight-screen')).toBeTruthy();
  });

  it('[M1-22] the loss screen never shows the note text, even if a result carried one', async () => {
    jest.useFakeTimers();
    let nowMs = FLIGHT.arrivesAtMs - 500;
    const leakedResult: ResolutionResult = { ...DIED_RESULT, body: 'the note itself' };
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: leakedResult, now: () => nowMs });
    renderLossScreen({ deps, now: () => nowMs });

    nowMs = FLIGHT.arrivesAtMs + 10;
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('loss-screen')).toBeTruthy();
    expect(screen.queryByText('the note itself')).toBeNull();
  });

  it('[M1-22] stops polling once the memorial is shown', async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    const nowMs = FLIGHT.arrivesAtMs;
    const deps = {
      poll: (flightId: string) => {
        pollCount += 1;
        return createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DIED_RESULT, now: () => nowMs }).poll(flightId);
      },
    };
    renderLossScreen({ deps, now: () => nowMs });

    await waitFor(() => expect(screen.getByTestId('loss-screen')).toBeTruthy());
    const countAtReveal = pollCount;

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(pollCount).toBe(countAtReveal);
  });

  it('[M1-22] resets the memorial when reused for a different, unresolved flight', async () => {
    const flightA = FLIGHT;
    const depsA = createFakeResolutionDeps({
      resolveAtMs: flightA.arrivesAtMs,
      result: DIED_RESULT,
      now: () => flightA.arrivesAtMs,
    });
    const { rerender } = render(
      <LossScreen
        deps={depsA}
        flightId="flight-A"
        flight={flightA}
        originName="Los Angeles"
        destinationName="New York"
        birdName="Wren"
        viewport={VIEWPORT}
        now={() => flightA.arrivesAtMs}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('loss-screen')).toBeTruthy());

    const flightB: PublicFlight = {
      ...flightA,
      departsAtMs: flightA.arrivesAtMs,
      arrivesAtMs: flightA.arrivesAtMs + 79_380_000,
    };
    const depsB = createFakeResolutionDeps({
      resolveAtMs: flightB.arrivesAtMs,
      result: DIED_RESULT,
      now: () => flightB.departsAtMs,
    });
    rerender(
      <LossScreen
        deps={depsB}
        flightId="flight-B"
        flight={flightB}
        originName="New York"
        destinationName="Los Angeles"
        birdName="Sparrow"
        viewport={VIEWPORT}
        now={() => flightB.departsAtMs}
      />,
    );

    expect(screen.getByTestId('flight-screen')).toBeTruthy();
    expect(screen.queryByTestId('loss-screen')).toBeNull();
  });
});
