/**
 * Design tokens. Dark-first: these are the values the app actually ships
 * with, not a "dark variant" of some light default — see CLAUDE.md and
 * `docs/PRODUCT.md` §5 (deadpan naturalist, no chrome that winks).
 *
 * This module holds values only. Nothing here renders anything — that is
 * `M1-04` onward's job, once there is a screen to hand these to.
 */

export const COLORS = {
  /** The screen behind everything. */
  paper: '#0b0d0e',
  /** Primary text and iconography over `paper`. */
  ink: '#e8e4da',
  /** The chart's ocean fill. */
  chartWater: '#111823',
  /** The chart's landmass fill. */
  chartLand: '#1c2118',
  /** The hairline separating land from water. */
  chartCoastline: '#3a4a44',
  /** The dashed portion of a route still to be flown. */
  routeDash: '#8a7b5c',
  /** The bird marker and its flown (solid) route segment. */
  bird: '#e8c468',
  /** Loss and irreversible-action copy. Muted, never a garish red — the app
   * never winks, even when a bird dies. */
  alarm: '#8a5a4a',
} as const;

export type ColorToken = keyof typeof COLORS;

/** A 4px baseline grid. */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingToken = keyof typeof SPACING;

export const RADII = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof RADII;

/**
 * Milliseconds for UI transitions — not to be confused with the `*Ms`/`*At`
 * flight-time fields in `@pidge/flight-sim`, which are wall-clock and never
 * a design choice.
 */
export const DURATIONS_MS = {
  instant: 0,
  fast: 150,
  base: 300,
  slow: 600,
  /** `M1-07`'s release ceremony: "a decision, not a reflex." */
  release: 1200,
} as const;

export type DurationToken = keyof typeof DURATIONS_MS;
