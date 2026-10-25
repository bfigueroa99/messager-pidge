import { StyleSheet } from 'react-native';

import { COLORS, SPACING } from './tokens';
import { FONT_FAMILIES, FONT_SIZES } from './typography';

/**
 * Style objects shared by more than one screen. `screen` and `error` were
 * independently, byte-identically defined in both `LoftPicker.tsx` (`M1-03`)
 * and `ComposeScreen.tsx` (`M1-07`) — pulled out here once a second copy made
 * it a real duplication rather than a coincidence, per `docs/LOOP.md` §6.
 */
export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
    padding: SPACING.md,
  },
  error: {
    color: COLORS.alarm,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.sm,
  },
});
