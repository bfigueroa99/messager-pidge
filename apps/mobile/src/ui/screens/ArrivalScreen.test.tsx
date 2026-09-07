import { act, render, screen, waitFor } from '@testing-library/react';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import { createFakeResolutionDeps, type ResolutionResult } from '../../data/resolution-deps';
import { ArrivalScreen } from './ArrivalScreen';

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

function renderArrivalScreen(props: Partial<Parameters<typeof ArrivalScreen>[0]> = {}) {
  const deps = props.deps ?? createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DELIVERED_RESULT, now: () => T0 });
  return render(
    <ArrivalScreen
      deps={deps}
      flightId="flight-1"
      flight={FLIGHT}
      originName="Los Angeles"
      destinationName="New York"
      senderName="Ana"
      viewport={VIEWPORT}
      now={() => T0}
      {...props}
    />,
  );
}

describe('ArrivalScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[M1-21] renders the flight screen, unrevealed, before resolution', () => {
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DELIVERED_RESULT, now: () => T0 });
    renderArrivalScreen({ deps, now: () => T0 });

    expect(screen.getByTestId('flight-screen')).toBeTruthy();
    expect(screen.queryByTestId('arrival-screen')).toBeNull();
  });

  it('[M1-21] reveals the note within 2 seconds of resolution', async () => {
    jest.useFakeTimers();
    let nowMs = FLIGHT.arrivesAtMs - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DELIVERED_RESULT, now: () => nowMs });
    renderArrivalScreen({ deps, now: () => nowMs });

    expect(screen.queryByTestId('arrival-screen')).toBeNull();

    nowMs = FLIGHT.arrivesAtMs + 10;
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('arrival-screen')).toBeTruthy();
    expect(screen.getByText('A pigeon has arrived from Ana.')).toBeTruthy();
    expect(screen.getByText('See you soon.')).toBeTruthy();
  });

  it('[M1-21] a cold start after arrival shows the arrived state with no animation', async () => {
    const afterArrival = FLIGHT.arrivesAtMs + 60_000;
    const deps = createFakeResolutionDeps({
      resolveAtMs: FLIGHT.arrivesAtMs,
      result: DELIVERED_RESULT,
      now: () => afterArrival,
    });
    renderArrivalScreen({ deps, now: () => afterArrival });

    await waitFor(() => expect(screen.getByTestId('arrival-screen')).toBeTruthy());
    expect(screen.queryByTestId('flight-screen')).toBeNull();
    expect(screen.getByText('See you soon.')).toBeTruthy();
  });

  it('[M1-21] never reveals anything to the recipient for a flight that resolved as lost', async () => {
    jest.useFakeTimers();
    let nowMs = FLIGHT.arrivesAtMs - 500;
    const deps = createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DIED_RESULT, now: () => nowMs });
    renderArrivalScreen({ deps, now: () => nowMs });

    nowMs = FLIGHT.arrivesAtMs + 10;
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTestId('arrival-screen')).toBeNull();
    expect(screen.getByTestId('flight-screen')).toBeTruthy();
    expect(screen.queryByText('Altoona, Pennsylvania')).toBeNull();
  });

  it('[M1-21] stops polling once revealed', async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    const nowMs = FLIGHT.arrivesAtMs;
    const deps = {
      poll: (flightId: string) => {
        pollCount += 1;
        return createFakeResolutionDeps({ resolveAtMs: FLIGHT.arrivesAtMs, result: DELIVERED_RESULT, now: () => nowMs }).poll(
          flightId,
        );
      },
    };
    renderArrivalScreen({ deps, now: () => nowMs });

    await waitFor(() => expect(screen.getByTestId('arrival-screen')).toBeTruthy());
    const countAtReveal = pollCount;

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(pollCount).toBe(countAtReveal);
  });

  it('[M1-21] resets the reveal when reused for a different, unresolved flight', async () => {
    const flightA = FLIGHT;
    const depsA = createFakeResolutionDeps({
      resolveAtMs: flightA.arrivesAtMs,
      result: { outcome: 'delivered', body: 'Flight A note', place: null, time: null },
      now: () => flightA.arrivesAtMs,
    });
    const { rerender } = render(
      <ArrivalScreen
        deps={depsA}
        flightId="flight-A"
        flight={flightA}
        originName="Los Angeles"
        destinationName="New York"
        senderName="Ana"
        viewport={VIEWPORT}
        now={() => flightA.arrivesAtMs}
      />,
    );
    await waitFor(() => expect(screen.getByText('Flight A note')).toBeTruthy());

    const flightB: PublicFlight = {
      ...flightA,
      departsAtMs: flightA.arrivesAtMs,
      arrivesAtMs: flightA.arrivesAtMs + 79_380_000,
    };
    const depsB = createFakeResolutionDeps({
      resolveAtMs: flightB.arrivesAtMs,
      result: DELIVERED_RESULT,
      now: () => flightB.departsAtMs,
    });
    rerender(
      <ArrivalScreen
        deps={depsB}
        flightId="flight-B"
        flight={flightB}
        originName="New York"
        destinationName="Los Angeles"
        senderName="Ben"
        viewport={VIEWPORT}
        now={() => flightB.departsAtMs}
      />,
    );

    expect(screen.getByTestId('flight-screen')).toBeTruthy();
    expect(screen.queryByText('Flight A note')).toBeNull();
  });
});
