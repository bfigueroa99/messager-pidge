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
 * category. Every other size below is a ratio against this one, so the
 * whole scale moves together the way Dynamic Type expects rather than by
 * independent pixel choices per screen. */
const BASE_FONT_SIZE = 17;

/**
 * Ratios against `BASE_FONT_SIZE`, taken from Apple's Dynamic Type scale at
 * the default content size category (Human Interface Guidelines,
 * Typography). `FONT_SIZES` below is these ratios multiplied out — change a
 * ratio here, not a font size there.
 */
const DYNAMIC_TYPE_RATIOS = {
  largeTitle: 34 / BASE_FONT_SIZE,
  title1: 28 / BASE_FONT_SIZE,
  title2: 22 / BASE_FONT_SIZE,
  title3: 20 / BASE_FONT_SIZE,
  headline: 17 / BASE_FONT_SIZE,
  body: 17 / BASE_FONT_SIZE,
  callout: 16 / BASE_FONT_SIZE,
  subhead: 15 / BASE_FONT_SIZE,
  footnote: 13 / BASE_FONT_SIZE,
  caption1: 12 / BASE_FONT_SIZE,
  caption2: 11 / BASE_FONT_SIZE,
} as const;

export type TypeScaleToken = keyof typeof DYNAMIC_TYPE_RATIOS;

export const FONT_SIZES: Record<TypeScaleToken, number> = {
  largeTitle: Math.round(DYNAMIC_TYPE_RATIOS.largeTitle * BASE_FONT_SIZE),
  title1: Math.round(DYNAMIC_TYPE_RATIOS.title1 * BASE_FONT_SIZE),
  title2: Math.round(DYNAMIC_TYPE_RATIOS.title2 * BASE_FONT_SIZE),
  title3: Math.round(DYNAMIC_TYPE_RATIOS.title3 * BASE_FONT_SIZE),
  headline: Math.round(DYNAMIC_TYPE_RATIOS.headline * BASE_FONT_SIZE),
  body: Math.round(DYNAMIC_TYPE_RATIOS.body * BASE_FONT_SIZE),
  callout: Math.round(DYNAMIC_TYPE_RATIOS.callout * BASE_FONT_SIZE),
  subhead: Math.round(DYNAMIC_TYPE_RATIOS.subhead * BASE_FONT_SIZE),
  footnote: Math.round(DYNAMIC_TYPE_RATIOS.footnote * BASE_FONT_SIZE),
  caption1: Math.round(DYNAMIC_TYPE_RATIOS.caption1 * BASE_FONT_SIZE),
  caption2: Math.round(DYNAMIC_TYPE_RATIOS.caption2 * BASE_FONT_SIZE),
};

/** A readable line height for body-length dispatch text. */
export const LINE_HEIGHT_RATIO = 1.3;
