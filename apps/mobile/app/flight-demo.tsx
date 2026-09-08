import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import type { PublicFlight } from '@pidge/flight-sim';

import { FlightScreen } from '../src/ui/screens/FlightScreen';

// Placeholder demo data, named honestly as a demo — there is no real
// send/receive flow yet (M1-07 composes and releases a bird, M1-08 reveals
// its arrival, both still `todo`) and no server-time-sync mechanism either,
// so this route cannot yet be handed a real flight id or a real
// server-corrected clock. `Date.now()` here is this route's own concrete
// choice as the caller, not a violation of `FlightScreen`'s own "never call
// Date.now() internally" rule — the same honest-placeholder precedent
// `loft-picker.tsx`'s `realLoftPickerDeps` already set for a screen with no
// real backend to wire to yet.
const DURATION_MS = 79_380_000; // LA-NYC, matching FlightCard's own fixture

function makeDemoFlight(): PublicFlight {
  // Anchored to the moment this route mounts, 40% through the flight, so
  // opening it always shows a bird mid-journey rather than one that arrived
  // however long ago the container happened to boot.
  const departsAtMs = Date.now() - Math.round(DURATION_MS * 0.4);
  return {
    origin: { lat: 34.0522, lon: -118.2437 },
    destination: { lat: 40.7128, lon: -74.006 },
    departsAtMs,
    arrivesAtMs: departsAtMs + DURATION_MS,
    distanceKm: 3936,
    initialBearingDeg: 66,
    effectiveSpeedKmh: 178.3,
    simVersion: 1,
  };
}

export default function FlightDemoRoute() {
  const { width, height } = useWindowDimensions();
  const flight = useMemo(makeDemoFlight, []);

  return (
    <FlightScreen
      flight={flight}
      originName="Los Angeles"
      destinationName="New York"
      viewport={{ width, height }}
      now={() => Date.now()}
    />
  );
}
