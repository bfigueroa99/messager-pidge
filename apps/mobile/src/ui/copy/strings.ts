/**
 * The single catalogue of user-facing copy, per `docs/PRODUCT.md` §5. Every
 * row of the tone-of-voice table gets one variant here. Nothing under
 * `apps/mobile/src/ui/**` or `apps/mobile/app/**` may write a literal string
 * into a JSX text node directly — `eslint.config.mjs`'s voice guard enforces
 * that mechanically — so this file is the only place that copy can live, and
 * the only place it needs review against the tone-of-voice table.
 *
 * No runtime i18n dependency: `Copy` is a flat, exhaustive discriminated
 * union (one variant per tone-of-voice row) and `t()` is a plain function
 * over it. A call site names its variant by `key` and TypeScript then
 * requires exactly that variant's own fields — no cast needed in either
 * direction, and adding a row that `t()`'s `switch` does not handle is a
 * compile error, not a silent gap.
 */

export type Copy =
  /** Tone-of-voice table row: "Send confirmed". */
  | { key: 'sendConfirmed'; releasedAt: string; dueAt: string }
  /** Tone-of-voice table row: "In flight". */
  | { key: 'inFlight'; locationNote: string; weatherNote: string }
  /** Tone-of-voice table row: "Arrival". */
  | { key: 'arrival'; senderName: string }
  /** Tone-of-voice table row: "Death". The note itself is never named or
   * quoted — see INV-2 and `docs/PRODUCT.md` §5. */
  | { key: 'death'; birdName: string; place: string; time: string }
  /** Tone-of-voice table row: "Loft empty". */
  | { key: 'loftEmpty'; birdName: string; dueAt: string }
  /** Tone-of-voice table row: "Offline". */
  | { key: 'offline' }
  /** Loft picker screen (M1-03). Location is account/privacy-adjacent — the
   * consent-boundary exception in §5 applies, so this and the two variants
   * below are plain, literal English, not in-fiction copy. */
  | { key: 'loftPickerTitle' }
  | { key: 'loftPickerSearchLabel' }
  | { key: 'loftPickerNoResults' }
  | { key: 'loftPickerPrivacyNote' }
  /** Compose screen (M1-07). In-fiction, unlike the loft picker above — this
   * is the release itself, not an account/privacy boundary. */
  | { key: 'composeTitle'; recipientName: string }
  | { key: 'composeNotePlaceholder' }
  | { key: 'composeReleaseLabel' }
  | { key: 'composeKeepWritingLabel' }
  /** The pre-release confirmation: states the previewed due time and that
   * the bird cannot be called back. `dueIn` is `formatEta`'s own phrasing
   * (e.g. "22h away"), not a second, independently-worded duration format. */
  | { key: 'composeConfirm'; dueIn: string }
  /** Shown for the ~1.2s release ceremony (`DURATIONS_MS.release`). */
  | { key: 'composeReleasing' };

export function t(copy: Copy): string {
  switch (copy.key) {
    case 'sendConfirmed':
      return `Released ${copy.releasedAt}. Due ${copy.dueAt}.`;
    case 'inFlight':
      return `${copy.locationNote}. ${copy.weatherNote}.`;
    case 'arrival':
      return `A pigeon has arrived from ${copy.senderName}.`;
    case 'death':
      return `${copy.birdName} did not arrive. Taken near ${copy.place}, at ${copy.time}. The note was not recovered.`;
    case 'loftEmpty':
      return `The loft is empty. ${copy.birdName} is due home at ${copy.dueAt}.`;
    case 'offline':
      return 'The loft cannot be reached.';
    case 'loftPickerTitle':
      return 'Set your home location';
    case 'loftPickerSearchLabel':
      return 'Search for a city';
    case 'loftPickerNoResults':
      return 'No matching cities.';
    case 'loftPickerPrivacyNote':
      return 'Only the city you select is stored, never your exact location. You can set this to any city, not necessarily where you live.';
    case 'composeTitle':
      return `To ${copy.recipientName}`;
    case 'composeNotePlaceholder':
      return 'Write your note.';
    case 'composeReleaseLabel':
      return 'Release';
    case 'composeKeepWritingLabel':
      return 'Keep writing';
    case 'composeConfirm':
      return `${copy.dueIn}. This bird cannot be called back once released.`;
    case 'composeReleasing':
      return 'Releasing.';
  }
}
