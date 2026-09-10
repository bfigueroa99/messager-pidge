import { act, render, screen } from '@testing-library/react';
import type { PublicFlight } from '@pidge/flight-sim';

import { FlightCard } from './FlightCard';

const T0 = 1_700_000_000_000;

/**
 * A fixture flight, not a real `planFlight()` output — the card only ever
 * consumes a `PublicFlight`, so this pins the numbers the acceptance
 * criteria ask for directly: a 22h3m flight (LA-NYC-ish) whose distance
 * formats to "2,446 mi" and whose 40%-elapsed remainder formats to
 * "13h 13m away".
 */
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

describe('FlightCard', () => {
  it('[M1-04] renders "13h 13m away" and "2,446 mi" at 40% of a LA to NYC flight', () => {
    const now = T0 + (FLIGHT.arrivesAtMs - FLIGHT.departsAtMs) * 0.4;
    render(
      <FlightCard flight={FLIGHT} originName="Los Angeles" destinationName="New York" now={() => now} />,
    );

    expect(screen.getByText('🕊 13h 13m away')).toBeTruthy();
    expect(screen.getByText('2,446 mi')).toBeTruthy();
  });

  it('[M1-04] renders "arriving" in the final minute', () => {
    render(
      <FlightCard
        flight={FLIGHT}
        originName="Los Angeles"
        destinationName="New York"
        now={() => FLIGHT.arrivesAtMs - 30_000}
      />,
    );

    expect(screen.getByText('🕊 arriving')).toBeTruthy();
  });

  it('[M1-04] contains no speed value anywhere in its output', () => {
    render(
      <FlightCard
        flight={FLIGHT}
        originName="Los Angeles"
        destinationName="New York"
        now={() => T0 + 1000}
      />,
    );

    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toMatch(/mph|km\/h/i);
    expect(rendered).not.toContain(String(FLIGHT.effectiveSpeedKmh));
    expect(rendered).not.toMatch(/%/);
  });

  it('[M1-04] updates once per second, not once per frame', () => {
    jest.useFakeTimers();
    try {
      // Chosen to cross the "1m away" -> "arriving" boundary exactly at the
      // 1-second mark, so a per-frame updater and a per-second one would be
      // visibly distinguishable at the 500ms checkpoint.
      let currentMs = FLIGHT.arrivesAtMs - 60_500;
      const now = () => currentMs;
      render(<FlightCard flight={FLIGHT} originName="Los Angeles" destinationName="New York" now={now} />);

      expect(screen.getByText('🕊 1m away')).toBeTruthy();

      // Advance the underlying clock but fire the timer for only half a
      // second — a per-frame updater would already show "arriving" here.
      currentMs += 500;
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.getByText('🕊 1m away')).toBeTruthy();

      // Cross the 1-second boundary the interval actually ticks on.
      currentMs += 500;
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.getByText('🕊 arriving')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('[M1-04] a new `now` function identity on every parent re-render does not stall the tick', () => {
    jest.useFakeTimers();
    try {
      let currentMs = FLIGHT.arrivesAtMs - 60_500;
      const renderCard = () => (
        <FlightCard flight={FLIGHT} originName="Los Angeles" destinationName="New York" now={() => currentMs} />
      );
      const { rerender } = render(renderCard());
      expect(screen.getByText('🕊 1m away')).toBeTruthy();

      // A parent re-rendering far more often than the tick — e.g. M1-06's
      // marker frame loop on the same screen — with a brand-new `now`
      // closure every time. The interval must still fire on its own
      // 1000ms schedule rather than being torn down and restarted before
      // it ever elapses.
      for (let i = 0; i < 12; i++) {
        currentMs += 100;
        act(() => {
          jest.advanceTimersByTime(100);
        });
        rerender(renderCard());
      }

      expect(screen.getByText('🕊 arriving')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
