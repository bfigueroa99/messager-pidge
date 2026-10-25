import { act, render, screen } from '@testing-library/react';
import { arcSegments, flightStateAt, projectPoint, type PublicFlight, type Viewport } from '@pidge/flight-sim';

import { FlightScreen, PADDING_RATIO } from './FlightScreen';

const T0 = 1_700_000_000_000;

// Same fixture shape as FlightCard.test.tsx's own FLIGHT constant — a
// PublicFlight, not a real planFlight() output, since this screen only ever
// consumes the public half.
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

function expectedMarker(nowMs: number) {
  const state = flightStateAt(FLIGHT, nowMs);
  return projectPoint(state.position, arcSegments(FLIGHT.origin, FLIGHT.destination), VIEWPORT, PADDING_RATIO);
}

function markerCircle() {
  const circle = document.querySelector('circle');
  expect(circle).toBeTruthy();
  return circle!;
}

describe('FlightScreen', () => {
  it('[M1-16] renders the map, the title and the flight card together', () => {
    render(
      <FlightScreen
        flight={FLIGHT}
        originName="Los Angeles"
        destinationName="New York"
        viewport={VIEWPORT}
        now={() => T0 + 1000}
      />,
    );

    expect(screen.getByTestId('flight-map')).toBeTruthy();
    expect(screen.getByTestId('bird-marker')).toBeTruthy();
    // FlightCard's own route line, proving it was actually assembled in,
    // not reimplemented here.
    expect(screen.getByText('Los Angeles → New York')).toBeTruthy();
  });

  it('[M1-16] positions the marker from flightStateAt\'s real position, projected through the same fit as the route', () => {
    const nowMs = T0 + (FLIGHT.arrivesAtMs - FLIGHT.departsAtMs) * 0.4;
    render(
      <FlightScreen
        flight={FLIGHT}
        originName="Los Angeles"
        destinationName="New York"
        viewport={VIEWPORT}
        now={() => nowMs}
      />,
    );

    const expected = expectedMarker(nowMs);
    const circle = markerCircle();
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(expected.x, 5);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(expected.y, 5);
  });

  it('[M1-16] a flight whose arrival has passed renders as arrived with no replay', () => {
    const afterArrival = FLIGHT.arrivesAtMs + 60_000;
    render(
      <FlightScreen
        flight={FLIGHT}
        originName="Los Angeles"
        destinationName="New York"
        viewport={VIEWPORT}
        now={() => afterArrival}
      />,
    );

    // The very first render already reflects the arrived state — nothing
    // animates in from the origin, because the initial `nowMs` (lazily
    // computed from `now()` at mount) is already past `arrivesAtMs`.
    const expected = expectedMarker(afterArrival);
    const circle = markerCircle();
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(expected.x, 5);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(expected.y, 5);

    const destinationPoint = projectPoint(
      FLIGHT.destination,
      arcSegments(FLIGHT.origin, FLIGHT.destination),
      VIEWPORT,
      PADDING_RATIO,
    );
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(destinationPoint.x, 5);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(destinationPoint.y, 5);
  });

  it('[M1-16] with reduced motion on, the bird still updates at 1 Hz', () => {
    jest.useFakeTimers();
    try {
      let currentMs = T0 + 1000;
      const now = () => currentMs;
      render(
        <FlightScreen
          flight={FLIGHT}
          originName="Los Angeles"
          destinationName="New York"
          viewport={VIEWPORT}
          now={now}
          reducedMotion
        />,
      );

      const initial = markerCircle().getAttribute('cx');

      // Advance the underlying clock but fire timers for only half a
      // second — a per-frame updater would already have moved; a 1 Hz
      // throttle must not have ticked yet.
      currentMs += 30_000_000;
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(markerCircle().getAttribute('cx')).toBe(initial);

      // Cross the 1-second boundary the throttle actually ticks on.
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const expected = expectedMarker(currentMs);
      const circle = markerCircle();
      expect(Number(circle.getAttribute('cx'))).toBeCloseTo(expected.x, 5);
      expect(Number(circle.getAttribute('cy'))).toBeCloseTo(expected.y, 5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('[M1-16] stops rescheduling ticks once the flight has arrived, so a landed bird never keeps polling forever', () => {
    jest.useFakeTimers();
    try {
      let currentMs = FLIGHT.arrivesAtMs - 500;
      const now = () => currentMs;
      render(
        <FlightScreen
          flight={FLIGHT}
          originName="Los Angeles"
          destinationName="New York"
          viewport={VIEWPORT}
          now={now}
          reducedMotion
        />,
      );

      // Two intervals are live at this point: this screen's own marker tick,
      // and FlightCard's independent 1 Hz tick (`M1-04`, unaffected by this
      // item — its own text keeps ticking even once "arriving" never
      // changes again).
      const timersBeforeArrival = jest.getTimerCount();
      expect(timersBeforeArrival).toBe(2);

      currentMs = FLIGHT.arrivesAtMs + 10;
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // The one tick that just fired saw `now() >= arrivesAtMs` and cleared
      // its own interval, leaving only FlightCard's own untouched — nothing
      // left scheduled to keep polling a bird that can never move again.
      expect(jest.getTimerCount()).toBe(timersBeforeArrival - 1);
    } finally {
      jest.useRealTimers();
    }
  });
});
