import { useLocalSearchParams } from 'expo-router';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arcSegments, projectSegments, type Viewport } from '@pidge/flight-sim';

import { APP_NAME } from '../../src/config/app-name';
import { FlightMap } from '../../src/ui/screens/FlightMap';

/**
 * Renders one component in isolation with fixed props, for `scripts/shot.mjs`
 * (M0-08) to screenshot headlessly. This directory is NOT excluded from
 * `expo export -p web` on its own — confirmed directly, an unmodified export
 * produced `dist/_dev/[story].html` despite there being no
 * `generateStaticParams` here. `apps/mobile/scripts/export-web.mjs` keeps it
 * out of the production bundle instead, by physically moving this directory
 * aside for the span of the export — see `tests/web-export.test.ts`'s
 * `[M0-08]` coverage of that.
 */

type StoryProps = {
  /** The frozen instant from the `?t=` query param, or null if omitted. */
  frozenAtMs: number | null;
};

function IndexStory() {
  return (
    <View style={styles.screen} testID="ready">
      <Text style={styles.title}>{APP_NAME}</Text>
    </View>
  );
}

// Same real-world coordinates as `packages/flight-sim/src/__fixtures__/cities.ts` —
// duplicated rather than imported, since that fixtures module is test-only
// and not part of `@pidge/flight-sim`'s public package surface. Tokyo-LA
// specifically because it crosses the antimeridian (M0-12), so this story
// screenshots the seam `M1-13`'s acceptance criteria are about, not just an
// unremarkable straight route.
const TOKYO = { lat: 35.6762, lon: 139.6503 };
const LAX = { lat: 34.0522, lon: -118.2437 };
const FLIGHT_MAP_VIEWPORT: Viewport = { width: 393, height: 400 };

function FlightMapStory() {
  const segments = projectSegments(arcSegments(TOKYO, LAX), FLIGHT_MAP_VIEWPORT, 0.1);
  return (
    <View style={styles.screen} testID="ready">
      <FlightMap segments={segments} viewport={FLIGHT_MAP_VIEWPORT} />
    </View>
  );
}

const STORIES: Record<string, ComponentType<StoryProps>> = {
  index: IndexStory,
  'flight-map': FlightMapStory,
};

export default function Story() {
  const { story, t } = useLocalSearchParams<{ story: string; t?: string }>();
  const Component = STORIES[story];

  if (!Component) {
    // Deliberately not `testID="ready"` — scripts/shot.mjs races this against
    // the ready marker so a typo'd story name fails fast and loudly instead
    // of silently "succeeding" with a screenshot of this placeholder.
    return (
      <View style={styles.screen} testID="story-not-found">
        <Text style={styles.title}>Unknown story: {story}</Text>
      </View>
    );
  }

  const frozenAtMs = t === undefined ? null : Number(t);
  return <Component frozenAtMs={frozenAtMs} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0d0e',
  },
  title: {
    color: '#e8e4da',
    fontSize: 28,
    letterSpacing: 2,
  },
});
