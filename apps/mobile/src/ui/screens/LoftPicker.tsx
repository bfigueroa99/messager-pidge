import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CITIES } from '../../data/cities';
import { searchCities } from '../../data/city-search';
import type { City } from '../../data/cities';
import { t } from '../copy/strings';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';

/**
 * Persists the chosen city. The real implementation writes
 * `profiles.home_lat`/`home_lon` via a live Supabase client, which does not
 * exist in the mobile app yet (Q-002 in `docs/QUESTIONS.md`; filed as
 * `M1-11`) — `app/loft-picker.tsx` wires a placeholder that always fails
 * until then. This screen only depends on the contract, not the
 * implementation, so it is fully testable without either.
 */
export interface LoftPickerDeps {
  saveLoft(city: City): Promise<void>;
}

export interface LoftPickerProps {
  deps: LoftPickerDeps;
  /** Defaults to the real bundled dataset; overridable for tests. */
  cities?: readonly City[];
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving'; cityId: string } | { kind: 'saved'; cityId: string } | { kind: 'error' };

/**
 * `[M1-03]` A searchable, offline city picker that writes the selection to
 * `profiles.home_lat`/`home_lon` (via `deps.saveLoft`). Per `docs/PRODUCT.md`
 * §5's consent-boundary exception, every string on this screen comes from
 * `strings.ts`'s plain-English `loftPicker*` variants, not the app's usual
 * in-fiction voice.
 */
export function LoftPicker({ deps, cities = CITIES }: LoftPickerProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  // The id of the most recently tapped city. Two saves can settle out of
  // order (a slow first tap resolving after a fast second one) — this lets
  // each save's callback check it is still the latest before touching
  // `status`, so a stale resolution can never overwrite a newer selection.
  const latestSelectionId = useRef<string | null>(null);

  const results = useMemo(() => searchCities(cities, query), [cities, query]);

  const handleSelect = (city: City): void => {
    latestSelectionId.current = city.id;
    setStatus({ kind: 'saving', cityId: city.id });
    deps
      .saveLoft(city)
      .then(() => {
        if (latestSelectionId.current === city.id) setStatus({ kind: 'saved', cityId: city.id });
      })
      .catch(() => {
        if (latestSelectionId.current === city.id) setStatus({ kind: 'error' });
      });
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t({ key: 'loftPickerTitle' })}</Text>
      <Text style={styles.privacyNote}>{t({ key: 'loftPickerPrivacyNote' })}</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={t({ key: 'loftPickerSearchLabel' })}
        accessibilityLabel={t({ key: 'loftPickerSearchLabel' })}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {status.kind === 'error' ? <Text style={styles.error}>{t({ key: 'offline' })}</Text> : null}
      {query.trim().length > 0 && results.length === 0 ? (
        <Text style={styles.noResults}>{t({ key: 'loftPickerNoResults' })}</Text>
      ) : null}
      <ScrollView>
        {results.map((city) => {
          const label = city.admin1 !== null ? `${city.name}, ${city.admin1}` : `${city.name}, ${city.countryCode}`;
          const isSelected = status.kind !== 'idle' && status.kind !== 'error' && status.cityId === city.id;
          return (
            <Pressable key={city.id} onPress={() => handleSelect(city)} style={styles.row}>
              <Text style={styles.rowText}>
                {label}
                {isSelected && status.kind === 'saved' ? ' ✓' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
    padding: SPACING.md,
  },
  title: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.title2,
    marginBottom: SPACING.xs,
  },
  privacyNote: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.md,
  },
  input: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
    borderColor: COLORS.chartCoastline,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  error: {
    color: COLORS.alarm,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.sm,
  },
  noResults: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.sm,
  },
  row: {
    paddingVertical: SPACING.sm,
  },
  rowText: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
  },
});
