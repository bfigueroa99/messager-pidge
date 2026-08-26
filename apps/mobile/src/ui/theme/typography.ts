/**
 * Two families, no more: a humanist serif for dispatch text — the app's
 * voice, per `docs/PRODUCT.md` §5 — and a mono for anything that counts:
 * times, distances, countdowns. Digits in a mono face don't jitter in width
 * as they change, which matters for a card that ticks once a second
 * (`M1-04`).
 */
export const FONT_FAMILIES = {
  dispatch: 'Georgia, ui-serif, serif',
  numeric: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export type FontFamilyToken = keyof typeof FONT_FAMILIES;

/** iOS Dynamic Type's "body" size at the default ("Large") content size
 * category — named here only so `FONT_SIZES.body` reads as what it is,
 * not as a base the rest of the scale is computed from. Every other size
 * below is Apple's own fixed point value for that scale step, not a ratio
 * against this one; scaling the whole hierarchy together would mean
 * swapping this literal table for Dynamic Type's live multipliers, not
 * multiplying by a locally-chosen ratio. */
const BASE_FONT_SIZE = 17;

/**
 * Apple's Dynamic Type scale at the default content size category (Human
 * Interface Guidelines, Typography), point sizes taken directly.
 */
export const FONT_SIZES = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: BASE_FONT_SIZE,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
} as const;

export type TypeScaleToken = keyof typeof FONT_SIZES;

/** A readable line height for body-length dispatch text. */
export const LINE_HEIGHT_RATIO = 1.3;
