import { useRouter } from 'expo-router';

import { realComposeDeps } from '../src/data/compose-deps';
import { ComposeScreen } from '../src/ui/screens/ComposeScreen';

// Placeholder recipient/distance, named honestly as a placeholder — there is
// no conversation list or contacts screen anywhere in the app yet to have
// navigated here from, so there is no real recipient to resolve (matching
// the precedent `app/flight-demo.tsx` already set for a screen with no real
// data source to wire to yet). 3936 km is the same LA-NYC distance that
// route's own fixture uses.
const PLACEHOLDER_RECIPIENT_NAME = 'Ana';
const PLACEHOLDER_DISTANCE_KM = 3936;

export default function ComposeRoute() {
  const router = useRouter();

  return (
    <ComposeScreen
      deps={realComposeDeps}
      recipientName={PLACEHOLDER_RECIPIENT_NAME}
      distanceKm={PLACEHOLDER_DISTANCE_KM}
      onReleased={() => router.replace('/flight-demo')}
    />
  );
}
